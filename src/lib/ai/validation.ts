import type { AiTask, AiTaskPayload, StoryContext } from "@/lib/ai/tasks";
import { resolveAiSourceText } from "@/lib/ai/story-context";
import { TRAINING_FEEDBACK_DIMENSIONS, type AiEvidence, type AnalysisDimension, type BlueprintNode, type Candidate, type Character, type ConsistencyFinding, type Evidence, type GraphEdge, type GraphNode, type ImageGenerationSettings, type KnowledgeGraph, type LiteraryAnalysisResult, type LiteraryDomainAnalysis, type LiteraryDomainFinding, type LiterarySourceKind, type LiteraryThemeStage, type MentorResponse, type RetrievalEvidence, type StoryState, type TrainingFeedbackResult, type WorldEntry } from "@/lib/types";

export interface PayloadEvidenceContext {
  sourceText?: string;
  evidenceText?: string;
  answer?: string;
  candidate?: { id: string; text: string; revision: number };
  retrievalEvidence?: RetrievalEvidence[];
  expectedSourceKind?: LiterarySourceKind;
}

const STORY_DIRECTION_TAGS = new Set(["跌宕起伏", "轻松日常", "推进冲突", "深化人物关系", "埋设悬念", "强化情感"]);
const TRAINING_FEEDBACK_DIMENSION_SET = new Set<string>(TRAINING_FEEDBACK_DIMENSIONS);
const GRAPH_NODE_TYPES = new Set(["work", "author", "era", "theme", "technique", "character", "place", "event", "image", "concept", "argument", "evidence"]);
const ARGUMENTATIVE_GRAPH_NODE_TYPES = new Set<GraphNode["type"]>(["work", "author", "era", "theme", "technique", "concept", "argument", "evidence"]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max = 8_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function textList(value: unknown, maximum: number, allowEmpty = true): string[] | null {
  if (!Array.isArray(value) || value.length > maximum || (!allowEmpty && value.length === 0) || !value.every((item) => text(item, 2_000))) return null;
  return value.map((item) => item.trim());
}

function uniqueTexts(value: unknown, maximum: number, allowEmpty = true): string[] | null {
  const values = textList(value, maximum, allowEmpty);
  return values && new Set(values).size === values.length ? values : null;
}

function evidenceContext(value: PayloadEvidenceContext | string | undefined): PayloadEvidenceContext {
  return typeof value === "string" ? { evidenceText: value } : value ?? {};
}

function userTexts(context: StoryContext, evidence: PayloadEvidenceContext) {
  const activeChapter = context.chapters.find((chapter) => chapter.id === context.activeChapterId)?.content;
  const source = resolveAiSourceText(evidence, activeChapter);
  return source ? [source] : [];
}

function projectTexts(context: StoryContext, evidence: PayloadEvidenceContext) {
  return [...userTexts(context, evidence), ...context.chapters.flatMap((chapter) => [chapter.content, chapter.summary])];
}

function lockedFacts(context: StoryContext) {
  return [
    ...context.characters.filter((item) => item.locked).flatMap((item) => [item.name, item.role, item.desire, item.flaw, item.arc, item.fear, item.notes]),
    ...context.worldEntries.filter((item) => item.locked).flatMap((item) => [item.category, item.label, item.content]),
    ...context.blueprint.filter((item) => item.locked).flatMap((item) => [item.beatType, item.title, item.summary]),
  ].filter((value) => value.trim().length > 0);
}

function exactQuoteExists(quote: string, sources: string[]) {
  return sources.some((source) => source.includes(quote));
}

function isSourceKind(value: unknown): value is LiterarySourceKind {
  return value === "narrative" || value === "argumentative";
}

function isConsistencyCategory(value: unknown): value is ConsistencyFinding["category"] {
  return value === "character" || value === "world" || value === "plot" || value === "timeline";
}

function isConsistencySeverity(value: unknown): value is ConsistencyFinding["severity"] {
  return value === "low" || value === "medium" || value === "high";
}

function isEvidenceSource(value: unknown): value is Evidence["source"] {
  return value === "user" || value === "knowledge" || value === "inference";
}

function isGraphNodeType(value: unknown): value is GraphNode["type"] {
  return typeof value === "string" && GRAPH_NODE_TYPES.has(value);
}

function readCandidates(value: unknown, context: StoryContext, mode: "live" | "demo", task: AiTask): Candidate[] | null {
  if (!record(value) || !Array.isArray(value.candidates) || value.candidates.length < 2 || value.candidates.length > 3) return null;
  const result = value.candidates.map((item, index) => {
    if (!record(item) || !text(item.content, 8_000)) return null;
    return {
      id: `live-${index + 1}-${crypto.randomUUID()}`,
      label: text(item.label, 120) ? item.label.trim() : `候选 ${index + 1}`,
      content: item.content.trim(),
      rationale: text(item.rationale, 1_000) ? item.rationale.trim() : "根据当前作品上下文生成。",
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => text(tag, 40)).slice(0, 4) : [],
      status: "pending" as const,
      target: { type: "chapter" as const, id: context.activeChapterId },
      applyMode: task === "continue" || task === "ideas" || task === "opening" || task === "prose" ? "append" as const : "replace-selection" as const,
      generatedRevision: context.contextRevision,
      mode,
    };
  });
  return result.every(Boolean) ? result as Candidate[] : null;
}

function readCharacters(value: unknown, context: StoryContext): Character[] | null {
  if (!record(value) || !Array.isArray(value.characters) || !value.characters.length || value.characters.length > 50) return null;
  const currentById = new Map(context.characters.map((item) => [item.id, item]));
  const result = value.characters.map((item, index) => {
    if (!record(item)) return null;
    const current = (text(item.id, 120) ? currentById.get(item.id) : undefined) ?? context.characters[index];
    if (!text(item.name, 120) && !current?.name) return null;
    return {
      id: current?.id ?? (text(item.id, 120) ? item.id : `character-${index + 1}`),
      name: text(item.name, 120) ? item.name.trim() : current!.name,
      role: text(item.role, 500) ? item.role : current?.role ?? "待补充",
      desire: text(item.desire, 2_000) ? item.desire : current?.desire ?? "",
      flaw: text(item.flaw, 2_000) ? item.flaw : current?.flaw ?? "",
      arc: text(item.arc, 2_000) ? item.arc : current?.arc ?? "",
      fear: text(item.fear, 2_000) ? item.fear : current?.fear ?? "",
      notes: text(item.notes, 2_000) ? item.notes : current?.notes ?? "",
      locked: current?.locked ?? Boolean(item.locked),
      order: index,
    };
  });
  return result.every(Boolean) ? result as Character[] : null;
}

function readWorldEntries(value: unknown, context: StoryContext): WorldEntry[] | null {
  if (!record(value)) return null;
  if (Array.isArray(value.worldEntries)) {
    if (!value.worldEntries.length || value.worldEntries.length > 100) return null;
    const currentById = new Map(context.worldEntries.map((item) => [item.id, item]));
    const entries = value.worldEntries.map((item, index) => {
      if (!record(item)) return null;
      const current = (text(item.id, 120) ? currentById.get(item.id) : undefined) ?? context.worldEntries[index];
      const content = text(item.content, 4_000) ? item.content : current?.content;
      if (!content) return null;
      return {
        ...(current ?? {}),
        id: current?.id ?? (text(item.id, 120) ? item.id : `world-${index + 1}`),
        category: text(item.category, 120) ? item.category : current?.category ?? "自定义",
        label: text(item.label, 120) ? item.label : current?.label ?? `设定 ${index + 1}`,
        content,
        locked: current?.locked ?? Boolean(item.locked),
        order: index,
      };
    });
    return entries.every(Boolean) ? entries as WorldEntry[] : null;
  }
  if (!record(value.world)) return null;
  const world = value.world;
  return [
    { ...(context.worldEntries[0] ?? {}), id: context.worldEntries[0]?.id ?? "world-era", category: context.worldEntries[0]?.category ?? "时代", label: context.worldEntries[0]?.label ?? "时间", content: typeof world.era === "string" && world.era.trim() ? world.era : context.worldEntries[0]?.content ?? "", locked: context.worldEntries[0]?.locked ?? false, order: 0 },
    { ...(context.worldEntries[1] ?? {}), id: context.worldEntries[1]?.id ?? "world-place", category: context.worldEntries[1]?.category ?? "地点", label: context.worldEntries[1]?.label ?? "地点", content: typeof world.place === "string" && world.place.trim() ? world.place : context.worldEntries[1]?.content ?? "", locked: context.worldEntries[1]?.locked ?? false, order: 1 },
    { ...(context.worldEntries[2] ?? {}), id: context.worldEntries[2]?.id ?? "world-rules", category: context.worldEntries[2]?.category ?? "规则", label: context.worldEntries[2]?.label ?? "核心规则", content: typeof world.rules === "string" && world.rules.trim() ? world.rules : context.worldEntries[2]?.content ?? "", locked: context.worldEntries[2]?.locked ?? false, order: 2 },
    { ...(context.worldEntries[3] ?? {}), id: context.worldEntries[3]?.id ?? "world-atmosphere", category: context.worldEntries[3]?.category ?? "氛围", label: context.worldEntries[3]?.label ?? "氛围", content: typeof world.atmosphere === "string" && world.atmosphere.trim() ? world.atmosphere : context.worldEntries[3]?.content ?? "", locked: context.worldEntries[3]?.locked ?? false, order: 3 },
  ];
}

function readBlueprint(value: unknown, context: StoryContext): BlueprintNode[] | null {
  if (!record(value) || !Array.isArray(value.blueprint) || !value.blueprint.length || value.blueprint.length > 100) return null;
  const currentById = new Map(context.blueprint.map((item) => [item.id, item]));
  const result = value.blueprint.map((item, index) => {
    if (!record(item)) return null;
    const current = (text(item.id, 120) ? currentById.get(item.id) : undefined) ?? context.blueprint[index];
    const title = text(item.title, 200) ? item.title : current?.title;
    if (!title) return null;
    return { id: current?.id ?? (text(item.id, 120) ? item.id : `blueprint-${index + 1}`), title, beatType: text(item.beatType, 120) ? item.beatType : current?.beatType ?? title, summary: text(item.summary, 4_000) ? item.summary : current?.summary ?? "", active: item.active === undefined ? current?.active ?? false : Boolean(item.active), locked: current?.locked ?? Boolean(item.locked), order: index };
  });
  return result.every(Boolean) ? result as BlueprintNode[] : null;
}

function readEvidence(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext): AiEvidence[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null;
  const sources = userTexts(context, evidenceValue);
  const retrievalById = new Map((evidenceValue.retrievalEvidence ?? []).map((item) => [item.retrievalId, item]));
  const result = value.map((item) => {
    if (!record(item) || !text(item.id, 120) || !text(item.note, 2_000)) return null;
    if (item.source === "observation" || item.source === "user") {
      if (!text(item.quote, 2_000) || !exactQuoteExists(item.quote, sources)) return null;
      return { id: item.id, source: item.source, quote: item.quote, note: item.note } as AiEvidence;
    }
    if (item.source === "knowledge") {
      if (!text(item.quote, 2_000) || !text(item.retrievalId, 200)) return null;
      const retrieval = retrievalById.get(item.retrievalId);
      if (!retrieval || (!retrieval.content.includes(item.quote) && !retrieval.quote.includes(item.quote))) return null;
      return { id: item.id, source: "knowledge", quote: item.quote, retrievalId: item.retrievalId, note: item.note } as AiEvidence;
    }
    if (item.source === "inference") {
      if (text(item.quote, 2_000) || !text(item.claim, 2_000)) return null;
      return { id: item.id, source: "inference", claim: item.claim, note: item.note } as AiEvidence;
    }
    return null;
  });
  if (!result.every(Boolean)) return null;
  const ids = result.map((item) => item!.id);
  return new Set(ids).size === ids.length ? result as AiEvidence[] : null;
}

function readEvidenceIds(value: unknown, knownEvidence: Set<string>, maximum = 20): string[] | null {
  const ids = uniqueTexts(value, maximum, false);
  return ids && ids.every((id) => knownEvidence.has(id)) ? ids : null;
}

function readObservationEvidenceIds(value: unknown, observationEvidence: Set<string>, maximum = 20): string[] | null {
  return readEvidenceIds(value, observationEvidence, maximum);
}

function readGraph(value: unknown, observationEvidence: Set<string>, sourceKind?: LiterarySourceKind): KnowledgeGraph | null {
  if (!record(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length === 0 || value.nodes.length > 80 || value.edges.length > 120) return null;
  const nodes = value.nodes.map((item) => {
    if (!record(item) || !text(item.id, 120) || !text(item.label, 300) || !isGraphNodeType(item.type) || (sourceKind === "argumentative" && !ARGUMENTATIVE_GRAPH_NODE_TYPES.has(item.type))) return null;
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds, observationEvidence);
    if (!evidenceIds) return null;
    return { id: item.id, label: item.label, type: item.type, evidenceIds, ...(text(item.era, 300) ? { era: item.era } : {}), ...(text(item.description, 2_000) ? { description: item.description } : {}) } as GraphNode;
  });
  if (!nodes.every(Boolean)) return null;
  const nodeIds = nodes.map((node) => node!.id);
  if (new Set(nodeIds).size !== nodeIds.length) return null;
  const nodeIdSet = new Set(nodeIds);
  const edges = value.edges.map((item) => {
    if (!record(item) || !text(item.id, 120) || !text(item.source, 120) || !text(item.target, 120) || !text(item.label, 300) || !nodeIdSet.has(item.source) || !nodeIdSet.has(item.target)) return null;
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds ?? item.sourceEvidenceIds, observationEvidence);
    if (!evidenceIds || (item.confidence !== undefined && !finiteInRange(item.confidence, 0, 1))) return null;
    return { id: item.id, source: item.source, target: item.target, label: item.label, evidenceIds, ...(item.confidence === undefined ? {} : { confidence: item.confidence }) } as GraphEdge;
  });
  if (!edges.every(Boolean)) return null;
  const edgeIds = edges.map((edge) => edge!.id);
  return new Set(edgeIds).size === edgeIds.length ? { nodes: nodes as GraphNode[], edges: edges as GraphEdge[] } : null;
}

function readAnalysisDimensions(value: unknown, knownEvidence: Set<string>): AnalysisDimension[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return null;
  const result = value.map((item) => {
    if (!record(item) || !text(item.id, 120) || !text(item.name, 200) || !text(item.summary, 2_000) || !text(item.impact, 2_000) || !text(item.suggestion, 2_000) || !finiteInRange(item.score, 0, 100)) return null;
    const evidenceIds = readEvidenceIds(item.evidenceIds, knownEvidence);
    return evidenceIds ? { id: item.id, name: item.name, summary: item.summary, impact: item.impact, suggestion: item.suggestion, score: item.score, evidenceIds } : null;
  });
  if (!result.every(Boolean)) return null;
  const ids = result.map((item) => item!.id);
  return new Set(ids).size === ids.length ? result as AnalysisDimension[] : null;
}

function readCurves(value: unknown, observationEvidence: Set<string>) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 48) return null;
  const points = value.map((item) => record(item) && text(item.segment, 200) && finiteInRange(item.value, 0, 100) && text(item.evidenceId, 120) && observationEvidence.has(item.evidenceId) ? { segment: item.segment, value: item.value, evidenceId: item.evidenceId } : null);
  return points.every(Boolean) ? points as LiteraryAnalysisResult["paceCurve"] : null;
}

function readDomainFindings(value: unknown, observationEvidence: Set<string>): LiteraryDomainFinding[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) return null;
  const findings = value.map((item) => {
    if (!record(item) || !text(item.label, 300) || !text(item.description, 2_000)) return null;
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds, observationEvidence);
    return evidenceIds ? { label: item.label, description: item.description, evidenceIds } : null;
  });
  return findings.every(Boolean) ? findings as LiteraryDomainFinding[] : null;
}

function readThemeStages(value: unknown, observationEvidence: Set<string>): LiteraryThemeStage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) return null;
  const stages = value.map((item) => {
    if (!record(item) || !text(item.stage, 300) || !text(item.theme, 300) || !text(item.change, 2_000) || !text(item.reason, 2_000)) return null;
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds, observationEvidence);
    return evidenceIds ? { stage: item.stage, theme: item.theme, change: item.change, reason: item.reason, evidenceIds } : null;
  });
  return stages.every(Boolean) ? stages as LiteraryThemeStage[] : null;
}

function readDomainAnalysis(value: unknown, sourceKind: LiterarySourceKind, observationEvidence: Set<string>): LiteraryDomainAnalysis | null {
  if (!record(value) || value.kind !== sourceKind || !record(value.themes)) return null;
  const stages = readThemeStages(value.themes.stages, observationEvidence);
  if (!stages) return null;
  if (sourceKind === "narrative") {
    if (!record(value.characters) || !record(value.plot)) return null;
    const goals = readDomainFindings(value.characters.goals, observationEvidence);
    const actions = readDomainFindings(value.characters.actions, observationEvidence);
    const relationshipChanges = readDomainFindings(value.characters.relationshipChanges, observationEvidence);
    const turningPoints = readDomainFindings(value.plot.turningPoints, observationEvidence);
    const setups = readDomainFindings(value.plot.setups, observationEvidence);
    const payoffs = readDomainFindings(value.plot.payoffs, observationEvidence);
    return goals && actions && relationshipChanges && turningPoints && setups && payoffs
      ? { kind: "narrative", characters: { goals, actions, relationshipChanges }, plot: { turningPoints, setups, payoffs }, themes: { stages } }
      : null;
  }
  if (!record(value.argument)) return null;
  const claims = readDomainFindings(value.argument.claims, observationEvidence);
  const evidenceUnits = readDomainFindings(value.argument.evidenceUnits, observationEvidence);
  const reasoningSteps = readDomainFindings(value.argument.reasoningSteps, observationEvidence);
  return claims && evidenceUnits && reasoningSteps
    ? { kind: "argumentative", argument: { claims, evidenceUnits, reasoningSteps }, themes: { stages } }
    : null;
}

function readLiteraryAnalysis(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext): LiteraryAnalysisResult | null {
  if (!record(value)
    || !isSourceKind(value.sourceKind)
    || (evidenceValue.expectedSourceKind !== undefined && value.sourceKind !== evidenceValue.expectedSourceKind)) return null;
  const evidence = readEvidence(value.evidence, context, evidenceValue);
  if (!evidence) return null;
  const knownEvidence = new Set(evidence.map((item) => item.id));
  const observationEvidence = new Set(evidence.filter((item) => item.source === "observation" || item.source === "user").map((item) => item.id));
  if (observationEvidence.size === 0) return null;
  const analysis = readAnalysisDimensions(value.analysis, knownEvidence);
  const domainAnalysis = readDomainAnalysis(value.domainAnalysis, value.sourceKind, observationEvidence);
  const relationGraph = readGraph(value.relationGraph, observationEvidence, value.sourceKind);
  const paceCurve = readCurves(value.paceCurve, observationEvidence);
  const emotionCurve = readCurves(value.emotionCurve, observationEvidence);
  if (!analysis || !domainAnalysis || !relationGraph || relationGraph.edges.length === 0 || !paceCurve || !emotionCurve) return null;
  const dimensionNames = analysis.map((item) => item.name);
  const requiredDomains = value.sourceKind === "narrative"
    ? [/人物/, /情节|结构|节奏/, /主题/, /语言|风格/]
    : [/论证|结构/, /证据/, /主题/, /语言|风格/];
  if (!requiredDomains.every((pattern) => dimensionNames.some((name) => pattern.test(name)))) return null;
  if (!Array.isArray(value.themeHeatmap) || value.themeHeatmap.length === 0 || value.themeHeatmap.length > 120) return null;
  const themeHeatmap = value.themeHeatmap.map((item) => record(item) && text(item.theme, 200) && text(item.segment, 200) && finiteInRange(item.value, 0, 100) && text(item.evidenceId, 120) && observationEvidence.has(item.evidenceId) ? { theme: item.theme, segment: item.segment, value: item.value, evidenceId: item.evidenceId } : null);
  if (!themeHeatmap.every(Boolean) || !record(value.styleProfile) || !Array.isArray(value.styleProfile.metrics) || value.styleProfile.metrics.length === 0 || value.styleProfile.metrics.length > 32) return null;
  const styleKeys = new Set<LiteraryAnalysisResult["styleProfile"]["metrics"][number]["key"]>(["sentenceLength", "dialogueRatio", "sensoryDensity", "rhetoric", "narrativeDistance", "rhythm"]);
  const metrics = value.styleProfile.metrics.map((item) => {
    if (!record(item) || typeof item.key !== "string" || !styleKeys.has(item.key as LiteraryAnalysisResult["styleProfile"]["metrics"][number]["key"]) || !text(item.dimension, 200) || !text(item.interpretation, 2_000)) return null;
    const maximum = item.key === "sentenceLength" ? 200 : 100;
    if (!finiteInRange(item.value, item.key === "sentenceLength" ? 1 : 0, maximum)) return null;
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds, observationEvidence);
    return evidenceIds ? { key: item.key, dimension: item.dimension, value: item.value, interpretation: item.interpretation, ...(text(item.unit, 60) ? { unit: item.unit } : {}), evidenceIds } : null;
  });
  if (new Set(metrics.filter(Boolean).map((item) => item!.key)).size !== styleKeys.size || ![...styleKeys].every((key) => metrics.some((item) => item?.key === key))) return null;
  if (!metrics.every(Boolean) || !Array.isArray(value.diagnostics) || value.diagnostics.length === 0 || value.diagnostics.length > 24) return null;
  const sources = userTexts(context, evidenceValue);
  const diagnostics = value.diagnostics.map((item) => {
    if (!record(item) || !text(item.id, 120) || !text(item.location, 300) || !text(item.quote, 2_000) || !exactQuoteExists(item.quote, sources) || !text(item.effect, 2_000) || !text(item.action, 2_000) || !finiteInRange(item.confidence, 0, 1)) return null;
    const evidenceIds = readEvidenceIds(item.evidenceIds, knownEvidence);
    const hasObservationEvidence = evidenceIds?.some((id) => {
      const linked = evidence.find((entry) => entry.id === id);
      return (linked?.source === "observation" || linked?.source === "user") && Boolean(linked.quote && (linked.quote.includes(item.quote as string) || (item.quote as string).includes(linked.quote)));
    });
    return evidenceIds && hasObservationEvidence ? { id: item.id, location: item.location, quote: item.quote, effect: item.effect, action: item.action, confidence: item.confidence, evidenceIds, ...(text(item.trainingExerciseId, 120) ? { trainingExerciseId: item.trainingExerciseId } : {}) } : null;
  });
  if (!diagnostics.every(Boolean)) return null;
  if (value.sourceKind === "narrative" && !diagnostics.some((item) => item && /(铺垫.*不足|不足.*铺垫)/.test(`${item.effect} ${item.action}`))) return null;
  const diagnosticIds = diagnostics.map((item) => item!.id);
  if (new Set(diagnosticIds).size !== diagnosticIds.length || !Array.isArray(value.retrievalEvidence) || value.retrievalEvidence.length > 8) return null;
  const allowedRetrieval = new Map((evidenceValue.retrievalEvidence ?? []).map((item) => [item.retrievalId, item]));
  const retrievalEvidence = value.retrievalEvidence.map((item) => record(item) && text(item.retrievalId, 200) ? allowedRetrieval.get(item.retrievalId) ?? null : null);
  if (!retrievalEvidence.every(Boolean)) return null;
  return { sourceKind: value.sourceKind, domainAnalysis, analysis, evidence, relationGraph, paceCurve, emotionCurve, themeHeatmap: themeHeatmap as LiteraryAnalysisResult["themeHeatmap"], styleProfile: { metrics: metrics as LiteraryAnalysisResult["styleProfile"]["metrics"] }, diagnostics: diagnostics as LiteraryAnalysisResult["diagnostics"], retrievalEvidence: retrievalEvidence as RetrievalEvidence[] };
}

function readMentor(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext): MentorResponse | null {
  if (!record(value) || !record(value.mentor)) return null;
  const mentor = value.mentor;
  if (!text(mentor.thesis, 2_000) || !Array.isArray(mentor.evidence) || mentor.evidence.length > 20) return null;
  const sources = userTexts(context, evidenceValue);
  const retrievalById = new Map((evidenceValue.retrievalEvidence ?? []).map((item) => [item.retrievalId, item]));
  const evidence = mentor.evidence.map((item) => {
    if (!record(item) || !text(item.quote, 2_000) || (item.source !== "observation" && item.source !== "inference" && item.source !== "knowledge")) return null;
    if (item.source === "observation" && !exactQuoteExists(item.quote, sources)) return null;
    if (item.source === "knowledge") {
      if (!text(item.retrievalId, 200)) return null;
      const retrieval = retrievalById.get(item.retrievalId);
      if (!retrieval || (!retrieval.content.includes(item.quote) && !retrieval.quote.includes(item.quote))) return null;
    }
    return { quote: item.quote, source: item.source, ...(text(item.note, 2_000) ? { note: item.note } : {}), ...(text(item.retrievalId, 200) ? { retrievalId: item.retrievalId } : {}) };
  });
  if (!evidence.every(Boolean) || !evidence.some((item) => item?.source === "observation")) return null;
  const craft = textList(mentor.craft, 12, false);
  const effect = textList(mentor.effect, 12, false);
  const consistency = textList(mentor.consistency, 12, false);
  const experiments = textList(mentor.experiments, 12, false);
  const questions = textList(mentor.questions, 12, false);
  if (!craft || !effect || !consistency || !experiments || !questions || !Array.isArray(mentor.references) || mentor.references.length > 12) return null;
  const references = mentor.references.map((item) => {
    if (!record(item) || !text(item.title, 300) || !text(item.sourceTitle, 300) || !text(item.note, 2_000) || !text(item.retrievalId, 200)) return null;
    const retrieval = retrievalById.get(item.retrievalId);
    if (!retrieval || item.sourceStatus !== retrieval.sourceStatus) return null;
    return { title: item.title, sourceTitle: item.sourceTitle, note: item.note, retrievalId: item.retrievalId, sourceStatus: retrieval.sourceStatus };
  });
  if (!references.every(Boolean)) return null;
  return { thesis: mentor.thesis, evidence: evidence as MentorResponse["evidence"], craft, effect, consistency, experiments, questions, references: references as MentorResponse["references"] };
}

function readStoryDirection(value: unknown) {
  if (!record(value) || !record(value.direction)) return null;
  const direction = value.direction;
  const risks = uniqueTexts(direction.risks, 8);
  const suggestedTags = uniqueTexts(direction.suggestedTags, 6, false);
  if (!text(direction.understanding, 2_000) || !text(direction.recommendation, 2_000) || !risks || !text(direction.question, 1_000) || !suggestedTags || !suggestedTags.every((tag) => STORY_DIRECTION_TAGS.has(tag))) return null;
  return { direction: { understanding: direction.understanding, recommendation: direction.recommendation, risks, question: direction.question, suggestedTags } };
}

function readConsistency(value: unknown, context: StoryContext, mode: "live" | "demo", evidenceValue: PayloadEvidenceContext) {
  if (!record(value) || !record(value.consistencyReport) || !evidenceValue.candidate) return null;
  const report = value.consistencyReport;
  if (!Array.isArray(report.findings) || report.findings.length > 20 || !text(report.checkedAt, 100)) return null;
  const priorSources = [...projectTexts(context, evidenceValue), ...lockedFacts(context)];
  const ids = new Set<string>();
  const findings = report.findings.map((item) => {
    if (!record(item) || !text(item.id, 120) || ids.has(item.id) || !isConsistencyCategory(item.category) || !isConsistencySeverity(item.severity) || !text(item.expectedFact, 2_000) || !text(item.candidateQuote, 2_000) || !evidenceValue.candidate!.text.includes(item.candidateQuote) || !text(item.priorEvidence, 2_000) || !exactQuoteExists(item.priorEvidence, priorSources) || !text(item.suggestion, 2_000)) return null;
    ids.add(item.id);
    return { id: item.id, category: item.category, severity: item.severity, expectedFact: item.expectedFact, candidateQuote: item.candidateQuote, priorEvidence: item.priorEvidence, suggestion: item.suggestion };
  });
  if (!findings.every(Boolean)) return null;
  return { consistencyReport: { candidateId: evidenceValue.candidate.id, contextRevision: evidenceValue.candidate.revision, findings: findings.filter((item): item is ConsistencyFinding => item !== null), checkedAt: report.checkedAt, mode, userConfirmation: "none" as const } };
}

function readKnowledgeExtract(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext) {
  if (!record(value) || !isSourceKind(value.sourceKind)) return null;
  const evidence = readEvidence(value.evidence, context, evidenceValue);
  if (!evidence) return null;
  const observationEvidence = new Set(evidence.filter((item) => item.source === "observation" || item.source === "user").map((item) => item.id));
  if (observationEvidence.size === 0) return null;
  const knowledgeGraph = readGraph(value.knowledgeGraph, observationEvidence, value.sourceKind);
  return knowledgeGraph ? { knowledgeGraph, evidence, sourceKind: value.sourceKind } : null;
}

function readImageSettings(value: unknown): ImageGenerationSettings | null {
  if (!record(value) || !text(value.prompt, 2_000) || !text(value.negativePrompt, 2_000) || !text(value.model, 200) || !text(value.size, 100) || !record(value.advanced) || Object.keys(value.advanced).length > 32) return null;
  if (!Object.values(value.advanced).every((item) => typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)))) return null;
  return { prompt: value.prompt, negativePrompt: value.negativePrompt, model: value.model, size: value.size, advanced: value.advanced as Record<string, string | number | boolean> };
}

function readImageRecommendation(value: unknown) {
  if (!record(value) || !record(value.imageRecommendation)) return null;
  const recommendation = value.imageRecommendation;
  const settings = readImageSettings(recommendation.settings);
  if (!settings || !record(recommendation.reasons) || Object.keys(recommendation.reasons).length > 32 || !Object.values(recommendation.reasons).every((item) => text(item, 2_000)) || !finiteInRange(recommendation.confidence, 0, 1)) return null;
  return { imageRecommendation: { settings, reasons: recommendation.reasons as Record<string, string>, confidence: recommendation.confidence } };
}

function readTrainingFeedback(value: unknown, evidenceValue: PayloadEvidenceContext) {
  if (!record(value) || !record(value.trainingFeedback)) return null;
  const feedback = value.trainingFeedback;
  if (["replacement", "replacementProse", "prose"].some((key) => key in feedback)) return null;
  const strengths = textList(feedback.strengths, 12, false);
  const evidenceQuotes = uniqueTexts(feedback.evidenceQuotes, 12, false);
  const issues = textList(feedback.issues, 12, false);
  const questions = textList(feedback.questions, 12);
  const quoteSources = [evidenceValue.answer, evidenceValue.sourceText].filter((item): item is string => typeof item === "string");
  if (!strengths || !evidenceQuotes || !issues || !text(feedback.nextExperiment, 2_000) || !questions || !evidenceQuotes.every((quote) => exactQuoteExists(quote, quoteSources))) return null;
  if (!Array.isArray(feedback.scores) || feedback.scores.length === 0 || feedback.scores.length > 16) return null;
  const scores = feedback.scores.map((item) => record(item) && text(item.dimension, 200) && TRAINING_FEEDBACK_DIMENSION_SET.has(item.dimension) && finiteInRange(item.score, 0, 100) && text(item.reason, 2_000) ? { dimension: item.dimension, score: item.score, reason: item.reason } : null);
  if (!scores.every(Boolean)) return null;
  const result: TrainingFeedbackResult = { strengths, evidenceQuotes, issues, nextExperiment: feedback.nextExperiment, questions, scores: scores as TrainingFeedbackResult["scores"] };
  return { trainingFeedback: result };
}

function readLegacyAnalysis(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext): Extract<AiTaskPayload, { characterGraph: StoryState["characterGraph"] }> | null {
  if (!record(value) || !Array.isArray(value.analysis) || value.analysis.length > 12 || !Array.isArray(value.evidence) || value.evidence.length > 50 || !record(value.characterGraph) || !Array.isArray(value.characterGraph.nodes) || !Array.isArray(value.characterGraph.edges) || !Array.isArray(value.plotCurve) || value.plotCurve.length > 48 || !Array.isArray(value.emotionCurve) || value.emotionCurve.length > 48) return null;

  const sources = userTexts(context, evidenceValue);
  const evidence = value.evidence.map((item): Evidence | null => {
    if (!record(item) || !text(item.id, 120) || !isEvidenceSource(item.source) || !text(item.quote, 2_000) || !text(item.note, 2_000) || !text(item.chapter, 300)) return null;
    if (item.source === "user" && !exactQuoteExists(item.quote, sources)) return null;
    if (item.source === "knowledge") return null;
    return { id: item.id, source: item.source, quote: item.quote, note: item.note, chapter: item.chapter };
  });
  if (!evidence.every(Boolean)) return null;
  const cleanEvidence = evidence.filter((item): item is Evidence => item !== null);
  const evidenceIdSet = new Set(cleanEvidence.map((item) => item.id));
  if (evidenceIdSet.size !== cleanEvidence.length) return null;

  const analysis = value.analysis.map((item): AnalysisDimension | null => {
    if (!record(item) || !text(item.id, 120) || !text(item.name, 200) || !text(item.summary, 2_000) || !text(item.impact, 2_000) || !text(item.suggestion, 2_000) || !finiteInRange(item.score, 0, 100)) return null;
    const evidenceIds = readEvidenceIds(item.evidenceIds, evidenceIdSet);
    return evidenceIds ? { id: item.id, name: item.name, summary: item.summary, impact: item.impact, suggestion: item.suggestion, score: item.score, evidenceIds } : null;
  });
  if (!analysis.every(Boolean)) return null;
  const cleanAnalysis = analysis.filter((item): item is AnalysisDimension => item !== null);

  const nodes = value.characterGraph.nodes.map((item): GraphNode | null => {
    if (!record(item) || !text(item.id, 120) || !text(item.label, 300) || !isGraphNodeType(item.type)) return null;
    return { id: item.id, label: item.label, type: item.type, ...(text(item.description, 2_000) ? { description: item.description } : {}) };
  });
  if (!nodes.every(Boolean)) return null;
  const cleanNodes = nodes.filter((item): item is GraphNode => item !== null);
  const nodeIdSet = new Set(cleanNodes.map((item) => item.id));
  if (nodeIdSet.size !== cleanNodes.length) return null;

  const edges = value.characterGraph.edges.map((item): GraphEdge | null => {
    if (!record(item) || !text(item.id, 120) || !text(item.source, 120) || !text(item.target, 120) || !nodeIdSet.has(item.source) || !nodeIdSet.has(item.target) || !text(item.label, 300)) return null;
    const sourceEvidenceIds = item.sourceEvidenceIds === undefined ? undefined : uniqueTexts(item.sourceEvidenceIds, 20);
    if (sourceEvidenceIds === null || sourceEvidenceIds?.some((id) => !evidenceIdSet.has(id))) return null;
    if (item.confidence !== undefined && !finiteInRange(item.confidence, 0, 1)) return null;
    if (item.evidenceSource !== undefined && !isEvidenceSource(item.evidenceSource)) return null;
    return { id: item.id, source: item.source, target: item.target, label: item.label, ...(sourceEvidenceIds === undefined ? {} : { sourceEvidenceIds }), ...(item.confidence === undefined ? {} : { confidence: item.confidence }), ...(item.evidenceSource === undefined ? {} : { evidenceSource: item.evidenceSource }) };
  });
  if (!edges.every(Boolean)) return null;
  const cleanEdges = edges.filter((item): item is GraphEdge => item !== null);
  if (new Set(cleanEdges.map((item) => item.id)).size !== cleanEdges.length) return null;

  const readCurve = (curve: unknown[]) => curve.map((item) => record(item) && text(item.beat, 200) && finiteInRange(item.value, -100, 100) && text(item.evidenceId, 120) && evidenceIdSet.has(item.evidenceId) ? { beat: item.beat, value: item.value, evidenceId: item.evidenceId } : null);
  const plotCurve = readCurve(value.plotCurve);
  const emotionCurve = readCurve(value.emotionCurve);
  if (!plotCurve.every(Boolean) || !emotionCurve.every(Boolean)) return null;

  return {
    analysis: cleanAnalysis,
    evidence: cleanEvidence,
    characterGraph: { nodes: cleanNodes, edges: cleanEdges },
    plotCurve: plotCurve.filter((item): item is NonNullable<typeof item> => item !== null),
    emotionCurve: emotionCurve.filter((item): item is NonNullable<typeof item> => item !== null),
  };
}

function readLegacyTraining(value: unknown) {
  if (!record(value) || !record(value.feedback)) return null;
  const feedback = value.feedback;
  const strengths = feedback.strengths === undefined ? undefined : textList(feedback.strengths, 12);
  const questions = feedback.questions === undefined ? undefined : textList(feedback.questions, 12);
  if (strengths === null || questions === null || (feedback.evidence !== undefined && !text(feedback.evidence, 2_000)) || (feedback.issue !== undefined && !text(feedback.issue, 2_000)) || (feedback.nextStep !== undefined && !text(feedback.nextStep, 2_000))) return null;
  return { feedback: { ...(strengths === undefined ? {} : { strengths }), ...(feedback.evidence === undefined ? {} : { evidence: feedback.evidence }), ...(feedback.issue === undefined ? {} : { issue: feedback.issue }), ...(feedback.nextStep === undefined ? {} : { nextStep: feedback.nextStep }), ...(questions === undefined ? {} : { questions }) } };
}

function readExplain(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext): Extract<AiTaskPayload, { explanation: string }> | null {
  if (!record(value) || !text(value.explanation, 4_000)) return null;
  const evidence = readEvidence(value.evidence, context, evidenceValue);
  const suggestions = uniqueTexts(value.suggestions, 12);
  return evidence && suggestions ? { explanation: value.explanation, evidence, suggestions } : null;
}

function normalizePalette(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  const palette = value.split(/[，,、;；/|]+/).map((item) => item.trim()).filter(Boolean);
  return palette.length > 0 ? palette : null;
}

function readVisualBrief(value: unknown): Extract<AiTaskPayload, { visualBrief: unknown }> | null {
  if (!record(value) || !record(value.visualBrief)) return null;
  const brief = value.visualBrief;
  const palette = normalizePalette(brief.palette);
  if (!text(brief.title, 300) || !text(brief.subject, 1_000) || !text(brief.composition, 2_000) || !palette || palette.length > 8 || !palette.every((item) => text(item, 100)) || new Set(palette).size !== palette.length || !text(brief.atmosphere, 1_000) || !text(brief.negativePrompt, 2_000)) return null;
  return { visualBrief: { title: brief.title, subject: brief.subject, composition: brief.composition, palette, atmosphere: brief.atmosphere, negativePrompt: brief.negativePrompt } };
}

function readStoryboard(value: unknown): Extract<AiTaskPayload, { storyboard: unknown }> | null {
  if (!record(value) || !Array.isArray(value.storyboard) || value.storyboard.length !== 6) return null;
  const storyboard = value.storyboard.map((item) => {
    if (!record(item) || !finiteInRange(item.shot, 1, 6) || !Number.isInteger(item.shot) || !text(item.framing, 200) || !text(item.action, 2_000) || !text(item.sound, 1_000) || !text(item.prompt, 2_000)) return null;
    return { shot: item.shot, framing: item.framing, action: item.action, sound: item.sound, prompt: item.prompt };
  });
  if (!storyboard.every(Boolean)) return null;
  const shots = storyboard.map((item) => item!.shot);
  if (new Set(shots).size !== 6) return null;
  return { storyboard: storyboard.filter((item): item is NonNullable<typeof item> => item !== null) };
}

export function validateTaskPayload(task: AiTask, value: unknown, context: StoryContext, mode: "live" | "demo", evidenceValue?: PayloadEvidenceContext | string): AiTaskPayload | null {
  const taskEvidence = evidenceContext(evidenceValue);
  if (["ideas", "opening", "prose", "continue", "rewrite", "expand", "condense", "sensory"].includes(task)) {
    const candidates = readCandidates(value, context, mode, task);
    return candidates ? { candidates } : null;
  }
  if (task === "characters") { const characters = readCharacters(value, context); return characters ? { characters } : null; }
  if (task === "world") { const worldEntries = readWorldEntries(value, context); return worldEntries ? { worldEntries } : null; }
  if (task === "blueprint") { const blueprint = readBlueprint(value, context); return blueprint ? { blueprint } : null; }
  if (task === "analysis") return readLegacyAnalysis(value, context, taskEvidence);
  if (task === "explain") return readExplain(value, context, taskEvidence);
  if (task === "mentor") { const mentor = readMentor(value, context, taskEvidence); return mentor ? { mentor } : null; }
  if (task === "visual-brief") return readVisualBrief(value);
  if (task === "storyboard") return readStoryboard(value);
  if (task === "training") return readLegacyTraining(value);
  if (task === "story-direction") return readStoryDirection(value);
  if (task === "consistency-check") return readConsistency(value, context, mode, taskEvidence);
  if (task === "analysis-v2") return readLiteraryAnalysis(value, context, taskEvidence);
  if (task === "knowledge-extract") return readKnowledgeExtract(value, context, taskEvidence);
  if (task === "image-parameter-recommendation") return readImageRecommendation(value);
  if (task === "training-feedback-v2") return readTrainingFeedback(value, taskEvidence);
  return null;
}
