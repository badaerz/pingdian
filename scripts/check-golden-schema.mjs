#!/usr/bin/env node
// Golden set 标注规则 v1.1 的机器检查器。
//
//   node scripts/check-golden-schema.mjs
//
// 只做**能算的**判断：判据编号是否合法、不适用条件是否被违反、
// 锚点是否落在声明的段落、同作品是否超额、覆盖配额是否达标。
// 算不了的（如"这段是不是反讽"）不在这里假装能判，直接进人工复核清单。

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const GOLDEN = path.join(ROOT, "evals", "golden");
const CRITERIA = JSON.parse(readFileSync(path.join(ROOT, "src", "lib", "ai", "criteria-data.json"), "utf8"));

const rows = Array.isArray(CRITERIA) ? CRITERIA : CRITERIA.criteria;
const criteriaById = new Map(rows.map((row) => [row.id, row]));
const CRITERIA_IDS = new Set(rows.map((row) => row.id));

const GENRES = new Set(["narrative-fic", "narrative-nonfic", "lyric", "poetry", "drama", "argumentative", "expository"]);

/** 判据库里写成纯量化的「不适用」条件，程序可以直接算。 */
const NOT_APPLICABLE_CHECKS = [
  { ids: ["D1"], test: (m) => m.hanzi < 200, why: "D1 要求全文 ≥200 汉字" },
  { ids: ["D3"], test: (m) => m.hanzi <= 400, why: "D3 要求全文 >400 汉字" },
  { ids: ["D2", "M1", "M2"], test: (m) => m.paragraphs < 2, why: "该判据要求段落数 ≥2" },
  { ids: ["S1", "S2", "S3"], test: (m) => m.paragraphs < 3, why: "该判据要求段落数 ≥3" },
];

const hanzi = (text) => (String(text ?? "").match(/[㐀-鿿]/g) ?? []).length;
const paragraphs = (text) => String(text ?? "").split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);

const problems = [];
const manual = [];
const cases = [];

for (const file of readdirSync(GOLDEN).filter((f) => /^GC_\d+\.json$/.test(f)).sort()) {
  const raw = readFileSync(path.join(GOLDEN, file), "utf8");
  const c = JSON.parse(raw);
  const id = c.id ?? file;
  const push = (msg) => problems.push(`${id}: ${msg}`);
  const text = c.text ?? "";
  const metrics = { hanzi: hanzi(text), paragraphs: paragraphs(text).length, chars: text.length };

  // ---- 基础形状（v1.0 已要求，这里一并守住）----
  if (!text) push("缺 text");
  if (!Array.isArray(c.expectedFindings) || c.expectedFindings.length < 1) push("expectedFindings 为空");
  if (c.expectedFindings?.length > 5) push(`expectedFindings 超过 5 条（${c.expectedFindings.length}）`);
  if (!Array.isArray(c.forbiddenClaims)) push("缺 forbiddenClaims 字段");
  if (c.annotation?.reviewedBy !== null) push("reviewedBy 应为 null（起草者不得自审）");

  const upgraded = (c.expectedFindings ?? []).every((f) => Array.isArray(f.criteriaIds) && f.basis);

  // ---- R6 覆盖声明 ----
  if (!GENRES.has(c.source?.genre)) push(`source.genre 缺失或非法（${c.source?.genre ?? "无"}），触发 R6`);

  // ---- R1 / R2 / R3 / R4 ----
  for (const [i, f] of (c.expectedFindings ?? []).entries()) {
    const at = `EF[${i}]`;

    if (!text.includes(f.requiredAnchor)) push(`${at}.requiredAnchor 不在原文`);

    if (Array.isArray(f.criteriaIds)) {
      if (!f.criteriaIds.length) push(`${at}.criteriaIds 为空，触发 R1`);
      for (const cid of f.criteriaIds) if (!CRITERIA_IDS.has(cid)) push(`${at}.criteriaIds 含非法编号 ${cid}，触发 R1`);

      // R3：不适用条件成立的判据不得判为缺陷
      if (f.basis === "defect") {
        for (const check of NOT_APPLICABLE_CHECKS) {
          const hit = (f.criteriaIds ?? []).filter((cid) => check.ids.includes(cid));
          if (hit.length && check.test(metrics)) push(`${at} 用 ${hit.join("/")} 判缺陷，但本文不满足适用条件（${check.why}），触发 R3`);
        }
        const needsManual = (f.criteriaIds ?? []).filter((cid) => criteriaById.get(cid)?.notApplicable && !NOT_APPLICABLE_CHECKS.some((k) => k.ids.includes(cid)));
        for (const cid of needsManual) {
          if (!f.notApplicableChecked) manual.push(`${id} ${at}（${cid}）需写明为何不适用条件不成立`);
        }
      }
    } else if (!upgraded) {
      problems.push(`${id}: ${at} 缺 criteriaIds / basis（未按 v1.1 升级）`);
    }

    // R2
    if (f.basis && !["defect", "positive"].includes(f.basis)) push(`${at}.basis 非法：${f.basis}，触发 R2`);
    if (f.basis === "positive" && f.severity === "high") push(`${at} 是 positive 却给了 high severity，触发 R2`);

    // R4：锚点必须落在声明的段落内
    if (typeof f.anchorParagraph === "number") {
      const seg = paragraphs(text)[f.anchorParagraph - 1] ?? "";
      if (!seg.includes(f.requiredAnchor)) push(`${at}.requiredAnchor 不在第 ${f.anchorParagraph} 段，触发 R4`);
    } else if (upgraded) {
      problems.push(`${id}: ${at} 缺 anchorParagraph，触发 R4`);
    }
  }

  for (const [i, f] of (c.forbiddenClaims ?? []).entries()) {
    if (upgraded && !Array.isArray(f.criteriaIds)) problems.push(`${id}: FC[${i}] 缺 criteriaIds，触发 R1`);
  }

  const findings = c.expectedFindings ?? [];
  const defectCount = findings.filter((f) => f.basis === "defect").length;
  const positiveCount = findings.filter((f) => f.basis === "positive").length;
  // 质量档由 basis 分布推导，不另设字段——少一个字段就少一处可以标歪的地方
  const quality = defectCount === 0 ? "positive" : positiveCount === 0 ? "defective" : "mixed";
  cases.push({ id, ref: c.source?.ref, locator: c.source?.locator, genre: c.source?.genre, kind: c.sourceKind, quality, ...metrics, upgraded });
}

// ---- R5 同作品配额 ----
const byRef = new Map();
for (const c of cases) byRef.set(c.ref, [...(byRef.get(c.ref) ?? []), c]);
for (const [ref, list] of byRef) {
  if (list.length > 2) problems.push(`${ref}: 同一作品 ${list.length} 条，超过 R5 上限 2`);
  const locators = new Set(list.map((c) => c.locator));
  if (locators.size !== list.length) problems.push(`${ref}: 同作品样本的 locator 重复（${list.map((c) => c.locator).join(" / ")}），触发 R5`);
}

// ---- R6 覆盖配额 ----
const count = (predicate) => cases.filter(predicate).length;
const coverage = [
  ["narrative-fic", 10, count((c) => c.genre === "narrative-fic")],
  ["narrative-nonfic", 2, count((c) => c.genre === "narrative-nonfic")],
  ["lyric", 2, count((c) => c.genre === "lyric")],
  ["poetry", 2, count((c) => c.genre === "poetry")],
  ["drama", 1, count((c) => c.genre === "drama")],
  ["argumentative", 3, count((c) => c.genre === "argumentative")],
  ["expository", 2, count((c) => c.genre === "expository")],
  ["sourceKind=argumentative", 3, count((c) => c.kind === "argumentative")],
  ["汉字 <300（验证不适用条件）", 2, count((c) => c.hanzi < 300)],
  ["汉字 300–1000", 8, count((c) => c.hanzi >= 300 && c.hanzi <= 1000)],
  ["汉字 1000–3000", 4, count((c) => c.hanzi > 1000 && c.hanzi <= 3000)],
  // 质量只分两档：反例测误报、缺陷测漏报。中间的"混合档"没有评测含义，不作配额。
  ["质量·反例样本（测误报）", 3, count((c) => c.quality === "positive")],
  ["质量·缺陷样本（测漏报）", 3, count((c) => c.quality === "defective")],
];
const gaps = coverage.filter(([, target, actual]) => actual < target);

console.log(`\n=== golden set：${cases.length} 条 ===`);
console.log(`已按 v1.1 升级：${cases.filter((c) => c.upgraded).length} 条　未升级：${cases.filter((c) => !c.upgraded).length} 条`);

console.log("\n=== R6 覆盖配额 ===");
for (const [label, target, actual] of coverage) {
  console.log(`  ${actual >= target ? "✓" : "✗"} ${label.padEnd(26)} ${actual} / ${target}`);
}

console.log(`\n=== 硬性违规 ${problems.length} 项 ===`);
for (const p of problems.slice(0, 40)) console.log("  ✗ " + p);
if (problems.length > 40) console.log(`  …… 另有 ${problems.length - 40} 项`);

console.log(`\n=== 需人工书面说明 ${manual.length} 项（R3 非量化不适用条件）===`);
for (const m of manual.slice(0, 20)) console.log("  · " + m);
if (manual.length > 20) console.log(`  …… 另有 ${manual.length - 20} 项`);

console.log(`\n=== 覆盖缺口 ${gaps.length} 项 ===`);
for (const [label, target, actual] of gaps) console.log(`  → ${label}：还差 ${target - actual} 条`);

process.exitCode = problems.length ? 1 : 0;
