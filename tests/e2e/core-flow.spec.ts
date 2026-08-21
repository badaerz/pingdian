import { expect, test, type Page } from "@playwright/test";

const defenseLocked = process.env.NEXT_PUBLIC_DEMO_LOCKED === "true";

async function createUserProject(page: Page, project: {
  title: string;
  logline: string;
  characterName: string;
  place: string;
  opening: string;
}) {
  await page.goto("/projects/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("作品名称").fill(project.title);
  await page.getByLabel("一句话灵感").fill(project.logline);
  await expect(page.getByLabel("作品名称")).toHaveValue(project.title);
  await expect(page.getByLabel("一句话灵感")).toHaveValue(project.logline);
  await page.getByRole("button", { name: "下一步：人物与世界" }).click();
  await page.getByLabel("主角姓名").fill(project.characterName);
  await page.getByLabel("核心地点").fill(project.place);
  await page.getByRole("button", { name: "下一步：故事蓝图" }).click();
  await page.getByRole("button", { name: "下一步：写出首段" }).click();
  await page.getByLabel("作品首段").fill(project.opening);
  await page.getByRole("button", { name: "完成并进入创作台" }).click();
  await expect(page).toHaveURL(/\/project\/project-.+\/studio$/);
  await expect(page.getByTestId("prose-editor")).toContainText(project.opening);
}

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

test("defense mode keeps the built-in case read-only while local AI remains usable", async ({ page }) => {
  test.skip(!defenseLocked, "仅在答辩锁定模式运行");
  await page.goto("/project/demo/studio");

  await expect(page.getByRole("status").filter({ hasText: "答辩演示模式" })).toBeVisible();
  await expect(page.getByLabel("章节标题")).toHaveAttribute("readonly", "");
  await expect(page.locator('[aria-label="正文编辑器"]')).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("button", { name: "新增章节" })).toBeDisabled();

  const original = await page.getByTestId("prose-editor").textContent();
  const mobileCandidateToggle = page.getByRole("button", { name: "打开协作区" });
  if (await mobileCandidateToggle.isVisible()) await mobileCandidateToggle.click();
  await page.getByRole("button", { name: "生成续写候选" }).click();
  await expect(page.getByText("生成完成")).toBeVisible();
  await expect(page.getByRole("button", { name: "采纳候选" }).first()).toBeDisabled();
  expect(await page.getByTestId("prose-editor").textContent()).toBe(original);
});

test("analysis evidence opens with source text", async ({ page }) => {
  await page.goto("/project/demo/analysis");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "证据 E1" }).first().click();
  const dialog = page.getByRole("dialog", { name: "原文证据" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("用户文本")).toBeVisible();
});

test("analysis character list can switch and select a person without unmount errors", async ({ page }) => {
  await page.goto("/project/demo/analysis");
  await page.getByRole("tab", { name: "关系网络" }).click();
  const listToggle = page.getByRole("button", { name: "列表" });
  if (await listToggle.isVisible()) await listToggle.click();
  await page.getByRole("button", { name: /杭盖 人物/ }).click();
  await expect(page.getByRole("dialog", { name: "原文证据" })).toBeVisible();
  await page.getByRole("button", { name: "关闭对话框" }).click();
  const graphToggle = page.getByRole("button", { name: "图谱" });
  if (await graphToggle.isVisible()) {
    await graphToggle.click();
    await listToggle.click();
  }
  await expect(page.getByRole("button", { name: /巴特尔 人物/ })).toBeVisible();
  await expect(page.getByText("removeChild", { exact: false })).toHaveCount(0);
});

test("loading, error, and empty dashboard states remain recoverable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "状态切换逻辑仅需运行一次，响应式由独立用例覆盖");
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "加载" }).click();
  await expect(page.getByRole("button", { name: "加载" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "失败" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "项目暂时无法读取" })).toBeVisible();
  await page.getByRole("button", { name: "恢复演示数据" }).click();
  await expect(page.getByRole("heading", { name: "回响的草场", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "空状态" }).click();
  await expect(page.getByRole("heading", { name: "桌面还是空的" })).toBeVisible();
});

test("the primary case link migrates a legacy 雾港 cache to 回响的草场", async ({ page }) => {
  await page.goto("/projects");
  await expect.poll(() => page.evaluate(() => Boolean(window.localStorage.getItem("story-forge:projects:v3")))).toBe(true);
  await page.evaluate(() => {
    const current = JSON.parse(window.localStorage.getItem("story-forge:projects:v3") ?? "null");
    const legacyRegression = structuredClone(current.documents["demo-demo_002"]);
    legacyRegression.project.id = "demo";
    delete legacyRegression.activeChapterId;
    delete legacyRegression.contextRevision;
    delete legacyRegression.workflowStage;
    delete legacyRegression.ipAssets;
    legacyRegression.world = { era: "当代", place: "雾港", rules: "灯塔每夜亮起", atmosphere: "浓雾" };
    delete legacyRegression.worldEntries;
    window.localStorage.removeItem("story-forge:projects:v3");
    window.localStorage.setItem("story-forge:projects:v1", JSON.stringify({ version: 1, documents: { demo: legacyRegression } }));
  });

  await page.goto("/");
  await page.getByRole("link", { name: "查看答辩案例" }).click();

  await expect(page).toHaveURL(/\/project\/demo\/studio$/);
  await expect(page.getByRole("heading", { name: "声场的入侵与重返" })).toBeVisible();
  await expect(page.getByTestId("prose-editor")).toContainText("杭盖背着专业枪型麦克风");
  await expect.poll(() => page.evaluate(() => Boolean(window.localStorage.getItem("story-forge:projects:v3")))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(window.localStorage.getItem("story-forge:projects:v1")))).toBe(true);
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
  await page.goto("/projects");
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("story-forge:projects:v3")))).toBe(true);
  await page.evaluate(async () => {
    const store = JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "null");
    const userDocument = structuredClone(store.documents.demo);
    userDocument.project = { ...userDocument.project, id: "project-e2e-local", title: "待清除本地作品" };
    store.documents["project-e2e-local"] = userDocument;
    localStorage.setItem("story-forge:projects:v3", JSON.stringify(store));
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
    projects: Object.keys(JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "null").documents),
    training: JSON.parse(localStorage.getItem("story-forge:training:v1") ?? "[]"),
    legacyAuth: localStorage.getItem("sb-legacy-auth-token"),
    assetDatabase: (await indexedDB.databases()).some((database) => database.name === "story-forge-assets"),
  }));
  expect(retained.projects.sort()).toEqual(["demo", "demo-demo_002"]);
  expect(retained.training).toEqual([]);
  expect(retained.legacyAuth).toBeNull();
  expect(retained.assetDatabase).toBe(false);
});

test("desktop runs the labelled IP fallback and stores a confirmed local asset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "P2 资产链路只在桌面跑一次");
  await page.route("**/api/ai", async (route) => {
    const task = (await route.request().postDataJSON()).task;
    const content = task === "storyboard" ? "01 远景｜风压低草\n02 中景｜人物举起麦克风\n03 特写｜频谱跳动\n04 反打｜封闭矿井\n05 跟拍｜穿过草场\n06 远景｜低鸣消退" : "矿区声学设备、草场风痕、冷绿与信号金。";
    await route.fulfill({ json: { mode: "demo", result: { candidates: [{ id: `${task}-1`, label: task === "storyboard" ? "六镜头分镜" : "视觉简报", content, rationale: "演示链路", tags: [], status: "pending" }] }, warnings: [] } });
  });
  await page.route("**/api/assets/generate", (route) => route.fulfill({ json: { mode: "demo", asset: { id: "asset-e2e", kind: "character-visual", title: "杭盖主视觉", previewUrl: "/visuals/ip-lab-character.webp", mode: "demo", createdAt: new Date().toISOString(), confirmed: false }, warnings: ["实时生成不可用，已返回演示资产。"] } }));
  await page.goto("/project/demo/ip-lab");
  await page.getByRole("button", { name: "生成视觉简报" }).click();
  await page.getByRole("button", { name: "确认视觉简报" }).click();
  await page.getByRole("button", { name: "生成主视觉" }).click();
  await expect(page.getByText("演示兜底")).toBeVisible();
  await page.getByRole("button", { name: "确认保存图像" }).click();
  await expect(page.getByRole("button", { name: "确认保存图像" })).toBeDisabled();
  await page.getByRole("button", { name: "生成六镜头分镜" }).click();
  await expect(page.getByText(/06 远景/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "null").documents.demo.ipAssets[0]?.previewUrl)).toBe("indexeddb://asset-e2e");
});
