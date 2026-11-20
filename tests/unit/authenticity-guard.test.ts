/**
 * 真实性守卫（硬指标，与产品核心同级）
 *
 * 2026-11-20 手工排查发现知识图谱页、新建向导、故事方向三处都**吞掉了接口的 mode**：
 * 模型回退成演示数据时，页面照样把假结果摆在真实结果的位置上。
 * 手工排查一次能抓三个，但抓不住第四次——所以把它变成测试。
 *
 * 本文件守住三条：
 *   1. 任何调用 /api/ai 的组件，必须读接口返回的 mode（否则无法区分真实与演示）
 *   2. 任何调用 /api/ai 的组件，必须走 aiRequestHeaders()（否则用户自带的密钥被绕过）
 *   3. 组件不得直接引用 fixtures 里的演示数据（那是服务端的回退职责，不是 UI 的）
 *
 * 这是静态扫描，不依赖运行。新增 AI 入口时会被立刻拦住。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(path.join(SRC, "components"));
const aiCallers = files.filter((file) => /["'`]\/api\/ai["'`]|\bfetchAi\s*\(/.test(readFileSync(file, "utf8")));

describe("真实性守卫：AI 入口必须能区分真实与演示", () => {
  it("至少能找到 AI 调用点（找不到说明扫描逻辑坏了，不是好消息）", () => {
    expect(aiCallers.length).toBeGreaterThan(0);
  });

  it("每个调用 /api/ai 的组件都读取了接口返回的 mode", () => {
    const missing = aiCallers.filter((file) => !/\bmode\b/.test(readFileSync(file, "utf8")));
    for (const file of missing) console.log(`  ✗ 未区分真实/演示：${path.relative(SRC, file)}`);
    expect(missing.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("每个调用 /api/ai 的组件都走 aiRequestHeaders()，不绕过用户自带密钥", () => {
    const missing = aiCallers.filter((file) => !file.endsWith("user-key.ts") && !/aiRequestHeaders/.test(readFileSync(file, "utf8")));
    for (const file of missing) console.log(`  ✗ 未走统一请求头：${path.relative(SRC, file)}`);
    expect(missing.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("组件不直接引用 fixtures 演示数据（回退是服务端职责，不许在 UI 里造假）", () => {
    const offenders = files.filter((file) => /from\s+["']@\/lib\/ai\/fixtures["']/.test(readFileSync(file, "utf8")));
    for (const file of offenders) console.log(`  ✗ 组件直接引 fixtures：${path.relative(SRC, file)}`);
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("演示态文案必须存在：演示结果是用户可见的，不是只在注释里说", () => {
    // 不要求每个组件都写死这几个字，但至少要有明确的演示/降级标识通路。
    const withBadge = aiCallers.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /演示|降级|StatusBadge|demo/i.test(source);
    });
    expect(withBadge.length).toBe(aiCallers.length);
  });
});
