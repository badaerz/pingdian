import { initialStoryState } from "@/data/mock-data";
import type { Project, StoryState } from "@/lib/types";

export const STORY_STORE_KEY = "story-forge:projects:v1";

export type ProjectDocument = Omit<StoryState, "projects" | "activeProjectId"> & {
  project: Project;
};

export interface StoryStore {
  version: 1;
  documents: Record<string, ProjectDocument>;
}

function createDemoDocument(project: Project): ProjectDocument {
  const state = structuredClone(initialStoryState);
  return {
    project,
    chapters: state.chapters,
    characters: state.characters,
    world: state.world,
    blueprint: state.blueprint,
    candidates: state.candidates,
    versions: state.versions,
    evidence: state.evidence,
    analysis: state.analysis,
    characterGraph: state.characterGraph,
    knowledge: state.knowledge,
    plotCurve: state.plotCurve,
    emotionCurve: state.emotionCurve,
  };
}

export function createStoryStore(): StoryStore {
  return {
    version: 1,
    documents: Object.fromEntries(initialStoryState.projects.map((project) => [project.id, createDemoDocument(project)])),
  };
}

export function createProjectDocument(input: Pick<Project, "title" | "genre" | "logline">): ProjectDocument {
  const id = `project-${crypto.randomUUID()}`;
  const project: Project = { id, ...input, updatedAt: "刚刚", wordCount: 0, status: "draft" };
  const demo = createDemoDocument(project);
  return {
    ...demo,
    chapters: [{ id: `${id}-chapter-1`, title: "第一章", content: "", wordCount: 0 }],
    characters: [],
    world: { era: "", place: "", rules: "", atmosphere: "" },
    blueprint: ["开端", "冲突", "发展", "转折", "结局"].map((title, index) => ({
      id: `${id}-blueprint-${index + 1}`,
      title,
      beatType: title,
      summary: "",
      active: index === 0,
    })),
    candidates: [],
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
  const raw = window.localStorage.getItem(STORY_STORE_KEY);
  if (!raw) return null;
  try {
    const store = JSON.parse(raw) as StoryStore;
    return store.version === 1 && store.documents && typeof store.documents === "object" ? store : null;
  } catch {
    return null;
  }
}

export function saveStoryStore(store: StoryStore) {
  if (typeof window !== "undefined") window.localStorage.setItem(STORY_STORE_KEY, JSON.stringify(store));
}
