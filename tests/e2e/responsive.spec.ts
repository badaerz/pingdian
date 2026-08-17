import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", heading: "项目桌面", slug: "dashboard" },
  { path: "/projects/new", heading: "把一个念头", slug: "new-project" },
  { path: "/project/demo/studio", heading: "潮声", slug: "studio" },
  { path: "/project/demo/analysis", heading: "雾港来信", slug: "analysis" },
  { path: "/knowledge", heading: "文学知识图谱", slug: "knowledge" },
  { path: "/training", heading: "写作训练", slug: "training" },
  { path: "/settings", heading: "设置", slug: "settings" },
];

for (const route of routes) {
  test(`${route.slug} renders without horizontal overflow`, async ({ page }, testInfo) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: new RegExp(route.heading) }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `tests/e2e/screenshots/${testInfo.project.name}-${route.slug}.png`, fullPage: true });
  });
}

test("graph has visible pixels or a mobile list alternative", async ({ page }, testInfo) => {
  await page.goto("/knowledge");
  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".mobile-graph-list .graph-list button").first()).toBeVisible();
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
