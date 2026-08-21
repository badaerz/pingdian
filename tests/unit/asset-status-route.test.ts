import { afterEach, describe, expect, it, vi } from "vitest";

const { pollModelScopeImageTask } = vi.hoisted(() => ({ pollModelScopeImageTask: vi.fn() }));

vi.mock("@/lib/assets/generation", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/assets/generation")>(),
  pollModelScopeImageTask,
}));

import { POST } from "@/app/api/assets/status/route";

const body = {
  kind: "character-visual",
  title: "杭盖主视觉",
  providerTaskId: "task-1",
  settings: {
    prompt: "北方草场与工业遗址",
    negativePrompt: "文字，水印",
    model: "Qwen/Qwen-Image",
    size: "928x1664",
    advanced: { seed: 42 },
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  pollModelScopeImageTask.mockReset();
});

describe("asset status route", () => {
  it("returns the provider polling state with a no-store response", async () => {
    vi.stubEnv("MODELSCOPE_API_TOKEN", "server-secret");
    pollModelScopeImageTask.mockResolvedValue({ status: "pending" });

    const response = await POST(new Request("http://localhost/api/assets/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ status: "pending" });
    expect(pollModelScopeImageTask).toHaveBeenCalledWith(expect.objectContaining({ kind: "character-visual" }), "task-1", expect.objectContaining({ apiKey: "server-secret" }));
  });
});
