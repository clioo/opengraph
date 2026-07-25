import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import type { ApplyGraphOperationsParams, ActiveContext, BridgeHello, BridgeMessage, BridgeRequest, BridgeResponse, CompanionErrorCode, GraphSnapshot, LayoutGraphParams, RenderGraphPayload, UndoParams } from '../src/companion/protocol.js'
import { COMPANION_PROTOCOL_VERSION, MAX_MESSAGE_BYTES } from '../src/companion/protocol.js'

const REQUEST_TIMEOUT = 12_000

type PendingRequest = { resolve: (value: unknown) => void; reject: (reason: unknown) => void; timer: NodeJS.Timeout }

const error = (code: CompanionErrorCode, message: string, extra: Partial<BridgeResponse['error']> = {}) => Object.assign(new Error(message), { code, ...extra })
const json = (value: unknown) => Buffer.from(JSON.stringify(value))
const safeTokenEqual = (left: string, right: string) => {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export class LoopbackServer {
  private http?: HttpServer
  private sockets?: WebSocketServer
  private socket?: WebSocket
  private pending = new Map<string, PendingRequest>()
  private started?: Promise<void>
  private port?: number
  private readonly token = randomBytes(32).toString('base64url')
  private snapshot?: GraphSnapshot
  private activeContext?: ActiveContext
  private readonly distRoot: string

  constructor(distRoot = resolve(process.cwd(), 'dist')) { this.distRoot = resolve(distRoot) }

  get sessionUrl() { if (!this.port) throw new Error('Loopback server is not started'); return `http://127.0.0.1:${this.port}/#sessionToken=${encodeURIComponent(this.token)}` }
  get isConnected() { return this.socket?.readyState === WebSocket.OPEN }
  get currentRevision() { return this.snapshot?.revision ?? 0 }

  async start() {
    if (this.started) return this.started
    try {
      await fs.access(resolve(this.distRoot, 'index.html'))
    } catch {
      throw error('NOT_READY', 'OpenGraph is not built yet. Run npm run build from the project root, then try again.')
    }
    this.started = new Promise<void>((resolveStart, rejectStart) => {
      this.http = createServer((request, response) => { void this.handleHttp(request, response) })
      this.sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
      this.sockets.on('connection', (socket, request) => this.handleSocket(socket, request))
      this.http.on('upgrade', (request, socket, head) => {
        if (!this.validateRequest(request, true) || new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== '/__opengraph') { socket.destroy(); return }
        this.sockets!.handleUpgrade(request, socket, head, (webSocket) => this.sockets!.emit('connection', webSocket, request))
      })
      this.http.once('error', rejectStart)
      this.http.listen(0, '127.0.0.1', () => {
        this.port = (this.http!.address() as { port: number }).port
        this.http!.removeListener('error', rejectStart)
        resolveStart()
      })
    })
    await this.started
  }

  private expectedHost() { return `127.0.0.1:${this.port}` }
  private expectedOrigin() { return `http://127.0.0.1:${this.port}` }
  private validateRequest(request: IncomingMessage, checkOrigin = false) {
    if (!this.port || request.headers.host !== this.expectedHost()) return false
    return !checkOrigin || request.headers.origin === this.expectedOrigin()
  }

  private async handleHttp(request: IncomingMessage, response: ServerResponse) {
    if (!this.validateRequest(request) || !['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(!this.validateRequest(request) ? 403 : 405, { Allow: 'GET, HEAD' }); response.end(); return }
    const rawPath = (request.url ?? '/').split('?')[0]
    let pathname: string
    try { pathname = decodeURIComponent(rawPath) } catch { response.writeHead(400); response.end(); return }
    if (!pathname.startsWith('/')) { response.writeHead(400); response.end(); return }
    if (pathname.includes('\0')) { response.writeHead(400); response.end(); return }
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const filePathCandidate = resolve(this.distRoot, requested)
    const candidateRelative = relative(this.distRoot, filePathCandidate)
    if (candidateRelative === '..' || candidateRelative.startsWith(`..${sep}`) || candidateRelative.startsWith(sep)) { response.writeHead(403); response.end(); return }
    const isNavigation = pathname === '/' || pathname.endsWith('.html') || (!pathname.startsWith('/assets/') && !extname(pathname))
    let filePath: string
    try {
      const realRoot = await fs.realpath(this.distRoot)
      let realFile: string
      try {
        realFile = await fs.realpath(filePathCandidate)
      } catch (reason) {
        const code = (reason as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' || !isNavigation) { response.writeHead(code === 'ENOENT' ? 404 : 403); response.end(); return }
        realFile = await fs.realpath(resolve(this.distRoot, 'index.html'))
      }
      if (!realFile.startsWith(`${realRoot}${sep}`)) { response.writeHead(403); response.end(); return }
      filePath = realFile
    } catch { response.writeHead(404); response.end(); return }
    try {
      const data = await fs.readFile(filePath)
      const contentType = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' } as Record<string, string>)[extname(filePath)] ?? 'application/octet-stream'
      const headers: Record<string, string> = { 'Content-Type': contentType, 'Content-Length': String(data.byteLength), 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'self'; connect-src 'self' ws://127.0.0.1:${this.port}; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`, 'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable' }
      response.writeHead(200, headers)
      if (request.method !== 'HEAD') response.end(data); else response.end()
    } catch { response.writeHead(404); response.end() }
  }

  private handleSocket(socket: WebSocket, _request: IncomingMessage) {
    let authenticated = false
    const handshakeTimer = setTimeout(() => { if (!authenticated) socket.close(4001, 'Handshake required') }, 5_000)
    socket.on('message', (raw) => {
      const payload = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as Buffer)
      if (payload.byteLength > MAX_MESSAGE_BYTES) { socket.close(1009, 'Message too large'); return }
      let message: BridgeMessage
      try { message = JSON.parse(payload.toString()) as BridgeMessage } catch { socket.close(1003, 'Invalid JSON'); return }
      if (!authenticated) {
        const hello = message as BridgeHello
        if (hello.type !== 'hello' || typeof hello.token !== 'string' || !safeTokenEqual(hello.token, this.token) || hello.revision < 0 || !hello.document) { socket.close(4003, 'Invalid session'); return }
        if (this.socket && this.socket !== socket) { this.rejectPending(error('SESSION_ERROR', 'A newer OpenGraph tab connected')); this.socket.close(4002, 'Replaced by newer tab') }
        authenticated = true
        clearTimeout(handshakeTimer)
        this.socket = socket
        this.snapshot = { revision: hello.revision, document: hello.document }
        this.activeContext = hello.activeContext
        return
      }
      if (message.type === 'response') this.handleResponse(message)
      if (message.type === 'snapshot') { this.snapshot = message.snapshot; this.activeContext = message.activeContext }
    })
    socket.on('close', () => { clearTimeout(handshakeTimer); if (this.socket === socket) this.socket = undefined })
    socket.on('error', () => socket.close())
  }

  private handleResponse(message: BridgeResponse) {
    const item = this.pending.get(message.requestId)
    if (!item) return
    clearTimeout(item.timer); this.pending.delete(message.requestId)
    if (message.ok) item.resolve(message.result)
    else item.reject(error(message.error?.code ?? 'SESSION_ERROR', message.error?.message ?? 'OpenGraph request failed', message.error))
  }

  private rejectPending(reason: Error) { for (const [id, item] of this.pending) { clearTimeout(item.timer); item.reject(reason); this.pending.delete(id) } }

  async requestUI(method: BridgeRequest['method'], params: unknown) {
    if (!this.isConnected) throw error('NO_UI', 'OpenGraph UI is not connected')
    const requestId = randomBytes(12).toString('hex')
    const request: BridgeRequest = { type: 'request', requestId, method, params }
    return new Promise<unknown>((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); rejectRequest(error('SESSION_ERROR', 'OpenGraph UI did not respond in time')) }, REQUEST_TIMEOUT)
      this.pending.set(requestId, { resolve: resolveRequest, reject: rejectRequest, timer })
      this.socket!.send(JSON.stringify(request))
    })
  }

  async waitForConnection(timeout = 4_000) {
    const end = Date.now() + timeout
    while (!this.isConnected && Date.now() < end) await new Promise((resolveWait) => setTimeout(resolveWait, 50))
    return this.isConnected
  }

  async close() {
    this.rejectPending(error('SESSION_ERROR', 'OpenGraph companion stopped'))
    this.socket?.close(); this.sockets?.close();
    if (this.http) await new Promise<void>((resolveClose) => this.http!.close(() => resolveClose()))
    this.started = undefined; this.port = undefined
  }
}

export type CompanionServer = LoopbackServer
export type CompanionRender = RenderGraphPayload
