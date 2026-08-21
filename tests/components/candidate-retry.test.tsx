import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CandidatePanel } from "@/components/studio/candidate-panel";
import type { ProseSelection } from "@/components/studio/prose-editor";
import type { StoryState } from "@/lib/types";
import { StoryProvider, useStory } from "@/providers/story-provider";

function generationResponse(task: string, revision: number) {
  return new Response(JSON.stringify({
    mode: "demo",
    task,
    result: { candidates: [
      { id: `${task}-retry-1`, label: "重试候选一", content: "重试后候选一", rationale: "重放请求", tags: [], status: "pending" },
      { id: `${task}-retry-2`, label: "重试候选二", content: "重试后候选二", rationale: "重放请求", tags: [], status: "pending" },
    ] },
    contextRevision: revision,
  }));
}

function consistencyResponse(candidateId: string, revision: number) {
  return new Response(JSON.stringify({ mode: "demo", result: { consistencyReport: { candidateId, contextRevision: revision, findings: [], checkedAt: "刚刚", mode: "demo", userConfirmation: "none" } } }));
}

function StateObserver({ onState }: { onState: (state: StoryState) => void }) {
  const { state } = useStory();
  useEffect(() => { onState(state); }, [onState, state]);
  return null;
}

function DirectionSeed() {
  const { setState } = useStory();
  return <button onClick={() => setState((current) => ({
    ...current,
    dialogueThreads: [{ id: "direction-seed", role: "user", content: "让旧信引发不可撤回的选择", tags: ["推进冲突"], createdAt: "刚刚", contextRevision: current.contextRevision }],
  }))}>准备讨论摘要</button>;
}

function Harness({ onState, selectedText = "", selection }: { onState: (state: StoryState) => void; selectedText?: string; selection?: ProseSelection }) {
  return <StoryProvider>
    <StateObserver onState={onState} />
    <DirectionSeed />
    <CandidatePanel selectedText={selectedText} selection={selection} />
  </StoryProvider>;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

it("replays rewrite retry with the original text and selection snapshot", async () => {
  const user = userEvent.setup();
  let generationAttempts = 0;
  const fetcher = vi.fn((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "consistency-check") return Promise.resolve(consistencyResponse(body.input.candidate.id, body.input.candidate.revision));
    generationAttempts += 1;
    if (generationAttempts === 1) return Promise.reject(new Error("offline"));
    return Promise.resolve(generationResponse(body.task, body.project.contextRevision));
  });
  vi.stubGlobal("fetch", fetcher);
  const states: StoryState[] = [];
  const selection = { from: 4, to: 10, text: "原文片段" };
  render(<Harness onState={(state) => states.push(state)} selectedText={selection.text} selection={selection} />);

  await user.click(screen.getByRole("button", { name: "改写" }));
  await user.click(await screen.findByRole("button", { name: "重试" }));
  expect(await screen.findByText("重试后候选一")).toBeVisible();

  const generationBodies = fetcher.mock.calls.map((call) => JSON.parse(String(call[1]?.body))).filter((body) => body.task === "rewrite");
  expect(generationBodies).toHaveLength(2);
  expect(generationBodies[1]).toEqual(generationBodies[0]);
  expect(states.at(-1)?.candidates.find((candidate) => candidate.id === "rewrite-retry-1")).toMatchObject({ selection });
});

it("replays continuation retry with the original discussion summary prompt", async () => {
  const user = userEvent.setup();
  let generationAttempts = 0;
  const fetcher = vi.fn((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "consistency-check") return Promise.resolve(consistencyResponse(body.input.candidate.id, body.input.candidate.revision));
    generationAttempts += 1;
    if (generationAttempts === 1) return Promise.reject(new Error("offline"));
    return Promise.resolve(generationResponse(body.task, body.project.contextRevision));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Harness onState={() => undefined} />);

  await user.click(screen.getByRole("button", { name: "准备讨论摘要" }));
  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  await user.click(await screen.findByRole("button", { name: "重试" }));
  await screen.findByText("重试后候选一");

  const generationBodies = fetcher.mock.calls.map((call) => JSON.parse(String(call[1]?.body))).filter((body) => body.task === "continue");
  expect(generationBodies).toHaveLength(2);
  expect(generationBodies[0].input.prompt).toContain("让旧信引发不可撤回的选择");
  expect(generationBodies[1]).toEqual(generationBodies[0]);
});
