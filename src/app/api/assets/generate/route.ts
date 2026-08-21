import { runAssetGeneration, validateAssetGenerationSettings, type AssetGenerationInput } from "@/lib/assets/generation";
import { imageGenerationBudgetLimits, imageGenerationRequestBudget } from "@/lib/assets/request-budget";
import { isDemoLocked } from "@/lib/demo-mode";
import { noStoreJson } from "@/lib/http/no-store";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedEnvironmentInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function readInput(value: unknown): { input: AssetGenerationInput } | { error: string; field?: string } {
  if (!record(value) || !Object.keys(value).every((key) => ["kind", "title", "settings", "characterId"].includes(key))) return { error: "INVALID_REQUEST" };
  if ((value.kind !== "character-visual" && value.kind !== "poster") || typeof value.title !== "string" || !value.title.trim() || value.title.length > 300) return { error: "INVALID_REQUEST" };
  if (value.characterId !== undefined && (typeof value.characterId !== "string" || value.characterId.length > 120)) return { error: "INVALID_REQUEST" };
  const settings = validateAssetGenerationSettings(value.settings);
  if (!settings.valid) return { error: "INVALID_IMAGE_SETTINGS", field: settings.field };
  return {
    input: {
      kind: value.kind,
      title: value.title.trim(),
      settings: settings.settings,
      ...(typeof value.characterId === "string" ? { characterId: value.characterId } : {}),
    },
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const parsed = readInput(body);
  if ("error" in parsed) return noStoreJson({ error: parsed.error, ...(parsed.field ? { field: parsed.field } : {}) }, { status: 400 });
  const apiKey = isDemoLocked() ? "" : process.env.MODELSCOPE_API_TOKEN ?? "";
  const limits = imageGenerationBudgetLimits();
  const release = apiKey ? imageGenerationRequestBudget.acquire(limits.maxPerMinute, limits.maxConcurrent) : null;
  if (apiKey && !release) return noStoreJson({ error: "IMAGE_GENERATION_BUDGET_EXCEEDED" }, { status: 429, headers: { "Retry-After": "60" } });
  try {
    const result = await runAssetGeneration(parsed.input, {
      apiKey,
      baseUrl: process.env.MODELSCOPE_API_BASE_URL ?? "https://api-inference.modelscope.cn",
      timeoutMs: boundedEnvironmentInteger(process.env.MODELSCOPE_IMAGE_TIMEOUT_MS, 90_000, 1_000, 180_000),
      startOnly: Boolean(apiKey),
    });
    return noStoreJson(result);
  } finally {
    release?.();
  }
}
