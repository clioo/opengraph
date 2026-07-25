import type { GraphDocument, GraphEdge, GraphNode, ModelDefinition, ModelId, Reasoning } from '../types.js'

export const COMPANION_PROTOCOL_VERSION = 1
export const MAX_MESSAGE_BYTES = 512_000

export type CompanionErrorCode = 'NO_UI' | 'REVISION_CONFLICT' | 'INVALID_OPERATION' | 'RENDER_FAILED' | 'SESSION_ERROR' | 'NOT_READY'

export type GraphSelection = { id: string; kind: 'node' | 'edge' } | null

export type NodePatch = {
  position?: GraphNode['position']
  title?: string
  description?: string
  text?: string
  modelOverride?: ModelId | null
  reasoningOverride?: Reasoning | null
}

export type EdgePatch = {
  source?: string
  target?: string
  sourceHandle?: string | null
  targetHandle?: string | null
  animated?: boolean
  direction?: NonNullable<GraphEdge['data']>['direction']
  label?: string
}

export type ActiveContext = {
  revision: number
  graphName: string
  selected: GraphSelection
  activeTool: 'select' | 'node' | 'note' | 'connect'
  viewport: GraphDocument['viewport']
}

export type GraphOperation =
  | { type: 'add_node'; node: GraphNode }
  | { type: 'update_node'; id: string; patch: NodePatch }
  | { type: 'remove_node'; id: string }
  | { type: 'add_edge'; edge: GraphEdge }
  | { type: 'update_edge'; id: string; patch: EdgePatch }
  | { type: 'remove_edge'; id: string }
  | { type: 'set_name'; name: string }
  | { type: 'set_defaults'; defaults: GraphDocument['defaults'] }
  | { type: 'set_models'; models: ModelDefinition[] }
  | { type: 'set_viewport'; viewport: GraphDocument['viewport'] }

export type ApplyGraphOperationsParams = {
  baseRevision: number
  operations: GraphOperation[]
}

export type LayoutGraphParams = {
  baseRevision: number
  direction?: 'right' | 'down'
  columns?: number
  gapX?: number
  gapY?: number
  margin?: number
}

export type UndoParams = { baseRevision: number }

export type BridgeRequestMethod = 'get_graph' | 'get_active_context' | 'apply_graph_operations' | 'layout_graph' | 'undo' | 'render_graph'

export type BridgeRequest = {
  type: 'request'
  requestId: string
  method: BridgeRequestMethod
  params: unknown
}

export type BridgeResponse = {
  type: 'response'
  requestId: string
  ok: boolean
  result?: unknown
  error?: { code: CompanionErrorCode; message: string; currentRevision?: number; snapshot?: GraphSnapshot }
}

export type GraphSnapshot = { revision: number; document: GraphDocument }

export type BridgeHello = {
  type: 'hello'
  token: string
  revision: number
  document: GraphDocument
  clientId: string
  activeContext?: ActiveContext
}

export type BridgeEvent = {
  type: 'snapshot'
  snapshot: GraphSnapshot
  activeContext: ActiveContext
}

export type BridgeMessage = BridgeHello | BridgeRequest | BridgeResponse | BridgeEvent

export type BridgeHandlers = {
  getGraph: () => GraphSnapshot
  getActiveContext: () => ActiveContext
  applyGraphOperations: (params: ApplyGraphOperationsParams) => Promise<unknown> | unknown
  layoutGraph: (params: LayoutGraphParams) => Promise<unknown> | unknown
  undo: (params: UndoParams) => Promise<unknown> | unknown
  renderGraph: () => Promise<Blob>
}

export type RenderGraphPayload = { mimeType: 'image/png'; base64: string; bytes: number }

export const isCompanionError = (value: unknown): value is { code: CompanionErrorCode; message: string } => Boolean(value && typeof value === 'object' && 'code' in value && 'message' in value)

export type ModelSelection = { model: ModelId; reasoning: Reasoning }
