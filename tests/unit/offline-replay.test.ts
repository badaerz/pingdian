/**
 * 离线回放：用网站的真实校验器跑已保存的 raw 响应。
 *
 * 为什么必须有这个文件：
 * v1/v2/v3 三个 Python 脚本都是对 validation.ts 的**近似模拟**，和真实校验器必然有偏差。
 * 2026-11-19 实测：v3 报 12/14，网站报 0/14。差异在于 v3 只检查「曲线非空」，
 * 而真实校验器还要检查每个点的 segment/value/evidenceId。
 * **两套标准 = 永远对不上。**
 *
 * 本文件不做任何近似：直接 import validateTaskPayload，与生产同一条代码路径，
 * 并通过 onFailure 回调拿到真实的首个拒绝原因。
 *
 * 用法：
 *   npx vitest run tests/unit/offline-replay.test.ts
 *   npx vitest run tests/unit/offline-replay.test.ts --reporter=verbose
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateTaskPayload } from "@/lib/ai/validation";

const RUNS = path.resolve(process.cwd(), "evals/runs");
const GOLDEN = path.resolve(process.cwd(), "evals/golden");

/** 取最新一批 raw（同一时间戳的文件为一组） */
/**
 * 取「样本数最多的那一批」raw。
 * 不用「最新」——评测中途可能有只跑几条的调试批次，会让门槛误报。
 * 可用 REPLAY_STAMP 环境变量指定批次。
 */
function latestRawGroup(): { stamp: string; files: string[] } {
  const all = readdirSync(RUNS).filter((f) => /^raw-GC_\d+-.+\.json$/.test(f));
  if (!all.length) return { stamp: "", files: [] };
  const byStamp = new Map<string, string[]>();
  for (const f of all) {
    const stamp = f.replace(/^raw-GC_\d+-/, "").replace(/\.json$/, "");
    byStamp.set(stamp, [...(byStamp.get(stamp) ?? []), f]);
  }
  const pinned = process.env.REPLAY_STAMP;
  if (pinned) return { stamp: pinned, files: (byStamp.get(pinned) ?? []).sort() };
  const [stamp, files] = [...byStamp.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  return { stamp, files: files.sort() };
}

/** 与 run-eval.mjs 完全一致的 project 结构 */
function projectFor(title: string, text: string) {
  return {
    title,
    genre: "评测样本",
    logline: "",
    activeChapterId: "eval-chapter",
    contextRevision: 1,
    chapters: [{ id: "eval-chapter", title, content: text, wordCount: text.length, summary: "", order: 0 }],
    characters: [],
    worldEntries: [],
    blueprint: [],
  };
}

describe("离线回放：用真实校验器跑 raw 响应", () => {
  const { stamp, files } = latestRawGroup();

  it(`raw 批次 ${stamp || "(无)"} 共 ${files.length} 份`, () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const outcomes: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const file of files) {
    const goldenId = file.match(/GC_\d+/)?.[0] ?? "";
    it(`${goldenId}`, () => {
      const raw = JSON.parse(readFileSync(path.join(RUNS, file), "utf8"));
      const golden = JSON.parse(readFileSync(path.join(GOLDEN, `${goldenId}.json`), "utf8"));
      const text: string = golden.text;

      let failure: string | undefined;
      const result = validateTaskPayload(
        "analysis-v2",
        raw,
        projectFor(golden.title ?? goldenId, text) as never,
        "live",
        {
          sourceText: text,
          expectedSourceKind: raw.sourceKind,
          onFailure: (reason: string) => { failure = reason; },
        },
      );

      if (!result) {
        outcomes.push({ id: goldenId, ok: false, reason: failure });
        console.log(`\n❌ ${goldenId} 拒绝原因：${failure ?? "(未记录)"}`);
      } else {
        outcomes.push({ id: goldenId, ok: true });
        console.log(`\n✅ ${goldenId} 通过`);
      }
      expect(true).toBe(true);
    });
  }

  it("汇总：回归门槛 10/14", () => {
    const pass = outcomes.filter((o) => o.ok).length;
    console.log(`\n\n════ 离线回放：${pass}/${outcomes.length} 通过（门槛 10）════\n`);
    for (const o of outcomes.filter((x) => !x.ok)) {
      console.log(`  ❌ ${o.id}  ${o.reason ?? "(未记录)"}`);
    }
    // 契约 AC4 门槛：14 条里至少 10 条能通过真实校验器。
    // 这是**离线回归**，用已保存的 raw 复算，不花钱、不限次数。
    expect(outcomes.length).toBeGreaterThan(0);
    expect(pass).toBeGreaterThanOrEqual(10);
  });
});
