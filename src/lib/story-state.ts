import type { ConsistencyReport, ImageGenerationSettings, KnowledgeGraph, StoryDirectionMessage, StoryState } from "@/lib/types";

export type StoryCollection = "chapters" | "characters" | "worldEntries" | "blueprint";

function nextId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function bumpRevision(state: StoryState, patch: Partial<StoryState>): StoryState {
  return { ...state, ...patch, contextRevision: state.contextRevision + 1 };
}

export function appendDirectionMessage(state: StoryState, message: StoryDirectionMessage): StoryState {
  return { ...state, dialogueThreads: [...(state.dialogueThreads ?? []), message] };
}

export function setImageGenerationSettings(state: StoryState, settings: ImageGenerationSettings): StoryState {
  return { ...state, imageGenerationSettings: settings };
}

export function saveConsistencyReport(state: StoryState, report: ConsistencyReport): StoryState {
  const reports = state.consistencyReports ?? [];
  const exists = reports.some((item) => item.candidateId === report.candidateId);
  return {
    ...state,
    consistencyReports: exists
      ? reports.map((item) => item.candidateId === report.candidateId ? report : item)
      : [...reports, report],
  };
}

export function confirmConsistencyReport(state: StoryState, candidateId: string, confirmation: ConsistencyReport["userConfirmation"] = "confirmed"): StoryState {
  const reports = state.consistencyReports ?? [];
  if (!reports.some((item) => item.candidateId === candidateId)) return state;
  return {
    ...state,
    consistencyReports: reports.map((item) => item.candidateId === candidateId ? { ...item, userConfirmation: confirmation } : item),
  };
}

export function addStoryItem(state: StoryState, collection: StoryCollection): StoryState {
  if (collection === "chapters") {
    const chapter = { id: nextId("chapter"), title: `第 ${state.chapters.length + 1} 章`, content: "", wordCount: 0, summary: "", order: state.chapters.length };
    return bumpRevision(state, { chapters: [...state.chapters, chapter], activeChapterId: chapter.id });
  }
  if (collection === "characters") {
    const character = { id: nextId("character"), name: "新人物", role: "", desire: "", flaw: "", arc: "", fear: "", notes: "", locked: false, order: state.characters.length };
    return bumpRevision(state, { characters: [...state.characters, character] });
  }
  if (collection === "worldEntries") {
    const entry = { id: nextId("world"), category: "自定义", label: "新设定", content: "", locked: false, order: state.worldEntries.length };
    return bumpRevision(state, { worldEntries: [...state.worldEntries, entry] });
  }
  const node = { id: nextId("blueprint"), title: "新节点", beatType: "情节节点", summary: "", active: false, locked: false, order: state.blueprint.length };
  return bumpRevision(state, { blueprint: [...state.blueprint, node] });
}

export function updateStoryItem(state: StoryState, collection: StoryCollection, id: string, patch: Record<string, unknown>): StoryState {
  const items = state[collection];
  if (!items.some((item) => item.id === id)) return state;
  const updated = items.map((item) => item.id === id ? { ...item, ...patch } : item);
  return bumpRevision(state, { [collection]: updated } as Partial<StoryState>);
}

export function deleteStoryItem(state: StoryState, collection: StoryCollection, id: string): StoryState {
  const items = state[collection];
  const index = items.findIndex((item) => item.id === id);
  const item = index < 0 ? undefined : items[index];
  if (index < 0 || (collection === "chapters" && items.length === 1) || (item && "locked" in item && item.locked)) return state;
  const updated = items.filter((item) => item.id !== id).map((item, order) => ({ ...item, order }));
  if (collection === "chapters") {
    const chapters = updated as StoryState["chapters"];
    const activeChapterId = state.activeChapterId === id ? chapters[Math.min(index, chapters.length - 1)]?.id ?? "" : state.activeChapterId;
    const invalidCandidateIds = new Set(state.candidates.filter((candidate) => candidate.target.type === "chapter" && candidate.target.id === id).map((candidate) => candidate.id));
    return bumpRevision(state, {
      chapters,
      activeChapterId,
      candidates: state.candidates.filter((candidate) => !invalidCandidateIds.has(candidate.id)),
      consistencyReports: state.consistencyReports.filter((report) => !invalidCandidateIds.has(report.candidateId)),
      versions: state.versions.filter((version) => version.chapterId !== id),
    });
  }
  return bumpRevision(state, { [collection]: updated } as Partial<StoryState>);
}

export function moveStoryItem(state: StoryState, collection: StoryCollection, id: string, targetIndex: number): StoryState {
  const items = [...state[collection]];
  const from = items.findIndex((item) => item.id === id);
  const to = Math.max(0, Math.min(targetIndex, items.length - 1));
  if (from < 0 || from === to) return state;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  const ordered = items.map((entry, order) => ({ ...entry, order }));
  return bumpRevision(state, { [collection]: ordered } as Partial<StoryState>);
}

export function acceptCandidate(state: StoryState, candidateId: string, editedContent?: string): StoryState {
  const candidate = state.candidates.find((item) => item.id === candidateId);
  if (!candidate || candidate.status !== "pending") return state;
  if (candidate.target.type !== "chapter") return state;
  if (candidate.generatedRevision !== state.contextRevision) return state;
  const consistency = state.consistencyReports.find((report) => report.candidateId === candidateId && report.contextRevision === candidate.generatedRevision);
  if (!consistency) return state;
  if (consistency.findings.some((finding) => finding.severity === "high")) return state;
  const chapterIndex = state.chapters.findIndex((item) => item.id === candidate.target.id);
  if (chapterIndex < 0) return state;
  const chapter = state.chapters[chapterIndex];
  const candidateContent = editedContent?.trim() || candidate.content;
  let content = `${chapter.content}${chapter.content ? "\n\n" : ""}${candidateContent}`;
  if (candidate.applyMode === "replace-all") content = candidateContent;
  if (candidate.applyMode === "replace-selection") {
    if (!candidate.selection) return state;
    const { from, to, text } = candidate.selection;
    const recordedSelectionMatches = from >= 0 && to >= from && chapter.content.slice(from, to) === text;
    const selectionStart = recordedSelectionMatches ? from : chapter.content.indexOf(text);
    if (selectionStart < 0) return state;
    const selectionEnd = recordedSelectionMatches ? to : selectionStart + text.length;
    content = `${chapter.content.slice(0, selectionStart)}${candidateContent}${chapter.content.slice(selectionEnd)}`;
  }
  const versionNo = Math.max(...state.versions.map((version) => version.versionNo), 0) + 1;
  const chapters = state.chapters.map((item, index) => index === chapterIndex ? { ...item, content, wordCount: content.replace(/\s/g, "").length } : item);
  return {
    ...state,
    contextRevision: state.contextRevision + 1,
    chapters,
    candidates: state.candidates.map((item) => item.id === candidateId ? { ...item, status: "accepted" } : item),
    versions: [...state.versions, { id: `version-${versionNo}`, versionNo, chapterId: chapter.id, content, source: "candidate", createdAt: "刚刚" }],
  };
}

export function discardCandidate(state: StoryState, candidateId: string): StoryState {
  return { ...state, candidates: state.candidates.map((item) => item.id === candidateId ? { ...item, status: "discarded" } : item) };
}

export function restoreVersion(state: StoryState, versionId: string): StoryState {
  const version = state.versions.find((item) => item.id === versionId);
  if (!version?.chapterId) return state;
  const chapterIndex = state.chapters.findIndex((item) => item.id === version.chapterId);
  const chapter = state.chapters[chapterIndex];
  if (!chapter) return state;
  const snapshotNo = Math.max(...state.versions.map((item) => item.versionNo), 0) + 1;
  return {
    ...state,
    contextRevision: state.contextRevision + 1,
    chapters: state.chapters.map((item) => item.id === chapter.id ? { ...item, content: version.content, wordCount: version.content.replace(/\s/g, "").length } : item),
    versions: [...state.versions, { id: `version-${snapshotNo}`, versionNo: snapshotNo, chapterId: chapter.id, content: chapter.content, source: "restore-snapshot", createdAt: "刚刚" }],
  };
}

export function rollbackPreviousVersion(state: StoryState): StoryState {
  const previous = state.versions.at(-2);
  return previous ? restoreVersion(state, previous.id) : state;
}

export function filterKnowledge(graph: KnowledgeGraph, filters: { era: string; theme: string; technique: string }): KnowledgeGraph {
  const matchingWorks = graph.nodes.filter((node) => node.type === "work" && (!filters.era || node.era === filters.era) && (!filters.theme || node.themes?.includes(filters.theme)) && (!filters.technique || node.techniques?.includes(filters.technique)));
  if (!filters.era && !filters.theme && !filters.technique) return graph;
  const keep = new Set(matchingWorks.map((node) => node.id));
  graph.edges.forEach((edge) => {
    if (keep.has(edge.source) || keep.has(edge.target)) {
      keep.add(edge.source);
      keep.add(edge.target);
    }
  });
  return { nodes: graph.nodes.filter((node) => keep.has(node.id)), edges: graph.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)) };
}
