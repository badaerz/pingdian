#!/usr/bin/env node
// Enforces the dependency direction declared in docs/ARCHITECTURE.md §1:
//   app → components/providers → lib → data
// `src/lib/**` and `src/data/**` must never reach back up into
// `src/components/**` or `src/app/**`.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const GUARDED_DIRS = ["src/lib", "src/data"];
const FORBIDDEN_LAYERS = ["components", "app", "providers"];

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** Resolve an import specifier to the layer it targets, or null if it stays inside lib/data. */
function targetedLayer(specifier, fromFile) {
  let resolved;
  if (specifier.startsWith("@/")) {
    resolved = path.join(ROOT, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    resolved = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null; // bare package import
  }
  const relative = path.relative(ROOT, resolved).split(path.sep).join("/");
  for (const layer of FORBIDDEN_LAYERS) {
    if (relative === `src/${layer}` || relative.startsWith(`src/${layer}/`)) return layer;
  }
  return null;
}

const violations = [];
for (const dir of GUARDED_DIRS) {
  const files = await walk(path.join(ROOT, dir));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const layer = targetedLayer(match[1], file);
      if (!layer) continue;
      const line = source.slice(0, match.index).split("\n").length;
      violations.push({
        file: path.relative(ROOT, file).split(path.sep).join("/"),
        line,
        specifier: match[1],
        layer,
      });
    }
  }
}

if (violations.length === 0) {
  console.log("layering OK — src/lib and src/data do not reach into components/app/providers.");
  process.exit(0);
}

console.error(`layering FAILED — ${violations.length} upward import(s):\n`);
for (const violation of violations) {
  console.error(`  ${violation.file}:${violation.line}  imports "${violation.specifier}" (targets src/${violation.layer}/**)`);
}
console.error(
  "\nFix: move the shared logic DOWN into src/lib/, or pass it in as an argument/prop.\n" +
    "See docs/ARCHITECTURE.md §1 for the allowed direction.",
);
process.exit(1);
