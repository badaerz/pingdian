import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiPostHandler } from "@/app/api/ai/route";
import { createRequestBudget, type RequestBudget } from "@/lib/http/request-budget";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("AI route request budget", () => {
  it("shares one injected budget across the AI and legacy generation routes", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const budget = createRequestBudget({
      limits: { perClientPerMinute: 1, daily: 100 },
      now: () => 30_250,
    });
    const aiHandler = createAiPostHandler({ requestBudget: budget });
    const firstResponse = await aiHandler(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.31",
      },
      body: JSON.stringify({
        task: "continue",
        project: {
          title: "雾港来信",
          genre: "纯文学短篇",
          logline: "守夜人收到一封迟到的信。",
          activeChapterId: "chapter-1",
          contextRevision: 1,
          chapters: [{ id: "chapter-1", title: "第一章", content: "码头的钟停了。", wordCount: 8, summary: "", order: 0 }],
          characters: [],
          worldEntries: [],
          blueprint: [],
        },
      }),
    }));
    expect(firstResponse.status).toBe(200);

    const legacyRoute = await import("@/app/api/generate/route");
    const createLegacyPostHandler = (legacyRoute as typeof legacyRoute & {
      createLegacyPostHandler: (options: {
        requestBudget: RequestBudget;
        fetcher: typeof fetch;
      }) => (request: Request) => Promise<Response>;
    }).createLegacyPostHandler;
    expect(createLegacyPostHandler).toBeTypeOf("function");

    const providerFetcher = vi.fn();
    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.31",
      },
      body: "{}",
    });
    const parseBody = vi.spyOn(request, "json");
    const legacyHandler = createLegacyPostHandler({
      requestBudget: budget,
      fetcher: providerFetcher as typeof fetch,
    });

    const response = await legacyHandler(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      error: "RATE_LIMITED",
      retryAfterSeconds: 30,
    });
    expect(parseBody).not.toHaveBeenCalled();
    expect(providerFetcher).not.toHaveBeenCalled();
  });

  it("rejects before parsing or calling the provider with non-cacheable retry metadata", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "server-secret");
    const budget = createRequestBudget({
      limits: { perClientPerMinute: 1, daily: 100 },
      now: () => 30_250,
    });
    const request = new Request("http://localhost/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.30",
      },
      body: "{}",
    });
    budget.consume(request.headers);
    const parseBody = vi.spyOn(request, "json");
    const fetcher = vi.fn();
    const handler = createAiPostHandler({ requestBudget: budget, fetcher });

    const response = await handler(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      error: "RATE_LIMITED",
      retryAfterSeconds: 30,
    });
    expect(parseBody).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
