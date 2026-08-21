import type { ImageGenerationSettings, IpAssetMetadata } from "@/lib/types";
import { trustedAssetImageUrl } from "@/lib/assets/url-safety";

const REGISTERED_IMAGE_MODELS = [
  { id: "Qwen/Qwen-Image", label: "Qwen Image（通用）" },
  { id: "AI-ModelScope/FLUX.1-schnell", label: "FLUX.1 Schnell（快速）" },
  { id: "AI-ModelScope/FLUX.1-dev", label: "FLUX.1 Dev（细节）" },
] as const;

export const ASSET_CAPABILITIES = {
  models: REGISTERED_IMAGE_MODELS,
  sizes: ["1328x1328", "1664x928", "928x1664", "1472x1140", "1140x1472", "1584x1056", "1056x1584"],
  advanced: {
    seed: { type: "number", min: 0, max: 2_147_483_647, transport: "draft-only" },
    steps: { type: "number", min: 1, max: 50, transport: "draft-only" },
    guidance: { type: "number", min: 1, max: 20, transport: "draft-only" },
  },
  transport: { model: "provider-native", prompt: "provider-native", negativePrompt: "compiled-prompt", size: "draft-only" },
} as const;

export type AssetCapabilities = {
  models: Array<{ id: string; label: string }>;
  sizes: string[];
  advanced: Record<string, { type: "string" | "number" | "boolean"; min?: number; max?: number; transport?: "provider-native" | "compiled-prompt" | "draft-only" }>;
  transport: { model: "provider-native"; prompt: "provider-native"; negativePrompt: "compiled-prompt"; size: "draft-only" };
};

const registeredModelById = new Map<string, (typeof REGISTERED_IMAGE_MODELS)[number]>(REGISTERED_IMAGE_MODELS.map((model) => [model.id, model]));

function configuredImageModels(): Array<{ id: string; label: string }> {
  const configured = process.env.MODELSCOPE_IMAGE_MODELS
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((id) => registeredModelById.get(id))
    .filter((item): item is (typeof REGISTERED_IMAGE_MODELS)[number] => Boolean(item));
  return configured?.length ? configured : [...REGISTERED_IMAGE_MODELS];
}

export function getAssetCapabilities(): AssetCapabilities {
  return {
    models: configuredImageModels(),
    sizes: [...ASSET_CAPABILITIES.sizes],
    advanced: ASSET_CAPABILITIES.advanced,
    transport: ASSET_CAPABILITIES.transport,
  };
}

export type AssetGenerationFailureStage = NonNullable<IpAssetMetadata["failureStage"]>;

export interface AssetGenerationInput {
  kind: Extract<IpAssetMetadata["kind"], "character-visual" | "poster">;
  title: string;
  settings: ImageGenerationSettings;
  characterId?: string;
}

export interface AssetGenerationConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetcher?: typeof fetch;
  startOnly?: boolean;
}

export interface AssetGenerationResult {
  mode: "live" | "demo";
  asset: IpAssetMetadata;
  warnings: string[];
}

export type NormalizedModelScopeStatus = "succeeded" | "pending" | "failed" | "unknown";

const successfulStatuses = new Set(["SUCCEED", "SUCCEEDED", "SUCCESS", "COMPLETED", "FINISHED"]);
const pendingStatuses = new Set(["PENDING", "RUNNING", "PROCESSING", "IN_PROGRESS", "QUEUED"]);
const failedStatuses = new Set(["FAILED", "FAILURE", "ERROR", "CANCELED", "CANCELLED"]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[ -]/g, "_") : "";
}

export function readModelScopeTaskStatus(payload: unknown): NormalizedModelScopeStatus {
  if (!record(payload)) return "unknown";
  const status = normalizedStatus(payload.task_status ?? payload.status);
  if (successfulStatuses.has(status)) return "succeeded";
  if (pendingStatuses.has(status)) return "pending";
  if (failedStatuses.has(status)) return "failed";
  return "unknown";
}

function downloadableUrl(value: unknown) {
  return trustedAssetImageUrl(value)?.toString() ?? null;
}

export function readModelScopeImageUrl(payload: unknown) {
  if (!record(payload)) return null;
  const direct = Array.isArray(payload.output_images) ? payload.output_images[0] : undefined;
  const nestedOutput = record(payload.output) && Array.isArray(payload.output.image_urls) ? payload.output.image_urls[0] : undefined;
  const result = Array.isArray(payload.results) && record(payload.results[0]) ? payload.results[0].url : undefined;
  const output = Array.isArray(payload.outputs) ? payload.outputs[0] : undefined;
  const outputUrl = record(output) ? (output.url ?? output.image_url ?? output.imageUrl ?? output.uri) : output;
  return downloadableUrl(direct) ?? downloadableUrl(nestedOutput) ?? downloadableUrl(result) ?? downloadableUrl(outputUrl);
}

function readModelScopeTaskId(payload: unknown) {
  if (!record(payload)) return null;
  const nested = record(payload.data) ? payload.data.task_id : undefined;
  const value = payload.task_id ?? payload.taskId ?? nested;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validateAssetGenerationSettings(settings: unknown): { valid: true; settings: ImageGenerationSettings } | { valid: false; field: "model" | "size" | "advanced" | "prompt" | "negativePrompt" } {
  if (!record(settings)) return { valid: false, field: "prompt" };
  const capabilities = getAssetCapabilities();
  if (typeof settings.prompt !== "string" || !settings.prompt.trim() || settings.prompt.length > 8_000) return { valid: false, field: "prompt" };
  if (typeof settings.negativePrompt !== "string" || settings.negativePrompt.length > 4_000) return { valid: false, field: "negativePrompt" };
  if (typeof settings.model !== "string" || !capabilities.models.some((item) => item.id === settings.model)) return { valid: false, field: "model" };
  if (typeof settings.size !== "string" || !capabilities.sizes.includes(settings.size)) return { valid: false, field: "size" };
  if (!record(settings.advanced)) return { valid: false, field: "advanced" };
  for (const [key, value] of Object.entries(settings.advanced)) {
    const rule = capabilities.advanced[key];
    if (!rule || typeof value !== rule.type || typeof value !== "number" || !Number.isFinite(value) || (rule.min !== undefined && value < rule.min) || (rule.max !== undefined && value > rule.max)) return { valid: false, field: "advanced" };
  }
  return {
    valid: true,
    settings: {
      prompt: settings.prompt.trim(),
      negativePrompt: settings.negativePrompt.trim(),
      model: settings.model,
      size: settings.size,
      advanced: { ...settings.advanced } as Record<string, string | number | boolean>,
    },
  };
}

const demoUrl = (kind: AssetGenerationInput["kind"]) => kind === "poster" ? "/visuals/ip-lab-poster.webp" : "/visuals/ip-lab-character.webp";

function asset(
  input: AssetGenerationInput,
  mode: "live" | "demo",
  previewUrl: string,
  metadata?: { providerTaskId?: string; providerRequest?: { model: string; prompt: string }; failureStage?: AssetGenerationFailureStage; generationStatus?: "pending" | "succeeded" | "failed" },
): IpAssetMetadata {
  return {
    id: `asset-${crypto.randomUUID()}`,
    kind: input.kind,
    title: input.title,
    characterId: input.characterId,
    mode,
    previewUrl,
    createdAt: new Date().toISOString(),
    confirmed: false,
    requestedSettings: input.settings,
    ...metadata,
  };
}

function demo(input: AssetGenerationInput, warning: string, metadata?: { providerTaskId?: string; providerRequest?: { model: string; prompt: string }; failureStage?: AssetGenerationFailureStage; generationStatus?: "pending" | "succeeded" | "failed" }): AssetGenerationResult {
  return { mode: "demo", asset: asset(input, "demo", demoUrl(input.kind), metadata), warnings: [warning] };
}

function createRequestBody(settings: ImageGenerationSettings) {
  return {
    model: settings.model,
    prompt: [settings.prompt, settings.negativePrompt ? `排除元素：${settings.negativePrompt}` : ""].filter(Boolean).join("\n\n"),
  };
}

export async function runAssetGeneration(input: AssetGenerationInput, config: AssetGenerationConfig): Promise<AssetGenerationResult> {
  if (!config.apiKey) return demo(input, "未配置服务端图像密钥，已返回明确标注的《回响的草场》演示资产。", { failureStage: "configuration" });
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? 90_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const origin = (config.baseUrl ?? "https://api-inference.modelscope.cn").replace(/\/$/, "");
  const fetcher = config.fetcher ?? fetch;
  const providerRequest = createRequestBody(input.settings);
  let taskId: string | undefined;
  try {
    const response = await fetcher(`${origin}/v1/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "X-ModelScope-Async-Mode": "true" },
      body: JSON.stringify(providerRequest),
      signal: controller.signal,
    });
    if (!response.ok) return demo(input, `ModelScope 创建任务失败（HTTP ${response.status}），已切换为演示资产。`, { providerRequest, failureStage: "create" });
    let createPayload: unknown;
    try {
      createPayload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      return demo(input, "ModelScope 创建响应不是有效 JSON，已切换为演示资产。", { providerRequest, failureStage: "create" });
    }
    taskId = readModelScopeTaskId(createPayload) ?? undefined;
    if (!taskId) return demo(input, "ModelScope 创建响应未返回任务 ID，已切换为演示资产。", { providerRequest, failureStage: "create" });
    if (config.startOnly) {
      return { mode: "live", asset: asset(input, "live", "", { providerTaskId: taskId, providerRequest, generationStatus: "pending" }), warnings: ["图像任务已提交，正在等待 ModelScope 返回结果。"] };
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((config.pollIntervalMs ?? 1_500) > 0) await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs ?? 1_500));
      const taskResponse = await fetcher(`${origin}/v1/tasks/${taskId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${config.apiKey}`, "X-ModelScope-Task-Type": "image_generation" },
        signal: controller.signal,
      });
      if (!taskResponse.ok) return demo(input, `ModelScope 任务查询失败（HTTP ${taskResponse.status}），可重试实时生成。`, { providerTaskId: taskId, providerRequest, failureStage: "poll" });
      let task: unknown;
      try {
        task = await taskResponse.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        return demo(input, "ModelScope 任务查询响应不是有效 JSON，可重试实时生成。", { providerTaskId: taskId, providerRequest, failureStage: "poll" });
      }
      const status = readModelScopeTaskStatus(task);
      if (status === "succeeded") {
        const previewUrl = readModelScopeImageUrl(task);
        if (!previewUrl) return demo(input, "ModelScope 任务成功但未返回已支持形态的有效图像地址，已切换为演示资产。", { providerTaskId: taskId, providerRequest, failureStage: "result" });
        return { mode: "live", asset: asset(input, "live", previewUrl, { providerTaskId: taskId, providerRequest, generationStatus: "succeeded" }), warnings: [] };
      }
      if (status === "failed") return demo(input, "ModelScope 图像任务失败，可调整提示词或参数后重试；当前显示演示资产。", { providerTaskId: taskId, providerRequest, failureStage: "poll" });
      if (status === "unknown") return demo(input, "ModelScope 返回了未识别的任务状态，可重试并检查供应商响应契约。", { providerTaskId: taskId, providerRequest, failureStage: "poll" });
    }
    return demo(input, "ModelScope 任务等待超时，可保留当前参数后重试。", { providerTaskId: taskId, providerRequest, failureStage: "timeout" });
  } catch {
    if (controller.signal.aborted) return demo(input, "ModelScope 任务等待超时，可保留当前参数后重试。", { ...(taskId ? { providerTaskId: taskId } : {}), providerRequest, failureStage: "timeout" });
    return demo(input, "ModelScope 图像网络请求暂时不可用，可保留当前参数后重试。", { ...(taskId ? { providerTaskId: taskId } : {}), providerRequest, failureStage: "network" });
  } finally {
    clearTimeout(timeout);
  }
}

export type AssetPollResult =
  | { status: "pending" }
  | { status: "live"; asset: IpAssetMetadata }
  | { status: "demo"; result: AssetGenerationResult };

export async function pollModelScopeImageTask(input: AssetGenerationInput, taskId: string, config: AssetGenerationConfig): Promise<AssetPollResult> {
  if (!config.apiKey) return { status: "demo", result: demo(input, "未配置服务端图像密钥，已返回明确标注的演示资产。", { providerTaskId: taskId, failureStage: "configuration", generationStatus: "failed" }) };
  const origin = (config.baseUrl ?? "https://api-inference.modelscope.cn").replace(/\/$/, "");
  const fetcher = config.fetcher ?? fetch;
  try {
    const response = await fetcher(`${origin}/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}`, "X-ModelScope-Task-Type": "image_generation" },
    });
    if (!response.ok) return { status: "demo", result: demo(input, `ModelScope 任务查询失败（HTTP ${response.status}），已切换为演示资产。`, { providerTaskId: taskId, providerRequest: createRequestBody(input.settings), failureStage: "poll", generationStatus: "failed" }) };
    const task = await response.json() as unknown;
    const normalized = readModelScopeTaskStatus(task);
    if (normalized === "pending") return { status: "pending" };
    if (normalized === "failed" || normalized === "unknown") return { status: "demo", result: demo(input, normalized === "failed" ? "ModelScope 图像任务失败，已切换为演示资产。" : "ModelScope 返回了未识别的任务状态，已切换为演示资产。", { providerTaskId: taskId, providerRequest: createRequestBody(input.settings), failureStage: "poll", generationStatus: "failed" }) };
    const previewUrl = readModelScopeImageUrl(task);
    if (!previewUrl) return { status: "demo", result: demo(input, "ModelScope 任务完成但未返回有效图像地址，已切换为演示资产。", { providerTaskId: taskId, providerRequest: createRequestBody(input.settings), failureStage: "result", generationStatus: "failed" }) };
    return { status: "live", asset: asset(input, "live", previewUrl, { providerTaskId: taskId, providerRequest: createRequestBody(input.settings), generationStatus: "succeeded" }) };
  } catch {
    return { status: "demo", result: demo(input, "ModelScope 任务查询暂时不可用，已切换为演示资产。", { providerTaskId: taskId, providerRequest: createRequestBody(input.settings), failureStage: "network", generationStatus: "failed" }) };
  }
}
