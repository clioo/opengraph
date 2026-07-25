import { create } from "zustand";
import type { EdgeChange, NodeChange } from "@xyflow/react";
import { applyEdgeChanges } from "@xyflow/react";
import {
  createAnnotationNode,
  createEdge,
  createWorkflowNode,
  DEFAULT_MODELS,
  makeId,
  normalizeDocument,
  sanitizeDocument,
} from "./graphUtils";
import type {
  Appearance,
  EdgeDirection,
  GraphDocument,
  GraphEdge,
  GraphNode,
  ModelId,
  Reasoning,
} from "./types";
import { MODEL_IDS } from './modelCatalog'
import {
  applyGraphOperations as applyCompanionOperations,
  cloneDocument,
  layoutDocument,
} from "./companion/document";
import type {
  GraphOperation,
  GraphSnapshot,
  LayoutGraphParams,
} from "./companion/protocol";

const STORAGE_KEY = "opengraph.document.v1";
const RECOVERY_KEY = "opengraph.recovery";
const GRAPH_LIBRARY_KEY = "opengraph.graph-library.v1";
const ACTIVE_GRAPH_KEY = "opengraph.active-graph.v1";
const MODEL_PREFERENCES_KEY = "opengraph.model-preferences.v1";

const preferredModels = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(MODEL_PREFERENCES_KEY) ?? 'null') as Pick<GraphDocument, 'models' | 'defaults'> | null
    if (saved?.models?.length && saved.defaults?.model) return saved
  } catch { /* use the ready-to-draw defaults */ }
  return { models: DEFAULT_MODELS.map((model) => ({ ...model })), defaults: { model: 'gpt-5.6-sol', reasoning: 'medium' as Reasoning } }
}

export const makeInitialDocument = (): GraphDocument => {
  const nodes: GraphNode[] = [
    {
      ...createWorkflowNode({ x: 24, y: 124 }, "1. Ingest"),
      data: {
        kind: "workflow",
        title: "1. Ingest",
        description: "Collect source material and normalize incoming files.",
        modelOverride: null,
        reasoningOverride: null,
      },
    },
    {
      ...createWorkflowNode({ x: 310, y: 124 }, "2. Parse & chunk"),
      data: {
        kind: "workflow",
        title: "2. Parse & chunk",
        description: "Split content into useful working context.",
        modelOverride: null,
        reasoningOverride: null,
      },
    },
    {
      ...createWorkflowNode({ x: 596, y: 124 }, "3. Retrieve"),
      data: {
        kind: "workflow",
        title: "3. Retrieve",
        description: "Find the most relevant context for the request.",
        modelOverride: null,
        reasoningOverride: null,
      },
    },
    {
      ...createWorkflowNode({ x: 882, y: 124 }, "4. Generate answer"),
      data: {
        kind: "workflow",
        title: "4. Generate answer",
        description: "Compose a response and validate it before returning.",
        modelOverride: null,
        reasoningOverride: "high",
      },
    },
    {
      ...createWorkflowNode({ x: 882, y: 360 }, "5. Validate"),
      data: {
        kind: "workflow",
        title: "5. Validate",
        description: "Check factual accuracy and retry when necessary.",
        modelOverride: "gpt-5.6-sol",
        reasoningOverride: "medium",
      },
    },
    {
      ...createAnnotationNode(
        { x: 24, y: 360 },
        "Validation checks factual accuracy. If it fails, refine the query and try again.",
      ),
    },
  ];
  const edges: GraphEdge[] = [
    createEdge({
      source: nodes[0].id,
      target: nodes[1].id,
      sourceHandle: "source-right",
      targetHandle: "target-left",
    }),
    createEdge({
      source: nodes[1].id,
      target: nodes[2].id,
      sourceHandle: "source-right",
      targetHandle: "target-left",
    }),
    createEdge({
      source: nodes[2].id,
      target: nodes[3].id,
      sourceHandle: "source-right",
      targetHandle: "target-left",
    }),
    createEdge({
      source: nodes[3].id,
      target: nodes[4].id,
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    }),
    createEdge(
      {
        source: nodes[4].id,
        target: nodes[3].id,
        sourceHandle: "source-right",
        targetHandle: "target-right",
      },
      "bidirectional",
      "needs improvement",
    ),
    createEdge({ source: nodes[4].id, target: nodes[4].id }, "loop", "retry"),
  ];
  return {
    version: 1,
    name: "Workflow",
    nodes,
    edges,
    models: DEFAULT_MODELS.map((model) => ({ ...model })),
    defaults: { model: "gpt-5.6-sol", reasoning: "medium" },
    viewport: { x: 0, y: 0, zoom: 0.9 },
    updatedAt: new Date().toISOString(),
  };
};

export const makeBlankDocument = (name = "Untitled graph"): GraphDocument => {
  const preferred = preferredModels()
  return ({
  version: 1,
  name,
  nodes: [],
  edges: [],
  models: preferred.models,
  defaults: preferred.defaults,
  viewport: { x: 0, y: 0, zoom: 0.9 },
  updatedAt: new Date().toISOString(),
  });
}

export const loadDocument = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeInitialDocument();
    const parsed: unknown = JSON.parse(raw);
    const valid = sanitizeDocument(parsed);
    if (valid) return valid;
    localStorage.setItem(RECOVERY_KEY, raw);
  } catch {
    // Editing must remain available if storage is disabled or corrupt.
  }
  return makeInitialDocument();
};

export type SavedGraph = {
  id: string;
  project: string;
  archived: boolean;
  document: GraphDocument;
};

const loadGraphLibrary = (): {
  graphs: SavedGraph[];
  activeGraphId: string;
} => {
  try {
    const raw = localStorage.getItem(GRAPH_LIBRARY_KEY);
    const activeGraphId = localStorage.getItem(ACTIVE_GRAPH_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const graphs = parsed.flatMap((value): SavedGraph[] => {
          if (!value || typeof value !== "object") return [];
          const candidate = value as Partial<SavedGraph>;
          const document = sanitizeDocument(candidate.document);
          return typeof candidate.id === "string" && document
            ? [
                {
                  id: candidate.id,
                  project:
                    typeof candidate.project === "string" &&
                    candidate.project.trim()
                      ? candidate.project
                      : "Personal",
                  archived: candidate.archived === true,
                  document,
                },
              ]
            : [];
        });
        if (graphs.length)
          return {
            graphs,
            activeGraphId: graphs.some((graph) => graph.id === activeGraphId)
              ? activeGraphId!
              : graphs[0].id,
          };
      }
    }
  } catch {
    // Fall through to the legacy document or example graph.
  }
  const graph: SavedGraph = {
    id: makeId("graph"),
    project: "Personal",
    archived: false,
    document: loadDocument(),
  };
  return { graphs: [graph], activeGraphId: graph.id };
};

const initialLibrary = loadGraphLibrary();

const persistGraphLibrary = (graphs: SavedGraph[], activeGraphId: string) => {
  try {
    localStorage.setItem(
      GRAPH_LIBRARY_KEY,
      JSON.stringify(
        graphs.map((graph) => ({
          id: graph.id,
          project: graph.project,
          archived: graph.archived,
          document: normalizeDocument(graph.document),
        })),
      ),
    );
    localStorage.setItem(ACTIVE_GRAPH_KEY, activeGraphId);
    return true;
  } catch {
    return false;
  }
};

export type DocumentSnapshot = Pick<
  GraphDocument,
  "name" | "nodes" | "edges" | "models" | "defaults" | "viewport"
>;
const snapshotOf = (document: GraphDocument): DocumentSnapshot => {
  const copy = cloneDocument(document);
  return {
    name: copy.name,
    nodes: copy.nodes,
    edges: copy.edges,
    models: copy.models,
    defaults: copy.defaults,
    viewport: copy.viewport,
  };
};
const restoreSnapshot = (
  document: GraphDocument,
  snapshot: DocumentSnapshot,
): GraphDocument => ({
  ...document,
  ...cloneDocument({ ...document, ...snapshot }),
  updatedAt: new Date().toISOString(),
});
const snapshotFor = (
  document: GraphDocument,
  revision: number,
): GraphSnapshot => ({ revision, document: cloneDocument(document) });
const documentsEqual = (left: GraphDocument, right: GraphDocument) =>
  JSON.stringify(left) === JSON.stringify(right);

type OpenGraphState = {
  document: GraphDocument;
  graphs: SavedGraph[];
  activeGraphId: string;
  revision: number;
  past: DocumentSnapshot[];
  future: DocumentSnapshot[];
  transientBefore: GraphDocument | null;
  appearance: Appearance;
  selected: { id: string; kind: "node" | "edge" } | null;
  settingsOpen: boolean;
  activeTool: "select" | "node" | "note" | "connect";
  saveStatus: "saved" | "error";
  toast: string | null;
  commit: (mutator: (document: GraphDocument) => GraphDocument) => void;
  transact: (
    mutator: (document: GraphDocument) => GraphDocument,
    origin?: "local" | "mcp",
  ) => GraphSnapshot;
  setNodesLive: (nodes: GraphNode[]) => void;
  setEdgesLive: (edges: GraphEdge[]) => void;
  updateViewport: (viewport: GraphDocument["viewport"]) => void;
  setSelected: (selected: OpenGraphState["selected"]) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveTool: (tool: OpenGraphState["activeTool"]) => void;
  setAppearance: (appearance: Appearance) => void;
  setToast: (toast: string | null) => void;
  addNode: (node: GraphNode) => void;
  addEdgeFromConnection: (connection: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  undo: () => void;
  redo: () => void;
  applyExternalOperations: (
    baseRevision: number,
    operations: GraphOperation[],
  ) => GraphSnapshot;
  layoutExternal: (params: LayoutGraphParams) => GraphSnapshot;
  undoExternal: (baseRevision: number) => {
    changed: boolean;
    snapshot: GraphSnapshot;
  };
  canUndo: () => boolean;
  canRedo: () => boolean;
  replaceDocument: (document: GraphDocument) => void;
  createGraph: (project?: string) => void;
  switchGraph: (id: string) => void;
  renameGraph: (id: string, name: string) => void;
  renameProject: (project: string, name: string) => void;
  archiveGraph: (id: string) => void;
  restoreGraph: (id: string) => void;
};

export const useOpenGraphStore = create<OpenGraphState>((set, get) => ({
  document: initialLibrary.graphs.find(
    (graph) => graph.id === initialLibrary.activeGraphId,
  )!.document,
  graphs: initialLibrary.graphs,
  activeGraphId: initialLibrary.activeGraphId,
  revision: 0,
  past: [],
  future: [],
  transientBefore: null,
  appearance: "system",
  selected: null,
  settingsOpen: false,
  activeTool: "select",
  saveStatus: "saved",
  toast: null,
  commit: (mutator) => {
    get().transact(mutator, "local");
  },
  transact: (mutator, _origin = "local") => {
    let result: GraphSnapshot | undefined;
    set((state) => {
      const previous = state.transientBefore ?? state.document;
      const next = normalizeDocument(mutator(state.document));
      if (
        documentsEqual(next, state.document) &&
        state.transientBefore === null
      ) {
        result = snapshotFor(state.document, state.revision);
        return state;
      }
      const revision = state.revision + 1;
      const graphs = state.graphs.map((graph) =>
        graph.id === state.activeGraphId ? { ...graph, document: next } : graph,
      );
      const saved =
        persistDocument(next) &&
        persistGraphLibrary(graphs, state.activeGraphId);
      result = snapshotFor(next, revision);
      return {
        document: next,
        graphs,
        revision,
        past: [...state.past.slice(-49), snapshotOf(previous)],
        future: [],
        transientBefore: null,
        saveStatus: saved ? "saved" : "error",
      };
    });
    return result!;
  },
  setNodesLive: (nodes) =>
    set((state) => ({
      document: { ...state.document, nodes },
      transientBefore: state.transientBefore ?? cloneDocument(state.document),
    })),
  setEdgesLive: (edges) =>
    set((state) => ({
      document: { ...state.document, edges },
      transientBefore: state.transientBefore ?? cloneDocument(state.document),
    })),
  updateViewport: (viewport) => {
    get().transact((document) => ({ ...document, viewport }), "local");
  },
  setSelected: (selected) => set({ selected }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setAppearance: (appearance) => set({ appearance }),
  setToast: (toast) => set({ toast }),
  addNode: (node) =>
    get().commit((document) => {
      const nextNode = node.data.kind === 'workflow' && node.data.modelOverride === null
        ? { ...node, data: { ...node.data, modelOverride: document.defaults.model } }
        : node
      return { ...document, nodes: [...document.nodes, nextNode] }
    }),
  addEdgeFromConnection: (connection) =>
    get().commit((document) => {
      const direction: EdgeDirection =
        connection.source === connection.target ? "loop" : "directed";
      return {
        ...document,
        edges: [...document.edges, createEdge(connection, direction)],
      };
    }),
  deleteSelected: () => {
    const selection = get().selected;
    if (!selection) return;
    get().commit((document) =>
      selection.kind === "node"
        ? {
            ...document,
            nodes: document.nodes.filter((node) => node.id !== selection.id),
            edges: document.edges.filter(
              (edge) =>
                edge.source !== selection.id && edge.target !== selection.id,
            ),
          }
        : {
            ...document,
            edges: document.edges.filter((edge) => edge.id !== selection.id),
          },
    );
    set({ selected: null });
  },
  duplicateSelected: () => {
    const selection = get().selected;
    if (!selection || selection.kind !== "node") return;
    const node = get().document.nodes.find((item) => item.id === selection.id);
    if (!node) return;
    const clone: GraphNode = {
      ...node,
      id: makeId(node.type === "annotation" ? "note" : "node"),
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      selected: false,
    };
    get().addNode(clone);
    set({ selected: { id: clone.id, kind: "node" } });
  },
  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      const document = restoreSnapshot(state.document, previous);
      const revision = state.revision + 1;
      const graphs = state.graphs.map((graph) =>
        graph.id === state.activeGraphId ? { ...graph, document } : graph,
      );
      const saved =
        persistDocument(document) &&
        persistGraphLibrary(graphs, state.activeGraphId);
      return {
        document,
        graphs,
        revision,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state.document), ...state.future],
        transientBefore: null,
        saveStatus: saved ? "saved" : "error",
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      const document = restoreSnapshot(state.document, next);
      const revision = state.revision + 1;
      const graphs = state.graphs.map((graph) =>
        graph.id === state.activeGraphId ? { ...graph, document } : graph,
      );
      const saved =
        persistDocument(document) &&
        persistGraphLibrary(graphs, state.activeGraphId);
      return {
        document,
        graphs,
        revision,
        past: [...state.past, snapshotOf(state.document)],
        future: state.future.slice(1),
        transientBefore: null,
        saveStatus: saved ? "saved" : "error",
      };
    }),
  applyExternalOperations: (baseRevision, operations) => {
    const state = get();
    if (!Number.isInteger(baseRevision) || baseRevision !== state.revision) {
      const error = Object.assign(
        new Error(`Revision conflict: expected ${state.revision}`),
        {
          code: "REVISION_CONFLICT",
          currentRevision: state.revision,
          snapshot: snapshotFor(state.document, state.revision),
        },
      );
      throw error;
    }
    return get().transact(
      (document) => applyCompanionOperations(document, operations),
      "mcp",
    );
  },
  layoutExternal: (params) => {
    const state = get();
    if (
      !Number.isInteger(params.baseRevision) ||
      params.baseRevision !== state.revision
    ) {
      const error = Object.assign(
        new Error(`Revision conflict: expected ${state.revision}`),
        {
          code: "REVISION_CONFLICT",
          currentRevision: state.revision,
          snapshot: snapshotFor(state.document, state.revision),
        },
      );
      throw error;
    }
    return get().transact(
      (document) => layoutDocument(document, params),
      "mcp",
    );
  },
  undoExternal: (baseRevision) => {
    const state = get();
    if (!Number.isInteger(baseRevision) || baseRevision !== state.revision) {
      const error = Object.assign(
        new Error(`Revision conflict: expected ${state.revision}`),
        {
          code: "REVISION_CONFLICT",
          currentRevision: state.revision,
          snapshot: snapshotFor(state.document, state.revision),
        },
      );
      throw error;
    }
    const changed = state.past.length > 0;
    get().undo();
    return { changed, snapshot: snapshotFor(get().document, get().revision) };
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  replaceDocument: (document) =>
    set((state) => {
      const next = normalizeDocument(document);
      const graphs = state.graphs.map((graph) =>
        graph.id === state.activeGraphId ? { ...graph, document: next } : graph,
      );
      return {
        document: next,
        graphs,
        revision: 0,
        past: [],
        future: [],
        transientBefore: null,
      };
    }),
  createGraph: (project) =>
    set((state) => {
      const graph: SavedGraph = {
        id: makeId("graph"),
        project:
          project?.trim() ||
          state.graphs.find((item) => item.id === state.activeGraphId)
            ?.project ||
          "Personal",
        archived: false,
        document: makeBlankDocument(),
      };
      const graphs = [...state.graphs, graph];
      const saved =
        persistDocument(graph.document) &&
        persistGraphLibrary(graphs, graph.id);
      return {
        document: graph.document,
        graphs,
        activeGraphId: graph.id,
        revision: state.revision + 1,
        past: [],
        future: [],
        transientBefore: null,
        selected: null,
        settingsOpen: false,
        activeTool: "select",
        saveStatus: saved ? "saved" : "error",
      };
    }),
  switchGraph: (id) =>
    set((state) => {
      const graph = state.graphs.find((item) => item.id === id);
      if (!graph || graph.archived || graph.id === state.activeGraphId)
        return state;
      const saved =
        persistDocument(graph.document) &&
        persistGraphLibrary(state.graphs, graph.id);
      return {
        document: graph.document,
        activeGraphId: graph.id,
        revision: state.revision + 1,
        past: [],
        future: [],
        transientBefore: null,
        selected: null,
        settingsOpen: false,
        activeTool: "select",
        saveStatus: saved ? "saved" : "error",
      };
    }),
  renameGraph: (id, name) =>
    set((state) => {
      const nextName = name.trim() || "Untitled graph";
      const updatedAt = new Date().toISOString();
      const graphs = state.graphs.map((graph) =>
        graph.id === id
          ? {
              ...graph,
              document: { ...graph.document, name: nextName, updatedAt },
            }
          : graph,
      );
      const active = id === state.activeGraphId;
      const document = active
        ? { ...state.document, name: nextName, updatedAt }
        : state.document;
      const saved =
        (!active || persistDocument(document)) &&
        persistGraphLibrary(graphs, state.activeGraphId);
      return {
        document,
        graphs,
        revision: active ? state.revision + 1 : state.revision,
        saveStatus: saved ? "saved" : "error",
      };
    }),
  renameProject: (project, name) =>
    set((state) => {
      const nextProject = name.trim() || "Untitled project";
      const graphs = state.graphs.map((graph) =>
        graph.project === project ? { ...graph, project: nextProject } : graph,
      );
      const saved = persistGraphLibrary(graphs, state.activeGraphId);
      return { graphs, saveStatus: saved ? "saved" : "error" };
    }),
  archiveGraph: (id) =>
    set((state) => {
      const target = state.graphs.find((graph) => graph.id === id);
      if (!target || target.archived) return state;
      let graphs = state.graphs.map((graph) =>
        graph.id === id ? { ...graph, archived: true } : graph,
      );
      let activeGraphId = state.activeGraphId;
      let document = state.document;
      if (id === state.activeGraphId) {
        const next = graphs.find((graph) => !graph.archived);
        if (next) {
          activeGraphId = next.id;
          document = next.document;
        } else {
          const replacement: SavedGraph = {
            id: makeId("graph"),
            project: "Personal",
            archived: false,
            document: makeBlankDocument(),
          };
          graphs = [...graphs, replacement];
          activeGraphId = replacement.id;
          document = replacement.document;
        }
      }
      const saved =
        persistDocument(document) && persistGraphLibrary(graphs, activeGraphId);
      return {
        document,
        graphs,
        activeGraphId,
        revision: state.revision + 1,
        past: [],
        future: [],
        transientBefore: null,
        selected: null,
        settingsOpen: false,
        activeTool: "select",
        saveStatus: saved ? "saved" : "error",
      };
    }),
  restoreGraph: (id) =>
    set((state) => {
      const graphs = state.graphs.map((graph) =>
        graph.id === id ? { ...graph, archived: false } : graph,
      );
      const saved = persistGraphLibrary(graphs, state.activeGraphId);
      return { graphs, saveStatus: saved ? "saved" : "error" };
    }),
}));

export const persistDocument = (document: GraphDocument) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeDocument(document)),
    );
    return true;
  } catch {
    return false;
  }
};

export const getRecoveryDocument = () => {
  try {
    return localStorage.getItem(RECOVERY_KEY);
  } catch {
    return null;
  }
};

export {
  STORAGE_KEY,
  RECOVERY_KEY,
  GRAPH_LIBRARY_KEY,
  ACTIVE_GRAPH_KEY,
  MODEL_PREFERENCES_KEY,
  MODEL_IDS,
};
