import { initialStoryState } from "@/data/mock-data";
import type {
  AnalysisDimension,
  AnalysisSnapshot,
  BlueprintNode,
  Candidate,
  Chapter,
  Character,
  ConsistencyFinding,
  ConsistencyReport,
  Evidence,
  GraphEdge,
  GraphNode,
  ImageGenerationSettings,
  IpAssetMetadata,
  KnowledgeGraph,
  LiteraryDomainAnalysis,
  LiteraryDomainFinding,
  LiterarySourceKind,
  LiteraryThemeStage,
  Project,
  StoryDirectionMessage,
  StoryState,
  Version,
  WorldEntry,
} from "@/lib/types";
import demoCases from "../../incoming/demo_projects/demo_cases.json";

export const STORY_STORE_KEY = "story-forge:projects:v3";
export const PREVIOUS_STORY_STORE_KEY = "story-forge:projects:v2";
export const LEGACY_STORY_STORE_KEY = "story-forge:projects:v1";

export type ProjectDocument = Omit<StoryState, "projects" | "activeProjectId"> & {
  project: Project;
};

export interface StoryStore {
  version: 3;
  documents: Record<string, ProjectDocument>;
}

interface LegacyIpAssetMetadata extends Omit<IpAssetMetadata, "requestedSettings"> {
  requestedSettings?: unknown;
  generationSettings?: unknown;
}

interface LegacyCandidate {
  id: string;
  label: string;
  content: string;
  rationale: string;
  tags: string[];
  status: Candidate["status"];
  generatedRevision?: number;
  mode?: Candidate["mode"];
  target?: { type: Candidate["target"]["type"]; id?: string };
  applyMode?: Candidate["applyMode"];
  selection?: { from: number; to: number; text: string };
}

type LegacyVersion = Omit<Version, "chapterId"> & { chapterId?: string };

interface LegacyProjectDocument extends Omit<Partial<ProjectDocument>, "blueprint" | "candidates" | "chapters" | "characters" | "imageGenerationSettings" | "ipAssets" | "versions" | "worldEntries"> {
  project: Project;
  blueprint?: Array<Omit<BlueprintNode, "order"> & { order?: number }>;
  candidates?: LegacyCandidate[];
  chapters?: Array<Omit<Chapter, "order"> & { order?: number }>;
  characters?: Array<Omit<Character, "order"> & { order?: number }>;
  imageGenerationSettings?: Partial<ImageGenerationSettings>;
  ipAssets?: LegacyIpAssetMetadata[];
  versions?: LegacyVersion[];
  worldEntries?: WorldEntry[];
  world?: { era?: string; place?: string; rules?: string; atmosphere?: string };
}

interface LegacyStoryStore {
  version: 1;
  documents: Record<string, LegacyProjectDocument>;
}

interface PreviousStoryStore {
  version: 2;
  documents: Record<string, LegacyProjectDocument>;
}

function createExtensionDefaults() {
  return {
    dialogueThreads: [],
    imageGenerationSettings: { prompt: "", negativePrompt: "", model: "Qwen/Qwen-Image", size: "1328x1328", advanced: {} },
    analysisSnapshots: [],
    consistencyReports: [],
    trainingAttemptRefs: [],
  } satisfies Required<Pick<ProjectDocument, "dialogueThreads" | "imageGenerationSettings" | "analysisSnapshots" | "consistencyReports" | "trainingAttemptRefs">>;
}

type DemoCase = {
  id: string;
  is_primary_defense_case: boolean;
  title: string;
  genre: string;
  logline: string;
  worldbuilding: { era: string; location: string; social_background: string; core_rules: string };
  character_cards: Array<{ id: string; name: string; role: string; traits: string[]; desire: string; fear?: string; internal_conflict?: string }>;
  blueprint_5_stages: Array<{ stage: string; name: string; summary: string }>;
  analysis_focus: { character_network: string; thematic_depth: string; imagery_system: string[] };
};

function createImportedDemoDocument(source: DemoCase): ProjectDocument {
  const id = source.is_primary_defense_case ? "demo" : `demo-${source.id.toLowerCase()}`;
  const chapterContent = source.blueprint_5_stages.slice(0, 3).map((beat) => `${beat.name}。${beat.summary}`).join("\n\n");
  const evidence = source.blueprint_5_stages.slice(0, 3).map((beat, index) => ({ id: `E${index + 1}`, source: index === 1 ? "knowledge" as const : "user" as const, quote: beat.summary, note: index === 1 ? "该转折对应当前蓝图中的因果推进。" : "来自当前作品的已导入答辩素材。", chapter: "第一章" }));
  const dimensions = ["人物", "情节", "主题", "意象", "语言", "情绪"].map((name, index) => ({ id: `analysis-${index + 1}`, name, summary: index === 0 ? source.analysis_focus.character_network : index === 1 ? "五段式蓝图已形成明确的推进层次。" : index === 2 ? source.analysis_focus.thematic_depth : `${source.analysis_focus.imagery_system[index % source.analysis_focus.imagery_system.length]}形成可追踪的写作线索。`, impact: "可在诊断页继续核对文本证据与下一步修改方向。", suggestion: "下一稿保留一个具体动作或声音细节，让设定进入人物选择。", score: 78 + (index % 3) * 4, evidenceIds: [evidence[index % evidence.length]?.id ?? "E1"] }));
  const characterNodes = source.character_cards.map((character) => ({ id: character.id, label: character.name, type: "character" as const }));
  return {
    ...createExtensionDefaults(),
    project: { id, title: source.title, genre: source.genre, logline: source.logline, updatedAt: "已导入答辩案例", wordCount: chapterContent.replace(/\s/g, "").length, status: "writing" },
    activeChapterId: `${id}-chapter-1`,
    contextRevision: 1,
    workflowStage: "complete",
    chapters: [{ id: `${id}-chapter-1`, title: source.blueprint_5_stages[0]?.name ?? "第一章", content: chapterContent, wordCount: chapterContent.replace(/\s/g, "").length, summary: source.blueprint_5_stages[0]?.summary ?? "", order: 0 }],
    characters: source.character_cards.map((character, index) => ({ id: character.id, name: character.name, role: character.role, desire: character.desire, flaw: character.traits[0] ?? "未填写", arc: character.internal_conflict ?? character.traits.join("、"), fear: character.fear ?? "", notes: character.traits.join("、"), locked: index === 0, order: index })),
    worldEntries: [
      { id: `${id}-world-era`, category: "时代", label: "时间", content: source.worldbuilding.era, locked: true, order: 0 },
      { id: `${id}-world-place`, category: "地点", label: "地点", content: source.worldbuilding.location, locked: true, order: 1 },
      { id: `${id}-world-rules`, category: "规则", label: "核心规则", content: source.worldbuilding.core_rules, locked: true, order: 2 },
      { id: `${id}-world-atmosphere`, category: "氛围", label: "社会背景", content: source.worldbuilding.social_background, locked: false, order: 3 },
    ],
    blueprint: source.blueprint_5_stages.map((beat, index) => ({ id: `${id}-blueprint-${index + 1}`, title: beat.name, beatType: beat.stage, summary: beat.summary, active: index === 0, locked: index === 0, order: index })),
    candidates: [{
      id: `${id}-candidate-snapshot`,
      label: "声音线索推进",
      content: "风穿过废弃输送带时，旧钢索发出一个不属于草原的低音。杭盖停下录音，第一次在噪声里听见舅舅年轻时哼过的曲调。",
      rationale: "以声音线索连接人物记忆与工业遗址。",
      tags: ["案例快照", "声音叙事"],
      status: "pending",
      target: { type: "chapter", id: `${id}-chapter-1` },
      applyMode: "append",
      generatedRevision: 0,
      mode: "demo",
    }],
    ipAssets: [],
    versions: [{ id: `${id}-version-1`, versionNo: 1, chapterId: `${id}-chapter-1`, content: chapterContent, source: "manual", createdAt: "已导入" }],
    evidence,
    analysis: dimensions,
    characterGraph: { nodes: characterNodes, edges: characterNodes.slice(1).map((node, index) => ({ id: `${id}-relation-${index + 1}`, source: characterNodes[0]?.id ?? node.id, target: node.id, label: index === 0 ? "核心关系" : "共同处境" })) },
    knowledge: structuredClone(initialStoryState.knowledge),
    plotCurve: source.blueprint_5_stages.map((beat, index) => ({ beat: beat.name, value: 25 + index * 16, evidenceId: evidence[index % evidence.length]?.id ?? "E1" })),
    emotionCurve: source.blueprint_5_stages.map((beat, index) => ({ beat: beat.name, value: -35 + index * 18, evidenceId: evidence[index % evidence.length]?.id ?? "E1" })),
  };
}

function createDemoDocument(project: Project): ProjectDocument {
  const state = structuredClone(initialStoryState);
  return {
    ...createExtensionDefaults(),
    project,
    chapters: state.chapters,
    characters: state.characters,
    activeChapterId: state.activeChapterId,
    contextRevision: state.contextRevision,
    workflowStage: state.workflowStage,
    worldEntries: state.worldEntries,
    blueprint: state.blueprint,
    candidates: state.candidates,
    ipAssets: state.ipAssets,
    versions: state.versions,
    evidence: state.evidence,
    analysis: state.analysis,
    characterGraph: state.characterGraph,
    knowledge: state.knowledge,
    plotCurve: state.plotCurve,
    emotionCurve: state.emotionCurve,
  };
}

function sanitizeProject(project: Project, id: string): Project {
  return {
    id,
    title: project.title,
    genre: project.genre,
    logline: project.logline,
    updatedAt: project.updatedAt,
    wordCount: project.wordCount,
    status: project.status,
  };
}

function filterStrings(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
}

function sanitizeChapter(chapter: Omit<Chapter, "order"> & { order?: number }, index: number): Chapter {
  return {
    id: chapter.id,
    title: chapter.title,
    content: chapter.content,
    wordCount: chapter.wordCount,
    summary: chapter.summary ?? "",
    order: chapter.order ?? index,
  };
}

function sanitizeCharacter(character: Omit<Character, "order"> & { order?: number }, index: number): Character {
  return {
    id: character.id,
    name: character.name,
    role: character.role,
    desire: character.desire,
    flaw: character.flaw,
    arc: character.arc,
    fear: character.fear ?? "",
    notes: character.notes ?? "",
    locked: character.locked ?? false,
    order: character.order ?? index,
  };
}

function sanitizeWorldEntry(entry: WorldEntry, index: number): WorldEntry {
  return {
    id: entry.id,
    category: entry.category,
    label: entry.label,
    content: entry.content,
    locked: entry.locked ?? false,
    order: entry.order ?? index,
  };
}

function sanitizeBlueprintNode(node: Omit<BlueprintNode, "order"> & { order?: number }, index: number): BlueprintNode {
  return {
    id: node.id,
    title: node.title,
    beatType: node.beatType,
    summary: node.summary,
    ...(node.active === undefined ? {} : { active: node.active }),
    locked: node.locked ?? false,
    order: node.order ?? index,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeAssetSettings(value: unknown): ImageGenerationSettings | undefined {
  if (!isRecord(value)
    || typeof value.prompt !== "string"
    || typeof value.negativePrompt !== "string"
    || typeof value.model !== "string"
    || typeof value.size !== "string"
    || !isRecord(value.advanced)) return undefined;
  const advanced = Object.fromEntries(Object.entries(value.advanced).filter((entry): entry is [string, string | number | boolean] => {
    const item = entry[1];
    return typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item));
  }));
  return { prompt: value.prompt, negativePrompt: value.negativePrompt, model: value.model, size: value.size, advanced };
}

function sanitizeIpAsset(asset: LegacyIpAssetMetadata): IpAssetMetadata {
  const requestedSettings = sanitizeAssetSettings(asset.requestedSettings) ?? sanitizeAssetSettings(asset.generationSettings);
  const providerRequest = isRecord(asset.providerRequest) && typeof asset.providerRequest.model === "string" && typeof asset.providerRequest.prompt === "string"
    ? { model: asset.providerRequest.model, prompt: asset.providerRequest.prompt }
    : undefined;
  return {
    id: asset.id,
    kind: asset.kind,
    title: asset.title,
    ...(asset.characterId === undefined ? {} : { characterId: asset.characterId }),
    mode: asset.mode,
    previewUrl: asset.previewUrl,
    createdAt: asset.createdAt,
    confirmed: asset.confirmed,
    ...(asset.providerTaskId === undefined ? {} : { providerTaskId: asset.providerTaskId }),
    ...(requestedSettings === undefined ? {} : { requestedSettings }),
    ...(providerRequest === undefined ? {} : { providerRequest }),
    ...(asset.failureStage === undefined ? {} : { failureStage: asset.failureStage }),
  };
}

function sanitizeVersion(version: LegacyVersion, fallbackChapterId: string, chapters: ProjectDocument["chapters"]): Version | null {
  const chapterId = version.chapterId === undefined ? fallbackChapterId : version.chapterId;
  if (!chapterId || !chapters.some((chapter) => chapter.id === chapterId)) return null;
  return {
    id: version.id,
    versionNo: version.versionNo,
    chapterId,
    content: version.content,
    source: version.source,
    createdAt: version.createdAt,
  };
}

function sanitizeEvidence(evidence: Evidence): Evidence {
  return {
    id: evidence.id,
    source: evidence.source,
    quote: evidence.quote,
    note: evidence.note,
    chapter: evidence.chapter,
  };
}

function sanitizeAnalysisDimension(dimension: AnalysisDimension): AnalysisDimension {
  return {
    id: dimension.id,
    name: dimension.name,
    summary: dimension.summary,
    impact: dimension.impact,
    suggestion: dimension.suggestion,
    score: dimension.score,
    evidenceIds: filterStrings(dimension.evidenceIds),
  };
}

function sanitizeGraphNode(node: GraphNode): GraphNode {
  return {
    id: node.id,
    label: node.label,
    type: node.type,
    ...(node.era === undefined ? {} : { era: node.era }),
    ...(node.themes === undefined ? {} : { themes: filterStrings(node.themes) }),
    ...(node.techniques === undefined ? {} : { techniques: filterStrings(node.techniques) }),
    ...(node.description === undefined ? {} : { description: node.description }),
    ...(node.evidenceIds === undefined ? {} : { evidenceIds: filterStrings(node.evidenceIds) }),
  };
}

function sanitizeGraphEdge(edge: GraphEdge): GraphEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    ...(edge.sourceEvidenceIds === undefined ? {} : { sourceEvidenceIds: filterStrings(edge.sourceEvidenceIds) }),
    ...(edge.evidenceIds === undefined ? {} : { evidenceIds: filterStrings(edge.evidenceIds) }),
    ...(edge.confidence === undefined ? {} : { confidence: edge.confidence }),
    ...(edge.evidenceSource === undefined ? {} : { evidenceSource: edge.evidenceSource }),
  };
}

function sanitizeAiEvidence(value: unknown): NonNullable<AnalysisSnapshot["evidence"]>[number] | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || (value.source !== "user" && value.source !== "observation" && value.source !== "knowledge" && value.source !== "inference")
    || typeof value.note !== "string"
    || (value.quote !== undefined && typeof value.quote !== "string")
    || (value.claim !== undefined && typeof value.claim !== "string")
    || (value.retrievalId !== undefined && typeof value.retrievalId !== "string")) return null;
  return {
    id: value.id,
    source: value.source,
    note: value.note,
    ...(value.quote === undefined ? {} : { quote: value.quote }),
    ...(value.claim === undefined ? {} : { claim: value.claim }),
    ...(value.retrievalId === undefined ? {} : { retrievalId: value.retrievalId }),
  };
}

function sanitizeThemeHeatmapCell(value: unknown): NonNullable<AnalysisSnapshot["themeHeatmap"]>[number] | null {
  if (!isRecord(value)
    || typeof value.theme !== "string"
    || typeof value.segment !== "string"
    || typeof value.value !== "number"
    || !Number.isFinite(value.value)
    || typeof value.evidenceId !== "string") return null;
  return { theme: value.theme, segment: value.segment, value: value.value, evidenceId: value.evidenceId };
}

function sanitizeStyleMetric(value: unknown): NonNullable<AnalysisSnapshot["styleProfile"]>["metrics"][number] | null {
  if (!isRecord(value)
    || (value.key !== "sentenceLength" && value.key !== "dialogueRatio" && value.key !== "sensoryDensity" && value.key !== "rhetoric" && value.key !== "narrativeDistance" && value.key !== "rhythm")
    || typeof value.dimension !== "string"
    || typeof value.value !== "number"
    || !Number.isFinite(value.value)
    || typeof value.interpretation !== "string"
    || (value.unit !== undefined && typeof value.unit !== "string")
    || !Array.isArray(value.evidenceIds)) return null;
  return {
    key: value.key,
    dimension: value.dimension,
    value: value.value,
    interpretation: value.interpretation,
    ...(value.unit === undefined ? {} : { unit: value.unit }),
    evidenceIds: filterStrings(value.evidenceIds),
  };
}

function sanitizeLiteraryDiagnostic(value: unknown): NonNullable<AnalysisSnapshot["diagnostics"]>[number] | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.location !== "string"
    || typeof value.quote !== "string"
    || typeof value.effect !== "string"
    || typeof value.action !== "string"
    || typeof value.confidence !== "number"
    || !Number.isFinite(value.confidence)
    || !Array.isArray(value.evidenceIds)
    || (value.trainingExerciseId !== undefined && typeof value.trainingExerciseId !== "string")) return null;
  return {
    id: value.id,
    location: value.location,
    quote: value.quote,
    effect: value.effect,
    action: value.action,
    confidence: value.confidence,
    evidenceIds: filterStrings(value.evidenceIds),
    ...(Array.isArray(value.criteriaIds) ? { criteriaIds: filterStrings(value.criteriaIds) } : {}),
    ...(value.trainingExerciseId === undefined ? {} : { trainingExerciseId: value.trainingExerciseId }),
  };
}

function sanitizeRetrievalEvidence(value: unknown): NonNullable<AnalysisSnapshot["retrievalEvidence"]>[number] | null {
  if (!isRecord(value)
    || typeof value.retrievalId !== "string"
    || typeof value.chunkType !== "string"
    || typeof value.content !== "string"
    || typeof value.quote !== "string"
    || (value.sourceStatus !== "verified" && value.sourceStatus !== "pending" && value.sourceStatus !== "summary_only")
    || (value.workId !== undefined && typeof value.workId !== "string")
    || (value.sourceUrl !== undefined && typeof value.sourceUrl !== "string")
    || (value.similarity !== undefined && (typeof value.similarity !== "number" || !Number.isFinite(value.similarity)))) return null;
  return {
    retrievalId: value.retrievalId,
    chunkType: value.chunkType,
    content: value.content,
    quote: value.quote,
    sourceStatus: value.sourceStatus,
    ...(value.workId === undefined ? {} : { workId: value.workId }),
    ...(value.sourceUrl === undefined ? {} : { sourceUrl: value.sourceUrl }),
    ...(value.similarity === undefined ? {} : { similarity: value.similarity }),
  };
}

function sanitizeOptionalArray<T>(value: unknown, sanitizer: (item: unknown) => T | null): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sanitized = value.map(sanitizer);
  return sanitized.some((item) => item === null) ? undefined : sanitized as T[];
}

const ANALYSIS_STYLE_KEYS = new Set(["sentenceLength", "dialogueRatio", "sensoryDensity", "rhetoric", "narrativeDistance", "rhythm"]);
const ARGUMENTATIVE_GRAPH_NODE_TYPES = new Set<GraphNode["type"]>(["work", "author", "era", "theme", "technique", "concept", "argument", "evidence"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function readClosedEvidenceIds(value: unknown, allowed: Set<string>): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isNonEmptyString)) return null;
  const ids = value.map((item) => item.trim());
  return new Set(ids).size === ids.length && ids.every((id) => allowed.has(id)) ? ids : null;
}

function sanitizeStrictRetrievalEvidence(value: unknown): NonNullable<AnalysisSnapshot["retrievalEvidence"]> | null {
  if (!Array.isArray(value) || value.length > 8) return null;
  const entries = value.map(sanitizeRetrievalEvidence);
  if (entries.some((entry) => entry === null)) return null;
  const sanitized = entries as NonNullable<AnalysisSnapshot["retrievalEvidence"]>;
  if (sanitized.some((entry) => !isNonEmptyString(entry.retrievalId)
    || !isNonEmptyString(entry.chunkType)
    || !isNonEmptyString(entry.content)
    || !isNonEmptyString(entry.quote)
    || (entry.similarity !== undefined && !isFiniteInRange(entry.similarity, 0, 1)))) return null;
  return new Set(sanitized.map((entry) => entry.retrievalId)).size === sanitized.length ? sanitized : null;
}

function sanitizeStrictAiEvidence(value: unknown, retrievalIds: Set<string>): NonNullable<AnalysisSnapshot["evidence"]> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null;
  const entries = value.map(sanitizeAiEvidence);
  if (entries.some((entry) => entry === null)) return null;
  const sanitized = entries as NonNullable<AnalysisSnapshot["evidence"]>;
  if (sanitized.some((entry) => {
    if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.note)) return true;
    if (entry.source === "user" || entry.source === "observation") return !isNonEmptyString(entry.quote);
    if (entry.source === "knowledge") return !isNonEmptyString(entry.quote) || !isNonEmptyString(entry.retrievalId) || !retrievalIds.has(entry.retrievalId);
    return !isNonEmptyString(entry.claim) || isNonEmptyString(entry.quote);
  })) return null;
  return new Set(sanitized.map((entry) => entry.id)).size === sanitized.length ? sanitized : null;
}

function sanitizeStrictDomainFindings(value: unknown, observationIds: Set<string>): LiteraryDomainFinding[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) return null;
  const findings = value.map((item) => {
    if (!isRecord(item) || !isNonEmptyString(item.label) || !isNonEmptyString(item.description)) return null;
    const evidenceIds = readClosedEvidenceIds(item.evidenceIds, observationIds);
    return evidenceIds ? { label: item.label.trim(), description: item.description.trim(), evidenceIds } : null;
  });
  return findings.every(Boolean) ? findings as LiteraryDomainFinding[] : null;
}

function sanitizeStrictThemeStages(value: unknown, observationIds: Set<string>): LiteraryThemeStage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) return null;
  const stages = value.map((item) => {
    if (!isRecord(item)
      || !isNonEmptyString(item.stage)
      || !isNonEmptyString(item.theme)
      || !isNonEmptyString(item.change)
      || !isNonEmptyString(item.reason)) return null;
    const evidenceIds = readClosedEvidenceIds(item.evidenceIds, observationIds);
    return evidenceIds ? { stage: item.stage.trim(), theme: item.theme.trim(), change: item.change.trim(), reason: item.reason.trim(), evidenceIds } : null;
  });
  return stages.every(Boolean) ? stages as LiteraryThemeStage[] : null;
}

function sanitizeStrictDomainAnalysis(value: unknown, sourceKind: LiterarySourceKind, observationIds: Set<string>): LiteraryDomainAnalysis | null {
  if (!isRecord(value) || value.kind !== sourceKind || !isRecord(value.themes)) return null;
  const stages = sanitizeStrictThemeStages(value.themes.stages, observationIds);
  if (!stages) return null;
  if (sourceKind === "narrative") {
    if (!isRecord(value.characters) || !isRecord(value.plot)) return null;
    const goals = sanitizeStrictDomainFindings(value.characters.goals, observationIds);
    const actions = sanitizeStrictDomainFindings(value.characters.actions, observationIds);
    const relationshipChanges = sanitizeStrictDomainFindings(value.characters.relationshipChanges, observationIds);
    const turningPoints = sanitizeStrictDomainFindings(value.plot.turningPoints, observationIds);
    const setups = sanitizeStrictDomainFindings(value.plot.setups, observationIds);
    const payoffs = sanitizeStrictDomainFindings(value.plot.payoffs, observationIds);
    return goals && actions && relationshipChanges && turningPoints && setups && payoffs
      ? { kind: "narrative", characters: { goals, actions, relationshipChanges }, plot: { turningPoints, setups, payoffs }, themes: { stages } }
      : null;
  }
  if (!isRecord(value.argument)) return null;
  const claims = sanitizeStrictDomainFindings(value.argument.claims, observationIds);
  const evidenceUnits = sanitizeStrictDomainFindings(value.argument.evidenceUnits, observationIds);
  const reasoningSteps = sanitizeStrictDomainFindings(value.argument.reasoningSteps, observationIds);
  return claims && evidenceUnits && reasoningSteps
    ? { kind: "argumentative", argument: { claims, evidenceUnits, reasoningSteps }, themes: { stages } }
    : null;
}

function sanitizeStrictGraph(value: unknown, observationIds: Set<string>, sourceKind: LiterarySourceKind): KnowledgeGraph | null {
  if (!isRecord(value) || !Array.isArray(value.nodes) || value.nodes.length === 0 || !Array.isArray(value.edges) || value.edges.length === 0) return null;
  const nodes = value.nodes.map((node) => {
    if (!isGraphNode(node) || !isNonEmptyString(node.id) || !isNonEmptyString(node.label)
      || (sourceKind === "argumentative" && !ARGUMENTATIVE_GRAPH_NODE_TYPES.has(node.type))) return null;
    const evidenceIds = readClosedEvidenceIds(node.evidenceIds, observationIds);
    return evidenceIds ? { ...sanitizeGraphNode(node), evidenceIds } : null;
  });
  if (!nodes.every(Boolean)) return null;
  const sanitizedNodes = nodes as GraphNode[];
  const nodeIds = new Set(sanitizedNodes.map((node) => node.id));
  if (nodeIds.size !== sanitizedNodes.length) return null;
  const edges = value.edges.map((edge) => {
    if (!isGraphEdge(edge)
      || !isNonEmptyString(edge.id)
      || !isNonEmptyString(edge.label)
      || !nodeIds.has(edge.source)
      || !nodeIds.has(edge.target)
      || (edge.confidence !== undefined && !isFiniteInRange(edge.confidence, 0, 1))) return null;
    const evidenceIds = readClosedEvidenceIds(edge.evidenceIds ?? edge.sourceEvidenceIds, observationIds);
    return evidenceIds ? { ...sanitizeGraphEdge(edge), evidenceIds } : null;
  });
  if (!edges.every(Boolean)) return null;
  const sanitizedEdges = edges as GraphEdge[];
  return new Set(sanitizedEdges.map((edge) => edge.id)).size === sanitizedEdges.length ? { nodes: sanitizedNodes, edges: sanitizedEdges } : null;
}

function sanitizeStrictCurve(value: unknown, observationIds: Set<string>): ProjectDocument["plotCurve"] | null {
  if (!Array.isArray(value) || value.length > 48) return [];
  const points = value.map((point) => isCurvePoint(point)
    && isNonEmptyString(point.beat)
    && isFiniteInRange(point.value, 0, 100)
    && observationIds.has(point.evidenceId)
    ? sanitizeCurvePoint(point)
    : null);
  // 与校验层一致：一个点也保留，短文本的曲线退化成单点属于正常形态。
  return points.filter(point => point !== null);
}

function sanitizeKnowledgeGraph(graph: KnowledgeGraph): KnowledgeGraph {
  return {
    nodes: graph.nodes.map(sanitizeGraphNode),
    edges: graph.edges.map(sanitizeGraphEdge),
  };
}

function sanitizeCurvePoint(point: ProjectDocument["plotCurve"][number]): ProjectDocument["plotCurve"][number] {
  return { beat: point.beat, value: point.value, evidenceId: point.evidenceId };
}

function sanitizeDirectionMessage(value: unknown): StoryDirectionMessage | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || (value.role !== "user" && value.role !== "assistant")
    || typeof value.content !== "string"
    || !Array.isArray(value.tags)
    || typeof value.createdAt !== "string"
    || typeof value.contextRevision !== "number"
    || !Number.isFinite(value.contextRevision)
    || (value.mode !== undefined && value.mode !== "live" && value.mode !== "demo")
    || (value.warnings !== undefined && !Array.isArray(value.warnings))) return null;
  let direction: StoryDirectionMessage["direction"];
  if (value.direction !== undefined) {
    if (!isRecord(value.direction)
      || typeof value.direction.understanding !== "string"
      || typeof value.direction.recommendation !== "string"
      || !Array.isArray(value.direction.risks)
      || typeof value.direction.question !== "string"
      || !Array.isArray(value.direction.suggestedTags)) return null;
    direction = {
      understanding: value.direction.understanding,
      recommendation: value.direction.recommendation,
      risks: filterStrings(value.direction.risks),
      question: value.direction.question,
      suggestedTags: filterStrings(value.direction.suggestedTags),
    };
  }
  return {
    id: value.id,
    role: value.role,
    content: value.content,
    tags: filterStrings(value.tags),
    createdAt: value.createdAt,
    contextRevision: value.contextRevision,
    ...(direction === undefined ? {} : { direction }),
    ...(value.mode === undefined ? {} : { mode: value.mode }),
    ...(value.warnings === undefined ? {} : { warnings: filterStrings(value.warnings) }),
  };
}

const GRAPH_NODE_TYPES = new Set<GraphNode["type"]>([
  "work", "author", "era", "theme", "technique", "character", "place", "event", "image", "concept", "argument", "evidence",
]);

function isAnalysisDimension(value: unknown): value is AnalysisDimension {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.summary === "string"
    && typeof value.impact === "string"
    && typeof value.suggestion === "string"
    && typeof value.score === "number"
    && Number.isFinite(value.score)
    && Array.isArray(value.evidenceIds);
}

function isGraphNode(value: unknown): value is GraphNode {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.label === "string"
    && typeof value.type === "string"
    && GRAPH_NODE_TYPES.has(value.type as GraphNode["type"])
    && (value.era === undefined || typeof value.era === "string")
    && (value.themes === undefined || Array.isArray(value.themes))
    && (value.techniques === undefined || Array.isArray(value.techniques))
    && (value.description === undefined || typeof value.description === "string");
}

function isGraphEdge(value: unknown): value is GraphEdge {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.source === "string"
    && typeof value.target === "string"
    && typeof value.label === "string"
    && (value.sourceEvidenceIds === undefined || Array.isArray(value.sourceEvidenceIds))
    && (value.evidenceIds === undefined || Array.isArray(value.evidenceIds))
    && (value.confidence === undefined || (typeof value.confidence === "number" && Number.isFinite(value.confidence)))
    && (value.evidenceSource === undefined || value.evidenceSource === "user" || value.evidenceSource === "knowledge" || value.evidenceSource === "inference");
}

function isCurvePoint(value: unknown): value is ProjectDocument["plotCurve"][number] {
  return isRecord(value)
    && typeof value.beat === "string"
    && typeof value.value === "number"
    && Number.isFinite(value.value)
    && typeof value.evidenceId === "string";
}

function sanitizeStrictAnalysisSnapshot(value: Record<string, unknown>, projectId: string, chapterIds: Set<string>): AnalysisSnapshot | null {
  if (!isNonEmptyString(value.id)
    || !isFiniteInRange(value.contextRevision, 0, Number.MAX_SAFE_INTEGER)
    || !isNonEmptyString(value.createdAt)
    || (value.mode !== "live" && value.mode !== "demo")
    || value.sourceProjectId !== projectId
    || !isNonEmptyString(value.sourceChapterId)
    || !chapterIds.has(value.sourceChapterId)
    || !isNonEmptyString(value.sourceHash)
    || (value.sourceKind !== "narrative" && value.sourceKind !== "argumentative")
    || !Array.isArray(value.warnings)
    || !value.warnings.every((warning) => typeof warning === "string")) return null;

  const retrievalEvidence = sanitizeStrictRetrievalEvidence(value.retrievalEvidence);
  if (!retrievalEvidence) return null;
  const retrievalIds = new Set(retrievalEvidence.map((entry) => entry.retrievalId));
  const evidence = sanitizeStrictAiEvidence(value.evidence, retrievalIds);
  if (!evidence) return null;
  const knownEvidence = new Set(evidence.map((entry) => entry.id));
  const observationIds = new Set(evidence.filter((entry) => entry.source === "observation" || entry.source === "user").map((entry) => entry.id));
  if (observationIds.size === 0) return null;

  const dimensions = Array.isArray(value.analysis) && value.analysis.length <= 24 ? value.analysis : [];
  const analysis = dimensions.filter(isAnalysisDimension).map((dimension) => {
    const evidenceIds = readClosedEvidenceIds(dimension.evidenceIds, knownEvidence);
    return isNonEmptyString(dimension.id)
      && isNonEmptyString(dimension.name)
      && isNonEmptyString(dimension.summary)
      && isNonEmptyString(dimension.impact)
      && isNonEmptyString(dimension.suggestion)
      && isFiniteInRange(dimension.score, 0, 100)
      && evidenceIds
      ? { ...sanitizeAnalysisDimension(dimension), evidenceIds }
      : null;
  }).filter(d => d !== null).filter((d, i, all) => all.findIndex(other => other.id === d.id) === i);

  const domainAnalysis = sanitizeStrictDomainAnalysis(value.domainAnalysis, value.sourceKind, observationIds);
  const characterGraph = sanitizeStrictGraph(value.characterGraph, observationIds, value.sourceKind);
  const plotCurve = sanitizeStrictCurve(value.plotCurve, observationIds);
  const emotionCurve = sanitizeStrictCurve(value.emotionCurve, observationIds);
  if (!domainAnalysis || !characterGraph || !plotCurve || !emotionCurve) return null;

  const cells = Array.isArray(value.themeHeatmap) && value.themeHeatmap.length <= 120 ? value.themeHeatmap : [];
  const themeHeatmap = cells.map((cell) => {
    const sanitized = sanitizeThemeHeatmapCell(cell);
    return sanitized
      && isNonEmptyString(sanitized.theme)
      && isNonEmptyString(sanitized.segment)
      && isFiniteInRange(sanitized.value, 0, 100)
      && observationIds.has(sanitized.evidenceId)
      ? sanitized
      : null;
  }).filter(cell => cell !== null);

  const metrics = isRecord(value.styleProfile) && Array.isArray(value.styleProfile.metrics) ? value.styleProfile.metrics : [];
  const styleMetrics = metrics.map((metric) => {
    const sanitized = sanitizeStyleMetric(metric);
    if (!sanitized || !ANALYSIS_STYLE_KEYS.has(sanitized.key) || !isNonEmptyString(sanitized.dimension) || !isNonEmptyString(sanitized.interpretation)) return null;
    const evidenceIds = readClosedEvidenceIds(sanitized.evidenceIds, observationIds);
    const minimum = sanitized.key === "sentenceLength" ? 1 : 0;
    const maximum = sanitized.key === "sentenceLength" ? 200 : 100;
    return evidenceIds && isFiniteInRange(sanitized.value, minimum, maximum) ? { ...sanitized, evidenceIds } : null;
  }).filter(m => m !== null).filter((m, i, all) => all.findIndex(other => other.key === m.key) === i);

  if (!Array.isArray(value.diagnostics) || value.diagnostics.length === 0 || value.diagnostics.length > 24) return null;
  const diagnostics = value.diagnostics.map((diagnostic) => {
    const sanitized = sanitizeLiteraryDiagnostic(diagnostic);
    if (!sanitized
      || !isNonEmptyString(sanitized.id)
      || !isNonEmptyString(sanitized.location)
      || !isNonEmptyString(sanitized.quote)
      || !isNonEmptyString(sanitized.effect)
      || !isNonEmptyString(sanitized.action)
      || !isFiniteInRange(sanitized.confidence, 0, 1)) return null;
    const evidenceIds = readClosedEvidenceIds(sanitized.evidenceIds, knownEvidence);
    const hasMatchingObservation = evidenceIds?.some((evidenceId) => {
      if (!observationIds.has(evidenceId)) return false;
      const linked = evidence.find((entry) => entry.id === evidenceId);
      return isNonEmptyString(linked?.quote) && (linked.quote.includes(sanitized.quote) || sanitized.quote.includes(linked.quote));
    });
    return evidenceIds && hasMatchingObservation ? { ...sanitized, evidenceIds } : null;
  }).filter(d => d !== null).filter((d, i, all) => all.findIndex(other => other.id === d.id) === i);
  if (!diagnostics.length) return null;

  return {
    id: value.id,
    contextRevision: value.contextRevision,
    createdAt: value.createdAt,
    mode: value.mode,
    sourceProjectId: value.sourceProjectId,
    sourceChapterId: value.sourceChapterId,
    sourceHash: value.sourceHash,
    sourceKind: value.sourceKind,
    domainAnalysis,
    warnings: filterStrings(value.warnings),
    analysis: analysis as AnalysisDimension[],
    characterGraph,
    plotCurve,
    emotionCurve,
    evidence,
    themeHeatmap: themeHeatmap as NonNullable<AnalysisSnapshot["themeHeatmap"]>,
    styleProfile: { metrics: styleMetrics as NonNullable<AnalysisSnapshot["styleProfile"]>["metrics"] },
    diagnostics: diagnostics as NonNullable<AnalysisSnapshot["diagnostics"]>,
    retrievalEvidence,
  };
}

function sanitizeAnalysisSnapshot(value: unknown, projectId: string, chapterIds: Set<string>): AnalysisSnapshot | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.contextRevision !== "number"
    || !Number.isFinite(value.contextRevision)
    || typeof value.createdAt !== "string"
    || (value.mode !== "live" && value.mode !== "demo")
    || !Array.isArray(value.analysis)
    || !value.analysis.every(isAnalysisDimension)
    || !isRecord(value.characterGraph)
    || !Array.isArray(value.characterGraph.nodes)
    || !value.characterGraph.nodes.every(isGraphNode)
    || !Array.isArray(value.characterGraph.edges)
    || !value.characterGraph.edges.every(isGraphEdge)
    || !Array.isArray(value.plotCurve)
    || !value.plotCurve.every(isCurvePoint)
    || !Array.isArray(value.emotionCurve)
    || !value.emotionCurve.every(isCurvePoint)) return null;
  const isStructuredSnapshot = "sourceHash" in value || "sourceKind" in value || "domainAnalysis" in value || "evidence" in value;
  if (isStructuredSnapshot) return sanitizeStrictAnalysisSnapshot(value, projectId, chapterIds);
  const snapshot = value as unknown as AnalysisSnapshot;
  const evidence = sanitizeOptionalArray(value.evidence, sanitizeAiEvidence);
  const themeHeatmap = sanitizeOptionalArray(value.themeHeatmap, sanitizeThemeHeatmapCell);
  const diagnostics = sanitizeOptionalArray(value.diagnostics, sanitizeLiteraryDiagnostic);
  const retrievalEvidence = sanitizeOptionalArray(value.retrievalEvidence, sanitizeRetrievalEvidence);
  const styleMetrics = isRecord(value.styleProfile)
    ? sanitizeOptionalArray(value.styleProfile.metrics, sanitizeStyleMetric)
    : undefined;
  return {
    id: snapshot.id,
    contextRevision: snapshot.contextRevision,
    createdAt: snapshot.createdAt,
    mode: snapshot.mode,
    ...(typeof value.sourceProjectId === "string" ? { sourceProjectId: value.sourceProjectId } : {}),
    ...(typeof value.sourceChapterId === "string" ? { sourceChapterId: value.sourceChapterId } : {}),
    ...(typeof value.sourceHash === "string" ? { sourceHash: value.sourceHash } : {}),
    ...(value.sourceKind === "narrative" || value.sourceKind === "argumentative" ? { sourceKind: value.sourceKind } : {}),
    ...(Array.isArray(value.warnings) ? { warnings: filterStrings(value.warnings) } : {}),
    analysis: snapshot.analysis.map(sanitizeAnalysisDimension),
    characterGraph: sanitizeKnowledgeGraph(snapshot.characterGraph),
    plotCurve: snapshot.plotCurve.map(sanitizeCurvePoint),
    emotionCurve: snapshot.emotionCurve.map(sanitizeCurvePoint),
    ...(evidence === undefined ? {} : { evidence }),
    ...(themeHeatmap === undefined ? {} : { themeHeatmap }),
    ...(styleMetrics === undefined ? {} : { styleProfile: { metrics: styleMetrics } }),
    ...(diagnostics === undefined ? {} : { diagnostics }),
    ...(retrievalEvidence === undefined ? {} : { retrievalEvidence }),
  };
}

function sanitizeConsistencyFinding(value: unknown): ConsistencyFinding | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || value.id.trim().length === 0
    || (value.category !== "character" && value.category !== "world" && value.category !== "plot" && value.category !== "timeline")
    || (value.severity !== "low" && value.severity !== "medium" && value.severity !== "high")
    || typeof value.expectedFact !== "string"
    || value.expectedFact.trim().length === 0
    || typeof value.candidateQuote !== "string"
    || value.candidateQuote.trim().length === 0
    || typeof value.priorEvidence !== "string"
    || value.priorEvidence.trim().length === 0
    || typeof value.suggestion !== "string"
    || value.suggestion.trim().length === 0) return null;
  return {
    id: value.id,
    category: value.category,
    severity: value.severity,
    expectedFact: value.expectedFact,
    candidateQuote: value.candidateQuote,
    priorEvidence: value.priorEvidence,
    suggestion: value.suggestion,
  };
}

function sanitizeConsistencyReport(value: unknown): ConsistencyReport | null {
  if (!isRecord(value)
    || typeof value.candidateId !== "string"
    || typeof value.contextRevision !== "number"
    || !Number.isFinite(value.contextRevision)
    || !Array.isArray(value.findings)
    || typeof value.checkedAt !== "string"
    || (value.mode !== "live" && value.mode !== "demo")
    || (value.userConfirmation !== "none" && value.userConfirmation !== "reviewed" && value.userConfirmation !== "confirmed")) return null;
  const findings = value.findings.map(sanitizeConsistencyFinding);
  if (findings.some((finding) => finding === null)) return null;
  return {
    candidateId: value.candidateId,
    contextRevision: value.contextRevision,
    findings: findings as ConsistencyFinding[],
    checkedAt: value.checkedAt,
    mode: value.mode,
    userConfirmation: value.userConfirmation,
  };
}

export function createStoryStore(): StoryStore {
  const cases = (demoCases as DemoCase[]).slice().sort((left, right) => Number(right.is_primary_defense_case) - Number(left.is_primary_defense_case));
  return {
    version: 3,
    documents: Object.fromEntries(cases.map((source) => {
      const document = createImportedDemoDocument(source);
      return [document.project.id, document];
    })),
  };
}

function legacyWorldEntries(document: LegacyProjectDocument, id: string): WorldEntry[] {
  if (Array.isArray(document.worldEntries)) {
    return document.worldEntries.map(sanitizeWorldEntry);
  }
  const world = document.world ?? {};
  return [
    { id: `${id}-world-era`, category: "时代", label: "时间", content: world.era ?? "", locked: false, order: 0 },
    { id: `${id}-world-place`, category: "地点", label: "地点", content: world.place ?? "", locked: false, order: 1 },
    { id: `${id}-world-rules`, category: "规则", label: "核心规则", content: world.rules ?? "", locked: false, order: 2 },
    { id: `${id}-world-atmosphere`, category: "氛围", label: "氛围", content: world.atmosphere ?? "", locked: false, order: 3 },
  ];
}

function migrateCandidate(candidate: LegacyCandidate, chapters: ProjectDocument["chapters"], revision: number, fallbackChapterId: string): Candidate | null {
  const generatedRevision = candidate.generatedRevision ?? revision;
  const mode = candidate.mode ?? "demo";
  const target = candidate.target;
  if (target?.type === "character" || target?.type === "world" || target?.type === "blueprint") {
    if (!target.id) return null;
    return { ...candidate, generatedRevision, mode, target: { type: target.type, id: target.id }, applyMode: "replace-fields" };
  }
  if (target?.type === "visual-brief" || target?.type === "storyboard") {
    if (!target.id) return null;
    return { ...candidate, generatedRevision, mode, target: { type: target.type, id: target.id }, applyMode: "save-asset" };
  }
  if (target && target.type !== "chapter") return null;
  const chapterId = target?.id === undefined ? fallbackChapterId : target.id;
  if (!chapterId || !chapters.some((chapter) => chapter.id === chapterId)) return null;
  const applyMode = candidate.applyMode === "replace-all" || candidate.applyMode === "replace-selection" ? candidate.applyMode : "append";
  return { ...candidate, generatedRevision, mode, target: { type: "chapter", id: chapterId }, applyMode };
}

function sanitizeCandidate(candidate: LegacyCandidate, chapters: ProjectDocument["chapters"], revision: number, fallbackChapterId: string): Candidate | null {
  const migrated = migrateCandidate(candidate, chapters, revision, fallbackChapterId);
  if (!migrated) return null;
  const base = {
    id: migrated.id,
    label: migrated.label,
    content: migrated.content,
    rationale: migrated.rationale,
    tags: filterStrings(migrated.tags),
    status: migrated.status,
    generatedRevision: migrated.generatedRevision,
    mode: migrated.mode,
  };
  if (migrated.target.type === "character" || migrated.target.type === "world" || migrated.target.type === "blueprint") {
    return { ...base, target: { type: migrated.target.type, id: migrated.target.id }, applyMode: "replace-fields" };
  }
  if (migrated.target.type === "visual-brief" || migrated.target.type === "storyboard") {
    return { ...base, target: { type: migrated.target.type, id: migrated.target.id }, applyMode: "save-asset" };
  }
  const applyMode = migrated.applyMode === "replace-all" || migrated.applyMode === "replace-selection"
    ? migrated.applyMode
    : "append";
  const selection = "selection" in migrated ? migrated.selection : undefined;
  return {
    ...base,
    target: { type: "chapter", id: migrated.target.id },
    applyMode,
    ...(selection === undefined ? {} : {
      selection: { from: selection.from, to: selection.to, text: selection.text },
    }),
  };
}

export function sanitizeProjectDocument(document: LegacyProjectDocument, id = document.project.id): ProjectDocument {
  const project = sanitizeProject(document.project, id);
  const canonical = createDemoDocument(project);
  const chapters = (document.chapters ?? canonical.chapters).map(sanitizeChapter);
  const characters = (document.characters ?? canonical.characters).map(sanitizeCharacter);
  const blueprint = (document.blueprint ?? canonical.blueprint).map(sanitizeBlueprintNode);
  const revision = document.contextRevision ?? 1;
  const fallbackChapterId = document.activeChapterId && chapters.some((chapter) => chapter.id === document.activeChapterId) ? document.activeChapterId : chapters[0]?.id ?? "";
  const candidates = (document.candidates ?? []).map((candidate) => sanitizeCandidate(candidate, chapters, revision, fallbackChapterId)).filter((candidate): candidate is Candidate => candidate !== null);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const defaults = createExtensionDefaults();
  const imageGenerationSettings = document.imageGenerationSettings ?? {};
  const advanced = Object.fromEntries(Object.entries(imageGenerationSettings.advanced ?? {}).filter((entry): entry is [string, string | number | boolean] => {
    const value = entry[1];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  }));
  return {
    project,
    activeChapterId: fallbackChapterId,
    contextRevision: revision,
    workflowStage: document.workflowStage ?? "complete",
    chapters,
    characters,
    worldEntries: legacyWorldEntries(document, id),
    blueprint,
    candidates,
    ipAssets: (document.ipAssets ?? []).map(sanitizeIpAsset),
    dialogueThreads: (Array.isArray(document.dialogueThreads) ? document.dialogueThreads : []).map(sanitizeDirectionMessage).filter((message): message is StoryDirectionMessage => message !== null),
    imageGenerationSettings: {
      prompt: imageGenerationSettings.prompt ?? defaults.imageGenerationSettings.prompt,
      negativePrompt: imageGenerationSettings.negativePrompt ?? defaults.imageGenerationSettings.negativePrompt,
      model: imageGenerationSettings.model ?? defaults.imageGenerationSettings.model,
      size: imageGenerationSettings.size ?? defaults.imageGenerationSettings.size,
      advanced,
    },
    analysisSnapshots: (Array.isArray(document.analysisSnapshots) ? document.analysisSnapshots : []).map((snapshot) => sanitizeAnalysisSnapshot(snapshot, project.id, new Set(chapters.map((chapter) => chapter.id)))).filter((snapshot): snapshot is AnalysisSnapshot => snapshot !== null),
    consistencyReports: (Array.isArray(document.consistencyReports) ? document.consistencyReports : []).map(sanitizeConsistencyReport).filter((report): report is ConsistencyReport => report !== null && candidateIds.has(report.candidateId)),
    trainingAttemptRefs: filterStrings(document.trainingAttemptRefs ?? []),
    versions: (document.versions ?? canonical.versions).map((version) => sanitizeVersion(version, fallbackChapterId, chapters)).filter((version): version is Version => version !== null),
    evidence: (document.evidence ?? canonical.evidence).map(sanitizeEvidence),
    analysis: (document.analysis ?? canonical.analysis).map(sanitizeAnalysisDimension),
    characterGraph: sanitizeKnowledgeGraph(document.characterGraph ?? canonical.characterGraph),
    knowledge: sanitizeKnowledgeGraph(document.knowledge ?? canonical.knowledge),
    plotCurve: (document.plotCurve ?? canonical.plotCurve).map(sanitizeCurvePoint),
    emotionCurve: (document.emotionCurve ?? canonical.emotionCurve).map(sanitizeCurvePoint),
  };
}

function restoreBuiltinDocument(saved: ProjectDocument | undefined, canonical: ProjectDocument): ProjectDocument {
  if (!saved) return canonical;
  const sanitized = sanitizeProjectDocument(saved, canonical.project.id);
  return {
    ...sanitized,
    project: canonical.project,
    activeChapterId: canonical.activeChapterId,
    contextRevision: canonical.contextRevision,
    workflowStage: canonical.workflowStage,
    chapters: canonical.chapters,
    characters: canonical.characters,
    worldEntries: canonical.worldEntries,
    blueprint: canonical.blueprint,
    versions: canonical.versions,
  };
}

export function reconcileStoryStore(saved: StoryStore | PreviousStoryStore | LegacyStoryStore): StoryStore {
  const canonical = createStoryStore();
  const savedEntries = Object.entries(saved.documents).map(([id, document]) => [id, sanitizeProjectDocument(document, id)] as const);
  const builtinEntries = savedEntries.filter(([id]) => id === "demo" || id.startsWith("demo-"));
  const savedPrimary = saved.version === 3
    ? builtinEntries.find(([id]) => id === "demo")?.[1]
    : builtinEntries.find(([, document]) => document.project.title === "回响的草场")?.[1];
  const savedRegression = saved.version === 3
    ? builtinEntries.find(([id]) => id === "demo-demo_002")?.[1]
    : builtinEntries.find(([, document]) => document.project.title === "雾港来信")?.[1];
  const userDocuments = Object.fromEntries(savedEntries.filter(([id]) => id !== "demo" && !id.startsWith("demo-")));

  return {
    version: 3,
    documents: {
      demo: restoreBuiltinDocument(savedPrimary, canonical.documents.demo),
      "demo-demo_002": restoreBuiltinDocument(savedRegression, canonical.documents["demo-demo_002"]),
      ...userDocuments,
    },
  };
}

export function createProjectDocument(input: Pick<Project, "title" | "genre" | "logline">): ProjectDocument {
  const id = `project-${crypto.randomUUID()}`;
  const project: Project = { id, ...input, updatedAt: "刚刚", wordCount: 0, status: "draft" };
  const demo = createDemoDocument(project);
  return {
    ...demo,
    activeChapterId: `${id}-chapter-1`,
    contextRevision: 1,
    workflowStage: "inspiration",
    chapters: [{ id: `${id}-chapter-1`, title: "第一章", content: "", wordCount: 0, summary: "", order: 0 }],
    characters: [],
    worldEntries: [
      { id: `${id}-world-era`, category: "时代", label: "时间", content: "", locked: false, order: 0 },
      { id: `${id}-world-place`, category: "地点", label: "地点", content: "", locked: false, order: 1 },
      { id: `${id}-world-rules`, category: "规则", label: "核心规则", content: "", locked: false, order: 2 },
      { id: `${id}-world-atmosphere`, category: "氛围", label: "氛围", content: "", locked: false, order: 3 },
    ],
    blueprint: ["开端", "冲突", "发展", "转折", "结局"].map((title, index) => ({
      id: `${id}-blueprint-${index + 1}`,
      title,
      beatType: title,
      summary: "",
      active: index === 0,
      locked: false,
      order: index,
    })),
    candidates: [],
    ipAssets: [],
    versions: [],
    evidence: [],
    analysis: [],
    characterGraph: { nodes: [], edges: [] },
    plotCurve: [],
    emotionCurve: [],
  };
}

export function loadStoryStore(): StoryStore | null {
  if (typeof window === "undefined") return null;
  const rawV3 = window.localStorage.getItem(STORY_STORE_KEY);
  const rawV2 = window.localStorage.getItem(PREVIOUS_STORY_STORE_KEY);
  const rawV1 = window.localStorage.getItem(LEGACY_STORY_STORE_KEY);
  const raw = rawV3 ?? rawV2 ?? rawV1;
  if (!raw) return null;
  try {
    const store = JSON.parse(raw) as StoryStore | PreviousStoryStore | LegacyStoryStore;
    if ((store.version !== 1 && store.version !== 2 && store.version !== 3) || !store.documents || typeof store.documents !== "object") return null;
    const migrated = reconcileStoryStore(store);
    if (!rawV3) window.localStorage.setItem(STORY_STORE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

export function saveStoryStore(store: StoryStore) {
  if (typeof window === "undefined") return;
  const documents = Object.fromEntries(Object.entries(store.documents).map(([id, document]) => [id, sanitizeProjectDocument(document, id)]));
  window.localStorage.setItem(STORY_STORE_KEY, JSON.stringify({ version: 3, documents } satisfies StoryStore));
}
