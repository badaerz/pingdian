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
/**
 * 判据协议版本：文件名带 `-p1` 的是「诊断必须回填 criteriaIds」之后的批次。
 * 不带版本戳的历史文件是旧协议产物——用新规则回放它们，只会得到假的「全线回归」，
 * 所以旧批次单独断言「只许因判据规则失败，不许因别的原因失败」。
 */
function rawProtocol(file: string): "p0" | "p1" {
  return /-p1\.json$/.test(file) ? "p1" : "p0";
}

function groupByStamp(filter: (file: string) => boolean): { stamp: string; files: string[] } {
  const all = readdirSync(RUNS).filter((f) => /^raw-GC_\d+-.+\.json$/.test(f) && filter(f));
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

/**
 * 当前协议批次 = 每个样本取**最新一份** p1 raw。
 *
 * 不能按时间戳分组：一次评测可能分成几次调用跑完（分片跑是为了避开超时），
 * 每次都会得到不同的时间戳，按戳分组会把 14 条切成几组，门槛就永远凑不齐。
 * 评测基线要的正是「每个样本最近一次真实结果」，所以按样本去重取最新。
 */
function latestRawGroup(): { stamp: string; files: string[] } {
  const all = readdirSync(RUNS).filter((f) => /^raw-GC_\d+-.+\.json$/.test(f) && rawProtocol(f) === "p1");
  const newest = new Map<string, string>();
  for (const f of all.sort()) {
    const id = f.match(/GC_\d+/)?.[0] ?? f;
    newest.set(id, f); // 文件名含时间戳，排序后后者即最新
  }
  const files = [...newest.values()].sort();
  const stamp = files.length ? files[0].replace(/^raw-GC_\d+-/, "").replace(/-p1\.json$/, "") : "";
  return { stamp, files };
}

function latestLegacyGroup(): { stamp: string; files: string[] } {
  return groupByStamp((f) => rawProtocol(f) === "p0");
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

  it(`当前协议基线：${files.length} 个样本（每个取最新一份，起始 ${stamp || "(无)"}）`, () => {
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

  it("汇总：当前协议批次的回归门槛 10/14", () => {
    const pass = outcomes.filter((o) => o.ok).length;
    console.log(`\n\n════ 离线回放（协议 p1）：${pass}/${outcomes.length} 通过（门槛 10）════\n`);
    for (const o of outcomes.filter((x) => !x.ok)) {
      console.log(`  ❌ ${o.id}  ${o.reason ?? "(未记录)"}`);
    }
    // 门槛只对**当前协议**的批次生效。没有当前协议批次时不能假装通过——
    // 那会让「一次都没在新规则下跑过」看起来像过了回归。
    expect(outcomes.length).toBeGreaterThan(0);
    expect(pass).toBeGreaterThanOrEqual(10);
  });
});

/**
 * 旧协议批次（文件名没有 -p1）单独断言。
 *
 * 它们是在「criteriaIds 可缺失」的年代产出的，用新规则回放必然全灭。
 * 但「必然全灭」和「管线坏了」是两件事，必须能分开：
 * 旧批次现在只许因为判据规则被拒，**不许因为引文、证据、结构这些早已修好的地方被拒**。
 * 这条断言等于给旧批次保留了一份「其他环节没退化」的保险。
 */
describe("旧协议批次：只许因判据规则失败", () => {
  const { stamp, files } = latestLegacyGroup();

  it(`旧协议批次 ${stamp || "(无)"} 共 ${files.length} 份`, () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const rejected: Array<{ id: string; reason: string }> = [];

  for (const file of files) {
    const goldenId = file.match(/GC_\d+/)?.[0] ?? "";
    it(`${goldenId} 的拒绝原因必须与判据有关`, () => {
      const raw = JSON.parse(readFileSync(path.join(RUNS, file), "utf8"));
      const golden = JSON.parse(readFileSync(path.join(GOLDEN, `${goldenId}.json`), "utf8"));
      let failure: string | undefined;
      validateTaskPayload("analysis-v2", raw, projectFor(golden.title ?? goldenId, golden.text) as never, "live", {
        sourceText: golden.text,
        expectedSourceKind: raw.sourceKind,
        onFailure: (reason: string) => { failure = reason; },
      });
      if (failure) rejected.push({ id: goldenId, reason: failure });
      expect(failure === undefined || /criteria|判据/.test(failure)).toBe(true);
    });
  }

  it("汇总：没有一条是因为引文/证据/结构被拒", () => {
    const wrongReason = rejected.filter((item) => !/criteria|判据/.test(item.reason));
    if (wrongReason.length) {
      for (const item of wrongReason) console.log(`  ❌ ${item.id}  非判据原因：${item.reason}`);
    }
    console.log(`\n\n════ 旧协议批次：${rejected.length}/${files.length} 因判据规则被拒（预期行为）════\n`);
    expect(wrongReason).toEqual([]);
  });
});
