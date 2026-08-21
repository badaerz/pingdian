import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoryProvider } from "@/providers/story-provider";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { createProjectDocument, createStoryStore, saveStoryStore } from "@/lib/story-store";

const USER_PROJECT_ID = "project-studio-flow";

function seedUserProject() {
  const store = createStoryStore();
  const document = createProjectDocument({ title: "候选采纳测试项目", genre: "短篇", logline: "用于候选采纳测试" });
  saveStoryStore({
    ...store,
    documents: { ...store.documents, [USER_PROJECT_ID]: { ...document, project: { ...document.project, id: USER_PROJECT_ID } } },
  });
}

it("keeps AI output in candidates until confirmation", async () => {
  seedUserProject();
  const user = userEvent.setup();
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "continue") return new Response(JSON.stringify({
      mode: "demo", result: { candidates: [
        { id: "candidate-1", label: "克制推进", content: "雾中的汽笛又响了一次。", rationale: "测试", tags: [], status: "pending" },
        { id: "candidate-2", label: "悬念强化", content: "另一段候选正文。", rationale: "测试", tags: [], status: "pending" },
      ] },
    }));
    const candidate = body.input.candidate;
    return new Response(JSON.stringify({ mode: "demo", result: { consistencyReport: { candidateId: candidate.id, contextRevision: candidate.revision, findings: [], checkedAt: "刚刚", mode: "demo", userConfirmation: "none" } } }));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><StudioWorkspace projectId={USER_PROJECT_ID} /></StoryProvider>);
  await waitFor(() => expect(screen.getByLabelText("章节标题")).not.toHaveAttribute("readonly"));
  const original = screen.getByTestId("prose-editor").textContent;
  await act(async () => { screen.getByRole("button", { name: "生成续写候选" }).click(); });
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  expect(await screen.findByText("生成完成", undefined, { timeout: 10_000 })).toBeVisible();
  expect(screen.getByTestId("prose-editor").textContent).toBe(original);
  await screen.findAllByText("低风险提示");
  const adopt = screen.getAllByRole("button", { name: "采纳候选" }).find((button) => !button.hasAttribute("disabled"));
  await user.click(adopt!);
  await user.click(screen.getByRole("button", { name: "确认采纳" }));
  expect(screen.getByTestId("prose-editor").textContent).toContain("雾中的汽笛");
}, 20_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => localStorage.clear());

it("makes every built-in story editing surface read-only in defense mode", async () => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_LOCKED", "true");
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);

  expect(screen.getByLabelText("章节标题")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("章节摘要（用于 AI 上下文）")).toHaveAttribute("readonly");
  expect(screen.getByTestId("prose-editor").querySelector('[contenteditable="false"]')).not.toBeNull();
  expect(screen.getByRole("button", { name: "新增章节" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "新增人物" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除杭盖" })).toBeDisabled();

  await userEvent.setup().click(screen.getByRole("button", { name: /版本 1/ }));
  expect(screen.getByRole("button", { name: "回退至上一版本" })).toBeDisabled();
});

it("keeps the secondary built-in case read-only after project selection", async () => {
  render(<StoryProvider><StudioWorkspace projectId="demo-demo_002" /></StoryProvider>);

  await waitFor(() => expect(screen.getByLabelText("章节标题")).toHaveValue("生锈的铁盒"));
  expect(screen.getByLabelText("章节标题")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("章节摘要（用于 AI 上下文）")).toHaveAttribute("readonly");
  expect(screen.getByTestId("prose-editor").querySelector('[contenteditable="false"]')).not.toBeNull();
  expect(screen.getAllByRole("button", { name: /^新增/ }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  expect(screen.getAllByRole("button", { name: /^删除/ }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
});

it("protects built-in defense structure even when the demo lock switch is off", () => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_LOCKED", "false");
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);

  expect(screen.getByRole("button", { name: "新增章节" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除杭盖" })).toBeDisabled();
});

it("lets the user adjust the writing and collaboration columns", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);

  const binderSeparator = screen.getByRole("separator", { name: "调整档案夹与编辑区宽度" });
  expect(binderSeparator).toHaveAttribute("aria-valuenow", "18");
  await user.click(binderSeparator);
  await user.keyboard("{ArrowRight}{ArrowRight}");
  expect(binderSeparator).toHaveAttribute("aria-valuenow", "22");

  const separator = screen.getByRole("separator", { name: "调整编辑区与候选面板宽度" });
  expect(separator).toHaveAttribute("aria-valuenow", "62");
  await user.click(separator);
  await user.keyboard("{ArrowRight}{ArrowRight}");
  expect(separator).toHaveAttribute("aria-valuenow", "66");
});

it("requests candidate generation through the server route", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "continue") return new Response(JSON.stringify({
      mode: "demo",
      warnings: ["MISSING_API_KEY"],
      result: { candidates: [
        { id: "generated-1", label: "候选一", content: "新的候选正文", rationale: "测试", tags: [], status: "pending" },
        { id: "generated-2", label: "候选二", content: "另一段候选正文", rationale: "测试", tags: [], status: "pending" },
      ] },
    }));
    const candidate = body.input.candidate;
    return new Response(JSON.stringify({ mode: "demo", result: { consistencyReport: { candidateId: candidate.id, contextRevision: candidate.revision, findings: [], checkedAt: "刚刚", mode: "demo", userConfirmation: "none" } } }));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));

  expect(fetcher).toHaveBeenNthCalledWith(1, "/api/ai", expect.objectContaining({ method: "POST" }));
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).task).toBe("continue");
  expect(await screen.findByText("新的候选正文")).toBeVisible();
});
