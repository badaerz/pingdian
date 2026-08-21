import { describe, expect, expectTypeOf, it } from "vitest";
import {
  acceptCandidate,
  addStoryItem,
  appendDirectionMessage,
  confirmConsistencyReport,
  deleteStoryItem,
  filterKnowledge,
  moveStoryItem,
  restoreVersion,
  rollbackPreviousVersion,
  saveConsistencyReport,
  setImageGenerationSettings,
  updateStoryItem,
} from "@/lib/story-state";
import { initialStoryState } from "@/data/mock-data";
import type { AnalysisSnapshot, Candidate, ConsistencyReport, ImageGenerationSettings, StoryDirectionMessage, StoryState, Version } from "@/lib/types";

function createExtendedState() {
  return {
    ...structuredClone(initialStoryState),
    dialogueThreads: [],
    imageGenerationSettings: { prompt: "", negativePrompt: "", model: "Qwen/Qwen-Image", size: "1328x1328", advanced: {} },
    analysisSnapshots: [],
    consistencyReports: [],
    trainingAttemptRefs: [],
  };
}

function withCleanConsistency(state: StoryState = structuredClone(initialStoryState)) {
  const candidate = state.candidates[0];
  state.consistencyReports = [{
    candidateId: candidate.id,
    contextRevision: candidate.generatedRevision,
    findings: [],
    checkedAt: "刚刚",
    mode: "demo",
    userConfirmation: "none",
  }];
  return state;
}

describe("story state", () => {
  it("requires and initializes all v3 project fields", () => {
    expectTypeOf<Version["chapterId"]>().toEqualTypeOf<string>();
    expectTypeOf<Pick<StoryState, "dialogueThreads" | "imageGenerationSettings" | "analysisSnapshots" | "consistencyReports" | "trainingAttemptRefs">>().toEqualTypeOf<{
      dialogueThreads: StoryDirectionMessage[];
      imageGenerationSettings: ImageGenerationSettings;
      analysisSnapshots: AnalysisSnapshot[];
      consistencyReports: ConsistencyReport[];
      trainingAttemptRefs: string[];
    }>();
    expect(initialStoryState.dialogueThreads).toEqual([]);
    expect(initialStoryState.imageGenerationSettings).toEqual({ prompt: "", negativePrompt: "", model: "Qwen/Qwen-Image", size: "1328x1328", advanced: {} });
    expect(initialStoryState.analysisSnapshots).toEqual([]);
    expect(initialStoryState.consistencyReports).toEqual([]);
    expect(initialStoryState.trainingAttemptRefs).toEqual([]);
  });

  it("does not change prose until a candidate is accepted", () => {
    const before = initialStoryState.chapters[0].content;
    expect(initialStoryState.chapters[0].content).toBe(before);
    expect(initialStoryState.candidates[0].status).toBe("pending");
  });

  it("accepts a candidate and creates a version snapshot", () => {
    const state = withCleanConsistency();
    const result = acceptCandidate(state, "candidate-1");
    expect(result.chapters[0].content).toContain("雾中的汽笛");
    expect(result.versions).toHaveLength(state.versions.length + 1);
    expect(result.candidates[0].status).toBe("accepted");
  });

  it("rejects a replace-selection candidate when its selection snapshot is missing", () => {
    const state = withCleanConsistency();
    const candidate = state.candidates[0];
    state.candidates[0] = { ...candidate, target: { type: "chapter", id: state.activeChapterId }, applyMode: "replace-selection" } as unknown as Candidate;

    expect(acceptCandidate(state, candidate.id)).toBe(state);
  });

  it("restores an old version after keeping a safety snapshot", () => {
    const result = restoreVersion(initialStoryState, "version-1");
    expect(result.chapters[0].content).toBe(initialStoryState.versions[0].content);
    expect(result.versions.at(-1)?.source).toBe("restore-snapshot");
  });

  it("rolls back to the previous version while preserving the current text as a safety snapshot", () => {
    const changed = acceptCandidate(withCleanConsistency(), "candidate-1");
    const result = rollbackPreviousVersion(changed);

    expect(result.chapters[0].content).toBe(initialStoryState.versions.at(-1)?.content);
    expect(result.versions.at(-1)?.source).toBe("restore-snapshot");
    expect(result.versions.length).toBe(changed.versions.length + 1);
  });

  it("filters knowledge without dangling edges", () => {
    const result = filterKnowledge(initialStoryState.knowledge, { era: "现代", theme: "孤独", technique: "" });
    const ids = new Set(result.nodes.map((node) => node.id));
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
  });

  it("increments context revision when canonical story records change", () => {
    const added = addStoryItem(initialStoryState, "characters");
    const character = added.characters.at(-1)!;
    const updated = updateStoryItem(added, "characters", character.id, { name: "新人物" });

    expect(added.contextRevision).toBe(initialStoryState.contextRevision + 1);
    expect(updated.contextRevision).toBe(added.contextRevision + 1);
    expect(updated.characters.at(-1)?.name).toBe("新人物");
  });

  it("protects the last chapter and selects a neighbor after deleting the active chapter", () => {
    const singleChapter = { ...initialStoryState, chapters: [initialStoryState.chapters[0]], activeChapterId: initialStoryState.chapters[0].id };
    expect(deleteStoryItem(singleChapter, "chapters", singleChapter.activeChapterId)).toBe(singleChapter);

    const result = deleteStoryItem(initialStoryState, "chapters", initialStoryState.activeChapterId);
    expect(result.chapters).toHaveLength(initialStoryState.chapters.length - 1);
    expect(result.activeChapterId).toBe(initialStoryState.chapters[1].id);
  });

  it("does not delete a locked character, world entry, or blueprint node", () => {
    const state = structuredClone(initialStoryState);
    state.characters[0].locked = true;
    state.worldEntries[0].locked = true;
    state.blueprint[0].locked = true;

    expect(deleteStoryItem(state, "characters", state.characters[0].id)).toBe(state);
    expect(deleteStoryItem(state, "worldEntries", state.worldEntries[0].id)).toBe(state);
    expect(deleteStoryItem(state, "blueprint", state.blueprint[0].id)).toBe(state);
  });

  it("reorders records without losing their identity", () => {
    const moved = moveStoryItem(initialStoryState, "blueprint", "b1", 2);
    expect(moved.blueprint.map((node) => node.id).slice(0, 3)).toEqual(["b2", "b3", "b1"]);
    expect(moved.blueprint.map((node) => node.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("rejects a candidate whose source revision is stale", () => {
    const state = structuredClone(initialStoryState);
    state.candidates[0].generatedRevision = state.contextRevision - 1;
    state.candidates[0].target = { type: "chapter", id: state.activeChapterId };
    state.candidates[0].applyMode = "append";

    const result = acceptCandidate(state, "candidate-1");
    expect(result).toBe(state);
    expect(result.chapters.find((chapter) => chapter.id === state.activeChapterId)?.content).not.toContain("雾中的汽笛");
    expect(result.contextRevision).toBe(state.contextRevision);
    expect(result.candidates[0].generatedRevision).toBe(state.contextRevision - 1);
  });

  it("replaces only the recorded prose selection when a selection candidate is accepted", () => {
    const state = withCleanConsistency();
    state.chapters[0].content = "甲乙丙乙";
    state.activeChapterId = state.chapters[0].id;
    const candidate = state.candidates[0] as Extract<Candidate, { target: { type: "chapter" } }>;
    candidate.target = { type: "chapter", id: state.activeChapterId };
    candidate.applyMode = "replace-selection";
    candidate.selection = { from: 3, to: 4, text: "乙" };
    candidate.content = "丁";

    const result = acceptCandidate(state, "candidate-1");

    expect(result.chapters[0].content).toBe("甲乙丙丁");
  });

  it("restores a version into its source chapter after switching chapters", () => {
    const state = structuredClone(initialStoryState);
    state.chapters = [
      { ...state.chapters[0], id: "chapter-1", content: "第一章正文" },
      { ...state.chapters[0], id: "chapter-2", title: "第二章", content: "第二章正文", order: 1 },
    ];
    state.activeChapterId = "chapter-1";
    state.versions = [{ id: "version-2", versionNo: 2, chapterId: "chapter-2", content: "第二章旧稿", source: "candidate", createdAt: "刚刚" }];

    const result = restoreVersion(state, "version-2");

    expect(result.chapters.find((chapter) => chapter.id === "chapter-1")?.content).toBe("第一章正文");
    expect(result.chapters.find((chapter) => chapter.id === "chapter-2")?.content).toBe("第二章旧稿");
  });

  it("appends direction messages without mutating state or changing revision", () => {
    const state = createExtendedState();
    const before = structuredClone(state);
    const message: StoryDirectionMessage = { id: "message-1", role: "user", content: "把冲突压低一些", tags: ["克制"], createdAt: "刚刚", contextRevision: state.contextRevision };

    const result = appendDirectionMessage(state, message);

    expect(result).not.toBe(state);
    expect(result.dialogueThreads).toEqual([message]);
    expect(result.contextRevision).toBe(state.contextRevision);
    expect(state).toEqual(before);
  });

  it("updates image settings without mutating state or changing revision", () => {
    const state = createExtendedState();
    const before = structuredClone(state);
    const settings: ImageGenerationSettings = { prompt: "草原旧矿场", negativePrompt: "文字", model: "custom-image", size: "1024x1024", advanced: { steps: 24, guidance: 6.5 } };

    const result = setImageGenerationSettings(state, settings);

    expect(result.imageGenerationSettings).toEqual(settings);
    expect(result.contextRevision).toBe(state.contextRevision);
    expect(state).toEqual(before);
  });

  it("saves and confirms consistency reports without mutating state or changing revision", () => {
    const state = createExtendedState();
    const before = structuredClone(state);
    const report: ConsistencyReport = {
      candidateId: "candidate-1",
      contextRevision: state.contextRevision,
      findings: [{ id: "finding-1", category: "timeline", severity: "high", expectedFact: "夜里停电", candidateQuote: "灯火通明", priorEvidence: "第一章写明全城停电", suggestion: "改为应急灯" }],
      checkedAt: "刚刚",
      mode: "live",
      userConfirmation: "none",
    };

    const saved = saveConsistencyReport(state, report);
    const confirmed = confirmConsistencyReport(saved, report.candidateId, "confirmed");

    expect(saved.consistencyReports).toEqual([report]);
    expect(confirmed.consistencyReports?.[0].userConfirmation).toBe("confirmed");
    expect(saved.contextRevision).toBe(state.contextRevision);
    expect(confirmed.contextRevision).toBe(state.contextRevision);
    expect(state).toEqual(before);
  });
});
