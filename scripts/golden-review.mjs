#!/usr/bin/env node
// 生成人工审定清单：把 46 个 JSON 摊平成一张人能读的表。
//
//   node scripts/golden-review.mjs            # 生成 docs/golden_审定清单.md
//   node scripts/golden-review.mjs --apply    # 读回审定结果，写进 golden JSON
//
// 为什么必须有这个：46 个 case、135 条结论，直接看 JSON 没法审。
// 审定的判断标准只有一条——「这条结论，真的是这段文本里的问题吗？」

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const GOLDEN = path.join(ROOT, "evals", "golden");

/** --batch A|B|C|D：只生成该批的清单，避免一次面对 2340 行。
 *  按编号均分，每批 6–8 条，约 300–500 行——一次能审完、能记住自己判到哪的量 */
const batchArg = (() => {
  const i = process.argv.indexOf("--batch");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const BATCHES = {
  // 按编号均分，每批 6–10 条，约 300–500 行——一次能审完的量
  1: ["GC_001","GC_002","GC_003","GC_004","GC_005","GC_006","GC_007","GC_008"],
  2: ["GC_009","GC_010","GC_011","GC_012","GC_013","GC_014","GC_015","GC_016"],
  3: ["GC_017","GC_018","GC_019","GC_020","GC_021","GC_022","GC_023","GC_024"],
  4: ["GC_025","GC_026","GC_027","GC_028","GC_029","GC_030","GC_031","GC_032"],
  5: ["GC_033","GC_034","GC_035","GC_036","GC_037","GC_038","GC_039","GC_040"],
  6: ["GC_041","GC_042","GC_043","GC_044","GC_045","GC_046"],
};

const apply = process.argv.includes("--apply");
const SHEET = batchArg
  ? path.join(ROOT, "docs", `golden_审定清单_${batchArg}.md`)
  : path.join(ROOT, "docs", "golden_审定清单.md");

const only = batchArg ? new Set(BATCHES[batchArg] ?? []) : null;
if (batchArg && !only.size) {
  console.error(`未知批次 ${batchArg}，可选 1 / 2 / 3 / 4 / 5 / 6`);
  process.exit(1);
}
const files = readdirSync(GOLDEN)
  .filter((f) => /^GC_\d+\.json$/.test(f))
  .filter((f) => !only || only.has(f.replace(/\.json$/, "")))
  .sort();
const cases = files.map((f) => ({ file: f, data: JSON.parse(readFileSync(path.join(GOLDEN, f), "utf8")) }));

if (!apply) {
  const lines = [];
  lines.push("# golden set 人工审定清单", "");
  lines.push("> 由 `node scripts/golden-review.mjs` 生成。推理由 AI 起草，**必须人审定**才计分。", "");
  lines.push("## 怎么用", "");
  lines.push("1. 逐条看每个 case 下面的结论，只判断一件事：**这条结论，真的是这段文本里的问题吗？**");
  lines.push("2. 在每条的 `[ ]` 里打 `x` 表示「成立」，打 `/` 表示「不成立」；不改动的保持 `[ ]`");
  lines.push("3. 判完整行 case 后，在 case 末尾的 `审定人：` 后面写你的名字");
  lines.push("4. 存盘，然后跑 `node scripts/golden-review.mjs --apply`");
  lines.push("");
  lines.push("**只标 `x` 的会被写进 JSON。** 标 `/` 或留空的，该条不会被记为审定通过，");
  lines.push("整个 case 也不会被标为已审定——宁可留白，不要凑数。", "");
  lines.push("---", "");

  for (const { data: c } of cases) {
    lines.push(`## ${c.id} · ${c.title}`, "");
    lines.push(`- 来源：\`${c.source?.ref}\` · ${c.source?.locator ?? ""} · 体裁 \`${c.source?.genre ?? "未标"}\` · ${c.sourceKind}`);
    lines.push(`- 字数：${(c.text ?? "").replace(/\s/g, "").length} · 现有审定状态：${c.annotation?.reviewedBy ?? "未审定"}`);
    lines.push("");
    lines.push("<details><summary>展开原文</summary>", "", "```", (c.text ?? "").slice(0, 1200), "```", "", "</details>", "");
    lines.push("**这条文本应该被诊断出的问题：**", "");
    for (const [i, f] of (c.expectedFindings ?? []).entries()) {
      lines.push(`- [ ] **${i + 1}.** ${f.claim}`);
      lines.push(`  - 依据判据：\`${(f.criteriaIds ?? []).join("` `")}\` · 性质：\`${f.basis ?? "未标"}\` · 严重度：${f.severity}`);
      lines.push(`  - 锚点（须逐字在原文）：\`${f.requiredAnchor}\``);
      const mustMention = (f.mustMention ?? []).join(" / ");
      if (mustMention) lines.push(`  - 关键词：${mustMention}`);
    }
    lines.push("");
    lines.push("**模型若断言以下内容，即为编造（用于测误报）：**", "");
    for (const f of (c.forbiddenClaims ?? [])) lines.push(`- ${f.claim}　　*(${f.reason})*`);
    if (!(c.forbiddenClaims ?? []).length) lines.push("- （无）");
    lines.push("");
    lines.push(`审定人：　　`);
    lines.push("", "---", "");
  }

  writeFileSync(SHEET, lines.join("\n"), "utf8");
  console.log(`已生成 ${path.relative(ROOT, SHEET)}（${cases.length} 条，共 ${cases.reduce((a, c) => a + (c.data.expectedFindings?.length ?? 0), 0)} 条结论待审）`);
  console.log("审完跑：node scripts/golden-review.mjs --apply");
  process.exit(0);
}

// ---------------- 回写 ----------------
if (!existsSync(SHEET)) {
  console.error("找不到审定清单，先生成：node scripts/golden-review.mjs");
  process.exit(1);
}

const sheet = readFileSync(SHEET, "utf8");
const blocks = sheet.split(/^## /m).slice(1);
let updatedCases = 0;
let acceptedFindings = 0;
let rejectedFindings = 0;

for (const block of blocks) {
  const id = block.match(/^(GC_\d+)/)?.[1];
  if (!id) continue;
  const entry = cases.find((c) => c.data.id === id);
  if (!entry) continue;

  const reviewer = block.match(/审定人：\s*(\S+)/)?.[1];
  const marks = [...block.matchAll(/^- \[(.)\] \*\*(\d+)\.\*\*/gm)].map((m) => ({ mark: m[1], index: Number(m[2]) - 1 }));

  // 一条都没标 = 这个 case 没审，跳过（不改 JSON）
  if (!marks.length) continue;

  const findings = entry.data.expectedFindings ?? [];
  const kept = [];
  for (const { mark, index } of marks) {
    const finding = findings[index];
    if (!finding) continue;
    if (mark === "x") { kept.push(finding); acceptedFindings += 1; }
    else if (mark === "/") rejectedFindings += 1;
    // 留空既不算接受也不算否决——没审就是没审，不许算成否决
  }

  // 只接受「全部标 x」的 case 为已审定——部分接受会让集子口径混乱
  const allAccepted = marks.length === findings.length && kept.length === findings.length;
  if (!allAccepted) {
    console.log(`  · ${id} 部分标注（${kept.length}/${findings.length}），保留为未审定`);
    continue;
  }
  if (!reviewer) {
    console.log(`  · ${id} 全部标了 x 但没写审定人，保留为未审定`);
    continue;
  }

  entry.data.annotation = {
    ...entry.data.annotation,
    reviewedBy: reviewer,
    reviewedAt: new Date().toISOString().slice(0, 10),
    confidence: "agreed",
  };
  writeFileSync(path.join(GOLDEN, entry.file), `${JSON.stringify(entry.data, null, 2)}\n`, "utf8");
  updatedCases += 1;
}

console.log(`\n审定完成：${updatedCases} 个 case 记为已审定`);
console.log(`结论：接受 ${acceptedFindings} 条，否决 ${rejectedFindings} 条`);
console.log("核对：node scripts/check-golden-schema.mjs");
