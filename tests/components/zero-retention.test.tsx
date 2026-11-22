import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, beforeEach, vi } from "vitest";
import { StoryProvider, useStory } from "@/providers/story-provider";

function Probe() {
  const { state, createProject, recordTrainingAttempt, clearLocalUserData } = useStory();
  return <div>
    <button onClick={() => createProject({ title: "只存在本地", genre: "短篇", logline: "本地测试" })}>创建本地作品</button>
    <button onClick={() => recordTrainingAttempt({ exerciseId: "EX_LOCAL", title: "本地训练", note: "只存本地", answer: "训练答案", feedback: {} })}>记录本地训练</button>
    <button onClick={() => void clearLocalUserData()}>清除本地创作数据</button>
    <output>{JSON.stringify({ projects: state.projects.map((project) => project.title), training: state.trainingAttemptRefs })}</output>
  </div>;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("indexedDB", { deleteDatabase: vi.fn(() => {
    const request = {} as IDBOpenDBRequest;
    queueMicrotask(() => request.onsuccess?.(new Event("success") as unknown as Event));
    return request;
  }) });
});

it("clears user projects and training history and returns to an empty project list", async () => {
  const user = userEvent.setup();
  localStorage.setItem("sb-legacy-auth-token", "legacy-session");
  render(<StoryProvider><Probe /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "创建本地作品" }));
  await user.click(screen.getByRole("button", { name: "记录本地训练" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("只存在本地"));

  await user.click(screen.getByRole("button", { name: "清除本地创作数据" }));

  await waitFor(() => {
    const value = JSON.parse(screen.getByRole("status").textContent ?? "{}");
    expect(value.projects).toEqual([]);
    expect(value.training).toEqual([]);
  });
  expect(JSON.parse(localStorage.getItem("story-forge:training:v1") ?? "[]")).toEqual([]);
  expect(localStorage.getItem("sb-legacy-auth-token")).toBeNull();
});
