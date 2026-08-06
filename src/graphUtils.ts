import type { NodeChange } from "@xyflow/react";
import { applyNodeChanges } from "@xyflow/react";
import {
  type GraphDocument,
  type GraphEdge,
  type GraphNode,
  type EdgeDirection,
  type ModelDefinition,
  type ModelId,
  type Reasoning,
} from "./types";
import { MODEL_CATALOG, inferredProvider } from './modelCatalog'

export const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const DEFAULT_MODELS: ModelDefinition[] = MODEL_CATALOG.map((model) => ({ ...model }))

const REASONING_VALUES: Reasoning[] = ["low", "medium", "high"];

const isModelId = (value: unknown): value is ModelId =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
const isReasoning = (value: unknown): value is Reasoning =>
  REASONING_VALUES.includes(value as Reasoning);

export const createWorkflowNode = (
  position: { x: number; y: number },
  title = "New step",
): GraphNode => ({
  id: makeId("node"),
  type: "workflow",
  position,
  data: {
    kind: "workflow",
    title,
    description: "Describe what this step does.",
    modelOverride: null,
    reasoningOverride: null,
  },
});

export const createAnnotationNode = (
  position: { x: number; y: number },
  text = "Add a note…",
): GraphNode => ({
  id: makeId("note"),
  type: "annotation",
  position,
  data: { kind: "annotation", text },
});

export const selectNodeModel = (
  document: GraphDocument,
  nodeId: string,
  model: ModelId,
): GraphDocument => ({
  ...document,
  // `defaults.model` remembers the last selection for nodes created later.
  // Materialize inherited values first so existing nodes remain independent.
  defaults: { ...document.defaults, model },
  nodes: document.nodes.map((node) =>
    node.data.kind === "workflow"
      ? {
          ...node,
          data: {
            ...node.data,
            modelOverride:
              node.id === nodeId
                ? model
                : (node.data.modelOverride ?? document.defaults.model),
          },
        }
      : node,
  ),
});

type ConnectionLike = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export const directionForConnection = (
  connection: ConnectionLike,
): EdgeDirection =>
  connection.source === connection.target ? "loop" : "directed";

export const createEdge = (
  connection: ConnectionLike,
  direction: EdgeDirection = directionForConnection(connection),
  label = "",
): GraphEdge => ({
  id: makeId("edge"),
  source: connection.source,
  target:
    direction === "loop" || connection.source === connection.target
      ? connection.source
      : connection.target,
  sourceHandle:
    direction === "loop" || connection.source === connection.target
      ? "source-loop"
      : (connection.sourceHandle ?? "source-right"),
  targetHandle:
    direction === "loop" || connection.source === connection.target
      ? "target-loop"
      : (connection.targetHandle ?? "target-left"),
  type: "workflow",
  data: {
    direction:
      direction === "loop" || connection.source === connection.target
        ? "loop"
        : direction,
    label,
  },
  animated: false,
});

export const hasEquivalentEdge = (
  edges: GraphEdge[],
  connection: ConnectionLike,
): boolean => {
  const candidate = createEdge(connection);
  return edges.some(
    (edge) =>
      edge.source === candidate.source &&
      edge.target === candidate.target &&
      edge.sourceHandle === candidate.sourceHandle &&
      edge.targetHandle === candidate.targetHandle,
  );
};

export const resolvedNodeSettings = (
  node: GraphNode,
  document: GraphDocument,
) => {
  if (node.type !== "workflow" || node.data.kind !== "workflow") return null;
  return {
    model: node.data.modelOverride ?? document.defaults.model,
    reasoning: node.data.reasoningOverride ?? document.defaults.reasoning,
    inheritedModel: node.data.modelOverride === null,
    inheritedReasoning: node.data.reasoningOverride === null,
  };
};

export const sanitizeDocument = (input: unknown): GraphDocument | null => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Partial<GraphDocument>;
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.nodes) ||
    !Array.isArray(candidate.edges)
  )
    return null;
  if (
    !candidate.defaults ||
    !isModelId(candidate.defaults.model)
  )
    return null;
  return normalizeDocument(input as GraphDocument);
};

const normalizeModels = (input: unknown): ModelDefinition[] => {
  const incoming = Array.isArray(input) ? input : [];
  const byId = new Map<ModelId, ModelDefinition>();
  incoming.forEach((value) => {
    if (!value || typeof value !== "object") return;
    const candidate = value as Partial<ModelDefinition>;
    if (!isModelId(candidate.id)) return;
    const fallback = DEFAULT_MODELS.find((model) => model.id === candidate.id)
    byId.set(candidate.id, {
      ...(fallback ?? { provider: 'custom' as const, description: 'Custom model' }),
      ...candidate,
      id: candidate.id,
      enabled: candidate.enabled !== false,
      description:
        typeof candidate.description === "string"
          ? candidate.description
          : fallback?.description ?? 'Custom model',
      provider: inferredProvider({ id: candidate.id, provider: candidate.provider ?? fallback?.provider }),
    });
  });
  const normalized = [...byId.values()];
  if (!normalized.length) normalized.push(...DEFAULT_MODELS.map((model) => ({ ...model })));
  else {
    const configuredProviders = new Set(normalized.map((model) => inferredProvider(model)))
    DEFAULT_MODELS.forEach((model) => {
      if (configuredProviders.has(inferredProvider(model)) && !byId.has(model.id)) {
        normalized.push({ ...model, enabled: false })
      }
    })
  }
  if (!normalized.some((model) => model.enabled)) normalized[0].enabled = true;
  return normalized;
};

const normalizeNodes = (
  nodes: GraphNode[],
  models: ModelDefinition[],
): GraphNode[] =>
  nodes.map((node) => {
    if (node.data.kind !== "workflow") return node;
    const workflowData = node.data as Extract<
      GraphNode["data"],
      { kind: "workflow" }
    >;
    const modelOverride =
      isModelId(workflowData.modelOverride) &&
      models.some(
        (model) => model.id === workflowData.modelOverride && model.enabled,
      )
        ? workflowData.modelOverride
        : null;
    const reasoningOverride = isReasoning(workflowData.reasoningOverride)
      ? workflowData.reasoningOverride
      : null;
    return {
      ...node,
      data: { ...workflowData, modelOverride, reasoningOverride },
    };
  });

const normalizeEdges = (edges: GraphEdge[]): GraphEdge[] =>
  edges.map((edge) => {
    const rawDirection = edge.data?.direction;
    const isLoop = rawDirection === "loop" || edge.source === edge.target;
    const direction: EdgeDirection = isLoop
      ? "loop"
      : rawDirection === "bidirectional"
        ? "bidirectional"
        : "directed";
    return {
      ...edge,
      target: isLoop ? edge.source : edge.target,
      sourceHandle: isLoop
        ? "source-loop"
        : (edge.sourceHandle ?? "source-right"),
      targetHandle: isLoop
        ? "target-loop"
        : (edge.targetHandle ?? "target-left"),
      data: {
        direction,
        label: typeof edge.data?.label === "string" ? edge.data.label : "",
      },
    };
  });

export const normalizeDocument = (input: GraphDocument): GraphDocument => {
  const normalizedModels = normalizeModels(input.models);
  const firstEnabled = normalizedModels.find((model) => model.enabled)!;
  const defaultModel =
    isModelId(input.defaults?.model) &&
    normalizedModels.some(
      (model) => model.id === input.defaults.model && model.enabled,
    )
      ? input.defaults.model
      : firstEnabled.id;
  const defaultReasoning = isReasoning(input.defaults?.reasoning)
    ? input.defaults.reasoning
    : "medium";
  return {
    ...input,
    version: 1,
    models: normalizedModels,
    defaults: { model: defaultModel, reasoning: defaultReasoning },
    nodes: normalizeNodes(input.nodes, normalizedModels),
    edges: normalizeEdges(input.edges),
  };
};

export const applyNodeChangesWithoutSelection = (
  nodes: GraphNode[],
  changes: NodeChange<GraphNode>[],
) => applyNodeChanges(changes, nodes) as GraphNode[];

const exportNodeHeight = (node: GraphNode) =>
  node.measured?.height ?? node.height ?? 100;

export const getExportBounds = (
  nodes: GraphNode[],
  padding = 48,
  maxDimension = 2048,
  edgeBounds?: { x: number; y: number; width: number; height: number } | null,
) => {
  if (nodes.length === 0 && !edgeBounds)
    return { x: 0, y: 0, width: 640, height: 420, scale: 1 };
  const nodeLeft = nodes.length ? Math.min(...nodes.map((node) => node.position.x)) : Infinity;
  const nodeTop = nodes.length ? Math.min(...nodes.map((node) => node.position.y)) : Infinity;
  const nodeRight = nodes.length ? Math.max(
    ...nodes.map(
      (node) => node.position.x + (node.measured?.width ?? node.width ?? 220),
    ),
  ) : -Infinity;
  const nodeBottom = nodes.length ? Math.max(
    ...nodes.map((node) => node.position.y + exportNodeHeight(node)),
  ) : -Infinity;
  const left = Math.min(nodeLeft, edgeBounds?.x ?? Infinity);
  const top = Math.min(nodeTop, edgeBounds?.y ?? Infinity);
  const right = Math.max(nodeRight, edgeBounds ? edgeBounds.x + edgeBounds.width : -Infinity);
  const bottom = Math.max(nodeBottom, edgeBounds ? edgeBounds.y + edgeBounds.height : -Infinity);
  const width = Math.max(320, right - left + padding * 2);
  const height = Math.max(240, bottom - top + padding * 2);
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { x: left - padding, y: top - padding, width, height, scale };
};

export const convertEdgeDirection = (
  edge: GraphEdge,
  direction: EdgeDirection,
  targetId?: string,
): GraphEdge | null => {
  if (direction === "loop") {
    return {
      ...edge,
      target: edge.source,
      sourceHandle: "source-loop",
      targetHandle: "target-loop",
      data: { ...(edge.data ?? { label: "" }), direction: "loop" },
    };
  }
  const target =
    edge.data?.direction === "loop" ? targetId : (targetId ?? edge.target);
  if (!target || target === edge.source) return null;
  return {
    ...edge,
    target,
    data: { ...(edge.data ?? { label: "" }), direction },
  };
};

export const toggleEdgeDirection = (
  edge: GraphEdge,
  direction: EdgeDirection,
  targetId?: string,
): GraphEdge => convertEdgeDirection(edge, direction, targetId) ?? edge;

export const getModelOptions = (
  models: GraphDocument["models"],
  current: ModelId,
) => models.filter((model) => model.enabled || model.id === current);

export const getReasoningOptions = (): Reasoning[] => ["low", "medium", "high"];

export const commitNodeChanges = (
  document: GraphDocument,
  nodes: GraphNode[],
): GraphDocument => ({
  ...document,
  nodes,
  updatedAt: new Date().toISOString(),
});

export const commitEdgeChanges = (
  document: GraphDocument,
  edges: GraphEdge[],
): GraphDocument => ({
  ...document,
  edges,
  updatedAt: new Date().toISOString(),
});
