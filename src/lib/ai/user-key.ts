/**
 * 用户自带的 AI 密钥（BYOK）。
 *
 * 产品定位：用户用自己的 DeepSeek 密钥调用，服务端不提供、不保存、不记录。
 * 密钥只存在用户浏览器的 localStorage 里，每次请求通过 header 带给 /api/ai，
 * 服务端当次用完即弃——不落库、不写日志、不回显。
 *
 * 为什么这样设计而不是前端直连供应商：
 * 1. 保留服务端校验与防幻觉链路（归一化、逐条丢弃、降级台账全在服务端跑）
 * 2. 保留请求边界（上下文长度、超时、限流）
 * 3. 避免浏览器直连供应商的跨域限制
 *
 * 代价要说清楚：密钥会经过我们的服务端（内存中一次传递），
 * 所以对外只能承诺「服务端零留存」，不能承诺「密钥不经过服务端」。
 */

export const USER_AI_KEY_STORAGE = "story-forge:user-ai-key";

/** 密钥随请求上行的 header 名。 */
export const AI_KEY_HEADER = "x-ai-key";

/** DeepSeek 的密钥形态：sk- 开头。长度只做下限校验，避免误伤未来更长的新格式。 */
const AI_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{16,}$/;

export function normalizeUserAiKey(input: string): string {
  return input.replace(/[\s"'`]/g, "");
}

export function isValidUserAiKey(input: string): boolean {
  return AI_KEY_PATTERN.test(normalizeUserAiKey(input));
}

/** 只保留头尾，便于用户确认填对了哪一把，同时避免肩窥泄露。 */
export function maskUserAiKey(key: string): string {
  const value = normalizeUserAiKey(key);
  if (value.length <= 12) return "****";
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredUserAiKey(): string | null {
  const value = storage()?.getItem(USER_AI_KEY_STORAGE) ?? null;
  return value && isValidUserAiKey(value) ? value : null;
}

export function storeUserAiKey(input: string): boolean {
  const key = normalizeUserAiKey(input);
  if (!isValidUserAiKey(key)) return false;
  storage()?.setItem(USER_AI_KEY_STORAGE, key);
  return true;
}

export function clearStoredUserAiKey(): void {
  storage()?.removeItem(USER_AI_KEY_STORAGE);
}

/** 给所有 /api/ai 请求加密钥 header。没有密钥时不加，服务端会走自己的演示配置。 */
export function aiRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  const key = readStoredUserAiKey();
  if (key) headers[AI_KEY_HEADER] = key;
  return headers;
}

/**
 * 统一的 AI 请求入口。所有任务都走这里，避免某个调用点漏带密钥。
 * 返回值仍是原始 Response，调用方的解析逻辑不用改。
 */
export async function postAiTask(body: unknown, init?: { signal?: AbortSignal }): Promise<Response> {
  return fetch("/api/ai", {
    method: "POST",
    headers: aiRequestHeaders(),
    body: JSON.stringify(body),
    ...(init?.signal ? { signal: init.signal } : {}),
  });
}
