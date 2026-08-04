import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnnotationNode, createWorkflowNode } from "./graphUtils";
import {
  ACTIVE_GRAPH_KEY,
  getRecoveryDocument,
  GRAPH_LIBRARY_KEY,
  loadDocument,
  makeInitialDocument,
  MODEL_IDS,
  persistDocument,
  RECOVERY_KEY,
  STORAGE_KEY,
  useOpenGraphStore,
} from "./store";

describe("OpenGraph store", () => {
  beforeEach(() => {
    localStorage.clear();
    useOpenGraphStore.getState().replaceDocument(makeInitialDocument());
    useOpenGraphStore.setState({
      past: [],
      future: [],
      selected: null,
      settingsOpen: false,
      activeTool: "select",
      appearance: "system",
      saveStatus: "saved",
      toast: null,
    });
  });

  it("normalizes invalid model settings and keeps a usable default", () => {
    const state = useOpenGraphStore.getState();
    state.commit((doc) => ({
      ...doc,
      models: doc.models.map((model) =>
        model.id === doc.defaults.model ? { ...model, enabled: false } : model,
      ),
      defaults: { model: "gpt-5.6-sol", reasoning: "invalid" } as never,
      nodes: doc.nodes.map((node) =>
        node.type === "workflow"
          ? {
              ...node,
              data: {
                ...(node.data as Extract<
                  typeof node.data,
                  { kind: "workflow" }
                >),
                modelOverride: "not-a-model" as never,
                reasoningOverride: "invalid" as never,
              },
            }
          : node,
      ),
    }));
    const next = useOpenGraphStore.getState().document;
    expect(
      next.models.find((model) => model.id === next.defaults.model)?.enabled,
    ).toBe(true);
    expect(next.defaults.reasoning).toBe("medium");
    expect(
      next.nodes
        .filter((node) => node.type === "workflow")
        .every((node) => {
          const data = node.data as Extract<
            typeof node.data,
            { kind: "workflow" }
          >;
          return data.modelOverride === null && data.reasoningOverride === null;
        }),
    ).toBe(true);
  });

  it("records changes and supports all primary graph operations", () => {
    const store = useOpenGraphStore.getState();
    const start = store.document.nodes.length;
    const node = createWorkflowNode({ x: 10, y: 10 });
    const note = createAnnotationNode({ x: 20, y: 20 });
    store.addNode(node);
    store.addNode(note);
    const addedWorkflow = useOpenGraphStore.getState().document.nodes.find((item) => item.id === node.id)!;
    expect(addedWorkflow.data.kind === 'workflow' && addedWorkflow.data.modelOverride).toBe(
      useOpenGraphStore.getState().document.defaults.model,
    );
    store.addEdgeFromConnection({ source: node.id, target: node.id });
    store.addEdgeFromConnection({
      source: node.id,
      target: "destination",
      sourceHandle: "source",
      targetHandle: "target",
    });
    expect(useOpenGraphStore.getState().document.nodes).toHaveLength(start + 2);
    expect(
      useOpenGraphStore
        .getState()
        .document.edges.slice(-2)
        .map((edge) => edge.data?.direction),
    ).toEqual(["loop", "directed"]);
    store.setNodesLive(useOpenGraphStore.getState().document.nodes);
    store.setEdgesLive(useOpenGraphStore.getState().document.edges);
    store.updateViewport({ x: 10, y: 20, zoom: 1.2 });
    store.setSelected({ id: note.id, kind: "node" });
    store.duplicateSelected();
    expect(useOpenGraphStore.getState().document.nodes).toHaveLength(start + 3);
    expect(useOpenGraphStore.getState().selected?.kind).toBe("node");
    store.setSelected({ id: node.id, kind: "node" });
    store.duplicateSelected();
    store.setSelected({ id: "missing", kind: "node" });
    store.duplicateSelected();
    store.setSelected({
      id: useOpenGraphStore.getState().document.edges.at(-1)!.id,
      kind: "edge",
    });
    store.duplicateSelected();
    store.deleteSelected();
    expect(useOpenGraphStore.getState().selected).toBeNull();
    store.deleteSelected();
    store.setSelected({ id: note.id, kind: "node" });
    store.deleteSelected();
    expect(
      useOpenGraphStore
        .getState()
        .document.nodes.some((item) => item.id === note.id),
    ).toBe(false);
  });

  it("supports undo, redo, capability checks, and UI state actions", () => {
    const store = useOpenGraphStore.getState();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    store.setSettingsOpen(true);
    store.setActiveTool("connect");
    store.setAppearance("dark");
    store.setToast("Saved");
    store.setSelected(null);
    store.setViewportLive({ x: 25, y: 35, zoom: 1.1 });
    expect(useOpenGraphStore.getState().document.viewport).toEqual({
      x: 25,
      y: 35,
      zoom: 1.1,
    });
    expect(store.canUndo()).toBe(false);
    expect(useOpenGraphStore.getState()).toMatchObject({
      settingsOpen: true,
      activeTool: "connect",
      appearance: "dark",
      toast: "Saved",
    });
    store.addNode(createWorkflowNode({ x: 10, y: 10 }));
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.canRedo()).toBe(true);
    store.redo();
    store.undo();
    store.undo();
    expect(useOpenGraphStore.getState().document.nodes).toHaveLength(
      makeInitialDocument().nodes.length,
    );
    store.undo();
    store.redo();
    store.redo();
    expect(store.canRedo()).toBe(false);
  });

  it("keeps MCP revisions atomic and restores viewport through remote undo", () => {
    const store = useOpenGraphStore.getState();
    const firstRevision = store.revision;
    const nodeId = store.document.nodes[0].id;
    const applied = store.applyExternalOperations(firstRevision, [
      { type: "set_name", name: "MCP graph" },
      { type: "update_node", id: nodeId, patch: { title: "MCP step" } },
      { type: "set_viewport", viewport: { x: 40, y: 80, zoom: 1.1 } },
    ]);
    expect(applied.revision).toBe(firstRevision + 1);
    expect(useOpenGraphStore.getState().document.name).toBe("MCP graph");
    expect(useOpenGraphStore.getState().document.viewport).toEqual({
      x: 40,
      y: 80,
      zoom: 1.1,
    });
    expect(() =>
      useOpenGraphStore
        .getState()
        .applyExternalOperations(firstRevision, [
          { type: "set_name", name: "stale" },
        ]),
    ).toThrow(/Revision conflict/);
    expect(useOpenGraphStore.getState().document.name).toBe("MCP graph");
    const undone = useOpenGraphStore.getState().undoExternal(applied.revision);
    expect(undone.changed).toBe(true);
    expect(undone.snapshot.document.name).toBe("Workflow");
    expect(undone.snapshot.document.viewport).toEqual(
      makeInitialDocument().viewport,
    );

    const unchangedRevision = useOpenGraphStore.getState().revision;
    useOpenGraphStore.getState().commit((document) => document);
    expect(useOpenGraphStore.getState().revision).toBe(unchangedRevision);
    const laidOut = useOpenGraphStore
      .getState()
      .layoutExternal({
        baseRevision: unchangedRevision,
        direction: "down",
        columns: 2,
      });
    expect(laidOut.revision).toBe(unchangedRevision + 1);
    expect(
      useOpenGraphStore.getState().document.nodes[1].position.y,
    ).toBeGreaterThan(
      useOpenGraphStore.getState().document.nodes[0].position.y,
    );
    expect(() =>
      useOpenGraphStore
        .getState()
        .layoutExternal({
          baseRevision: unchangedRevision,
          direction: "right",
        }),
    ).toThrow(/Revision conflict/);
    expect(() =>
      useOpenGraphStore.getState().undoExternal(unchangedRevision),
    ).toThrow(/Revision conflict/);
  });

  it("keeps editing available when a confirmed transaction cannot persist", () => {
    const store = useOpenGraphStore.getState();
    const setItem = localStorage.setItem;
    localStorage.setItem = (() => {
      throw new Error("quota");
    }) as typeof localStorage.setItem;
    store.setEdgesLive(store.document.edges);
    store.setEdgesLive(store.document.edges);
    store.addNode(createWorkflowNode({ x: 12, y: 12 }));
    const nodes = useOpenGraphStore.getState().document.nodes;
    store.setNodesLive(nodes);
    store.setNodesLive(nodes);
    store.undo();
    store.redo();
    expect(useOpenGraphStore.getState().saveStatus).toBe("error");
    localStorage.setItem = setItem;
  });

  it("replaces a document through the integrity boundary", () => {
    const store = useOpenGraphStore.getState();
    store.addNode(createWorkflowNode({ x: 1, y: 1 }));
    const replacement = makeInitialDocument();
    replacement.models = replacement.models.map((model) => ({
      ...model,
      enabled: false,
    }));
    store.replaceDocument(replacement);
    expect(useOpenGraphStore.getState().past).toHaveLength(0);
    expect(
      useOpenGraphStore
        .getState()
        .document.models.some((model) => model.enabled),
    ).toBe(true);
  });

  it("keeps multiple local graphs and switches between their titled documents", () => {
    const store = useOpenGraphStore.getState();
    store.commit((document) => ({ ...document, name: "First graph" }));
    const firstGraphId = useOpenGraphStore.getState().activeGraphId;
    const initialCount = useOpenGraphStore.getState().graphs.length;

    store.createGraph();
    const secondGraphId = useOpenGraphStore.getState().activeGraphId;
    expect(secondGraphId).not.toBe(firstGraphId);
    expect(useOpenGraphStore.getState().graphs).toHaveLength(initialCount + 1);
    store.commit((document) => ({ ...document, name: "Second graph" }));
    store.renameProject("Personal", "Client work");
    expect(
      useOpenGraphStore
        .getState()
        .graphs.every((graph) => graph.project === "Client work"),
    ).toBe(true);

    store.switchGraph(firstGraphId);
    expect(useOpenGraphStore.getState().document.name).toBe("First graph");
    store.switchGraph(secondGraphId);
    expect(useOpenGraphStore.getState().document.name).toBe("Second graph");
    expect(localStorage.getItem(ACTIVE_GRAPH_KEY)).toBe(secondGraphId);
    const persistedLibrary = JSON.parse(
      localStorage.getItem(GRAPH_LIBRARY_KEY) ?? "[]",
    );
    expect(persistedLibrary).toHaveLength(initialCount + 1);
    expect(
      persistedLibrary.every(
        (graph: { project: string }) => graph.project === "Client work",
      ),
    ).toBe(true);
  });

  it("loads empty, valid, malformed, and unrecoverable storage", () => {
    expect(loadDocument().name).toBe("Workflow");
    const saved = makeInitialDocument();
    saved.name = "Saved graph";
    expect(persistDocument(saved)).toBe(true);
    expect(loadDocument().name).toBe("Saved graph");

    const invalid = JSON.stringify({
      version: 2,
      nodes: [],
      edges: [],
      defaults: { model: "gpt-5.6-terra" },
    });
    localStorage.setItem(STORAGE_KEY, invalid);
    expect(loadDocument().name).toBe("Workflow");
    expect(getRecoveryDocument()).toBe(invalid);

    localStorage.setItem(STORAGE_KEY, "{broken");
    expect(loadDocument().name).toBe("Workflow");

    const setItem = localStorage.setItem;
    localStorage.setItem = (() => {
      throw new Error("storage unavailable");
    }) as typeof localStorage.setItem;
    expect(loadDocument().name).toBe("Workflow");
    localStorage.setItem = setItem;
  });

  it("persists normalized documents and handles write/read failures", () => {
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({});
    expect(persistDocument(makeInitialDocument())).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      version: 1,
      name: "Workflow",
    });
    const setItem = localStorage.setItem;
    localStorage.setItem = (() => {
      throw new Error("quota");
    }) as typeof localStorage.setItem;
    expect(persistDocument(makeInitialDocument())).toBe(false);
    localStorage.setItem = setItem;
    const getItem = localStorage.getItem;
    localStorage.getItem = (() => {
      throw new Error("blocked");
    }) as typeof localStorage.getItem;
    expect(getRecoveryDocument()).toBeNull();
    localStorage.getItem = getItem;
    expect(MODEL_IDS).toContain("codex/gpt-5.6-sol");
    expect(MODEL_IDS).toContain("claude-code/claude-opus-4.8");
    expect(MODEL_IDS).toContain("kimi-code/k3");
    expect(RECOVERY_KEY).toBe("opengraph.recovery");
  });
});
