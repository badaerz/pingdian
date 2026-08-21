import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { CandidatePanel } from "@/components/studio/candidate-panel";
import { STORY_STORE_KEY, createStoryStore } from "@/lib/story-store";
import { StoryProvider, useStory } from "@/providers/story-provider";

function seedMalformedReport() {
  const store = createStoryStore();
  const document = store.documents.demo;
  const candidate = document.candidates[0];
  candidate.generatedRevision = document.contextRevision;
  candidate.target = { type: "chapter", id: document.activeChapterId };
  document.consistencyReports = [{
    candidateId: candidate.id,
    contextRevision: document.contextRevision,
    findings: [
      { id: "valid-low", category: "plot", severity: "low", expectedFact: "已有铺垫", candidateQuote: "候选原句", priorEvidence: "正文证据", suggestion: "保留因果链" },
      { id: "broken-high", category: "character", severity: "high", expectedFact: "人物怕水", candidateQuote: 42, priorEvidence: "人物卡", suggestion: "修正动作" },
    ],
    checkedAt: "刚刚",
    mode: "demo",
    userConfirmation: "none",
  }] as unknown as typeof document.consistencyReports;
  localStorage.setItem(STORY_STORE_KEY, JSON.stringify(store));
  return { candidateId: candidate.id, revision: document.contextRevision };
}

function successfulCheck(candidateId: string, revision: number) {
  return new Response(JSON.stringify({
    mode: "demo",
    result: { consistencyReport: { candidateId, contextRevision: revision, findings: [], checkedAt: "刚刚", mode: "demo", userConfirmation: "none" } },
  }));
}

function ProjectSwitch() {
  const { selectProject } = useStory();
  return <button onClick={() => selectProject("demo-demo_002")}>切换恢复测试项目</button>;
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("automatically rechecks a restored candidate whose malformed report was discarded before enabling adoption", async () => {
  const { candidateId, revision } = seedMalformedReport();
  let resolveCheck!: (response: Response) => void;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    void url;
    void init;
    return new Promise<Response>((resolve) => { resolveCheck = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><CandidatePanel /></StoryProvider>);

  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).task).toBe("consistency-check");
  expect(screen.getByText("一致性检查中…")).toBeVisible();
  expect(screen.getByRole("button", { name: "采纳候选" })).toBeDisabled();

  await act(async () => { resolveCheck(successfulCheck(candidateId, revision)); });
  expect(await screen.findByText("低风险提示")).toBeVisible();
  expect(screen.getByRole("button", { name: "采纳候选" })).toBeEnabled();
  await act(async () => undefined);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("offers a manual consistency retry after restored-candidate checking fails", async () => {
  const user = userEvent.setup();
  const { candidateId, revision } = seedMalformedReport();
  const fetcher = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(successfulCheck(candidateId, revision));
  vi.stubGlobal("fetch", fetcher);
  render(<StoryProvider><CandidatePanel /></StoryProvider>);

  expect(await screen.findByText("检查失败")).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "采纳候选" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "重新检查一致性" }));

  expect(await screen.findByText("低风险提示")).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "采纳候选" })).toBeEnabled();
});

it("aborts restored-candidate checking when the active project changes", async () => {
  seedMalformedReport();
  const user = userEvent.setup();
  let signal: AbortSignal | null | undefined;
  let resolveCheck!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise<Response>((resolve) => { resolveCheck = resolve; });
  }));
  render(<StoryProvider><ProjectSwitch /><CandidatePanel /></StoryProvider>);

  await screen.findByText("一致性检查中…");
  await user.click(screen.getByRole("button", { name: "切换恢复测试项目" }));
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolveCheck(successfulCheck("old-project-candidate", 1)); });
  expect(screen.queryByText("一致性检查中…")).not.toBeInTheDocument();
});
