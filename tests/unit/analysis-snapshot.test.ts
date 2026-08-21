import { describe, expect, it } from "vitest";
import { analysisSourceHash, createAnalysisSnapshot, findCurrentAnalysisSnapshot, resolveProjectAnalysisSource } from "@/lib/analysis/snapshot";
import { fixtureForTask } from "@/lib/ai/fixtures";
import { contextFromState } from "@/lib/ai/story-context";
import { initialStoryState } from "@/data/mock-data";
import type { LiteraryAnalysisResult } from "@/lib/types";

describe("analysis source and snapshot identity", () => {
  const project = contextFromState(initialStoryState);
  const source = project.chapters[0].content;
  const result = fixtureForTask("analysis-v2", project, { sourceText: source, sourceKind: "narrative" }) as LiteraryAnalysisResult;

  it("resolves only chapters inside the requested project", () => {
    expect(resolveProjectAnalysisSource(initialStoryState, "demo", project.chapters[0].id)?.text).toBe(source);
    expect(resolveProjectAnalysisSource(initialStoryState, "another-project", project.chapters[0].id)).toBeNull();
    expect(resolveProjectAnalysisSource(initialStoryState, "demo", "chapter-from-another-project")).toBeNull();
  });

  it("invalidates snapshots when text or context revision changes", () => {
    const snapshot = createAnalysisSnapshot({
      projectId: "demo",
      chapterId: project.chapters[0].id,
      sourceText: source,
      contextRevision: 3,
      mode: "demo",
      warnings: ["离线演示结果"],
      result,
      now: "2026-08-21T00:00:00.000Z",
      id: "snapshot-test",
    });

    expect(snapshot.sourceHash).toBe(analysisSourceHash(source));
    expect(findCurrentAnalysisSnapshot([snapshot], { projectId: "demo", chapterId: project.chapters[0].id, sourceText: source, contextRevision: 3 })).toEqual(snapshot);
    expect(findCurrentAnalysisSnapshot([snapshot], { projectId: "demo", chapterId: project.chapters[0].id, sourceText: `${source}改`, contextRevision: 3 })).toBeNull();
    expect(findCurrentAnalysisSnapshot([snapshot], { projectId: "demo", chapterId: project.chapters[0].id, sourceText: source, contextRevision: 4 })).toBeNull();
  });
});
