import { expect, test } from "@playwright/test";

test("homepage keeps the complete logo visible and exposes the next section", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByRole("img", { name: "故事熔炉完整品牌标识" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveCSS("object-fit", "contain");
  const metrics = await logo.evaluate((image: HTMLImageElement) => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    rect: image.getBoundingClientRect().toJSON(),
  }));
  expect(metrics.naturalWidth).toBe(1254);
  expect(metrics.naturalHeight).toBe(1254);
  expect(metrics.rect.bottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  const cornerMarks = page.locator('img[src*="story-forge-mark-20260821.png"]');
  await expect(cornerMarks).toHaveCount(2);
  for (const mark of await cornerMarks.all()) {
    await expect(mark).toBeVisible();
    expect(await mark.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1254);
  }
  await expect(page.locator(".marketing-manifesto")).toBeVisible();
});

test("homepage hydrates without recoverable errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForTimeout(700);
  expect(errors.filter((message) => message.toLowerCase().includes("hydration"))).toEqual([]);
});

test("knowledge graph paths reach their labelled nodes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("literary-path-work")).toBeAttached();
  await page.waitForTimeout(300);
  const distance = await page.getByTestId("literary-path-work").evaluate((line: SVGLineElement) => {
    const svg = line.ownerSVGElement!;
    const point = svg.createSVGPoint();
    point.x = line.x2.baseVal.value;
    point.y = line.y2.baseVal.value;
    const screenPoint = point.matrixTransform(svg.getScreenCTM()!);
    const node = svg.querySelector<SVGGElement>('[data-node="work"]')!.getBoundingClientRect();
    return Math.hypot(screenPoint.x - (node.left + node.width / 2), screenPoint.y - (node.top + node.height / 2));
  });
  expect(distance).toBeLessThan(3);
});

test("knowledge graph shows academic relationship annotations with visible motion", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(300);
  await page.locator("h2").filter({ hasText: "文学知识图谱" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const relations = page.locator('[data-testid^="literary-relation-"]');
  await expect(relations).toHaveCount(4);
  await expect(relations.filter({ hasText: "产出" })).toBeVisible();
  await expect(relations.filter({ hasText: "署名" })).toBeVisible();
  await expect(relations.filter({ hasText: "聚焦" })).toBeVisible();
  await expect(relations.filter({ hasText: "采用" })).toBeVisible();
  const animationName = await page.getByTestId("literary-path-work").evaluate((line) => getComputedStyle(line).animationName);
  expect(animationName).toBe("literary-edge-flow");
  await expect(page.locator(".literary-graph-orbit")).toBeVisible();
});

test("roadmap titles have readable contrast on the light surface", async ({ page }) => {
  await page.goto("/");
  const colors = await page.locator(".marketing-ip-roadmap h3").first().evaluate((element) => {
    const style = getComputedStyle(element);
    const background = getComputedStyle(element.closest("article")!).backgroundColor;
    return { foreground: style.color, background };
  });
  expect(colors.foreground).not.toBe("rgb(255, 255, 255)");
  expect(colors.background).not.toBe("rgb(15, 15, 15)");
});

test("brand orbit nodes use an even six-point distribution", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".brand-orbit")).toBeVisible();
  await page.waitForTimeout(300);
  const geometry = await page.locator(".brand-orbit").evaluate((orbit) => {
    const bounds = orbit.getBoundingClientRect();
    const points = Array.from(orbit.querySelectorAll<HTMLElement>(".brand-orbit-node")).map((node) => {
      const rect = node.getBoundingClientRect();
      const x = ((rect.left + rect.width / 2) - (bounds.left + bounds.width / 2)) / (bounds.width / 2);
      const y = ((rect.top + rect.height / 2) - (bounds.top + bounds.height / 2)) / (bounds.height / 2);
      return { radius: Math.hypot(x, y), angle: Math.atan2(y, x) * 180 / Math.PI };
    }).sort((a, b) => a.angle - b.angle);
    const gaps = points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      return ((next.angle - point.angle) + 360) % 360;
    });
    return { radii: points.map((point) => point.radius), gaps };
  });

  expect(Math.max(...geometry.radii) - Math.min(...geometry.radii)).toBeLessThan(0.02);
  geometry.gaps.forEach((gap) => expect(gap).toBeCloseTo(60, 0));
});

test("workspace pages use the pure graphic brand mark", async ({ page }) => {
  await page.goto("/projects");
  const mark = page.locator('.brand-lockup img[src*="story-forge-mark-20260821.png"]');
  await expect(mark).toBeVisible();
  await expect(page.locator('.brand-lockup img[src*="story-forge-full-logo-20260820.png"]')).toHaveCount(0);
});
