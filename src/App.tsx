import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnnotationNode, WorkflowEdge, WorkflowNode } from "./components";
import {
  createAnnotationNode,
  createEdge,
  createWorkflowNode,
  getModelOptions,
  getReasoningOptions,
  selectNodeModel,
  toggleEdgeDirection,
} from "./graphUtils";
import { copyBlobToClipboard, downloadBlob, renderGraphToBlob } from "./export";
import { MODEL_PREFERENCES_KEY, useOpenGraphStore } from "./store";
import type {
  Appearance,
  GraphEdge,
  GraphNode,
  ModelId,
  ModelDefinition,
  Reasoning,
  ProviderId,
} from "./types";
import { modelColor, modelLabel, reasoningLabel } from "./types";
import { MODEL_CATALOG, PROVIDERS, inferredProvider, modelsForProviders, providerName } from './modelCatalog'
import { organizeGraphDocument } from "./organize";

const groupModels = (models: ModelDefinition[]) => models.reduce<Record<string, ModelDefinition[]>>((groups, model) => {
  const provider = inferredProvider(model)
  groups[provider] = [...(groups[provider] ?? []), model]
  return groups
}, {})
import {
  createCompanionBridge,
  readSessionToken,
  type CompanionBridge,
} from "./companion/bridge";
import type {
  ActiveContext,
  ApplyGraphOperationsParams,
  GraphOperation,
  GraphSnapshot,
  LayoutGraphParams,
  UndoParams,
} from "./companion/protocol";

const nodeTypes = { workflow: WorkflowNode, annotation: AnnotationNode };
const edgeTypes = { workflow: WorkflowEdge };

function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "is-active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Icon({
  name,
  size = 18,
}: {
  name:
    | "undo"
    | "redo"
    | "sun"
    | "moon"
    | "copy"
    | "controls"
    | "select"
    | "node"
    | "note"
    | "close"
    | "delete"
    | "connect"
    | "folder"
    | "plus"
    | "archive"
    | "restore"
    | "organize";
  size?: number;
}) {
  const paths = {
    undo: (
      <path d="M9 7H4m0 0 3-3M4 7c6.8-3.4 12.7-.2 12.7 5.1 0 3.1-2.2 5.5-5.4 5.9" />
    ),
    redo: (
      <path d="M15 7h5m0 0-3-3m3 3c-6.8-3.4-12.7-.2-12.7 5.1 0 3.1 2.2 5.5 5.4 5.9" />
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </>
    ),
    moon: (
      <path d="M19.5 14.8A7.8 7.8 0 0 1 9.2 4.5 8.2 8.2 0 1 0 19.5 14.8Z" />
    ),
    copy: (
      <>
        <rect x="8" y="8" width="10" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    controls: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="9" cy="6" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="7" cy="18" r="2" />
      </>
    ),
    select: (
      <>
        <path d="m5 4 11 8-5 1-2 5Z" />
        <path d="m14 14 4 4" />
      </>
    ),
    node: <rect x="4" y="4" width="16" height="16" rx="3" />,
    note: <path d="m5 7 14-2-3 12-14 2Z" />,
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    delete: (
      <>
        <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13" />
        <path d="M10 11v5m4-5v5" />
      </>
    ),
    connect: (
      <>
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="m8.2 11 7.6-4M8.2 13l7.6 4" />
      </>
    ),
    folder: (
      <path d="M3.5 6.8c0-1 .8-1.8 1.8-1.8h4l1.7 2h7.7c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8Z" />
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    archive: (
      <>
        <path d="M4 7h16v12H4zM3 4h18v3H3z" />
        <path d="M10 12h4" />
      </>
    ),
    restore: (
      <>
        <path d="M4 7h16v12H4zM3 4h18v3H3z" />
        <path d="m10 13 2-2 2 2m-2-2v5" />
      </>
    ),
    organize: (
      <>
        <rect x="4" y="5" width="5" height="5" rx="1" />
        <rect x="15" y="5" width="5" height="5" rx="1" />
        <rect x="15" y="15" width="5" height="5" rx="1" />
        <path d="M9 7.5h4M12 7.5v10h3" />
      </>
    ),
  }[name];
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

function App() {
  const {
    document,
    graphs,
    activeGraphId,
    revision,
    selected,
    settingsOpen,
    activeTool,
    saveStatus,
    toast,
    past,
    future,
    appearance,
    commit,
    setNodesLive,
    setEdgesLive,
    setViewportLive,
    updateViewport,
    setSelected,
    setSettingsOpen,
    setActiveTool,
    setAppearance,
    setToast,
    addNode,
    addEdgeFromConnection,
    deleteSelected,
    duplicateSelected,
    undo,
    redo,
    applyExternalOperations,
    layoutExternal,
    undoExternal,
    createGraph,
    switchGraph,
    renameGraph,
    renameProject,
    archiveGraph,
    restoreGraph,
  } = useOpenGraphStore();
  const { screenToFlowPosition, fitView, getViewport, setViewport } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const companionRef = useRef<CompanionBridge | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [copying, setCopying] = useState(false);
  const [pendingExport, setPendingExport] = useState<Blob | null>(null);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [companionState, setCompanionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [graphQuery, setGraphQuery] = useState("");
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [editingGraph, setEditingGraph] = useState<string | null>(null);
  const [editingGraphName, setEditingGraphName] = useState("");
  const [onboardingOpen, setOnboardingOpen] = useState(() => localStorage.getItem('opengraph.onboarding.v1') !== 'done');
  const [onboardingProviders, setOnboardingProviders] = useState<ProviderId[]>(['codex']);
  const [organizationRevision, setOrganizationRevision] = useState<number | null>(null);
  const [organizationToast, setOrganizationToast] = useState<string | null>(null);
  const skipViewportCommitUntilRef = useRef(0);
  const graphRenameCancelledRef = useRef(false);
  const graphSearchRef = useRef<HTMLInputElement>(null);
  const selectedNode =
    selected?.kind === "node"
      ? document.nodes.find((node) => node.id === selected.id)
      : undefined;
  const selectedEdge =
    selected?.kind === "edge"
      ? document.edges.find((edge) => edge.id === selected.id)
      : undefined;

  const restoreHistoryViewport = useCallback(() => {
    skipViewportCommitUntilRef.current = Date.now() + 500;
    window.requestAnimationFrame(() => {
      const viewport = useOpenGraphStore.getState().document.viewport;
      void setViewport(viewport, { duration: 200 });
    });
  }, [setViewport]);

  const handleUndo = useCallback(
    (message = "Change undone") => {
      if (!useOpenGraphStore.getState().past.length) return;
      undo();
      setOrganizationRevision(null);
      setOrganizationToast(null);
      setToast(message);
      restoreHistoryViewport();
    },
    [restoreHistoryViewport, setToast, undo],
  );

  const handleRedo = useCallback(() => {
    if (!useOpenGraphStore.getState().future.length) return;
    redo();
    setOrganizationRevision(null);
    setOrganizationToast(null);
    setToast("Change redone");
    restoreHistoryViewport();
  }, [redo, restoreHistoryViewport, setToast]);

  useEffect(() => {
    (
      window as Window & { __opengraphDocument?: typeof document }
    ).__opengraphDocument = document;
  }, [document]);
  useEffect(() => {
    const token = readSessionToken();
    if (!token) return;
    const bridge = createCompanionBridge(
      token,
      {
        getGraph: () => {
          const state = useOpenGraphStore.getState();
          return { revision: state.revision, document: state.document };
        },
        getActiveContext: (): ActiveContext => {
          const state = useOpenGraphStore.getState();
          return {
            revision: state.revision,
            graphName: state.document.name,
            selected: state.selected,
            activeTool: state.activeTool,
            viewport: state.document.viewport,
          };
        },
        applyGraphOperations: (params) => {
          const value = params as ApplyGraphOperationsParams;
          return applyExternalOperations(
            value.baseRevision,
            value.operations as GraphOperation[],
          );
        },
        layoutGraph: (params) => layoutExternal(params as LayoutGraphParams),
        undo: (params) => undoExternal((params as UndoParams).baseRevision),
        renderGraph: async () => {
          const viewport = canvasRef.current?.querySelector(
            ".react-flow__viewport",
          ) as HTMLElement | null;
          if (!viewport)
            throw Object.assign(new Error("Canvas is not ready"), {
              code: "RENDER_FAILED",
            });
          return renderGraphToBlob(
            viewport,
            useOpenGraphStore.getState().document.nodes,
          );
        },
      },
      setCompanionState,
    );
    companionRef.current = bridge;
    bridge.connect();
    return () => {
      bridge.close();
      companionRef.current = null;
    };
  }, [applyExternalOperations, layoutExternal, undoExternal]);
  useEffect(() => {
    companionRef.current?.notifySnapshot(
      { revision, document },
      {
        revision,
        graphName: document.name,
        selected,
        activeTool,
        viewport: document.viewport,
      },
    );
  }, [activeTool, document, revision, selected]);
  useEffect(() => {
    const root = documentElement();
    root.dataset.theme = appearance;
    root.style.colorScheme =
      appearance === "system" ? "light dark" : appearance;
  }, [appearance]);
  useEffect(() => {
    const fitOnNarrow = () => {
      skipViewportCommitUntilRef.current = Date.now() + 250;
      const frame = window.requestAnimationFrame(() =>
        fitView({
          padding: window.innerWidth <= 800 ? 0.18 : 0.14,
          duration: 0,
        }),
      );
      window.setTimeout(() => window.cancelAnimationFrame(frame), 500);
    };
    fitOnNarrow();
    window.addEventListener("resize", fitOnNarrow);
    return () => window.removeEventListener("resize", fitOnNarrow);
  }, [activeGraphId, fitView]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
        return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createGraph();
        setEditingName(true);
      }
      if (command && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
      if (command && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setSidebarOpen(true);
        window.setTimeout(() => graphSearchRef.current?.focus(), 0);
      }
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? handleRedo() : handleUndo();
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();
      }
      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
      if (event.key === "Escape") {
        setActiveTool("select");
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    createGraph,
    deleteSelected,
    duplicateSelected,
    handleRedo,
    handleUndo,
    setActiveTool,
    setSelected,
  ]);
  const onNodesChange = useCallback(
    (changes: NodeChange<GraphNode>[]) => {
      const nodes = applyNodeChanges(
        changes,
        useOpenGraphStore.getState().document.nodes,
      ) as GraphNode[];
      setNodesLive(nodes);
      if (changes.some((change) => change.type === "remove"))
        commit((doc) => ({ ...doc, nodes }));
    },
    [commit, setNodesLive],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<GraphEdge>[]) => {
      const edges = applyEdgeChanges(
        changes,
        useOpenGraphStore.getState().document.edges,
      ) as GraphEdge[];
      setEdgesLive(edges);
      if (changes.some((change) => change.type === "remove"))
        commit((doc) => ({ ...doc, edges }));
    },
    [commit, setEdgesLive],
  );
  const onNodeDragStop: OnNodeDrag<GraphNode> = useCallback(
    (_event, node) =>
      commit((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) =>
          item.id === node.id ? { ...item, position: node.position } : item,
        ),
      })),
    [commit],
  );
  const onConnect = useCallback(
    (connection: Connection) => addEdgeFromConnection(connection),
    [addEdgeFromConnection],
  );
  const beginConnectionFromNode = useCallback(
    (nodeId: string) => {
      setConnectSource(nodeId);
      setActiveTool("connect");
      setSelected(null);
      setToast("Source selected — choose a destination node");
    },
    [setActiveTool, setSelected, setToast],
  );
  useEffect(() => {
    const startConnection = (event: Event) => {
      const nodeId = (event as CustomEvent<unknown>).detail;
      if (typeof nodeId === "string") beginConnectionFromNode(nodeId);
    };
    window.addEventListener("opengraph:start-connection", startConnection);
    return () =>
      window.removeEventListener("opengraph:start-connection", startConnection);
  }, [beginConnectionFromNode]);
  const appendStepFromNode = useCallback(
    (sourceId: string) => {
      const current = useOpenGraphStore.getState().document;
      const source = current.nodes.find((node) => node.id === sourceId);
      if (!source || source.type !== "workflow") return;
      const sourceWidth = source.measured?.width ?? source.width ?? 320;
      const position = {
        x: source.position.x + sourceWidth + 120,
        y: source.position.y,
      };
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const occupied = current.nodes.some(
          (node) =>
            Math.abs(node.position.x - position.x) < 360 &&
            Math.abs(node.position.y - position.y) < 150,
        );
        if (!occupied) break;
        position.y += 180;
      }
      const next = createWorkflowNode(position, "Next step");
      commit((doc) => ({
        ...doc,
        nodes: [...doc.nodes, next],
        edges: [
          ...doc.edges,
          createEdge({
            source: sourceId,
            target: next.id,
            sourceHandle: "source-right",
            targetHandle: "target-left",
          }),
        ],
      }));
      setConnectSource(null);
      setActiveTool("select");
      setSelected({ id: next.id, kind: "node" });
      setToast("Next step added and connected");
    },
    [commit, setActiveTool, setSelected, setToast],
  );
  useEffect(() => {
    const appendStep = (event: Event) => {
      const nodeId = (event as CustomEvent<unknown>).detail;
      if (typeof nodeId === "string") appendStepFromNode(nodeId);
    };
    window.addEventListener("opengraph:append-step", appendStep);
    return () =>
      window.removeEventListener("opengraph:append-step", appendStep);
  }, [appendStepFromNode]);
  useEffect(() => {
    const toggleBidirectional = (event: Event) => {
      const edgeId = (event as CustomEvent<unknown>).detail;
      if (typeof edgeId !== "string") return;
      commit((doc) => ({
        ...doc,
        edges: doc.edges.map((edge) =>
          edge.id === edgeId && edge.data?.direction !== "loop"
            ? toggleEdgeDirection(
                edge,
                edge.data?.direction === "bidirectional"
                  ? "directed"
                  : "bidirectional",
              )
            : edge,
        ),
      }));
    };
    window.addEventListener(
      "opengraph:toggle-bidirectional",
      toggleBidirectional,
    );
    return () =>
      window.removeEventListener(
        "opengraph:toggle-bidirectional",
        toggleBidirectional,
      );
  }, [commit]);
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: GraphNode) => {
      if (activeTool === "connect") {
        if (!connectSource) {
          setConnectSource(node.id);
          setSelected(null);
          setToast("Source selected — choose a destination node");
          return;
        }
        addEdgeFromConnection({ source: connectSource, target: node.id });
        setConnectSource(null);
        setActiveTool("select");
        setToast(connectSource === node.id ? "Loop added" : "Connection added");
        return;
      }
      setSelected({ id: node.id, kind: "node" });
    },
    [
      activeTool,
      addEdgeFromConnection,
      connectSource,
      setActiveTool,
      setSelected,
      setToast,
    ],
  );
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/opengraph-tool");
      if (!type) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const node =
        type === "note"
          ? createAnnotationNode(position)
          : createWorkflowNode(position);
      addNode(node);
      setSelected({ id: node.id, kind: "node" });
      setActiveTool("select");
    },
    [addNode, screenToFlowPosition, setActiveTool, setSelected],
  );
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (
        (event.target as HTMLElement).closest(
          ".react-flow__node, .react-flow__controls, .react-flow__minimap",
        )
      )
        return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const node = createWorkflowNode(position);
      addNode(node);
      setSelected({ id: node.id, kind: "node" });
    },
    [addNode, screenToFlowPosition, setSelected],
  );
  const handleCopy = async () => {
    const viewport = canvasRef.current?.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!viewport) return;
    setCopying(true);
    try {
      const blob = await renderGraphToBlob(viewport, document.nodes);
      if (await copyBlobToClipboard(blob))
        setToast("Graph copied to clipboard");
      else {
        setPendingExport(blob);
        setToast("PNG ready — clipboard access is unavailable");
      }
    } catch {
      setToast("Could not export the graph. Keep editing and try again.");
    } finally {
      setCopying(false);
      window.setTimeout(() => setToast(null), 4200);
    }
  };
  const fit = () => fitView({ padding: 0.18, duration: 200 });
  const organize = useCallback(() => {
    setViewportLive(getViewport());
    const current = useOpenGraphStore.getState().document;
    const result = organizeGraphDocument(current);
    if (result.document === current) {
      setOrganizationRevision(null);
      setOrganizationToast(null);
      setToast("Add a workflow node before organizing the graph");
      return;
    }
    commit(() => result.document);
    setSelected(null);
    setOrganizationRevision(useOpenGraphStore.getState().revision);
    const message = result.connectionsAdded
      ? `${result.connectionsAdded} connection${result.connectionsAdded === 1 ? "" : "s"} added · graph organized`
      : "Graph organized · connections preserved";
    setOrganizationToast(message);
    setToast(message);
    skipViewportCommitUntilRef.current = Date.now() + 500;
    window.requestAnimationFrame(() =>
      fitView({ padding: 0.18, duration: 200 }),
    );
  }, [commit, fitView, getViewport, setSelected, setToast, setViewportLive]);
  const activeGraphs = useMemo(
    () => graphs.filter((graph) => !graph.archived),
    [graphs],
  );
  const archivedGraphs = useMemo(
    () => graphs.filter((graph) => graph.archived),
    [graphs],
  );
  const projects = useMemo(
    () => [...new Set(activeGraphs.map((graph) => graph.project))],
    [activeGraphs],
  );
  const matchingGraphs = useMemo(
    () =>
      activeGraphs.filter((graph) =>
        `${graph.project} ${graph.document.name}`
          .toLowerCase()
          .includes(graphQuery.toLowerCase()),
      ),
    [activeGraphs, graphQuery],
  );
  const matchingArchivedGraphs = useMemo(
    () =>
      archivedGraphs.filter((graph) =>
        `${graph.project} ${graph.document.name}`
          .toLowerCase()
          .includes(graphQuery.toLowerCase()),
      ),
    [archivedGraphs, graphQuery],
  );
  const createProject = () => {
    const base = "New project";
    const project = projects.includes(base)
      ? `${base} ${projects.length + 1}`
      : base;
    createGraph(project);
    setEditingProject(project);
    setEditingProjectName(project);
    setEditingName(true);
  };
  const commitProjectName = (project: string) => {
    const name = editingProjectName.trim();
    if (name && name !== project) renameProject(project, name);
    setEditingProject(null);
  };
  const commitGraphName = (graphId: string) => {
    if (!graphRenameCancelledRef.current)
      renameGraph(graphId, editingGraphName);
    graphRenameCancelledRef.current = false;
    setEditingGraph(null);
  };

  return (
    <div className="app-shell">
      {onboardingOpen && (
        <div className="onboarding-backdrop" role="presentation">
          <section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <div className="onboarding-copy">
              <span className="onboarding-mark" aria-hidden="true">⌁</span>
              <h1 id="onboarding-title">Which model tools do you use?</h1>
              <p>Choose one or more. This only keeps your model list focused; you can change it later.</p>
            </div>
            <div className="provider-options">
              {PROVIDERS.map((provider) => {
                const selected = onboardingProviders.includes(provider.id)
                return <button key={provider.id} className={selected ? 'selected' : ''} aria-pressed={selected} onClick={() => setOnboardingProviders((current) => selected ? current.filter((id) => id !== provider.id) : [...current, provider.id])}>
                  <span>{provider.name}</span><small>{provider.description}</small><i aria-hidden="true">{selected ? '✓' : '+'}</i>
                </button>
              })}
            </div>
            <div className="onboarding-actions">
              <small>No account. Saved only in this browser.</small>
              <button className="primary-button" disabled={!onboardingProviders.length} onClick={() => {
                const models = modelsForProviders(onboardingProviders)
                const enabled = models.find((model) => model.enabled) ?? models[0]
                commit((doc) => ({ ...doc, models, defaults: { ...doc.defaults, model: enabled.id }, nodes: doc.nodes.map((node) => node.data.kind === 'workflow' ? { ...node, data: { ...node.data, modelOverride: null } } : node) }))
                localStorage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify({ models, defaults: { model: enabled.id, reasoning: document.defaults.reasoning } }))
                localStorage.setItem('opengraph.onboarding.v1', 'done')
                setOnboardingOpen(false)
              }}>Start drawing</button>
            </div>
          </section>
        </div>
      )}
      <header className="topbar">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? "Hide graph sidebar" : "Show graph sidebar"}
          title={
            sidebarOpen
              ? "Hide sidebar · Cmd/Ctrl+B"
              : "Show sidebar · Cmd/Ctrl+B"
          }
        >
          ☰
        </button>
        <div className="brand-lockup">
          <svg className="brand-mark" viewBox="0 0 48 44" aria-hidden="true">
            <path d="M24 9 9 35h30L24 9Z" />
            <circle cx="24" cy="9" r="7" />
            <circle cx="9" cy="35" r="7" />
            <circle cx="39" cy="35" r="7" />
          </svg>
          <span className="brand-name">OpenGraph</span>
          <span className="brand-divider" />
          {companionState !== "disconnected" && (
            <span
              className={`companion-status ${companionState}`}
              role="status"
              aria-label={
                companionState === "connected"
                  ? "Codex connected"
                  : "Connecting to Codex"
              }
            >
              {companionState === "connected" ? "Codex linked" : "Connecting…"}
            </span>
          )}
        </div>
        <div className="graph-name-wrap">
          {editingName ? (
            <input
              autoFocus
              className="graph-name-input"
              value={document.name}
              onChange={(event) =>
                commit((doc) => ({ ...doc, name: event.target.value }))
              }
              onBlur={() => setEditingName(false)}
              onKeyDown={(event) =>
                event.key === "Enter" && setEditingName(false)
              }
              aria-label="Graph title"
            />
          ) : (
            <button
              className="graph-title"
              onClick={() => setEditingName(true)}
              aria-label="Rename current graph"
            >
              {document.name}
              <span aria-hidden="true">✎</span>
            </button>
          )}
        </div>
        <div className="topbar-spacer" />
        <button className="organize-button" onClick={organize}>
          <Icon name="organize" size={17} />
          <span>Organize</span>
        </button>
        <div className="history-actions">
          <IconButton label="Undo" onClick={() => handleUndo()} disabled={!past.length}>
            <Icon name="undo" />
          </IconButton>
          <IconButton label="Redo" onClick={handleRedo} disabled={!future.length}>
            <Icon name="redo" />
          </IconButton>
        </div>
        <div className="appearance-switch" role="group" aria-label="Appearance">
          <button
            className={appearance === "light" ? "selected" : ""}
            onClick={() => setAppearance("light")}
            aria-label="Light appearance"
          >
            <Icon name="sun" />
          </button>
          <button
            className={appearance === "dark" ? "selected" : ""}
            onClick={() => setAppearance("dark")}
            aria-label="Dark appearance"
          >
            <Icon name="moon" />
          </button>
        </div>
        <button
          className="primary-button"
          onClick={handleCopy}
          disabled={copying}
          aria-label={copying ? "Preparing graph" : "Copy graph"}
        >
          <Icon name="copy" size={16} />
          <span>{copying ? "Preparing…" : "Copy graph"}</span>
        </button>
        <button
          className="model-settings-button"
          onClick={() => {
            setSettingsOpen(true);
            setSelected(null);
          }}
          aria-label="Configure models and reasoning"
          title="Configure models and reasoning"
        >
          <Icon name="controls" size={17} />
          <span>Models</span>
        </button>
      </header>
      <main className="workspace">
        <aside
          className={`graph-sidebar ${sidebarOpen ? "" : "is-collapsed"}`}
          aria-label="Graphs and projects"
        >
          <div className="graph-sidebar-content">
            <div className="sidebar-actions">
              <button
                className="sidebar-primary"
                onClick={() => {
                  createGraph();
                  setEditingName(true);
                }}
                title="New graph · Cmd/Ctrl+N"
              >
                <span aria-hidden="true">+</span>New graph
              </button>
              <button
                className="sidebar-secondary"
                onClick={createProject}
                title="New project"
              >
                New project
              </button>
            </div>
            <input
              ref={graphSearchRef}
              className="graph-search"
              value={graphQuery}
              onChange={(event) => setGraphQuery(event.target.value)}
              placeholder="Search graphs"
              aria-label="Search graphs"
            />
            <div className="project-list">
              {projects.map((project) => {
                const projectGraphs = matchingGraphs.filter(
                  (graph) => graph.project === project,
                );
                if (!projectGraphs.length) return null;
                return (
                  <section className="project-group" key={project}>
                    <div className="project-heading">
                      {editingProject === project ? (
                        <input
                          autoFocus
                          className="project-name-input"
                          value={editingProjectName}
                          onChange={(event) =>
                            setEditingProjectName(event.target.value)
                          }
                          onBlur={() => commitProjectName(project)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              commitProjectName(project);
                            if (event.key === "Escape") setEditingProject(null);
                          }}
                          aria-label="Project name"
                        />
                      ) : (
                        <button
                          className="project-name"
                          onClick={() => {
                            setEditingProject(project);
                            setEditingProjectName(project);
                          }}
                          title="Rename project"
                        >
                          <Icon name="folder" size={15} />
                          <span>{project}</span>
                        </button>
                      )}
                      <button
                        className="project-add-graph"
                        onClick={() => {
                          createGraph(project);
                          setEditingName(true);
                        }}
                        aria-label={`New graph in ${project}`}
                        title={`New graph in ${project}`}
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                    <div>
                      {projectGraphs.map((graph) => (
                        <div
                          className={`sidebar-graph-row ${graph.id === activeGraphId ? "is-active" : ""}`}
                          key={graph.id}
                        >
                          {editingGraph === graph.id ? (
                            <input
                              autoFocus
                              className="sidebar-graph-name-input"
                              value={editingGraphName}
                              onChange={(event) =>
                                setEditingGraphName(event.target.value)
                              }
                              onBlur={() => commitGraphName(graph.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter")
                                  commitGraphName(graph.id);
                                if (event.key === "Escape") {
                                  graphRenameCancelledRef.current = true;
                                  setEditingGraph(null);
                                }
                              }}
                              aria-label={`Rename ${graph.document.name}`}
                            />
                          ) : (
                            <button
                              className="sidebar-graph"
                              onClick={() => {
                                switchGraph(graph.id);
                                setEditingName(false);
                              }}
                              onDoubleClick={(event) => {
                                event.preventDefault();
                                graphRenameCancelledRef.current = false;
                                setEditingGraph(graph.id);
                                setEditingGraphName(graph.document.name);
                              }}
                              title="Double-click to rename"
                            >
                              <span aria-hidden="true">◻</span>
                              <span>{graph.document.name}</span>
                            </button>
                          )}
                          <button
                            className="graph-row-action"
                            onClick={() => archiveGraph(graph.id)}
                            aria-label={`Archive ${graph.document.name}`}
                            title="Archive graph"
                          >
                            <Icon name="archive" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
              {matchingArchivedGraphs.length > 0 && (
                <section
                  className="archived-group"
                  aria-label="Archived graphs"
                >
                  <div className="archived-heading">
                    <Icon name="archive" size={14} />
                    Archived
                  </div>
                  {matchingArchivedGraphs.map((graph) => (
                    <div
                      className="sidebar-graph-row is-archived"
                      key={graph.id}
                    >
                      <button
                        className="sidebar-graph"
                        onClick={() => {
                          restoreGraph(graph.id);
                          switchGraph(graph.id);
                        }}
                      >
                        <span aria-hidden="true">◻</span>
                        <span>{graph.document.name}</span>
                      </button>
                      <button
                        className="graph-row-action"
                        onClick={() => restoreGraph(graph.id)}
                        aria-label={`Restore ${graph.document.name}`}
                        title="Restore graph"
                      >
                        <Icon name="restore" size={15} />
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </div>
          </div>
        </aside>
        <aside className="tool-rail" aria-label="Canvas tools">
          <ToolButton
            active={activeTool === "select"}
            label="Select"
            icon="select"
            onClick={() => setActiveTool("select")}
          />
          <ToolButton
            active={activeTool === "node"}
            label="Node"
            icon="node"
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData("application/opengraph-tool", "node")
            }
            onClick={() => {
              setActiveTool("node");
              setToast(
                "Drag Node onto the canvas or double-click to place one",
              );
            }}
          />
          <ToolButton
            active={activeTool === "note"}
            label="Note"
            icon="note"
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData("application/opengraph-tool", "note")
            }
            onClick={() => {
              setActiveTool("note");
              setToast("Drag Note onto the canvas to place an annotation");
            }}
          />
        </aside>
        <div
          className="canvas-shell"
          ref={canvasRef}
          onDoubleClickCapture={onDoubleClick}
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
        >
          <ReactFlow
            nodes={document.nodes}
            edges={document.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.18}
            panOnScroll
            panOnDrag
            zoomOnScroll={false}
            zoomOnPinch
            defaultViewport={document.viewport}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={(_event, edge) =>
              setSelected({ id: edge.id, kind: "edge" })
            }
            onPaneClick={() => {
              setConnectSource(null);
              if (activeTool !== "select") setActiveTool("select");
              setSelected(null);
            }}
            onMoveEnd={(_event, viewport) => {
              if (Date.now() < skipViewportCommitUntilRef.current) {
                setViewportLive(viewport);
                return;
              }
              updateViewport(viewport);
            }}
            connectionMode={ConnectionMode.Loose}
            selectNodesOnDrag={activeTool === "select"}
            elevateNodesOnSelect
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="var(--dot)"
            />
            {document.nodes.length > 8 && (
              <MiniMap
                className="mini-map"
                nodeColor={(node) =>
                  node.type === "annotation"
                    ? "var(--muted)"
                    : "var(--mini-node)"
                }
                pannable
                zoomable
                aria-label="Graph overview"
              />
            )}
            <Controls showInteractive={false} className="flow-controls" />
          </ReactFlow>
          {document.nodes.length === 0 && (
            <div className="empty-canvas" aria-live="polite">
              Drag a node here or double-click to start.
            </div>
          )}
          <details className="semantic-outline">
            <summary>Outline</summary>
            <div role="tree" aria-label="Semantic graph outline">
              <ol>
                {document.nodes.map((node) => (
                  <li key={node.id} role="treeitem">
                    <strong>
                      {node.type === "workflow"
                        ? (
                            node.data as Extract<
                              typeof node.data,
                              { kind: "workflow" }
                            >
                          ).title
                        : "Annotation"}
                    </strong>
                    <span>
                      {node.type === "workflow"
                        ? (
                            node.data as Extract<
                              typeof node.data,
                              { kind: "workflow" }
                            >
                          ).description
                        : (
                            node.data as Extract<
                              typeof node.data,
                              { kind: "annotation" }
                            >
                          ).text}
                    </span>
                  </li>
                ))}
              </ol>
              <ul aria-label="Connections">
                {document.edges.map((edge) => (
                  <li key={edge.id}>
                    {edge.source} → {edge.target} · {edge.data?.direction}
                    {edge.data?.label ? ` · ${edge.data.label}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <div className="canvas-hint">
            {saveStatus === "error" ? (
              <span className="save-error">Changes aren’t being saved</span>
            ) : (
              "Local document · private to this browser"
            )}
          </div>
        </div>
        {(settingsOpen || selectedNode || selectedEdge) && (
          <Inspector
            node={selectedNode}
            edge={selectedEdge}
            onClose={() => {
              setSettingsOpen(false);
              setSelected(null);
            }}
            onConnectFromNode={beginConnectionFromNode}
          />
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          {toast}
          {pendingExport && (
            <button
              className="toast-action"
              onClick={() => {
                downloadBlob(pendingExport);
                setPendingExport(null);
                setToast(null);
              }}
            >
              Download PNG
            </button>
          )}
          {organizationRevision === revision && toast === organizationToast && (
            <button
              className="toast-action"
              onClick={() => {
                handleUndo("Graph organization undone");
              }}
            >
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss notification"
              onClick={() => {
                setPendingExport(null);
                setOrganizationToast(null);
                setToast(null);
              }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function documentElement() {
  return window.document.documentElement;
}

function ToolButton({
  active,
  label,
  icon,
  onClick,
  draggable = false,
  onDragStart,
}: {
  active: boolean;
  label: string;
  icon: "select" | "node" | "note";
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}) {
  return (
    <button
      className={`tool-button ${active ? "is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <span className="tool-glyph">
        <Icon name={icon} size={22} />
      </span>
      <span>{label}</span>
    </button>
  );
}

function Inspector({
  node,
  edge,
  onClose,
  onConnectFromNode,
}: {
  node?: GraphNode;
  edge?: GraphEdge;
  onClose: () => void;
  onConnectFromNode: (nodeId: string) => void;
}) {
  const { document, commit, setSettingsOpen, setSelected, setToast } =
    useOpenGraphStore();
  const [downloadVisible, setDownloadVisible] = useState(false);
  const title = node
    ? node.type === "annotation"
      ? "Annotation"
      : "Node settings"
    : edge
      ? "Connection settings"
      : "Model settings";
  const annotationData = node?.data.kind === "annotation" ? node.data : null;
  const workflowData = node?.data.kind === "workflow" ? node.data : null;
  const updateNode = (patch: Record<string, unknown>) => {
    if (!node) return;
    commit((doc) => ({
      ...doc,
      nodes: doc.nodes.map((item) =>
        item.id === node.id
          ? { ...item, data: { ...item.data, ...patch } as GraphNode["data"] }
          : item,
      ),
    }));
  };
  const updateNodeModel = (model: ModelId) => {
    if (!node) return;
    commit((doc) => {
      const next = selectNodeModel(doc, node.id, model);
      localStorage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify({ models: next.models, defaults: next.defaults }));
      return next;
    });
  };
  const updateEdge = (patch: Partial<NonNullable<GraphEdge["data"]>>) => {
    if (!edge) return;
    commit((doc) => ({
      ...doc,
      edges: doc.edges.map((item) =>
        item.id === edge.id
          ? {
              ...item,
              data: {
                direction: item.data?.direction ?? "directed",
                label: item.data?.label ?? "",
                ...patch,
              },
            }
          : item,
      ),
    }));
  };
  const updateEdgeDirection = (
    direction: NonNullable<GraphEdge["data"]>["direction"],
    targetId?: string,
  ) => {
    if (!edge) return;
    commit((doc) => ({
      ...doc,
      edges: doc.edges.map((item) =>
        item.id === edge.id
          ? toggleEdgeDirection(item, direction, targetId)
          : item,
      ),
    }));
  };
  return (
    <aside className="inspector" aria-label={title}>
      <div className="inspector-header">
        <h2>{title}</h2>
        <button
          className="close-button"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="inspector-body">
        {annotationData && (
          <label className="field">
            <span>Note</span>
            <textarea
              value={annotationData.text}
              onChange={(event) => updateNode({ text: event.target.value })}
            />
          </label>
        )}
        {workflowData && (
          <>
            <label className="field">
              <span>Label</span>
              <input
                value={workflowData.title}
                onChange={(event) => updateNode({ title: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                maxLength={450}
                value={workflowData.description}
                onChange={(event) =>
                  updateNode({ description: event.target.value })
                }
              />
              <small>{workflowData.description.length}/450</small>
            </label>
            <section className="inspector-section">
              <div className="section-label">Model</div>
              <select
                aria-label="Node model"
                value={workflowData.modelOverride ?? document.defaults.model}
                onChange={(event) => updateNodeModel(event.target.value as ModelId)}
              >
                {Object.entries(groupModels(getModelOptions(
                  document.models,
                  workflowData.modelOverride ?? document.defaults.model,
                ))).map(([provider, models]) => (
                  <optgroup key={provider} label={providerName(provider)}>
                    {models.map((model) => <option key={model.id} value={model.id}>{modelLabel(model.id)}</option>)}
                  </optgroup>
                ))}
              </select>
            </section>
            <section className="inspector-section">
              <div className="section-label">Reasoning</div>
              <div className="reasoning-options">
                {getReasoningOptions().map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="node-reasoning"
                      checked={
                        (workflowData.reasoningOverride ??
                          document.defaults.reasoning) === value
                      }
                      onChange={() =>
                        updateNode({ reasoningOverride: value as Reasoning })
                      }
                    />
                    <span>{reasoningLabel(value as Reasoning)}</span>
                    <small>
                      {value === "low"
                        ? "Fastest"
                        : value === "medium"
                          ? "Balanced"
                          : "Deepest"}
                    </small>
                  </label>
                ))}
              </div>
              <button
                className="text-button"
                onClick={() => updateNode({ reasoningOverride: null })}
              >
                Inherit default reasoning
              </button>
            </section>
            <button
              className="context-button"
              onClick={() => node && onConnectFromNode(node.id)}
            >
              <Icon name="connect" size={16} />
              Connect from this node
            </button>
            <button
              className="danger-button"
              onClick={() => {
                useOpenGraphStore.getState().deleteSelected();
                onClose();
              }}
            >
              <Icon name="delete" size={16} />
              Delete node
            </button>
          </>
        )}
        {edge && (
          <>
            <label className="field">
              <span>Label</span>
              <input
                value={edge.data?.label ?? ""}
                onChange={(event) => updateEdge({ label: event.target.value })}
                placeholder="Optional label"
              />
            </label>
            <section className="inspector-section">
              <div className="section-label">Direction</div>
              <div className="segmented-control">
                {(["directed", "bidirectional", "loop"] as const).map(
                  (direction) => (
                    <button
                      key={direction}
                      className={
                        edge.data?.direction === direction ? "selected" : ""
                      }
                      onClick={() => updateEdgeDirection(direction)}
                    >
                      {direction === "bidirectional"
                        ? "Both ways"
                        : direction[0].toUpperCase() + direction.slice(1)}
                    </button>
                  ),
                )}
              </div>
              {edge.data?.direction === "loop" && (
                <label className="field loop-destination">
                  <span>Loop destination</span>
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value)
                        updateEdgeDirection("directed", event.target.value);
                    }}
                  >
                    <option value="" disabled>
                      Choose a node
                    </option>
                    {document.nodes
                      .filter((item) => item.id !== edge.source)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.type === "workflow"
                            ? (
                                item.data as Extract<
                                  typeof item.data,
                                  { kind: "workflow" }
                                >
                              ).title
                            : (
                                item.data as Extract<
                                  typeof item.data,
                                  { kind: "annotation" }
                                >
                              ).text.slice(0, 32)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </section>
            <button
              className="danger-button"
              onClick={() => {
                useOpenGraphStore.getState().deleteSelected();
                onClose();
              }}
            >
              <Icon name="delete" size={16} />
              Delete connection
            </button>
          </>
        )}
        {!node && !edge && (
          <ModelSettings
            downloadVisible={downloadVisible}
            setDownloadVisible={setDownloadVisible}
            setToast={setToast}
          />
        )}
      </div>
    </aside>
  );
}

function ModelSettings({
  downloadVisible,
  setDownloadVisible,
  setToast,
}: {
  downloadVisible: boolean;
  setDownloadVisible: (value: boolean) => void;
  setToast: (value: string | null) => void;
}) {
  const { document, commit } = useOpenGraphStore();
  const [customProvider, setCustomProvider] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [addingToProvider, setAddingToProvider] = useState<string | null>(null);
  const [providerModel, setProviderModel] = useState('');
  const updateDefaults = (patch: Partial<typeof document.defaults>) =>
    commit((doc) => {
      const defaults = { ...doc.defaults, ...patch }
      localStorage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify({ models: doc.models, defaults }))
      return { ...doc, defaults }
    });
  const updateModel = (id: ModelId, enabled: boolean) => {
    commit((doc) => {
      const models = doc.models.map((model) =>
        model.id === id ? { ...model, enabled } : model,
      )
      if (!models.some((model) => model.enabled)) {
        setToast('Keep at least one model enabled')
        return doc
      }
      const defaults = !enabled && doc.defaults.model === id
        ? { ...doc.defaults, model: models.find((model) => model.enabled)!.id }
        : doc.defaults
      localStorage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify({ models, defaults }))
      return { ...doc, models, defaults }
    });
  };
  const addModel = (provider: string, modelName: string, description = `Custom model from ${providerName(provider)}`) => {
    const cleanName = modelName.trim().replace(/^\/+|\/+$/g, '')
    const id = cleanName.startsWith(`${provider}/`) ? cleanName : `${provider}/${cleanName}`
    if (!cleanName || document.models.some((model) => model.id === id)) {
      if (cleanName) setToast('That model is already in this provider')
      return false
    }
    commit((doc) => {
      const models = [...doc.models, { id, provider, enabled: true, description }]
      localStorage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify({ models, defaults: doc.defaults }))
      return { ...doc, models }
    })
    return true
  };
  return (
    <>
      <p className="settings-intro">
        Keep a small, explicit set of models close to the canvas. New nodes use
        the model you selected most recently.
      </p>
      <section className="inspector-section">
        <div className="section-label">Enabled models</div>
        {Object.entries(groupModels(document.models)).map(([provider, models]) => (
          <details className="provider-group" key={provider} open>
            <summary>
              <span>{providerName(provider)}</span>
              <span className="provider-summary-meta">
                <small>{models.filter((model) => model.enabled).length}/{models.length} enabled</small>
                <svg className="provider-chevron" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m5.5 3.75 4.25 4.25-4.25 4.25" />
                </svg>
              </span>
            </summary>
            {models.map((model) => {
              const id = model.id
              return <label className="model-row" key={id}>
                <span className="model-dot" style={{ background: modelColor(id) }} />
                <span className="model-copy"><strong>{modelLabel(id)}</strong><small>{model.description}</small></span>
                <button className={`toggle ${model.enabled ? "is-on" : ""}`} role="switch" aria-label={`Enable ${id}`} aria-checked={model.enabled} onClick={() => updateModel(id, !model.enabled)}><i /></button>
              </label>
            })}
            {addingToProvider === provider ? (
              <form className="provider-model-form" onSubmit={(event) => {
                event.preventDefault()
                if (addModel(provider, providerModel)) {
                  setProviderModel('')
                  setAddingToProvider(null)
                }
              }}>
                <label className="field"><span>Model ID</span><input autoFocus value={providerModel} onChange={(event) => setProviderModel(event.target.value)} placeholder="model-name" maxLength={120} /></label>
                <div><button type="button" className="text-button" onClick={() => { setAddingToProvider(null); setProviderModel('') }}>Cancel</button><button className="context-button" disabled={!providerModel.trim()}>Add</button></div>
              </form>
            ) : (
              <button className="provider-add-button" onClick={() => { setAddingToProvider(provider); setProviderModel('') }}>＋ Add model to {providerName(provider)}</button>
            )}
          </details>
        ))}
        <form className="custom-model-form" onSubmit={(event) => {
          event.preventDefault()
          const provider = customProvider.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
          const modelName = customModel.trim()
          if (provider && modelName && addModel(provider, modelName, `Custom model from ${customProvider.trim()}`)) {
            setCustomProvider('')
            setCustomModel('')
          }
        }}>
          <div className="section-label">Add a provider and model</div>
          <label className="field"><span>Provider</span><input value={customProvider} onChange={(event) => setCustomProvider(event.target.value)} placeholder="My provider" maxLength={80} /></label>
          <label className="field"><span>Model ID</span><input value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="model-name" maxLength={120} /></label>
          <button className="context-button" disabled={!customProvider.trim() || !customModel.trim()}>Add model</button>
        </form>
        <button className="text-button" onClick={() => {
          const existing = new Set(document.models.map((model) => model.id))
          commit((doc) => ({ ...doc, models: [...doc.models, ...MODEL_CATALOG.filter((model) => !existing.has(model.id))] }))
        }}>Add current catalog models</button>
      </section>
      <section className="inspector-section">
        <div className="section-label">Reasoning for new nodes</div>
        <div className="reasoning-options">
          {getReasoningOptions().map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="default-reasoning"
                checked={document.defaults.reasoning === value}
                onChange={() =>
                  updateDefaults({ reasoning: value as Reasoning })
                }
              />
              <span>{reasoningLabel(value as Reasoning)}</span>
              <small>
                {value === "low"
                  ? "Fastest"
                  : value === "medium"
                    ? "Balanced"
                    : "Deepest"}
              </small>
            </label>
          ))}
        </div>
      </section>
      {downloadVisible && (
        <div className="download-note">
          Clipboard image access is unavailable. Use the PNG download that was
          created.
        </div>
      )}
    </>
  );
}

export default App;
