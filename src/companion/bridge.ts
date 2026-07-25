import type { BridgeEvent, BridgeHandlers, BridgeMessage, BridgeRequest, BridgeResponse, GraphSnapshot } from './protocol'

type ConnectionState = 'disconnected' | 'connecting' | 'connected'

export type CompanionBridge = {
  getState: () => ConnectionState
  connect: () => void
  close: () => void
  notifySnapshot: (snapshot: GraphSnapshot, activeContext: BridgeEvent['activeContext']) => void
}

const requestTimeout = 12_000

export const createCompanionBridge = (token: string, handlers: BridgeHandlers, onState: (state: ConnectionState) => void): CompanionBridge => {
  let socket: WebSocket | null = null
  let state: ConnectionState = 'disconnected'
  let reconnectTimer: number | undefined
  let reconnectDelay = 500
  let closed = false
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void; timer: number }>()
  const clientId = `ui-${Math.random().toString(36).slice(2, 10)}`

  const setState = (next: ConnectionState) => { state = next; onState(next) }
  const send = (message: BridgeMessage) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)) }
  const clearPending = (reason: Error) => { for (const [id, item] of pending) { window.clearTimeout(item.timer); item.reject(reason); pending.delete(id) } }

  const schedule = () => {
    if (closed || reconnectTimer !== undefined) return
    reconnectTimer = window.setTimeout(() => { reconnectTimer = undefined; connect() }, reconnectDelay)
    reconnectDelay = Math.min(4_000, reconnectDelay * 1.6)
  }

  const connect = () => {
    if (closed || state === 'connecting' || state === 'connected') return
    setState('connecting')
    const url = new URL(window.location.href)
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(`${protocol}//${url.host}/__opengraph`)
    socket.addEventListener('open', () => {
      reconnectDelay = 500
      const snapshot = handlers.getGraph()
      send({ type: 'hello', token, revision: snapshot.revision, document: snapshot.document, clientId, activeContext: handlers.getActiveContext() })
      setState('connected')
    })
    socket.addEventListener('message', async (event) => {
      let message: BridgeMessage
      try { message = JSON.parse(String(event.data)) as BridgeMessage } catch { return }
      if (message.type !== 'request') return
      const request = message as BridgeRequest
      try {
        let result: unknown
        if (request.method === 'get_graph') result = handlers.getGraph()
        else if (request.method === 'get_active_context') result = handlers.getActiveContext()
        else if (request.method === 'apply_graph_operations') result = await handlers.applyGraphOperations(request.params as never)
        else if (request.method === 'layout_graph') result = await handlers.layoutGraph(request.params as never)
        else if (request.method === 'undo') result = await handlers.undo(request.params as never)
        else {
          const blob = await handlers.renderGraph()
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let binary = ''
          const chunk = 0x8000
          for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
          result = { mimeType: 'image/png', base64: btoa(binary), bytes: bytes.length }
        }
        const response: BridgeResponse = { type: 'response', requestId: request.requestId, ok: true, result }
        send(response)
      } catch (error) {
        const detail = error as { code?: string; message?: string; currentRevision?: number; snapshot?: GraphSnapshot }
        send({ type: 'response', requestId: request.requestId, ok: false, error: { code: (detail.code ?? 'SESSION_ERROR') as never, message: detail.message ?? 'Bridge request failed', currentRevision: detail.currentRevision, snapshot: detail.snapshot } })
      }
    })
    socket.addEventListener('close', () => { socket = null; if (state !== 'disconnected') setState('disconnected'); clearPending(new Error('OpenGraph companion disconnected')); schedule() })
    socket.addEventListener('error', () => { socket?.close() })
  }

  const close = () => { closed = true; if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer); clearPending(new Error('OpenGraph companion closed')); socket?.close(); socket = null; setState('disconnected') }
  const notifySnapshot = (snapshot: GraphSnapshot, activeContext: BridgeEvent['activeContext']) => send({ type: 'snapshot', snapshot, activeContext })

  return { getState: () => state, connect, close, notifySnapshot }
}

export const readSessionToken = () => {
  const hash = window.location.hash.replace(/^#/, '')
  const params = new URLSearchParams(hash)
  const token = params.get('sessionToken')
  if (!token) return null
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  return token
}
