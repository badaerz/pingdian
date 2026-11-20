#!/usr/bin/env node
// Diagnostic: call the provider directly and report WHERE analysis-v2 validation fails.
// Not part of verify; a debugging aid for the evidence-discipline work.

import { readFile, writeFile } from "node:fs/promises";
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

const caseFile = process.argv[2] ?? "GC_003";
const entry = JSON.parse(await readFile(path.join(ROOT, "evals", "golden", `${caseFile}.json`), "utf8"));

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
console.log(`retrieval: mode=${retrieval.mode} evidence=${retrieval.evidence.length}`);
for (const item of retrieval.evidence) console.log(`  ${item.retrievalId} [${item.chunkType}] ${item.quote.slice(0, 50)}`);

const packet = buildAiContextPacketFromStoryContext(project, {
  instruction: "对这段文本做完整的、可定位的文学诊断。",
  maxCharacters: 24_000,
  retrievalEvidence: retrieval.evidence,
});

const taskInstruction = `返回 LiteraryAnalysisResult：sourceKind、domainAnalysis、analysis、evidence、relationGraph、paceCurve、emotionCurve、themeHeatmap、styleProfile、diagnostics、retrievalEvidence。narrative 的 domainAnalysis 必含 characters.goals/actions/relationshipChanges、plot.turningPoints/setups/payoffs、themes.stages（含 change/reason）；argumentative 改为 argument.claims/evidenceUnits/reasoningSteps 与 themes.stages，不得使用人物叙事节点。styleProfile.metrics 必须各含一次 key=sentenceLength/dialogueRatio/sensoryDensity/rhetoric/narrativeDistance/rhythm，并含 interpretation。所有图节点/边、曲线、热力、style 与 domainAnalysis evidenceId 必须至少引用本次 source 的 observation evidence，禁止仅引用 inference/knowledge。`;

const response = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
  body: JSON.stringify({
    model: env.DEEPSEEK_MODEL,
    temperature: 0.7,
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `你是中文文学创作协作者。${taskInstruction}只返回 JSON。` },
      { role: "user", content: JSON.stringify({ task: "analysis-v2", context: packet, input: { sourceText: entry.text, sourceKind: entry.sourceKind, prompt: "对这段文本做完整的、可定位的文学诊断。" } }) },
    ],
  }),
});

const payload = await response.json();
const content = payload.choices?.[0]?.message?.content ?? "";
console.log(`\nprovider status: ${response.status}  finish: ${payload.choices?.[0]?.finish_reason}  chars: ${content.length}`);
console.log(`usage: ${JSON.stringify(payload.usage)}`);

const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
let parsed = null;
try {
  parsed = JSON.parse(cleaned);
} catch {
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // ignore
    }
  }
}
if (!parsed) {
  console.log("\nMODEL DID NOT RETURN PARSEABLE JSON. First 800 chars:\n");
  console.log(content.slice(0, 800));
  await writeFile(path.join(ROOT, "evals", "runs", `raw-${caseFile}.txt`), content, "utf8");
  process.exit(1);
}

await writeFile(path.join(ROOT, "evals", "runs", `raw-${caseFile}.json`), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

console.log(`\nparsed keys: ${Object.keys(parsed).join(", ")}`);
console.log(`  evidence: ${parsed.evidence?.length ?? "MISSING"} items`);
console.log(`  diagnostics: ${parsed.diagnostics?.length ?? "MISSING"} items`);
console.log(`  analysis: ${parsed.analysis?.length ?? "MISSING"}`);
console.log(`  relationGraph nodes/edges: ${parsed.relationGraph?.nodes?.length ?? "-"}/${parsed.relationGraph?.edges?.length ?? "-"}`);
console.log(`  paceCurve: ${parsed.paceCurve?.length ?? "MISSING"}  emotionCurve: ${parsed.emotionCurve?.length ?? "MISSING"}`);
console.log(`  themeHeatmap: ${parsed.themeHeatmap?.length ?? "MISSING"}  styleMetrics: ${parsed.styleProfile?.metrics?.length ?? "MISSING"}`);
console.log(`  retrievalEvidence: ${parsed.retrievalEvidence?.length ?? "MISSING"}`);

const context = {
  sourceText: entry.text,
  answer: undefined,
  candidate: undefined,
  retrievalEvidence: retrieval.evidence,
  expectedSourceKind: entry.sourceKind,
};

const validated = validateTaskPayload("analysis-v2", parsed, project, "live", context);
console.log(`\nvalidateTaskPayload => ${validated ? "PASS" : "FAIL (whole payload discarded)"}`);

if (!validated) {
  // Bisect: which top-level piece is rejected?
  const probe = (name, mutate) => {
    const copy = JSON.parse(JSON.stringify(parsed));
    mutate(copy);
    const result = validateTaskPayload("analysis-v2", copy, project, "live", context);
    console.log(`  without ${name}: ${result ? "PASS  <-- this field is the culprit" : "still FAIL"}`);
  };
  probe("diagnostics", (c) => {
    c.diagnostics = [c.diagnostics?.[0]].filter(Boolean);
  });
  probe("relationGraph", (c) => {
    delete c.relationGraph;
  });
  probe("themeHeatmap", (c) => {
    delete c.themeHeatmap;
  });
  probe("styleProfile", (c) => {
    delete c.styleProfile;
  });
  probe("domainAnalysis", (c) => {
    delete c.domainAnalysis;
  });
  probe("paceCurve/emotionCurve", (c) => {
    c.paceCurve = [];
    c.emotionCurve = [];
  });

  // Per-diagnostic check: does any single diagnostic survive?
  if (Array.isArray(parsed.diagnostics)) {
    console.log("\n  per-diagnostic trial:");
    for (const [index, diagnostic] of parsed.diagnostics.entries()) {
      const copy = JSON.parse(JSON.stringify(parsed));
      copy.diagnostics = [diagnostic];
      const result = validateTaskPayload("analysis-v2", copy, project, "live", context);
      const quote = diagnostic.quote ?? "";
      const anchored = entry.text.includes(quote);
      console.log(`    #${index} id=${diagnostic.id} quoteAnchored=${anchored} evidenceIds=${JSON.stringify(diagnostic.evidenceIds)} => ${result ? "PASS" : "FAIL"}`);
    }
  }
}
