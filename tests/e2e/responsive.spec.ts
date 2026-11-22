import { expect, test, type Page } from "@playwright/test";

import { createUserProject } from "./user-project";

const routes = [
  { path: "/projects/new", slug: "new-project", ready: (page: Page) => page.getByLabel("作品名称") },
  { path: "/studio", slug: "studio", ready: (page: Page) => page.getByLabel("正文编辑器") },
  { path: "/analysis", slug: "analysis", ready: (page: Page) => page.getByRole("main") },
];

for (const route of routes) {
  test(`${route.slug} renders without horizontal overflow`, async ({ page }) => {
    const prefix = route.path === "/projects/new" ? "" : await createUserProject(page);
    await page.goto(prefix + route.path);
    await expect(route.ready(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("graph has visible pixels or a mobile list alternative", async ({ page }, testInfo) => {
  await page.goto("/knowledge");
  if (testInfo.project.name === "mobile") {
    const mobileList = page.locator(".mobile-graph-list");
    await expect(mobileList.locator(".graph-list button").first()).toBeVisible();
    await expect.poll(() => mobileList.locator(".graph-list button").count()).toBeGreaterThan(10);
    await expect.poll(() => mobileList.evaluate((element) => element.clientHeight >= 240 && element.scrollHeight > element.clientHeight)).toBe(true);
    return;
  }
  const graph = page.getByTestId("character-graph");
  await expect(graph).toBeVisible();
  await expect.poll(async () => graph.locator("canvas").count()).toBeGreaterThan(0);
  const ratios = await graph.locator("canvas").evaluateAll((canvases: HTMLCanvasElement[]) => canvases.map((canvas) => {
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) colored += 1;
    return colored / (pixels.length / 4);
  }));
  expect(Math.max(...ratios)).toBeGreaterThan(0.001);
});

test("uploaded knowledge graph keeps table row selection usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "桌面图谱交互专用回归");
  await page.route("**/api/ai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: {
        sourceKind: "narrative",
        evidence: [{ id: "e1", source: "observation", quote: "守夜人在码头等待。", note: "原文" }],
        knowledgeGraph: {
          nodes: [
            { id: "character-1", label: "守夜人", type: "character", evidenceIds: ["e1"], confidence: 0.9 },
            { id: "event-1", label: "等待", type: "event", evidenceIds: ["e1"], confidence: 0.8 },
          ],
          edges: [{ id: "edge-1", source: "character-1", target: "event-1", label: "参与", evidenceIds: ["e1"], confidence: 0.8 }],
        },
      } }),
    });
  });
  await page.goto("/knowledge");
  await page.getByRole("tab", { name: "我的文本" }).click();
  await page.getByLabel("粘贴待分析文本").fill("守夜人在码头等待。");
  await page.getByRole("button", { name: "分析文本" }).click();
  await expect(page.getByTestId("academic-graph-canvas")).toBeVisible();
  await page.getByRole("button", { name: "表格" }).click();
  const row = page.getByTestId("academic-graph-table").getByRole("button", { name: /守夜人/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("complementary", { name: "图谱证据详情" })).toContainText("守夜人在码头等待。");
});

test("studio center column stays inside the viewport and scrolls independently", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "桌面三栏布局专用回归");
  await createUserProject(page);

  const writingArea = page.locator(".writing-area");
  const writingScroll = page.locator(".writing-scroll");
  const editor = page.getByLabel("正文编辑器");
  await expect(writingArea).toBeVisible();
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await editor.fill(Array.from({ length: 80 }, (_, index) => `第 ${index + 1} 段，风穿过草场与矿井之间的旧钢索。`).join("\n\n"));

  const metrics = await writingScroll.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const writingArea = element.parentElement!.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      right: rect.right,
      writingAreaRight: writingArea.right,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.writingAreaRight + 1);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  await writingScroll.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => writingScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator(".word-count")).toBeVisible();
});

test("studio header action labels stay on one line", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "桌面三栏布局专用回归");
  await createUserProject(page);

  const actionHeights = await page.locator(".writing-actions .button:visible").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(Math.max(...actionHeights)).toBeLessThanOrEqual(44);
});

test("studio title never enters the action toolbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "桌面工具栏专用回归");
  await createUserProject(page);

  const geometry = await page.locator(".writing-head").evaluate((header) => {
    const title = header.querySelector("h1")!.getBoundingClientRect();
    const actions = header.querySelector(".writing-actions")!.getBoundingClientRect();
    return { titleRight: title.right, actionsLeft: actions.left };
  });
  expect(geometry.titleRight).toBeLessThanOrEqual(geometry.actionsLeft - 8);
});
