import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Position,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import type { GraphEdge, GraphNode, GraphNodeData, ModelId } from "./types";
import { modelColor, modelLabel, reasoningLabel } from "./types";
import { resolvedNodeSettings } from "./graphUtils";
import type { GraphDocument } from "./types";
import { useOpenGraphStore } from "./store";

let pendingConnectionClick: number | null = null;

const handleConnectionClick = (event: React.MouseEvent, nodeId: string) => {
  event.stopPropagation();
  if (event.detail === 0) {
    window.dispatchEvent(
      new CustomEvent("opengraph:start-connection", { detail: nodeId }),
    );
    return;
  }
  if (event.detail > 1) {
    if (pendingConnectionClick !== null)
      window.clearTimeout(pendingConnectionClick);
    pendingConnectionClick = null;
    window.dispatchEvent(
      new CustomEvent("opengraph:append-step", { detail: nodeId }),
    );
    return;
  }
  if (pendingConnectionClick !== null)
    window.clearTimeout(pendingConnectionClick);
  pendingConnectionClick = window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("opengraph:start-connection", { detail: nodeId }),
    );
    pendingConnectionClick = null;
  }, 220);
};

const HandleSet = ({ nodeId }: { nodeId: string }) => (
  <>
    <Handle
      className="node-handle"
      type="target"
      position={Position.Left}
      id="target-left"
    />
    <Handle
      className="node-handle node-handle-connect"
      type="source"
      position={Position.Right}
      id="source-right"
      aria-label="Drag to connect, click to choose a destination, or double-click to add the next step"
      title="Drag to connect · click to choose · double-click to add next step"
      onClick={(event) => handleConnectionClick(event, nodeId)}
    >
      <span aria-hidden="true">→</span>
    </Handle>
    <Handle
      className="node-handle"
      type="target"
      position={Position.Right}
      id="target-right"
      style={{ top: "70%" }}
    />
    <Handle
      className="node-handle"
      type="target"
      position={Position.Top}
      id="target-top"
    />
    <Handle
      className="node-handle"
      type="source"
      position={Position.Bottom}
      id="source-bottom"
    />
    <Handle
      className="node-handle"
      type="source"
      position={Position.Left}
      id="source-loop"
      style={{ top: "30%" }}
    />
    <Handle
      className="node-handle"
      type="target"
      position={Position.Left}
      id="target-loop"
      style={{ top: "70%" }}
    />
  </>
);

export const WorkflowNode = memo(
  ({ data, selected, id }: NodeProps<GraphNode>) => {
    const nodeData = data as Extract<GraphNodeData, { kind: "workflow" }>;
    const fakeDocument = (
      window as Window & { __opengraphDocument?: GraphDocument }
    ).__opengraphDocument;
    const settings = fakeDocument
      ? resolvedNodeSettings(
          { data, id: "current", position: { x: 0, y: 0 }, type: "workflow" },
          fakeDocument,
        )
      : null;
    const model = settings?.model ?? nodeData.modelOverride ?? "gpt-5.6-terra";
    const reasoning =
      settings?.reasoning ?? nodeData.reasoningOverride ?? "medium";
    return (
      <div
        className={`workflow-node ${selected ? "is-selected" : ""}`}
        tabIndex={0}
        aria-label={`${nodeData.title}. ${nodeData.description}. ${model}, ${reasoning}`}
      >
        <HandleSet nodeId={id} />
        <div className="node-title-row">
          <span
            className="node-glyph"
            style={{ color: modelColor(model as ModelId) }}
            aria-hidden="true"
          >
            ◉
          </span>
          <strong>{nodeData.title}</strong>
        </div>
        {nodeData.description && (
          <p className="node-description" title={nodeData.description}>
            {nodeData.description}
          </p>
        )}
        <div
          className="node-chip"
          style={{
            borderColor: modelColor(model as ModelId),
            background: `color-mix(in srgb, ${modelColor(model as ModelId)} 8%, transparent)`,
          }}
        >
          <code>{model}</code>
          <span aria-hidden="true">·</span>
          <code>{reasoningLabel(reasoning)}</code>
        </div>
      </div>
    );
  },
);

export const AnnotationNode = memo(
  ({ data, selected }: NodeProps<GraphNode>) => {
    const nodeData = data as Extract<GraphNodeData, { kind: "annotation" }>;
    return (
      <div
        className={`annotation-node ${selected ? "is-selected" : ""}`}
        tabIndex={0}
        aria-label={`Annotation: ${nodeData.text}`}
      >
        <div className="annotation-mark" aria-hidden="true">
          ▱
        </div>
        <p>{nodeData.text}</p>
      </div>
    );
  },
);

export const WorkflowEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  }: EdgeProps<GraphEdge>) => {
    const selectedEdgeId = useOpenGraphStore((state) =>
      state.selected?.kind === "edge" ? state.selected.id : null,
    );
    const isSelected = selected || selectedEdgeId === id;
    const edgeData = data ?? { direction: "directed" as const, label: "" };
    const isLoop = edgeData.direction === "loop";
    const markerId = `opengraph-arrow-${id}`;
    const markerColor = isSelected ? "var(--accent)" : "var(--ink)";
    const sameSide = sourcePosition === targetPosition;
    const sameSideIsHorizontal =
      sourcePosition === Position.Left || sourcePosition === Position.Right;
    const sameSideLane = sameSideIsHorizontal
      ? sourcePosition === Position.Left
        ? Math.min(sourceX, targetX) - 54
        : Math.max(sourceX, targetX) + 54
      : sourcePosition === Position.Top
        ? Math.min(sourceY, targetY) - 54
        : Math.max(sourceY, targetY) + 54;
    const [smoothPath, smoothLabelX, smoothLabelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 4,
      offset: 28,
    });
    const loopSide = sourcePosition === Position.Left ? -1 : 1;
    const loopLane = Math.max(86, Math.abs(targetX - sourceX) + 86) * loopSide;
    const loopPath = `M ${sourceX} ${sourceY} C ${sourceX + loopLane} ${sourceY - 54}, ${targetX + loopLane} ${targetY + 54}, ${targetX} ${targetY}`;
    const routedPath =
      sameSide && !isLoop
        ? sameSideIsHorizontal
          ? `M ${sourceX} ${sourceY} L ${sameSideLane} ${sourceY} L ${sameSideLane} ${targetY} L ${targetX} ${targetY}`
          : `M ${sourceX} ${sourceY} L ${sourceX} ${sameSideLane} L ${targetX} ${sameSideLane} L ${targetX} ${targetY}`
        : smoothPath;
    const path = isLoop ? loopPath : routedPath;
    const routeLabelX = sameSide
      ? sameSideIsHorizontal
        ? sameSideLane
        : (sourceX + targetX) / 2
      : smoothLabelX;
    const routeLabelY = sameSide
      ? sameSideIsHorizontal
        ? (sourceY + targetY) / 2
        : sameSideLane
      : smoothLabelY;
    const labelX = isLoop ? sourceX + loopLane : routeLabelX;
    const labelY = isLoop ? (sourceY + targetY) / 2 : routeLabelY;
    const toggleDirection = (event: React.MouseEvent) => {
      event.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("opengraph:toggle-bidirectional", { detail: id }),
      );
    };
    return (
      <>
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="8.5"
            refY="5"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={markerColor} />
          </marker>
        </defs>
        <BaseEdge
          id={id}
          path={path}
          markerEnd={`url(#${markerId})`}
          markerStart={
            edgeData.direction === "bidirectional"
              ? `url(#${markerId})`
              : undefined
          }
          style={{ stroke: markerColor, strokeWidth: isSelected ? 2.4 : 2 }}
        />
        {edgeData.label && (
          <EdgeLabelRenderer>
            <div
              className={`edge-label ${isSelected ? "is-selected" : ""}`}
              aria-label={`Edge label: ${edgeData.label}`}
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              }}
            >
              {edgeData.label}
            </div>
          </EdgeLabelRenderer>
        )}
        {isSelected && !isLoop && (
          <EdgeLabelRenderer>
            <button
              className="edge-direction-toggle nodrag nopan"
              type="button"
              aria-label={
                edgeData.direction === "bidirectional"
                  ? "Make connection one-way"
                  : "Make connection bidirectional"
              }
              title={
                edgeData.direction === "bidirectional"
                  ? "Make one-way"
                  : "Make bidirectional"
              }
              onClick={toggleDirection}
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + (edgeData.label ? 28 : 0)}px)`,
              }}
            >
              <span aria-hidden="true">↔</span>
            </button>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);
