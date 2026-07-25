import type { Edge, Node } from '@xyflow/react'

export type ModelId = string
export type ProviderId = string
export type Reasoning = 'low' | 'medium' | 'high'
export type NodeKind = 'workflow' | 'annotation'
export type EdgeDirection = 'directed' | 'bidirectional' | 'loop'

export type ModelDefinition = {
  id: ModelId
  provider?: ProviderId
  enabled: boolean
  description: string
}

export type WorkflowNodeData = {
  kind: 'workflow'
  title: string
  description: string
  modelOverride: ModelId | null
  reasoningOverride: Reasoning | null
}

export type AnnotationNodeData = {
  kind: 'annotation'
  text: string
}

export type GraphNodeData = WorkflowNodeData | AnnotationNodeData
export type GraphNode = Node<GraphNodeData>

export type GraphEdgeData = {
  direction: EdgeDirection
  label: string
}
export type GraphEdge = Edge<GraphEdgeData>

export type GraphDocument = {
  version: 1
  name: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  models: ModelDefinition[]
  defaults: {
    model: ModelId
    reasoning: Reasoning
  }
  viewport: { x: number; y: number; zoom: number }
  updatedAt: string
}

export type Appearance = 'light' | 'dark' | 'system'

export const modelLabel = (id: ModelId) => id.split('/').at(-1) ?? id

export const modelColor = (id: ModelId) => {
  // FNV-1a makes the color stable across reloads, exports and MCP edits.
  // Using the full hue wheel keeps models from the same provider distinct.
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const hue = Math.abs(hash) % 360
  const chroma = 0.16 + (Math.abs(hash >>> 8) % 4) * 0.01
  return `oklch(0.65 ${chroma.toFixed(2)} ${hue})`
}

export const reasoningLabel = (value: Reasoning) => ({ low: 'low', medium: 'medium', high: 'high' })[value]
