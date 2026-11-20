import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SlowAiRequests } from "@/components/ui/slow-ai-requests";
import { fetchAi } from "@/lib/ai/client";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function waitForAbort(signal: AbortSignal) {
  return new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
}

it("offers progress after 3 seconds and cancels only the selected request", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_, init: RequestInit) => waitForAbort(init.signal!)));
  render(<SlowAiRequests />);
  const external = new AbortController();
  const analysis = fetchAi("文学诊断", {}).catch(error => error);
  const graph = fetchAi("知识图谱", { signal: external.signal }).catch(error => error);
  act(() => vi.advanceTimersByTime(2999));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getAllByRole("status")).toHaveLength(2);

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "取消文学诊断" })));
  expect((await analysis).name).toBe("AbortError");
  expect(screen.getByRole("button", { name: "取消知识图谱" })).toBeVisible();

  await act(async () => external.abort());
  expect((await graph).name).toBe("AbortError");
  expect(screen.queryByRole("status")).toBeNull();
});

it("can cancel after the headers have arrived while waiting for the response body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (_, init: RequestInit) => ({ ok: true, json: () => waitForAbort(init.signal!) })));
  render(<SlowAiRequests />);
  const response = fetchAi("写作训练", {}).catch(error => error);
  await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(30_000); });

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "取消写作训练" })));
  expect((await response).name).toBe("AbortError");
  expect(screen.queryByRole("status")).toBeNull();
});
