import type { StoryContext } from "@/lib/ai/tasks";
import type { StoryState } from "@/lib/types";

export function resolveAiSourceText(
  input: { sourceText?: unknown; evidenceText?: unknown; selectedText?: unknown } | undefined,
  activeChapterText?: unknown,
) {
  return [input?.sourceText, input?.evidenceText, input?.selectedText, activeChapterText]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function contextFromState(state: StoryState): StoryContext {
  const project = state.projects.find((item) => item.id === state.activeProjectId) ?? state.projects[0];
  return {
    title: project?.title ?? "未命名作品",
    genre: project?.genre ?? "纯文学短篇",
    logline: project?.logline ?? "",
    activeChapterId: state.activeChapterId,
    contextRevision: state.contextRevision,
    chapters: state.chapters,
    characters: state.characters,
    worldEntries: state.worldEntries,
    blueprint: state.blueprint,
  };
}
