import type { EdgeDirection, GraphDocument, GraphEdge, GraphNode, ModelDefinition, ModelId, Reasoning } from '../types.js'
import type { GraphOperation, LayoutGraphParams } from './protocol.js'

export const MAX_NODES = 200
export const MAX_EDGES = 500
export const MAX_STRING = 4_000

const REASONING: Reasoning[] = ['low', 'medium', 'high']

export class DocumentValidationError extends Error {
  code = 'INVALID_OPERATION' as const
}

export const cloneDocument = (document: GraphDocument): GraphDocument => JSON.parse(JSON.stringify(document)) as GraphDocument

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown, max = MAX_STRING) => typeof value === 'string' && value.length <= max
const model = (value: unknown): value is ModelId => typeof value === 'string' && value.trim().length > 0 && value.length <= 160
const reasoning = (value: unknown): value is Reasoning => REASONING.includes(value as Reasoning)

export const validateDocument = (document: GraphDocument): string[] => {
  const errors: string[] = []
  if (!document || document.version !== 1) errors.push('document.version must be 1')
  if (!text(document?.name, 160)) errors.push('document.name is invalid')
  if (!Array.isArray(document?.nodes) || document.nodes.length > MAX_NODES) errors.push(`nodes must contain at most ${MAX_NODES} items`)
  if (!Array.isArray(document?.edges) || document.edges.length > MAX_EDGES) errors.push(`edges must contain at most ${MAX_EDGES} items`)
  if (!document?.defaults || !model(document.defaults.model) || !reasoning(document.defaults.reasoning)) errors.push('defaults are invalid')
  if (!document?.viewport || !finite(document.viewport.x) || !finite(document.viewport.y) || !finite(document.viewport.zoom) || document.viewport.zoom < 0.1 || document.viewport.zoom > 4) errors.push('viewport is invalid')

  const nodeIds = new Set<string>()
  for (const node of document?.nodes ?? []) {
    if (!node || typeof node !== 'object' || !text(node.id, 128) || nodeIds.has(node.id) || !finite(node.position?.x) || !finite(node.position?.y)) {
      errors.push(`node ${String((node as { id?: unknown })?.id ?? '')} is malformed or duplicated`)
      continue
    }
    nodeIds.add(node.id)
    if (node.type === 'workflow') {
      const data = node.data as Partial<Extract<GraphNode['data'], { kind: 'workflow' }>>
      if (data.kind !== 'workflow' || !text(data.title, 160) || !text(data.description, 1_000) || (data.modelOverride !== null && !model(data.modelOverride)) || (data.reasoningOverride !== null && !reasoning(data.reasoningOverride))) errors.push(`workflow node ${node.id} is invalid`)
    } else if (node.type === 'annotation') {
      const data = node.data as Partial<Extract<GraphNode['data'], { kind: 'annotation' }>>
      if (data.kind !== 'annotation' || !text(data.text, 1_000)) errors.push(`annotation node ${node.id} is invalid`)
    } else errors.push(`node ${node.id} has an unsupported type`)
  }

  const edgeIds = new Set<string>()
  for (const edge of document?.edges ?? []) {
    if (!edge || typeof edge !== 'object' || !text(edge.id, 128) || edgeIds.has(edge.id) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(`edge ${String((edge as { id?: unknown })?.id ?? '')} is malformed, duplicated, or dangling`)
      continue
    }
    edgeIds.add(edge.id)
    const direction = edge.data?.direction
    if (!['directed', 'bidirectional', 'loop'].includes(direction ?? '') || (direction === 'loop' && edge.source !== edge.target) || (direction !== 'loop' && edge.source === edge.target) || !text(edge.data?.label ?? '', 240)) errors.push(`edge ${edge.id} has invalid direction or label`)
  }

  const modelIds = new Set<string>()
  for (const item of document?.models ?? []) {
    if (!item || !model(item.id) || modelIds.has(item.id) || typeof item.enabled !== 'boolean' || !text(item.description, 300)) errors.push('models contain an invalid or duplicated entry')
    modelIds.add(item?.id ?? '')
  }
  if (!document?.models || document.models.length < 1 || document.models.length > 200 || !document.models.some((item) => item.enabled)) errors.push('models must contain between 1 and 200 entries and enable at least one')
  if (document?.defaults && !document.models?.some((item) => item.id === document.defaults.model && item.enabled)) errors.push('default model must be enabled')
  return errors
}

export const normalizeCompanionDocument = (input: GraphDocument): GraphDocument => {
  const models = (input.models ?? []).filter((item, index, items) => model(item.id) && items.findIndex((candidate) => candidate.id === item.id) === index)
  if (!models.length) models.push({ id: 'gpt-5.6-sol', provider: 'openai', enabled: true, description: 'Current Codex flagship' })
  if (!models.some((item) => item.enabled)) models[0].enabled = true
  const defaultModel = models.some((item) => item.id === input.defaults.model && item.enabled) ? input.defaults.model : models.find((item) => item.enabled)!.id
  const nodes = input.nodes.map((node) => {
    if (node.type !== 'workflow') return node
    const data = node.data as Extract<GraphNode['data'], { kind: 'workflow' }>
    return { ...node, data: { ...data, modelOverride: data.modelOverride && models.some((item) => item.id === data.modelOverride && item.enabled) ? data.modelOverride : null, reasoningOverride: reasoning(data.reasoningOverride) ? data.reasoningOverride : null } }
  })
  const edges = input.edges.map((edge) => {
    const direction: EdgeDirection = edge.data?.direction === 'loop' || edge.source === edge.target ? 'loop' : edge.data?.direction === 'bidirectional' ? 'bidirectional' : 'directed'
    return { ...edge, target: direction === 'loop' ? edge.source : edge.target, sourceHandle: direction === 'loop' ? 'source-loop' : edge.sourceHandle ?? 'source-right', targetHandle: direction === 'loop' ? 'target-loop' : edge.targetHandle ?? 'target-left', data: { direction, label: edge.data?.label ?? '' } }
  })
  return { ...input, version: 1, models, defaults: { model: defaultModel, reasoning: reasoning(input.defaults.reasoning) ? input.defaults.reasoning : 'medium' }, nodes, edges, updatedAt: new Date().toISOString() }
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new DocumentValidationError(message) }

export const applyGraphOperations = (input: GraphDocument, operations: GraphOperation[]): GraphDocument => {
  assert(Array.isArray(operations) && operations.length > 0 && operations.length <= 100, 'operations must contain between 1 and 100 items')
  const next = cloneDocument(input)
  for (const operation of operations) {
    if (!operation || typeof operation.type !== 'string') throw new DocumentValidationError('operation type is required')
    switch (operation.type) {
      case 'add_node': assert(!next.nodes.some((node) => node.id === operation.node.id), `node ${operation.node.id} already exists`); next.nodes.push(operation.node); break
      case 'update_node': {
        const index = next.nodes.findIndex((node) => node.id === operation.id)
        assert(index >= 0, `node ${operation.id} does not exist`)
        const current = next.nodes[index]
        const { position, title, description, text: annotationText, modelOverride, reasoningOverride } = operation.patch
        if (current.type === 'workflow') {
          assert(annotationText === undefined, 'workflow nodes do not have annotation text')
          next.nodes[index] = {
            ...current,
            position: position ?? current.position,
            data: {
              ...current.data,
              ...(title === undefined ? {} : { title }),
              ...(description === undefined ? {} : { description }),
              ...(modelOverride === undefined ? {} : { modelOverride }),
              ...(reasoningOverride === undefined ? {} : { reasoningOverride }),
            },
          }
        } else {
          assert(title === undefined && description === undefined && modelOverride === undefined && reasoningOverride === undefined, 'annotation nodes only accept text and position')
          next.nodes[index] = {
            ...current,
            position: position ?? current.position,
            data: { ...current.data, ...(annotationText === undefined ? {} : { text: annotationText }) },
          }
        }
        break
      }
      case 'remove_node': assert(next.nodes.some((node) => node.id === operation.id), `node ${operation.id} does not exist`); next.nodes = next.nodes.filter((node) => node.id !== operation.id); next.edges = next.edges.filter((edge) => edge.source !== operation.id && edge.target !== operation.id); break
      case 'add_edge': assert(!next.edges.some((edge) => edge.id === operation.edge.id), `edge ${operation.edge.id} already exists`); next.edges.push(operation.edge); break
      case 'update_edge': {
        const index = next.edges.findIndex((edge) => edge.id === operation.id)
        assert(index >= 0, `edge ${operation.id} does not exist`)
        const { direction, label, ...edgeFields } = operation.patch
        next.edges[index] = {
          ...next.edges[index],
          ...edgeFields,
          data: {
            direction: direction ?? next.edges[index].data?.direction ?? 'directed',
            label: label ?? next.edges[index].data?.label ?? '',
          },
        }
        break
      }
      case 'remove_edge': assert(next.edges.some((edge) => edge.id === operation.id), `edge ${operation.id} does not exist`); next.edges = next.edges.filter((edge) => edge.id !== operation.id); break
      case 'set_name': assert(text(operation.name, 160), 'graph name is invalid'); next.name = operation.name; break
      case 'set_defaults': next.defaults = operation.defaults; break
      case 'set_models': next.models = operation.models; break
      case 'set_viewport': next.viewport = operation.viewport; break
      default: throw new DocumentValidationError(`unsupported operation ${(operation as { type: string }).type}`)
    }
  }
  const errors = validateDocument(next)
  if (errors.length) throw new DocumentValidationError(errors.slice(0, 4).join('; '))
  return normalizeCompanionDocument(next)
}

export const layoutDocument = (input: GraphDocument, params: LayoutGraphParams): GraphDocument => {
  const columns = Math.max(1, Math.min(20, Math.floor(params.columns ?? 4)))
  const gapX = Math.max(160, Math.min(640, params.gapX ?? 300))
  const gapY = Math.max(120, Math.min(480, params.gapY ?? 180))
  const margin = Math.max(0, Math.min(1_000, params.margin ?? 48))
  const direction = params.direction ?? 'right'
  const nodes = input.nodes.map((node, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return { ...node, position: direction === 'down' ? { x: margin + row * gapX, y: margin + column * gapY } : { x: margin + column * gapX, y: margin + row * gapY } }
  })
  const next = { ...input, nodes }
  return normalizeCompanionDocument(next)
}
