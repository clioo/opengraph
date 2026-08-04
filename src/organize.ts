import { createEdge } from "./graphUtils";
import type { GraphDocument, GraphEdge, GraphNode } from "./types";

type OrganizeResult = {
  document: GraphDocument;
  connectionsAdded: number;
};

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
    additions.push(
      createEdge({
        source: previous.id,
        target: current.id,
        sourceHandle: "source-right",
        targetHandle: "target-left",
      }),
    );
    union(previous.id, current.id);
  }
  return additions;
};

const stronglyConnectedComponents = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => adjacency.get(edge.source)?.push(edge.target));
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

const layoutWorkflowNodes = (nodes: GraphNode[], edges: GraphEdge[]) => {
  if (!nodes.length) return nodes;
  const components = stronglyConnectedComponents(nodes, edges);
  const componentOf = new Map<string, number>();
  components.forEach((component, index) =>
    component.forEach((nodeId) => componentOf.set(nodeId, index)),
  );

  const incoming = components.map(() => new Set<number>());
  const outgoing = components.map(() => new Set<number>());
  edges.forEach((edge) => {
    const source = componentOf.get(edge.source);
    const target = componentOf.get(edge.target);
    if (source === undefined || target === undefined || source === target) return;
    outgoing[source].add(target);
    incoming[target].add(source);
  });

  const componentOrder = components
    .map((component, index) => ({
      index,
      outlineIndex: Math.min(
        ...component.map((id) => nodes.findIndex((node) => node.id === id)),
      ),
    }))
    .sort((left, right) => left.outlineIndex - right.outlineIndex);
  const queue = componentOrder
    .filter(({ index }) => incoming[index].size === 0)
    .map(({ index }) => index);
  const levels = components.map(() => 0);
  const remainingIncoming = incoming.map((sources) => new Set(sources));

  while (queue.length) {
    const source = queue.shift()!;
    for (const target of outgoing[source]) {
      levels[target] = Math.max(levels[target], levels[source] + 1);
      remainingIncoming[target].delete(source);
      if (remainingIncoming[target].size === 0) queue.push(target);
    }
  }

  const levelsToNodes = new Map<number, GraphNode[]>();
  nodes.forEach((node) => {
    const level = levels[componentOf.get(node.id)!];
    levelsToNodes.set(level, [...(levelsToNodes.get(level) ?? []), node]);
  });

  const margin = 48;
  const gapX = 120;
  const gapY = 56;
  const maxColumnHeight = Math.max(
    ...[...levelsToNodes.values()].map((column) =>
      column.reduce((height, node) => height + nodeHeight(node), 0) +
      Math.max(0, column.length - 1) * gapY,
    ),
  );
  const maxLevel = Math.max(...levelsToNodes.keys());
  const columnWidths = Array.from({ length: maxLevel + 1 }, (_, level) =>
    Math.max(...(levelsToNodes.get(level) ?? []).map(nodeWidth), 320),
  );
  const columnX: number[] = [];
  columnWidths.forEach((width, level) => {
    columnX[level] =
      level === 0
        ? margin
        : columnX[level - 1] + columnWidths[level - 1] + gapX;
  });

  const positions = new Map<string, { x: number; y: number }>();
  levelsToNodes.forEach((column, level) => {
    const columnHeight =
      column.reduce((height, node) => height + nodeHeight(node), 0) +
      Math.max(0, column.length - 1) * gapY;
    let y = margin + (maxColumnHeight - columnHeight) / 2;
    column.forEach((node) => {
      positions.set(node.id, { x: columnX[level], y });
      y += nodeHeight(node) + gapY;
    });
  });

  return nodes.map((node) => ({ ...node, position: positions.get(node.id)! }));
};

export const organizeGraphDocument = (document: GraphDocument): OrganizeResult => {
  const workflowNodes = document.nodes.filter((node) => node.type === "workflow");
  if (!workflowNodes.length) return { document, connectionsAdded: 0 };

  const additions = connectComponentsInOutlineOrder(workflowNodes, document.edges);
  const edges = [...document.edges, ...additions];
  const relevantEdges = workflowEdges(workflowNodes, edges);
  const positioned = layoutWorkflowNodes(workflowNodes, relevantEdges);
  const positions = new Map(positioned.map((node) => [node.id, node.position]));

  return {
    document: {
      ...document,
      nodes: document.nodes.map((node) =>
        positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node,
      ),
      edges,
    },
    connectionsAdded: additions.length,
  };
};
