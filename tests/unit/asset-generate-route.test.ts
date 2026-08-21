import { afterEach, describe, expect, it, vi } from "vitest";

const { runAssetGeneration } = vi.hoisted(() => ({ runAssetGeneration: vi.fn() }));

vi.mock("@/lib/assets/generation", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/assets/generation")>(),
  runAssetGeneration,
}));

import { POST } from "@/app/api/assets/generate/route";

const validBody = {
  kind: "poster",
  title: "回响海报",
  settings: {
    prompt: "北方草场与工业遗址",
    negativePrompt: "文字，水印",
    model: "Qwen/Qwen-Image",
    size: "928x1664",
    advanced: { seed: 42 },
  },
};

function request() {
  return new Request("http://localhost/api/assets/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validBody),
  });
}

const demoResult = {
  mode: "demo" as const,
  asset: {
    id: "asset-budget",
    kind: "poster" as const,
    title: "回响海报",
    mode: "demo" as const,
    previewUrl: "/visuals/ip-lab-poster.webp",
    createdAt: "2026-08-20T00:00:00.000Z",
    confirmed: false,
  },
  warnings: ["demo"],
};

afterEach(() => {
  vi.unstubAllEnvs();
  runAssetGeneration.mockReset();
});

describe("asset generation route budget", () => {
  it("forces the local demo asset when defense lock is enabled", async () => {
    vi.stubEnv("MODELSCOPE_IMAGE_MAX_PER_MINUTE", "1");
    vi.stubEnv("MODELSCOPE_API_TOKEN", "server-secret");
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOCKED", "true");
    runAssetGeneration.mockResolvedValue(demoResult);

    expect((await POST(request())).status).toBe(200);
    expect(runAssetGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ apiKey: "" }));
  });

  it("skips demo requests, holds one paid lease through completion, and enforces the fixed window", async () => {
    vi.stubEnv("MODELSCOPE_IMAGE_MAX_PER_MINUTE", "2");
    vi.stubEnv("MODELSCOPE_IMAGE_MAX_CONCURRENT", "999999");
    let resolvePaid: ((value: typeof demoResult) => void) | undefined;
    let paidCalls = 0;
    runAssetGeneration.mockImplementation((_input, config: { apiKey: string }) => {
      if (!config.apiKey) return Promise.resolve(demoResult);
      paidCalls += 1;
      if (paidCalls === 1) return new Promise((resolve) => { resolvePaid = resolve; });
      return Promise.resolve(demoResult);
    });

    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);

    vi.stubEnv("MODELSCOPE_API_TOKEN", "server-secret");
    const firstPaid = POST(request());
    await vi.waitFor(() => expect(paidCalls).toBe(1));
    const concurrent = await POST(request());
    expect(concurrent.status).toBe(429);
    expect(concurrent.headers.get("Retry-After")).toBe("60");

    resolvePaid?.(demoResult);
    expect((await firstPaid).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(429);
    expect(runAssetGeneration).toHaveBeenCalledTimes(4);
  });

  it("uses non-blocking provider submission for paid image requests", async () => {
    vi.stubEnv("MODELSCOPE_API_TOKEN", "server-secret");
    runAssetGeneration.mockResolvedValue(demoResult);

    expect((await POST(request())).status).toBe(200);
    expect(runAssetGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ apiKey: "server-secret", startOnly: true }));
  });
});
