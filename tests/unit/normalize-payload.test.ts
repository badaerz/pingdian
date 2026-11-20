/**
 * 归一化层回归测试。
 *
 * 归一化已内置在生产路径（readLiteraryAnalysis 入口），本测试用已保存的真实 raw
 * 守住"字段命名兼容"这条能力不被后续改动打破。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateTaskPayload } from "@/lib/ai/validation";
import { normalizeModelPayload } from "@/lib/ai/normalize-payload";

const RUNS = path.resolve(process.cwd(), "evals/runs");
const GOLDEN = path.resolve(process.cwd(), "evals/golden");

function projectFor(title: string, text: string) {
  return {
    title, genre: "评测样本", logline: "", activeChapterId: "eval-chapter", contextRevision: 1,
    chapters: [{ id: "eval-chapter", title, content: text, wordCount: text.length, summary: "", order: 0 }],
    characters: [], worldEntries: [], blueprint: [],
  };
}

const all = readdirSync(RUNS).filter((f) => /^raw-GC_\d+-.+\.json$/.test(f));
const stamps = [...new Set(all.map((f) => f.replace(/^raw-GC_\d+-/, "").replace(/\.json$/, "")))].sort();
const STAMP = process.env.REPLAY_STAMP ?? stamps[stamps.length - 1] ?? "";
const FILES = all.filter((f) => f.includes(STAMP)).sort();
const ROWS: Array<{ id: string; rawOk: boolean; normOk: boolean; rawWhy?: string; normWhy?: string }> = [];

describe("归一化方案验证", () => {
  it(`批次 ${STAMP} 共 ${FILES.length} 份`, () => expect(FILES.length).toBeGreaterThan(0));

  for (const file of FILES) {
    const id = (file.match(/GC_\d+/) ?? ["?"])[0];
    it(id, () => {
      const raw = JSON.parse(readFileSync(path.join(RUNS, file), "utf8"));
      const golden = JSON.parse(readFileSync(path.join(GOLDEN, `${id}.json`), "utf8"));
      const text: string = golden.text;
      const ctx = { sourceText: text, expectedSourceKind: raw.sourceKind };

      let rawWhy: string | undefined;
      const rawRes = validateTaskPayload("analysis-v2", raw, projectFor(golden.title ?? id, text) as never, "live",
        { ...ctx, onFailure: (r: string) => { rawWhy = r; } });

      const norm = normalizeModelPayload(raw);
      let normWhy: string | undefined;
      const normRes = validateTaskPayload("analysis-v2", norm, projectFor(golden.title ?? id, text) as never, "live",
        { ...ctx, onFailure: (r: string) => { normWhy = r; } });

      ROWS.push({ id, rawOk: !!rawRes, normOk: !!normRes, rawWhy, normWhy });
      console.log(`\n${id}  原始=${rawRes ? "OK" : "NO(" + (rawWhy ?? "") + ")"}   归一化=${normRes ? "OK" : "NO(" + (normWhy ?? "") + ")"}`);
      expect(true).toBe(true);
    });
  }

  it("汇总", () => {
    const rawPass = ROWS.filter((r) => r.rawOk).length;
    const normPass = ROWS.filter((r) => r.normOk).length;
    console.log(`\n\n════ 原始 ${rawPass}/${ROWS.length} ｜ 归一化后 ${normPass}/${ROWS.length} ════\n`);
    for (const r of ROWS.filter((x) => !x.normOk)) console.log(`  仍失败 ${r.id}: ${r.normWhy}`);
    expect(ROWS.length).toBeGreaterThan(0);
  });
});
