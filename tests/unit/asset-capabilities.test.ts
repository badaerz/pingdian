import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/assets/capabilities/route";
import { POST } from "@/app/api/assets/generate/route";

const validBody = {
  kind: "poster",
  title: "回响海报",
  settings: {
    prompt: "北方草场与工业遗址",
    negativePrompt: "文字，水印",
    model: "Qwen/Qwen-Image",
    size: "928x1664",
    advanced: { seed: 42, steps: 28, guidance: 6.5 },
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("asset capabilities", () => {
  it("returns only public, server-approved image controls", async () => {
    vi.stubEnv("MODELSCOPE_API_TOKEN", "must-not-leak");
    vi.stubEnv("MODELSCOPE_API_BASE_URL", "https://secret-provider.example/v1");

    const response = await GET();
    const payload = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      models: [
        { id: "Qwen/Qwen-Image", label: "Qwen Image（通用）" },
        { id: "AI-ModelScope/FLUX.1-schnell", label: "FLUX.1 Schnell（快速）" },
        { id: "AI-ModelScope/FLUX.1-dev", label: "FLUX.1 Dev（细节）" },
      ],
      sizes: ["1328x1328", "1664x928", "928x1664", "1472x1140", "1140x1472", "1584x1056", "1056x1584"],
      advanced: {
        seed: { type: "number", min: 0, max: 2147483647, transport: "draft-only" },
        steps: { type: "number", min: 1, max: 50, transport: "draft-only" },
        guidance: { type: "number", min: 1, max: 20, transport: "draft-only" },
      },
      transport: { model: "provider-native", prompt: "provider-native", negativePrompt: "compiled-prompt", size: "draft-only" },
    });
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("secret-provider");
  });

  it("does not let an arbitrary environment model expand the public whitelist", async () => {
    vi.stubEnv("MODELSCOPE_IMAGE_MODEL", "unverified/private-model");

    const response = await GET();
    const payload = await response.json() as { models: Array<{ id: string }> };

    expect(payload.models.map((item) => item.id)).toEqual([
      "Qwen/Qwen-Image",
      "AI-ModelScope/FLUX.1-schnell",
      "AI-ModelScope/FLUX.1-dev",
    ]);
  });

  it("supports an explicit server-side subset without exposing unknown model ids", async () => {
    vi.stubEnv("MODELSCOPE_IMAGE_MODELS", "AI-ModelScope/FLUX.1-dev,unverified/private-model");

    const response = await GET();
    const payload = await response.json() as { models: Array<{ id: string }> };

    expect(payload.models.map((item) => item.id)).toEqual(["AI-ModelScope/FLUX.1-dev"]);
  });

  it.each([
    [{ ...validBody, settings: { ...validBody.settings, model: "unverified/private-model" } }, "model"],
    [{ ...validBody, settings: { ...validBody.settings, size: "4096x4096" } }, "size"],
    [{ ...validBody, settings: { ...validBody.settings, advanced: { sampler: "unlisted" } } }, "advanced"],
    [{ ...validBody, settings: { ...validBody.settings, advanced: { steps: 51 } } }, "advanced"],
  ])("rejects image settings outside server capabilities", async (body, field) => {
    const response = await POST(new Request("http://localhost/api/assets/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE_SETTINGS", field });
  });
});
