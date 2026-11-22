import type { AiTask, AiTaskPayload, StoryContext } from "@/lib/ai/tasks";
import { resolveAiSourceText } from "@/lib/ai/story-context";
import { normalizeModelPayload } from "@/lib/ai/normalize-payload";
import { injectedCriteriaIds, stampCriteriaVersion } from "@/lib/ai/criteria";
import { readCriteriaEvaluation } from "@/lib/ai/criteria-evaluation";
import { trainingBindings } from "@/lib/training/bindings";
import { TRAINING_FEEDBACK_DIMENSIONS, type AiEvidence, type AnalysisDimension, type BlueprintNode, type Candidate, type Character, type ConsistencyFinding, type Evidence, type GraphEdge, type GraphNode, type ImageGenerationSettings, type KnowledgeGraph, type LiteraryAnalysisResult, type LiteraryDomainAnalysis, type LiteraryDomainFinding, type LiterarySourceKind, type LiteraryThemeStage, type MentorResponse, type RetrievalEvidence, type StoryState, type TrainingFeedbackResult, type WorldEntry } from "@/lib/types";

export interface PayloadEvidenceContext {
  onFailure?: (reason: string) => void;
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

/**
 * 回写上限：省略号两段相隔太远时，展开会把一大段无关正文塞进引文，
 * 宁可判「找不到」也不要给用户一段对不上的原文。
 */
const MAX_LOCATED_QUOTE = 240;

/** 不参与比对的字符：空白与中英文标点。字形、字序仍然逐字要求一致。 */
const UNMATCHABLE = /[\s　!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。、；：？！“”‘’（）《》〈〉【】「」『』—－·／＼…]/;

/** 逐字符折叠并保留「折叠后位置 → 原文位置」的映射，用于把命中点还原成原文原字。 */
function foldText(input: string) {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (UNMATCHABLE.test(char)) continue;
    out += char;
    map.push(i);
  }
  return { out, map };
}

/**
 * 把模型给的引文还原成原文里的原字切片。
 *
 * 模型常见的三种无害偏差：改标点、把换行写成「／」、用「……」省略中间。
 * 三种都不该被判成编造——但也不能就这么放进结果里，因为用户核对时看到的是
 * 改过的字。所以做法是：确认这段话确实出自原文之后，**用原文那一段替换回引文**。
 * 省略号因此被展开成原文的连续文字，用户看到的永远是原文原字。
 *
 * 真正的编造（原文里找不到）仍然返回 null，由调用方丢弃。
 */
function locateVerbatim(quote: string, sources: string[]): string | null {
  const trimmed = quote.trim();
  if (!trimmed) return null;
  // 快路径：本来就是原文切片。短引文（四字以内）只能走这条路。
  for (const source of sources) {
    if (source.includes(trimmed)) return trimmed;
  }
  // 慢路径：按省略号切段，逐段顺序定位，取首段起点到末段终点的原文原字。
  const parts = trimmed.split(/…+|\.{3,}/).map((part) => foldText(part).out).filter(Boolean);
  if (parts.length === 0) return null;
  // 折叠后仍要求每段至少六字：否则「他」这种常见字必然命中，等于没有证据。
  if (parts.some((part) => part.length < 6)) return null;
  for (const source of sources) {
    const { out, map } = foldText(source);
    let cursor = 0;
    let firstStart = -1;
    let lastEnd = -1;
    let matched = true;
    for (const part of parts) {
      const at = out.indexOf(part, cursor);
      if (at < 0) { matched = false; break; }
      if (firstStart < 0) firstStart = at;
      cursor = at + part.length;
      lastEnd = cursor;
    }
    if (!matched || firstStart < 0) continue;
    const slice = source.slice(map[firstStart], map[lastEnd - 1] + 1);
    if (slice.length > MAX_LOCATED_QUOTE) return null;
    return slice.trim();
  }
  return null;
}

function literaryQuoteExists(quote: string, sources: string[]) {
  return locateVerbatim(quote, sources) !== null;
}

/** 引文在原文里的所有出现区间。回写之后引文就是原文切片，精确扫描即可。 */
function quoteRanges(text: string, sources: string[]) {
  const ranges: Array<{ si: number; start: number; end: number }> = [];
  const needle = text.trim();
  if (!needle) return ranges;
  sources.forEach((source, si) => {
    let at = source.indexOf(needle);
    while (at >= 0) {
      ranges.push({ si, start: at, end: at + needle.length });
      at = source.indexOf(needle, at + 1);
    }
  });
  return ranges;
}

/**
 * 诊断引文与它引用的证据引文，是否指向原文的同一处。
 *
 * 不用「互为子串」：省略号回写之后，证据引文会被展开成原文的一整段，
 * 而诊断只截取其中一句，两者谁都套不住谁，却明明指着同一处文字。
 * 按区间相交判断既不会误杀，也比子串更挑——必须落在同一段原文上。
 */
function overlapsInSource(a: string, b: string, sources: string[]) {
  const left = quoteRanges(a, sources);
  if (!left.length) return false;
  const right = quoteRanges(b, sources);
  return left.some((x) => right.some((y) => x.si === y.si && x.start < y.end && y.start < x.end));
}

function isSourceKind(value: unknown): value is LiterarySourceKind {
  return value === "narrative" || value === "argumentative";
}

const CATEGORY_ALIASES = new Map<string, ConsistencyFinding["category"]>([
  ["character", "character"], ["人物", "character"], ["角色", "character"],
  ["world", "world"], ["世界", "world"], ["设定", "world"], ["世界观", "world"],
  ["plot", "plot"], ["情节", "plot"], ["剧情", "plot"],
  ["timeline", "timeline"], ["时间", "timeline"], ["时间线", "timeline"],
]);

/** 模型经常回中文类别，这里归一化后再判，不因为语言差异丢掉整条发现。 */
function normalizeConsistencyCategory(value: unknown): ConsistencyFinding["category"] | null {
  if (typeof value !== "string") return null;
  return CATEGORY_ALIASES.get(value.trim().toLowerCase()) ?? CATEGORY_ALIASES.get(value.trim()) ?? null;
}

const SEVERITY_ALIASES = new Map<string, ConsistencyFinding["severity"]>([
  ["low", "low"], ["低", "low"], ["轻微", "low"],
  ["medium", "medium"], ["中", "medium"], ["中等", "medium"],
  ["high", "high"], ["高", "high"], ["严重", "high"],
]);

function normalizeConsistencySeverity(value: unknown): ConsistencyFinding["severity"] | null {
  if (typeof value !== "string") return null;
  return SEVERITY_ALIASES.get(value.trim().toLowerCase()) ?? SEVERITY_ALIASES.get(value.trim()) ?? null;
}



function isEvidenceSource(value: unknown): value is Evidence["source"] {
  return value === "user" || value === "knowledge" || value === "inference";
}

function isGraphNodeType(value: unknown): value is GraphNode["type"] {
  return typeof value === "string" && GRAPH_NODE_TYPES.has(value);
}

function readCandidates(value: unknown, context: StoryContext, mode: "live" | "demo", task: AiTask): Candidate[] | null {
  // 放宽：1–3 个候选即可。模型只给 1 个真正不同的写法，比硬凑 2 个同义的更有用。
  if (!record(value) || !Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > 3) return null;
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
  const kept = result.filter((item) => item !== null);
  return kept.length ? (kept as Candidate[]) : null;
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
  const kept = result.filter((item): item is Character => Boolean(item));
  return kept.length ? kept : null;
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
    const kept = entries.filter((item): item is WorldEntry => Boolean(item));
    return kept.length ? kept : null;
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
  const kept = result.filter((item) => item !== null);
  return kept.length ? (kept as BlueprintNode[]) : null;
}

function readEvidence(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext, analysisFailure?: (reason: string) => null, drop?: (reason: string) => null): AiEvidence[] | null {
  const fail = (reason: string) => analysisFailure?.(reason) ?? null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return fail("evidence 必须是 1–50 项数组");
  const sources = userTexts(context, evidenceValue);
  const retrievalById = new Map((evidenceValue.retrievalEvidence ?? []).map((item) => [item.retrievalId, item]));
  const result: AiEvidence[] = [];
  const ids = new Set<string>();
  const discardedEvidence: Array<{ index: number; id?: string; reason: string }> = [];
  for (const [i, raw] of value.entries()) {
    const field = `evidence[${i}]`;
    if (!record(raw)) {
      if (analysisFailure) { discardedEvidence.push({ index: i, reason: "not_object" }); continue; }
      return fail(`${field} 不是对象`);
    }
    const item = analysisFailure ? { ...raw,
      source: typeof raw.source === "string" && !/^(source|sourceText)$/i.test(raw.source) ? raw.source : raw.type ?? (text(raw.quote) || text(raw.text) ? "observation" : undefined),
      quote: typeof raw.quote === "string" && raw.quote.trim() ? raw.quote : raw.text,
    } : raw;
    if (!text(item.id, 120)) { if (analysisFailure) { discardedEvidence.push({ index: i, reason: "id_invalid" }); continue; } return fail(`${field}.id 缺失或无效`); }
    if (ids.has(item.id)) { if (analysisFailure) { discardedEvidence.push({ index: i, id: String(item.id), reason: "duplicate_id" }); continue; } return fail(`${field}.id 重复`); }
    ids.add(item.id);
    const blank = item.note == null || (typeof item.note === "string" && !item.note.trim());
    const note = analysisFailure && blank ? "（模型未提供说明）" : item.note;
    if (!text(note, 2_000)) { if (analysisFailure) { discardedEvidence.push({ index: i, id: String(item.id), reason: "note_invalid" }); continue; } return fail(`${field}.note 缺失或无效`); }
    if (item.source === "observation" || item.source === "user") {
      if (!text(item.quote, 2_000)) { if (drop) { drop(`${field}.quote 缺失或无效（source=${item.source}）`); continue; } return fail(`${field}.quote 缺失或无效（source=${item.source}）`); }
      // 定位成功后立刻回写成原文原字：模型改过的标点、写成的「／」、
      // 用「……」省略的部分，都会在这里被原文覆盖。
      const locatedQuote = locateVerbatim(item.quote, sources);
      if (!locatedQuote) { if (analysisFailure) { discardedEvidence.push({ index: i, id: String(item.id), reason: "quote_not_in_source" }); continue; } return fail(`${field}.quote 不在原文（「${item.quote.slice(0, 20)}」）`); }
      result.push({ id: item.id, source: item.source, quote: locatedQuote, note });
    } else if (item.source === "knowledge") {
      if (!text(item.quote, 2_000)) { if (drop) { drop(`${field}.quote 缺失或无效（source=knowledge）`); continue; } return fail(`${field}.quote 缺失或无效（source=knowledge）`); }
      if (!text(item.retrievalId, 200)) { if (drop) { drop(`${field}.retrievalId 缺失或无效`); continue; } return fail(`${field}.retrievalId 缺失或无效`); }
      const retrieval = retrievalById.get(item.retrievalId);
      if (!retrieval && !(analysisFailure && retrievalById.size === 0)) return fail(`${field}.retrievalId 不在检索结果中（${item.retrievalId}）`);
      if (retrieval && !retrieval.content.includes(item.quote) && !retrieval.quote.includes(item.quote)) return fail(`${field}.quote 不在检索结果中（retrievalId=${item.retrievalId}）`);
      result.push({ id: item.id, source: "knowledge", quote: item.quote, retrievalId: item.retrievalId, note, ...(!retrieval ? { verification: "unverified" as const } : {}) });
    } else if (item.source === "inference") {
      if (text(item.quote, 2_000)) {
        if (!drop) return fail(`${field}.quote 不应出现在 inference 条目中`);
        drop(`${field}.quote 推断不能作为原文引文，已移除引文`);
      }
      if (!text(item.claim, 2_000)) { if (drop) { drop(`${field}.claim 缺失或无效`); continue; } return fail(`${field}.claim 缺失或无效`); }
      result.push({ id: item.id, source: "inference", claim: item.claim, note });
    } else if (drop) drop(`${field}.source 来源无效`);
    else return fail(`${field}.source 非法（source=${String(raw.source).slice(0, 80)}，type=${String(raw.type).slice(0, 80)}）`);
  }
  for (const entry of discardedEvidence) drop?.(`evidence[${entry.index}] ${entry.reason}`);
  if (analysisFailure && result.length === 0) return fail(`evidence 全部未通过校验（无一条可用）：evidence[${discardedEvidence[0]?.index ?? 0}].${discardedEvidence[0]?.reason ?? "invalid"}`);
  return result;
}

function readEvidenceIds(value: unknown, knownEvidence: Set<string>, maximum = 20): string[] | null {
  const ids = uniqueTexts(value, maximum, false);
  return ids && ids.every((id) => knownEvidence.has(id)) ? ids : null;
}

function readObservationEvidenceIds(value: unknown, observationEvidence: Set<string>, maximum = 20): string[] | null {
  return readEvidenceIds(value, observationEvidence, maximum);
}

function readGraph(value: unknown, observationEvidence: Set<string>, sourceKind?: LiterarySourceKind, lenient = false): KnowledgeGraph | null {
  if (!record(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length === 0 || value.nodes.length > 80 || value.edges.length > 120) return null;
  const nodes = value.nodes.map((item) => {
    if (!record(item) || !text(item.id, 120) || !text(item.label, 300) || !isGraphNodeType(item.type) || (sourceKind === "argumentative" && !ARGUMENTATIVE_GRAPH_NODE_TYPES.has(item.type))) return null;
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds, observationEvidence)
      ?? filterEvidenceIds(item.evidenceIds, observationEvidence);
    if (!evidenceIds) return null;
    return { id: item.id, label: item.label, type: item.type, evidenceIds, ...(text(item.era, 300) ? { era: item.era } : {}), ...(text(item.description, 2_000) ? { description: item.description } : {}) } as GraphNode;
  });
  // 默认 lenient：坏节点丢掉、剩下的留着。严格模式只在需要「全对才算」的场合显式传 false。
  void lenient;
  const cleanNodes = nodes.filter((n): n is GraphNode => Boolean(n));
  if (!cleanNodes || !cleanNodes.length) return null;
  const nodeIds = cleanNodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) return null;
  const nodeIdSet = new Set(nodeIds);
  const edges = value.edges.map((item) => {
    if (!record(item) || !text(item.id, 120) || !text(item.source, 120) || !text(item.target, 120) || !text(item.label, 300) || !nodeIdSet.has(item.source) || !nodeIdSet.has(item.target)) return null;
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds ?? item.sourceEvidenceIds, observationEvidence)
      ?? filterEvidenceIds(item.evidenceIds ?? item.sourceEvidenceIds, observationEvidence);
    if (!evidenceIds || (item.confidence !== undefined && !finiteInRange(item.confidence, 0, 1))) return null;
    return { id: item.id, source: item.source, target: item.target, label: item.label, evidenceIds, ...(item.confidence === undefined ? {} : { confidence: item.confidence }) } as GraphEdge;
  });
  const cleanEdges = edges.filter((e): e is GraphEdge => Boolean(e));
  if (!cleanEdges) return null;
  const edgeIds = cleanEdges.map((edge) => edge.id);
  return new Set(edgeIds).size === edgeIds.length ? { nodes: cleanNodes, edges: cleanEdges } : null;
}


/**
 * L2 容错：部分证据失效时，保留仍有效的那些。
 * 全部失效则返回 null —— 该条结论失去全部凭证，必须丢弃，不能用 fallback 掩盖。
 * 这是"防幻觉"的底线：编造的证据不能因为"还有别的真证据"就蒙混过关。
 */
function filterEvidenceIds(value: unknown, known: Set<string>): string[] | null {
  const given = Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  const kept = given.filter((id) => known.has(id));
  return kept.length ? kept : null;
}

/** 维度上限：判据注入 16 条后，模型按每条判据出一个维度是合理响应，上限与 diagnostics 对齐为 24。 */
const MAX_ANALYSIS_DIMENSIONS = 24;

function readAnalysisDimensions(value: unknown, knownEvidence: Set<string>): AnalysisDimension[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ANALYSIS_DIMENSIONS) return null;
  const result = value.map((item) => {
    if (!record(item) || !text(item.id, 120) || !text(item.name, 200) || !text(item.summary, 2_000) || !text(item.impact, 2_000) || !text(item.suggestion, 2_000) || !finiteInRange(item.score, 0, 100)) return null;
    const evidenceIds = readEvidenceIds(item.evidenceIds, knownEvidence) ?? filterEvidenceIds(item.evidenceIds, knownEvidence);
    return evidenceIds ? { id: item.id, name: item.name, summary: item.summary, impact: item.impact, suggestion: item.suggestion, score: item.score, evidenceIds } : null;
  });
  const kept = result.filter((x): x is AnalysisDimension => Boolean(x));
  // 一个维度都没剩下 → 整包拒绝（没有任何可展示的分析）
  if (!kept.length) return null;
  const ids = kept.map((item) => item.id);
  return new Set(ids).size === ids.length ? kept : null;
}

function readCurves(raw: unknown, observationEvidence: Set<string>, path: string, fail: (reason: string) => null) {
  const value = record(raw) ? raw.points : raw;
  if (!Array.isArray(value) || value.length === 0 || value.length > 48) { fail(`${path} 必须是 1–48 项数组`); return []; }
  const points = value.map((item, i) => {
    if (!record(item) || !text(item.segment, 200) || !finiteInRange(item.value, 0, 100)) return fail(`${path}[${i}].segment/value 无效`);
    // 证据必须真实存在于 observation 集合；不接受"随便挂一个"——那是防幻觉底线
    if (!text(item.evidenceId, 120) || !observationEvidence.has(item.evidenceId)) return fail(`${path}[${i}].evidenceId 不是有效的原文证据`);
    return { segment: item.segment, value: item.value, evidenceId: item.evidenceId };
  });
  // 一个点也保留：诊断规则成立就该显示，短文本只有一段时曲线退化成单点，不是错误。
  const kept = points.filter(p => p !== null);
  if (!kept.length) { fail(`${path} 没有有效点`); return []; }
  return kept;
}

const findingMeta = new Set(["id", "evidenceIds", "evidenceQuotes", "degraded"]);
function describeFinding(item: Record<string, unknown>) {
  return Object.entries(item).filter(([key]) => !findingMeta.has(key)).flatMap(([, v]) => Array.isArray(v) ? v : [v]).filter((s): s is string => typeof s === "string" && !!s.trim()).map(s => s.trim()).join("｜").slice(0, 2000);
}

export function isProofreadingClaim(effect: string, action: string) {
  if (!/生硬|直白|冗长|费解|混淆|不搭|用词不当|错别字|标点|语病|表述不清/.test(effect + action)) return false;
  const token = /一词|一字|该词|这个词|此句|这句|用词|标点|错别字|['‘’“"][^'‘’“”"]{1,6}['’”"]/.test(effect);
  if (!token && /缺乏|缺少|不足|仅用|只用|没有|带过|支撑|铺垫|具体事件|具体场景|具体细节|可推断/.test(effect + action)) return false;
  return token || /可改为|建议改为|应改为|改成|换成|通常用|可写成|不如改成|可精简/.test(action) || /比喻费解/.test(effect);
}

function readDomainFindings(value: unknown, observationEvidence: Set<string>, path: string, fail: (reason: string) => null): LiteraryDomainFinding[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) { fail(`${path} 必须是 1–24 项数组`); return []; }
  const findings = value.map((item, i) => {
    if (!record(item)) return fail(`${path}[${i}] 不是对象`);
    const description = text(item.description, 2000) ? item.description : describeFinding(item);
    if (!description) return fail(`${path}[${i}] 没有文本内容`);
    const label = text(item.label, 300) ? item.label : description.slice(0, 60);
    let evidenceIds = readObservationEvidenceIds(item.evidenceIds, observationEvidence);
    if (!evidenceIds) {
      // L2 容错：过滤掉失效的 id，只保留仍有效的；一个都不剩才判无效
      const given = Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
      const kept = given.filter((x: unknown): x is string => typeof x === "string" && observationEvidence.has(x));
      if (kept.length) evidenceIds = kept;
    }
    return evidenceIds ? { label, description, evidenceIds } : fail(`${path}[${i}].evidenceIds 无效`);
  });
  return findings.filter(item => item !== null);
}

function readThemeStages(value: unknown, observationEvidence: Set<string>, fail: (reason: string) => null): LiteraryThemeStage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) { fail("themes.stages 必须是 1–24 项数组"); return []; }
  const stages = value.map((item, i) => {
    if (!record(item)) return fail(`themes.stages[${i}] 不是对象`);
    const description = describeFinding(item);
    if (!description) return fail(`themes.stages[${i}] 没有文本内容`);
    const stage = text(item.stage, 300) ? item.stage : description.slice(0, 40);
    const theme = text(item.theme, 300) ? item.theme : stage;
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds, observationEvidence);
    return evidenceIds ? { stage, theme, change: text(item.change, 2000) ? item.change : description, reason: text(item.reason, 2000) ? item.reason : description, evidenceIds } : fail(`themes.stages[${i}].evidenceIds 无效`);
  });
  return stages.filter(item => item !== null);
}

function readDomainAnalysis(value: unknown, sourceKind: LiterarySourceKind, observationEvidence: Set<string>, fail: (reason: string) => null, drop: (reason: string) => null): LiteraryDomainAnalysis | null {
  if (!record(value) || !record(value.themes)) return fail("domainAnalysis.themes 缺失或无效");
  if (value.kind !== undefined && value.kind !== sourceKind) return fail("domainAnalysis.kind 与 sourceKind 不一致");
  const stages = readThemeStages(value.themes.stages, observationEvidence, drop);
  if (!stages) return null;
  if (sourceKind === "narrative") {
    if (!record(value.characters) || !record(value.plot)) return fail("domainAnalysis.characters/plot 缺失或无效");
    const goals = readDomainFindings(value.characters.goals, observationEvidence, "domainAnalysis.characters.goals", drop);
    const actions = readDomainFindings(value.characters.actions, observationEvidence, "domainAnalysis.characters.actions", drop);
    const relationshipChanges = readDomainFindings(value.characters.relationshipChanges, observationEvidence, "domainAnalysis.characters.relationshipChanges", drop);
    const turningPoints = readDomainFindings(value.plot.turningPoints, observationEvidence, "domainAnalysis.plot.turningPoints", drop);
    const setups = readDomainFindings(value.plot.setups, observationEvidence, "domainAnalysis.plot.setups", drop);
    const payoffs = readDomainFindings(value.plot.payoffs, observationEvidence, "domainAnalysis.plot.payoffs", drop);
    return goals && actions && relationshipChanges && turningPoints && setups && payoffs && [goals, actions, relationshipChanges, turningPoints, setups, payoffs, stages].some(a => a.length)
      ? { kind: "narrative", characters: { goals, actions, relationshipChanges }, plot: { turningPoints, setups, payoffs }, themes: { stages } }
      : null;
  }
  if (!record(value.argument)) return fail("domainAnalysis.argument 缺失或无效");
  const claims = readDomainFindings(value.argument.claims, observationEvidence, "domainAnalysis.argument.claims", drop);
  const evidenceUnits = readDomainFindings(value.argument.evidenceUnits, observationEvidence, "domainAnalysis.argument.evidenceUnits", drop);
  const reasoningSteps = readDomainFindings(value.argument.reasoningSteps, observationEvidence, "domainAnalysis.argument.reasoningSteps", drop);
  return claims && evidenceUnits && reasoningSteps && [claims, evidenceUnits, reasoningSteps, stages].some(a => a.length)
    ? { kind: "argumentative", argument: { claims, evidenceUnits, reasoningSteps }, themes: { stages } }
    : null;
}

type Degradation = { path: string; reason: string; dropped?: number };

function readLiteraryAnalysis(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext): (LiteraryAnalysisResult & { degraded: Degradation[] }) | null {
  let firstFailure: string | undefined;
  const fail = (reason: string): null => {
    if (!firstFailure) evidenceValue.onFailure?.(firstFailure = reason);
    return null;
  };
  // 模型输出归一化：把领域词映射成 schema 固定名（详见 normalize-payload.ts）
  // 只处理字段命名，不放宽证据要求——引文仍须逐字在原文。
  const rawHeatmap = record(value) ? value.themeHeatmap : undefined;
  const rawCells = record(rawHeatmap) ? rawHeatmap.themes : rawHeatmap;
  const invalidTheme = Array.isArray(rawCells) ? rawCells.findIndex(cell =>
    !record(cell) || ![cell.theme, cell.name, cell.label].some(name => text(name, 200))) : -1;
  // 模型偶尔把整个 payload 包在数组里返回（[{...}]）。这是可恢复的形态：
  // 取第一个对象元素，记账后继续校验。不是对象才真的没法处理。
  const wrappedInArray = Array.isArray(value) ? value.find(record) : undefined;
  if (wrappedInArray) value = wrappedInArray;
  if (!record(value)) return fail("返回内容不是对象");
  const degraded: Degradation[] = [];
  if (wrappedInArray) degraded.push({ path: "payload", reason: "模型把整体包在数组里返回，已取首个对象" });
  const drop = (message: string): null => {
    const [path, ...reason] = message.split(" ");
    degraded.push({ path, reason: reason.join(" "), ...(/\[\d+\]/.test(path) ? { dropped: 1 } : {}) });
    return null;
  };
  // sourceKind 必须在归一化**之前**定下来：归一化会按它把 domainAnalysis 重排成
  // 叙事/论证对应的形状，先归一化再改 sourceKind，形状就错位了。
  // 它本身是服务端事实（detectLiterarySourceKind 判定 + 用户可修正），
  // 模型的职责不是复述它。漏写或判错一律以服务端为准并记账；
  // 只有服务端也没给（纯离线调用）时才要求模型自己写对。
  const rawKind = value.sourceKind;
  let effectiveKind: LiterarySourceKind;
  if (isSourceKind(rawKind)) {
    effectiveKind = rawKind;
    if (evidenceValue.expectedSourceKind && rawKind !== evidenceValue.expectedSourceKind) {
      degraded.push({ path: "sourceKind", reason: `模型判为 ${rawKind}，与服务端 ${evidenceValue.expectedSourceKind} 不一致，已按服务端口径` });
      effectiveKind = evidenceValue.expectedSourceKind;
    }
  } else {
    if (!evidenceValue.expectedSourceKind) return fail("sourceKind 缺失、未知或与输入不符");
    degraded.push({ path: "sourceKind", reason: `模型未给出有效值，已按服务端判定使用 ${evidenceValue.expectedSourceKind}` });
    effectiveKind = evidenceValue.expectedSourceKind;
  }
  const normalized = normalizeModelPayload({ ...value, sourceKind: effectiveKind });
  const evidence = readEvidence(normalized.evidence, context, evidenceValue, fail, drop);
  if (!evidence) return null;
  const knownEvidence = new Set(evidence.map((item) => item.id));
  const sources = userTexts(context, evidenceValue);
  const observationEvidence = new Set(evidence.filter(item => item.quote && literaryQuoteExists(item.quote, sources)).map(item => item.id));
  if (observationEvidence.size === 0) return fail("evidence 缺少原文观察证据（0 条）");
  const analysis = readAnalysisDimensions(normalized.analysis, knownEvidence);
  const domainAnalysis = readDomainAnalysis(normalized.domainAnalysis, effectiveKind, observationEvidence, fail, drop);
  const relationGraph = readGraph(normalized.relationGraph, observationEvidence, effectiveKind, true);
  const paceCurve = readCurves(normalized.paceCurve, observationEvidence, "paceCurve", drop);
  const emotionCurve = readCurves(normalized.emotionCurve, observationEvidence, "emotionCurve", drop);
  if (!analysis || !domainAnalysis || !relationGraph || !relationGraph.edges.length || !paceCurve || !emotionCurve) return fail(`${!analysis ? "analysis" : !domainAnalysis ? "domainAnalysis" : !relationGraph?.edges.length ? "relationGraph" : !paceCurve ? "paceCurve" : "emotionCurve"} 结构或证据引用无效`);
  const heatmap = record(normalized.themeHeatmap) ? normalized.themeHeatmap.themes : normalized.themeHeatmap;
  if (!Array.isArray(heatmap) || heatmap.length > 120) drop("themeHeatmap 不是数组或超过 120 项");
  const heatmapCells = (Array.isArray(heatmap) && heatmap.length <= 120 ? heatmap : []).map((item, i) => {
    if (!record(item) || !text(item.theme, 200) || !text(item.segment, 200) || !finiteInRange(item.value, 0, 100)) return drop(`themeHeatmap[${i}] 字段无效`);
    if (!text(item.evidenceId, 120) || !observationEvidence.has(item.evidenceId)) return drop(`themeHeatmap[${i}].evidenceId 不是有效的原文证据`);
    return { theme: item.theme, segment: item.segment, value: item.value, evidenceId: item.evidenceId };
  });
  if (invalidTheme >= 0) drop(`themeHeatmap[${invalidTheme}].theme 主题缺失或无效`);
  const themeHeatmap = invalidTheme < 0 && heatmapCells.every(Boolean) ? heatmapCells : [];
  if (!record(value.styleProfile) || !Array.isArray(value.styleProfile.metrics) || value.styleProfile.metrics.length !== 6) return fail("styleProfile.metrics 必须恰好包含六项");
  const keys = ["sentenceLength", "dialogueRatio", "sensoryDensity", "rhetoric", "narrativeDistance", "rhythm"] as const;
  const aliases = new Map<string, typeof keys[number]>(keys.map(key => [key, key]));
  for (const [label, key] of [["句子长度", "sentenceLength"], ["对话比例", "dialogueRatio"], ["感官密度", "sensoryDensity"], ["修辞手法", "rhetoric"], ["修辞", "rhetoric"], ["叙事距离", "narrativeDistance"], ["节奏", "rhythm"]] as const) aliases.set(label, key);
  const metrics = value.styleProfile.metrics.map((item, i) => {
    const path = `styleProfile.metrics[${i}]`;
    if (!record(item)) return fail(`${path} 不是对象`);
    const rawKey = item.key ?? item.dimension;
    const key = typeof rawKey === "string" ? aliases.get(rawKey.trim()) : undefined;
    if (!key) return fail(`${path}.key 缺失或无效，dimension 未能提供有效别名`);
    if (!text(item.dimension, 200) || !text(item.interpretation, 2_000)) return fail(`${path}.${!text(item.dimension, 200) ? "dimension" : "interpretation"} 缺失或无效`);
    if (!finiteInRange(item.value, key === "sentenceLength" ? 1 : 0, key === "sentenceLength" ? 200 : 100)) return fail(`${path}.value 超出 ${key} 的范围或不是数值`);
    const evidenceIds = readObservationEvidenceIds(item.evidenceIds, observationEvidence)
      ?? filterEvidenceIds(item.evidenceIds, observationEvidence);
    return evidenceIds ? { key, dimension: item.dimension, value: item.value, interpretation: item.interpretation, ...(text(item.unit, 60) ? { unit: item.unit } : {}), evidenceIds } : fail(`${path}.evidenceIds 缺少有效原文证据`);
  });
  if (!metrics.every(Boolean)) return null;
  if (new Set(metrics.map(item => item!.key)).size !== 6) return fail("styleProfile.metrics.key 六项未各出现一次");
  if (!Array.isArray(value.diagnostics) || value.diagnostics.length === 0 || value.diagnostics.length > 24) return fail("diagnostics 必须包含 1 至 24 项");
  const diagnostics: LiteraryAnalysisResult["diagnostics"] = [];
  const countableEvidence = new Set(evidence
    .filter(({ id, source }) => (source === "observation" || source === "user") && observationEvidence.has(id))
    .map(({ id }) => id));
  const discardedDiagnostics: NonNullable<LiteraryAnalysisResult["discardedDiagnostics"]> = [];
  for (const item of value.diagnostics) {
    const attempted = record(item) ? Object.fromEntries(["id", "location", "quote", "effect", "action"].filter(k => text(item[k], 2000)).map(k => [k, item[k]])) : {};
    const discard = (reason: typeof discardedDiagnostics[number]["reason"]) => discardedDiagnostics.push({ attempted, reason });
    if (!record(item) || !text(item.id, 120) || !text(item.location, 300) || !text(item.quote, 2_000) || !text(item.effect, 2_000) || !text(item.action, 2_000) || !finiteInRange(item.confidence, 0, 1)) { discard("field_invalid"); continue; }
    if (diagnostics.some(d => d.id === item.id)) { discard("duplicate_id"); continue; }
    const locatedDiagnosticQuote = locateVerbatim(item.quote, sources);
    if (!locatedDiagnosticQuote) { discard("quote_not_in_source"); continue; }
    const evidenceIds = readEvidenceIds(item.evidenceIds, knownEvidence);
    const hasObservationEvidence = evidenceIds?.some((id) => {
      const linked = evidence.find((entry) => entry.id === id);
      return observationEvidence.has(id) && Boolean(linked?.quote && overlapsInSource(linked.quote, locatedDiagnosticQuote, sources));
    });
    if (!evidenceIds || !hasObservationEvidence) { discard("no_observation_evidence"); continue; }
    if (isProofreadingClaim(item.effect, item.action)) { discard("proofreading_not_allowed"); continue; }
    // 判据 ID 校验：引用了本次未注入的编号 → 丢弃该条（防模型自造编号）
    const rawCriteria = Array.isArray(item.criteriaIds)
      ? item.criteriaIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map(x => x.trim().replace(/@.*$/, ""))
      : [];
    if (!rawCriteria.length) { discard("missing_criteria"); continue; }
    const known = new Set(injectedCriteriaIds());
    const unknown = rawCriteria.filter(id => !known.has(id));
    if (unknown.length) { discard("unknown_criteria"); continue; }
    const criteriaEvaluation = readCriteriaEvaluation(item.criteriaEvaluation, countableEvidence);
    diagnostics.push({
      id: item.id, location: item.location, quote: locatedDiagnosticQuote, effect: item.effect, action: item.action,
      confidence: item.confidence, evidenceIds, criteriaIds: stampCriteriaVersion(rawCriteria),
      ...(criteriaEvaluation ? { criteriaEvaluation } : {}),
      ...(text(item.trainingExerciseId, 120) ? { trainingExerciseId: item.trainingExerciseId } : {}),
    });
  }
  if (!diagnostics.length) return fail(`diagnostics 全部未通过校验：${discardedDiagnostics.map(d => d.reason).join("、")}`);
  const supplied = value.retrievalEvidence === undefined ? [] : value.retrievalEvidence;
  if (!Array.isArray(supplied) || supplied.length > 8) return fail("retrievalEvidence 应为不超过 8 项的数组");
  const allowedRetrieval = new Map((evidenceValue.retrievalEvidence ?? []).map((item) => [item.retrievalId, item]));
  const degradedRetrievalIds: string[] = [];
  const retrievalEvidence: RetrievalEvidence[] = [];
  for (const [i, item] of supplied.entries()) {
    if (!record(item) || !text(item.retrievalId, 200)) {
      if (!allowedRetrieval.size) continue;
      return fail(`retrievalEvidence[${i}].retrievalId 缺失或无效`);
    }
    if (!allowedRetrieval.size) { degradedRetrievalIds.push(item.retrievalId); continue; }
    const verified = allowedRetrieval.get(item.retrievalId);
    if (!verified) return fail(`retrievalEvidence[${i}].retrievalId 不在服务端检索结果中`);
    retrievalEvidence.push(verified);
  }
  return { sourceKind: effectiveKind, domainAnalysis, analysis, evidence, relationGraph, paceCurve, emotionCurve, themeHeatmap: themeHeatmap as LiteraryAnalysisResult["themeHeatmap"], styleProfile: { metrics: metrics as LiteraryAnalysisResult["styleProfile"]["metrics"] }, diagnostics, discardedDiagnostics, degraded, retrievalEvidence, ...(degradedRetrievalIds.length ? { degradedRetrievalIds } : {}) };
}

function readMentor(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext): MentorResponse | null {
  if (!record(value) || !record(value.mentor)) return null;
  const mentor = value.mentor;
  if (!text(mentor.thesis, 2_000) || !Array.isArray(mentor.evidence) || mentor.evidence.length > 20) return null;
  const sources = userTexts(context, evidenceValue);
  const retrievalById = new Map((evidenceValue.retrievalEvidence ?? []).map((item) => [item.retrievalId, item]));
  // 对不上原文的引文只丢那一条，不连坐其余分析。
  const evidence = mentor.evidence.map((item) => {
    if (!record(item) || !text(item.quote, 2_000) || (item.source !== "observation" && item.source !== "inference" && item.source !== "knowledge")) return null;
    if (item.source === "observation" && !exactQuoteExists(item.quote, sources)) return null;
    if (item.source === "knowledge") {
      if (!text(item.retrievalId, 200)) return null;
      const retrieval = retrievalById.get(item.retrievalId);
      if (!retrieval || (!retrieval.content.includes(item.quote) && !retrieval.quote.includes(item.quote))) return null;
    }
    return { quote: item.quote, source: item.source, ...(text(item.note, 2_000) ? { note: item.note } : {}), ...(text(item.retrievalId, 200) ? { retrievalId: item.retrievalId } : {}) };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!evidence.length) return null;
  // 「为什么这样写」的五个板块，缺一块不该让整段解释作废——缺的给空数组。
  const craft = textList(mentor.craft, 12, false) ?? [];
  const effect = textList(mentor.effect, 12, false) ?? [];
  const consistency = textList(mentor.consistency, 12, false) ?? [];
  const experiments = textList(mentor.experiments, 12, false) ?? [];
  const questions = textList(mentor.questions, 12, false) ?? [];
  if (!craft.length && !effect.length) return null;
  // references 连的是知识库检索，没有检索结果时它本来就是空的，不能当必填。
  const rawReferences = Array.isArray(mentor.references) ? mentor.references : [];
  const references = rawReferences.map((item) => {
    if (!record(item) || !text(item.title, 300) || !text(item.sourceTitle, 300) || !text(item.note, 2_000) || !text(item.retrievalId, 200)) return null;
    const retrieval = retrievalById.get(item.retrievalId);
    if (!retrieval || item.sourceStatus !== retrieval.sourceStatus) return null;
    return { title: item.title, sourceTitle: item.sourceTitle, note: item.note, retrievalId: item.retrievalId, sourceStatus: retrieval.sourceStatus };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return { thesis: mentor.thesis, evidence: evidence as MentorResponse["evidence"], craft, effect, consistency, experiments, questions, references: references as MentorResponse["references"] };
}

function readStoryDirection(value: unknown) {
  if (!record(value) || !record(value.direction)) return null;
  const direction = value.direction;
  // 套壳任务：标签只是给用户的快捷入口，模型多给几个不在白名单的词没有危害，
  // 过滤掉就行——为这个整包回退，用户拿到的是演示数据，代价远大于收益。
  const risks = uniqueTexts(direction.risks, 8) ?? [];
  const suggestedTags = (uniqueTexts(direction.suggestedTags, 6, false) ?? []).filter((tag) => STORY_DIRECTION_TAGS.has(tag));
  if (!text(direction.understanding, 2_000) || !text(direction.recommendation, 2_000) || !text(direction.question, 1_000)) return null;
  return { direction: { understanding: direction.understanding, recommendation: direction.recommendation, risks, question: direction.question, suggestedTags } };
}

function readConsistency(value: unknown, context: StoryContext, mode: "live" | "demo", evidenceValue: PayloadEvidenceContext) {
  if (!record(value) || !record(value.consistencyReport) || !evidenceValue.candidate) return null;
  const report = value.consistencyReport;
  // checkedAt 是服务端事实，模型不该被要求复述时间戳——原来把它设成必填，
  // 导致模型每次正确的检查结果都被整包拒掉。
  if (!Array.isArray(report.findings) || report.findings.length > 20) return null;
  const checkedAt = text(report.checkedAt, 100) ? report.checkedAt : new Date().toISOString();
  const priorSources = [...projectTexts(context, evidenceValue), ...lockedFacts(context)];
  const ids = new Set<string>();
  const findings = report.findings.map((item) => {
    const category = normalizeConsistencyCategory(item?.category);
    const severity = normalizeConsistencySeverity(item?.severity);
    if (!record(item) || !category || !severity || !text(item.expectedFact, 2_000) || !text(item.candidateQuote, 2_000) || !evidenceValue.candidate!.text.includes(item.candidateQuote) || !text(item.priorEvidence, 2_000) || !exactQuoteExists(item.priorEvidence, priorSources) || !text(item.suggestion, 2_000)) return null;
    const id = text(item.id, 120) && !ids.has(item.id) ? item.id : `finding-${ids.size + 1}`;
    ids.add(id);
    return { id, category, severity, expectedFact: item.expectedFact, candidateQuote: item.candidateQuote, priorEvidence: item.priorEvidence, suggestion: item.suggestion };
  });
  // 放宽：个别条目不可核验就丢该条，其余照常返回。
  // 「没发现矛盾」是正常结果，返回空数组而不是回退——这条最重要：
  // 为了给点什么而编一条矛盾，比不给更糟。
  return { consistencyReport: { candidateId: evidenceValue.candidate.id, contextRevision: evidenceValue.candidate.revision, findings: findings.filter((item): item is ConsistencyFinding => item !== null), checkedAt, mode, userConfirmation: "none" as const } };
}

function readKnowledgeExtract(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext) {
  if (record(value)) value = normalizeModelPayload(value as Record<string, unknown>);
  if (!record(value) || !isSourceKind(value.sourceKind)) return null;
  // 与 analysis-v2 同一条纪律：局部坏掉只丢局部，不整包作废。
  // 之前这里是全或无——一条边的证据引用了检索 id，整张图就没了。
  const dropped: string[] = [];
  const drop = (reason: string): null => {
    dropped.push(reason);
    return null;
  };
  const evidence = readEvidence(value.evidence, context, evidenceValue, fail => drop(fail));
  if (!evidence) return null;
  const observationEvidence = new Set(evidence.filter((item) => item.source === "observation" || item.source === "user").map((item) => item.id));
  if (observationEvidence.size === 0) return null;
  // lenient：坏节点/坏边丢掉，剩下的照常返回
  const knowledgeGraph = readGraph(value.knowledgeGraph, observationEvidence, value.sourceKind, true);
  if (!knowledgeGraph || !knowledgeGraph.nodes.length) return null;
  return { knowledgeGraph, evidence, sourceKind: value.sourceKind };
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
  // 这条红线不能松：训练反馈不许返回可直接提交的替代成稿。
  if (["replacement", "replacementProse", "prose"].some((key) => key in feedback)) return null;
  const strengths = textList(feedback.strengths, 12, false);
  const issues = textList(feedback.issues, 12, false);
  const questions = textList(feedback.questions, 12) ?? [];
  const quoteSources = [evidenceValue.answer, evidenceValue.sourceText].filter((item): item is string => typeof item === "string");
  // 引文对不上原文的，只丢那一条；一条都对不上就给空数组，由前端提示「未给出证据」。
  const evidenceQuotes = (uniqueTexts(feedback.evidenceQuotes, 12, false) ?? []).filter((quote) => exactQuoteExists(quote, quoteSources));
  if (!strengths || !issues || !text(feedback.nextExperiment, 2_000)) return null;
  if (!Array.isArray(feedback.scores) || feedback.scores.length === 0 || feedback.scores.length > 16) return null;
  // reason 是可选的：prompt 示例里从来没要求过它，这里硬要等于「模型答对了却被判错」。
  const scores = feedback.scores.map((item) => record(item) && text(item.dimension, 200) && TRAINING_FEEDBACK_DIMENSION_SET.has(item.dimension) && finiteInRange(item.score, 0, 100)
    ? { dimension: item.dimension, score: item.score, reason: text(item.reason, 2_000) ? item.reason : "" }
    : null);
  const cleanScores = scores.filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!cleanScores.length) return null;
  const result: TrainingFeedbackResult = { strengths, evidenceQuotes, issues, nextExperiment: feedback.nextExperiment, questions, scores: cleanScores };
  const bindings = trainingBindings(feedback.evidenceBindings, result);
  if (bindings.length) result.evidenceBindings = bindings;
  if (text(feedback.teacherNote, 600)) result.teacherNote = feedback.teacherNote;
  return { trainingFeedback: result };
}

function readLegacyAnalysis(value: unknown, context: StoryContext, evidenceValue: PayloadEvidenceContext): Extract<AiTaskPayload, { characterGraph: StoryState["characterGraph"] }> | null {
  // 这个任务前端已经不用了（新界面走 analysis-v2），留着只为兼容旧接口。
  // 既然没人消费，就不该为单个字段缺失去回退——形状大致对就接受。
  if (!record(value) || !Array.isArray(value.analysis) || !Array.isArray(value.evidence)) return null;

  const sources = userTexts(context, evidenceValue);
  const evidence = value.evidence.map((item): Evidence | null => {
    // 旧接口的证据枚举是 user / knowledge / inference，但模型按新口径给的是
    // observation。同一件事两种叫法，按 user 处理（同样要逐字校验），不因此判死。
    const rawSource = record(item) ? (item.source === "observation" ? "user" : item.source) : item;
    if (!record(item) || !text(item.id, 120) || !isEvidenceSource(rawSource) || !text(item.quote, 2_000) || !text(item.note, 2_000)) return null;
    if (rawSource === "user" && !exactQuoteExists(item.quote, sources)) return null;
    if (rawSource === "knowledge") return null;
    return { id: item.id, source: rawSource, quote: item.quote, note: item.note, chapter: text(item.chapter, 300) ? item.chapter : "" };
  });
  const cleanEvidence = evidence.filter((item): item is Evidence => item !== null);
  if (!cleanEvidence.length) return null;
  const evidenceIdSet = new Set(cleanEvidence.map((item) => item.id));

  const analysis = value.analysis.map((item): AnalysisDimension | null => {
    if (!record(item) || !text(item.id, 120) || !text(item.name, 200) || !text(item.summary, 2_000) || !text(item.impact, 2_000) || !text(item.suggestion, 2_000) || !finiteInRange(item.score, 0, 100)) return null;
    const evidenceIds = readEvidenceIds(item.evidenceIds, evidenceIdSet);
    return evidenceIds ? { id: item.id, name: item.name, summary: item.summary, impact: item.impact, suggestion: item.suggestion, score: item.score, evidenceIds } : null;
  });
  const cleanAnalysis = analysis.filter((item): item is AnalysisDimension => item !== null);
  if (!cleanAnalysis.length) return null;

  const rawGraph = record(value.characterGraph) ? value.characterGraph : {};
  const rawNodes = Array.isArray(rawGraph.nodes) ? rawGraph.nodes : [];
  const nodes = rawNodes.map((item): GraphNode | null => {
    if (!record(item) || !text(item.id, 120) || !text(item.label, 300) || !isGraphNodeType(item.type)) return null;
    return { id: item.id, label: item.label, type: item.type, ...(text(item.description, 2_000) ? { description: item.description } : {}) };
  });
  const cleanNodes = nodes.filter((item): item is GraphNode => item !== null);
  const nodeIdSet = new Set(cleanNodes.map((item) => item.id));

  const rawEdges = Array.isArray(rawGraph.edges) ? rawGraph.edges : [];
  const edges = rawEdges.map((item): GraphEdge | null => {
    if (!record(item) || !text(item.id, 120) || !text(item.source, 120) || !text(item.target, 120) || !nodeIdSet.has(item.source) || !nodeIdSet.has(item.target) || !text(item.label, 300)) return null;
    const sourceEvidenceIds = item.sourceEvidenceIds === undefined ? undefined : uniqueTexts(item.sourceEvidenceIds, 20);
    if (sourceEvidenceIds === null || sourceEvidenceIds?.some((id) => !evidenceIdSet.has(id))) return null;
    if (item.confidence !== undefined && !finiteInRange(item.confidence, 0, 1)) return null;
    if (item.evidenceSource !== undefined && !isEvidenceSource(item.evidenceSource)) return null;
    return { id: item.id, source: item.source, target: item.target, label: item.label, ...(sourceEvidenceIds === undefined ? {} : { sourceEvidenceIds }), ...(item.confidence === undefined ? {} : { confidence: item.confidence }), ...(item.evidenceSource === undefined ? {} : { evidenceSource: item.evidenceSource }) };
  });
  const cleanEdges = edges.filter((item): item is GraphEdge => item !== null);

  const readCurve = (curve: unknown[]) => curve.map((item) => record(item) && text(item.beat, 200) && finiteInRange(item.value, -100, 100) && text(item.evidenceId, 120) && evidenceIdSet.has(item.evidenceId) ? { beat: item.beat, value: item.value, evidenceId: item.evidenceId } : null);
  const plotCurve = readCurve(Array.isArray(value.plotCurve) ? value.plotCurve : []);
  const emotionCurve = readCurve(Array.isArray(value.emotionCurve) ? value.emotionCurve : []);

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
  // evidence 模型有时给字符串、有时给数组。两种都收——为格式差异整包拒绝不值得。
  const evidence = feedback.evidence === undefined ? undefined
    : Array.isArray(feedback.evidence)
      ? feedback.evidence.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 12).join("；")
      : (text(feedback.evidence, 2_000) ? feedback.evidence : null);
  if (evidence === null || strengths === null || questions === null || (feedback.issue !== undefined && !text(feedback.issue, 2_000)) || (feedback.nextStep !== undefined && !text(feedback.nextStep, 2_000))) return null;
  return { feedback: { ...(strengths === undefined ? {} : { strengths }), ...(evidence === undefined ? {} : { evidence }), ...(feedback.issue === undefined ? {} : { issue: feedback.issue }), ...(feedback.nextStep === undefined ? {} : { nextStep: feedback.nextStep }), ...(questions === undefined ? {} : { questions }) } };
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
