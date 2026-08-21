export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export async function createEmbedding(text: string, config: EmbeddingConfig): Promise<number[] | null> {
  const input = text.trim().slice(0, 2_000);
  const dimensions = config.dimensions ?? 384;
  if (!config.apiKey || !config.baseUrl || !config.model || !input || dimensions !== 384) return null;

  const controller = new AbortController();
  const timeoutMs = Number.isFinite(config.timeoutMs) && (config.timeoutMs ?? 0) > 0 ? config.timeoutMs! : 10_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (config.fetcher ?? fetch)(`${config.baseUrl.replace(/\/+$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ model: config.model, input, dimensions }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { data?: Array<{ embedding?: unknown }> };
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== dimensions || !embedding.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    return embedding;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
