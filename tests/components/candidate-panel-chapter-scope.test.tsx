import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { createProjectDocument, createStoryStore, saveStoryStore } from "@/lib/story-store";
import type { StoryState } from "@/lib/types";
import { StoryProvider, useStory } from "@/providers/story-provider";

const USER_PROJECT_ID = "project-candidate-scope-a";
const SECOND_USER_PROJECT_ID = "project-candidate-scope-b";

function seedUserProjects() {
  const store = createStoryStore();
  const documents = [
    [USER_PROJECT_ID, "候选作用域项目 A"],
    [SECOND_USER_PROJECT_ID, "候选作用域项目 B"],
  ].map(([id, title]) => {
    const document = createProjectDocument({ title, genre: "短篇", logline: "用于候选作用域测试" });
    return [id, { ...document, project: { ...document.project, id } }] as const;
  });
  saveStoryStore({ ...store, documents: { ...store.documents, ...Object.fromEntries(documents) } });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => { resolve = next; });
  return { promise, resolve };
}

function candidateResponse(id: string, revision: number) {
  return new Response(JSON.stringify({
    mode: "demo",
    result: { candidates: [{ id, label: "章节候选", content: `${id} 正文`, rationale: "章节作用域测试", tags: [], status: "pending" }] },
    contextRevision: revision,
  }));
}

function consistencyResponse(candidateId: string, revision: number) {
  return new Response(JSON.stringify({
    mode: "demo",
    result: { consistencyReport: { candidateId, contextRevision: revision, findings: [], checkedAt: "刚刚", mode: "demo", userConfirmation: "none" } },
  }));
}

function HarnessControls({ onState, onProjectChange }: { onState: (state: StoryState) => void; onProjectChange: () => void }) {
  const { state, setState } = useStory();
  useEffect(() => { onState(state); }, [onState, state]);
  const otherChapter = state.chapters.find((chapter) => chapter.id !== state.activeChapterId) ?? { ...state.chapters[0], id: "test-chapter-2", title: "测试第二章", order: state.chapters.length };
  return <>
    <button onClick={() => setState((current) => ({
      ...current,
      chapters: current.chapters.some((chapter) => chapter.id === otherChapter.id) ? current.chapters : [...current.chapters, otherChapter],
      activeChapterId: otherChapter.id,
    }))}>切换测试章节</button>
    <button onClick={() => setState((current) => ({ ...current, contextRevision: current.contextRevision + 1 }))}>推进测试版本</button>
    <button onClick={onProjectChange}>切换测试项目</button>
    <button onClick={() => setState((current) => ({
      ...current,
      candidates: [{
        id: "other-chapter-candidate",
        label: "其他章节候选",
        content: "其他章节不应显示",
        rationale: "跨章隔离",
        tags: [],
        status: "pending",
        target: { type: "chapter", id: otherChapter.id },
        applyMode: "append",
        generatedRevision: current.contextRevision,
        mode: "demo",
      }, ...current.candidates],
    }))}>加入其他章候选</button>
    <output aria-label="当前项目">{state.activeProjectId}</output>
  </>;
}

function CandidateHarness({ onState }: { onState: (state: StoryState) => void }) {
  const [projectId, setProjectId] = useState(USER_PROJECT_ID);
  return <StoryProvider>
    <HarnessControls onState={onState} onProjectChange={() => setProjectId((current) => current === USER_PROJECT_ID ? SECOND_USER_PROJECT_ID : USER_PROJECT_ID)} />
    <StudioWorkspace projectId={projectId} />
  </StoryProvider>;
}

beforeEach(() => { localStorage.clear(); seedUserProjects(); });
afterEach(() => vi.unstubAllGlobals());

it("shows and operates only candidates for the active chapter", async () => {
  const user = userEvent.setup();
  const states: StoryState[] = [];
  render(<CandidateHarness onState={(state) => states.push(state)} />);
  await waitFor(() => expect(screen.getByLabelText("当前项目")).toHaveTextContent(USER_PROJECT_ID));
  const activeTitle = states.at(-1)!.chapters.find((chapter) => chapter.id === states.at(-1)!.activeChapterId)!.title;

  expect(screen.getByText(`当前章：${activeTitle}`)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "加入其他章候选" }));
  expect(screen.queryByText("其他章节不应显示")).not.toBeInTheDocument();
});

it("aborts continuation on chapter change, resets loading and ignores the old result", async () => {
  const user = userEvent.setup();
  const pending = deferredResponse();
  let signal: AbortSignal | null | undefined;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    void url;
    signal = init?.signal;
    return pending.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const states: StoryState[] = [];
  const view = render(<CandidateHarness onState={(state) => states.push(state)} />);
  await waitFor(() => expect(screen.getByLabelText("当前项目")).toHaveTextContent(USER_PROJECT_ID));

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  expect(screen.getByRole("button", { name: "改写整段" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "切换测试章节" }));

  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole("button", { name: "改写整段" })).toBeEnabled();
  await act(async () => { pending.resolve(candidateResponse("old-chapter-result", states.at(-1)!.contextRevision)); });
  expect(states.at(-1)?.candidates.some((candidate) => candidate.id === "old-chapter-result")).toBe(false);
  view.unmount();
});

it("aborts consistency checking on chapter change and does not save its report", async () => {
  const user = userEvent.setup();
  const pendingCheck = deferredResponse();
  let checkSignal: AbortSignal | null | undefined;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    void url;
    const body = JSON.parse(String(init?.body));
    if (body.task === "continue") return Promise.resolve(candidateResponse("candidate-before-switch", body.project.contextRevision));
    checkSignal = init?.signal;
    return pendingCheck.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const states: StoryState[] = [];
  render(<CandidateHarness onState={(state) => states.push(state)} />);
  await waitFor(() => expect(screen.getByLabelText("当前项目")).toHaveTextContent(USER_PROJECT_ID));

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(screen.getByText("一致性检查中…")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "切换测试章节" }));

  expect(checkSignal?.aborted).toBe(true);
  expect(screen.queryByText("一致性检查中…")).not.toBeInTheDocument();
  await act(async () => { pendingCheck.resolve(consistencyResponse("candidate-before-switch", states.at(-1)!.contextRevision)); });
  expect(states.at(-1)?.consistencyReports.some((report) => report.candidateId === "candidate-before-switch")).toBe(false);
});

it("clears candidate errors when context revision changes", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<CandidateHarness onState={() => undefined} />);
  await waitFor(() => expect(screen.getByLabelText("当前项目")).toHaveTextContent(USER_PROJECT_ID));

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "推进测试版本" }));

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "生成续写候选" })).toBeEnabled();
});

it("keeps direction draft and tags across chapter and revision scopes while resetting async state", async () => {
  const user = userEvent.setup();
  const pending = deferredResponse();
  let directionSignal: AbortSignal | null | undefined;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    void url;
    directionSignal = init?.signal;
    return fetcher.mock.calls.length === 1 ? pending.promise : Promise.reject(new Error("offline"));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<CandidateHarness onState={() => undefined} />);
  await waitFor(() => expect(screen.getByLabelText("当前项目")).toHaveTextContent(USER_PROJECT_ID));

  await user.click(screen.getByRole("button", { name: "跌宕起伏" }));
  await user.type(screen.getByLabelText("本轮补充"), "保留这轮人物选择");
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("button", { name: "分析中…" }, { timeout: 5_000 })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "切换测试章节" }));
  expect(directionSignal?.aborted).toBe(true);
  expect(screen.getByLabelText("本轮补充")).toHaveValue("保留这轮人物选择");
  expect(screen.getByRole("button", { name: "跌宕起伏" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "发送并继续讨论" })).toBeEnabled();

  await act(async () => { screen.getByRole("button", { name: "发送并继续讨论" }).click(); });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("alert", undefined, { timeout: 5_000 })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "推进测试版本" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("本轮补充")).toHaveValue("保留这轮人物选择");

  await user.click(screen.getByRole("button", { name: "切换测试章节" }));
  expect(screen.getByLabelText("本轮补充")).toHaveValue("保留这轮人物选择");
  expect(screen.getByRole("button", { name: "跌宕起伏" })).toHaveAttribute("aria-pressed", "true");
  await act(async () => { pending.resolve(new Response(JSON.stringify({ result: { direction: { recommendation: "旧作用域不得写入" } } }))); });
  expect(screen.queryByText("旧作用域不得写入")).not.toBeInTheDocument();
}, 15_000);

it("clears direction draft and tags when the active project changes", async () => {
  const user = userEvent.setup();
  render(<CandidateHarness onState={() => undefined} />);
  await waitFor(() => expect(screen.getByLabelText("当前项目")).toHaveTextContent(USER_PROJECT_ID));

  await user.click(screen.getByRole("button", { name: "轻松日常" }));
  await user.type(screen.getByLabelText("本轮补充"), "只属于当前项目的草稿");
  await user.click(screen.getByRole("button", { name: "切换测试项目" }));
  await waitFor(() => expect(screen.getByLabelText("当前项目")).toHaveTextContent(SECOND_USER_PROJECT_ID));

  expect(screen.getByLabelText("本轮补充")).toHaveValue("");
  expect(screen.getByRole("button", { name: "轻松日常" })).toHaveAttribute("aria-pressed", "false");
});
