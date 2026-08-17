import type { KnowledgeGraph, StoryState } from "@/lib/types";

export function acceptCandidate(state: StoryState, candidateId: string, editedContent?: string): StoryState {
  const candidate = state.candidates.find((item) => item.id === candidateId);
  if (!candidate || candidate.status !== "pending") return state;
  const chapter = state.chapters[0];
  const candidateContent = editedContent?.trim() || candidate.content;
  const content = `${chapter.content}\n\n${candidateContent}`;
  const versionNo = Math.max(...state.versions.map((version) => version.versionNo), 0) + 1;
  return {
    ...state,
    chapters: [{ ...chapter, content, wordCount: content.replace(/\s/g, "").length }, ...state.chapters.slice(1)],
    candidates: state.candidates.map((item) => item.id === candidateId ? { ...item, status: "accepted" } : item),
    versions: [...state.versions, { id: `version-${versionNo}`, versionNo, content, source: "candidate", createdAt: "刚刚" }],
  };
}

export function discardCandidate(state: StoryState, candidateId: string): StoryState {
  return { ...state, candidates: state.candidates.map((item) => item.id === candidateId ? { ...item, status: "discarded" } : item) };
}

export function restoreVersion(state: StoryState, versionId: string): StoryState {
  const version = state.versions.find((item) => item.id === versionId);
  if (!version) return state;
  const chapter = state.chapters[0];
  const snapshotNo = Math.max(...state.versions.map((item) => item.versionNo), 0) + 1;
  return {
    ...state,
    chapters: [{ ...chapter, content: version.content, wordCount: version.content.replace(/\s/g, "").length }, ...state.chapters.slice(1)],
    versions: [...state.versions, { id: `version-${snapshotNo}`, versionNo: snapshotNo, content: chapter.content, source: "restore-snapshot", createdAt: "刚刚" }],
  };
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
