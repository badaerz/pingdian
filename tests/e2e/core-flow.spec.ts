import { expect, test } from "@playwright/test";

test("candidate only changes prose after explicit confirmation", async ({ page }) => {
  await page.goto("/project/demo/studio");
  const editor = page.getByTestId("prose-editor");
  await expect(editor).toContainText("码头的钟停在凌晨三点十七分");
  const original = await editor.textContent();
  const mobileCandidateToggle = page.getByRole("button", { name: "打开候选区" });
  if (await mobileCandidateToggle.isVisible()) {
    await mobileCandidateToggle.click();
  }
  await page.getByRole("button", { name: "续写" }).click();
  await expect(page.getByText("生成完成")).toBeVisible();
  expect(await editor.textContent()).toBe(original);
  await page.getByRole("button", { name: "采纳候选" }).first().click();
  await expect(page.getByRole("dialog", { name: "确认采纳" })).toBeVisible();
  expect(await editor.textContent()).toBe(original);
  await page.getByRole("button", { name: "确认采纳" }).click();
  await expect(editor).toContainText("雾中的汽笛");
});

test("analysis evidence opens with source text", async ({ page }) => {
  await page.goto("/project/demo/analysis");
  await page.getByRole("button", { name: "证据 E1" }).first().click();
  await expect(page.getByRole("dialog", { name: "原文证据" })).toBeVisible();
  await expect(page.getByText("用户文本")).toBeVisible();
});

test("loading, error, and empty dashboard states remain recoverable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "加载" }).click();
  await expect(page.getByLabel("正在加载")).toBeVisible();
  await page.getByRole("button", { name: "失败" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "项目暂时无法读取" })).toBeVisible();
  await page.getByRole("button", { name: "恢复演示数据" }).click();
  await expect(page.getByRole("heading", { name: "雾港来信" })).toBeVisible();
  await page.getByRole("button", { name: "空状态" }).click();
  await expect(page.getByRole("heading", { name: "桌面还是空的" })).toBeVisible();
});
