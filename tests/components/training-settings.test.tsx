import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { TrainingWorkspace } from "@/components/training/training-workspace";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { StoryProvider } from "@/providers/story-provider";

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("indexedDB", { deleteDatabase: vi.fn(() => {
    const request = {} as IDBOpenDBRequest;
    queueMicrotask(() => request.onsuccess?.(new Event("success") as unknown as Event));
    return request;
  }) });
});

it("returns process feedback without a total score", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ mode: "demo", task: "training", result: { feedback: { strengths: ["动作具体"], evidence: "握紧门把", issue: "环境互动不足", nextStep: "补一个声音细节", questions: ["人物在回避什么？"] } }, warnings: [], requestId: "training-1" }), { status: 200 })));
  render(<StoryProvider><TrainingWorkspace /></StoryProvider>);
  await user.type(screen.getByLabelText("练习文本"), "她握紧门把，直到指节发白。 ");
  await user.click(screen.getByRole("button", { name: "提交练习" }));
  expect(await screen.findByText("观察到的优势")).toBeVisible();
  expect(screen.queryByText("总分")).not.toBeInTheDocument();
});

it("switches between demo success and failure states", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><SettingsWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "模拟失败状态" }));
  expect(screen.getByRole("alert")).toHaveTextContent("离线提示已展示");
});

it("explains zero retention and confirms before clearing local creation data", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><SettingsWorkspace /></StoryProvider>);
  expect(screen.getByText("零数据保留")).toBeVisible();
  expect(screen.getByText(/仅清除图片与脚本缓存通常不会删除作品/)).toBeVisible();

  await user.click(screen.getByRole("button", { name: "清除本地创作数据" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("且无法恢复");
  await user.click(screen.getByRole("button", { name: "确认清除" }));
  expect(await screen.findByText("本地创作数据已清除")).toBeVisible();
});
