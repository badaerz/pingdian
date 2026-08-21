import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/knowledge/search/route";

const envNames = [
  "EMBEDDING_API_KEY",
  "EMBEDDING_BASE_URL",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS",
  "EMBEDDING_PUBLIC_SEARCH_ENABLED",
  "EMBEDDING_PUBLIC_SEARCH_MAX_PER_MINUTE",
  "EMBEDDING_PUBLIC_SEARCH_MAX_CONCURRENT",
  "KNOWLEDGE_ALLOW_IMITATION",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_DEMO_LOCKED",
] as const;

const originalEnv = new Map(envNames.map((name) => [name, process.env[name]]));

function request(body: unknown) {
  return new Request("http://localhost/api/knowledge/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/knowledge/search", () => {
  beforeEach(() => {
    envNames.forEach((name) => delete process.env[name]);
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-secret-must-not-leak";
  });

  it("forces local keyword retrieval without external calls in defense mode", async () => {
    process.env.NEXT_PUBLIC_DEMO_LOCKED = "true";
    process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED = "true";
    process.env.EMBEDDING_API_KEY = "embedding-secret";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(request({ query: "潜台词" }));

    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("keyword");
    expect(fetcher).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    envNames.forEach((name) => {
      const value = originalEnv.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
  });

  it("returns 429 after the server-side embedding minute budget is exhausted", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED = "true";
    process.env.EMBEDDING_PUBLIC_SEARCH_MAX_PER_MINUTE = "1";
    process.env.EMBEDDING_PUBLIC_SEARCH_MAX_CONCURRENT = "2";
    process.env.EMBEDDING_API_KEY = "embedding-secret-must-not-leak";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/embeddings")
      ? Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0) }] })
      : Response.json([]));
    vi.stubGlobal("fetch", fetcher);

    expect((await POST(request({ query: "潜台词" }))).status).toBe(200);
    const limited = await POST(request({ query: "潜台词" }));
    const text = await limited.text();

    expect(limited.status).toBe(429);
    expect(text).not.toContain("embedding-secret-must-not-leak");
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/embeddings"))).toHaveLength(1);
  });

  it("releases the concurrent embedding slot after the provider request settles", async () => {
    vi.spyOn(Date, "now").mockReturnValue(200_000);
    process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED = "true";
    process.env.EMBEDDING_PUBLIC_SEARCH_MAX_PER_MINUTE = "10";
    process.env.EMBEDDING_PUBLIC_SEARCH_MAX_CONCURRENT = "1";
    process.env.EMBEDDING_API_KEY = "embedding-secret";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    let settleFirstEmbedding: ((response: Response) => void) | undefined;
    const firstEmbedding = new Promise<Response>((resolve) => { settleFirstEmbedding = resolve; });
    let embeddingCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).includes("/embeddings")) return Response.json([]);
      embeddingCalls += 1;
      if (embeddingCalls === 1) return firstEmbedding;
      return Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0) }] });
    }));

    const first = POST(request({ query: "潜台词" }));
    await vi.waitFor(() => expect(embeddingCalls).toBe(1));
    expect((await POST(request({ query: "潜台词" }))).status).toBe(429);
    settleFirstEmbedding?.(Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0) }] }));
    expect((await first).status).toBe(200);
    expect((await POST(request({ query: "潜台词" }))).status).toBe(200);
    expect(embeddingCalls).toBe(2);
  });

  it("uses the service-role private RPC only for an explicitly permitted imitation request", async () => {
    vi.spyOn(Date, "now").mockReturnValue(300_000);
    process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED = "true";
    process.env.KNOWLEDGE_ALLOW_IMITATION = "true";
    process.env.EMBEDDING_API_KEY = "embedding-secret";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret-must-not-leak";
    const rpcRequests: Array<{ url: string; apiKey: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/embeddings")) return Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0) }] });
      rpcRequests.push({ url, apiKey: new Headers(init?.headers).get("apikey") });
      return Response.json([]);
    }));

    const response = await POST(request({ query: "已核验样本", allowImitation: true, chunkTypes: ["text_sample"] }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(rpcRequests).toEqual([expect.objectContaining({
      url: expect.stringContaining("/rpc/match_literature_knowledge_private"),
      apiKey: "service-role-secret-must-not-leak",
    })]);
    expect(text).not.toContain("service-role-secret-must-not-leak");
  });

  it("uses the public RPC when imitation is allowed but chunk types are omitted", async () => {
    vi.spyOn(Date, "now").mockReturnValue(350_000);
    process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED = "true";
    process.env.KNOWLEDGE_ALLOW_IMITATION = "true";
    process.env.EMBEDDING_API_KEY = "embedding-secret";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    const rpcRequests: Array<{ url: string; apiKey: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/embeddings")) return Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0) }] });
      rpcRequests.push({ url, apiKey: new Headers(init?.headers).get("apikey") });
      return Response.json([{ id: "public-summary-1", work_id: "KB_001", chunk_type: "summary", content: "公共摘要证据", metadata: {}, similarity: 0.9 }]);
    }));

    const response = await POST(request({ query: "公共摘要", allowImitation: true }));
    const body = await response.json();

    expect(body.mode).toBe("vector");
    expect(rpcRequests).toEqual([expect.objectContaining({
      url: expect.stringContaining("/rpc/match_literature_knowledge"),
      apiKey: "anon-key",
    })]);
    expect(rpcRequests[0].url).not.toContain("match_literature_knowledge_private");
  });

  it("uses the public RPC for summary-only retrieval without requiring a service key", async () => {
    vi.spyOn(Date, "now").mockReturnValue(375_000);
    process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED = "true";
    process.env.KNOWLEDGE_ALLOW_IMITATION = "true";
    process.env.EMBEDDING_API_KEY = "embedding-secret";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const rpcRequests: Array<{ url: string; apiKey: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/embeddings")) return Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0) }] });
      rpcRequests.push({ url, apiKey: new Headers(init?.headers).get("apikey") });
      return Response.json([{ id: "public-summary-2", work_id: "KB_001", chunk_type: "summary", content: "公共摘要证据", metadata: {}, similarity: 0.9 }]);
    }));

    const response = await POST(request({ query: "公共摘要", allowImitation: true, chunkTypes: ["summary"] }));
    const body = await response.json();

    expect(body.mode).toBe("vector");
    expect(rpcRequests).toEqual([expect.objectContaining({
      url: expect.stringContaining("/rpc/match_literature_knowledge"),
      apiKey: "anon-key",
    })]);
    expect(rpcRequests[0].url).not.toContain("match_literature_knowledge_private");
  });

  it("keeps ordinary vector search on the public RPC even when a service key exists", async () => {
    vi.spyOn(Date, "now").mockReturnValue(400_000);
    process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED = "true";
    process.env.KNOWLEDGE_ALLOW_IMITATION = "true";
    process.env.EMBEDDING_API_KEY = "embedding-secret";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    const rpcRequests: Array<{ url: string; apiKey: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/embeddings")) return Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0) }] });
      rpcRequests.push({ url, apiKey: new Headers(init?.headers).get("apikey") });
      return Response.json([]);
    }));

    expect((await POST(request({ query: "潜台词" }))).status).toBe(200);
    expect(rpcRequests).toEqual([expect.objectContaining({
      url: expect.stringContaining("/rpc/match_literature_knowledge"),
      apiKey: "anon-key",
    })]);
    expect(rpcRequests[0].url).not.toContain("match_literature_knowledge_private");
  });

  it("forces keyword mode without calling a provider when dimensions are not 384", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ embedding: Array.from({ length: 1_536 }, () => 0) }] }));
    vi.stubGlobal("fetch", fetcher);
    process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED = "true";
    process.env.EMBEDDING_API_KEY = "embedding-secret";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    process.env.EMBEDDING_DIMENSIONS = "1536";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const response = await POST(request({ query: "潜台词" }));
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("keyword");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses keyword mode without an embedding key and never exposes environment secrets", async () => {
    const response = await POST(request({ query: "如何写出对话的潜台词", limit: 3 }));
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body.mode).toBe("keyword");
    expect(body.evidence.length).toBeGreaterThan(0);
    expect(text).not.toContain("anon-secret-must-not-leak");
  });

  it("falls back to keyword mode when Supabase environment values are malformed", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    process.env.EMBEDDING_API_KEY = "embedding-secret-must-not-leak";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";

    const response = await POST(request({ query: "潜台词", limit: 2 }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text).mode).toBe("keyword");
    expect(text).not.toContain("embedding-secret-must-not-leak");
  });

  it("does not enable embedding or imitation from anonymous request fields alone", async () => {
    process.env.EMBEDDING_API_KEY = "embedding-secret-must-not-leak";
    process.env.EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.EMBEDDING_MODEL = "small-embedding";
    const response = await POST(request({ query: "潜台词", allowImitation: true, chunkTypes: ["text_sample"] }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text).mode).toBe("none");
    expect(text).not.toContain("embedding-secret-must-not-leak");
  });

  it.each([
    { query: "   " },
    { query: "文".repeat(2001) },
    { query: "主题", limit: 0 },
    { query: "主题", limit: 1.5 },
    { query: "主题", workIds: [""] },
    { query: "主题", chunkTypes: ["x".repeat(101)] },
    { query: "主题", chunkTypes: ["private_chunk"] },
    { query: "主题", chunkTypes: ["full_text"] },
    { query: "主题", chunkTypes: ["text-sample"] },
    { query: "主题", chunkTypes: ["imitation"] },
    { query: "主题", allowImitation: "false" },
    { query: "主题", unexpected: true },
  ])("rejects invalid input with 400: %j", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_REQUEST" });
  });
});
