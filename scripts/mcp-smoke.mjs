import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { WebSocket } from 'ws'

const root = new URL('..', import.meta.url).pathname
const childPath = `${root}dist-companion/companion/index.js`
const transport = new StdioClientTransport({ command: 'npm', args: ['run', '--silent', 'companion'], cwd: root, stderr: 'pipe' })
const client = new Client({ name: 'opengraph-smoke', version: '1.0.0' }, { capabilities: {} })
const call = (name, args = {}) => client.callTool({ name, arguments: args })
const jsonResult = (response) => {
  const text = response.content?.find((item) => item.type === 'text')?.text
  assert.ok(text, 'MCP tool did not return text')
  return JSON.parse(text)
}

await client.connect(transport)
const listed = await client.listTools()
const operationTool = listed.tools.find((tool) => tool.name === 'apply_graph_operations')
assert.ok(operationTool, 'apply_graph_operations is not registered')
const operationSchema = JSON.stringify(operationTool.inputSchema)
for (const operationName of ['add_node', 'update_node', 'add_edge', 'set_defaults', 'set_viewport']) {
  assert.match(operationSchema, new RegExp(operationName), `MCP schema does not describe ${operationName}`)
}
const openResponse = await call('open_opengraph')
const opened = jsonResult(openResponse)
assert.match(opened.url, /^http:\/\/127\.0\.0\.1:\d+\/#sessionToken=/)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 840 } })
await page.goto(opened.url)
await page.getByText('OpenGraph').waitFor()
await page.waitForFunction(() => document.querySelector('.companion-status')?.textContent?.includes('Codex linked') === true)

const graphResponse = await call('get_graph')
const graph = jsonResult(graphResponse)
assert.equal(graph.document.version, 1)
const revision = graph.revision
const nodeId = graph.document.nodes.find((node) => node.type === 'workflow').id

const applyResponse = await call('apply_graph_operations', {
  baseRevision: revision,
  operations: [{ type: 'set_name', name: 'Voice-designed graph' }, { type: 'update_node', id: nodeId, patch: { title: 'Talk to Codex' } }],
})
const applied = jsonResult(applyResponse)
assert.equal(applied.document.name, 'Voice-designed graph')
await page.getByText('Voice-designed graph').waitFor()
await page.locator('.workflow-node').filter({ hasText: 'Talk to Codex' }).waitFor()

const active = jsonResult(await call('get_active_context'))
assert.equal(active.graphName, 'Voice-designed graph')

const laidOut = jsonResult(await call('layout_graph', { baseRevision: applied.revision, direction: 'right', columns: 3 }))
assert.equal(laidOut.document.nodes[0].position.x, 48)
const undone = jsonResult(await call('undo', { baseRevision: laidOut.revision }))
assert.equal(undone.changed, true)
assert.equal(undone.snapshot.document.name, 'Voice-designed graph')

const stale = await call('apply_graph_operations', { baseRevision: revision, operations: [{ type: 'set_name', name: 'Must fail' }] })
assert.equal(stale.isError, true)
assert.equal(jsonResult(stale).error.code, 'REVISION_CONFLICT')

const rendered = await call('render_graph')
const image = rendered.content?.find((item) => item.type === 'image')
assert.ok(image && image.mimeType === 'image/png')
const png = Buffer.from(image.data, 'base64')
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])

const openedUrl = new URL(opened.url)
const badHost = await new Promise((resolveRequest) => {
  const request = httpRequest({ hostname: '127.0.0.1', port: openedUrl.port, path: '/', headers: { Host: 'evil.example' } }, (response) => { response.resume(); resolveRequest(response) })
  request.end()
})
assert.equal(badHost.statusCode, 403)
const origin = openedUrl.origin
const served = await fetch(origin)
assert.match(served.headers.get('content-security-policy') ?? '', /connect-src 'self' ws:\/\/127\.0\.0\.1:/)
assert.equal((await fetch(`${origin}/assets/missing.js`)).status, 404)
const traversal = await new Promise((resolveRequest) => {
  const request = httpRequest({ hostname: '127.0.0.1', port: openedUrl.port, path: '/%2e%2e/package.json', headers: { Host: openedUrl.host } }, (response) => { response.resume(); resolveRequest(response) })
  request.end()
})
assert.equal(traversal.statusCode, 403)
assert.equal((await fetch(`${origin}/voice-designed-graph`)).status, 200)

const wsOriginRejected = await new Promise((resolveSocket) => {
  const socket = new WebSocket(`ws://127.0.0.1:${openedUrl.port}/__opengraph`, { origin: 'http://evil.example' })
  socket.once('open', () => { socket.close(); resolveSocket(false) })
  socket.once('error', () => resolveSocket(true))
})
assert.equal(wsOriginRejected, true)

const wsTokenRejected = await new Promise((resolveSocket) => {
  const socket = new WebSocket(`ws://127.0.0.1:${openedUrl.port}/__opengraph`, { origin })
  socket.once('open', () => socket.send(JSON.stringify({ type: 'hello', token: 'invalid', revision: 0, document: {}, clientId: 'smoke-invalid' })))
  socket.once('close', (code) => resolveSocket(code === 4003))
  socket.once('error', () => resolveSocket(false))
})
assert.equal(wsTokenRejected, true)

await page.close()
await browser.close()
await client.close()
await readFile(childPath)
console.log('MCP smoke passed: open → get_graph → apply → layout → undo → conflict → render PNG → CSP/host/origin/token/path security')
