import { expect, test } from "@playwright/test";
import { createUserProject } from "./user-project";

test("candidate only changes prose after explicit confirmation", async ({ page }) => {
  await page.route("**/api/ai", async (route) => {
    const body = await route.request().postDataJSON();
    if (body.task === "continue") {
      await route.fulfill({ json: {
        mode: "demo",
        result: { candidates: [
          { id: "candidate-1", label: "克制推进", content: "雾中的汽笛又响了一次。", rationale: "测试候选", tags: [], status: "pending" },
          { id: "candidate-2", label: "悬念强化", content: "另一段候选正文。", rationale: "测试候选", tags: [], status: "pending" },
        ] },
        warnings: [],
      } });
      return;
    }
    const candidate = body.input.candidate;
    await route.fulfill({ json: {
      mode: "demo",
      result: { consistencyReport: { candidateId: candidate.id, contextRevision: candidate.revision, findings: [], checkedAt: "刚刚", mode: "demo", userConfirmation: "none" } },
      warnings: [],
    } });
  });
  await createUserProject(page, {
    title: "草场回声",
    logline: "一名录音师在废弃矿井旁听见不属于风的回声。",
    characterName: "杭盖",
    place: "草场矿井",
    opening: "杭盖背着专业枪型麦克风，沿着草场向矿井走去。",
  });
  const editor = page.getByTestId("prose-editor");
  await expect(editor).toContainText("杭盖背着专业枪型麦克风");
  const original = await editor.textContent();
  const mobileCandidateToggle = page.getByRole("button", { name: "打开协作区" });
  if (await mobileCandidateToggle.isVisible()) {
    await mobileCandidateToggle.click();
  }
  await page.getByRole("button", { name: "生成续写候选" }).click();
  await expect(page.getByRole("progressbar", { name: "候选生成进度" })).toBeVisible();
  await expect(page.getByText("生成完成")).toBeVisible();
  await expect(page.getByText("低风险提示").first()).toBeVisible();
  expect(await editor.textContent()).toBe(original);
  await page.getByRole("button", { name: "采纳候选" }).first().click();
  await expect(page.getByRole("dialog", { name: "确认采纳" })).toBeVisible();
  expect(await editor.textContent()).toBe(original);
  await page.getByRole("button", { name: "确认采纳" }).click();
  await expect(editor).toContainText("雾中的汽笛");
});

test("user prose survives reload without being replaced by the built-in case", async ({ page }) => {
  await createUserProject(page, {
    title: "刷新保存回归",
    logline: "验证用户正文不会在初始化时被内置案例覆盖。",
    characterName: "阿澜",
    place: "旧档案馆",
    opening: "这是创建项目时的首段。",
  });
  const marker = "刷新后必须保留的用户正文标记。";
  const editor = page.getByLabel("正文编辑器");

  await editor.fill(marker);
  await expect.poll(() => page.evaluate((expected) => {
    const store = JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "null");
    return Object.values(store?.documents ?? {}).some((document: unknown) => {
      const chapters = (document as { chapters?: Array<{ content?: string }> }).chapters ?? [];
      return chapters.some((chapter) => chapter.content === expected);
    });
  }, marker)).toBe(true);
  await page.reload();
  await expect(page.getByLabel("正文编辑器")).toContainText(marker);
  await page.waitForTimeout(650);

  await expect(page.getByLabel("正文编辑器")).toContainText(marker);
  await expect(page.getByLabel("正文编辑器")).not.toContainText("声场的入侵与重返");
});

test("historical built-in URLs return to the empty projects page", async ({ page }) => {
  for (const id of ["demo", "demo-demo_002"]) {
    for (const route of ["studio", "analysis", "ip-lab"]) {
      await page.goto(`/project/${id}/${route}`);
      await expect(page).toHaveURL(/\/projects$/);
      await expect(page.getByText("还没有作品。新建一个，或到首页贴一段文字试试。")).toBeVisible();
    }
  }
});

test("loading, error, and empty dashboard states remain recoverable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "状态切换逻辑仅需运行一次，响应式由独立用例覆盖");
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "加载" }).click();
  await expect(page.getByRole("button", { name: "加载" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "失败" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "项目暂时无法读取" })).toBeVisible();
  await page.getByRole("button", { name: "项目", exact: true }).click();
  await page.getByRole("button", { name: "空状态" }).click();
  await expect(page.getByText("还没有作品。新建一个，或到首页贴一段文字试试。")).toBeVisible();
});

test("legacy user prose survives migration while retired projects disappear", async ({ page }) => {
  const path = await createUserProject(page);
  const id = path.split("/").pop()!;
  await page.evaluate((userId) => {
    const key = "story-forge:projects:v3";
    const { documents } = JSON.parse(localStorage.getItem(key)!);
    const user = documents[userId];
    const legacy = { ...user, project: { ...user.project, id: "demo" } };
    localStorage.setItem("story-forge:projects:v1", JSON.stringify({ version: 1, documents: { demo: legacy, [userId]: user } }));
    localStorage.removeItem(key);
  }, id);
  await page.goto("/projects");
  await page.getByRole("link", { name: "潮汐日记", exact: true }).click();
  await expect(page.getByTestId("prose-editor")).toContainText("屋顶先从海面下露了出来");
  await page.reload();
  await expect(page.getByTestId("prose-editor")).toContainText("屋顶先从海面下露了出来");
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("story-forge:projects:v3")!).documents))).toEqual([id]);
});

test("desktop completes the wizard and enters the real studio", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "完整创作链路只在桌面跑一次");
  await createUserProject(page, {
    title: "潮汐日记",
    logline: "潜水员在退潮后发现一座倒置的房子。",
    characterName: "阿澜",
    place: "退潮海湾",
    opening: "潮水退去后，屋顶先从海面下露了出来。",
  });
  await expect(page.getByRole("button", { name: "正文字号" })).toHaveCount(0);
  await expect(page.getByLabel("正文字号")).toBeVisible();
});

test("desktop clears browser-only user works, training, legacy auth, and generated assets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "本地数据清除链路只需在桌面运行一次");
  await createUserProject(page);
  await page.evaluate(async () => {
    localStorage.setItem("story-forge:training:v1", JSON.stringify([{ id: "attempt-e2e", exerciseId: "EX_001", answer: "待清除训练" }]));
    localStorage.setItem("sb-legacy-auth-token", "legacy-session");
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("story-forge-assets", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("blobs");
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  });

  await page.goto("/settings");
  await expect(page.getByText("零数据保留")).toBeVisible();
  await page.getByRole("button", { name: "清除本地创作数据" }).click();
  await page.getByRole("button", { name: "确认清除" }).click();
  await expect(page.getByText("本地创作数据已清除")).toBeVisible();

  const retained = await page.evaluate(async () => ({
    projects: Object.keys(JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "{}").documents ?? {}),
    training: JSON.parse(localStorage.getItem("story-forge:training:v1") ?? "[]"),
    legacyAuth: localStorage.getItem("sb-legacy-auth-token"),
    assetDatabase: (await indexedDB.databases()).some((database) => database.name === "story-forge-assets"),
  }));
  expect(retained.projects.sort()).toEqual([]);
  expect(retained.training).toEqual([]);
  expect(retained.legacyAuth).toBeNull();
  expect(retained.assetDatabase).toBe(false);
});

test("IP concept ties its storyboard to the active chapter without asset generation", async ({ page }) => {
  const apiCalls: string[] = [];
  await page.route("**/api/{ai,assets/**}", async route => {
    apiCalls.push(route.request().url());
    await route.abort();
  });
  const path = await createUserProject(page);
  await page.goto(`${path}/ip-lab`);
  await expect(page.getByText("当前页面未接入生图链路", { exact: false })).toBeVisible();
  const source = page.locator("blockquote");
  await expect(source).not.toBeEmpty();
  const quote = await source.innerText();
  await expect(page.getByText("原文节选", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "返回作品" }).click();
  await expect(page.getByTestId("prose-editor")).toContainText(quote);
  expect(apiCalls).toEqual([]);
});
