import "../fixtures/seeded-store";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CandidatePanel } from "@/components/studio/candidate-panel";
import type { StoryState } from "@/lib/types";
import { StoryProvider, useStory } from "@/providers/story-provider";

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => { resolve = next; });
  return { promise, resolve };
}

function candidateResponse(id: string, content: string, revision: number) {
  return new Response(JSON.stringify({
    mode: "demo",
    task: "continue",
    requestId: `continue-${id}`,
    contextRevision: revision,
    warnings: [],
    result: { candidates: [{ id, label: "延迟候选", content, rationale: "测试卸载边界", tags: [], status: "pending" }] },
  }), { status: 200 });
}

function consistencyResponse(candidateId: string, revision: number, high = false) {
  return new Response(JSON.stringify({
    mode: "demo",
    task: "consistency-check",
    requestId: `check-${candidateId}`,
    contextRevision: revision,
    warnings: [],
    result: { consistencyReport: {
      candidateId,
      contextRevision: revision,
      findings: high ? [{
        id: "finding-unmount",
        category: "character",
        severity: "high",
        expectedFact: "杭盖保持克制",
        candidateQuote: "砸碎录音笔",
        priorEvidence: "敏锐、疏离、技术理性、身份迷茫",
        suggestion: "补足行动动机。",
      }] : [],
      checkedAt: "刚刚",
      mode: "demo",
      userConfirmation: "none",
    } },
  }), { status: 200 });
}

function StateObserver({ onState }: { onState: (state: StoryState) => void }) {
  const { state } = useStory();
  useEffect(() => { onState(state); }, [onState, state]);
  return null;
}

function CandidateHarness({ visible, onState }: { visible: boolean; onState: (state: StoryState) => void }) {
  return <StoryProvider>
    <StateObserver onState={onState} />
    {visible ? <CandidatePanel /> : null}
  </StoryProvider>;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

it("aborts and ignores a continuation response that resolves after unmount", async () => {
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
  const onState = (state: StoryState) => states.push(state);
  const view = render(<CandidateHarness visible onState={onState} />);

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<CandidateHarness visible={false} onState={onState} />);

  expect(signal?.aborted).toBe(true);
  await act(async () => { pending.resolve(candidateResponse("late-continue", "卸载后候选", states.at(-1)!.contextRevision)); });
  expect(states.at(-1)?.candidates.some((candidate) => candidate.id === "late-continue")).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("aborts and ignores a consistency response that resolves after unmount", async () => {
  const user = userEvent.setup();
  const pendingCheck = deferredResponse();
  const fetcher = vi.fn((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "continue") return Promise.resolve(candidateResponse("late-check", "杭盖收起录音笔。", body.project.contextRevision));
    return pendingCheck.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const states: StoryState[] = [];
  const onState = (state: StoryState) => states.push(state);
  const view = render(<CandidateHarness visible onState={onState} />);

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(states.at(-1)?.candidates.some((candidate) => candidate.id === "late-check")).toBe(true);
  const signal = fetcher.mock.calls[1]?.[1]?.signal;
  view.rerender(<CandidateHarness visible={false} onState={onState} />);

  expect(signal?.aborted).toBe(true);
  await act(async () => { pendingCheck.resolve(consistencyResponse("late-check", states.at(-1)!.contextRevision)); });
  expect(states.at(-1)?.consistencyReports.some((report) => report.candidateId === "late-check")).toBe(false);
});

it("aborts and ignores an AI revision response that resolves after unmount", async () => {
  const user = userEvent.setup();
  const pendingRevision = deferredResponse();
  const fetcher = vi.fn((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.task === "continue" && !body.input.prompt) return Promise.resolve(candidateResponse("risky-unmount", "杭盖砸碎录音笔。", body.project.contextRevision));
    if (body.task === "consistency-check") return Promise.resolve(consistencyResponse(body.input.candidate.id, body.input.candidate.revision, true));
    return pendingRevision.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const states: StoryState[] = [];
  const onState = (state: StoryState) => states.push(state);
  const view = render(<CandidateHarness visible onState={onState} />);

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  await user.click(await screen.findByRole("button", { name: "审阅候选冲突" }));
  await user.click(screen.getByRole("button", { name: "请 AI 按建议重写" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  const signal = fetcher.mock.calls[2]?.[1]?.signal;
  view.rerender(<CandidateHarness visible={false} onState={onState} />);

  expect(signal?.aborted).toBe(true);
  await act(async () => { pendingRevision.resolve(candidateResponse("late-revision", "卸载后修订候选", states.at(-1)!.contextRevision)); });
  expect(states.at(-1)?.candidates.some((candidate) => candidate.id === "late-revision")).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
