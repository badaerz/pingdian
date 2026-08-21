import type { AnalysisSnapshot, LiteraryAnalysisResult, StoryState } from "@/lib/types";

export interface ProjectAnalysisSource {
  projectId: string;
  chapterId: string;
  title: string;
  text: string;
}

export function resolveProjectAnalysisSource(state: StoryState, projectId: string, chapterId?: string): ProjectAnalysisSource | null {
  if (state.activeProjectId !== projectId) return null;
  const targetId = chapterId ?? state.activeChapterId;
  const chapter = state.chapters.find((item) => item.id === targetId);
  if (!chapter) return null;
  return { projectId, chapterId: chapter.id, title: chapter.title, text: chapter.content };
}

export function analysisSourceHash(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}-${Array.from(value).length}`;
}

export function createAnalysisSnapshot(input: {
  projectId: string;
  chapterId: string;
  sourceText: string;
  contextRevision: number;
  mode: "live" | "demo";
  warnings: string[];
  result: LiteraryAnalysisResult;
  now?: string;
  id?: string;
}): AnalysisSnapshot {
  return {
    id: input.id ?? `analysis-${crypto.randomUUID()}`,
    contextRevision: input.contextRevision,
    createdAt: input.now ?? new Date().toISOString(),
    mode: input.mode,
    sourceProjectId: input.projectId,
    sourceChapterId: input.chapterId,
    sourceHash: analysisSourceHash(input.sourceText),
    sourceKind: input.result.sourceKind,
    domainAnalysis: structuredClone(input.result.domainAnalysis),
    warnings: [...input.warnings],
    analysis: structuredClone(input.result.analysis),
    characterGraph: structuredClone(input.result.relationGraph),
    plotCurve: input.result.paceCurve.map((point) => ({ beat: point.segment, value: point.value, evidenceId: point.evidenceId })),
    emotionCurve: input.result.emotionCurve.map((point) => ({ beat: point.segment, value: point.value, evidenceId: point.evidenceId })),
    evidence: structuredClone(input.result.evidence),
    themeHeatmap: structuredClone(input.result.themeHeatmap),
    styleProfile: structuredClone(input.result.styleProfile),
    diagnostics: structuredClone(input.result.diagnostics),
    retrievalEvidence: structuredClone(input.result.retrievalEvidence),
  };
}

export function analysisResultFromSnapshot(snapshot: AnalysisSnapshot): LiteraryAnalysisResult | null {
  if (!snapshot.sourceKind || !snapshot.domainAnalysis || !snapshot.evidence || !snapshot.themeHeatmap || !snapshot.styleProfile || !snapshot.diagnostics || !snapshot.retrievalEvidence) return null;
  return {
    sourceKind: snapshot.sourceKind,
    domainAnalysis: structuredClone(snapshot.domainAnalysis),
    analysis: structuredClone(snapshot.analysis),
    evidence: structuredClone(snapshot.evidence),
    relationGraph: structuredClone(snapshot.characterGraph),
    paceCurve: snapshot.plotCurve.map((point) => ({ segment: point.beat, value: point.value, evidenceId: point.evidenceId })),
    emotionCurve: snapshot.emotionCurve.map((point) => ({ segment: point.beat, value: point.value, evidenceId: point.evidenceId })),
    themeHeatmap: structuredClone(snapshot.themeHeatmap),
    styleProfile: structuredClone(snapshot.styleProfile),
    diagnostics: structuredClone(snapshot.diagnostics),
    retrievalEvidence: structuredClone(snapshot.retrievalEvidence),
  };
}

export function findCurrentAnalysisSnapshot(snapshots: AnalysisSnapshot[], source: {
  projectId: string;
  chapterId: string;
  sourceText: string;
  contextRevision: number;
}) {
  const hash = analysisSourceHash(source.sourceText);
  return snapshots.find((snapshot) => snapshot.sourceProjectId === source.projectId
    && snapshot.sourceChapterId === source.chapterId
    && snapshot.contextRevision === source.contextRevision
    && snapshot.sourceHash === hash) ?? null;
}
