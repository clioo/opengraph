# OpenGraph implementation plan

## Stack

- React 19, TypeScript, and Vite.
- `@xyflow/react` for the graph canvas and graph interactions.
- Zustand for document, UI, history, and persisted state.
- `html-to-image` for PNG capture and the Clipboard API for copying.
- Vitest and Testing Library for unit and interaction tests.
- Playwright for browser-level smoke tests.
- Project-owned CSS variables and components; no heavy UI framework.

## MVP

OpenGraph is a frontend-only, free-to-use graph editor. It opens directly into a usable canvas with no account, onboarding gate, API key, or backend. Users can create, drag, edit, duplicate, and delete workflow nodes and annotations; connect them using directed arrows, bidirectional arrows, and self-loops; configure enabled models and global defaults; override model and reasoning on individual nodes; undo and redo meaningful changes; persist the document in local storage; switch appearance; and copy a clean PNG of the graph to the clipboard with a download fallback.

## Data model

- A versioned graph document stores its name, nodes, edges, model definitions, defaults, viewport, and update time.
- Workflow nodes store title, description, kind, optional model override, and optional reasoning override.
- Annotation nodes store free text and visual placement.
- `null` overrides mean “inherit the current global default”.
- Edges store source, target, direction, and an optional label. A self-edge is a loop.

## Product structure

- Compact top bar: graph name, undo/redo, appearance, settings, and Copy graph.
- Minimal floating tool rail: Node and Note. Selection is the natural canvas state; pointer users connect through node handles.
- Canvas fills the remaining viewport.
- Contextual inspector opens only for the selected node or edge.
- Model settings use a textual enabled-model list, a default model, and a default reasoning effort.
- The first visit opens with a small editable example graph and configured model defaults. A cleared canvas shows one unobtrusive sentence: “Drag a node here or double-click to start.”

## Main interactions

- Drag a node or note from the rail onto the canvas; double-click also creates a node.
- Drag between handles to connect nodes; connecting to the same node creates a loop. Keyboard users select a source, choose `Connect from this node` in its inspector, then choose a destination from a labeled list.
- Select an edge to edit its label and switch between directed and bidirectional.
- Edge editing offers an explicit `Convert to loop` action so self-connections are discoverable without relying on a gesture.
- Edit labels inline or in the inspector.
- Delete removes selection; Cmd/Ctrl+D duplicates; Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z undo/redo; Escape cancels the active tool.
- Persist only the versioned document and optional viewport with a short debounce and a `pagehide` flush. Selection, menus, toasts, history, and transient tools are never persisted.
- One undo transaction is recorded for create, completed move, edit commit, duplicate, delete, connect, and settings changes. Pan, zoom, selection, and keystrokes inside an unfinished field are excluded.
- Invalid stored JSON is retained under a recovery key before loading the default document. Storage failures never block editing and show “Changes aren’t being saved”.

## Screenshot export

- Export through a dedicated `renderGraphToBlob` adapter that calculates node bounds, derives a temporary export viewport transform, waits for fonts, and renders only the React Flow viewport with consistent padding independent of the visible zoom.
- Exclude editor chrome, selection outlines, handles, controls, minimap, and inspector.
- Include nodes, annotations, edge labels, directed/bidirectional markers, and loops.
- Cap output dimensions and total pixels before rendering to prevent browser memory failure.
- Keep `renderGraphToBlob`, `copyBlobToClipboard`, and `downloadBlob` separate and testable.
- Copy the high-resolution PNG from the initiating click when secure-context image clipboard APIs are available.
- If image copying is unavailable or denied, retain the blob and offer an explicit `Download PNG` action; never trigger an unexpected download.

## Quality requirements

- WCAG 2.1 AA, explicit model text, visible focus, 44px targets, reduced motion, and light/dark/system appearance.
- Creating, editing, deleting, and connecting nodes must have complete keyboard paths; the canvas exposes a concise textual description of the focused node and its connections.
- Restrained visual system: pure white or neutral dark canvas, graphite ink, solid vermilion accent, compact model metadata, flat surfaces, 8–12px radii, and minimal shadows.
- Responsive desktop-first tool that remains operable on tablet and narrow screens through collapsible overlays.
- Directed, bidirectional, and loop edges are separate renderers. Bidirectional edges use markers on both ends; loops use explicit self-edge geometry and readable label placement.
- Initial editable models are `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.6-sol`. The default must always be enabled. Removing or disabling an assigned model requires choosing a replacement or converting affected nodes to inheritance. Unsupported reasoning values cannot be selected.
- Tests cover inheritance, model integrity, graph operations, edge geometry, persistence failure/recovery, history transactions, export bounds and adapters, keyboard alternatives, primary interactions, and a complete browser workflow.

## Build order

1. Scaffold, tokens, document types, and store.
2. Canvas, custom nodes, selection, and basic editing.
3. Directed edges, bidirectional edges, labels, and loops.
4. Inspector and model/default settings.
5. Annotations and keyboard actions.
6. Undo/redo and robust local persistence.
7. PNG capture, clipboard, and download fallback.
8. Accessibility, responsive behavior, tests, and visual polish.

## Acceptance

The MVP is complete when a first-time user can open the page and complete this scenario without any server or account: create at least four nodes and one annotation; create one directed edge, one bidirectional edge, and one loop; assign a global model/reasoning default and one node override; reload and recover positions, content, settings, and connections; undo and redo every persistent operation; export a PNG containing the whole graph while excluding chrome, handles, and selection; perform creation, editing, and connection with keyboard-only controls; and continue editing with clear recovery actions when storage, export, or Clipboard access fails.
