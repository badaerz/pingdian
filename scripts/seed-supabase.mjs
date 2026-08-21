import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const knowledgePath = resolve(root, "incoming/knowledge/literary_knowledge_base.json");
const supplementalKnowledgePath = resolve(root, "incoming/knowledge/supplemental_knowledge_seed.json");
const textsDirectory = resolve(root, "incoming/knowledge/texts");
const textFiles = new Map([
  ["KB_001", "01_kong_yi_ji.md"],
  ["KB_002", "02_lin_chong_shan_shen_miao.md"],
  ["KB_003", "03_bian_cheng.md"],
  ["KB_004", "04_hong_lou_meng_excerpt.md"],
  ["KB_005", "05_cu_zhi.md"],
  ["KB_006", "06_metamorphosis.md"],
  ["KB_007", "07_the_old_man_and_the_sea.md"],
  ["KB_008", "08_the_necklace.md"],
]);

function explicitSourceStatus(work) {
  const value = work.source_status ?? work.copyright?.source_status;
  return value === "verified" || value === "summary_only" ? value : "pending";
}

function shortQuote(content) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function splitText(content, size = 1_600) {
  const chunks = [];
  for (let start = 0; start < content.length; start += size) {
    chunks.push({ content: content.slice(start, start + size), start, end: Math.min(content.length, start + size) });
  }
  return chunks;
}

async function createSeedEmbedding(text, config) {
  const input = text.trim().slice(0, 2_000);
  const dimensions = config.dimensions ?? 384;
  if (!config.apiKey || !config.baseUrl || !config.model || !input || dimensions !== 384) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);
  try {
    const response = await (config.fetcher ?? fetch)(`${config.baseUrl.replace(/\/+$/, "")}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({ model: config.model, input, dimensions }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const embedding = payload?.data?.[0]?.embedding;
    return Array.isArray(embedding) && embedding.length === dimensions && embedding.every((value) => typeof value === "number" && Number.isFinite(value)) ? embedding : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function techniqueExplanation(work) {
  const craft = work.techniques_and_craft ?? {};
  const devices = Array.isArray(craft.literary_devices) ? craft.literary_devices : [];
  return [
    craft.narrative_perspective,
    ...devices.map((device) => [device?.name, device?.function].filter(Boolean).join("：")),
    work.why_write_this_way_case?.literary_analysis,
    work.why_write_this_way_case?.writing_advice,
  ].filter((value) => typeof value === "string" && value.trim()).join("\n") || "结构化技法说明待补充。";
}

function safeCaseExcerpt(work) {
  const selected = work.why_write_this_way_case?.selected_text;
  const plotCase = Array.isArray(work.plot_blueprint) ? work.plot_blueprint.find((item) => typeof item?.description === "string")?.description : "";
  return String(selected || plotCase || work.core_summary || "").trim().slice(0, 400);
}

export async function buildSeedChunks(works, options = {}) {
  const embeddingConfig = options.embeddingConfig;
  const readSourceText = options.readSourceText ?? ((path) => readFile(path, "utf8"));
  const rawChunks = [];

  for (const work of works) {
    const sourceStatus = explicitSourceStatus(work);
    const sourceUrl = typeof work.copyright?.source_url === "string" ? work.copyright.source_url : "";
    const addChunk = (chunkType, content, start = 0, end = content.length) => {
      if (!content.trim()) return;
      rawChunks.push({
        work_id: work.id,
        chunk_type: chunkType,
        content,
        metadata: {
          title: work.title,
          author: work.author,
          source_status: sourceStatus,
          source_url: sourceUrl,
          quote: shortQuote(content),
          start,
          end,
        },
      });
    };

    const summary = String(work.core_summary ?? "").trim();
    addChunk("summary", summary);
    addChunk("technique_explanation", techniqueExplanation(work));
    addChunk("case_excerpt", safeCaseExcerpt(work));

    const sourceFile = textFiles.get(work.id);
    if (sourceStatus === "verified" && sourceFile) {
      const text = await readSourceText(resolve(textsDirectory, sourceFile));
      splitText(text).forEach((part) => addChunk("text_sample", part.content, part.start, part.end));
    }
  }

  let embeddedChunks = 0;
  const chunks = [];
  for (const chunk of rawChunks) {
    const embedding = embeddingConfig ? await createSeedEmbedding(chunk.content, embeddingConfig) : null;
    if (embedding) embeddedChunks += 1;
    chunks.push(embedding ? { ...chunk, embedding } : chunk);
  }
  const mode = !embeddingConfig || embeddedChunks === 0
    ? "keyword"
    : embeddedChunks === chunks.length ? "vector" : "partial";
  return { chunks, mode };
}

export async function replaceSeedChunks(client, workIds, chunks) {
  const { error } = await client.rpc("replace_literature_knowledge_chunks", {
    seed_work_ids: workIds,
    seed_chunks: chunks,
  });
  if (error) throw new Error(error.message);
}

async function runSeed() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Missing Supabase seed configuration.");

  const [primaryWorks, supplementalWorks] = await Promise.all([
    readFile(knowledgePath, "utf8").then(JSON.parse),
    readFile(supplementalKnowledgePath, "utf8").then(JSON.parse),
  ]);
  const works = [...primaryWorks, ...supplementalWorks].map((work) => ({
    ...work,
    source_status: explicitSourceStatus(work),
  }));
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS ?? 384);
  const embeddingConfig = process.env.EMBEDDING_API_KEY && process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_MODEL && dimensions === 384
    ? {
      apiKey: process.env.EMBEDDING_API_KEY,
      baseUrl: process.env.EMBEDDING_BASE_URL,
      model: process.env.EMBEDDING_MODEL,
      dimensions,
      timeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS ?? 10_000),
    }
    : null;
  const { chunks, mode } = await buildSeedChunks(works, { embeddingConfig });

  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: workError } = await client.from("kb_works").upsert(works, { onConflict: "id" });
  if (workError) throw workError;
  const workIds = works.map((work) => work.id);
  await replaceSeedChunks(client, workIds, chunks);

  console.log(JSON.stringify({ works: works.length, chunks: chunks.length, mode }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSeed().catch(() => {
    console.error("Supabase seed failed.");
    process.exitCode = 1;
  });
}
