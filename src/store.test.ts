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

  it("ignores duplicate connections and reports whether an edge was added", () => {
    const store = useOpenGraphStore.getState();
    const a = createWorkflowNode({ x: 0, y: 0 });
    const b = createWorkflowNode({ x: 200, y: 0 });
    store.addNode(a);
    store.addNode(b);
    const before = useOpenGraphStore.getState().document.edges.length;
    expect(store.addEdgeFromConnection({ source: a.id, target: b.id })).toBe(
      true,
    );
    const revisionAfterAdd = useOpenGraphStore.getState().revision;
    expect(store.addEdgeFromConnection({ source: a.id, target: b.id })).toBe(
      false,
    );
    expect(useOpenGraphStore.getState().document.edges).toHaveLength(
      before + 1,
    );
    expect(useOpenGraphStore.getState().revision).toBe(revisionAfterAdd);
    expect(store.addEdgeFromConnection({ source: b.id, target: a.id })).toBe(
      true,
    );
    expect(store.addEdgeFromConnection({ source: a.id, target: a.id })).toBe(
      true,
    );
    expect(store.addEdgeFromConnection({ source: a.id, target: a.id })).toBe(
      false,
    );
    expect(useOpenGraphStore.getState().document.edges).toHaveLength(
      before + 3,
    );
  });

  it("quick-adds a wired step from a plain sentence in one undo step", () => {
    const store = useOpenGraphStore.getState();
    expect(store.quickAddStep("   ", { x: 0, y: 0 })).toBeNull();
    expect(useOpenGraphStore.getState().past).toHaveLength(0);

    const anchor = createWorkflowNode({ x: 40, y: 400 }, "Fetch sources");
    store.addNode(anchor);
    store.setSelected({ id: anchor.id, kind: "node" });
    const historyBefore = useOpenGraphStore.getState().past.length;
    const addedId = store.quickAddStep(
      "summarize each source and collect quotes",
      { x: 0, y: 0 },
    );
    const state = useOpenGraphStore.getState();
    const added = state.document.nodes.find((node) => node.id === addedId)!;
    expect(added.data.kind === "workflow" && added.data.title).toBe(
      "Summarize each source and collect quotes",
    );
    expect(added.position).toEqual({ x: 326, y: 400 });
    expect(
      state.document.edges.some(
        (edge) => edge.source === anchor.id && edge.target === addedId,
      ),
    ).toBe(true);
    expect(state.selected).toEqual({ id: addedId, kind: "node" });
    expect(state.past).toHaveLength(historyBefore + 1);
    store.undo();
    const undone = useOpenGraphStore.getState().document;
    expect(undone.nodes.some((node) => node.id === addedId)).toBe(false);
    expect(undone.edges.some((edge) => edge.target === addedId)).toBe(false);
  });

  it("quick-adds unwired steps at a free spot near the fallback position", () => {
    const store = useOpenGraphStore.getState();
    const long =
      "plan the launch checklist including owners, deadlines, and rollback steps";
    const firstId = store.quickAddStep(long, { x: 120, y: 620 })!;
    useOpenGraphStore.getState().setSelected(null);
    const secondId = useOpenGraphStore
      .getState()
      .quickAddStep("review it", { x: 120, y: 620 })!;
    const nodes = useOpenGraphStore.getState().document.nodes;
    const first = nodes.find((node) => node.id === firstId)!;
    const second = nodes.find((node) => node.id === secondId)!;
    expect(first.position).toEqual({ x: 120, y: 620 });
    expect(second.position.y).toBeGreaterThan(first.position.y);
    expect(
      first.data.kind === "workflow" && first.data.title.endsWith("…"),
    ).toBe(true);
    expect(first.data.kind === "workflow" && first.data.description).toBe(
      "Plan the launch checklist including owners, deadlines, and rollback steps",
    );
    expect(second.data.kind === "workflow" && second.data.title).toBe(
      "Review it",
    );
    expect(second.data.kind === "workflow" && second.data.description).toBe("");
    expect(
      useOpenGraphStore
        .getState()
        .document.edges.some(
          (edge) => edge.target === firstId || edge.target === secondId,
        ),
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
    const setItemSpy = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    store.setEdgesLive(store.document.edges);
    store.setEdgesLive(store.document.edges);
    store.addNode(createWorkflowNode({ x: 12, y: 12 }));
    const nodes = useOpenGraphStore.getState().document.nodes;
    store.setNodesLive(nodes);
    store.setNodesLive(nodes);
    store.undo();
    store.redo();
    expect(useOpenGraphStore.getState().saveStatus).toBe("error");
    setItemSpy.mockRestore();
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

  it("imports a document as a new graph in the active project", () => {
    const store = useOpenGraphStore.getState();
    const before = useOpenGraphStore.getState().graphs.length;
    const previousActive = useOpenGraphStore.getState().activeGraphId;
    store.importGraph({ ...makeInitialDocument(), name: "Imported flow" });
    const state = useOpenGraphStore.getState();
    expect(state.graphs).toHaveLength(before + 1);
    const added = state.graphs.at(-1)!;
    expect(state.activeGraphId).toBe(added.id);
    expect(state.activeGraphId).not.toBe(previousActive);
    expect(state.document.name).toBe("Imported flow");
    expect(added.project).toBe("Personal");
    expect(state.past).toHaveLength(0);
    expect(state.selected).toBeNull();
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

    const setItemSpy = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    expect(loadDocument().name).toBe("Workflow");
    setItemSpy.mockRestore();
  });

  it("persists normalized documents and handles write/read failures", () => {
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({});
    expect(persistDocument(makeInitialDocument())).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      version: 1,
      name: "Workflow",
    });
    const setItemSpy = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(persistDocument(makeInitialDocument())).toBe(false);
    setItemSpy.mockRestore();
    const getItemSpy = vi
      .spyOn(localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(getRecoveryDocument()).toBeNull();
    getItemSpy.mockRestore();
    expect(MODEL_IDS).toContain("codex/gpt-5.6-sol");
    expect(MODEL_IDS).toContain("claude-code/claude-opus-4.8");
    expect(MODEL_IDS).toContain("kimi-code/k3");
    expect(RECOVERY_KEY).toBe("opengraph.recovery");
  });
});
