import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { AnalysisDiagnostics } from "@/components/analysis/analysis-diagnostics";
import { StoryProvider } from "@/providers/story-provider";
import * as StoryProviderModule from "@/providers/story-provider";
import { afterEach, vi } from "vitest";

it("offers the exercise directory when the diagnosis has no linked exercise", () => {
  const diagnostic = { ...completeAnalysisV2.diagnostics[0], trainingExerciseId: undefined };
  render(<AnalysisDiagnostics diagnostics={[diagnostic]} onSelect={vi.fn()} />);
  expect(screen.getByText("本次诊断未关联练习。")).toBeVisible();
  expect(screen.getByRole("link", { name: "浏览专项练习" })).toHaveAttribute("href", "/training");
});

const completeAnalysisV2 = {
  sourceKind: "narrative" as const,
  domainAnalysis: {
    kind: "narrative" as const,
    characters: {
      goals: [{ label: "守住秘密", description: "人物回避公开真相。", evidenceIds: ["E1"] }],
      actions: [{ label: "延迟行动", description: "动作迟疑可由原文核验。", evidenceIds: ["E1"] }],
      relationshipChanges: [{ label: "由疏离到面对", description: "关系压力开始显影。", evidenceIds: ["E1"] }],
    },
    plot: {
      turningPoints: [{ label: "行动转折", description: "人物开始面对事件。", evidenceIds: ["E1"] }],
      setups: [{ label: "异常动作", description: "前文动作形成铺垫。", evidenceIds: ["E1"] }],
      payoffs: [{ label: "动作回收", description: "后文回应前置动作。", evidenceIds: ["E1"] }],
    },
    themes: { stages: [{ stage: "开端", theme: "选择", change: "从回避走向面对", reason: "动作选择改变主题压力。", evidenceIds: ["E1"] }] },
  },
  analysis: [
    { id: "a1", name: "人物关系", summary: "新诊断", impact: "人物张力", suggestion: "校准人物动机", score: 90, evidenceIds: ["E1"] },
    { id: "a2", name: "情节结构", summary: "转折偏快", impact: "因果跳跃", suggestion: "增加前置线索", score: 70, evidenceIds: ["E1"] },
    { id: "a3", name: "主题演变", summary: "选择逐渐显影", impact: "主题可追踪", suggestion: "保留反复意象", score: 82, evidenceIds: ["E1"] },
    { id: "a4", name: "语言风格", summary: "动作句克制", impact: "语调统一", suggestion: "关键处断句", score: 86, evidenceIds: ["E1"] },
  ],
  evidence: [{ id: "E1", source: "observation" as const, quote: "选中的句子", note: "动作承载心理" }],
  relationGraph: { nodes: [{ id: "n1", label: "人物", type: "character" as const, evidenceIds: ["E1"] }, { id: "n2", label: "事件", type: "event" as const, evidenceIds: ["E1"] }], edges: [{ id: "r1", source: "n1", target: "n2", label: "面对", evidenceIds: ["E1"], confidence: 0.8 }] },
  paceCurve: [{ segment: "开端", value: 30, evidenceId: "E1" }, { segment: "转折", value: 80, evidenceId: "E1" }],
  emotionCurve: [{ segment: "开端", value: 40, evidenceId: "E1" }, { segment: "转折", value: 70, evidenceId: "E1" }],
  themeHeatmap: [{ theme: "选择", segment: "开端", value: 30, evidenceId: "E1" }, { theme: "选择", segment: "转折", value: 80, evidenceId: "E1" }],
  styleProfile: { metrics: [
    { key: "sentenceLength", dimension: "句长", value: 14, unit: "字", interpretation: "短句推进。", evidenceIds: ["E1"] },
    { key: "dialogueRatio", dimension: "对话比例", value: 0, unit: "%", interpretation: "沉默突出。", evidenceIds: ["E1"] },
    { key: "sensoryDensity", dimension: "感官密度", value: 60, unit: "%", interpretation: "细节具体。", evidenceIds: ["E1"] },
    { key: "rhetoric", dimension: "修辞", value: 50, unit: "分", interpretation: "意象反复。", evidenceIds: ["E1"] },
    { key: "narrativeDistance", dimension: "叙事距离", value: 65, unit: "分", interpretation: "外部聚焦。", evidenceIds: ["E1"] },
    { key: "rhythm", dimension: "节律", value: 72, unit: "分", interpretation: "停顿延宕。", evidenceIds: ["E1"] },
  ] },
  diagnostics: [{ id: "d1", location: "开端", quote: "选中的句子", effect: "转折缺少预备", action: "此处铺垫不足：补充一个先兆动作。", confidence: 0.81, evidenceIds: ["E1"], trainingExerciseId: "EX_006" }],
  retrievalEvidence: [],
};

it("shows six dimensions and opens cited evidence", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  expect(screen.getAllByTestId("analysis-dimension")).toHaveLength(6);
  expect(screen.getAllByText("案例快照")[0]).toBeVisible();
  await user.click(screen.getAllByRole("button", { name: "证据 E1" })[0]);
  const evidenceDialog = screen.getByRole("dialog", { name: "原文证据" });
  expect(evidenceDialog).toBeVisible();
  expect(within(evidenceDialog).getByText("用户文本")).toBeVisible();
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("explains an empty relationship graph and offers a new analysis", async () => {
  const user = userEvent.setup();
  const result = { ...completeAnalysisV2, relationGraph: { nodes: [], edges: [] } };
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ mode: "demo", task: "analysis-v2", warnings: [], result })));
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "真实重跑" }));
  const graph = await screen.findByRole("tabpanel");
  expect(await within(graph).findByText(/没有可展示的关系网络数据/)).toBeVisible();
  await user.click(within(graph).getByRole("button", { name: "重新分析" }));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("explains empty pace and heatmap panels without drawing unsupported charts", async () => {
  const user = userEvent.setup();
  const result = { ...completeAnalysisV2, paceCurve: [], themeHeatmap: [] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ mode: "demo", task: "analysis-v2", warnings: [], result })));
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "真实重跑" }));
  await screen.findByText("新诊断");
  await user.click(screen.getByRole("tab", { name: "情节节奏" }));
  expect(screen.getByText(/没有可展示的情节节奏数据/)).toBeVisible();
  expect(screen.queryByLabelText("曲线数据列表")).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "主题热力" }));
  const panel = screen.getByRole("tabpanel");
  expect(within(panel).getByText(/没有可展示的主题热力数据/)).toBeVisible();
  expect(within(panel).getByRole("button", { name: "重新分析" })).toBeEnabled();
  expect(within(panel).queryByRole("table")).not.toBeInTheDocument();
});

it("labels partial live results and shows the rejection without a heatmap tab", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ mode: "live", task: "analysis-v2", warnings: [], result: { ...completeAnalysisV2, discardedDiagnostics: [{ attempted: { id: "bad" }, reason: "field_invalid" }] } })));
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await userEvent.click(screen.getByRole("button", { name: "真实重跑" }));
  expect(await screen.findByText("真实分析（部分通过）")).toBeVisible();
  expect(screen.getByText(/bad：字段缺失或格式不符/)).toBeVisible();
  expect(screen.queryByRole("tab", { name: "主题演变" })).toBeNull();
});

it("真实诊断没带 trainingExerciseId 时，按判据维度仍能跳到专项训练", async () => {
  // 线上真实诊断不会带 trainingExerciseId（那是演示夹具预置的）。
  // 之前的结果是真跑模型时「去专项训练」整条消失，黄金路径第 6 步走不通。
  const user = userEvent.setup();
  const liveResult = {
    ...completeAnalysisV2,
    diagnostics: [{ ...completeAnalysisV2.diagnostics[0], trainingExerciseId: undefined, criteriaIds: ["P3@v1.0"] }],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    mode: "live", task: "analysis-v2", contextRevision: 3, result: liveResult, warnings: [], requestId: "analysis-train",
  }), { status: 200 })));

  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "真实重跑" }));
  await screen.findByText("新诊断");

  const link = screen.getByRole("link", { name: "去专项训练" });
  // P 维兜底到 EX_001（展示而非告知）
  expect(link).toHaveAttribute("href", expect.stringContaining("exercise=EX_001"));
});

it("主题热力 tab 渲染模型返回的主题分布，点格子可定位证据", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    mode: "live", task: "analysis-v2", contextRevision: 3, result: completeAnalysisV2, warnings: [], requestId: "analysis-heat",
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);

  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "真实重跑" }));
  await screen.findByText("新诊断");

  // PRD 2.0 §5 黄金路径要求「关系图 / 节奏曲线 / 热力图」都在
  await user.click(screen.getByRole("tab", { name: "主题热力" }));
  expect(screen.getByRole("table", { name: "主题演变热力图" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "选择 · 转折 · 强度 80" }));
  expect(screen.getByRole("dialog", { name: "原文证据" })).toHaveTextContent("选中的句子");
});

it("runs analysis-v2, links diagnostics to evidence, and explains selected text without changing prose", async () => {
  const user = userEvent.setup();
  const analysisResponse = new Response(JSON.stringify({
    mode: "demo",
    task: "analysis-v2",
    contextRevision: 3,
    result: completeAnalysisV2,
    warnings: [],
    requestId: "analysis-1",
  }), { status: 200 });
  const explanationResponse = new Response(JSON.stringify({
    mode: "demo",
    task: "mentor",
    result: { mentor: { thesis: "动作承载心理", evidence: [{ quote: "选中的句子", source: "observation", note: "原文动作" }], craft: ["延宕"], effect: ["保持张力"], consistency: ["与人物设定一致"], experiments: ["保留动作"], questions: ["人物在回避什么？"], references: [{ title: "延宕技法", sourceTitle: "授权文学知识库", note: "技法参考", retrievalId: "RAG-01", sourceStatus: "verified" }] } },
    warnings: ["导师使用演示结果"],
    requestId: "explain-1",
  }), { status: 200 });
  const fetcher = vi.fn().mockResolvedValueOnce(analysisResponse).mockResolvedValueOnce(explanationResponse);
  vi.stubGlobal("fetch", fetcher);

  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "真实重跑" }));

  expect(screen.getByRole("progressbar", { name: "文学诊断生成进度" })).toBeVisible();
  expect(await screen.findByText("新诊断")).toBeVisible();
  const domainLedger = screen.getByRole("region", { name: "完整领域分析" });
  expect(within(domainLedger).getByText("人物目标")).toBeVisible();
  expect(within(domainLedger).getByText("情节转折")).toBeVisible();
  expect(within(domainLedger).getByText("线索回收")).toBeVisible();
  expect(within(domainLedger).getByText("主题阶段")).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith("/api/ai", expect.objectContaining({ method: "POST", body: expect.stringContaining('"task":"analysis-v2"') }));
  await user.click(screen.getByRole("button", { name: /此处铺垫不足/ }));
  expect(screen.getByRole("dialog", { name: "原文证据" })).toHaveTextContent("选中的句子");
  await user.click(screen.getByRole("button", { name: "关闭对话框" }));
  expect(screen.getByRole("textbox", { name: "选中文本" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "解释这段文字" }));
  const explainPanel = screen.getByRole("heading", { name: "为什么这样写" }).closest("section");
  expect(explainPanel).not.toBeNull();
  expect(within(explainPanel as HTMLElement).getByRole("progressbar", { name: "文本解释生成进度" })).toBeVisible();
  expect(await screen.findByText("动作承载心理")).toBeVisible();
  expect(screen.getByText("原文观察")).toBeVisible();
  expect(screen.getByText("授权文学知识库")).toBeVisible();
  expect(screen.getByText("RAG-01")).toBeVisible();
  expect(screen.getByText("已核验")).toBeVisible();
});

it("keeps analysis mode and warnings separate from mentor mode and warnings", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ mode: "live", task: "analysis-v2", contextRevision: 3, result: completeAnalysisV2, warnings: ["分析来源提示"], requestId: "analysis-live" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ mode: "demo", task: "mentor", result: { mentor: { thesis: "导师降级结果", evidence: [{ quote: "选中的句子", source: "observation" }], craft: ["延宕"], effect: ["张力"], consistency: ["一致"], experiments: ["拆句"], questions: ["为什么？"], references: [] } }, warnings: ["导师降级提示"], requestId: "mentor-demo" }), { status: 200 })));
  render(<StoryProvider><AnalysisWorkspace initialSelection="选中的句子" /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "真实重跑" }));
  expect(await screen.findByText("真实分析")).toBeVisible();
  expect(screen.getByText("分析来源提示")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "解释这段文字" }));
  expect(await screen.findByText("导师降级结果")).toBeVisible();
  expect(screen.getByText("真实分析")).toBeVisible();
  expect(screen.getByText("分析来源提示")).toBeVisible();
  expect(screen.getByText("演示解释")).toBeVisible();
  expect(screen.getByText("导师降级提示")).toBeVisible();
});

it("automatically detects argumentative text and marks explicit user correction", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ mode: "demo", task: "analysis-v2", contextRevision: 3, result: completeAnalysisV2, warnings: [], requestId: "kind-1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "用户文本" }));
  await user.type(screen.getByRole("textbox", { name: "待分析文本" }), "数字人文方法必须回到证据。因此，首先核验材料来源，其次说明推理边界。综上，图谱不能替代文本细读。");

  expect(screen.getByText("系统识别：论述文本")).toBeVisible();
  expect(screen.getByLabelText("文本类型")).toHaveValue("argumentative");
  await user.selectOptions(screen.getByLabelText("文本类型"), "narrative");
  expect(screen.getByText("用户修正：叙事文本")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "分析用户文本" }));
  expect(fetcher).toHaveBeenCalledWith("/api/ai", expect.objectContaining({ body: expect.stringContaining('"sourceKind":"narrative"') }));
});

it("loads a studio project chapter context without crossing to another chapter", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><AnalysisWorkspace projectId="demo" chapterId="demo-chapter-1" sourceContext="studio" initialSelection="声场的入侵与重返" /></StoryProvider>);

  expect(await screen.findByText(/创作台直达/)).toBeVisible();
  expect(screen.getByText(/当前来源/)).toBeVisible();
  const selection = screen.getByRole("textbox", { name: "选中文本" });
  expect(selection).toHaveValue("声场的入侵与重返");
  await user.clear(selection);
  expect(selection).toHaveValue("");
});

it("rejects a chapter id outside the routed project instead of falling back", async () => {
  render(<StoryProvider><AnalysisWorkspace projectId="demo" chapterId="chapter-from-another-project" sourceContext="studio" /></StoryProvider>);

  expect(await screen.findByRole("alert")).toHaveTextContent("不属于当前项目");
  expect(screen.getByRole("button", { name: "真实重跑" })).toBeDisabled();
});

it("validates pasted analysis text without silently truncating or saving it", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "用户文本" }));
  const input = screen.getByRole("textbox", { name: "待分析文本" });

  await user.type(input, "短篇片段");
  expect(screen.getByText("4 / 20,000 字")).toBeVisible();
  fireEvent.change(input, { target: { value: "文".repeat(20_001) } });

  expect(screen.getByRole("alert")).toHaveTextContent("20,000");
  expect(screen.getByRole("button", { name: "分析用户文本" })).toBeDisabled();
});

it("rejects unsupported and oversized files before reading their bytes", async () => {
  const user = userEvent.setup();
  const { container } = render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "用户文本" }));
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const unsupportedRead = vi.fn();
  const unsupported = { name: "essay.pdf", type: "application/pdf", size: 1024, arrayBuffer: unsupportedRead } as unknown as File;

  fireEvent.change(input, { target: { files: [unsupported] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("TXT 或 MD");
  expect(unsupportedRead).not.toHaveBeenCalled();

  const oversizedRead = vi.fn();
  const oversized = { name: "essay.txt", type: "text/plain", size: 256 * 1024 + 1, arrayBuffer: oversizedRead } as unknown as File;
  fireEvent.change(input, { target: { files: [oversized] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("256KB");
  expect(oversizedRead).not.toHaveBeenCalled();
});

it("does not persist imported text in project snapshots or AI run logs", async () => {
  const user = userEvent.setup();
  const recordAiRun = vi.fn();
  const originalUseStory = StoryProviderModule.useStory;
  vi.spyOn(StoryProviderModule, "useStory").mockImplementation(() => ({ ...originalUseStory(), recordAiRun }));
  const importedText = "仅用于本次诊断的外部学生作文";
  const importedResult = structuredClone(completeAnalysisV2);
  importedResult.evidence[0].quote = importedText;
  importedResult.diagnostics[0].quote = importedText;
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      mode: "demo", task: "analysis-v2", contextRevision: 3, result: importedResult, warnings: [], requestId: "import-1",
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      mode: "demo", task: "mentor", result: { mentor: { thesis: "外文仅在内存分析", evidence: [{ quote: importedText, source: "observation", note: "本次输入" }], craft: [], effect: [], consistency: [], experiments: [], questions: [], references: [] } }, warnings: [], requestId: "import-mentor-1",
    }), { status: 200 })));
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "用户文本" }));
  await user.type(screen.getByRole("textbox", { name: "待分析文本" }), importedText);
  await user.click(screen.getByRole("button", { name: "分析用户文本" }));
  expect(await screen.findByText("新诊断")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "解释这段文字" }));
  expect(await screen.findByText("外文仅在内存分析")).toBeVisible();

  expect(recordAiRun).not.toHaveBeenCalled();
  expect(localStorage.getItem("story-forge:projects:v3")).not.toContain(importedText);
});

it("keeps the previous evidence and reports uncertainty when analysis fails", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "真实重跑" }));

  expect(await screen.findByRole("alert", { name: "" })).toHaveTextContent("分析暂时不可用");
  expect(screen.getByRole("status")).toHaveTextContent("未生成未经校验的结论");
  await user.click(screen.getByRole("button", { name: "查看上次结果" }));
  expect(screen.getAllByTestId("analysis-dimension")).toHaveLength(6);
});

it("drops a late analysis response after the imported source changes", async () => {
  const user = userEvent.setup();
  let resolveRequest: ((response: Response) => void) | undefined;
  const staleResult = structuredClone(completeAnalysisV2);
  staleResult.analysis[0].summary = "旧来源结果";
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "用户文本" }));
  const input = screen.getByRole("textbox", { name: "待分析文本" });
  fireEvent.change(input, { target: { value: "旧来源文本" } });
  await user.click(screen.getByRole("button", { name: "分析用户文本" }));
  fireEvent.change(input, { target: { value: "新来源文本" } });
  resolveRequest?.(new Response(JSON.stringify({ mode: "live", task: "analysis-v2", result: staleResult, warnings: [] }), { status: 200 }));

  await new Promise((resolve) => setTimeout(resolve, 10));
  await waitFor(() => expect(screen.queryByText("旧来源结果")).not.toBeInTheDocument());
});

it("keeps the newest same-source request isolated from an older response", async () => {
  const user = userEvent.setup();
  const requests: Array<(response: Response) => void> = [];
  const staleResult = structuredClone(completeAnalysisV2);
  staleResult.analysis[0].summary = "第一次请求";
  const latestResult = structuredClone(completeAnalysisV2);
  latestResult.analysis[0].summary = "第二次请求";
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { requests.push(resolve); })));
  render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "用户文本" }));
  const input = screen.getByRole("textbox", { name: "待分析文本" });
  fireEvent.change(input, { target: { value: "同一来源文本" } });
  await user.click(screen.getByRole("button", { name: "分析用户文本" }));
  await user.click(screen.getByRole("button", { name: "当前项目" }));
  await user.click(screen.getByRole("button", { name: "用户文本" }));
  await user.click(screen.getByRole("button", { name: "分析用户文本" }));

  expect(requests).toHaveLength(2);
  requests[1](new Response(JSON.stringify({ mode: "live", task: "analysis-v2", result: latestResult, warnings: [] }), { status: 200 }));

  expect(await screen.findByText("第二次请求")).toBeVisible();
  requests[0](new Response(JSON.stringify({ mode: "live", task: "analysis-v2", result: staleResult, warnings: [] }), { status: 200 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(screen.queryByText("第一次请求")).not.toBeInTheDocument();
  expect(screen.getByText("第二次请求")).toBeVisible();
});

it("aborts in-flight analysis when the workspace unmounts", async () => {
  const user = userEvent.setup();
  let requestSignal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, options?: RequestInit) => {
    requestSignal = options?.signal ?? undefined;
    return new Promise<Response>(() => undefined);
  }));
  const view = render(<StoryProvider><AnalysisWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "真实重跑" }));
  expect(requestSignal?.aborted).toBe(false);
  view.unmount();
  expect(requestSignal?.aborted).toBe(true);
});

it("clears analysis and disables mentor after an invalid imported file", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ mode: "demo", task: "analysis-v2", result: completeAnalysisV2, warnings: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ mode: "demo", task: "mentor", result: { mentor: { thesis: "旧导师结论", evidence: [{ quote: "选中的句子", source: "observation" }], craft: [], effect: [], consistency: [], experiments: [], questions: [], references: [] } }, warnings: [] }), { status: 200 })));
  const { container } = render(<StoryProvider><AnalysisWorkspace initialSelection="选中的句子" /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "真实重跑" }));
  expect(await screen.findByText("新诊断")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "解释这段文字" }));
  expect(await screen.findByText("旧导师结论")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "用户文本" }));
  expect(screen.queryByText("新诊断")).not.toBeInTheDocument();
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const invalidFile = { name: "essay.txt", type: "text/plain", size: 4, arrayBuffer: () => Promise.resolve(new Uint8Array([0xc3, 0x28]).buffer) } as unknown as File;
  fireEvent.change(fileInput, { target: { files: [invalidFile] } });

  expect(await screen.findByRole("alert")).toHaveTextContent("有效的 UTF-8");
  expect(screen.queryByText("新诊断")).not.toBeInTheDocument();
  expect(screen.queryByText("旧导师结论")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "解释这段文字" })).toBeDisabled();
});
