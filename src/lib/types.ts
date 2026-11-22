export type SaveStatus = "idle" | "saving" | "saved" | "failed";
export type CandidateStatus = "pending" | "accepted" | "discarded";
export type EvidenceSource = "user" | "knowledge" | "inference";

export interface StoryDirectionResult {
  understanding: string;
  recommendation: string;
  risks: string[];
  question: string;
  suggestedTags: string[];
}

export interface StoryDirectionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tags: string[];
  createdAt: string;
  contextRevision: number;
  direction?: StoryDirectionResult;
  mode?: "live" | "demo";
  warnings?: string[];
}

export interface ImageGenerationSettings {
  prompt: string;
  negativePrompt: string;
  model: string;
  size: string;
  advanced: Record<string, string | number | boolean>;
}

export interface ConsistencyFinding {
  id: string;
  category: "character" | "world" | "plot" | "timeline";
  severity: "low" | "medium" | "high";
  expectedFact: string;
  candidateQuote: string;
  priorEvidence: string;
  suggestion: string;
}

export interface ConsistencyReport {
  candidateId: string;
  contextRevision: number;
  findings: ConsistencyFinding[];
  checkedAt: string;
  mode: "live" | "demo";
  userConfirmation: "none" | "reviewed" | "confirmed";
}

export interface RetrievalEvidence {
  retrievalId: string;
  workId?: string;
  chunkType: string;
  content: string;
  quote: string;
  sourceStatus: "verified" | "pending" | "summary_only";
  sourceUrl?: string;
  similarity?: number;
}

export type LiterarySourceKind = "narrative" | "argumentative";

export interface AiEvidence {
  verification?: "unverified";
  id: string;
  source: "user" | "observation" | "knowledge" | "inference";
  quote?: string;
  claim?: string;
  note: string;
  retrievalId?: string;
}

export interface CriteriaEvaluation {
  criteriaId: string;
  countedAt: string[];
  result: "pass" | "fail";
  reason: string;
}

export interface LiteraryDiagnostic {
  id: string;
  location: string;
  quote: string;
  effect: string;
  action: string;
  confidence: number;
  evidenceIds: string[];
  trainingExerciseId?: string;
  /**
   * 本条诊断依据的判据编号，形如 ["P3@v1.0"]。
   *
   * 版本号由服务端在校验通过后拼上（见 criteria.ts 的 stampCriteriaVersion），
   * 模型只回填裸 ID（"P3"）——让模型复述版本号只会多一个编造机会。
   */
  criteriaIds?: string[];
  criteriaEvaluation?: CriteriaEvaluation[];
}

export interface LiteraryCurvePoint {
  segment: string;
  value: number;
  evidenceId: string;
}

export interface ThemeHeatmapCell {
  theme: string;
  segment: string;
  value: number;
  evidenceId: string;
}

export interface LiteraryStyleMetric {
  key: "sentenceLength" | "dialogueRatio" | "sensoryDensity" | "rhetoric" | "narrativeDistance" | "rhythm";
  dimension: string;
  value: number;
  unit?: string;
  interpretation: string;
  evidenceIds: string[];
}

export interface LiteraryDomainFinding {
  label: string;
  description: string;
  evidenceIds: string[];
}

export interface LiteraryThemeStage {
  stage: string;
  theme: string;
  change: string;
  reason: string;
  evidenceIds: string[];
}

export type LiteraryDomainAnalysis = {
  kind: "narrative";
  characters: {
    goals: LiteraryDomainFinding[];
    actions: LiteraryDomainFinding[];
    relationshipChanges: LiteraryDomainFinding[];
  };
  plot: {
    turningPoints: LiteraryDomainFinding[];
    setups: LiteraryDomainFinding[];
    payoffs: LiteraryDomainFinding[];
  };
  themes: { stages: LiteraryThemeStage[] };
} | {
  kind: "argumentative";
  argument: {
    claims: LiteraryDomainFinding[];
    evidenceUnits: LiteraryDomainFinding[];
    reasoningSteps: LiteraryDomainFinding[];
  };
  themes: { stages: LiteraryThemeStage[] };
};

export interface LiteraryAnalysisResult {
  discardedDiagnostics?: { attempted: Partial<Pick<LiteraryDiagnostic, "id" | "location" | "quote" | "effect" | "action">>; reason: "field_invalid" | "duplicate_id" | "quote_not_in_source" | "no_observation_evidence" | "proofreading_not_allowed" | "unknown_criteria" | "missing_criteria" }[];
  sourceKind: LiterarySourceKind;
  domainAnalysis: LiteraryDomainAnalysis;
  analysis: AnalysisDimension[];
  evidence: AiEvidence[];
  relationGraph: KnowledgeGraph;
  paceCurve: LiteraryCurvePoint[];
  emotionCurve: LiteraryCurvePoint[];
  themeHeatmap: ThemeHeatmapCell[];
  styleProfile: { metrics: LiteraryStyleMetric[] };
  diagnostics: LiteraryDiagnostic[];
  degradedRetrievalIds?: string[];
  retrievalEvidence: RetrievalEvidence[];
}

export interface TrainingFeedbackResult {
  strengths: string[];
  evidenceQuotes: string[];
  evidenceBindings?: { quote: string; group: "strengths" | "issues"; index: number }[];
  teacherNote?: string;
  issues: string[];
  nextExperiment: string;
  questions: string[];
  scores: Array<{ dimension: string; score: number; reason: string }>;
}

export const TRAINING_FEEDBACK_DIMENSIONS = [
  "证据具体性",
  "动作设计",
  "感官细节",
  "结构节律",
  "语言控制",
  "自主修订",
] as const;

export interface Project {
  id: string;
  title: string;
  genre: string;
  logline: string;
  updatedAt: string;
  wordCount: number;
  status: "writing" | "analysis" | "draft";
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  summary: string;
  order: number;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  desire: string;
  flaw: string;
  arc: string;
  fear: string;
  notes: string;
  locked: boolean;
  order: number;
}

export interface WorldEntry {
  id: string;
  category: string;
  label: string;
  content: string;
  locked: boolean;
  order: number;
}

export interface BlueprintNode {
  id: string;
  title: string;
  beatType: string;
  summary: string;
  active?: boolean;
  locked: boolean;
  order: number;
}

interface CandidateBase {
  id: string;
  label: string;
  content: string;
  rationale: string;
  tags: string[];
  status: CandidateStatus;
  generatedRevision: number;
  mode: "live" | "demo";
}

export type Candidate = CandidateBase & (
  | { target: { type: "chapter"; id: string }; applyMode: "append" | "replace-all" | "replace-selection"; selection?: { from: number; to: number; text: string } }
  | { target: { type: "character" | "world" | "blueprint"; id: string }; applyMode: "replace-fields" }
  | { target: { type: "visual-brief" | "storyboard"; id: string }; applyMode: "save-asset" }
);

export type WorkflowStage = "inspiration" | "setting" | "blueprint" | "opening" | "complete";

export interface IpAssetMetadata {
  id: string;
  kind: "character-visual" | "poster" | "storyboard";
  title: string;
  characterId?: string;
  mode: "live" | "demo";
  previewUrl: string;
  createdAt: string;
  confirmed: boolean;
  generationStatus?: "pending" | "succeeded" | "failed";
  providerTaskId?: string;
  requestedSettings?: ImageGenerationSettings;
  providerRequest?: { model: string; prompt: string };
  failureStage?: "configuration" | "create" | "poll" | "result" | "timeout" | "network";
}

export type AiContextSectionKind = "locked-facts" | "story-settings" | "instruction" | "active-chapter" | "adjacent-summaries" | "other-summaries" | "knowledge";

export interface AiContextSection {
  kind: AiContextSectionKind;
  label: string;
  content: string;
  originalCharacters: number;
  usedCharacters: number;
  trimmed: boolean;
}

export interface AiContextPacket {
  revision: number;
  maxCharacters: number;
  usedCharacters: number;
  remainingCharacters: number;
  blocked: boolean;
  warning?: string;
  sections: AiContextSection[];
}

export interface MentorResponse {
  thesis: string;
  evidence: Array<{ quote: string; source: "observation" | "inference" | "knowledge"; note?: string; retrievalId?: string }>;
  craft: string[];
  effect: string[];
  consistency: string[];
  experiments: string[];
  questions: string[];
  references: Array<{ title: string; sourceTitle: string; note: string; retrievalId: string; sourceStatus: RetrievalEvidence["sourceStatus"] }>;
}

export interface Version {
  id: string;
  versionNo: number;
  chapterId: string;
  content: string;
  source: "manual" | "candidate" | "restore-snapshot";
  createdAt: string;
}

export interface Evidence {
  id: string;
  source: EvidenceSource;
  quote: string;
  note: string;
  chapter: string;
}

export interface AnalysisDimension {
  id: string;
  name: string;
  summary: string;
  impact: string;
  suggestion: string;
  score: number;
  evidenceIds: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "work" | "author" | "era" | "theme" | "technique" | "character" | "place" | "event" | "image" | "concept" | "argument" | "evidence";
  era?: string;
  themes?: string[];
  techniques?: string[];
  description?: string;
  evidenceIds?: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  sourceEvidenceIds?: string[];
  evidenceIds?: string[];
  confidence?: number;
  evidenceSource?: EvidenceSource;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AnalysisSnapshot {
  id: string;
  contextRevision: number;
  createdAt: string;
  mode: "live" | "demo";
  sourceProjectId?: string;
  sourceChapterId?: string;
  sourceHash?: string;
  sourceKind?: LiterarySourceKind;
  domainAnalysis?: LiteraryDomainAnalysis;
  warnings?: string[];
  analysis: AnalysisDimension[];
  characterGraph: KnowledgeGraph;
  plotCurve: Array<{ beat: string; value: number; evidenceId: string }>;
  emotionCurve: Array<{ beat: string; value: number; evidenceId: string }>;
  evidence?: AiEvidence[];
  themeHeatmap?: ThemeHeatmapCell[];
  styleProfile?: LiteraryAnalysisResult["styleProfile"];
  diagnostics?: LiteraryDiagnostic[];
  retrievalEvidence?: RetrievalEvidence[];
}

export interface StoryState {
  projects: Project[];
  activeProjectId: string;
  activeChapterId: string;
  contextRevision: number;
  workflowStage: WorkflowStage;
  chapters: Chapter[];
  characters: Character[];
  worldEntries: WorldEntry[];
  blueprint: BlueprintNode[];
  candidates: Candidate[];
  ipAssets: IpAssetMetadata[];
  versions: Version[];
  evidence: Evidence[];
  analysis: AnalysisDimension[];
  characterGraph: KnowledgeGraph;
  knowledge: KnowledgeGraph;
  plotCurve: Array<{ beat: string; value: number; evidenceId: string }>;
  emotionCurve: Array<{ beat: string; value: number; evidenceId: string }>;
  dialogueThreads: StoryDirectionMessage[];
  imageGenerationSettings: ImageGenerationSettings;
  analysisSnapshots: AnalysisSnapshot[];
  consistencyReports: ConsistencyReport[];
  trainingAttemptRefs: string[];
}
