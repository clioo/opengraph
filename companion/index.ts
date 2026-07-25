import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { LoopbackServer } from './server.js'
import { registerTools } from './tools.js'

const bridge = new LoopbackServer(process.env.OPENGRAPH_DIST)
const mcp = new McpServer({ name: 'opengraph', version: '0.1.0' }, { instructions: 'OpenGraph is a local visual workflow editor. Call open_opengraph before graph tools.' })
registerTools(mcp, bridge)

let stopping = false
const shutdown = async () => {
  if (stopping) return
  stopping = true
  await bridge.close()
  await mcp.close()
}
process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })

const transport = new StdioServerTransport()
transport.onerror = (reason) => process.stderr.write(`[opengraph] MCP transport error: ${reason.message}\n`)
transport.onclose = () => { void bridge.close() }
await mcp.connect(transport)
process.stderr.write('[opengraph] MCP stdio companion ready\n')
