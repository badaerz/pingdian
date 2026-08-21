import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPendingSaveCoordinator } from "@/lib/pending-save";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("returns a newer draft for synchronous flush and cancels its old timer", () => {
  const save = vi.fn();
  const coordinator = createPendingSaveCoordinator(500);
  coordinator.schedule({ projectId: "project-1", chapterId: "chapter-1", content: "用户刚输入的正文" }, save);

  expect(coordinator.resolveBeforeAccept({ projectId: "project-1", chapterId: "chapter-1" }, () => "存储中的旧正文")).toEqual({
    kind: "flush",
    draft: { projectId: "project-1", chapterId: "chapter-1", content: "用户刚输入的正文" },
  });
  vi.advanceTimersByTime(500);

  expect(save).not.toHaveBeenCalled();
});

it("allows acceptance when the pending draft already matches storage", () => {
  const save = vi.fn();
  const coordinator = createPendingSaveCoordinator(500);
  coordinator.schedule({ projectId: "project-1", chapterId: "chapter-1", content: "已保存正文" }, save);

  expect(coordinator.resolveBeforeAccept({ projectId: "project-1", chapterId: "chapter-1" }, () => "已保存正文")).toEqual({ kind: "accept" });
  vi.advanceTimersByTime(500);

  expect(save).not.toHaveBeenCalled();
});

it("runs the latest scheduled save once when no acceptance intervenes", () => {
  const save = vi.fn();
  const coordinator = createPendingSaveCoordinator(500);
  coordinator.schedule({ projectId: "project-1", chapterId: "chapter-1", content: "第一稿" }, save);
  coordinator.schedule({ projectId: "project-1", chapterId: "chapter-1", content: "第二稿" }, save);

  vi.advanceTimersByTime(500);

  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith({ projectId: "project-1", chapterId: "chapter-1", content: "第二稿" });
  expect(coordinator.resolveBeforeAccept({ projectId: "project-1", chapterId: "chapter-1" }, () => "第二稿")).toEqual({ kind: "accept" });
});

it("keeps independent timers for drafts in different chapters", () => {
  const saveA = vi.fn();
  const saveB = vi.fn();
  const coordinator = createPendingSaveCoordinator(500);
  coordinator.schedule({ projectId: "project-1", chapterId: "chapter-a", content: "A章新稿" }, saveA);
  vi.advanceTimersByTime(200);
  coordinator.schedule({ projectId: "project-1", chapterId: "chapter-b", content: "B章新稿" }, saveB);

  vi.advanceTimersByTime(300);
  expect(saveA).toHaveBeenCalledWith({ projectId: "project-1", chapterId: "chapter-a", content: "A章新稿" });
  expect(saveB).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(saveB).toHaveBeenCalledWith({ projectId: "project-1", chapterId: "chapter-b", content: "B章新稿" });
});

it("coordinates acceptance for only the requested project and chapter", () => {
  const saveA = vi.fn();
  const saveB = vi.fn();
  const coordinator = createPendingSaveCoordinator(500);
  coordinator.schedule({ projectId: "project-1", chapterId: "chapter-a", content: "A章新稿" }, saveA);
  coordinator.schedule({ projectId: "project-1", chapterId: "chapter-b", content: "B章新稿" }, saveB);

  expect(coordinator.resolveBeforeAccept(
    { projectId: "project-1", chapterId: "chapter-b" },
    () => "B章旧稿",
  )).toEqual({ kind: "flush", draft: { projectId: "project-1", chapterId: "chapter-b", content: "B章新稿" } });
  vi.advanceTimersByTime(500);

  expect(saveA).toHaveBeenCalledTimes(1);
  expect(saveB).not.toHaveBeenCalled();
});

it("flushes only the project being left and flushes all remaining drafts on dispose", () => {
  const saveA = vi.fn();
  const saveB = vi.fn();
  const coordinator = createPendingSaveCoordinator(500);
  coordinator.schedule({ projectId: "project-a", chapterId: "chapter-1", content: "项目A草稿" }, saveA);
  coordinator.schedule({ projectId: "project-b", chapterId: "chapter-1", content: "项目B草稿" }, saveB);

  coordinator.flushProject("project-a");
  expect(saveA).toHaveBeenCalledTimes(1);
  expect(saveB).not.toHaveBeenCalled();
  coordinator.dispose();
  expect(saveB).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(500);
  expect(saveA).toHaveBeenCalledTimes(1);
  expect(saveB).toHaveBeenCalledTimes(1);
});
