import { expect, test, type Locator, type Page } from "@playwright/test";

const storageKey = "opengraph.document.v1";

test.describe("OpenGraph", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem("__opengraph-e2e-clean")) {
        localStorage.removeItem(key);
        localStorage.setItem('opengraph.onboarding.v1', 'done');
        sessionStorage.setItem("__opengraph-e2e-clean", "1");
      }

      // Keep Copy graph deterministic in Chromium. The app still exercises its
      // normal PNG generation and clipboard adapter; this only replaces the
      // browser permission boundary with an observable test seam.
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { write: async () => undefined },
      });
    }, storageKey);
    await page.goto("/");
    await expect(page.getByText("OpenGraph")).toBeVisible();
  });

  test("lets a first-time user choose multiple model ecosystems", async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('opengraph.onboarding.v1'));
    await page.reload();
    const dialog = page.getByRole('dialog', { name: 'Which model tools do you use?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Claude Code Claude models used with Anthropic Pro, Max, Team or Enterprise.' }).click();
    await dialog.getByRole('button', { name: 'Kimi Code Kimi coding models included with Kimi Code memberships.' }).click();
    await dialog.getByRole('button', { name: 'Start drawing' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Configure models and reasoning' }).click();
    const settings = page.getByRole('complementary', { name: 'Model settings' });
    await expect(settings.locator('.model-row').filter({ hasText: 'claude-opus-4.8' })).toBeVisible();
    await expect(settings.locator('.model-row').filter({ hasText: 'kimi-for-coding' }).first()).toBeVisible();
    await expect(settings.locator('.model-row').filter({ hasText: 'k3-256k' })).toBeVisible();
    await settings.getByRole('button', { name: 'Add model to Kimi Code' }).click();
    await settings.getByLabel('Model ID').first().fill('kimi-future');
    await settings.getByRole('button', { name: 'Add', exact: true }).click();
    const customKimi = settings.locator('.model-row').filter({ hasText: 'kimi-future' });
    await expect(customKimi).toBeVisible();
    await expect(customKimi.locator('.model-dot')).toHaveAttribute('style', /background:/);
    const kimiGroup = settings.locator('.provider-group').filter({ hasText: 'Kimi Code' });
    await expect(kimiGroup.locator('.provider-chevron')).toBeVisible();
    await kimiGroup.locator('summary').click();
    await expect(customKimi).toBeHidden();
    await kimiGroup.locator('summary').click();
    await expect(customKimi).toBeVisible();
    await expect(settings.getByLabel('Provider')).toBeVisible();
    await expect(settings.getByLabel('Model ID')).toBeVisible();
  });

  test("loads the example, edits a node, connects a loop, and supports undo/redo", async ({
    page,
  }) => {
    await expect(
      page.locator(".workflow-node").filter({ hasText: "1. Ingest" }),
    ).toBeVisible();
    await expect(
      page.locator(".workflow-node").filter({ hasText: "5. Validate" }),
    ).toBeVisible();
    await expect(page.getByText("gpt-5.6-sol").first()).toBeVisible();
    const sameSidePath = await page.evaluate(() => {
      const graph = (
        window as Window & {
          __opengraphDocument?: {
            edges: Array<{
              id: string;
              sourceHandle?: string | null;
              targetHandle?: string | null;
            }>;
          };
        }
      ).__opengraphDocument;
      const edge = graph?.edges.find(
        (item) =>
          item.sourceHandle === "source-right" &&
          item.targetHandle === "target-right",
      );
      return edge ? document.getElementById(edge.id)?.getAttribute("d") : null;
    });
    expect(sameSidePath).toBeTruthy();
    expect(sameSidePath).not.toMatch(/[QC]/);
    await expect(
      page.getByRole("button", { name: "Connect", exact: true }),
    ).toHaveCount(0);

    const canvas = page.locator(".canvas-shell");
    await page
      .getByRole("button", { name: "Node" })
      .dragTo(canvas, { targetPosition: { x: 300, y: 470 } });
    const newNode = page
      .locator(".workflow-node")
      .filter({ hasText: "New step" })
      .last();
    await expect(newNode).toBeVisible();
    await newNode.click();

    const inspector = page.getByRole("complementary", {
      name: "Node settings",
    });
    await expect(inspector).toBeVisible();

    const label = inspector.getByLabel("Label");
    await label.fill("Review output");
    await expect(
      page.locator(".workflow-node").filter({ hasText: "Review output" }),
    ).toBeVisible();
    const editedNode = page
      .locator(".workflow-node")
      .filter({ hasText: "Review output" })
      .last();

    await inspector.getByLabel("Node model").selectOption("gpt-5.6-sol");
    await inspector.getByRole("radio", { name: "high" }).check();
    await expect(editedNode).toContainText("gpt-5.6-sol");
    await expect(editedNode).toContainText("high");

    await page.getByRole("button", { name: "Connect from this node" }).click();
    await editedNode.click();
    await expect(page.getByRole("status")).toContainText("Loop added");
    await expect(page.locator(".react-flow__edge")).toHaveCount(7);
    await expect(
      page.locator(".react-flow__edge path[marker-end]"),
    ).toHaveCount(7);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(6);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(7);
  });

  test("keeps each existing node model independent", async ({ page }) => {
    await page.getByRole("button", { name: "Configure models and reasoning" }).click();
    await page.getByRole("switch", { name: "Enable codex/gpt-5.6-terra" }).click();
    await page.getByRole("button", { name: "Close inspector" }).click();

    const firstNode = page.locator(".workflow-node").filter({ hasText: "1. Ingest" });
    const secondNode = page.locator(".workflow-node").filter({ hasText: "2. Parse & chunk" });
    await expect(firstNode).toContainText("gpt-5.6-sol");
    await expect(secondNode).toContainText("gpt-5.6-sol");

    await firstNode.click();
    const inspector = page.getByRole("complementary", { name: "Node settings" });
    await inspector.getByLabel("Node model").selectOption("codex/gpt-5.6-terra");

    await expect(firstNode).toContainText("gpt-5.6-terra");
    await expect(secondNode).toContainText("gpt-5.6-sol");
    await secondNode.click();
    await expect(inspector.getByLabel("Node model")).toHaveValue("codex/gpt-5.6-sol");
  });

  test("organizes disconnected nodes as one undoable transaction", async ({ page }) => {
    await page.getByRole("button", { name: "New graph", exact: true }).click();
    const canvas = page.locator(".canvas-shell");
    await canvas.dblclick({ position: { x: 180, y: 150 } });
    await page.keyboard.press("Escape");
    await canvas.dblclick({ position: { x: 700, y: 150 } });
    await page.keyboard.press("Escape");
    await canvas.dblclick({ position: { x: 440, y: 480 } });
    await expect(page.locator(".react-flow__node-workflow")).toHaveCount(3);
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
    const beforePositions = await page.locator(".react-flow__node-workflow").evaluateAll(
      (elements) => elements.map((element) => (element as HTMLElement).style.transform),
    );

    await page.getByRole("button", { name: "Organize" }).click();

    await expect(page.locator(".react-flow__edge")).toHaveCount(2);
    await expect(page.getByRole("status")).toContainText(
      "2 connections added · graph organized",
    );
    const organizedPositions = await page.locator(".react-flow__node-workflow").evaluateAll(
      (elements) => elements.map((element) => (element as HTMLElement).style.transform),
    );
    expect(organizedPositions).toHaveLength(3);
    expect(new Set(organizedPositions).size).toBe(3);

    await page.waitForTimeout(700);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
    await expect.poll(() =>
      page.locator(".react-flow__node-workflow").evaluateAll(
        (elements) => elements.map((element) => (element as HTMLElement).style.transform),
      ),
    ).toEqual(beforePositions);
    await expect.poll(() =>
      page.locator(".react-flow__node-workflow").evaluateAll((elements) =>
        elements.filter((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.right > 0 &&
            box.bottom > 80 &&
            box.left < window.innerWidth &&
            box.top < window.innerHeight
          );
        }).length,
      ),
    ).toBe(3);

    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);

    await page.setViewportSize({ width: 700, height: 760 });
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeVisible();
  });

  test("organizes a long PR review cycle as a compact vertical pipeline", async ({
    page,
  }, testInfo) => {
    await page.evaluate((key) => {
      const current = (
        window as Window & {
          __opengraphDocument?: Record<string, unknown>;
        }
      ).__opengraphDocument!;
      const workflow = (id: string, title: string, x: number) => ({
        id,
        type: "workflow",
        position: { x, y: 120 },
        data: {
          kind: "workflow",
          title,
          description: `Responsibilities for ${title}.`,
          modelOverride: null,
          reasoningOverride: null,
        },
      });
      const edge = (
        id: string,
        source: string,
        target: string,
        direction = "directed",
      ) => ({
        id,
        source,
        target,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        type: "workflow",
        data: { direction, label: "" },
        animated: false,
      });
      const document = {
        ...current,
        name: "PR review loop",
        nodes: [
          workflow("intake", "PR list", 40),
          workflow("reviewer", "Reviewer", 480),
          workflow("qa", "QA Assurance", 920),
          {
            id: "qa-note",
            type: "annotation",
            position: { x: 940, y: -80 },
            data: { kind: "annotation", text: "If QA fails, send it to Analyzer" },
          },
          workflow("analyzer", "Analyzer", 1360),
          workflow("worker", "Worker", 1800),
        ],
        edges: [
          edge("intake-reviewer", "intake", "reviewer"),
          edge("reviewer-qa", "reviewer", "qa"),
          edge("qa-analyzer", "qa", "analyzer"),
          edge("analyzer-worker", "analyzer", "worker"),
          edge("qa-worker", "qa", "worker", "bidirectional"),
        ],
      };
      localStorage.removeItem("opengraph.graph-library.v1");
      localStorage.removeItem("opengraph.active-graph.v1");
      localStorage.setItem(key, JSON.stringify(document));
    }, storageKey);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Rename current graph" }),
    ).toContainText("PR review loop");

    await page.getByRole("button", { name: "Organize" }).click();

    const graph = await page.evaluate(() =>
      (window as Window & { __opengraphDocument?: any }).__opengraphDocument,
    );
    const node = (id: string) => graph.nodes.find((item: any) => item.id === id);
    const intake = node("intake");
    const reviewer = node("reviewer");
    const qa = node("qa");
    const analyzer = node("analyzer");
    const worker = node("worker");
    expect(intake.position.x).toBe(reviewer.position.x);
    expect(intake.position.y).toBeLessThan(reviewer.position.y);
    expect(reviewer.position.y).toBeLessThan(qa.position.y);
    expect([qa.position.y, analyzer.position.y, worker.position.y]).toEqual([
      qa.position.y,
      qa.position.y,
      qa.position.y,
    ]);
    expect(qa.position.x).toBeLessThan(analyzer.position.x);
    expect(analyzer.position.x).toBeLessThan(worker.position.x);
    graph.edges.slice(0, 2).forEach((edge: any) =>
      expect(edge).toMatchObject({
        sourceHandle: "source-bottom",
        targetHandle: "target-top",
      }),
    );
    graph.edges.slice(2, 4).forEach((edge: any) =>
      expect(edge).toMatchObject({
        sourceHandle: "source-right",
        targetHandle: "target-left",
      }),
    );
    expect(graph.edges[4]).toMatchObject({
      sourceHandle: "source-bottom",
      targetHandle: "target-bottom",
    });
    const note = node("qa-note");
    expect(note.position.y).toBeLessThan(qa.position.y);
    expect(Math.abs(note.position.x - qa.position.x)).toBeLessThan(100);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: testInfo.outputPath("organized-pr-review-cycle.png"),
      fullPage: true,
    });
  });

  test("starts a blank graph from a canvas double-click", async ({ page }) => {
    await page.getByRole("button", { name: "New graph", exact: true }).click();
    const canvas = page.locator(".canvas-shell");
    await canvas.dblclick({ position: { x: 560, y: 350 } });
    const node = page.locator(".workflow-node");
    await expect(node).toBeVisible();
    await node.click();

    const longTitle =
      "Investigate every application screen, action, destination, and integration";
    const longDescription =
      "Document every available control, where it leads, which endpoint it uses, what information it sends, and how the complete interaction behaves for a developer reviewing the workflow.";
    const inspector = page.getByRole("complementary", {
      name: "Node settings",
    });
    await inspector.getByLabel("Label").fill(longTitle);
    await expect(inspector.getByLabel("Description")).toHaveAttribute(
      "maxlength",
      "450",
    );
    await inspector.getByLabel("Description").fill(longDescription);

    await expect(node.locator("strong")).toHaveText(longTitle);
    await expect(node.locator(".node-description")).toHaveText(longDescription);
    await expect
      .poll(() =>
        node.evaluate((element) => {
          const title = element.querySelector("strong") as HTMLElement;
          const description = element.querySelector(
            ".node-description",
          ) as HTMLElement;
          return (
            title.scrollHeight <= title.clientHeight &&
            description.scrollHeight <= description.clientHeight &&
            (element as HTMLElement).offsetHeight > 150
          );
        }),
      )
      .toBe(true);
  });

  test("connects two nodes, changes the edge to both ways, and persists after reload", async ({
    page,
  }) => {
    await clickNode(page, "1. Ingest");
    await page.getByRole("button", { name: "Connect from this node" }).click();
    await clickNode(page, "5. Validate");
    await expect(page.getByRole("status")).toContainText("Connection added");
    await expect(page.locator(".react-flow__edge")).toHaveCount(7);

    const addedEdge = page.locator(".react-flow__edge").last();
    await addedEdge.locator(".react-flow__edge-path").click({ force: true });
    const edgeInspector = page.getByRole("complementary", {
      name: "Connection settings",
    });
    await expect(edgeInspector).toBeVisible();
    await edgeInspector.getByRole("button", { name: "Both ways" }).click();
    await expect(
      edgeInspector.getByRole("button", { name: "Both ways" }),
    ).toHaveClass(/selected/);
    await expect(addedEdge.locator("path[marker-start]")).toHaveCount(1);
    await expect(addedEdge.locator("path[marker-end]")).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw).edges.length : 0;
        }, storageKey),
      )
      .toBe(7);
    await page.reload();
    await expect(
      page.locator(".workflow-node").filter({ hasText: "1. Ingest" }),
    ).toBeVisible();
    await expect(page.locator(".react-flow__edge")).toHaveCount(7);
    await expect(page.locator(".react-flow__edge").last()).toBeVisible();
  });

  test("pans with a two-axis trackpad scroll without changing zoom", async ({
    page,
  }) => {
    const canvas = page.locator(".canvas-shell");
    const viewport = page.locator(".react-flow__viewport");
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    const before = await viewport.evaluate(
      (element) => (element as HTMLElement).style.transform,
    );
    await page.mouse.move(
      bounds!.x + bounds!.width / 2,
      bounds!.y + bounds!.height / 2,
    );
    await page.mouse.wheel(120, 80);
    await expect
      .poll(() =>
        viewport.evaluate(
          (element) => (element as HTMLElement).style.transform,
        ),
      )
      .not.toBe(before);
    const after = await viewport.evaluate(
      (element) => (element as HTMLElement).style.transform,
    );
    const scaleOf = (transform: string) =>
      transform.match(/scale\(([^)]+)\)/)?.[1];
    expect(scaleOf(after)).toBe(scaleOf(before));
  });

  test("creates, titles, and switches between local graphs", async ({
    page,
  }) => {
    const firstGraph = page.getByRole("button", {
      name: "Workflow",
      exact: true,
    });
    await page.getByRole("button", { name: "New graph", exact: true }).click();
    const title = page.getByLabel("Graph title");
    await expect(title).toBeVisible();
    await title.fill("Review plan");
    await title.press("Enter");
    await expect(page.locator(".sidebar-graph-row.is-active")).toContainText(
      "Review plan",
    );
    await page
      .getByRole("button", { name: "Review plan", exact: true })
      .dblclick();
    const sidebarTitle = page.getByLabel("Rename Review plan");
    await expect(sidebarTitle).toBeVisible();
    await sidebarTitle.fill("Review workflow");
    await sidebarTitle.press("Enter");
    await expect(page.locator(".sidebar-graph-row.is-active")).toContainText(
      "Review workflow",
    );
    await expect(
      page.getByRole("button", { name: "Rename current graph" }),
    ).toContainText("Review workflow");
    await expect(
      page.getByText("Drag a node here or double-click to start."),
    ).toBeVisible();

    const archiveReview = page.getByRole("button", {
      name: "Archive Review workflow",
    });
    await expect(archiveReview).toBeVisible();
    await archiveReview.click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Restore Review workflow" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore Review workflow" }).click();
    await expect(
      page.getByRole("button", { name: "Archive Review workflow" }),
    ).toBeVisible();

    await firstGraph.click();
    await expect(
      page.locator(".workflow-node").filter({ hasText: "1. Ingest" }),
    ).toBeVisible();
    await page
      .locator(".sidebar-graph")
      .filter({ hasText: "Review workflow" })
      .click();
    await expect(
      page.getByText("Drag a node here or double-click to start."),
    ).toBeVisible();

    await page.getByRole("button", { name: "New project" }).click();
    const projectName = page.getByLabel("Project name");
    await expect(projectName).toBeVisible();
    await projectName.fill("Client Atlas");
    await projectName.press("Enter");
    await expect(
      page.getByRole("button", { name: "Client Atlas", exact: true }),
    ).toBeVisible();
  });

  test("adds and connects the next step by double-clicking a node arrow", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "New graph", exact: true }).click();
    await page
      .locator(".canvas-shell")
      .dblclick({ position: { x: 420, y: 320 } });
    const source = page.locator(".workflow-node");
    await expect(source).toHaveCount(1);
    await source.hover();
    const handle = source.getByLabel(
      "Drag to connect, click to choose a destination, or double-click to add the next step",
    );
    const viewport = page.locator(".react-flow__viewport");
    const viewportBefore = await viewport.evaluate(
      (element) => (element as HTMLElement).style.transform,
    );
    await handle.dblclick();

    await expect(page.locator(".workflow-node")).toHaveCount(2);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await page.waitForTimeout(300);
    await expect
      .poll(() =>
        viewport.evaluate(
          (element) => (element as HTMLElement).style.transform,
        ),
      )
      .toBe(viewportBefore);
    await expect(page.getByRole("status")).toContainText(
      "Next step added and connected",
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const graph = (
            window as Window & {
              __opengraphDocument?: {
                nodes: Array<{ position: { x: number } }>;
              };
            }
          ).__opengraphDocument;
          return graph
            ? graph.nodes[1].position.x > graph.nodes[0].position.x
            : false;
        }),
      )
      .toBe(true);
  });

  test("makes mouse-first connections discoverable and toggles a selected edge to both ways", async ({
    page,
  }, testInfo) => {
    const source = await clickNode(page, "1. Ingest");
    await source.hover();
    const connectHandle = source.getByLabel(
      "Drag to connect, click to choose a destination, or double-click to add the next step",
    );
    await expect(connectHandle).toBeVisible();
    await expect(connectHandle).toHaveCSS("opacity", "1");

    await connectHandle.click();
    await expect(page.getByRole("status")).toContainText("Source selected");
    await clickNode(page, "5. Validate");
    await expect(page.getByRole("status")).toContainText("Connection added");
    await expect(page.locator(".react-flow__edge")).toHaveCount(7);

    const addedEdge = page.locator(".react-flow__edge").last();
    await addedEdge.locator(".react-flow__edge-path").click({ force: true });
    const directionToggle = page.getByRole("button", {
      name: "Make connection bidirectional",
    });
    await expect(directionToggle).toBeVisible();
    await directionToggle.click();
    await expect(addedEdge.locator("path[marker-start]")).toHaveCount(1);
    await page.screenshot({
      path: testInfo.outputPath("mouse-first-connections.png"),
      fullPage: true,
    });
  });

  test("changes theme, opens settings, copies the graph, and captures desktop and narrow views", async ({
    page,
  }, testInfo) => {
    await page.screenshot({
      path: testInfo.outputPath("opengraph-light.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Dark appearance" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page
      .getByRole("button", { name: "Configure models and reasoning" })
      .click();
    const settings = page.getByRole("complementary", {
      name: "Model settings",
    });
    await expect(settings).toBeVisible();
    await expect(settings.getByText("Enabled models")).toBeVisible();
    await expect(settings.getByText("Reasoning for new nodes")).toBeVisible();
    await expect(settings.getByLabel("Model", { exact: true })).toHaveCount(0);
    await settings.getByRole("button", { name: "Close inspector" }).click();

    await page.screenshot({
      path: testInfo.outputPath("opengraph-dark.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Copy graph" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Graph copied to clipboard",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("OpenGraph")).toBeVisible();
    await expect(page.locator(".tool-rail")).toHaveCSS("flex-direction", "row");
    await expect(page.locator(".mini-map")).toHaveCount(0);
    await expect(
      page.locator(".workflow-node").filter({ hasText: "1. Ingest" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("opengraph-narrow.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Configure models and reasoning" })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Model settings" }),
    ).toBeVisible();
  });
});

async function clickNode(page: Page, title: string): Promise<Locator> {
  const node = page
    .locator(".workflow-node")
    .filter({ hasText: title })
    .first();
  await expect(node).toBeVisible();
  await node.click();
  return node;
}
