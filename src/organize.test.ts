import { describe, expect, it } from "vitest";
import { createAnnotationNode, createEdge, createWorkflowNode } from "./graphUtils";
import { organizeGraphDocument } from "./organize";
import { makeBlankDocument } from "./store";

describe("graph organization", () => {
  it("connects disconnected workflow components in outline order and lays them out", () => {
    const first = createWorkflowNode({ x: 700, y: 500 }, "Coordinator");
    const second = createWorkflowNode({ x: 30, y: 80 }, "Research");
    const third = createWorkflowNode({ x: 420, y: 300 }, "Implement");
    const document = {
      ...makeBlankDocument(),
      nodes: [first, second, third],
      edges: [createEdge({ source: first.id, target: second.id })],
    };

    const result = organizeGraphDocument(document);

    expect(result.connectionsAdded).toBe(1);
    expect(result.document.edges).toHaveLength(2);
    expect(result.document.edges[1]).toMatchObject({
      source: second.id,
      target: third.id,
    });
    expect(result.document.nodes.map((node) => node.position.x)).toEqual([
      48, 488, 928,
    ]);
  });

  it("preserves a connected branching graph and keeps siblings in one layer", () => {
    const root = createWorkflowNode({ x: 0, y: 0 }, "Root");
    const left = createWorkflowNode({ x: 0, y: 0 }, "Left");
    const right = createWorkflowNode({ x: 0, y: 0 }, "Right");
    const document = {
      ...makeBlankDocument(),
      nodes: [root, left, right],
      edges: [
        createEdge({ source: root.id, target: left.id }),
        createEdge({ source: root.id, target: right.id }),
      ],
    };

    const result = organizeGraphDocument(document);

    expect(result.connectionsAdded).toBe(0);
    expect(result.document.edges).toEqual(document.edges);
    expect(result.document.nodes[1].position.x).toBe(result.document.nodes[2].position.x);
    expect(result.document.nodes[1].position.y).toBeLessThan(result.document.nodes[2].position.y);
  });

  it("keeps cycles together and leaves annotations where the user placed them", () => {
    const first = createWorkflowNode({ x: 0, y: 0 }, "First");
    const second = createWorkflowNode({ x: 0, y: 0 }, "Second");
    const note = createAnnotationNode({ x: 777, y: 333 }, "Keep me here");
    const document = {
      ...makeBlankDocument(),
      nodes: [first, note, second],
      edges: [
        createEdge({ source: first.id, target: second.id }),
        createEdge({ source: second.id, target: first.id }),
      ],
    };

    const result = organizeGraphDocument(document);

    expect(result.connectionsAdded).toBe(0);
    expect(result.document.nodes[0].position.x).toBe(result.document.nodes[2].position.x);
    expect(result.document.nodes[1].position).toEqual({ x: 777, y: 333 });
  });

  it("returns annotation-only documents unchanged", () => {
    const document = {
      ...makeBlankDocument(),
      nodes: [createAnnotationNode({ x: 10, y: 20 }, "Note")],
    };
    expect(organizeGraphDocument(document)).toEqual({
      document,
      connectionsAdded: 0,
    });
  });
});
