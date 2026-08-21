import { describe, expect, it, vi } from "vitest";
import { createEmbedding } from "@/lib/ai/embeddings";

const baseConfig = {
  apiKey: "embedding-secret",
  baseUrl: "https://embedding.example/v1/",
  model: "small-embedding",
};

describe("createEmbedding", () => {
  it("returns an exact 384-dimensional embedding and limits input to 2000 characters", async () => {
    const vector = Array.from({ length: 384 }, (_, index) => index / 384);
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return Response.json({ data: [{ embedding: vector }] });
    });
    const fetcher = fetchMock as unknown as typeof fetch;

    const result = await createEmbedding(`  ${"文".repeat(2100)}  `, { ...baseConfig, fetcher });

    expect(result).toEqual(vector);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://embedding.example/v1/embeddings");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "small-embedding", dimensions: 384 });
    expect(body.input).toHaveLength(2000);
  });

  it("returns null for missing input, HTTP/JSON/dimension errors, non-finite values, and timeout", async () => {
    const okVector = Array.from({ length: 384 }, () => 0.1);
    const cases: Array<Promise<number[] | null>> = [
      createEmbedding("文本", { ...baseConfig, apiKey: "", fetcher: vi.fn() as unknown as typeof fetch }),
      createEmbedding("   ", { ...baseConfig, fetcher: vi.fn() as unknown as typeof fetch }),
      createEmbedding("文本", { ...baseConfig, fetcher: (async () => new Response("fail", { status: 503 })) as typeof fetch }),
      createEmbedding("文本", { ...baseConfig, fetcher: (async () => new Response("not-json")) as typeof fetch }),
      createEmbedding("文本", { ...baseConfig, fetcher: (async () => Response.json({ data: [{ embedding: [1, 2] }] })) as typeof fetch }),
      createEmbedding("文本", { ...baseConfig, fetcher: (async () => Response.json({ data: [{ embedding: [...okVector.slice(0, -1), Number.NaN] }] })) as typeof fetch }),
      createEmbedding("文本", {
        ...baseConfig,
        timeoutMs: 1,
        fetcher: ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })) as typeof fetch,
      }),
    ];

    await expect(Promise.all(cases)).resolves.toEqual(Array.from({ length: cases.length }, () => null));
  });

  it("rejects a configured dimension other than 384 without making a request", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ embedding: Array.from({ length: 1_536 }, () => 0) }] }));
    await expect(createEmbedding("文本", { ...baseConfig, dimensions: 1_536, fetcher: fetcher as unknown as typeof fetch })).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
