import type { StoryState } from "@/lib/types";

export type StoryExportFormat = "markdown" | "text";

export function serializeStory(state: StoryState, format: StoryExportFormat): string {
  const project = state.projects.find((item) => item.id === state.activeProjectId) ?? state.projects[0];
  if (format === "text") {
    return [project?.title ?? "未命名作品", project?.logline ?? "", ...state.chapters.map((chapter) => `${chapter.title}\n${chapter.content}`)].filter(Boolean).join("\n\n");
  }
  return [`# ${project?.title ?? "未命名作品"}`, project?.logline ?? "", ...state.chapters.map((chapter) => `## ${chapter.title}\n\n${chapter.content}`)].filter(Boolean).join("\n\n");
}
