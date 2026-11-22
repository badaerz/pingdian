import { expect, test } from "@playwright/test";
import { fixtureForTask } from "../../src/lib/ai/fixtures";

import { createUserProject } from "./user-project";

const replay = "/project/reading/analysis?sample=denggao";

test("the first-screen animation leaves navigation usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "每一句，都有出处。" })).toBeVisible();
  await page.getByRole("button", { name: /跳过/ }).click();
  await page.getByRole("link", { name: /贴一段文字试试/ }).click();
  await expect(page.getByLabel("贴一段你写的文字")).toBeInViewport();
  await expect(page.getByRole("button", { name: "开始诊断" })).toBeVisible();
  const source = "雾压在河岸上，船工把最后一根缆绳绕在木桩上。桥洞里传来两声钟响，水里的灯影晃了晃。";
  await page.route("**/api/ai", async route => {
    const body = route.request().postDataJSON();
    expect(body.task).toBe("analysis-v2");
    expect(body.input.sourceText).toBe(source);
    await route.fulfill({ json: { mode: "demo", warnings: [], result: fixtureForTask(body.task, body.project, body.input) } });
  });
  await page.getByLabel("贴一段你写的文字").fill(source);
  await page.getByRole("button", { name: "开始诊断" }).click();
  await expect(page).toHaveURL(/\/project\/project-.+\/analysis\?read=1$/);
  const workbench = page.getByRole("region", { name: "原文与批注核对" });
  await expect(workbench.getByLabel("演示结果")).toBeVisible();
  await workbench.getByRole("region", { name: "批注流" }).getByRole("button").first().click();
  const anchor = workbench.locator(".ew-anchor[aria-pressed=true]").first();
  await expect(anchor).toBeVisible();
  expect(source).toContain(await anchor.innerText());
});

test("reduced motion immediately shows the final reading state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".ink-hero .still")).toHaveText("无边落木萧萧下");
  await expect(page.locator(".ink-hero .still")).toHaveCSS("opacity", "1");
  await expect(page.locator(".ink-hero h1")).toHaveCSS("opacity", "1");
  await expect(page.locator(".ink-hero[data-flow]")).toHaveCount(0);
});

test("changing a diagnosis highlights its quote and replaces the evidence", async ({ page }) => {
  await page.goto(replay);
  const notes = page.getByRole("region", { name: "批注流" });
  const evidence = page.getByRole("region", { name: "证据", exact: true }).getByRole("blockquote");
  const first = page.getByRole("button", { name: "无边落木萧萧下，", exact: true });
  const second = page.getByRole("button", { name: "百年多病独登台。", exact: true });
  await expect(evidence).toHaveText("无边落木萧萧下，");
  await notes.getByRole("button", { name: /^\[02\]/ }).click();
  await expect(evidence).toHaveText("百年多病独登台。");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await first.focus();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await first.press("Enter");
  await expect(notes.getByRole("button", { name: /^\[01\]/ })).toHaveAttribute("aria-pressed", "true");
});

test("the archived poem displays four couplets and marks the missing dimension", async ({ page }) => {
  await page.goto(replay);
  const couplets = page.locator(".ew-couplet");
  await expect(couplets).toHaveText([
    "风急天高猿啸哀，渚清沙白鸟飞回。",
    "无边落木萧萧下，不尽长江滚滚来。",
    "万里悲秋常作客，百年多病独登台。",
    "艰难苦恨繁霜鬓，潦倒新停浊酒杯。",
  ]);
  await page.evaluate(() => document.fonts.ready);
  expect(await couplets.evaluateAll(rows => rows.every(row => {
    const range = document.createRange();
    range.selectNodeContents(row);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0);
    return rects.every(rect => Math.abs(rect.top - rects[0].top) < 2);
  }))).toBe(true);
  await expect(page.locator(".ew-dimension")).toHaveCount(6);
  await expect(page.getByText("连贯衔接", { exact: true }).locator("..")).toHaveText("连贯衔接 · 未记录");
});

test("training binds a verbatim quote to the feedback it supports", async ({ page }) => {
  const quote = "铁马叮当响";
  await page.route("**/api/ai", async route => {
    expect(route.request().postDataJSON().task).toBe("training-feedback-v2");
    await route.fulfill({ json: { mode: "demo", result: { trainingFeedback: {
      strengths: ["用声音让场景先立住。"], evidenceQuotes: [quote], issues: ["再加一处身体感受。"],
      evidenceBindings: [{ quote, group: "strengths", index: 0 }], nextExperiment: "加一处触觉。", questions: [],
      scores: [{ dimension: "证据具体性", score: 60, reason: "有可逐字核对的动作。" }],
    } } } });
  });
  await page.goto("/training?exercise=EX_006");
  await page.getByRole("textbox", { name: "练习文本" }).fill("铁马叮当响，他把手插进袖子里。");
  await page.getByRole("button", { name: "提交练习" }).click();
  await page.getByRole("button", { name: /铁马叮当响.*做到了 1/ }).click();
  await expect(page.locator("mark").filter({ hasText: quote })).toHaveAttribute("data-active", "true");
  await expect(page.getByText("用声音让场景先立住。")).toHaveAttribute("data-active", "true");
  await expect(page.getByText("再加一处身体感受。")).toHaveAttribute("data-active", "false");
  const revision = "铁马叮当响，他把发凉的手插进袖子里。";
  await page.getByRole("button", { name: /再写一版/ }).click();
  await page.getByRole("textbox", { name: "练习文本" }).fill(revision);
  await page.getByRole("button", { name: "提交练习" }).click();
  const wipe = page.getByRole("slider", { name: "擦除对比" });
  await expect(page.getByLabel("上一版", { exact: true })).toHaveText("铁马叮当响，他把手插进袖子里。");
  await expect(page.getByLabel("这一版", { exact: true })).toHaveText(revision);
  await wipe.press("End");
  await expect(wipe).toHaveAttribute("aria-valuetext", "显示这一版 100%");
  await wipe.press("Home");
  await expect(wipe).toHaveAttribute("aria-valuetext", "显示这一版 0%");
});

test("all five reading font sizes fit the writing viewport", async ({ page }) => {
  await createUserProject(page);
  const size = page.getByLabel("正文字号");
  const prose = page.getByLabel("正文编辑器");
  await expect(size.locator("option")).toHaveCount(5);
  for (const px of [16, 18, 20, 22, 24]) {
    await size.selectOption(String(px));
    await expect(prose).toHaveCSS("font-size", `${px}px`);
    await expect.poll(() => prose.evaluate(el => el.scrollWidth <= el.clientWidth && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.reload();
  await expect(prose).toHaveCSS("font-size", "24px");
});
