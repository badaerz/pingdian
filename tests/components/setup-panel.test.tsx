import "../fixtures/seeded-store";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SetupPanel } from "@/components/studio/setup-panel";
import { StoryProvider } from "@/providers/story-provider";

afterEach(() => vi.unstubAllGlobals());

it("generates story directions into a selectable candidate list", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    mode: "demo",
    task: "ideas",
    result: { candidates: [
      { id: "idea-1", label: "方向一", content: "从旧信展开。", rationale: "保留悬念", tags: ["悬念"], status: "pending" },
      { id: "idea-2", label: "方向二", content: "从码头展开。", rationale: "强化空间", tags: ["空间"], status: "pending" },
    ] },
    warnings: [],
    requestId: "request-1",
  }), { status: 200 })));

  render(<StoryProvider><SetupPanel /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "生成故事方向" }));

  expect(screen.getByRole("progressbar", { name: "故事方向生成进度" })).toBeVisible();
  expect(await screen.findByText("方向一")).toBeVisible();
  expect(screen.getByText("从旧信展开。")).toBeVisible();
});
