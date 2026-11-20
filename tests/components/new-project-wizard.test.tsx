import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { StoryProvider } from "@/providers/story-provider";
import type { StoryStore } from "@/lib/story-store";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => { localStorage.clear(); push.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

it("completes the four-step manual path and creates a first paragraph", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><NewProjectForm /></StoryProvider>);

  expect(screen.getByText("1 / 4")).toBeVisible();
  await user.type(screen.getByLabelText("作品名称"), "潮汐日记");
  await user.type(screen.getByLabelText("一句话灵感"), "潜水员在退潮后发现一座倒置的房子。");
  await user.click(screen.getByRole("button", { name: "下一步：人物与世界" }));

  expect(screen.getByText("2 / 4")).toBeVisible();
  await user.type(screen.getByLabelText("主角姓名"), "阿澜");
  await user.type(screen.getByLabelText("核心地点"), "退潮海湾");
  await user.click(screen.getByRole("button", { name: "下一步：故事蓝图" }));

  expect(screen.getByText("3 / 4")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "下一步：写出首段" }));
  await user.type(screen.getByLabelText("作品首段"), "潮水退去后，屋顶先从海面下露了出来。");
  await user.click(screen.getByRole("button", { name: "完成并进入创作台" }));

  expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/project\/project-.+\/studio$/));
  const saved = JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "null") as StoryStore;
  const created = Object.values(saved.documents).find((item) => item.project.title === "潮汐日记");
  expect(created).toBeDefined();
  if (!created) throw new Error("created project was not persisted");
  expect(created.workflowStage).toBe("complete");
  expect(created.chapters[0].content).toContain("屋顶先从海面下露了出来");
  expect(created.characters[0].name).toBe("阿澜");
});

it("ignores an idea response after leaving its step", async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  const user = userEvent.setup();
  render(<StoryProvider><NewProjectForm /></StoryProvider>);
  await user.type(screen.getByLabelText("作品名称"), "潮汐");
  await user.type(screen.getByLabelText("一句话灵感"), "寻找港口。");
  await user.click(screen.getByRole("button", { name: "AI 生成故事方向" }));
  await user.click(screen.getByRole("button", { name: "下一步：人物与世界" }));
  await act(async () => finish(Response.json({ mode: "demo", result: { candidates: [{ id: "old", label: "旧方向", content: "旧候选" }] } })));
  expect(screen.queryByText("旧候选")).toBeNull();
});

it("preserves the demo label when the live half of a setting returns later", async () => {
  let finishWorld!: (value: Response) => void;
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ mode: "demo", result: { characters: [] } }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishWorld = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<StoryProvider><NewProjectForm /></StoryProvider>);
  await user.type(screen.getByLabelText("作品名称"), "潮汐");
  await user.type(screen.getByLabelText("一句话灵感"), "寻找港口。");
  await user.click(screen.getByRole("button", { name: "下一步：人物与世界" }));
  await user.click(screen.getByRole("button", { name: "AI 生成人物与世界" }));
  await act(async () => finishWorld(Response.json({ mode: "live", result: { worldEntries: [] }, warnings: ["世界设定提示。"] })));
  expect(screen.getByText(/人物设定为离线演示结果。.*世界设定提示。/)).toBeVisible();
  expect(screen.queryByText(/世界设定为离线演示结果/)).toBeNull();
});

it("keeps generated setup as a candidate until the user adopts it", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    mode: "demo", result: { candidates: [{ id: "idea", label: "潮痕", content: "一座房子只在退潮时出现。", rationale: "强化时限", tags: [], status: "pending" }] }, warnings: [], requestId: "1",
  }), { status: 200 })));
  render(<StoryProvider><NewProjectForm /></StoryProvider>);
  await user.type(screen.getByLabelText("作品名称"), "潮汐日记");
  await user.type(screen.getByLabelText("一句话灵感"), "原始灵感");

  await user.click(screen.getByRole("button", { name: "AI 生成故事方向" }));

  expect(await screen.findByText("一座房子只在退潮时出现。")).toBeVisible();
  expect(screen.getByLabelText("一句话灵感")).toHaveValue("原始灵感");
  await user.click(screen.getByRole("button", { name: "采用潮痕" }));
  expect(screen.getByLabelText("一句话灵感")).toHaveValue("一座房子只在退潮时出现。");
});
