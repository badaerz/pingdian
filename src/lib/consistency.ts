import { contextFromState } from "@/lib/ai/story-context";
import type { AiTaskInput } from "@/lib/ai/tasks";
import type { Candidate, StoryState } from "@/lib/types";

export function buildConsistencyInput(
  state: StoryState,
  candidate: Extract<Candidate, { target: { type: "chapter" } }>,
): AiTaskInput {
  const targetIndex = state.chapters.findIndex((chapter) => chapter.id === candidate.target.id);
  if (targetIndex < 0) throw new Error("CONSISTENCY_TARGET_MISSING");
  const adjacentIds = new Set([
    state.chapters[targetIndex - 1]?.id,
    state.chapters[targetIndex + 1]?.id,
  ].filter((id): id is string => Boolean(id)));
  const project = contextFromState(state);

  return {
    task: "consistency-check",
    project: {
      ...project,
      activeChapterId: candidate.target.id,
      chapters: state.chapters
        .filter((chapter) => chapter.id === candidate.target.id || adjacentIds.has(chapter.id))
        .map((chapter) => chapter.id === candidate.target.id ? chapter : { ...chapter, content: "" }),
      characters: state.characters.filter((character) => character.locked),
      worldEntries: state.worldEntries.filter((entry) => entry.locked),
      blueprint: state.blueprint.filter((node) => node.locked),
    },
    input: {
      candidate: {
        id: candidate.id,
        text: candidate.content,
        revision: candidate.generatedRevision,
      },
    },
  };
}
