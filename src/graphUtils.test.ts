import { describe, expect, it } from "vitest";
import {
  applyNodeChangesWithoutSelection,
  commitEdgeChanges,
  commitNodeChanges,
  convertEdgeDirection,
  createAnnotationNode,
  createEdge,
  createWorkflowNode,
  directionForConnection,
  getExportBounds,
  getModelOptions,
  getReasoningOptions,
  normalizeDocument,
  resolvedNodeSettings,
  sanitizeDocument,
  selectNodeModel,
  toggleEdgeDirection,
} from "./graphUtils";
import { makeInitialDocument } from "./store";
import type { GraphDocument, GraphEdge } from "./types";
import { modelColor } from './types';
import { MODEL_IDS } from './modelCatalog';

describe("graph utilities", () => {
  it("changes only the selected node model and remembers it for new nodes", () => {
    const document = makeInitialDocument();
    const first = createWorkflowNode({ x: 0, y: 0 }, "First");
    const second = createWorkflowNode({ x: 300, y: 0 }, "Second");
    const currentModel = document.defaults.model;
    const nextModel = document.models.find(
      (model) => model.enabled && model.id !== currentModel,
    )!.id;
    const source = {
      ...document,
      nodes: [first, second],
    };

    const result = selectNodeModel(source, first.id, nextModel);

    expect(result.defaults.model).toBe(nextModel);
    expect(result.nodes[0].data.kind === "workflow" && result.nodes[0].data.modelOverride).toBe(nextModel);
    expect(result.nodes[1].data.kind === "workflow" && result.nodes[1].data.modelOverride).toBe(currentModel);
  });

  it('assigns stable, distinct colors to model ids', () => {
    const ids = ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'claude-opus-4-8', 'kimi-k2.5'];
    const colors = ids.map(modelColor);
    expect(new Set(colors).size).toBe(ids.length);
    expect(modelColor(ids[0])).toBe(colors[0]);
  });
  it("creates nodes, ids, and connection directions", () => {
    const node = createWorkflowNode({ x: 10, y: 20 });
    const note = createAnnotationNode({ x: 30, y: 40 }, "Context");
    expect(node.id).toMatch(/^node-/);
    expect(
      (node.data as Extract<typeof node.data, { kind: "workflow" }>).title,
    ).toBe("New step");
    expect(note.id).toMatch(/^note-/);
    expect(note.data).toEqual({ kind: "annotation", text: "Context" });
    expect(directionForConnection({ source: "a", target: "b" })).toBe(
      "directed",
    );
    expect(directionForConnection({ source: "a", target: "a" })).toBe("loop");
  });

  it("creates coherent directed, bidirectional, and loop edges", () => {
    const directed = createEdge({
      source: "a",
      target: "b",
      sourceHandle: "s",
      targetHandle: "t",
    });
    expect(directed.data?.direction).toBe("directed");
    expect(directed.target).toBe("b");
    expect(directed.sourceHandle).toBe("s");
    expect(
      createEdge({ source: "a", target: "b" }, "bidirectional").data?.direction,
    ).toBe("bidirectional");
    const loop = createEdge(
      { source: "a", target: "b", sourceHandle: "s", targetHandle: "t" },
      "loop",
      "retry",
    );
    expect(loop).toMatchObject({
      source: "a",
      target: "a",
      data: { direction: "loop", label: "retry" },
    });
    expect(loop.sourceHandle).toBe("source-loop");
    expect(loop.targetHandle).toBe("target-loop");
    expect(
      createEdge({ source: "a", target: "a" }, "directed").data?.direction,
    ).toBe("loop");
  });

  it("resolves workflow overrides and ignores annotation settings", () => {
    const document = makeInitialDocument();
    const node = document.nodes.find((item) => item.type === "workflow")!;
    expect(resolvedNodeSettings(node, document)).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: "medium",
      inheritedModel: true,
      inheritedReasoning: true,
    });
    const override = {
      ...node,
      data: {
        ...node.data,
      modelOverride: "gpt-5.6-sol" as const,
        reasoningOverride: "high" as const,
      },
    };
    expect(resolvedNodeSettings(override, document)).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: "high",
      inheritedModel: false,
      inheritedReasoning: false,
    });
    expect(
      resolvedNodeSettings(createAnnotationNode({ x: 0, y: 0 }), document),
    ).toBeNull();
  });

  it("validates and normalizes defaults, models, overrides, and edge geometry", () => {
    const original = makeInitialDocument();
    const workflow = original.nodes.find((item) => item.type === "workflow")!;
    const annotation = original.nodes.find(
      (item) => item.type === "annotation",
    )!;
    const invalid = {
      ...original,
      models: [
        null,
        { id: "not-a-model", enabled: true },
        { id: "gpt-5.6-terra", enabled: false, description: 4 },
        { id: "gpt-5.6-luna", enabled: false, description: "Luna custom" },
      ],
      defaults: { model: "gpt-5.6-terra", reasoning: "invalid" },
      nodes: [
        {
          ...workflow,
          data: {
            ...workflow.data,
            modelOverride: "gpt-5.6-luna",
            reasoningOverride: "invalid",
          },
        },
        annotation,
      ],
      edges: [
        {
          ...original.edges[0],
          data: { direction: "bidirectional", label: 7 },
        },
        {
          ...original.edges[0],
          source: "a",
          target: "a",
          data: { direction: "directed", label: "self" },
          sourceHandle: "source",
          targetHandle: "target",
        },
        {
          ...original.edges[0],
          source: "a",
          target: "b",
          sourceHandle: undefined,
          targetHandle: undefined,
          data: { direction: "unknown" },
        },
      ],
    } as unknown as GraphDocument;
    const normalized = normalizeDocument(invalid);
    expect(normalized.defaults).toEqual({
      model: "not-a-model",
      reasoning: "medium",
    });
    expect(normalized.models.length).toBeGreaterThanOrEqual(3);
    expect(normalized.models.find((model) => model.id === "not-a-model")?.provider).toBe("custom");
    expect(normalized.models.find((model) => model.id === "gpt-5.6-terra")?.provider).toBe("codex");
    expect(normalized.models.find((model) => model.id === "gpt-5.6-luna")?.provider).toBe("codex");
    expect(normalized.nodes[0].data).toMatchObject({
      modelOverride: null,
      reasoningOverride: null,
    });
    expect(normalized.nodes[1]).toBe(annotation);
    expect(normalized.edges[0].data).toEqual({
      direction: "bidirectional",
      label: "",
    });
    expect(normalized.edges[1]).toMatchObject({
      source: "a",
      target: "a",
      data: { direction: "loop", label: "self" },
      sourceHandle: "source-loop",
      targetHandle: "target-loop",
    });
    expect(normalized.edges[2]).toMatchObject({
      data: { direction: "directed", label: "" },
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });

    const allDisabled = normalizeDocument({
      ...original,
      models: original.models.map((model) => ({ ...model, enabled: false })),
      defaults: { model: "gpt-5.6-luna", reasoning: "low" },
    });
    expect(allDisabled.defaults).toEqual({
      model: "codex/gpt-5.6-sol",
      reasoning: "low",
    });
    expect(allDisabled.models[0].enabled).toBe(true);
    const missingModels = normalizeDocument({
      ...original,
      models: undefined as never,
    });
    expect(missingModels.models).toHaveLength(MODEL_IDS.length);
  });

  it("rejects malformed persisted documents and accepts normalized ones", () => {
    expect(sanitizeDocument(null)).toBeNull();
    expect(sanitizeDocument([])).toBeNull();
    expect(sanitizeDocument({})).toBeNull();
    expect(sanitizeDocument({ version: 2, nodes: [], edges: [] })).toBeNull();
    expect(
      sanitizeDocument({
        version: 1,
        nodes: {},
        edges: [],
        defaults: { model: "gpt-5.6-terra" },
      }),
    ).toBeNull();
    expect(sanitizeDocument({ version: 1, nodes: [], edges: [], defaults: { model: "unknown" } })).not.toBeNull();
    const valid = makeInitialDocument();
    expect(sanitizeDocument(valid)).toMatchObject({
      version: 1,
      defaults: { model: "codex/gpt-5.6-sol", reasoning: valid.defaults.reasoning },
    });
  });

  it("applies node changes without changing selection and commits graph changes", () => {
    const document = makeInitialDocument();
    const node = document.nodes[0];
    const changed = applyNodeChangesWithoutSelection(document.nodes, [
      { type: "position", id: node.id, position: { x: 999, y: 888 } },
    ]);
    expect(changed.find((item) => item.id === node.id)?.position).toEqual({
      x: 999,
      y: 888,
    });
    expect(commitNodeChanges(document, changed).nodes).toBe(changed);
    expect(commitEdgeChanges(document, document.edges).edges).toBe(
      document.edges,
    );
  });

  it("calculates padded bounds for empty, measured, sized, and fallback nodes", () => {
    expect(getExportBounds([])).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 420,
      scale: 1,
    });
    const measured = {
      ...createWorkflowNode({ x: 100, y: 80 }),
      measured: { width: 200, height: 80 },
    };
    const sized = {
      ...createWorkflowNode({ x: 500, y: 200 }),
      width: 500,
      height: 400,
    };
    const fallback = createWorkflowNode({ x: -100, y: -50 });
    const bounds = getExportBounds([measured, sized, fallback], 40, 500);
    expect(bounds).toEqual({
      x: -140,
      y: -90,
      width: 1180,
      height: 730,
      scale: 500 / 1180,
    });
  });

  it("uses the measured expanded node height in exported PNGs", () => {
    const node = {
      ...createWorkflowNode({ x: 0, y: 100 }),
      measured: { width: 320, height: 218 },
      data: {
        ...createWorkflowNode({ x: 0, y: 0 }).data,
        description: "word ".repeat(40),
      },
    };
    expect(
      getExportBounds([createAnnotationNode({ x: 0, y: 0 }), node], 0),
    ).toMatchObject({ width: 320, height: 318 });
  });

  it("converts directions while preserving labels and preventing invalid loops", () => {
    const edge = createEdge({ source: "a", target: "b" }, "directed", "retry");
    const loop = convertEdgeDirection(edge, "loop")!;
    expect(loop).toMatchObject({
      source: "a",
      target: "a",
      data: { direction: "loop", label: "retry" },
    });
    expect(convertEdgeDirection(loop, "directed")).toBeNull();
    expect(convertEdgeDirection(loop, "bidirectional", "b")).toMatchObject({
      target: "b",
      data: { direction: "bidirectional", label: "retry" },
    });
    expect(toggleEdgeDirection(loop, "directed")).toBe(loop);
    const noData = { ...edge, data: undefined } as GraphEdge;
    expect(convertEdgeDirection(noData, "loop")?.data).toEqual({
      direction: "loop",
      label: "",
    });
    expect(convertEdgeDirection(noData, "directed")?.data).toEqual({
      direction: "directed",
      label: "",
    });
    expect(toggleEdgeDirection(edge, "bidirectional").data?.direction).toBe(
      "bidirectional",
    );
  });

  it("exposes model and reasoning options", () => {
    const document = makeInitialDocument();
    const models = document.models.map((model) => model.id === "codex/gpt-5.6-sol" ? { ...model, enabled: false } : model);
    expect(
      getModelOptions(models, "codex/gpt-5.6-sol").map((model) => model.id),
    ).toEqual(["codex/gpt-5.6-sol"]);
    expect(
      getModelOptions(models, "claude-code/claude-opus-4.8").map((model) => model.id),
    ).toEqual(["claude-code/claude-opus-4.8"]);
    expect(getReasoningOptions()).toEqual(["low", "medium", "high"]);
  });
});
