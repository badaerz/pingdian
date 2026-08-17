import { generateCandidates, type GenerationInput } from "@/lib/ai/generation";

function isInput(value: unknown): value is GenerationInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (input.operation === "continue" || input.operation === "ideas") && typeof input.title === "string" && typeof input.content === "string";
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
  if (!isInput(body)) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const result = await generateCandidates(body, {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 45000),
    maxInputChars: Number(process.env.AI_MAX_INPUT_CHARS ?? 24000),
  });
  return Response.json(result);
}
