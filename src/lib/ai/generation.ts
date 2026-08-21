import type { Candidate } from "@/lib/types";

export interface GenerationInput {
  operation: "continue" | "ideas";
  title: string;
  content: string;
  targetChapterId?: string;
  contextRevision?: number;
}

export interface GenerationConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxInputChars: number;
}

export interface GenerationResult {
  candidates: Candidate[];
  mode: "live" | "demo";
  reason?: "MISSING_API_KEY" | "INPUT_TOO_LONG" | "MODEL_ERROR" | "INVALID_RESPONSE";
}

function fixtureCandidates(input: GenerationInput): Candidate[] {
  const anchor = input.content.trim().slice(-80) || input.title;
  const target = { type: "chapter" as const, id: input.targetChapterId ?? "chapter-1" };
  return [
    { id: `demo-${input.operation}-1`, label: "克制推进", content: `夜色没有立刻回答。${anchor}，于是人物先做了一个无法收回的小动作。`, rationale: "保持现有意象与叙述节奏，用行动推进悬念。", tags: ["演示", "行动"], status: "pending", target, applyMode: "append", generatedRevision: input.contextRevision ?? 1, mode: "demo" },
    { id: `demo-${input.operation}-2`, label: "关系转折", content: `门外的人终于开口，却只叫出了作品里一个尚未被解释的名字。${input.title}的旧事因此有了新的方向。`, rationale: "引入关系线索，但不提前解释核心谜底。", tags: ["演示", "关系"], status: "pending", target, applyMode: "append", generatedRevision: input.contextRevision ?? 1, mode: "demo" },
  ];
}

function readCandidates(value: unknown, input: GenerationInput): Candidate[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { candidates?: unknown }).candidates)) return null;
  const candidates = (value as { candidates: unknown[] }).candidates;
  if (candidates.length < 2) return null;
  const normalized = candidates.slice(0, 3).map((item, index) => {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (typeof record.content !== "string" || !record.content.trim()) return null;
    return {
      id: `live-${index + 1}-${crypto.randomUUID()}`,
      label: typeof record.label === "string" ? record.label : `候选 ${index + 1}`,
      content: record.content.trim(),
      rationale: typeof record.rationale === "string" ? record.rationale : "根据当前作品上下文生成。",
      tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 4) : [],
      status: "pending" as const,
      target: { type: "chapter" as const, id: input.targetChapterId ?? "chapter-1" },
      applyMode: "append" as const,
      generatedRevision: input.contextRevision ?? 1,
      mode: "live" as const,
    };
  });
  const validCandidates = normalized.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  return validCandidates.length === normalized.length ? validCandidates : null;
}

export async function generateCandidates(input: GenerationInput, config: GenerationConfig, fetcher: typeof fetch = fetch): Promise<GenerationResult> {
  if (!config.apiKey) return { candidates: fixtureCandidates(input), mode: "demo", reason: "MISSING_API_KEY" };
  if (input.content.length > config.maxInputChars) return { candidates: fixtureCandidates(input), mode: "demo", reason: "INPUT_TOO_LONG" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetcher(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是中文文学创作协作者。只返回 JSON：{ candidates: [{ label, content, rationale, tags }] }。给出 2 到 3 个候选；不得替用户直接覆盖正文。" },
          { role: "user", content: `作品：${input.title}\n任务：${input.operation === "ideas" ? "提供故事方向" : "续写当前正文"}\n当前正文：${input.content}` },
        ],
      }),
    });
    if (!response.ok) return { candidates: fixtureCandidates(input), mode: "demo", reason: "MODEL_ERROR" };
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) return { candidates: fixtureCandidates(input), mode: "demo", reason: "INVALID_RESPONSE" };
    const candidates = readCandidates(JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")), input);
    return candidates ? { candidates, mode: "live" } : { candidates: fixtureCandidates(input), mode: "demo", reason: "INVALID_RESPONSE" };
  } catch {
    return { candidates: fixtureCandidates(input), mode: "demo", reason: "MODEL_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}
