import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KnowledgeWorkspace } from "@/components/knowledge/knowledge-workspace";
import { StoryProvider, useStory } from "@/providers/story-provider";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

it("analyzes a session text without writing project state and exposes academic graph controls", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ mode: "demo", warnings: [], result: {
    sourceKind: "narrative",
    evidence: [{ id: "e1", source: "observation", quote: "守夜人在码头等待。", note: "原文" }],
    knowledgeGraph: { nodes: [{ id: "character-1", label: "守夜人", type: "character", evidenceIds: ["e1"] }, { id: "event-1", label: "等待", type: "event", evidenceIds: ["e1"] }], edges: [{ id: "edge-1", source: "character-1", target: "event-1", label: "参与", evidenceIds: ["e1"], confidence: 0.8 }] },
  } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<StoryProvider><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  await user.type(screen.getByLabelText("粘贴待分析文本"), "守夜人在码头等待。");
  await user.click(screen.getByRole("button", { name: "分析文本" }));
  expect(await screen.findByTestId("academic-graph-canvas")).toBeVisible();
  expect(screen.getAllByText(/2 节点 · 1 关系/).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole("button", { name: "表格" })).toBeVisible();
  expect(fetchMock).toHaveBeenCalledWith("/api/ai", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  await user.click(screen.getByRole("button", { name: "分层" }));
  expect(screen.getByRole("button", { name: "分层" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "表格" }));
  await user.click(screen.getByRole("button", { name: /守夜人/ }));
  const evidenceDrawer = screen.getByRole("complementary", { name: "图谱证据详情" });
  expect(evidenceDrawer).toHaveTextContent("守夜人");
  expect(evidenceDrawer).toHaveTextContent("守夜人在码头等待。");
  expect(evidenceDrawer).toHaveTextContent("会话级");
  await user.click(screen.getByRole("checkbox", { name: "事件" }));
  expect(screen.getByText("1 节点 · 0 关系")).toBeVisible();
  await waitFor(() => expect(Object.values(localStorage)).not.toContain(expect.stringContaining("守夜人在码头等待")));
});

it("shows graph generation progress while text extraction is in flight", async () => {
  const user = userEvent.setup();
  let resolveFetch: (response: Response) => void = () => undefined;
  const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  render(<StoryProvider><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  await user.type(screen.getByLabelText("粘贴待分析文本"), "守夜人在码头等待。");
  await user.click(screen.getByRole("button", { name: "分析文本" }));

  expect(screen.getByRole("progressbar", { name: "知识图谱生成进度" })).toBeVisible();
  expect(screen.getByRole("button", { name: "分析文本" })).toBeDisabled();

  resolveFetch(new Response(JSON.stringify({ result: {
    sourceKind: "narrative",
    evidence: [{ id: "e1", source: "observation", quote: "守夜人在码头等待。", note: "原文" }],
    knowledgeGraph: { nodes: [{ id: "character-1", label: "守夜人", type: "character", evidenceIds: ["e1"] }], edges: [] },
  } }), { status: 200 }));
  expect(await screen.findByTestId("academic-graph-canvas")).toBeVisible();
});

it("treats an offline fallback warning as a successful graph result", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ warnings: ["模型返回结构不符合任务要求，已使用离线演示结果。"], result: {
    sourceKind: "narrative",
    evidence: [{ id: "e1", source: "observation", quote: "守夜人在码头等待。", note: "原文" }],
    knowledgeGraph: { nodes: [{ id: "character-1", label: "守夜人", type: "character", evidenceIds: ["e1"] }], edges: [] },
  } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<StoryProvider><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  await user.type(screen.getByLabelText("粘贴待分析文本"), "守夜人在码头等待。");
  await user.click(screen.getByRole("button", { name: "分析文本" }));

  expect(await screen.findByTestId("academic-graph-canvas")).toBeVisible();
  expect(screen.getByTestId("knowledge-import-notice")).toHaveTextContent("图谱已基于本次上传文本生成");
  expect(screen.getByTestId("knowledge-import-notice")).toHaveTextContent("离线演示结果");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps a real extraction failure as an alert", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: {} }), { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<StoryProvider><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  await user.type(screen.getByLabelText("粘贴待分析文本"), "无法分析的文本");
  await user.click(screen.getByRole("button", { name: "分析文本" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("文本分析暂不可用");
});

it("rejects unsupported uploads before calling the extraction API", async () => {
  const user = userEvent.setup({ applyAccept: false });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<StoryProvider><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  await user.upload(screen.getByLabelText("上传知识图谱文本"), new File(["内容"], "essay.pdf", { type: "application/pdf" }));

  expect(screen.getByRole("alert")).toHaveTextContent("仅支持 UTF-8 编码的 TXT 或 MD 文件");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("clears an existing graph and refuses an uploaded text source over the analysis limit", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: {
    sourceKind: "narrative",
    evidence: [{ id: "e1", source: "observation", quote: "原文证据", note: "原文" }],
    knowledgeGraph: { nodes: [{ id: "character-1", label: "人物", type: "character", evidenceIds: ["e1"] }], edges: [] },
  } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<StoryProvider><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  await user.type(screen.getByLabelText("粘贴待分析文本"), "人物证据");
  await user.click(screen.getByRole("button", { name: "分析文本" }));
  expect(await screen.findByTestId("academic-graph-canvas")).toBeVisible();

  const oversized = "a".repeat(20_001);
  await user.upload(screen.getByLabelText("上传知识图谱文本"), new File([oversized], "essay.txt", { type: "text/plain" }));

  expect(screen.getByRole("alert")).toHaveTextContent("20,000 字");
  expect(screen.getByLabelText("粘贴待分析文本")).toHaveValue("");
  expect(screen.queryByTestId("academic-graph-canvas")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("clears an existing graph and refuses an invalid UTF-8 upload", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: {
    sourceKind: "narrative",
    evidence: [{ id: "e1", source: "observation", quote: "原文证据", note: "原文" }],
    knowledgeGraph: { nodes: [{ id: "character-1", label: "人物", type: "character", evidenceIds: ["e1"] }], edges: [] },
  } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<StoryProvider><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  await user.type(screen.getByLabelText("粘贴待分析文本"), "人物证据");
  await user.click(screen.getByRole("button", { name: "分析文本" }));
  expect(await screen.findByTestId("academic-graph-canvas")).toBeVisible();

  await user.upload(screen.getByLabelText("上传知识图谱文本"), new File([new Uint8Array([0xff, 0xfe])], "essay.txt", { type: "text/plain" }));

  expect(screen.getByRole("alert")).toHaveTextContent("有效的 UTF-8");
  expect(screen.getByLabelText("粘贴待分析文本")).toHaveValue("");
  expect(screen.queryByTestId("academic-graph-canvas")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not let a stale upload restore text after a newer invalid upload", async () => {
  const user = userEvent.setup({ applyAccept: false });
  vi.stubGlobal("fetch", vi.fn());
  render(<StoryProvider><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  const input = screen.getByLabelText("上传知识图谱文本");
  let resolveBuffer: (buffer: ArrayBuffer) => void = () => undefined;
  const pendingBuffer = new Promise<ArrayBuffer>((resolve) => { resolveBuffer = resolve; });
  const pendingFile = new File(["旧文本"], "old.txt", { type: "text/plain" });
  Object.defineProperty(pendingFile, "arrayBuffer", { value: () => pendingBuffer });
  await user.upload(input, pendingFile);
  await user.upload(input, new File([new Uint8Array([0xff])], "bad.txt", { type: "text/plain" }));
  expect(screen.getByRole("alert")).toHaveTextContent("有效的 UTF-8");

  resolveBuffer(new TextEncoder().encode("旧文本").buffer);
  await waitFor(() => expect(screen.getByLabelText("粘贴待分析文本")).toHaveValue(""));
  expect(screen.getByRole("alert")).toHaveTextContent("有效的 UTF-8");
});

function ProjectSwitcher() {
  const { createProject } = useStory();
  return <button type="button" onClick={() => createProject({ title: "新项目", genre: "小说", logline: "隔离测试" })}>切换项目</button>;
}

it("aborts an in-flight extraction and clears session text when the active project changes", async () => {
  const user = userEvent.setup();
  let resolveFetch: (response: Response) => void = () => undefined;
  const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  render(<StoryProvider><ProjectSwitcher /><KnowledgeWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("tab", { name: "我的文本" }));
  const input = screen.getByLabelText("粘贴待分析文本");
  await user.type(input, "旧项目文本");
  await user.click(screen.getByRole("button", { name: "分析文本" }));
  const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
  await user.click(screen.getByRole("button", { name: "切换项目" }));

  await waitFor(() => expect(signal.aborted).toBe(true));
  expect(screen.getByLabelText("粘贴待分析文本")).toHaveValue("");
  resolveFetch(new Response(JSON.stringify({ result: { sourceKind: "narrative", evidence: [], knowledgeGraph: { nodes: [], edges: [] } } }), { status: 200 }));
  await waitFor(() => expect(screen.queryByLabelText("学术知识图谱")).not.toBeInTheDocument());
});
