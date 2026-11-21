#!/usr/bin/env node
// 读取 golden_审定.html 导出的 JSON，把审定结果写回评测集。
//
//   node scripts/golden-apply-json.mjs golden-审阅结果-王XX.json
//
// 规则（与标注规则 v1.1 一致，不让步）：
//   - 只有「整个 case 的每一条都判成立」才记为已审定
//   - 有一条判「不成立」，该 case 保持未审定，但会把否决理由记进 notes 供修改
//   - 判「待定」或没判的，同样保持未审定
// 宁可留白，不要凑数——未审定不计正式分。

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const GOLDEN = path.join(ROOT, "evals", "golden");

const file = process.argv[2];
if (!file) {
  console.error("用法：node scripts/golden-apply-json.mjs <导出的 JSON 文件>");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(path.resolve(file), "utf8"));
const reviewer = String(payload.reviewer ?? "").trim();
if (!reviewer) {
  console.error("导出结果里没有填写审定人姓名。审定必须留痕，请先在页面顶部填名字再导出。");
  process.exit(1);
}

/** votes 形如 { "GC_001#0": "ok", "GC_001#1": "no" } */
const byCase = new Map();
for (const [key, vote] of Object.entries(payload.votes ?? {})) {
  const [caseId, idx] = key.split("#");
  if (!caseId || idx === undefined) continue;
  if (!byCase.has(caseId)) byCase.set(caseId, { ok: new Set(), no: new Set(), pending: new Set(), notes: {} });
  const box = byCase.get(caseId);
  const note = (payload.notes ?? {})[key];
  if (note) box.notes[Number(idx)] = String(note).trim();
  if (vote === "ok") box.ok.add(Number(idx));
  else if (vote === "no") box.no.add(Number(idx));
  else box.pending.add(Number(idx));
}

const cases = new Map(
  readdirSync(GOLDEN)
    .filter((f) => /^GC_\d+\.json$/.test(f))
    .map((f) => [f.replace(/\.json$/, ""), { file: f, data: JSON.parse(readFileSync(path.join(GOLDEN, f), "utf8")) }]),
);

let approved = 0;
const rejected = [];
const incomplete = [];

for (const [caseId, box] of byCase) {
  const entry = cases.get(caseId);
  if (!entry) continue;
  const findings = entry.data.expectedFindings ?? [];
  const decided = box.ok.size + box.no.size;

  if (decided === 0) continue;

  // 全员成立才算审定
  if (box.ok.size === findings.length && box.no.size === 0) {
    entry.data.annotation = {
      ...entry.data.annotation,
      reviewedBy: reviewer,
      reviewedAt: payload.reviewedAt ?? new Date().toISOString().slice(0, 10),
      confidence: "agreed",
    };
    writeFileSync(path.join(GOLDEN, entry.file), `${JSON.stringify(entry.data, null, 2)}\n`, "utf8");
    approved += 1;
    continue;
  }

  // 有不成立 → 该 case 保持未审定，并把问题记下来
  const problems = [...box.no].map((i) => ({
    claim: findings[i]?.claim ?? `第 ${i + 1} 条`,
    note: box.notes[i] ?? "",
  }));
  if (box.no.size) rejected.push({ caseId, problems });
  if (decided < findings.length) incomplete.push({ caseId, decided, total: findings.length });
}

console.log(`审定人：${reviewer}`);
console.log(`\n已审定：${approved} 个 case`);
if (rejected.length) {
  console.log(`\n有否决、保持未审定：${rejected.length} 个 case`);
  for (const { caseId, problems } of rejected) {
    console.log(`  ${caseId}`);
    for (const p of problems) {
      console.log(`    ✗ ${p.claim.slice(0, 60)}${p.claim.length > 60 ? "…" : ""}`);
      if (p.note) console.log(`      你的意见：${p.note}`);
    }
  }
}
if (incomplete.length) {
  console.log(`\n未判完、保持未审定：${incomplete.length} 个 case`);
  for (const { caseId, decided, total } of incomplete) console.log(`  ${caseId}：判了 ${decided}/${total}`);
}

console.log("\n核对：node scripts/check-golden-schema.mjs");
