import { z } from 'zod'

const revision = z.number().int().nonnegative()
const id = z.string().min(1).max(128)
const modelId = z.string().trim().min(1).max(160)
const reasoning = z.enum(['low', 'medium', 'high'])
const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
const viewport = z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().min(0.1).max(4) }).strict()
const workflowData = z.object({
  kind: z.literal('workflow'),
  title: z.string().max(160),
  description: z.string().max(1_000),
  modelOverride: modelId.nullable(),
  reasoningOverride: reasoning.nullable(),
}).strict()
const annotationData = z.object({ kind: z.literal('annotation'), text: z.string().max(1_000) }).strict()
const workflowNode = z.object({ id, type: z.literal('workflow'), position, data: workflowData }).strict()
const annotationNode = z.object({ id, type: z.literal('annotation'), position, data: annotationData }).strict()
const node = z.discriminatedUnion('type', [workflowNode, annotationNode])
const nodePatch = z.object({
  position: position.optional(),
  title: z.string().max(160).optional(),
  description: z.string().max(1_000).optional(),
  text: z.string().max(1_000).optional(),
  modelOverride: modelId.nullable().optional(),
  reasoningOverride: reasoning.nullable().optional(),
}).strict()
const edgeData = z.object({ direction: z.enum(['directed', 'bidirectional', 'loop']), label: z.string().max(240) }).strict()
const edge = z.object({
  id,
  source: id,
  target: id,
  type: z.literal('workflow').optional(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  animated: z.boolean().optional(),
  data: edgeData,
}).strict()
const edgePatch = z.object({
  source: id.optional(),
  target: id.optional(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  animated: z.boolean().optional(),
  direction: edgeData.shape.direction.optional(),
  label: edgeData.shape.label.optional(),
}).strict()
const modelDefinition = z.object({ id: modelId, provider: z.string().trim().min(1).max(80).optional(), enabled: z.boolean(), description: z.string().max(300) }).strict()
const operation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_node'), node }).strict(),
  z.object({ type: z.literal('update_node'), id, patch: nodePatch }).strict(),
  z.object({ type: z.literal('remove_node'), id }).strict(),
  z.object({ type: z.literal('add_edge'), edge }).strict(),
  z.object({ type: z.literal('update_edge'), id, patch: edgePatch }).strict(),
  z.object({ type: z.literal('remove_edge'), id }).strict(),
  z.object({ type: z.literal('set_name'), name: z.string().max(160) }).strict(),
  z.object({ type: z.literal('set_defaults'), defaults: z.object({ model: modelId, reasoning }).strict() }).strict(),
  z.object({ type: z.literal('set_models'), models: z.array(modelDefinition).min(1).max(200) }).strict(),
  z.object({ type: z.literal('set_viewport'), viewport }).strict(),
])
const operations = z.array(operation).min(1).max(100)

export const applyGraphOperationsSchema = { baseRevision: revision, operations }
export const layoutGraphSchema = {
  baseRevision: revision,
  direction: z.enum(['right', 'down']).optional(),
  columns: z.number().int().min(1).max(20).optional(),
  gapX: z.number().min(160).max(640).optional(),
  gapY: z.number().min(120).max(480).optional(),
  margin: z.number().min(0).max(1_000).optional(),
}
export const undoSchema = { baseRevision: revision }
