import { createClient } from "@supabase/supabase-js";
import { isDemoLocked } from "@/lib/demo-mode";
import { createEmbedding } from "@/lib/ai/embeddings";
import { embeddingBudgetLimits, embeddingRequestBudget } from "@/lib/ai/embedding-budget";
import { retrieveKnowledge, SAFE_KNOWLEDGE_CHUNK_TYPES } from "@/lib/ai/retrieval";
import { resolveAiSourceText } from "@/lib/ai/story-context";
import { AI_TASKS, runAiTask, type AiTask, type AiTaskConfig, type AiTaskDependencies, type AiTaskInput } from "@/lib/ai/tasks";
import { knowledgeRecords } from "@/lib/knowledge/catalog";
import { matchLiteratureKnowledge, type SupabaseVectorRpcClient } from "@/lib/supabase/sync";
import { noStoreJson } from "@/lib/http/no-store";
import { AI_KEY_HEADER, isValidUserAiKey, normalizeUserAiKey } from "@/lib/ai/user-key";
import { aiRequestBudget, type RequestBudget } from "@/lib/http/request-budget";

const tasks = new Set<string>(AI_TASKS);
const inputKeys = new Set(["prompt", "selectedText", "exerciseId", "characterId", "sourceText", "evidenceText", "answer", "thread", "candidate", "currentImageSettings", "sourceKind"]);
const topLevelKeys = new Set(["task", "project", "input"]);
const projectKeys = new Set(["title", "genre", "logline", "activeChapterId", "contextRevision", "chapters", "characters", "worldEntries", "blueprint"]);
const chapterKeys = new Set(["id", "title", "content", "wordCount", "summary", "order"]);
const characterKeys = new Set(["id", "name", "role", "desire", "flaw", "arc", "fear", "notes", "locked", "order"]);
const worldEntryKeys = new Set(["id", "category", "label", "content", "locked", "order"]);
const blueprintKeys = new Set(["id", "title", "beatType", "summary", "active", "locked", "order"]);
const threadKeys = new Set(["role", "content"]);
const candidateKeys = new Set(["id", "text", "revision"]);
const imageSettingsKeys = new Set(["prompt", "negativePrompt", "model", "size", "advanced"]);
const advancedKeys = new Set(["steps", "guidance", "seed", "seedLocked", "sampler", "scheduler", "quality", "style", "strength", "cfgScale", "denoise", "safetyFilter"]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedText(value: unknown, maximum: number, required = true): value is string {
  return typeof value === "string" && value.length <= maximum && (!required || value.trim().length > 0);
}

function finiteInteger(value: unknown, minimum = 0) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum;
}

function isTask(value: unknown): value is AiTask {
  return typeof value === "string" && tasks.has(value);
}

function isChapter(value: unknown) {
  if (!record(value) || !hasOnlyKeys(value, chapterKeys)) return false;
  return boundedText(value.id, 120) && boundedText(value.title, 300) && boundedText(value.content, 20_000, false)
    && finiteInteger(value.wordCount) && boundedText(value.summary, 4_000, false) && finiteInteger(value.order);
}

function isCharacter(value: unknown) {
  if (!record(value) || !hasOnlyKeys(value, characterKeys)) return false;
  return boundedText(value.id, 120) && boundedText(value.name, 200) && boundedText(value.role, 500, false)
    && boundedText(value.desire, 2_000, false) && boundedText(value.flaw, 2_000, false) && boundedText(value.arc, 2_000, false)
    && boundedText(value.fear, 2_000, false) && boundedText(value.notes, 2_000, false) && typeof value.locked === "boolean" && finiteInteger(value.order);
}

function isWorldEntry(value: unknown) {
  if (!record(value) || !hasOnlyKeys(value, worldEntryKeys)) return false;
  return boundedText(value.id, 120) && boundedText(value.category, 200) && boundedText(value.label, 300)
    && boundedText(value.content, 4_000, false) && typeof value.locked === "boolean" && finiteInteger(value.order);
}

function isBlueprintNode(value: unknown) {
  if (!record(value) || !hasOnlyKeys(value, blueprintKeys)) return false;
  return boundedText(value.id, 120) && boundedText(value.title, 300) && boundedText(value.beatType, 200)
    && boundedText(value.summary, 4_000, false) && typeof value.locked === "boolean" && finiteInteger(value.order)
    && (value.active === undefined || typeof value.active === "boolean");
}

function isImageSettings(value: unknown) {
  if (!record(value) || !hasOnlyKeys(value, imageSettingsKeys) || !record(value.advanced) || Object.keys(value.advanced).length > 32) return false;
  return boundedText(value.prompt, 2_000) && boundedText(value.negativePrompt, 2_000) && boundedText(value.model, 200) && boundedText(value.size, 100)
    && Object.entries(value.advanced).every(([key, item]) => advancedKeys.has(key) && key.length <= 64 && ((typeof item === "string" && item.length <= 500) || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))));
}

function isNestedInput(value: unknown) {
  if (!record(value) || !Object.keys(value).every((key) => inputKeys.has(key))) return false;
  if (value.prompt !== undefined && !boundedText(value.prompt, 4_000, false)) return false;
  if (value.selectedText !== undefined && !boundedText(value.selectedText, 8_000, false)) return false;
  if (value.exerciseId !== undefined && !boundedText(value.exerciseId, 120)) return false;
  if (value.characterId !== undefined && !boundedText(value.characterId, 120)) return false;
  if (value.sourceText !== undefined && !boundedText(value.sourceText, 20_000, false)) return false;
  if (value.evidenceText !== undefined && !boundedText(value.evidenceText, 20_000, false)) return false;
  if (value.answer !== undefined && !boundedText(value.answer, 5_000, false)) return false;
  if (value.sourceKind !== undefined && value.sourceKind !== "narrative" && value.sourceKind !== "argumentative") return false;
  if (value.thread !== undefined) {
    if (!Array.isArray(value.thread) || value.thread.length > 20 || !value.thread.every((item) => record(item) && hasOnlyKeys(item, threadKeys) && (item.role === "user" || item.role === "assistant") && boundedText(item.content, 4_000))) return false;
  }
  if (value.candidate !== undefined) {
    if (!record(value.candidate) || !hasOnlyKeys(value.candidate, candidateKeys) || !boundedText(value.candidate.id, 120) || !boundedText(value.candidate.text, 8_000) || !finiteInteger(value.candidate.revision)) return false;
  }
  if (value.currentImageSettings !== undefined && !isImageSettings(value.currentImageSettings)) return false;
  return true;
}

function boundedEnvironmentInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function aiConfigFromEnvironment(): AiTaskConfig {
  const demoLocked = isDemoLocked();
  return {
    apiKey: demoLocked ? "" : process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    timeoutMs: boundedEnvironmentInteger(process.env.AI_TIMEOUT_MS, 45_000, 1_000, 120_000),
    maxInputChars: boundedEnvironmentInteger(process.env.AI_MAX_INPUT_CHARS, 24_000, 1_000, 100_000),
  };
}

/**
 * 用户自带密钥：从 header 读取。
 *
 * 安全约束（改动前请先读）：
 * - 只在内存里传递一次，不落库、不写日志、不回显
 * - 答辩锁定模式下完全忽略，不允许外部调用
 * - 格式不合法直接拒绝，不带着坏密钥去调供应商
 *
 * 返回 undefined = 没带密钥（走服务端配置）；返回 "" = 带了但不合法（拒绝请求）。
 */
export function userKeyFromRequest(request: Request, demoLocked = isDemoLocked()): string | undefined {
  if (demoLocked) return undefined;
  const raw = request.headers.get(AI_KEY_HEADER);
  if (raw === null) return undefined;
  const key = normalizeUserAiKey(raw);
  return isValidUserAiKey(key) ? key : "";
}

function publicVectorClientFromEnvironment(): SupabaseVectorRpcClient | null {
  if (isDemoLocked()) return null;
  const dimensionValue = process.env.EMBEDDING_DIMENSIONS;
  const dimensions = dimensionValue === undefined || dimensionValue.trim() === "" ? 384 : Number(dimensionValue);
  if (process.env.EMBEDDING_PUBLIC_SEARCH_ENABLED !== "true" || dimensions !== 384) return null;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const providerConfigured = Boolean(process.env.EMBEDDING_API_KEY && process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_MODEL);
  if (!providerConfigured || !url || !anonKey) return null;
  try {
    return createClient(url, anonKey, { accessToken: async () => anonKey }) as unknown as SupabaseVectorRpcClient;
  } catch {
    return null;
  }
}

function productionRetrievalDependencies(): AiTaskDependencies {
  const vectorClient = publicVectorClientFromEnvironment();
  return {
    retrieveKnowledge: async (query) => {
      const safeQuery = { ...query, allowImitation: false, chunkTypes: [...SAFE_KNOWLEDGE_CHUNK_TYPES] };
      const limits = embeddingBudgetLimits();
      const releaseEmbedding = vectorClient ? embeddingRequestBudget.acquire(limits.maxPerMinute, limits.maxConcurrent) : null;
      if (vectorClient && !releaseEmbedding) {
        const fallback = await retrieveKnowledge(safeQuery, { records: knowledgeRecords });
        return { ...fallback, warnings: [`知识检索预算已达上限，已降级为 ${fallback.mode} 模式。`] };
      }
      try {
        return await retrieveKnowledge(safeQuery, {
          records: knowledgeRecords,
          createEmbedding: vectorClient ? (text) => createEmbedding(text, {
            apiKey: process.env.EMBEDDING_API_KEY ?? "",
            baseUrl: process.env.EMBEDDING_BASE_URL ?? "",
            model: process.env.EMBEDDING_MODEL ?? "",
            dimensions: 384,
            timeoutMs: boundedEnvironmentInteger(process.env.EMBEDDING_TIMEOUT_MS, 10_000, 1_000, 30_000),
          }) : undefined,
          vectorSearch: vectorClient ? (input) => matchLiteratureKnowledge(vectorClient, input) : undefined,
        });
      } finally {
        releaseEmbedding?.();
      }
    },
  };
}

export function isTaskInput(value: unknown): value is AiTaskInput {
  if (!record(value) || !hasOnlyKeys(value, topLevelKeys) || !isTask(value.task) || !record(value.project) || !hasOnlyKeys(value.project, projectKeys)) return false;
  const project = value.project;
  if (!boundedText(project.title, 300) || !boundedText(project.genre, 200) || !boundedText(project.logline, 4_000, false) || !boundedText(project.activeChapterId, 120) || !finiteInteger(project.contextRevision)) return false;
  if (!Array.isArray(project.chapters) || project.chapters.length > 100 || !project.chapters.every(isChapter)) return false;
  if (!Array.isArray(project.characters) || project.characters.length > 100 || !project.characters.every(isCharacter)) return false;
  if (!Array.isArray(project.worldEntries) || project.worldEntries.length > 100 || !project.worldEntries.every(isWorldEntry)) return false;
  if (!Array.isArray(project.blueprint) || project.blueprint.length > 200 || !project.blueprint.every(isBlueprintNode)) return false;
  if (value.input !== undefined && !isNestedInput(value.input)) return false;
  const input = record(value.input) ? value.input : undefined;
  if (value.task === "consistency-check" && !record(input?.candidate)) return false;
  if (value.task === "training-feedback-v2" && !boundedText(input?.answer, 5_000, false) && !boundedText(input?.sourceText, 20_000, false)) return false;
  if (value.task === "analysis" || value.task === "analysis-v2" || value.task === "knowledge-extract" || value.task === "mentor") {
    const activeChapter = project.chapters.find((chapter) => record(chapter) && chapter.id === project.activeChapterId);
    if (!resolveAiSourceText(input, activeChapter?.content)) return false;
  }
  return true;
}

export function createAiPostHandler(options: {
  requestBudget?: RequestBudget;
  fetcher?: typeof fetch;
} = {}) {
  const requestBudget = options.requestBudget ?? aiRequestBudget;

  return async function post(request: Request) {
    const budgetResult = requestBudget.consume(request.headers);
    if (!budgetResult.allowed) {
      return noStoreJson({
        error: "RATE_LIMITED",
        retryAfterSeconds: budgetResult.retryAfterSeconds,
      }, {
        status: 429,
        headers: { "Retry-After": String(budgetResult.retryAfterSeconds) },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    if (!isTaskInput(body)) return noStoreJson({ error: "INVALID_REQUEST" }, { status: 400 });
    const userKey = userKeyFromRequest(request);
    if (userKey === "") return noStoreJson({ error: "INVALID_AI_KEY" }, { status: 400 });
    const baseConfig = aiConfigFromEnvironment();
    const config = userKey ? { ...baseConfig, apiKey: userKey } : baseConfig;
    const result = await runAiTask(body, config, options.fetcher ?? fetch, config.apiKey ? productionRetrievalDependencies() : {});
    return noStoreJson(result);
  };
}

export const POST = createAiPostHandler();
