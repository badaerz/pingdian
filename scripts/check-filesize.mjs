#!/usr/bin/env node
// Enforces the 500-line file ceiling from docs/QUALITY.md §1.
//
// Existing offenders are grandfathered in EXEMPT so the rule can land today
// without a big-bang refactor. The list only shrinks: remove an entry once the
// file is under 500 lines. Adding an entry requires an explicit note in
// docs/exec-plans/ explaining why the file cannot be split.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAX_LINES = 500;
const SCAN_DIRS = ["src"];
// Stylesheets are excluded: a design-system file legitimately runs long and has
// no control flow to split along. This rule targets logic files only.
const EXTENSIONS = /\.(ts|tsx|mts)$/;

// Frozen at 2026-11-17. Shrink-only.
const EXEMPT = new Map([
  ["src/lib/story-store.ts", "persistence + migration + builtin-case repair; split tracked in docs/exec-plans/active/"],
  ["src/lib/ai/validation.ts", "centralized per-task validators; contracts extraction tracked in docs/exec-plans/active/"],
  ["src/components/ip-lab/ip-lab-workspace.tsx", "vision-stage UI, pending mock downgrade per PRD v2.0 §4"],
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (EXTENSIONS.test(entry.name)) files.push(full);
  }
  return files;
}

const offenders = [];
for (const dir of SCAN_DIRS) {
  for (const file of await walk(path.join(ROOT, dir))) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    const lineCount = (await readFile(file, "utf8")).split("\n").length;
    if (lineCount > MAX_LINES && !EXEMPT.has(relative)) {
      offenders.push({ relative, lineCount });
    }
  }
}

if (offenders.length === 0) {
  console.log(`filesize OK — no non-exempt file under src/ exceeds ${MAX_LINES} lines.`);
  process.exit(0);
}

console.error(`filesize FAILED — ${offenders.length} file(s) over ${MAX_LINES} lines:\n`);
for (const offender of offenders.sort((a, b) => b.lineCount - a.lineCount)) {
  console.error(`  ${offender.relative}  ${offender.lineCount} lines`);
}
console.error(
  `\nFix: split by responsibility. Types → <domain>/types.ts, pure logic → <domain>/service.ts,\n` +
    `UI pieces → sibling components. See docs/QUALITY.md §1.`,
);
process.exit(1);
