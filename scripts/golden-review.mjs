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
const SHEET = path.join(ROOT, "docs", "golden_审定清单.md");

const files = readdirSync(GOLDEN).filter((f) => /^GC_\d+\.json$/.test(f)).sort();
const cases = files.map((f) => ({ file: f, data: JSON.parse(readFileSync(path.join(GOLDEN, f), "utf8")) }));

const apply = process.argv.includes("--apply");

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
