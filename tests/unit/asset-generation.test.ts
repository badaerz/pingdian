import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pollModelScopeImageTask,
  readModelScopeImageUrl,
  readModelScopeTaskStatus,
  runAssetGeneration,
} from "@/lib/assets/generation";

const settings = {
  prompt: "北方草场与工业遗址",
  negativePrompt: "文字，水印",
  model: "Qwen/Qwen-Image",
  size: "928x1664",
  advanced: { seed: 42, steps: 28, guidance: 6.5 },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("IP asset generation", () => {
  it("returns a clearly labelled demo asset when no server key is configured", async () => {
    const result = await runAssetGeneration({ kind: "character-visual", title: "杭盖主视觉", settings: { ...settings, prompt: "青年声音采集师", size: "1328x1328" } }, { apiKey: "" });

    expect(result.mode).toBe("demo");
    expect(result.asset.previewUrl).toBe("/visuals/ip-lab-character.webp");
    expect(result.warnings.join(" ")).toContain("演示");
  });

  it("creates one ModelScope Qwen-Image task and returns exactly one completed image candidate", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "modelscope-task-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_status: "SUCCEED", output_images: ["https://cdn.modelscope.cn/qwen.png", "https://cdn.modelscope.cn/ignored.png"] }), { status: 200 }));
    const result = await runAssetGeneration(
      { kind: "poster", title: "回响海报", settings },
      { apiKey: "server-secret", baseUrl: "https://api-inference.modelscope.cn/", pollIntervalMs: 0, fetcher },
    );

    expect(result.mode).toBe("live");
    expect(result.asset.previewUrl).toBe("https://cdn.modelscope.cn/qwen.png");
    expect(result.asset.providerTaskId).toBe("modelscope-task-1");
    expect(result.asset.requestedSettings).toEqual(settings);
    expect(result.asset).not.toHaveProperty("generationSettings");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, "https://api-inference.modelscope.cn/v1/images/generations", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-ModelScope-Async-Mode": "true" }) }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://api-inference.modelscope.cn/v1/tasks/modelscope-task-1", expect.objectContaining({ method: "GET", headers: expect.objectContaining({ "X-ModelScope-Task-Type": "image_generation" }) }));
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      model: "Qwen/Qwen-Image",
      prompt: `${settings.prompt}\n\n排除元素：${settings.negativePrompt}`,
    });
    expect(result.asset.providerRequest).toEqual({ model: "Qwen/Qwen-Image", prompt: `${settings.prompt}\n\n排除元素：${settings.negativePrompt}` });
  });

  it("returns a pending asset immediately when async start mode is enabled", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "async-task-1" }), { status: 200 }));
    const result = await runAssetGeneration(
      { kind: "character-visual", title: "杭盖主视觉", settings },
      { apiKey: "server-secret", startOnly: true, fetcher },
    );

    expect(result.mode).toBe("live");
    expect(result.asset.generationStatus).toBe("pending");
    expect(result.asset.providerTaskId).toBe("async-task-1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("polls a submitted ModelScope task without creating another task", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_status: "RUNNING" }), { status: 200 }));
    const result = await pollModelScopeImageTask(
      { kind: "character-visual", title: "杭盖主视觉", settings },
      "async-task-1",
      { apiKey: "server-secret", fetcher },
    );

    expect(result).toEqual({ status: "pending" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://api-inference.modelscope.cn/v1/tasks/async-task-1", expect.objectContaining({ method: "GET" }));
  });

  it.each([
    [{ task_status: "succeed" }, "succeeded"],
    [{ status: "SUCCESS" }, "succeeded"],
    [{ task_status: "RUNNING" }, "pending"],
    [{ status: "processing" }, "pending"],
    [{ task_status: "FAILED" }, "failed"],
    [{ status: "error" }, "failed"],
    [{ task_status: "unexpected" }, "unknown"],
  ])("normalizes ModelScope task status from known response shapes", (payload, expected) => {
    expect(readModelScopeTaskStatus(payload)).toBe(expected);
  });

  it.each([
    [{ output_images: ["https://cdn.modelscope.cn/output-images.png"] }, "https://cdn.modelscope.cn/output-images.png"],
    [{ output: { image_urls: ["https://cdn.modelscope.cn/output-image-urls.png"] } }, "https://cdn.modelscope.cn/output-image-urls.png"],
    [{ results: [{ url: "https://cdn.modelscope.cn/results.png" }] }, "https://cdn.modelscope.cn/results.png"],
    [{ outputs: [{ url: "https://cdn.modelscope.cn/outputs.png" }] }, "https://cdn.modelscope.cn/outputs.png"],
    [{ outputs: ["https://cdn.modelscope.cn/outputs-string.png"] }, "https://cdn.modelscope.cn/outputs-string.png"],
  ])("reads the first downloadable image URL from known response shapes", (payload, expected) => {
    expect(readModelScopeImageUrl(payload)).toBe(expected);
  });

  it("keeps a lowercase successful task live instead of incorrectly falling back to demo", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "lowercase-success" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "succeed", output: { image_urls: ["https://cdn.modelscope.cn/lowercase.png"] } }), { status: 200 }));

    const result = await runAssetGeneration({ kind: "poster", title: "回响海报", settings }, { apiKey: "server-secret", pollIntervalMs: 0, fetcher });

    expect(result.mode).toBe("live");
    expect(result.asset.previewUrl).toBe("https://cdn.modelscope.cn/lowercase.png");
    expect(result.warnings).toEqual([]);
  });

  it("returns an actionable failed-stage demo result when ModelScope reports failure", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "failed-task" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "FAILED", message: "provider rejected prompt" }), { status: 200 }));

    const result = await runAssetGeneration({ kind: "poster", title: "回响海报", settings }, { apiKey: "server-secret", pollIntervalMs: 0, fetcher });

    expect(result.mode).toBe("demo");
    expect(result.asset.providerTaskId).toBe("failed-task");
    expect(result.asset.requestedSettings).toEqual(settings);
    expect(result.asset).not.toHaveProperty("generationSettings");
    expect(result.asset.failureStage).toBe("poll");
    expect(result.warnings.join(" ")).toContain("失败");
  });

  it("records HTTP and timeout failure stages without reporting them as live", async () => {
    const createHttpError = await runAssetGeneration(
      { kind: "poster", title: "回响海报", settings },
      { apiKey: "server-secret", fetcher: vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })) },
    );
    expect(createHttpError.mode).toBe("demo");
    expect(createHttpError.asset.failureStage).toBe("create");
    expect(createHttpError.asset.requestedSettings).toEqual(settings);
    expect(createHttpError.warnings.join(" ")).toContain("503");

    const timeout = await runAssetGeneration(
      { kind: "poster", title: "回响海报", settings },
      { apiKey: "server-secret", timeoutMs: 0, pollIntervalMs: 0, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: "timeout-task" }), { status: 200 })) },
    );
    expect(timeout.mode).toBe("demo");
    expect(timeout.asset.providerTaskId).toBe("timeout-task");
    expect(timeout.asset.failureStage).toBe("timeout");
    expect(timeout.asset.requestedSettings).toEqual(settings);
    expect(timeout.warnings.join(" ")).toContain("超时");
  });

  it("does not treat an unknown success-like shape or a missing image URL as live", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "unknown-shape" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_status: "SUCCEED", data: { url: "https://assets.example/unapproved-shape.png" } }), { status: 200 }));

    const result = await runAssetGeneration({ kind: "poster", title: "回响海报", settings }, { apiKey: "server-secret", pollIntervalMs: 0, fetcher });

    expect(result.mode).toBe("demo");
    expect(result.asset.failureStage).toBe("result");
    expect(result.warnings.join(" ")).toContain("有效图像地址");
  });

  it.each([
    "http://cdn.modelscope.cn/insecure.png",
    "https://evil.example/untrusted.png",
    "https://evilmodelscope.cn/lookalike.png",
    "https://user@cdn.modelscope.cn/credential.png",
    "https://cdn.modelscope.cn:8443/nonstandard-port.png",
  ])("rejects an image URL outside the shared HTTPS provider whitelist", async (previewUrl) => {
    expect(readModelScopeImageUrl({ output_images: [previewUrl] })).toBeNull();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "unsafe-url-task" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_status: "SUCCEED", output_images: [previewUrl] }), { status: 200 }));

    const result = await runAssetGeneration({ kind: "poster", title: "回响海报", settings }, { apiKey: "server-secret", pollIntervalMs: 0, fetcher });

    expect(result.mode).toBe("demo");
    expect(result.asset.failureStage).toBe("result");
  });

  it("classifies malformed create and poll JSON at the stage that produced it", async () => {
    const createResult = await runAssetGeneration(
      { kind: "poster", title: "回响海报", settings },
      { apiKey: "server-secret", fetcher: vi.fn().mockResolvedValue(new Response("{broken", { status: 200 })) },
    );
    expect(createResult.asset.failureStage).toBe("create");

    const pollResult = await runAssetGeneration(
      { kind: "poster", title: "回响海报", settings },
      {
        apiKey: "server-secret",
        pollIntervalMs: 0,
        fetcher: vi.fn()
          .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: "malformed-poll" }), { status: 200 }))
          .mockResolvedValueOnce(new Response("{broken", { status: 200 })),
      },
    );
    expect(pollResult.asset.failureStage).toBe("poll");
  });

  it.each(["create", "poll"] as const)("classifies a total timeout during %s JSON parsing as timeout", async (stage) => {
    vi.useFakeTimers();
    const stalledJsonResponse = (signal: AbortSignal) => ({
      ok: true,
      status: 200,
      json: () => new Promise<unknown>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }),
    }) as Response;
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      if (stage === "poll" && fetcher.mock.calls.length === 1) {
        return Promise.resolve(new Response(JSON.stringify({ task_id: "json-timeout-task" }), { status: 200 }));
      }
      return Promise.resolve(stalledJsonResponse(signal));
    });

    const pending = runAssetGeneration(
      { kind: "poster", title: "回响海报", settings },
      { apiKey: "server-secret", timeoutMs: 1_000, pollIntervalMs: 0, fetcher },
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(stage === "create" ? 1 : 2));
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await pending;

    expect(result.mode).toBe("demo");
    expect(result.asset.failureStage).toBe("timeout");
  });
});
