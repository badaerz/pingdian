import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { StoryDirectionChat } from "@/components/studio/story-direction-chat";
import { initialStoryState } from "@/data/mock-data";
import { contextFromState } from "@/lib/ai/story-context";
import type { StoryDirectionMessage } from "@/lib/types";

const DEFAULT_TAGS = ["跌宕起伏", "轻松日常", "推进冲突", "深化人物关系", "埋设悬念", "强化情感"];

afterEach(() => vi.unstubAllGlobals());

function directionResponse(question: string) {
  return new Response(JSON.stringify({
    mode: "demo",
    task: "story-direction",
    requestId: `direction-${question}`,
    contextRevision: initialStoryState.contextRevision,
    warnings: ["离线演示结果"],
    result: {
      direction: {
        understanding: "你希望冲突从人物选择中生长。",
        recommendation: "先让人物做出一个不能撤回的小动作。",
        risks: ["避免过早解释谜底"],
        question,
        suggestedTags: ["推进冲突", "埋设悬念"],
      },
    },
  }), { status: 200 });
}

function ChatHarness({ onGenerate }: { onGenerate: (summary: string) => void }) {
  const [messages, setMessages] = useState<StoryDirectionMessage[]>([]);
  return <StoryDirectionChat
    projectKey="demo"
    project={contextFromState(initialStoryState)}
    messages={messages}
    onAppend={(message) => setMessages((current) => [...current, message])}
    onGenerateCandidates={onGenerate}
  />;
}

it("keeps all default direction tags visible on every discussion round and only generates on explicit request", async () => {
  const user = userEvent.setup();
  const generate = vi.fn();
  const fetcher = vi.fn()
    .mockResolvedValueOnce(directionResponse("人物愿意承担什么代价？"))
    .mockResolvedValueOnce(directionResponse("这次选择会伤害哪段关系？"));
  vi.stubGlobal("fetch", fetcher);
  render(<ChatHarness onGenerate={generate} />);

  for (const tag of DEFAULT_TAGS) expect(screen.getByRole("button", { name: tag })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "跌宕起伏" }));
  await user.type(screen.getByLabelText("本轮补充"), "让舅甥关系先出现裂缝");
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));

  expect(await screen.findByText("先让人物做出一个不能撤回的小动作。")).toBeVisible();
  expect(screen.getByText("演示分析")).toBeVisible();
  expect(screen.getByText("离线演示结果")).toBeVisible();
  expect(generate).not.toHaveBeenCalled();
  for (const tag of DEFAULT_TAGS) expect(screen.getByRole("button", { name: tag })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "轻松日常" }));
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));
  expect(await screen.findByText(/这次选择会伤害哪段关系/)).toBeVisible();

  const secondBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
  expect(secondBody.task).toBe("story-direction");
  expect(secondBody.input.thread.map((message: { role: string }) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(generate).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  expect(generate).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("ignores an assistant response that resolves after the active project changes", async () => {
  const user = userEvent.setup();
  let resolveResponse!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
  const append = vi.fn();
  const project = contextFromState(initialStoryState);
  const view = render(<StoryDirectionChat projectKey="demo" project={project} messages={[]} onAppend={append} onGenerateCandidates={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "推进冲突" }));
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));
  expect(append).toHaveBeenCalledTimes(1);

  view.rerender(<StoryDirectionChat projectKey="other" project={{ ...project, title: "另一个项目" }} messages={[]} onAppend={append} onGenerateCandidates={vi.fn()} />);
  resolveResponse(directionResponse("不应写入旧项目"));

  await waitFor(() => expect(append).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("不应写入旧项目")).not.toBeInTheDocument();
});

it("aborts and ignores a discussion response that resolves after unmount", async () => {
  const user = userEvent.setup();
  let resolveResponse!: (value: Response) => void;
  let signal: AbortSignal | null | undefined;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    void url;
    signal = init?.signal;
    return new Promise<Response>((resolve) => { resolveResponse = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);
  const append = vi.fn();
  const recordRun = vi.fn();
  const view = render(<StoryDirectionChat
    projectKey="demo"
    project={contextFromState(initialStoryState)}
    messages={[]}
    onAppend={append}
    onGenerateCandidates={vi.fn()}
    onRecordRun={recordRun}
  />);

  await user.click(screen.getByRole("button", { name: "推进冲突" }));
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));
  expect(append).toHaveBeenCalledTimes(1);

  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolveResponse(directionResponse("卸载后不得追加")); });

  expect(append).toHaveBeenCalledTimes(1);
  expect(recordRun).not.toHaveBeenCalled();
});

it("aborts an in-flight discussion and resets loading when the active chapter changes", async () => {
  const user = userEvent.setup();
  let resolveResponse!: (value: Response) => void;
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    void url;
    signal = init?.signal;
    return new Promise<Response>((resolve) => { resolveResponse = resolve; });
  }));
  const append = vi.fn();
  const project = contextFromState(initialStoryState);
  const view = render(<StoryDirectionChat projectKey="demo" project={project} messages={[]} onAppend={append} onGenerateCandidates={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "推进冲突" }));
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));
  expect(screen.getByRole("button", { name: "分析中…" })).toBeDisabled();

  view.rerender(<StoryDirectionChat projectKey="demo" project={{ ...project, activeChapterId: "chapter-2" }} messages={[]} onAppend={append} onGenerateCandidates={vi.fn()} />);

  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole("button", { name: "发送并继续讨论" })).toBeEnabled();
  await act(async () => { resolveResponse(directionResponse("旧章响应")); });
  expect(append).toHaveBeenCalledTimes(1);
});

it("clears a failed direction state when context revision changes", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const project = contextFromState(initialStoryState);
  const view = render(<StoryDirectionChat projectKey="demo" project={project} messages={[]} onAppend={vi.fn()} onGenerateCandidates={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "推进冲突" }));
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));
  expect(await screen.findByRole("alert")).toBeVisible();

  view.rerender(<StoryDirectionChat projectKey="demo" project={{ ...project, contextRevision: project.contextRevision + 1 }} messages={[]} onAppend={vi.fn()} onGenerateCandidates={vi.fn()} />);

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "发送并继续讨论" })).toBeEnabled();

  view.rerender(<StoryDirectionChat projectKey="demo" project={project} messages={[]} onAppend={vi.fn()} onGenerateCandidates={vi.fn()} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "发送并继续讨论" })).toBeEnabled();
});

it("retries the failed direction request without appending the same user turn twice", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(directionResponse("重试后的追问"));
  vi.stubGlobal("fetch", fetcher);
  const append = vi.fn();
  render(<StoryDirectionChat projectKey="demo" project={contextFromState(initialStoryState)} messages={[]} onAppend={append} onGenerateCandidates={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "推进冲突" }));
  await user.type(screen.getByLabelText("本轮补充"), "保留这个精确请求");
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(append).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "重试本轮讨论" }));
  await waitFor(() => expect(append).toHaveBeenCalledTimes(2));
  expect(append.mock.calls.map(([message]) => message.role)).toEqual(["user", "assistant"]);
  expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)));
});

it("keeps long discussions within the server thread and prompt limits", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue(directionResponse("下一轮问题"));
  vi.stubGlobal("fetch", fetcher);
  const messages: StoryDirectionMessage[] = Array.from({ length: 25 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `${index}-${"方向细化".repeat(120)}`,
    tags: [],
    createdAt: "刚刚",
    contextRevision: initialStoryState.contextRevision,
  }));
  const generate = vi.fn();
  render(<StoryDirectionChat projectKey="demo" project={contextFromState(initialStoryState)} messages={messages} onAppend={vi.fn()} onGenerateCandidates={generate} />);

  await user.click(screen.getByRole("button", { name: "推进冲突" }));
  await user.click(screen.getByRole("button", { name: "发送并继续讨论" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
  expect(body.input.thread).toHaveLength(20);

  await user.click(screen.getByRole("button", { name: "生成续写候选" }));
  expect(generate.mock.calls[0]?.[0].length).toBeLessThanOrEqual(4_000);
});
