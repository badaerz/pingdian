#!/usr/bin/env node
// 把 evals/runs 里的裸 raw 转成可提交的回放夹具。
//
// 夹具命名 GC_XXX-<正文指纹>-pN.json，正文一改旧夹具自动失效。
// 放 evals/runs 里的 raw 是 gitignore 的，新克隆就没了，门禁永远不可复现——
// 这是真实踩过的坑，所以夹具必须落在受版本控制的目录。
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const RUNS = path.join(ROOT, "evals", "runs");
const GOLDEN = path.join(ROOT, "evals", "golden");
const OUT = path.join(ROOT, "evals", "fixtures", "raw");

const hash = (text) => createHash("sha1").update(text, "utf8").digest("hex").slice(0, 8);

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const raws = readdirSync(RUNS).filter((f) => /^raw-GC_\d+-.+\.json$/.test(f));
let written = 0;
const skipped = [];

for (const file of raws) {
  const caseId = file.match(/GC_\d+/)[0];
  const goldenPath = path.join(GOLDEN, `${caseId}.json`);
  if (!existsSync(goldenPath)) {
    skipped.push(`${file}（无对应 golden）`);
    continue;
  }
  const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
  const name = `${caseId}-${hash(golden.text ?? "")}-p1.json`;
  // 同一 case 后采的覆盖先采的
  writeFileSync(path.join(OUT, name), readFileSync(path.join(RUNS, file), "utf8"), "utf8");
  written += 1;
}

const distinct = new Set(readdirSync(OUT));
console.log(`转换 ${written} 份 → evals/fixtures/raw（去重后 ${distinct.size} 个样本）`);
for (const name of [...distinct].sort()) console.log("  " + name);
if (skipped.length) console.log("跳过：\n  " + skipped.join("\n  "));
