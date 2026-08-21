import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "@/lib/ai/embeddings";
import { embeddingBudgetLimits, embeddingRequestBudget } from "@/lib/ai/embedding-budget";
import { KNOWLEDGE_CHUNK_TYPES, retrieveKnowledge, type RetrievalQuery } from "@/lib/ai/retrieval";
import { knowledgeRecords } from "@/lib/knowledge/catalog";
import { matchLiteratureKnowledge, matchPrivateLiteratureKnowledge, type SupabaseVectorRpcClient } from "@/lib/supabase/sync";
import { isDemoLocked } from "@/lib/demo-mode";
import { noStoreJson } from "@/lib/http/no-store";

function shortStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value)
    && value.length <= 20
    && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.trim().length <= 100));
}

function parseRequest(value: unknown): RetrievalQuery | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["query", "limit", "workIds", "chunkTypes", "allowImitation"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return null;
  if (typeof input.query !== "string" || !input.query.trim() || input.query.trim().length > 2_000) return null;
  if (input.limit !== undefined && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 8)) return null;
  if (!shortStringArray(input.workIds) || !shortStringArray(input.chunkTypes)) return null;
  const allowedChunkTypes = new Set<string>(KNOWLEDGE_CHUNK_TYPES);
  if (Array.isArray(input.chunkTypes) && input.chunkTypes.some((item) => !allowedChunkTypes.has(item))) return null;
  if (input.allowImitation !== undefined && typeof input.allowImitation !== "boolean") return null;
  return {
    query: input.query.trim(),
    limit: input.limit as number | undefined,
    workIds: (input.workIds as string[] | undefined)?.map((item) => item.trim()),
    chunkTypes: (input.chunkTypes as string[] | undefined)?.map((item) => item.trim()),
    allowImitation: process.env.KNOWLEDGE_ALLOW_IMITATION === "true" ? input.allowImitation as boolean | undefined : false,
  };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function embeddingDimensions(value: string | undefined) {
  if (value === undefined || value === "") return 384;
  return Number(value) === 384 ? 384 : null;
}

function vectorClientFromEnvironment(url: string, anonKey: string): SupabaseVectorRpcClient | null {
  if (!url || !anonKey) return null;
  try {
    return createClient(url, anonKey, { accessToken: async () => anonKey }) as unknown as SupabaseVectorRpcClient;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return noStoreJson({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const query = parseRequest(value);
  if (!query) return noStoreJson({ error: "INVALID_REQUEST" }, { status: 400 });

  const apiKey = process.env.EMBEDDING_API_KEY ?? "";
  const baseUrl = process.env.EMBEDDING_BASE_URL ?? "";
  const model = process.env.EMBEDDING_MODEL ?? "";
  const dimensions = embeddingDimensions(process.env.EMBEDDING_DIMENSIONS);
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const publicSearchEnabled = !isDemoLocked() && process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED === "true";
  const providerConfigured = Boolean(apiKey && baseUrl && model);
  const publicVectorClient = publicSearchEnabled && providerConfigured && dimensions === 384
    ? vectorClientFromEnvironment(supabaseUrl, supabaseAnonKey)
    : null;
  const requiresPrivateVector = query.allowImitation === true && query.chunkTypes?.includes("text_sample") === true;
  const privateVectorClient = requiresPrivateVector && publicSearchEnabled && providerConfigured && dimensions === 384
    ? vectorClientFromEnvironment(supabaseUrl, supabaseServiceRoleKey)
    : null;
  const vectorClient = requiresPrivateVector ? privateVectorClient : publicVectorClient;
  const retrievalQuery = { ...query, allowImitation: requiresPrivateVector && Boolean(privateVectorClient) };
  const budgetLimits = embeddingBudgetLimits();
  const releaseEmbedding = vectorClient ? embeddingRequestBudget.acquire(budgetLimits.maxPerMinute, budgetLimits.maxConcurrent) : null;
  if (vectorClient && !releaseEmbedding) {
    return noStoreJson({ error: "EMBEDDING_BUDGET_EXCEEDED" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  try {
    const result = await retrieveKnowledge(retrievalQuery, {
      records: knowledgeRecords,
      createEmbedding: async (text) => {
        if (!vectorClient) return null;
        return createEmbedding(text, {
          apiKey,
          baseUrl,
          model,
          dimensions: 384,
          timeoutMs: positiveInteger(process.env.EMBEDDING_TIMEOUT_MS, 10_000),
        });
      },
      vectorSearch: vectorClient
        ? requiresPrivateVector
          ? (input) => matchPrivateLiteratureKnowledge(vectorClient, input)
          : (input) => matchLiteratureKnowledge(vectorClient, input)
        : undefined,
    });
    return noStoreJson(result);
  } finally {
    releaseEmbedding?.();
  }
}
