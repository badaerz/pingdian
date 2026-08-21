import { filterKnowledgeRecords, knowledgeRecords, type KnowledgeRecord } from "@/lib/knowledge/catalog";
import { KNOWLEDGE_CHUNK_TYPES, SAFE_KNOWLEDGE_CHUNK_TYPES } from "@/lib/ai/retrieval";

export interface SupabaseTableClient {
  from: (table: string) => {
    select: (columns?: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  };
}

export interface LiteratureVectorMatchParams {
  query_embedding: number[];
  match_threshold: number;
  match_count: number;
  filter_work_ids: string[] | null;
  filter_chunk_types: string[] | null;
}

export interface SupabaseVectorRpcClient {
  rpc: (
    name: "match_literature_knowledge" | "match_literature_knowledge_private",
    params: LiteratureVectorMatchParams,
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
}

export interface SupabaseKnowledgeRpcClient {
  rpc: (
    name: "list_public_knowledge_chunks",
    params: { filter_work_ids: string[]; match_count: number },
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
}

export type SupabaseKnowledgeClient = SupabaseTableClient & Partial<SupabaseKnowledgeRpcClient>;

export interface LiteratureVectorMatchInput {
  embedding: number[];
  threshold?: number;
  limit: number;
  workIds?: string[];
  chunkTypes?: string[];
}

export interface LiteratureVectorMatchRow {
  id: string;
  work_id: string;
  chunk_type: string;
  content: string;
  metadata: unknown;
  similarity: number;
}

export async function matchLiteratureKnowledge(client: SupabaseVectorRpcClient, input: LiteratureVectorMatchInput): Promise<LiteratureVectorMatchRow[]> {
  return matchLiteratureKnowledgeRpc(client, input, "match_literature_knowledge");
}

export async function matchPrivateLiteratureKnowledge(client: SupabaseVectorRpcClient, input: LiteratureVectorMatchInput): Promise<LiteratureVectorMatchRow[]> {
  return matchLiteratureKnowledgeRpc(client, input, "match_literature_knowledge_private");
}

async function matchLiteratureKnowledgeRpc(
  client: SupabaseVectorRpcClient,
  input: LiteratureVectorMatchInput,
  rpcName: "match_literature_knowledge" | "match_literature_knowledge_private",
): Promise<LiteratureVectorMatchRow[]> {
  if (input.embedding.length !== 384 || input.embedding.some((value) => !Number.isFinite(value))) return [];
  if (input.chunkTypes?.some((value) => !(KNOWLEDGE_CHUNK_TYPES as readonly string[]).includes(value))) return [];
  const { data, error } = await client.rpc(rpcName, {
    query_embedding: input.embedding,
    match_threshold: input.threshold ?? 0.3,
    match_count: input.limit,
    filter_work_ids: input.workIds?.length ? input.workIds : null,
    filter_chunk_types: input.chunkTypes?.length ? input.chunkTypes : null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).filter((value): value is LiteratureVectorMatchRow => {
    if (!value || typeof value !== "object") return false;
    const row = value as Partial<LiteratureVectorMatchRow>;
    return typeof row.id === "string"
      && typeof row.work_id === "string"
      && typeof row.chunk_type === "string"
      && (KNOWLEDGE_CHUNK_TYPES as readonly string[]).includes(row.chunk_type)
      && typeof row.content === "string"
      && typeof row.similarity === "number"
      && Number.isFinite(row.similarity);
  });
}

function knowledgeSourceStatus(value: unknown): KnowledgeRecord["sourceStatus"] {
  return value === "verified" || value === "summary_only" ? value : "pending";
}

function remoteRecord(value: unknown, sourceChunks: string[] = []): KnowledgeRecord | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.author !== "string" || typeof item.era !== "string" || typeof item.genre !== "string") return null;
  const themes = item.themes && typeof item.themes === "object" ? item.themes as Record<string, unknown> : {};
  const techniques = item.techniques_and_craft && typeof item.techniques_and_craft === "object" ? item.techniques_and_craft as Record<string, unknown> : {};
  const devices = Array.isArray(techniques.literary_devices) ? techniques.literary_devices.map((device) => device && typeof device === "object" ? (device as Record<string, unknown>).name : null) : [];
  return {
    id: item.id,
    title: item.title,
    author: item.author,
    era: item.era,
    genre: item.genre,
    summary: typeof item.core_summary === "string" ? item.core_summary : "",
    themes: [themes.main_theme, ...(Array.isArray(themes.sub_themes) ? themes.sub_themes : [])].filter((value): value is string => typeof value === "string"),
    techniques: [techniques.narrative_perspective, ...devices].filter((value): value is string => typeof value === "string"),
    sourceStatus: knowledgeSourceStatus(item.source_status),
    sourceUrl: item.copyright && typeof item.copyright === "object" && typeof (item.copyright as Record<string, unknown>).source_url === "string" ? (item.copyright as Record<string, string>).source_url : undefined,
    sourceChunks,
    deconstruction: {
      plot: [],
      imagery: [],
      selectedText: "",
      explanation: "以结构化信息观察作品的叙事选择。",
      trainingPrompt: "选择一个具体物件，写一段不解释情绪的场景。",
    },
  };
}

export async function searchKnowledge(client: SupabaseKnowledgeClient | null, filters: { era?: string; theme?: string; technique?: string }): Promise<KnowledgeRecord[]> {
  const local = filterKnowledgeRecords(knowledgeRecords, filters);
  if (!client?.rpc) return local;
  try {
    const worksResponse = await client.from("kb_works").select("id,title,author,era,genre,core_summary,themes,techniques_and_craft,copyright,source_status");
    const { data, error } = worksResponse;
    if (error || !data?.length) return local;
    const workIds = data.flatMap((value) => value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string"
      ? [(value as Record<string, string>).id]
      : []);
    const chunksResponse = await client.rpc("list_public_knowledge_chunks", { filter_work_ids: workIds, match_count: 500 });
    if (chunksResponse.error) return local;
    const chunksByWork = new Map<string, string[]>();
    (chunksResponse.data ?? []).forEach((value) => {
      if (!value || typeof value !== "object") return;
      const item = value as Record<string, unknown>;
      if (typeof item.work_id !== "string" || typeof item.content !== "string") return;
      const chunkType = typeof item.chunk_type === "string" ? item.chunk_type : "";
      if (!(SAFE_KNOWLEDGE_CHUNK_TYPES as readonly string[]).includes(chunkType) || item.content.length > 2_000) return;
      chunksByWork.set(item.work_id, [...(chunksByWork.get(item.work_id) ?? []), item.content]);
    });
    const remote = data.map((item) => {
      const id = item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string" ? (item as Record<string, string>).id : "";
      return remoteRecord(item, chunksByWork.get(id) ?? []);
    }).filter((item): item is KnowledgeRecord => Boolean(item));
    const merged = new Map(local.map((item) => [item.id, item]));
    remote.forEach((item) => {
      const localRecord = merged.get(item.id);
      merged.set(item.id, {
        ...localRecord,
        ...item,
        deconstruction: item.deconstruction.plot.length || item.deconstruction.selectedText ? item.deconstruction : localRecord?.deconstruction ?? item.deconstruction,
      });
    });
    return filterKnowledgeRecords([...merged.values()], filters);
  } catch {
    return local;
  }
}
