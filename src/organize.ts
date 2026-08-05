import { createEdge } from "./graphUtils";
import type { GraphDocument, GraphEdge, GraphNode } from "./types";

type OrganizeResult = {
  document: GraphDocument;
  connectionsAdded: number;
};

type LayoutDirection = "horizontal" | "vertical";

type ComponentLayout = {
  index: number;
  nodes: GraphNode[];
  level: number;
  width: number;
  height: number;
  localPositions: Map<string, { x: number; y: number }>;
};

const MARGIN = 48;
const COLUMN_GAP = 112;
const ROW_GAP = 88;
const SIBLING_GAP = 48;
const CYCLE_GAP = 80;
const CYCLE_ROW_GAP = 72;
const NOTE_GAP = 56;

const nodeWidth = (node: GraphNode) =>
  node.measured?.width ?? node.width ?? (node.type === "workflow" ? 320 : 260);

const nodeHeight = (node: GraphNode) =>
  node.measured?.height ?? node.height ?? (node.type === "workflow" ? 180 : 130);

const workflowEdges = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const ids = new Set(nodes.map((node) => node.id));
  return edges.filter(
    (edge) =>
      edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target),
  );
};

const connectComponentsInOutlineOrder = (
  nodes: GraphNode[],
  edges: GraphEdge[],
) => {
  const parent = new Map(nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    const next = parent.get(id) ?? id;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  workflowEdges(nodes, edges).forEach((edge) => union(edge.source, edge.target));

  const additions: GraphEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    if (find(previous.id) === find(current.id)) continue;
    additions.push(createEdge({ source: previous.id, target: current.id }));
    union(previous.id, current.id);
  }
  return additions;
};

const stronglyConnectedComponents = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => {
    adjacency.get(edge.source)?.push(edge.target);
    if (edge.data?.direction === "bidirectional")
      adjacency.get(edge.target)?.push(edge.source);
  });
  adjacency.forEach((targets) =>
    targets.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0)),
  );

  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (id: string) => {
    indices.set(id, nextIndex);
    lowLinks.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);

    for (const target of adjacency.get(id) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(id, Math.min(lowLinks.get(id)!, lowLinks.get(target)!));
      } else if (onStack.has(target)) {
        lowLinks.set(id, Math.min(lowLinks.get(id)!, indices.get(target)!));
      }
    }

    if (lowLinks.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let current: string;
    do {
      current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
    } while (current !== id);
    component.sort(
      (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
    );
    components.push(component);
  };

  nodes.forEach((node) => {
    if (!indices.has(node.id)) visit(node.id);
  });
  return components;
};

const measureComponent = (nodes: GraphNode[]) => {
  const columns = nodes.length <= 3 ? nodes.length : Math.ceil(Math.sqrt(nodes.length));
  const cells = nodes.map((node, index) => {
    const row = Math.floor(index / columns);
    const offset = index % columns;
    return {
      node,
      row,
      column: row % 2 === 0 ? offset : columns - 1 - offset,
    };
  });
  const rowCount = Math.max(...cells.map(({ row }) => row)) + 1;
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(...cells.filter((cell) => cell.column === column).map(({ node }) => nodeWidth(node)), 0),
  );
  const rowHeights = Array.from({ length: rowCount }, (_, row) =>
    Math.max(...cells.filter((cell) => cell.row === row).map(({ node }) => nodeHeight(node)), 0),
  );
  const columnX: number[] = [];
  const rowY: number[] = [];
  columnWidths.forEach((width, column) => {
    columnX[column] =
      column === 0 ? 0 : columnX[column - 1] + columnWidths[column - 1] + CYCLE_GAP;
  });
  rowHeights.forEach((height, row) => {
    rowY[row] = row === 0 ? 0 : rowY[row - 1] + rowHeights[row - 1] + CYCLE_ROW_GAP;
  });
  return {
    width: columnWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, columns - 1) * CYCLE_GAP,
    height: rowHeights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, rowCount - 1) * CYCLE_ROW_GAP,
    localPositions: new Map(
      cells.map(({ node, row, column }) => [
        node.id,
        {
          x: columnX[column] + (columnWidths[column] - nodeWidth(node)) / 2,
          y: rowY[row] + (rowHeights[row] - nodeHeight(node)) / 2,
        },
      ]),
    ),
  };
};

const componentGraph = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const outlineOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const componentIds = stronglyConnectedComponents(nodes, edges);
  const componentOf = new Map<string, number>();
  componentIds.forEach((component, index) =>
    component.forEach((id) => componentOf.set(id, index)),
  );

  const incoming = componentIds.map(() => new Set<number>());
  const outgoing = componentIds.map(() => new Set<number>());
  edges.forEach((edge) => {
    const source = componentOf.get(edge.source);
    const target = componentOf.get(edge.target);
    if (source === undefined || target === undefined || source === target) return;
    outgoing[source].add(target);
    incoming[target].add(source);
  });

  const outlineComponents = componentIds
    .map((ids, index) => ({
      index,
      outlineIndex: Math.min(...ids.map((id) => outlineOrder.get(id) ?? 0)),
    }))
    .sort((left, right) => left.outlineIndex - right.outlineIndex);
  const queue = outlineComponents
    .filter(({ index }) => incoming[index].size === 0)
    .map(({ index }) => index);
  const levels = componentIds.map(() => 0);
  const remainingIncoming = incoming.map((sources) => new Set(sources));

  while (queue.length) {
    const source = queue.shift()!;
    for (const target of outgoing[source]) {
      levels[target] = Math.max(levels[target], levels[source] + 1);
      remainingIncoming[target].delete(source);
      if (remainingIncoming[target].size === 0) queue.push(target);
    }
  }

  const components: ComponentLayout[] = componentIds.map((ids, index) => {
    const componentNodes = ids.map((id) => nodeById.get(id)!);
    const measured = measureComponent(componentNodes);
    return {
      index,
      nodes: componentNodes,
      level: levels[index],
      ...measured,
    };
  });

  return { components, componentOf };
};

const chooseDirection = (components: ComponentLayout[]): LayoutDirection => {
  const maxLevel = Math.max(...components.map((component) => component.level));
  const largestCycle = Math.max(...components.map((component) => component.nodes.length));
  const counts = new Map<number, number>();
  components.forEach((component) =>
    counts.set(component.level, (counts.get(component.level) ?? 0) + 1),
  );
  const widestLevel = Math.max(...counts.values());

  // Cycles read best as a compact horizontal loop fed from above. Long,
  // mostly-linear workflows also fit common screens better top-to-bottom.
  return largestCycle >= 3 || (maxLevel >= 4 && widestLevel <= 2)
    ? "vertical"
    : "horizontal";
};

const layoutWorkflowNodes = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const { components, componentOf } = componentGraph(nodes, edges);
  const direction = chooseDirection(components);
  const levels = new Map<number, ComponentLayout[]>();
  components
    .sort(
      (left, right) =>
        Math.min(...left.nodes.map((node) => nodes.indexOf(node))) -
        Math.min(...right.nodes.map((node) => nodes.indexOf(node))),
    )
    .forEach((component) =>
      levels.set(component.level, [...(levels.get(component.level) ?? []), component]),
    );

  const maxLevel = Math.max(...levels.keys());
  const positions = new Map<string, { x: number; y: number }>();

  const placeComponent = (component: ComponentLayout, x: number, y: number) => {
    component.nodes.forEach((node) => {
      const local = component.localPositions.get(node.id)!;
      positions.set(node.id, {
        x: x + local.x,
        y: y + local.y,
      });
    });
  };

  if (direction === "vertical") {
    const rowWidths = Array.from({ length: maxLevel + 1 }, (_, level) => {
      const row = levels.get(level) ?? [];
      return (
        row.reduce((width, component) => width + component.width, 0) +
        Math.max(0, row.length - 1) * SIBLING_GAP
      );
    });
    const rowHeights = Array.from({ length: maxLevel + 1 }, (_, level) =>
      Math.max(...(levels.get(level) ?? []).map((component) => component.height)),
    );
    const canvasWidth = Math.max(...rowWidths);
    let y = MARGIN;
    rowHeights.forEach((height, level) => {
      let x = MARGIN + (canvasWidth - rowWidths[level]) / 2;
      (levels.get(level) ?? []).forEach((component) => {
        placeComponent(component, x, y);
        x += component.width + SIBLING_GAP;
      });
      y += height + ROW_GAP;
    });
  } else {
    const columnWidths = Array.from({ length: maxLevel + 1 }, (_, level) =>
      Math.max(...(levels.get(level) ?? []).map((component) => component.width)),
    );
    const columnHeights = Array.from({ length: maxLevel + 1 }, (_, level) => {
      const column = levels.get(level) ?? [];
      return (
        column.reduce((height, component) => height + component.height, 0) +
        Math.max(0, column.length - 1) * SIBLING_GAP
      );
    });
    const canvasHeight = Math.max(...columnHeights);
    let x = MARGIN;
    columnWidths.forEach((width, level) => {
      let y = MARGIN + (canvasHeight - columnHeights[level]) / 2;
      (levels.get(level) ?? []).forEach((component) => {
        placeComponent(component, x, y);
        y += component.height + SIBLING_GAP;
      });
      x += width + COLUMN_GAP;
    });
  }

  return {
    direction,
    components,
    componentOf,
    nodes: nodes.map((node) => ({ ...node, position: positions.get(node.id)! })),
  };
};

const squaredDistance = (
  left: { x: number; y: number },
  right: { x: number; y: number },
) => (left.x - right.x) ** 2 + (left.y - right.y) ** 2;

const center = (node: GraphNode) => ({
  x: node.position.x + nodeWidth(node) / 2,
  y: node.position.y + nodeHeight(node) / 2,
});

const overlaps = (left: GraphNode, right: GraphNode, padding = 20) =>
  left.position.x < right.position.x + nodeWidth(right) + padding &&
  left.position.x + nodeWidth(left) + padding > right.position.x &&
  left.position.y < right.position.y + nodeHeight(right) + padding &&
  left.position.y + nodeHeight(left) + padding > right.position.y;

const layoutAnnotations = (
  annotations: GraphNode[],
  originalWorkflowNodes: GraphNode[],
  positionedWorkflowNodes: GraphNode[],
) => {
  if (!annotations.length) return annotations;
  const positionedById = new Map(
    positionedWorkflowNodes.map((node) => [node.id, node]),
  );
  const occupied = [...positionedWorkflowNodes];

  return annotations.map((note) => {
    const noteCenter = center(note);
    const anchor = originalWorkflowNodes.reduce((nearest, candidate) =>
      squaredDistance(noteCenter, center(candidate)) <
      squaredDistance(noteCenter, center(nearest))
        ? candidate
        : nearest,
    );
    const positionedAnchor = positionedById.get(anchor.id)!;
    const delta = {
      x: noteCenter.x - center(anchor).x,
      y: noteCenter.y - center(anchor).y,
    };
    const horizontalFirst = Math.abs(delta.x) > Math.abs(delta.y);
    const preferredSides = horizontalFirst
      ? [delta.x < 0 ? "left" : "right", delta.y < 0 ? "top" : "bottom"]
      : [delta.y < 0 ? "top" : "bottom", delta.x < 0 ? "left" : "right"];
    const sides = [
      ...preferredSides,
      "top",
      "right",
      "bottom",
      "left",
    ].filter((side, index, all) => all.indexOf(side) === index);

    const candidateFor = (side: string): GraphNode => ({
      ...note,
      position:
        side === "top"
          ? {
              x:
                positionedAnchor.position.x +
                (nodeWidth(positionedAnchor) - nodeWidth(note)) / 2,
              y: positionedAnchor.position.y - nodeHeight(note) - NOTE_GAP,
            }
          : side === "bottom"
            ? {
                x:
                  positionedAnchor.position.x +
                  (nodeWidth(positionedAnchor) - nodeWidth(note)) / 2,
                y:
                  positionedAnchor.position.y +
                  nodeHeight(positionedAnchor) +
                  NOTE_GAP,
              }
            : side === "left"
              ? {
                  x: positionedAnchor.position.x - nodeWidth(note) - NOTE_GAP,
                  y:
                    positionedAnchor.position.y +
                    (nodeHeight(positionedAnchor) - nodeHeight(note)) / 2,
                }
              : {
                  x:
                    positionedAnchor.position.x +
                    nodeWidth(positionedAnchor) +
                    NOTE_GAP,
                  y:
                    positionedAnchor.position.y +
                    (nodeHeight(positionedAnchor) - nodeHeight(note)) / 2,
                },
    });

    const positioned =
      sides.map(candidateFor).find((candidate) =>
        occupied.every((node) => !overlaps(candidate, node)),
      ) ?? candidateFor("right");
    occupied.push(positioned);
    return positioned;
  });
};

const normalizePositions = (nodes: GraphNode[]) => {
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const shiftX = minX < MARGIN ? MARGIN - minX : 0;
  const shiftY = minY < MARGIN ? MARGIN - minY : 0;
  if (!shiftX && !shiftY) return nodes;
  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + shiftX,
      y: node.position.y + shiftY,
    },
  }));
};

const routeEdges = (
  edges: GraphEdge[],
  components: ComponentLayout[],
  componentOf: Map<string, number>,
  direction: LayoutDirection,
  positionedNodes: GraphNode[],
) =>
  edges.map((edge) => {
    if (edge.source === edge.target) return edge;
    const sourceComponent = componentOf.get(edge.source);
    const targetComponent = componentOf.get(edge.target);
    if (sourceComponent === undefined || targetComponent === undefined) return edge;

    if (sourceComponent === targetComponent) {
      const component = components.find(({ index }) => index === sourceComponent)!;
      const sourceIndex = component.nodes.findIndex((node) => node.id === edge.source);
      const targetIndex = component.nodes.findIndex((node) => node.id === edge.target);
      const source = positionedNodes.find((node) => node.id === edge.source)!;
      const target = positionedNodes.find((node) => node.id === edge.target)!;
      const feedback =
        edge.data?.direction === "bidirectional" ||
        targetIndex < sourceIndex ||
        Math.abs(targetIndex - sourceIndex) > 1;
      if (!feedback && target.position.y > source.position.y + 1) {
        return { ...edge, sourceHandle: "source-bottom", targetHandle: "target-top" };
      }
      if (!feedback && target.position.x < source.position.x) {
        return { ...edge, sourceHandle: "source-loop", targetHandle: "target-right" };
      }
      return {
        ...edge,
        sourceHandle: feedback ? "source-bottom" : "source-right",
        targetHandle: feedback ? "target-bottom" : "target-left",
      };
    }

    return {
      ...edge,
      sourceHandle: direction === "horizontal" ? "source-right" : "source-bottom",
      targetHandle: direction === "horizontal" ? "target-left" : "target-top",
    };
  });

export const organizeGraphDocument = (document: GraphDocument): OrganizeResult => {
  const workflowNodes = document.nodes.filter((node) => node.type === "workflow");
  if (!workflowNodes.length) return { document, connectionsAdded: 0 };

  const additions = connectComponentsInOutlineOrder(workflowNodes, document.edges);
  const edges = [...document.edges, ...additions];
  const relevantEdges = workflowEdges(workflowNodes, edges);
  const layout = layoutWorkflowNodes(workflowNodes, relevantEdges);
  const annotations = layoutAnnotations(
    document.nodes.filter((node) => node.type === "annotation"),
    workflowNodes,
    layout.nodes,
  );
  const positionedNodes = normalizePositions([...layout.nodes, ...annotations]);
  const positions = new Map(positionedNodes.map((node) => [node.id, node.position]));

  return {
    document: {
      ...document,
      nodes: document.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? node.position,
      })),
      edges: routeEdges(
        edges,
        layout.components,
        layout.componentOf,
        layout.direction,
        layout.nodes,
      ),
    },
    connectionsAdded: additions.length,
  };
};
