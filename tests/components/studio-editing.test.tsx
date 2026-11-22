import "../fixtures/seeded-store";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoryProvider, useStory } from "@/providers/story-provider";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function UserProjectBootstrap() {
  const { createProject } = useStory();
  return <button onClick={() => createProject({ title: "用户项目", genre: "短篇", logline: "用于编辑测试" }, {
    characters: [{ id: "user-character", name: "杭盖", role: "主角", desire: "寻找声音", flaw: "回避", arc: "从回避到行动", fear: "失去记忆", notes: "用户项目人物", locked: false, order: 0 }],
  })}>创建用户项目</button>;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

it("edits people and adds world entries from the story binder", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><UserProjectBootstrap /><StudioWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "创建用户项目" }));

  await user.click(screen.getByRole("button", { name: /^杭盖，/ }));
  const name = screen.getByLabelText("人物姓名");
  await user.clear(name);
  await user.type(name, "杭盖·新稿");
  expect(screen.getAllByRole("heading", { name: "杭盖·新稿" })[0]).toBeVisible();

  await user.click(screen.getByRole("button", { name: "新增世界条目" }));
  expect(screen.getByDisplayValue("新设定")).toBeVisible();
});

it("disables deletion after locking a user project fact", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><UserProjectBootstrap /><StudioWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "创建用户项目" }));
  await user.click(screen.getByRole("button", { name: /^杭盖，/ }));
  await user.click(screen.getByRole("button", { name: "锁定为事实" }));

  expect(screen.getByRole("button", { name: "删除杭盖" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "已锁定事实" })).toBeVisible();
});

it("remembers display font size without adding formatting to prose", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);

  await user.selectOptions(screen.getByLabelText("正文字号"), "20");

  expect(localStorage.getItem("story-forge:editor-display:v1")).toContain('"fontSize":20');
  expect(screen.getByTestId("prose-editor").querySelector("span[style]")).toBeNull();
});

it("does not render the duplicate scoped diagnosis link", () => {
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);

  expect(screen.queryByRole("link", { name: "文学诊断" })).not.toBeInTheDocument();
});

it("shows stale candidates and returns structured mentor evidence", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    mode: "demo",
    task: "mentor",
    result: { mentor: {
      thesis: "动作延迟形成克制张力。",
      evidence: [{ quote: "他没有拆开", source: "observation", note: "原文动作" }],
      craft: ["延宕"], effect: ["邀请读者推断"], consistency: ["与守候设定一致"],
      experiments: ["拆成两个短句"], questions: ["他最怕看到什么？"], references: [{ title: "克制叙述", note: "知识参考" }],
    } }, warnings: [], requestId: "mentor-1",
  }), { status: 200 })));
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);

  expect(screen.getByText("基于旧设定")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "文学导师" }));
  await user.type(screen.getByLabelText("向文学导师提问"), "为什么这样写？");
  await user.click(screen.getByRole("button", { name: "请导师分析" }));

  expect(await screen.findByText("动作延迟形成克制张力。")).toBeVisible();
  expect(screen.getByText("原文观察")).toBeVisible();
  fireEvent.click(screen.getByText("上下文详情"));
  await waitFor(() => expect(screen.getAllByText("当前章节").at(-1)).toBeVisible());
});

it("runs consistency checks only after an explicit continuation request", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "continue") return new Response(JSON.stringify({
      mode: "demo",
      task: "continue",
      requestId: "continue-1",
      contextRevision: body.project.contextRevision,
      warnings: [],
      result: { candidates: [
        { id: "checked-1", label: "克制推进", content: "杭盖收起了录音笔。", rationale: "先写行动", tags: [], status: "pending" },
        { id: "checked-2", label: "关系推进", content: "巴特尔把琴盒推回桌面。", rationale: "推进关系", tags: [], status: "pending" },
      ] },
    }), { status: 200 });
    const candidate = body.input.candidate;
    return new Response(JSON.stringify({
      mode: "demo",
      task: "consistency-check",
      requestId: `check-${candidate.id}`,
      contextRevision: candidate.revision,
      warnings: [],
      result: { consistencyReport: { candidateId: candidate.id, contextRevision: candidate.revision, findings: [], checkedAt: "刚刚", mode: "demo", userConfirmation: "none" } },
    }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);
  const original = screen.getByTestId("prose-editor").textContent;

  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "生成续写候选" }));

  expect(await screen.findByText("杭盖收起了录音笔。")).toBeVisible();
  await waitFor(() => expect(screen.getAllByText("低风险提示")).toHaveLength(2));
  expect(screen.getByTestId("prose-editor").textContent).toBe(original);
  expect(fetcher.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).task)).toEqual(["continue", "consistency-check", "consistency-check"]);
});

it("allows candidate revision before adopting the corrected version", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "continue") return new Response(JSON.stringify({
      mode: "demo",
      task: "continue",
      requestId: "continue-risk",
      contextRevision: body.project.contextRevision,
      warnings: [],
      result: { candidates: [{ id: "risky-1", label: "冲突候选", content: "杭盖当众砸碎了录音笔。", rationale: "制造强冲突", tags: [], status: "pending" }] },
    }), { status: 200 });
    const candidate = body.input.candidate;
    const findings = candidate.text.includes("砸碎") ? [{ id: "risk-1", category: "character", severity: "high", expectedFact: "杭盖依赖录音寻找真实声音", candidateQuote: "砸碎了录音笔", priorEvidence: "敏锐、疏离、技术理性、身份迷茫", suggestion: "先补足他放弃工具的触发事件。" }] : [];
    return new Response(JSON.stringify({
      mode: "demo",
      task: "consistency-check",
      requestId: "check-risk",
      contextRevision: candidate.revision,
      warnings: [],
      result: { consistencyReport: {
        candidateId: candidate.id,
        contextRevision: candidate.revision,
        findings,
        checkedAt: "刚刚",
        mode: "demo",
        userConfirmation: "none",
      } },
    }), { status: 200 });
  }));
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);
  const original = screen.getByTestId("prose-editor").textContent;

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  const review = await screen.findByRole("button", { name: "审阅候选冲突" });
  expect(screen.queryByRole("button", { name: "确认采纳" })).not.toBeInTheDocument();
  await user.click(review);

  expect(screen.getByRole("heading", { name: "上下文冲突" })).toBeVisible();
  expect(screen.getAllByText("先补足他放弃工具的触发事件。").at(-1)).toBeVisible();
  expect(screen.getByRole("button", { name: "请 AI 按建议重写" })).toBeVisible();
  expect(screen.getByTestId("prose-editor").textContent).toBe(original);

  expect(screen.queryByRole("button", { name: "确认风险并继续" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "编辑并重新检查" }));
  const editor = screen.getByLabelText("候选文本");
  await user.clear(editor);
  await user.type(editor, "杭盖轻轻收起了录音笔。");
  await user.click(screen.getByRole("button", { name: "保存并重新检查" }));
  await waitFor(() => expect(screen.getByText("低风险提示")).toBeVisible());
  const adopt = screen.getAllByRole("button", { name: "采纳候选" });
  expect(adopt.length).toBeGreaterThan(0);
  expect(adopt.some((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  expect(screen.queryByRole("heading", { name: "确认采纳" })).not.toBeInTheDocument();
  expect(screen.getByTestId("prose-editor").textContent).toBe(original);
});
