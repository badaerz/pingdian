import { runAiTask, type AiTaskInput } from "@/lib/ai/tasks";
import { isDemoLocked } from "@/lib/demo-mode";
import { noStoreJson } from "@/lib/http/no-store";
import { aiRequestBudget, type RequestBudget } from "@/lib/http/request-budget";

interface LegacyInput {
  operation: "continue" | "ideas" | "prose";
  title: string;
  content: string;
  project?: AiTaskInput["project"];
}

function isInput(value: unknown): value is LegacyInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (input.operation === "continue" || input.operation === "ideas" || input.operation === "prose") && typeof input.title === "string" && typeof input.content === "string";
}

export function createLegacyPostHandler(options: {
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
    try { body = await request.json(); } catch { return noStoreJson({ error: "INVALID_REQUEST" }, { status: 400 }); }
    if (!isInput(body)) return noStoreJson({ error: "INVALID_REQUEST" }, { status: 400 });
    const task = body.operation === "ideas" ? "ideas" : body.operation === "prose" ? "prose" : "continue";
    const project = body.project ?? {
      title: body.title,
      genre: "纯文学短篇",
      logline: body.title,
      activeChapterId: "chapter-1",
      contextRevision: 1,
      chapters: [{ id: "chapter-1", title: "当前章节", content: body.content, wordCount: body.content.replace(/\s/g, "").length, summary: "", order: 0 }],
      characters: [],
      worldEntries: [],
      blueprint: [],
    };
    const result = await runAiTask({ task, project }, {
      apiKey: isDemoLocked() ? "" : process.env.DEEPSEEK_API_KEY ?? "",
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 45000),
      maxInputChars: Number(process.env.AI_MAX_INPUT_CHARS ?? 24000),
    }, options.fetcher ?? fetch);
    return noStoreJson({ ...result, candidates: "candidates" in result.result ? result.result.candidates : [] });
  };
}

export const POST = createLegacyPostHandler();
