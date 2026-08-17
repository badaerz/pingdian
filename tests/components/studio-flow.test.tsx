import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoryProvider } from "@/providers/story-provider";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

it("keeps AI output in candidates until confirmation", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    mode: "demo",
    candidates: [
      { id: "candidate-1", label: "克制推进", content: "雾中的汽笛又响了一次。", rationale: "测试", tags: [], status: "pending" },
      { id: "candidate-2", label: "悬念强化", content: "另一段候选正文。", rationale: "测试", tags: [], status: "pending" },
    ],
  }))));
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);
  const original = screen.getByTestId("prose-editor").textContent;
  await user.click(screen.getByRole("button", { name: "续写" }));
  expect(await screen.findByText("生成完成")).toBeVisible();
  expect(screen.getByTestId("prose-editor").textContent).toBe(original);
  await user.click(screen.getAllByRole("button", { name: "采纳候选" })[0]);
  await user.click(screen.getByRole("button", { name: "确认采纳" }));
  expect(screen.getByTestId("prose-editor").textContent).toContain("雾中的汽笛");
});

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => localStorage.clear());

it("requests candidate generation through the server route", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    mode: "demo",
    reason: "MISSING_API_KEY",
    candidates: [
      { id: "generated-1", label: "候选一", content: "新的候选正文", rationale: "测试", tags: [], status: "pending" },
      { id: "generated-2", label: "候选二", content: "另一段候选正文", rationale: "测试", tags: [], status: "pending" },
    ],
  })));
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "续写" }));

  expect(fetcher).toHaveBeenCalledWith("/api/generate", expect.objectContaining({ method: "POST" }));
  expect(await screen.findByText("新的候选正文")).toBeVisible();
});
