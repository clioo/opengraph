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
      48, 480, 912,
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

  it("opens a short cycle into outline order and keeps its note nearby", () => {
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
    expect(result.document.nodes[0].position.x).toBeLessThan(
      result.document.nodes[2].position.x,
    );
    expect(
      Math.abs(
        result.document.nodes[1].position.x - result.document.nodes[0].position.x,
      ),
    ).toBeLessThan(100);
    expect(result.document.nodes[1].position.y).toBeGreaterThan(
      result.document.nodes[0].position.y,
    );
    expect(result.document.edges[0]).toMatchObject({
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
    expect(result.document.edges[1]).toMatchObject({
      sourceHandle: "source-bottom",
      targetHandle: "target-bottom",
    });
  });

  it("turns a long review loop into a readable vertical pipeline", () => {
    const intake = createWorkflowNode({ x: 0, y: 0 }, "PR list");
    const reviewer = createWorkflowNode({ x: 440, y: 0 }, "Reviewer");
    const qa = createWorkflowNode({ x: 880, y: 0 }, "QA");
    const analyzer = createWorkflowNode({ x: 1320, y: 0 }, "Analyzer");
    const worker = createWorkflowNode({ x: 1760, y: 0 }, "Worker");
    const note = createAnnotationNode({ x: 900, y: -180 }, "If QA fails");
    const document = {
      ...makeBlankDocument(),
      nodes: [intake, reviewer, qa, note, analyzer, worker],
      edges: [
        createEdge({ source: intake.id, target: reviewer.id }),
        createEdge({ source: reviewer.id, target: qa.id }),
        createEdge({ source: qa.id, target: analyzer.id }),
        createEdge({ source: analyzer.id, target: worker.id }),
        createEdge({ source: qa.id, target: worker.id }, "bidirectional"),
        createEdge({ source: qa.id, target: intake.id }),
      ],
    };

    const result = organizeGraphDocument(document);
    const [positionedIntake, positionedReviewer, positionedQa, positionedNote, positionedAnalyzer, positionedWorker] =
      result.document.nodes;

    expect([
      positionedIntake,
      positionedReviewer,
      positionedQa,
      positionedAnalyzer,
      positionedWorker,
    ].map((node) => node.position.x)).toEqual([48, 448, 848, 848, 448]);
    expect([
      positionedIntake,
      positionedReviewer,
      positionedQa,
      positionedAnalyzer,
      positionedWorker,
    ].map((node) => node.position.y)).toEqual([234, 234, 234, 486, 486]);
    expect(positionedNote.position.x).toBeGreaterThanOrEqual(positionedQa.position.x);
    expect(positionedNote.position.y).toBeLessThan(positionedQa.position.y);
    result.document.edges.slice(0, 2).forEach((edge) =>
      expect(edge).toMatchObject({
        sourceHandle: "source-right",
        targetHandle: "target-left",
      }),
    );
    expect(result.document.edges[2]).toMatchObject({
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
    expect(result.document.edges[3]).toMatchObject({
      sourceHandle: "source-loop",
      targetHandle: "target-right",
    });
    expect(result.document.edges[4]).toMatchObject({
      sourceHandle: "source-bottom",
      targetHandle: "target-bottom",
    });
    expect(result.document.edges[5]).toMatchObject({
      sourceHandle: "source-bottom",
      targetHandle: "target-bottom",
    });
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
