import { pollModelScopeImageTask, validateAssetGenerationSettings, type AssetGenerationInput } from "@/lib/assets/generation";
import { isDemoLocked } from "@/lib/demo-mode";
import { noStoreJson } from "@/lib/http/no-store";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readInput(value: unknown): { input: AssetGenerationInput; taskId: string } | { error: string; field?: string } {
  if (!record(value) || !Object.keys(value).every((key) => ["kind", "title", "settings", "characterId", "providerTaskId"].includes(key))) return { error: "INVALID_REQUEST" };
  if ((value.kind !== "character-visual" && value.kind !== "poster") || typeof value.title !== "string" || !value.title.trim() || value.title.length > 300) return { error: "INVALID_REQUEST" };
  if (typeof value.providerTaskId !== "string" || !value.providerTaskId.trim() || value.providerTaskId.length > 200) return { error: "INVALID_REQUEST" };
  if (value.characterId !== undefined && (typeof value.characterId !== "string" || value.characterId.length > 120)) return { error: "INVALID_REQUEST" };
  const settings = validateAssetGenerationSettings(value.settings);
  if (!settings.valid) return { error: "INVALID_IMAGE_SETTINGS", field: settings.field };
  return {
    taskId: value.providerTaskId.trim(),
    input: { kind: value.kind, title: value.title.trim(), settings: settings.settings, ...(typeof value.characterId === "string" ? { characterId: value.characterId } : {}) },
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return noStoreJson({ error: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = readInput(body);
  if ("error" in parsed) return noStoreJson({ error: parsed.error, ...(parsed.field ? { field: parsed.field } : {}) }, { status: 400 });
  const apiKey = isDemoLocked() ? "" : process.env.MODELSCOPE_API_TOKEN ?? "";
  const result = await pollModelScopeImageTask(parsed.input, parsed.taskId, { apiKey, baseUrl: process.env.MODELSCOPE_API_BASE_URL ?? "https://api-inference.modelscope.cn" });
  return noStoreJson(result);
}
