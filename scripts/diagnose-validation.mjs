#!/usr/bin/env node
// Classifies WHY analysis-v2 payloads fail validation, across golden cases.
// Output: one row per case with the first structural mismatch found.
// Read-only diagnostic; not part of verify.

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";

const ROOT = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(ROOT, "src") }, interopDefault: true });
const { buildAiContextPacketFromStoryContext } = await jiti.import(path.join(ROOT, "src/lib/ai/context.ts"));
const { validateTaskPayload } = await jiti.import(path.join(ROOT, "src/lib/ai/validation.ts"));
const { retrieveKnowledge } = await jiti.import(path.join(ROOT, "src/lib/ai/retrieval.ts"));

const raw = (await readFile(path.join(ROOT, ".env.local"), "utf8")).replace(/\r\n?/g, "\n");
const env = {};
for (const line of raw.split("\n")) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}

const TASK_INSTRUCTION = process.argv.includes("--with-shape-spec")
  ? `返回 LiteraryAnalysisResult，字段形状必须严格如下：
- sourceKind: "narrative" | "argumentative"
- evidence: AiEvidence[]，每项 { id, source: "observation"|"knowledge"|"inference", quote?, claim?, note }。source=observation 时 quote 必须逐字取自用户原文；source=knowledge 时须带 retrievalId 且 quote 出现在该检索块内；source=inference 时只填 claim 不填 quote。
- analysis: AnalysisDimension[]（**必须是数组**），每项 { id, name, summary, impact, suggestion, score(0-100), evidenceIds: string[] }
- diagnostics: LiteraryDiagnostic[]（**必须是数组**），每项 { id, location, quote(逐字原文), effect, action, confidence(0-1), evidenceIds: string[] }
- relationGraph: { nodes: [{ id, label, type, evidenceIds }], edges: [{ id, source, target, label, evidenceIds }] }
- paceCurve / emotionCurve: [{ segment, value(0-100), evidenceId }]
- themeHeatmap: [{ theme, segment, value(0-100), evidenceId }]
- styleProfile: { metrics: [6 项，key 分别为 sentenceLength/dialogueRatio/sensoryDensity/rhetoric/narrativeDistance/rhythm，各含 dimension/value/interpretation/evidenceIds] }
- domainAnalysis: narrative 时含 characters.goals/actions/relationshipChanges、plot.turningPoints/setups/payoffs、themes.stages
- retrievalEvidence: 原样回传输入中给出的检索证据数组
所有 evidenceIds 必须指向 source=observation 的 evidence id。只返回 JSON。`
  : `返回 LiteraryAnalysisResult：sourceKind、domainAnalysis、analysis、evidence、relationGraph、paceCurve、emotionCurve、themeHeatmap、styleProfile、diagnostics、retrievalEvidence。narrative 的 domainAnalysis 必含 characters.goals/actions/relationshipChanges、plot.turningPoints/setups/payoffs、themes.stages（含 change/reason）。styleProfile.metrics 必须各含一次 key=sentenceLength/dialogueRatio/sensoryDensity/rhetoric/narrativeDistance/rhythm，并含 interpretation。所有图节点/边、曲线、热力、style 与 domainAnalysis evidenceId 必须至少引用本次 source 的 observation evidence，禁止仅引用 inference/knowledge。只返回 JSON。`;

/** Find the first field whose runtime shape contradicts the contract. */
function classifyShape(payload) {
  const issues = [];
  const isArr = (v) => Array.isArray(v);
  if (!isArr(payload.analysis)) issues.push(`analysis is ${typeof payload.analysis}, expected array`);
  if (!isArr(payload.diagnostics)) issues.push(`diagnostics is ${typeof payload.diagnostics}, expected array`);
  if (!isArr(payload.evidence)) issues.push(`evidence is ${typeof payload.evidence}, expected array`);
  if (!Array.isArray(payload.relationGraph?.nodes)) issues.push("relationGraph.nodes missing");
  if (!isArr(payload.paceCurve)) issues.push(`paceCurve is ${typeof payload.paceCurve}, expected array`);
  if (!isArr(payload.emotionCurve)) issues.push(`emotionCurve is ${typeof payload.emotionCurve}, expected array`);
  if (!isArr(payload.themeHeatmap)) issues.push(`themeHeatmap is ${typeof payload.themeHeatmap}, expected array`);
  if (!isArr(payload.styleProfile?.metrics)) issues.push("styleProfile.metrics missing");
  return issues;
}

/** For array-shaped fields, find which sub-field breaks. */
function classifyContent(payload, sourceText) {
  const issues = [];
  for (const item of payload.evidence ?? []) {
    if (item.source === "observation" && !sourceText.includes(item.quote ?? "")) {
      issues.push(`evidence ${item.id}: quote not verbatim`);
    }
  }
  const observationIds = new Set((payload.evidence ?? []).filter((e) => e.source === "observation").map((e) => e.id));
  for (const item of payload.diagnostics ?? []) {
    const ids = item.evidenceIds ?? [];
    if (!ids.some((id) => observationIds.has(id))) issues.push(`diagnostic ${item.id}: no observation evidenceId`);
    if (!sourceText.includes(item.quote ?? "")) issues.push(`diagnostic ${item.id}: quote not verbatim`);
  }
  if (payload.sourceKind === "narrative") {
    const hasSetup = (payload.diagnostics ?? []).some((d) => /(铺垫.*不足|不足.*铺垫)/.test(`${d.effect ?? ""} ${d.action ?? ""}`));
    if (!hasSetup) issues.push("no 铺垫不足 diagnostic (validator requires one for narrative)");
  }
  return issues;
}

async function runCase(file) {
  const entry = JSON.parse(await readFile(path.join(ROOT, "evals", "golden", file), "utf8"));
  const project = {
    title: entry.title,
    genre: "评测样本",
    logline: "",
    activeChapterId: "eval-chapter",
    contextRevision: 1,
    chapters: [{ id: "eval-chapter", title: entry.title, content: entry.text, wordCount: entry.text.length, summary: "", order: 0 }],
    characters: [],
    worldEntries: [],
    blueprint: [],
  };
  const retrieval = await retrieveKnowledge({ query: entry.text.slice(0, 2000), limit: 5 });
  const packet = buildAiContextPacketFromStoryContext(project, {
    instruction: "对这段文本做完整的、可定位的文学诊断。",
    maxCharacters: 24_000,
    retrievalEvidence: retrieval.evidence,
  });

  const response = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL,
      temperature: 0.7,
      max_tokens: Number(process.env.MAXTOK ?? 5000),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `你是中文文学创作协作者。${TASK_INSTRUCTION}` },
        { role: "user", content: JSON.stringify({ task: "analysis-v2", context: packet, input: { sourceText: entry.text, sourceKind: entry.sourceKind, prompt: "对这段文本做完整的、可定位的文学诊断。" } }) },
      ],
    }),
  });
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "";
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    // fall through
  }
  if (!parsed) return { id: entry.id, status: response.status, verdict: "UNPARSEABLE", issues: [`finish=${payload.choices?.[0]?.finish_reason}`] };

  await writeFile(path.join(ROOT, "evals", "runs", `raw-${entry.id}${process.argv.includes("--with-shape-spec") ? "-shapespec" : ""}.json`), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  const shape = classifyShape(parsed);
  if (shape.length) return { id: entry.id, status: response.status, verdict: "SHAPE_MISMATCH", issues: shape };

  const content_ = classifyContent(parsed, entry.text);
  const validated = validateTaskPayload("analysis-v2", parsed, project, "live", {
    sourceText: entry.text,
    retrievalEvidence: retrieval.evidence,
    expectedSourceKind: entry.sourceKind,
  });
  return { id: entry.id, status: response.status, verdict: validated ? "PASS" : "CONTENT_REJECT", issues: content_ };
}

const files = (await readdir(path.join(ROOT, "evals", "golden"))).filter((n) => /^GC_\d+\.json$/.test(n)).sort();
const limit = Number(process.env.EVAL_LIMIT ?? 6);
const rows = [];
for (const file of files.slice(0, limit)) {
  try {
    const row = await runCase(file);
    rows.push(row);
    console.log(`${row.id}  ${row.verdict}${row.issues.length ? "  :: " + row.issues.slice(0, 3).join(" | ") : ""}`);
  } catch (error) {
    console.log(`${file}  ERROR ${error.message}`);
  }
}

const tally = rows.reduce((acc, row) => ({ ...acc, [row.verdict]: (acc[row.verdict] ?? 0) + 1 }), {});
console.log("\ntally:", JSON.stringify(tally));
const issueTally = {};
for (const row of rows) for (const issue of row.issues) {
  const key = issue.replace(/\b(GC_\d+|obs_\d+|d\d+|ev\d+)\b/g, "<id>").replace(/: quote not verbatim/, ": quote not verbatim");
  issueTally[key] = (issueTally[key] ?? 0) + 1;
}
console.log("\nrecurring issues:");
for (const [issue, count] of Object.entries(issueTally).sort((a, b) => b[1] - a[1])) console.log(`  ${count}x  ${issue}`);
