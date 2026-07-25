import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { applyGraphOperationsSchema, layoutGraphSchema, undoSchema } from './schemas.js'
import { LoopbackServer } from './server.js'
import type { ApplyGraphOperationsParams, LayoutGraphParams, UndoParams } from '../src/companion/protocol.js'

const result = (value: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> })
const failure = (reason: unknown): CallToolResult => {
  const detail = reason as { code?: string; message?: string; currentRevision?: number; snapshot?: unknown }
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: detail.code ?? 'SESSION_ERROR', message: detail.message ?? 'OpenGraph request failed', currentRevision: detail.currentRevision, snapshot: detail.snapshot } }) }], structuredContent: { error: { code: detail.code ?? 'SESSION_ERROR', message: detail.message ?? 'OpenGraph request failed', currentRevision: detail.currentRevision } } }
}

const call = async (server: LoopbackServer, method: 'get_graph' | 'get_active_context' | 'apply_graph_operations' | 'layout_graph' | 'undo' | 'render_graph', params: unknown) => server.requestUI(method, params)

export const registerTools = (mcp: McpServer, bridge: LoopbackServer) => {
  mcp.registerTool('open_opengraph', { title: 'Open OpenGraph', description: 'Start the local OpenGraph companion and return a one-tab session URL.', inputSchema: {} }, async () => {
    try {
      await bridge.start()
      return result({ url: bridge.sessionUrl, connected: bridge.isConnected, revision: bridge.currentRevision })
    } catch (reason) { return failure(reason) }
  })

  mcp.registerTool('get_graph', { title: 'Get graph', description: 'Read the complete normalized graph from the connected OpenGraph tab.' }, async () => {
    try { return result(await call(bridge, 'get_graph', {})) } catch (reason) { return failure(reason) }
  })

  mcp.registerTool('get_active_context', { title: 'Get active context', description: 'Read the selected graph item, active tool, name, viewport, and revision.' }, async () => {
    try { return result(await call(bridge, 'get_active_context', {})) } catch (reason) { return failure(reason) }
  })

  mcp.registerTool('apply_graph_operations', { title: 'Apply graph operations', description: 'Apply an atomic, validated batch of typed node, edge, graph, model, or viewport operations. Read get_graph first and pass its revision as baseRevision.', inputSchema: applyGraphOperationsSchema }, async (args) => {
    try { return result(await call(bridge, 'apply_graph_operations', args as ApplyGraphOperationsParams)) } catch (reason) { return failure(reason) }
  })

  mcp.registerTool('layout_graph', { title: 'Layout graph', description: 'Apply a deterministic rightward or downward layout at an exact base revision.', inputSchema: layoutGraphSchema }, async (args) => {
    try { return result(await call(bridge, 'layout_graph', args as LayoutGraphParams)) } catch (reason) { return failure(reason) }
  })

  mcp.registerTool('undo', { title: 'Undo graph change', description: 'Undo one confirmed graph transaction at an exact base revision.', inputSchema: undoSchema }, async (args) => {
    try { return result(await call(bridge, 'undo', args as UndoParams)) } catch (reason) { return failure(reason) }
  })

  mcp.registerTool('render_graph', { title: 'Render graph', description: 'Render the connected OpenGraph canvas as a PNG image.' }, async () => {
    try {
      const payload = await call(bridge, 'render_graph', {}) as { mimeType: 'image/png'; base64: string; bytes: number }
      return { content: [{ type: 'image', data: payload.base64, mimeType: payload.mimeType }, { type: 'text', text: JSON.stringify({ mimeType: payload.mimeType, bytes: payload.bytes }) }], structuredContent: { mimeType: payload.mimeType, bytes: payload.bytes } }
    } catch (reason) { return failure(reason) }
  })
}
