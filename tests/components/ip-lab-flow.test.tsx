import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IpLabWorkspace } from "@/components/ip-lab/ip-lab-workspace";
import { createStoryStore, STORY_STORE_KEY } from "@/lib/story-store";
import { StoryProvider } from "@/providers/story-provider";

const { loadAssetBlob, saveAssetBlob } = vi.hoisted(() => ({ loadAssetBlob: vi.fn().mockResolvedValue(undefined), saveAssetBlob: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/assets/indexed-db", () => ({ loadAssetBlob, saveAssetBlob }));

const capabilities = {
  models: [{ id: "Qwen/Qwen-Image", label: "Qwen Image" }],
  sizes: ["1328x1328", "1664x928", "928x1664", "1472x1140", "1140x1472", "1584x1056", "1056x1584"],
  advanced: {
    seed: { type: "number", min: 0, max: 2147483647, transport: "draft-only" },
    steps: { type: "number", min: 1, max: 50, transport: "draft-only" },
    guidance: { type: "number", min: 1, max: 20, transport: "draft-only" },
  },
  transport: { model: "provider-native", prompt: "provider-native", negativePrompt: "compiled-prompt", size: "draft-only" },
};

beforeEach(() => {
  localStorage.clear();
  loadAssetBlob.mockReset();
  loadAssetBlob.mockResolvedValue(undefined);
  saveAssetBlob.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("keeps the visual brief and image as candidates until the user confirms them", async () => {
  const user = userEvent.setup();
  const responses = [
    { mode: "demo", result: { visualBrief: { title: "回响的草场·角色主视觉", subject: "杭盖", composition: "人物位于画面左侧，废弃矿区在右侧展开", palette: ["森林绿", "信号金"], atmosphere: "文学感、克制、可辨识的时代细节", negativePrompt: "文字、水印" } }, warnings: [] },
    { mode: "demo", asset: { id: "asset-1", kind: "character-visual", title: "杭盖主视觉", previewUrl: "/visuals/ip-lab-character.webp", mode: "demo" }, warnings: ["实时生成不可用，已返回演示资产。"] },
    { mode: "demo", result: { storyboard: [1, 2, 3, 4, 5, 6].map((shot) => ({ shot, framing: shot % 2 ? "远景" : "中景", action: `${shot}号叙事动作`, sound: "环境底噪", prompt: "文学改编镜头" })) }, warnings: [] },
  ];
  vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
    if (String(input) === "/api/assets/capabilities") return Promise.resolve(new Response(JSON.stringify(capabilities), { status: 200 }));
    if (String(input).startsWith("/visuals/")) return Promise.resolve(new Response(new Blob(["demo-image"], { type: "image/png" }), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify(responses.shift()), { status: 200 }));
  }));

  render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "生成视觉简报" }));
  expect(await screen.findByText(/主体：杭盖/)).toBeVisible();
  expect(screen.getByRole("button", { name: "生成主视觉" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "确认视觉简报" }));
  await user.click(screen.getByRole("button", { name: "生成主视觉" }));
  expect(await screen.findByText("演示兜底")).toBeVisible();
  expect(saveAssetBlob).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "杭盖主视觉" })).toHaveStyle({ objectFit: "contain" });

  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  await user.click(screen.getByRole("button", { name: "确认保存图像" }));
  expect(saveAssetBlob).toHaveBeenCalledWith("asset-1", expect.any(Blob));
  expect(anchorClick).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "下载图像" })).toBeVisible();
  expect(screen.getByRole("button", { name: "查看大图" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "查看大图" }));
  const imageDialog = screen.getByRole("dialog", { name: "杭盖主视觉" });
  expect(imageDialog).toBeVisible();
  expect(within(imageDialog).getByRole("img", { name: "杭盖主视觉" })).toHaveStyle({ transform: "scale(1)" });
  await user.click(screen.getByRole("button", { name: "放大大图" }));
  expect(within(imageDialog).getByRole("img", { name: "杭盖主视觉" })).toHaveStyle({ transform: "scale(1.2)" });
  await user.click(screen.getByRole("button", { name: "重置大图" }));
  expect(within(imageDialog).getByRole("img", { name: "杭盖主视觉" })).toHaveStyle({ transform: "scale(1)" });
  await user.click(screen.getByRole("button", { name: "关闭大图" }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(STORY_STORE_KEY) ?? "{}").documents.demo.ipAssets[0].previewUrl).toBe("indexeddb://asset-1"));
  await user.click(screen.getByRole("button", { name: "生成六镜头分镜" }));
  expect(await screen.findByText(/06 中景/)).toBeVisible();
  expect(screen.getByText("演示分镜")).toBeVisible();
});

it("keeps image generation progress beside the image controls and preview instead of at page level", async () => {
  const user = userEvent.setup();
  let resolveImage: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/assets/capabilities") return Promise.resolve(new Response(JSON.stringify(capabilities), { status: 200 }));
    if (url === "/api/ai") return Promise.resolve(new Response(JSON.stringify({
      mode: "demo",
      result: { visualBrief: { title: "视觉简报", subject: "杭盖", composition: "草原构图", palette: ["冷绿"], atmosphere: "克制", negativePrompt: "文字" } },
      warnings: [],
    }), { status: 200 }));
    if (url === "/api/assets/generate") return new Promise<Response>((resolve) => { resolveImage = resolve; });
    throw new Error(`Unexpected request: ${url}`);
  }));

  render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "生成视觉简报" }));
  await user.click(await screen.findByRole("button", { name: "确认视觉简报" }));
  await user.click(screen.getByRole("button", { name: "生成主视觉" }));
  await waitFor(() => expect(resolveImage).toBeTypeOf("function"));

  const imageStage = screen.getByText("02 / Image candidate").closest("section");
  expect(imageStage).not.toBeNull();
  expect(within(imageStage as HTMLElement).getAllByRole("progressbar")).toHaveLength(2);
  expect(screen.queryByRole("progressbar", { name: "图像候选进度" })).not.toBeInTheDocument();
  expect(within(imageStage as HTMLElement).getByRole("progressbar", { name: "图像生成控制进度" })).toBeVisible();
  expect(within(imageStage as HTMLElement).getByRole("progressbar", { name: "图像预览生成进度" })).toBeVisible();

  resolveImage?.(new Response(JSON.stringify({
    mode: "demo",
    asset: { id: "asset-progress", kind: "character-visual", title: "主视觉", previewUrl: "/visuals/ip-lab-character.webp", mode: "demo", confirmed: false },
    warnings: [],
  }), { status: 200 }));
});

it("shows the submitted image task state without waiting for provider completion", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/assets/capabilities") return Promise.resolve(new Response(JSON.stringify(capabilities), { status: 200 }));
    if (url === "/api/ai") return Promise.resolve(new Response(JSON.stringify({
      mode: "demo",
      result: { visualBrief: { title: "视觉简报", subject: "杭盖", composition: "草原构图", palette: ["冷绿"], atmosphere: "克制", negativePrompt: "文字" } },
      warnings: [],
    }), { status: 200 }));
    if (url === "/api/assets/generate") return Promise.resolve(new Response(JSON.stringify({
      mode: "live",
      asset: { id: "pending-asset", kind: "character-visual", title: "主视觉", previewUrl: "", mode: "live", confirmed: false, generationStatus: "pending", providerTaskId: "task-pending" },
      warnings: ["图像任务已提交，正在等待 ModelScope 返回结果。"],
    }), { status: 200 }));
    if (url === "/api/assets/status") return Promise.resolve(new Response(JSON.stringify({ status: "pending" }), { status: 200 }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "生成视觉简报" }));
  await user.click(await screen.findByRole("button", { name: "确认视觉简报" }));
  await user.click(screen.getByRole("button", { name: "生成主视觉" }));

  expect(await screen.findByText("图像任务已提交，正在等待 ModelScope 返回结果。" )).toBeVisible();
  expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/assets/generate")).toHaveLength(1);
});

it("surfaces the API warning when a visual brief response has no usable candidate", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/assets/capabilities") return Promise.resolve(new Response(JSON.stringify(capabilities), { status: 200 }));
    if (url === "/api/ai") return Promise.resolve(new Response(JSON.stringify({
      mode: "demo",
      result: {},
      warnings: ["模型返回结构或证据不符合任务要求，已使用离线演示结果。"],
    }), { status: 200 }));
    throw new Error(`Unexpected request: ${url}`);
  }));

  render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "生成视觉简报" }));

  expect(await screen.findByText("模型返回结构或证据不符合任务要求，已使用离线演示结果。" )).toBeVisible();
  expect(screen.getByRole("button", { name: "生成视觉简报" })).toBeEnabled();
});

it("keeps AI-recommended settings as an editable draft until the user explicitly applies them", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/assets/capabilities") return Promise.resolve(new Response(JSON.stringify(capabilities), { status: 200 }));
    if (String(input) === "/api/ai") {
      const body = JSON.parse(String(init?.body));
      expect(body.task).toBe("image-parameter-recommendation");
      expect(body.input.sourceText).toContain("海风把旧信吹到潮湿的桌面");
      return Promise.resolve(new Response(JSON.stringify({
        mode: "demo",
        task: "image-parameter-recommendation",
        result: {
          imageRecommendation: {
            settings: {
              prompt: "潮湿码头、旧信、克制电影光线",
              negativePrompt: "文字，水印，过饱和",
              model: "Qwen/Qwen-Image",
              size: "1664x928",
              advanced: { seed: 7, steps: 32, guidance: 7 },
            },
            reasons: { prompt: "保留文本中的关键意象。", size: "横幅适合呈现码头空间关系。" },
            confidence: 0.86,
          },
        },
        warnings: ["AI 推荐结果为演示模式，可继续编辑。"],
      }), { status: 200 }));
    }
    if (String(input) === "/api/assets/generate") return Promise.resolve(new Response(JSON.stringify({ error: "UNEXPECTED_GENERATION" }), { status: 500 }));
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);

  const upload = new File(["海风把旧信吹到潮湿的桌面。"], "source.md", { type: "text/markdown" });
  await user.upload(screen.getByLabelText("上传临时文本"), upload);
  await user.click(screen.getByRole("button", { name: "分析临时文本" }));
  await user.click(screen.getByRole("button", { name: "AI 推荐参数" }));

  const recommendationStage = screen.getByText("00 / Parameter advisor").closest("section");
  expect(recommendationStage).not.toBeNull();
  expect(within(recommendationStage as HTMLElement).getByRole("progressbar", { name: "AI 参数推荐进度" })).toBeVisible();
  expect(screen.queryByRole("progressbar", { name: "AI 参数推荐进度" })).toBeInTheDocument();
  expect(await screen.findByText("AI 参数草案")).toBeVisible();
  expect(screen.getByText("演示推荐")).toBeVisible();
  expect(screen.getByLabelText("正向提示词")).not.toHaveValue("潮湿码头、旧信、克制电影光线");
  expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/assets/generate")).toHaveLength(0);

  await user.click(screen.getByRole("button", { name: "应用推荐正向提示词" }));
  expect(screen.getByLabelText("正向提示词")).toHaveValue("潮湿码头、旧信、克制电影光线");
  expect(screen.getByLabelText("画面尺寸")).not.toHaveValue("1664x928");
  expect(screen.getByLabelText("随机种子")).toHaveValue(null);

  await user.click(screen.getByRole("button", { name: "应用推荐随机种子" }));
  expect(screen.getByLabelText("随机种子")).toHaveValue(7);
  expect(screen.getByLabelText("画面尺寸")).not.toHaveValue("1664x928");

  await user.click(screen.getByRole("button", { name: "全部应用推荐参数" }));
  expect(screen.getByLabelText("负向提示词")).toHaveValue("文字，水印，过饱和");
  expect(screen.getByLabelText("画面尺寸")).toHaveValue("1664x928");
  expect(screen.getByLabelText("随机种子")).toHaveValue(7);
  expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/assets/generate")).toHaveLength(0);
});

it("submits exactly the user-edited whitelisted settings only after explicit image generation", async () => {
  const user = userEvent.setup();
  const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const requestedSettings = { prompt: "用户编辑的海报提示词", negativePrompt: "文字，水印", model: "Qwen/Qwen-Image", size: "928x1664", advanced: { steps: 30 } };
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (url === "/api/assets/capabilities") return Promise.resolve(new Response(JSON.stringify(capabilities), { status: 200 }));
    if (url === "/api/ai") return Promise.resolve(new Response(JSON.stringify({
      mode: "demo",
      result: { visualBrief: { title: "视觉简报", subject: "沈砚", composition: "码头横向构图", palette: ["深墨", "铜金"], atmosphere: "克制", negativePrompt: "文字" } },
      warnings: [],
    }), { status: 200 }));
    if (url === "/api/assets/generate") {
      const body = JSON.parse(String(init?.body)) as { kind: "character-visual" | "poster"; title: string; characterId?: string; settings: typeof requestedSettings };
      return Promise.resolve(new Response(JSON.stringify({
        mode: "demo",
        asset: { id: "asset-edited", kind: body.kind, title: body.title, characterId: body.characterId, previewUrl: "/visuals/ip-lab-poster.webp", mode: "demo", confirmed: false, createdAt: "2026-08-20T00:00:00.000Z", requestedSettings: body.settings },
        warnings: ["未配置服务端图像密钥，已返回演示资产。"],
      }), { status: 200 }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "文学海报" }));
  await user.clear(screen.getByLabelText("正向提示词"));
  await user.type(screen.getByLabelText("正向提示词"), "用户编辑的海报提示词");
  await user.clear(screen.getByLabelText("负向提示词"));
  await user.type(screen.getByLabelText("负向提示词"), "文字，水印");
  await user.selectOptions(screen.getByLabelText("画面尺寸"), "928x1664");
  await user.clear(screen.getByLabelText("采样步数"));
  await user.type(screen.getByLabelText("采样步数"), "30");
  await user.click(screen.getByRole("button", { name: "生成视觉简报" }));
  await user.click(await screen.findByRole("button", { name: "确认视觉简报" }));

  expect(requests.filter((item) => item.url === "/api/assets/generate")).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "生成主视觉" }));

  const generationRequest = requests.find((item) => item.url === "/api/assets/generate");
  expect(generationRequest?.body).toMatchObject({
    kind: "poster",
    settings: requestedSettings,
  });
  expect(await screen.findByText("演示兜底")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "角色主视觉" }));
  await user.clear(screen.getByLabelText("正向提示词"));
  await user.type(screen.getByLabelText("正向提示词"), "重试前用户又编辑了参数");
  await user.click(screen.getByRole("button", { name: "重试图像生成" }));
  await waitFor(() => expect(requests.filter((item) => item.url === "/api/assets/generate")).toHaveLength(2));
  const firstRequest = requests.filter((item) => item.url === "/api/assets/generate")[0];
  const retryRequest = requests.filter((item) => item.url === "/api/assets/generate").at(-1);
  expect(retryRequest?.body).toEqual(firstRequest?.body);
});

it("loads image settings from the project selected by the route instead of retaining the initial project settings", async () => {
  const store = createStoryStore();
  store.documents["demo-demo_002"].imageGenerationSettings = {
    prompt: "第二个项目专属提示词",
    negativePrompt: "第二个项目负向词",
    model: "Qwen/Qwen-Image",
    size: "1472x1140",
    advanced: { steps: 35 },
  };
  localStorage.setItem(STORY_STORE_KEY, JSON.stringify(store));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(capabilities), { status: 200 })));

  render(<StoryProvider><IpLabWorkspace projectId="demo-demo_002" /></StoryProvider>);

  expect(await screen.findByDisplayValue("第二个项目专属提示词")).toBeVisible();
  expect(screen.getByLabelText("画面尺寸")).toHaveValue("1472x1140");
  expect(screen.getByLabelText("采样步数")).toHaveValue(35);
});

it("validates upload bytes and MIME before reading, and reports read failures", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(capabilities), { status: 200 })));
  render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);
  const input = screen.getByLabelText("上传临时文本");

  const oversized = new File([new Uint8Array(128 * 1024 + 1)], "oversized.txt", { type: "text/plain" });
  const oversizedText = vi.fn().mockResolvedValue("不应读取");
  Object.defineProperty(oversized, "text", { value: oversizedText });
  await user.upload(input, oversized);
  expect(await screen.findByText(/文件大小不能超过 128 KB/)).toBeVisible();
  expect(oversizedText).not.toHaveBeenCalled();

  const wrongMime = new File(["正文"], "source.md", { type: "application/json" });
  const wrongMimeText = vi.fn().mockResolvedValue("不应读取");
  Object.defineProperty(wrongMime, "text", { value: wrongMimeText });
  await user.upload(input, wrongMime);
  expect(await screen.findByText(/文件类型与 TXT 或 MD 不匹配/)).toBeVisible();
  expect(wrongMimeText).not.toHaveBeenCalled();

  const unreadable = new File(["正文"], "source.md", { type: "text/markdown" });
  Object.defineProperty(unreadable, "text", { value: vi.fn().mockRejectedValue(new Error("read failed")) });
  await user.upload(input, unreadable);
  expect(await screen.findByText(/临时文本读取失败/)).toBeVisible();
});

it("clears project-scoped work and ignores a recommendation that resolves after route project changes", async () => {
  const user = userEvent.setup();
  let resolveRecommendation: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
    if (String(input) === "/api/assets/capabilities") return Promise.resolve(new Response(JSON.stringify(capabilities), { status: 200 }));
    if (String(input) === "/api/ai") return new Promise<Response>((resolve) => { resolveRecommendation = resolve; });
    throw new Error(`Unexpected request: ${String(input)}`);
  }));
  const view = render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);
  await user.upload(screen.getByLabelText("上传临时文本"), new File(["旧项目临时正文"], "old.md", { type: "text/markdown" }));
  await user.click(screen.getByRole("button", { name: "分析临时文本" }));
  await user.click(screen.getByRole("button", { name: "AI 推荐参数" }));
  await waitFor(() => expect(resolveRecommendation).toBeTypeOf("function"));

  view.rerender(<StoryProvider><IpLabWorkspace projectId="demo-demo_002" /></StoryProvider>);
  expect(await screen.findByText("上传 TXT / MD")).toBeVisible();
  expect(screen.getByRole("button", { name: "AI 推荐参数" })).toBeEnabled();
  resolveRecommendation?.(new Response(JSON.stringify({
    mode: "live",
    result: { imageRecommendation: { settings: { prompt: "旧项目推荐", negativePrompt: "", model: "Qwen/Qwen-Image", size: "1328x1328", advanced: {} }, reasons: {}, confidence: 0.9 } },
    warnings: [],
  }), { status: 200 }));

  await waitFor(() => expect(screen.queryByText("旧项目推荐")).not.toBeInTheDocument());
  expect(screen.queryByText("AI 参数草案")).not.toBeInTheDocument();
});

it("clears confirmation state and ignores an image candidate that resolves after route project changes", async () => {
  const user = userEvent.setup();
  let resolveImage: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/assets/capabilities") return Promise.resolve(new Response(JSON.stringify(capabilities), { status: 200 }));
    if (url === "/api/ai") return Promise.resolve(new Response(JSON.stringify({
      mode: "demo",
      result: { visualBrief: { title: "旧项目视觉简报", subject: "杭盖", composition: "草原", palette: ["深墨"], atmosphere: "克制", negativePrompt: "文字" } },
      warnings: [],
    }), { status: 200 }));
    if (url === "/api/assets/generate") return new Promise<Response>((resolve) => { resolveImage = resolve; });
    throw new Error(`Unexpected request: ${url}`);
  }));
  const view = render(<StoryProvider><IpLabWorkspace projectId="demo" /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "生成视觉简报" }));
  await user.click(await screen.findByRole("button", { name: "确认视觉简报" }));
  await user.click(screen.getByRole("button", { name: "生成主视觉" }));
  await waitFor(() => expect(resolveImage).toBeTypeOf("function"));

  view.rerender(<StoryProvider><IpLabWorkspace projectId="demo-demo_002" /></StoryProvider>);
  expect(screen.getByRole("button", { name: "生成主视觉" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "生成视觉简报" })).toBeEnabled();
  resolveImage?.(new Response(JSON.stringify({
    mode: "live",
    asset: { id: "stale-image", kind: "character-visual", title: "旧项目图像", previewUrl: "https://cdn.modelscope.cn/stale.png", mode: "live", confirmed: false, createdAt: "2026-08-20T00:00:00.000Z", requestedSettings: { prompt: "旧项目", negativePrompt: "", model: "Qwen/Qwen-Image", size: "1328x1328", advanced: {} } },
    warnings: [],
  }), { status: 200 }));

  await waitFor(() => expect(screen.queryByText("旧项目图像")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "确认保存图像" })).not.toBeInTheDocument();
});
