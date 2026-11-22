import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrainingWorkspace } from "@/components/training/training-workspace";
import { StoryProvider, useStory } from "@/providers/story-provider";

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  window.localStorage.removeItem("story-forge:training:v1");
  window.localStorage.removeItem("story-forge:training:clear-pending:v1");
});

it("keeps a revised answer submittable while an older request is pending in strict mode", async () => {
  const fetcher = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<StrictMode><StoryProvider><TrainingWorkspace /></StoryProvider></StrictMode>);
  const answer = screen.getByRole("textbox", { name: "练习文本" });
  await user.type(answer, "他握住门。");
  await user.click(screen.getByRole("button", { name: "提交练习" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await user.type(answer, "风大了。");
  await user.click(screen.getByRole("button", { name: "提交练习" }));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

function TrainingHistoryCount() {
  const { trainingHistory } = useStory();
  return <output data-testid="training-history-count">{trainingHistory.length}</output>;
}

it("submits a training answer for structured feedback and supports re-evaluation", async () => {
  const user = userEvent.setup();
  const response = () => new Response(JSON.stringify({ mode: "demo", task: "training", result: { feedback: { strengths: ["动作具体"], evidence: "握住门把", issue: "环境互动不足", nextStep: "补一个声音细节", questions: ["人物在回避什么？"] } }, warnings: [], requestId: crypto.randomUUID() }), { status: 200 });
  const fetcher = vi.fn().mockImplementation(response);
  vi.stubGlobal("fetch", fetcher);

  render(<StoryProvider><TrainingWorkspace /></StoryProvider>);
  const input = screen.getByRole("textbox", { name: "练习文本" });
  await user.type(input, "他握住了门把。");
  await user.click(screen.getByRole("button", { name: "提交练习" }));

  expect(screen.getByRole("progressbar", { name: "写作训练评价进度" })).toBeVisible();
  expect((await screen.findAllByText("动作具体")).length).toBeGreaterThan(0);
  expect(fetcher).toHaveBeenCalledWith("/api/ai", expect.objectContaining({ method: "POST" }));
  await user.click(screen.getByRole("button", { name: "再次评价" }));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("normalizes non-array feedback fields without crashing", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ mode: "live", result: { feedback: { strengths: "动作具体", evidence: "握住门把", issue: "环境互动不足", nextStep: "补一个声音细节", questions: "人物在回避什么？" } } }), { status: 200 })));

  render(<StoryProvider><TrainingWorkspace /></StoryProvider>);
  await user.type(screen.getByRole("textbox", { name: "练习文本" }), "他握住了门把。");
  await user.click(screen.getByRole("button", { name: "提交练习" }));

  expect((await screen.findAllByText("动作具体")).length).toBeGreaterThan(0);
  expect(screen.getByText("人物在回避什么？")).toBeInTheDocument();
});

it("provides a reference work context for classroom demonstration", async () => {
  render(<StoryProvider><TrainingWorkspace /></StoryProvider>);

  expect(screen.getByLabelText("参考作品")).toBeVisible();
  expect(screen.getByText("本次技法目标")).toBeVisible();
});

it("supports a classroom demonstration mode without saving or ghostwriting", async () => {
  render(<StoryProvider><TrainingWorkspace /><TrainingHistoryCount /></StoryProvider>);

  await userEvent.setup().click(screen.getByRole("button", { name: "课堂演示" }));

  expect(screen.getByTestId("classroom-demo")).toBeVisible();
  expect(screen.getByLabelText("课堂作品")).toBeVisible();
  expect(screen.getByLabelText("课堂技法")).toBeVisible();
  expect(screen.getByTestId("classroom-analysis-result")).toHaveTextContent("课堂分析");
  expect(screen.getByTestId("training-history-count")).toHaveTextContent("0");
  expect(screen.queryByText("可直接提交的范文")).not.toBeInTheDocument();
});

it("sends the strict v2 training contract with exercise metadata and verified reference evidence", async () => {
  const user = userEvent.setup();
  const result = { trainingFeedback: { strengths: ["动作具体"], evidenceQuotes: ["他握住了门把。"], issues: ["环境互动不足"], nextExperiment: "补一个声音细节", questions: ["人物在回避什么？"], scores: [{ dimension: "证据具体性", score: 74, reason: "动作可核验。" }] } };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ mode: "demo", task: "training-feedback-v2", result, warnings: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);

  render(<StoryProvider><TrainingWorkspace /></StoryProvider>);
  await user.type(screen.getByRole("textbox", { name: "练习文本" }), "他握住了门把。");
  await user.click(screen.getByRole("button", { name: "提交练习" }));

  const body = JSON.parse(fetcher.mock.calls[0][1].body as string) as { task: string; input: { answer: string; prompt: string; sourceText: string } };
  expect(body.task).toBe("training-feedback-v2");
  expect(body.input.answer).toBe("他握住了门把。");
  expect(body.input.sourceText).toBe("他握住了门把。");
  expect(body.input.prompt).toContain("rubric");
  expect(body.input.prompt).toContain("guardrails");
  expect(body.input.prompt).toContain("证据具体性、动作设计、感官细节、结构节律、语言控制、自主修订");
  expect(body.input.prompt).not.toContain("example_answer");
  expect(await screen.findByText("补一个声音细节")).toBeVisible();
});

it("selects a requested exercise and safely falls back from an unknown diagnostic exercise", () => {
  const { rerender } = render(<StoryProvider><TrainingWorkspace exerciseId="EX_002" diagnosticId="d1" /></StoryProvider>);
  expect(screen.getByRole("heading", { name: "人物行动与性格塑造 (Action & Characterization)" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("诊断入口");

  rerender(<StoryProvider><TrainingWorkspace key="fallback" exerciseId="EX_999" diagnosticId="d2" /></StoryProvider>);
  expect(screen.getByRole("heading", { name: "展示而非告知 (Show, Don't Tell)" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("已回退");
});

it("shows attempt details, six-dimension trend, and a diff after the same exercise is retried", async () => {
  const user = userEvent.setup();
  const response = (quote: string) => new Response(JSON.stringify({ mode: "demo", task: "training-feedback-v2", result: { trainingFeedback: { strengths: ["动作具体"], evidenceQuotes: [quote], issues: ["环境互动不足"], nextExperiment: "补一个声音细节", questions: ["人物在回避什么？"], scores: [{ dimension: "证据具体性", score: 74, reason: "动作可核验。" }, { dimension: "感官细节", score: 61, reason: "仍可增加声音。" }] } }, warnings: [] }), { status: 200 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response("他握住了门把。" )).mockResolvedValueOnce(response("他握住了冰冷的门把。")));
  render(<StoryProvider><TrainingWorkspace /></StoryProvider>);
  const input = screen.getByRole("textbox", { name: "练习文本" });
  await user.type(input, "他握住了门把。");
  await user.click(screen.getByRole("button", { name: "提交练习" }));
  await screen.findByText("补一个声音细节");
  await user.clear(input);
  await user.type(input, "他握住了冰冷的门把。");
  await user.click(screen.getByRole("button", { name: "再次评价" }));

  expect(await screen.findByText("尝试 2")).toBeVisible();
  expect(screen.getByTestId("training-trend")).toBeVisible();
  expect(screen.getAllByTestId("training-trend-dimension")).toHaveLength(6);
  expect(screen.getByText("与上次尝试的文本差异")).toBeVisible();
  expect(screen.getByLabelText("上一版")).toHaveTextContent("他握住了门把。");
  expect(screen.getByLabelText("这一版")).toHaveTextContent("他握住了冰冷的门把。");
  const wipe = screen.getByRole("slider", { name: "擦除对比" });
  fireEvent.change(wipe, { target: { value: "100" } });
  expect(wipe).toHaveAttribute("aria-valuetext", "显示这一版 100%");
});

it("drops a late training response after switching exercises and aborts on unmount", async () => {
  const user = userEvent.setup();
  let resolveRequest: ((response: Response) => void) | undefined;
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, options?: RequestInit) => { signal = options?.signal ?? undefined; return new Promise<Response>((resolve) => { resolveRequest = resolve; }); }));
  const view = render(<StoryProvider><TrainingWorkspace /></StoryProvider>);
  await user.type(screen.getByRole("textbox", { name: "练习文本" }), "他握住了门把。");
  await user.click(screen.getByRole("button", { name: "提交练习" }));
  await user.click(screen.getByRole("button", { name: /人物行动与性格塑造/ }));
  resolveRequest?.(new Response(JSON.stringify({ mode: "demo", result: { trainingFeedback: { strengths: ["旧结果"], evidenceQuotes: ["他握住了门把。"], issues: [], nextExperiment: "旧实验", questions: [], scores: [{ dimension: "证据具体性", score: 50, reason: "旧" }] } } }), { status: 200 }));
  expect(screen.queryByText("旧结果")).not.toBeInTheDocument();
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
