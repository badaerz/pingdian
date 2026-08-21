import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/studio/prose-editor", () => ({
  ProseEditor: ({ content, onChange }: { content: string; onChange: (content: string) => void }) => {
    const [draft, setDraft] = useState(content);
    useEffect(() => { setDraft(content); }, [content]);
    return <>
      <textarea aria-label="正文编辑器" value={draft} onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }} />
      <button aria-label="重复通知当前正文" onClick={() => onChange(content)} />
    </>;
  },
}));

import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { createProjectDocument, createStoryStore, saveStoryStore } from "@/lib/story-store";
import type { StoryState } from "@/lib/types";
import { StoryProvider, useStory } from "@/providers/story-provider";

const USER_PROJECT_ID = "project-save-race-a";
const SECOND_USER_PROJECT_ID = "project-save-race-b";

function seedUserProjects() {
  const store = createStoryStore();
  const documents = [
    [USER_PROJECT_ID, "竞态测试项目 A"],
    [SECOND_USER_PROJECT_ID, "竞态测试项目 B"],
  ].map(([id, title]) => {
    const document = createProjectDocument({ title, genre: "短篇", logline: "用于保存竞态测试" });
    return [id, { ...document, project: { ...document.project, id } }] as const;
  });
  saveStoryStore({ ...store, documents: { ...store.documents, ...Object.fromEntries(documents) } });
}

function StateProbe({ onState }: { onState: (state: StoryState) => void }) {
  const { state } = useStory();
  useEffect(() => { onState(state); }, [onState, state]);
  return null;
}

function AddSecondChapter() {
  const { setState } = useStory();
  return <button onClick={() => setState((current) => current.chapters.some((chapter) => chapter.id === "test-chapter-b") ? current : ({
    ...current,
    chapters: [...current.chapters, { id: "test-chapter-b", title: "测试第二章", content: "B章旧稿", wordCount: 4, summary: "", order: current.chapters.length }],
  }))}>准备双章</button>;
}

function UnmountStudioHarness({ onState, projectId }: { onState: (state: StoryState) => void; projectId: string }) {
  const [visible, setVisible] = useState(true);
  return <>
    <button onClick={() => setVisible(false)}>卸载创作台</button>
    <StateProbe onState={onState} />
    {visible && <StudioWorkspace projectId={projectId} />}
  </>;
}

beforeEach(() => { localStorage.clear(); seedUserProjects(); });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("does not bump context revision when the editor reports unchanged prose", async () => {
  const states: StoryState[] = [];
  render(<StoryProvider><StateProbe onState={(state) => states.push(state)} /><StudioWorkspace projectId={USER_PROJECT_ID} /></StoryProvider>);
  await waitFor(() => expect(states.at(-1)?.activeProjectId).toBe(USER_PROJECT_ID));
  const revision = states.at(-1)!.contextRevision;
  vi.useFakeTimers();

  fireEvent.click(screen.getByRole("button", { name: "重复通知当前正文" }));
  act(() => vi.advanceTimersByTime(500));

  expect(states.at(-1)?.contextRevision).toBe(revision);
  expect(screen.getByText("已保存")).toBeVisible();
});

it("flushes a newer prose draft before adoption and prevents the old timer from overwriting", async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "continue") return new Response(JSON.stringify({
      mode: "demo",
      result: { candidates: [
        { id: "race-candidate-1", label: "竞态候选", content: "不应抢先写入的候选", rationale: "竞态验证", tags: [], status: "pending" },
        { id: "race-candidate-2", label: "备用候选", content: "备用候选正文", rationale: "竞态验证", tags: [], status: "pending" },
      ] },
    }));
    const candidate = body.input.candidate;
    return new Response(JSON.stringify({ mode: "demo", result: { consistencyReport: { candidateId: candidate.id, contextRevision: candidate.revision, findings: [], checkedAt: "刚刚", mode: "demo", userConfirmation: "none" } } }));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><StudioWorkspace projectId={USER_PROJECT_ID} /></StoryProvider>);
  await waitFor(() => expect(screen.getByLabelText("章节标题")).not.toHaveAttribute("readonly"));

  fireEvent.click(screen.getByRole("button", { name: "生成续写候选" }));
  await waitFor(() => expect(screen.getAllByText("低风险提示")).toHaveLength(2));

  vi.useFakeTimers();
  const editor = screen.getByRole("textbox", { name: "正文编辑器" });
  const userDraft = `${editor.textContent ?? (editor as HTMLTextAreaElement).value}\n\n用户在采纳前刚补写的句子。`;
  fireEvent.change(editor, { target: { value: userDraft } });
  expect(screen.getByText("保存中…")).toBeVisible();

  const adopt = screen.getAllByRole("button", { name: "采纳候选" }).find((button) => !button.hasAttribute("disabled"));
  fireEvent.click(adopt!);
  fireEvent.click(screen.getByRole("button", { name: "确认采纳" }));

  expect((screen.getByRole("textbox", { name: "正文编辑器" }) as HTMLTextAreaElement).value).toContain("用户在采纳前刚补写的句子。");
  expect((screen.getByRole("textbox", { name: "正文编辑器" }) as HTMLTextAreaElement).value).not.toContain("不应抢先写入的候选");
  expect(screen.getAllByText("基于旧设定").length).toBeGreaterThan(0);

  act(() => vi.advanceTimersByTime(500));
  expect((screen.getByRole("textbox", { name: "正文编辑器" }) as HTMLTextAreaElement).value).toContain("用户在采纳前刚补写的句子。");
  expect((screen.getByRole("textbox", { name: "正文编辑器" }) as HTMLTextAreaElement).value).not.toContain("不应抢先写入的候选");
});

it("saves drafts from two chapters independently when both are edited within 500ms", async () => {
  const states: StoryState[] = [];
  render(<StoryProvider><StateProbe onState={(state) => states.push(state)} /><AddSecondChapter /><StudioWorkspace projectId={USER_PROJECT_ID} /></StoryProvider>);
  await waitFor(() => expect(states.at(-1)?.activeProjectId).toBe(USER_PROJECT_ID));
  fireEvent.click(screen.getByRole("button", { name: "准备双章" }));
  vi.useFakeTimers();

  fireEvent.change(screen.getByRole("textbox", { name: "正文编辑器" }), { target: { value: "A章新稿" } });
  act(() => vi.advanceTimersByTime(200));
  fireEvent.click(screen.getByRole("button", { name: /测试第二章，4 字/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "正文编辑器" }), { target: { value: "B章新稿" } });

  act(() => vi.advanceTimersByTime(300));
  expect(states.at(-1)?.chapters.find((chapter) => chapter.id !== "test-chapter-b")?.content).toBe("A章新稿");
  expect(states.at(-1)?.chapters.find((chapter) => chapter.id === "test-chapter-b")?.content).toBe("B章旧稿");
  act(() => vi.advanceTimersByTime(200));
  expect(states.at(-1)?.chapters.find((chapter) => chapter.id === "test-chapter-b")?.content).toBe("B章新稿");
});

it("flushes the pending draft before switching projects", async () => {
  const states: StoryState[] = [];
  const onState = (state: StoryState) => states.push(state);
  const view = render(<StoryProvider><StateProbe onState={onState} /><StudioWorkspace projectId={USER_PROJECT_ID} /></StoryProvider>);
  await waitFor(() => expect(states.at(-1)?.activeProjectId).toBe(USER_PROJECT_ID));
  vi.useFakeTimers();

  fireEvent.change(screen.getByRole("textbox", { name: "正文编辑器" }), { target: { value: "切项目前必须保存" } });
  view.rerender(<StoryProvider><StateProbe onState={onState} /><StudioWorkspace projectId={SECOND_USER_PROJECT_ID} /></StoryProvider>);
  expect(states.at(-1)?.activeProjectId).toBe(SECOND_USER_PROJECT_ID);
  view.rerender(<StoryProvider><StateProbe onState={onState} /><StudioWorkspace projectId={USER_PROJECT_ID} /></StoryProvider>);

  expect(states.at(-1)?.activeProjectId).toBe(USER_PROJECT_ID);
  expect(states.at(-1)?.chapters.find((chapter) => chapter.id === states.at(-1)?.activeChapterId)?.content).toBe("切项目前必须保存");
  act(() => vi.advanceTimersByTime(500));
  expect(states.at(-1)?.chapters.find((chapter) => chapter.id === states.at(-1)?.activeChapterId)?.content).toBe("切项目前必须保存");
});

it("flushes every pending draft when the studio unmounts", async () => {
  const states: StoryState[] = [];
  render(<StoryProvider><UnmountStudioHarness projectId={USER_PROJECT_ID} onState={(state) => states.push(state)} /></StoryProvider>);
  await waitFor(() => expect(states.at(-1)?.activeProjectId).toBe(USER_PROJECT_ID));
  vi.useFakeTimers();

  fireEvent.change(screen.getByRole("textbox", { name: "正文编辑器" }), { target: { value: "卸载前必须保存" } });
  fireEvent.click(screen.getByRole("button", { name: "卸载创作台" }));

  expect(states.at(-1)?.chapters.find((chapter) => chapter.id === states.at(-1)?.activeChapterId)?.content).toBe("卸载前必须保存");
  act(() => vi.advanceTimersByTime(500));
  expect(states.at(-1)?.chapters.find((chapter) => chapter.id === states.at(-1)?.activeChapterId)?.content).toBe("卸载前必须保存");
});
