#!/usr/bin/env node
// Golden-set evaluator for the literary-diagnosis agent.
//
//   npm run eval         offline  — deterministic fixtures, proves the PIPELINE
//   npm run eval:live    live     — real provider, measures MODEL capability
//
// The two modes are not interchangeable. An offline score says "the evidence
// plumbing works"; only a live score can be quoted as "the model performs at X".
// The report records which mode produced it so the two can never be confused.
//
// Usage:
//   node scripts/run-eval.mjs [--live] [--case GC_003] [--out evals/runs/NAME.json]

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createJiti } from "jiti";

const ROOT = path.resolve(import.meta.dirname, "..");
const GOLDEN_DIR = path.join(ROOT, "evals", "golden");
const RUNS_DIR = path.join(ROOT, "evals", "runs");
// 回放夹具必须**提交进仓库**：放在 gitignore 的 evals/runs 里，
// 新克隆或清理后就没了，门禁永远不可复现——这是被真实踩过的坑。
const FIXTURES_DIR = path.join(ROOT, "evals", "fixtures", "raw");

/** 正文指纹：样本正文一改，旧夹具自动失效，不会被拿去当新样本回放。 */
const goldenHash = (text) => createHash("sha1").update(text, "utf8").digest("hex").slice(0, 8);

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
// 采集回放夹具：写到受版本控制的 evals/fixtures/raw
const EMIT_FIXTURES = args.includes("--fixtures");
const caseFilter = (() => {
  const index = args.indexOf("--case");
  return index >= 0 ? args[index + 1] : null;
})();
const outName = (() => {
  const index = args.indexOf("--out");
  return index >= 0 ? args[index + 1] : null;
})();
// 并发只改墙钟，不改任何一条的打分：每条仍是独立请求、独立计分，
// 结果按原始样本顺序回填，summary 与串行跑逐位一致。默认 1，即旧行为。
const concurrencyArg = (() => {
  const index = args.indexOf("--concurrency");
  return index >= 0 ? Number(args[index + 1]) : 1;
})();
const CONCURRENCY = Number.isFinite(concurrencyArg) && concurrencyArg > 0 ? Math.floor(concurrencyArg) : 1;

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(ROOT, "src") },
  interopDefault: true,
});

const { runAiTask } = await jiti.import(path.join(ROOT, "src", "lib", "ai", "tasks.ts"));
const { detectLiterarySourceKind } = await jiti.import(path.join(ROOT, "src", "lib", "analysis", "source-kind.ts"));
const { CRITERIA_VERSION, injectedCriteriaIds } = await jiti.import(path.join(ROOT, "src", "lib", "ai", "criteria.ts"));

// ---------------------------------------------------------------- provider env
async function readEnvFile() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      // Normalize CRLF first: JS regex `.` does not match \r, so a Windows
      // .env file would otherwise parse only its last line.
      const raw = (await readFile(path.join(ROOT, file), "utf8")).replace(/\r\n?/g, "\n");
      for (const line of raw.split("\n")) {
        const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (match && env[match[1]] === undefined) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
      break;
    } catch {
      // try the next file
    }
  }
  return env;
}

// ---------------------------------------------------------------- case loading
function validateCase(entry, file) {
  const problems = [];
  if (!entry.id) problems.push("missing id");
  if (!entry.text) problems.push("missing text");
  if (!Array.isArray(entry.expectedFindings) || entry.expectedFindings.length === 0) problems.push("missing expectedFindings");
  if (!Array.isArray(entry.forbiddenClaims)) problems.push("missing forbiddenClaims");
  for (const finding of entry.expectedFindings ?? []) {
    if (!entry.text?.includes(finding.requiredAnchor)) {
      problems.push(`anchor not verbatim in text: "${finding.requiredAnchor}"`);
    }
  }
  if (problems.length) throw new Error(`${file} is malformed:\n  - ${problems.join("\n  - ")}`);
  return entry;
}

async function loadCases() {
  const files = (await readdir(GOLDEN_DIR)).filter((name) => /^GC_\d+\.json$/.test(name)).sort();
  if (!files.length) throw new Error(`no GC_*.json cases found in ${GOLDEN_DIR}`);
  const cases = [];
  for (const file of files) {
    const entry = JSON.parse(await readFile(path.join(GOLDEN_DIR, file), "utf8"));
    if (caseFilter && entry.id !== caseFilter) continue;
    cases.push(validateCase(entry, file));
  }
  if (!cases.length) throw new Error(`case filter "${caseFilter}" matched nothing`);
  return cases;
}

// ---------------------------------------------------------------- scoring
/** 判据协议版本：p1 = 诊断必须回填 criteriaIds；p0（历史文件）= 允许缺失。 */
const CRITERIA_PROTOCOL = "1";

const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 };

/** Normalized text used for key-term matching: strip punctuation and whitespace. */
function normalize(text) {
  return String(text ?? "").normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");
}

function diagnosticText(diagnostic) {
  return normalize(`${diagnostic.effect ?? ""}${diagnostic.action ?? ""}${diagnostic.location ?? ""}`);
}

/**
 * A predicted diagnostic matches an expected finding when BOTH:
 *   - its quoted evidence can locate the anchor in the source text, AND
 *   - its prose mentions at least one of the finding's key terms.
 *
 * The anchor test is what makes traceability meaningful: a diagnostic that
 * says the right thing but points at nothing verifiable does not count.
 */
function matchFinding(diagnostic, finding) {
  const quote = normalize(diagnostic.quote);
  const anchor = normalize(finding.requiredAnchor);
  const locates = quote.length > 0 && (anchor.includes(quote) || quote.includes(anchor));
  if (!locates) return false;
  const prose = diagnosticText(diagnostic);
  return finding.mustMention.some((term) => prose.includes(normalize(term)));
}

/** A prediction asserts a forbidden claim when its prose carries all the claim's content words. */
function assertsForbidden(diagnostic, forbidden) {
  const prose = diagnosticText(diagnostic);
  const terms = normalize(forbidden.claim)
    .split("")
    .filter((char) => /[一-鿿]/.test(char));
  if (terms.length === 0) return false;
  const hits = new Set(terms.filter((char) => prose.includes(char)));
  // Deliberately loose: prose is short, so a high character overlap means the
  // diagnostic is talking about the same thing. Tuned on the seed set;
  // revisit once 30+ reviewed cases exist.
  return hits.size / new Set(terms).size >= 0.8;
}

function scoreCase(entry, diagnostics) {
  const matchedFindings = new Set();
  const usedPredictions = new Set();
  const forbiddenHits = [];

  for (const diagnostic of diagnostics) {
    for (const forbidden of entry.forbiddenClaims) {
      if (assertsForbidden(diagnostic, forbidden)) forbiddenHits.push({ diagnostic, forbidden });
    }
  }

  for (const [index, diagnostic] of diagnostics.entries()) {
    for (const finding of entry.expectedFindings) {
      if (matchedFindings.has(finding.claim)) continue;
      if (matchFinding(diagnostic, finding)) {
        matchedFindings.add(finding.claim);
        usedPredictions.add(index);
        break;
      }
    }
  }

  // Traceability is judged over ALL predictions, not just the matched ones:
  // an unanchored claim is exactly the hallucination we are trying to catch.
  // "Anchored" means the quoted evidence literally appears in the source text
  // the model was given. Nothing else counts — a plausible-sounding quote that
  // is not in the text is the failure mode this metric exists to expose.
  const source = normalize(entry.text);
  const anchored = diagnostics.filter((diagnostic) => {
    const quote = normalize(diagnostic.quote);
    return quote.length > 0 && source.includes(quote);
  });

  // ---- badcase 归因（PRD §3.4 要求分三类）----
  // 归因是启发式，不是真理：只能回答「模型有没有机会说对」，
  // 不能回答「它为什么没说」。所以在报告里必须标明这是推断。
  const injected = new Set(injectedCriteriaIds());
  const attributeMiss = (finding) => {
    const ids = Array.isArray(finding.criteriaIds) ? finding.criteriaIds : [];
    // 该结论依据的判据根本没进 prompt → 知识库/注入层面就没给机会
    if (ids.length > 0 && ids.every((id) => !injected.has(id))) return "criteria_not_injected";
    // 模型的证据有没有碰到过这条结论所在的位置 → 没碰到就是没走到那段
    const anchor = normalize(finding.requiredAnchor);
    const touched = diagnostics.some((d) => {
      const quote = normalize(d.quote);
      if (!quote || !anchor) return false;
      return anchor.includes(quote) || quote.includes(anchor) || quote.slice(0, 8) === anchor.slice(0, 8);
    });
    return touched ? "not_expressed" : "not_located";
  };

  const missed = entry.expectedFindings.filter((f) => !matchedFindings.has(f.claim));
  const missedAttribution = {};
  for (const finding of missed) {
    const key = attributeMiss(finding);
    missedAttribution[key] = (missedAttribution[key] ?? 0) + 1;
  }

  return {
    id: entry.id,
    title: entry.title,
    diagnostics: diagnostics.length,
    // 精确率用：有多少条诊断真的对上了某条预期发现（其余算多报）
    usedPredictions: usedPredictions.size,
    expected: entry.expectedFindings.length,
    matched: matchedFindings.size,
    matchedClaims: [...matchedFindings],
    missedClaims: missed.map((f) => f.claim),
    missedAttribution,
    unpredictedCount: diagnostics.length - usedPredictions.size,
    forbiddenHits: forbiddenHits.map((hit) => ({ claim: hit.forbidden.claim, quote: hit.diagnostic.quote })),
    anchoredCount: anchored.length,
    reviewed: entry.annotation.reviewedBy !== null,
    // Whether the run had any diagnostic at all. A total miss is a different
    // failure from a wrong answer and must not be averaged away.
    empty: diagnostics.length === 0,
  };
}

// ---------------------------------------------------------------- aggregate
function aggregate(results, entryById) {
  const weightOf = (entry, claim) => {
    const finding = entry.expectedFindings.find((f) => f.claim === claim);
    return SEVERITY_WEIGHT[finding?.severity] ?? 1;
  };

  let weightTotal = 0;
  let weightMatched = 0;
  let diagnosticsTotal = 0;
  let anchoredTotal = 0;
  let forbiddenTotal = 0;
  let expectedTotal = 0;
  let matchedTotal = 0;
  let usedTotal = 0;
  const attributionTotals = { criteria_not_injected: 0, not_located: 0, not_expressed: 0 };
  const empties = [];

  for (const result of results) {
    const entry = entryById.get(result.id);
    expectedTotal += result.expected;
    matchedTotal += result.matched;
    diagnosticsTotal += result.diagnostics;
    usedTotal += result.usedPredictions ?? 0;
    for (const [key, value] of Object.entries(result.missedAttribution ?? {})) {
      attributionTotals[key] = (attributionTotals[key] ?? 0) + value;
    }
    anchoredTotal += result.anchoredCount;
    forbiddenTotal += result.forbiddenHits.length;
    if (result.empty) empties.push(result.id);
    for (const claim of result.matchedClaims) weightMatched += weightOf(entry, claim);
    for (const finding of entry.expectedFindings) weightTotal += SEVERITY_WEIGHT[finding.severity] ?? 1;
  }

  const pct = (numerator, denominator) => (denominator === 0 ? null : (numerator / denominator) * 100);

  return {
    conclusionAccuracy: pct(weightMatched, weightTotal),
    recall: pct(matchedTotal, expectedTotal),
    // 精确率：对上的诊断 / 全部诊断。模型多报废话会被这里扣分——
    // 之前只算召回，"说得多但说不对"零成本。
    precision: pct(usedTotal, diagnosticsTotal),
    missedAttribution: attributionTotals,
    traceabilityRate: pct(anchoredTotal, diagnosticsTotal),
    hallucinationRate: pct(diagnosticsTotal - anchoredTotal, diagnosticsTotal),
    confidenceHits: forbiddenTotal,
    emptyCases: empties,
    counts: { cases: results.length, expectedTotal, matchedTotal, diagnosticsTotal, anchoredTotal },
  };
}

// ---------------------------------------------------------------- main
const env = await readEnvFile();
const apiKey = LIVE ? (env.DEEPSEEK_API_KEY ?? "") : "";
if (LIVE && !apiKey) {
  console.error("--live requested but DEEPSEEK_API_KEY is not set (.env.local). Aborting rather than silently scoring fixtures.");
  process.exit(2);
}

const cases = await loadCases();
const config = {
  apiKey,
  baseUrl: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
  model: env.DEEPSEEK_MODEL ?? "deepseek-chat",
  timeoutMs: 90_000,
  maxInputChars: 24_000,
};

const startedAt = new Date().toISOString();
const slots = new Array(cases.length);
const entryById = new Map(cases.map((entry) => [entry.id, entry]));

async function runOne(entry, index) {
  const sourceKind = entry.sourceKind ?? detectLiterarySourceKind(entry.text);
  const input = {
    task: "analysis-v2",
    project: {
      title: entry.title,
      genre: "评测样本",
      logline: "",
      activeChapterId: "eval-chapter",
      contextRevision: 1,
      chapters: [{ id: "eval-chapter", title: entry.title, content: entry.text, wordCount: entry.text.length, summary: "", order: 0 }],
      characters: [],
      worldEntries: [],
      blueprint: [],
    },
    input: {
      sourceText: entry.text,
      sourceKind,
      prompt: "对这段文本做完整的、可定位的文学诊断。",
    },
  };

  let envelope;
  let parsedForEval;
  try {
    envelope = await runAiTask(input, config, fetch, LIVE ? { onParsedForEval: parsed => { parsedForEval = parsed; } } : {});
  } catch (error) {
    slots[index] = { ...scoreCase(entry, []), error: String(error) };
    process.stdout.write(`  ${entry.id}  ERROR ${error}\n`);
    return;
  }

  const diagnostics = envelope.result?.diagnostics ?? [];
  const scored = scoreCase(entry, diagnostics);
  scored.mode = envelope.mode;
  scored.warnings = envelope.warnings ?? [];

  if (EMIT_FIXTURES && parsedForEval !== undefined) {
    // 夹具文件名自带正文指纹，正文一改旧夹具自动作废
    const name = `${entry.id}-${goldenHash(entry.text)}-p${CRITERIA_PROTOCOL}.json`;
    await mkdir(FIXTURES_DIR, { recursive: true });
    const serialized = JSON.stringify(parsedForEval, null, 2);
    await writeFile(path.join(FIXTURES_DIR, name), (apiKey ? serialized.replaceAll(apiKey, "[REDACTED]") : serialized) + "\n", "utf8");
    scored.fixtureFile = `evals/fixtures/raw/${name}`;
  }

  // 落盘所有样本的原始返回，而不只是回退的：
  // 离线回放要做「回归门禁」，就必须能复算**通过的**样本，否则只能回放失败样本，
  // 无法证明修好的地方没被改坏。
  if (LIVE && parsedForEval !== undefined && /^GC_\d+$/.test(entry.id)) {
    // 文件名带协议版本戳：-p1 表示「诊断必须回填 criteriaIds」这一版规则。
    // 没有 -p1 的历史文件是旧协议产物，回放时要按旧口径断言，
    // 否则拿旧尺子量新标准，只会得到一个假的「全线回归」。
    const rawFile = `raw-${entry.id}-${startedAt.replace(/[:.]/g, "-")}-p${CRITERIA_PROTOCOL}.json`;
    const raw = JSON.stringify(parsedForEval, (key, value) => /^(?:authorization|api[_-]?key|password|secret|access[_-]?token)$/i.test(key) ? "[REDACTED]" : value, 2);
    await mkdir(RUNS_DIR, { recursive: true });
    await writeFile(path.join(RUNS_DIR, rawFile), (apiKey ? raw.replaceAll(apiKey, "[REDACTED]") : raw) + "\n", { flag: "wx" });
    scored.rawFile = rawFile;
  }
  slots[index] = scored;
  const flag = scored.empty ? " EMPTY" : "";
  process.stdout.write(
    `  ${entry.id}  mode=${envelope.mode}  diag=${scored.diagnostics}  matched=${scored.matched}/${scored.expected}${flag}\n`,
  );
}

// 限量并发的 worker 池：函数本身仍是「一条一个请求」，只是同时开几路。
const queue = cases.map((entry, index) => ({ entry, index }));
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    let job;
    while ((job = queue.shift()) !== undefined) await runOne(job.entry, job.index);
  }),
);
// 回填顺序 = 样本声明顺序，与串行跑完全一致。
const results = slots.filter((value) => value !== undefined);

const summary = aggregate(results, entryById);

// ---------------------------------------------------------------- report
const modes = [...new Set(results.map((r) => r.mode).filter(Boolean))];
const report = {
  ranAt: startedAt,
  mode: LIVE ? "live" : "offline",
  scoringModeWarning:
    modes.some((m) => m === "demo")
      ? "This run produced demo fallbacks. Those cases measure the deterministic fallback, not the model."
      : null,
  config: {
    criteriaProtocol: CRITERIA_PROTOCOL,
    provider: "deepseek",
    model: config.model,
    baseUrl: config.baseUrl,
    promptVersion: "taskInstructions@src/lib/ai/tasks.ts",
    retrieval: "server-side keyword/vector hybrid, client-supplied evidence dropped",
    goldenSetVersion: `${cases.length} cases`,
    // 正文指纹汇总：换了样本、改了正文，这一串一定变，分数是否可比一眼能看出来
    goldenSetFingerprint: createHash("sha1").update(cases.map((c) => `${c.id}:${goldenHash(c.text)}`).join(",")).digest("hex").slice(0, 12),
    criteriaVersion: CRITERIA_VERSION,
    criteriaIdsInjected: injectedCriteriaIds(),
  },
  summary,
  cases: results,
};

await mkdir(RUNS_DIR, { recursive: true });
const filename = outName ?? `${startedAt.replace(/[:.]/g, "-")}_${LIVE ? "live" : "offline"}.json`;
const outPath = path.resolve(ROOT, filename.startsWith("evals/") || path.isAbsolute(filename) ? filename : path.join("evals", "runs", filename));
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

// ---------------------------------------------------------------- console summary
const fmt = (value) => (value === null ? "  n/a" : `${value.toFixed(1)}%`.padStart(6));
console.log("");
console.log(`mode: ${report.mode}${report.mode === "offline" ? "   (pipeline check — NOT a model score)" : ""}`);
console.log(`cases: ${summary.counts.cases}   expected findings: ${summary.counts.expectedTotal}`);
console.log("");
console.log(`  结论准确率 (severity-weighted)  ${fmt(summary.conclusionAccuracy)}`);
console.log(`  覆盖率     (recall of findings)  ${fmt(summary.recall)}`);
console.log(`  精确率     (对上的诊断占比)       ${fmt(summary.precision)}`);
console.log(`  证据可溯源率                     ${fmt(summary.traceabilityRate)}`);
console.log(`  幻觉率                            ${fmt(summary.hallucinationRate)}`);
console.log("");
console.log(`  forbidden-claim hits: ${summary.confidenceHits}`);
console.log(`  漏报归因：知识库未注入 ${summary.missedAttribution.criteria_not_injected} · 未定位到位置 ${summary.missedAttribution.not_located} · 定位到但没说 ${summary.missedAttribution.not_expressed}`);
if (summary.emptyCases.length) console.log(`  EMPTY cases (no diagnostics at all): ${summary.emptyCases.join(", ")}`);
if (report.scoringModeWarning) console.log(`  ! ${report.scoringModeWarning}`);
console.log("");
console.log(`report → ${path.relative(ROOT, outPath)}`);

// ---------------------------------------------------------------- regression gate
// A previous baseline is compared when present. Dropping more than 3 points on
// the headline metric fails the run, per evals/golden/schema.md §5.
const baselinePath = path.join(RUNS_DIR, "baseline.json");
try {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  if (baseline.mode === report.mode && baseline.summary.conclusionAccuracy !== null && summary.conclusionAccuracy !== null) {
    const delta = summary.conclusionAccuracy - baseline.summary.conclusionAccuracy;
    console.log(`delta vs baseline.json: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pt`);
    if (delta < -3) {
      console.error(`REGRESSION: conclusion accuracy dropped ${Math.abs(delta).toFixed(1)} points against baseline.`);
      process.exit(1);
    }
  } else if (baseline.mode !== report.mode) {
    console.log(`baseline.json is a ${baseline.mode} run — not comparable to this ${report.mode} run.`);
  }
} catch {
  console.log("no comparable baseline yet — this run is the reference point.");
}

if (summary.emptyCases.length === results.length) {
  console.error("ALL cases returned zero diagnostics. The run is not informative; treat as failure.");
  process.exit(1);
}
