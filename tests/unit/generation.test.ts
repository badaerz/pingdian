import { describe, expect, it, vi } from "vitest";
import { generateCandidates } from "@/lib/ai/generation";

describe("generateCandidates", () => {
  it("returns deterministic demo candidates without calling a model when no API key exists", async () => {
    const fetcher = vi.fn();

    const result = await generateCandidates({ operation: "continue", title: "雾港来信", content: "码头的钟停在凌晨三点十七分。" }, { apiKey: "", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", timeoutMs: 1000, maxInputChars: 24000 }, fetcher);

    expect(result.mode).toBe("demo");
    expect(result.reason).toBe("MISSING_API_KEY");
    expect(result.candidates).toHaveLength(2);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
