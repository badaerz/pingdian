import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiPostHandler, userKeyFromRequest } from "@/app/api/ai/route";
import { createRequestBudget } from "@/lib/http/request-budget";
import { AI_KEY_HEADER, isValidUserAiKey, maskUserAiKey, normalizeUserAiKey } from "@/lib/ai/user-key";

/**
 * 用户自带密钥（BYOK）。
 *
 * 三条不能破的约束：
 *   1. 带了合法密钥 → 用它调用，不用服务端配置
 *   2. 密钥绝不回显到响应里
 *   3. 答辩锁定模式下完全忽略用户密钥（不允许外部调用）
 */

const USER_KEY = "sk-abcdefghijklmnopqrstuvwxyz012345";
const ENV_KEY = "sk-envkeyenckeyenckeyenckey123456";

function body() {
  return {
    task: "continue",
    project: {
      title: "雾港来信",
      genre: "纯文学短篇",
      logline: "守夜人收到一封迟到的信。",
      activeChapterId: "chapter-1",
      contextRevision: 1,
      chapters: [{ id: "chapter-1", title: "第一章", content: "码头的钟停了。", wordCount: 8, summary: "", order: 0 }],
      characters: [],
      worldEntries: [],
      blueprint: [],
    },
  };
}

function handler(fetcher: ReturnType<typeof vi.fn>) {
  return createAiPostHandler({
    requestBudget: createRequestBudget({ limits: { perClientPerMinute: 100, daily: 10_000 } }),
    fetcher: fetcher as unknown as typeof fetch,
  });
}

function modelResponse() {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ candidates: [
      { label: "推进", content: "雾里传来第二声汽笛。", rationale: "用动作推进", tags: ["悬念"] },
      { label: "停顿", content: "他把信封放回灯下。", rationale: "保持克制", tags: ["节奏"] },
    ] }) } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body()),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("密钥格式校验", () => {
  it("接受 sk- 开头的密钥，容忍粘贴时带的空格与引号", () => {
    expect(isValidUserAiKey(USER_KEY)).toBe(true);
    expect(isValidUserAiKey(`  "${USER_KEY}" `)).toBe(true);
    expect(normalizeUserAiKey(` sk-a b\tc\n`)).toBe("sk-abc");
  });

  it("拒绝非 sk- 前缀或过短的内容（避免把垃圾当密钥去调供应商）", () => {
    expect(isValidUserAiKey("abcdefghijklmnopqrstuvwxyz012345")).toBe(false);
    expect(isValidUserAiKey("sk-short")).toBe(false);
    expect(isValidUserAiKey("")).toBe(false);
  });

  it("打码只露头尾，不泄露整把密钥", () => {
    const masked = maskUserAiKey(USER_KEY);
    expect(masked).not.toContain(USER_KEY);
    expect(masked.startsWith("sk-ab")).toBe(true);
    expect(masked.endsWith(USER_KEY.slice(-4))).toBe(true);
  });
});

describe("请求链路", () => {
  it("带了用户密钥就直接用它调用，不再用服务端配置的密钥", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", ENV_KEY);
    const fetcher = vi.fn().mockResolvedValue(modelResponse());
    const response = await handler(fetcher)(request({ [AI_KEY_HEADER]: USER_KEY }));

    expect(response.status).toBe(200);
    const authorization = (fetcher.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization;
    expect(authorization).toBe(`Bearer ${USER_KEY}`);
  });

  it("没带用户密钥时回落到服务端配置", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", ENV_KEY);
    const fetcher = vi.fn().mockResolvedValue(modelResponse());
    const response = await handler(fetcher)(request());

    expect(response.status).toBe(200);
    const authorization = (fetcher.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization;
    expect(authorization).toBe(`Bearer ${ENV_KEY}`);
  });

  it("密钥格式不对就直接拒绝，不拿坏密钥去调供应商", async () => {
    const fetcher = vi.fn().mockResolvedValue(modelResponse());
    const response = await handler(fetcher)(request({ [AI_KEY_HEADER]: "not-a-key" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_AI_KEY" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("响应里绝不回显密钥", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", ENV_KEY);
    const fetcher = vi.fn().mockResolvedValue(modelResponse());
    const response = await handler(fetcher)(request({ [AI_KEY_HEADER]: USER_KEY }));

    const text = await response.text();
    expect(text).not.toContain(USER_KEY);
    expect(text).not.toContain(ENV_KEY);
    expect(text).not.toContain("Bearer");
  });

  it("答辩锁定模式下完全忽略用户密钥，不走外部调用", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOCKED", "true");
    const fetcher = vi.fn().mockResolvedValue(modelResponse());
    const response = await handler(fetcher)(request({ [AI_KEY_HEADER]: USER_KEY }));

    expect(response.status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
    const payload = await response.json() as { mode?: string };
    expect(payload.mode).toBe("demo");
  });
});

describe("userKeyFromRequest", () => {
  it("锁定模式下直接返回 undefined（当作没带）", () => {
    const req = request({ [AI_KEY_HEADER]: USER_KEY });
    expect(userKeyFromRequest(req, true)).toBeUndefined();
  });

  it("合法密钥原样返回，非法返回空串以示拒绝", () => {
    expect(userKeyFromRequest(request({ [AI_KEY_HEADER]: USER_KEY }), false)).toBe(USER_KEY);
    expect(userKeyFromRequest(request({ [AI_KEY_HEADER]: "bad" }), false)).toBe("");
    expect(userKeyFromRequest(request(), false)).toBeUndefined();
  });
});
