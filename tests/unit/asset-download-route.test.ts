import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/assets/download/route";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("asset download proxy", () => {
  it("proxies approved ModelScope image hosts for IndexedDB confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("image", { status: 200, headers: { "Content-Type": "image/png" } })));
    const response = await GET(new Request("http://localhost/api/assets/download?url=https%3A%2F%2Fmodelscope.cn%2Fassets%2Fqwen.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });

  it("rejects untrusted download hosts", async () => {
    const response = await GET(new Request("http://localhost/api/assets/download?url=https%3A%2F%2Fevil.example%2Fsecret"));

    expect(response.status).toBe(400);
  });

  it("rejects a non-image response before proxying its body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-image", { status: 200, headers: { "Content-Type": "text/html" } })));

    const response = await GET(new Request("http://localhost/api/assets/download?url=https%3A%2F%2Fmodelscope.cn%2Fassets%2Fqwen.png"));

    expect(response.status).toBe(415);
  });

  it("aborts and cancels a non-success upstream response before returning 502", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    let upstreamSignal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", vi.fn((_target: URL, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      return Promise.resolve(new Response(body, { status: 503 }));
    }));

    const response = await GET(new Request("http://localhost/api/assets/download?url=https%3A%2F%2Fmodelscope.cn%2Fassets%2Fqwen.png"));

    expect(response.status).toBe(502);
    expect(upstreamSignal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects an oversized Content-Length without buffering the body", async () => {
    vi.stubEnv("MODELSCOPE_IMAGE_MAX_BYTES", "1024");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": "1025" },
    })));

    const response = await GET(new Request("http://localhost/api/assets/download?url=https%3A%2F%2Fmodelscope.cn%2Fassets%2Fqwen.png"));

    expect(response.status).toBe(413);
  });

  it("enforces the byte limit while streaming when Content-Length is absent", async () => {
    vi.stubEnv("MODELSCOPE_IMAGE_MAX_BYTES", "1024");
    let upstreamSignal: AbortSignal | null | undefined;
    let pull = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pull += 1;
        if (pull === 1) controller.enqueue(new Uint8Array(700));
        else if (pull === 2) controller.enqueue(new Uint8Array(400));
        else controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn((_target: URL, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "image/png" } }));
    }));

    const response = await GET(new Request("http://localhost/api/assets/download?url=https%3A%2F%2Fmodelscope.cn%2Fassets%2Fqwen.png"));

    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow();
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("aborts a stalled upstream request after the bounded timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("MODELSCOPE_IMAGE_DOWNLOAD_TIMEOUT_MS", "1000");
    const fetchMock = vi.fn((_target: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = GET(new Request("http://localhost/api/assets/download?url=https%3A%2F%2Fmodelscope.cn%2Fassets%2Fqwen.png"));
    await Promise.resolve();
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;

    expect(response.status).toBe(502);
    expect(signal?.aborted).toBe(true);
  });
});
