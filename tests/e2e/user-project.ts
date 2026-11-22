import { expect, type Page } from "@playwright/test";

export async function createUserProject(page: Page, project = {
  title: "潮汐日记",
  logline: "潜水员在退潮后发现一座倒置的房子。",
  characterName: "阿澜",
  place: "退潮海湾",
  opening: "潮水退去后，屋顶先从海面下露了出来。",
}) {
  await page.goto("/projects/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("作品名称").fill(project.title);
  await page.getByLabel("一句话灵感").fill(project.logline);
  await page.getByRole("button", { name: "下一步：人物与世界" }).click();
  await page.getByLabel("主角姓名").fill(project.characterName);
  await page.getByLabel("核心地点").fill(project.place);
  await page.getByRole("button", { name: "下一步：故事蓝图" }).click();
  await page.getByRole("button", { name: "下一步：写出首段" }).click();
  await page.getByLabel("作品首段").fill(project.opening);
  await page.getByRole("button", { name: "完成并进入创作台" }).click();
  await expect(page).toHaveURL(/\/project\/project-.+\/studio$/);
  await expect(page.getByTestId("prose-editor")).toContainText(project.opening);
  return new URL(page.url()).pathname.replace(/\/studio$/, "");
}
