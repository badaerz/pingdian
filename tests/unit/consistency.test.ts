import { expect, it } from "vitest";
import { initialStoryState } from "../fixtures/story-state";
import { buildConsistencyInput } from "@/lib/consistency";
import { acceptCandidate, confirmConsistencyReport, deleteStoryItem, restoreVersion } from "@/lib/story-state";
import type { Candidate, ConsistencyReport, StoryState } from "@/lib/types";

function stateWithCurrentCandidate(): StoryState {
  const state = structuredClone(initialStoryState);
  const candidate = state.candidates[0] as Extract<Candidate, { target: { type: "chapter" } }>;
  candidate.target = { type: "chapter", id: state.activeChapterId };
  candidate.generatedRevision = state.contextRevision;
  candidate.status = "pending";
  return state;
}

function highRiskReport(state: StoryState): ConsistencyReport {
  const candidate = state.candidates[0];
  return {
    candidateId: candidate.id,
    contextRevision: state.contextRevision,
    findings: [{
      id: "finding-high",
      category: "character",
      severity: "high",
      expectedFact: state.characters[0].notes,
      candidateQuote: candidate.content.slice(0, 8),
      priorEvidence: state.characters[0].notes,
      suggestion: "保留人物一贯的克制反应。",
    }],
    checkedAt: "刚刚",
    mode: "demo",
    userConfirmation: "none",
  };
}

it("builds consistency input from the target chapter, adjacent summaries and locked facts only", () => {
  const state = stateWithCurrentCandidate();
  state.chapters = [
    { ...state.chapters[0], id: "chapter-1", summary: "前章摘要", content: "前章正文", order: 0 },
    { ...state.chapters[0], id: "chapter-2", summary: "当前摘要", content: "当前正文", order: 1 },
    { ...state.chapters[0], id: "chapter-3", summary: "后章摘要", content: "后章正文", order: 2 },
    { ...state.chapters[0], id: "chapter-4", summary: "远章摘要", content: "远章正文", order: 3 },
  ];
  state.activeChapterId = "chapter-2";
  const candidate = state.candidates[0] as Extract<Candidate, { target: { type: "chapter" } }>;
  candidate.target = { type: "chapter", id: "chapter-2" };

  const input = buildConsistencyInput(state, candidate);

  expect(input.task).toBe("consistency-check");
  expect(input.project.characters.every((item) => item.locked)).toBe(true);
  expect(input.project.worldEntries.every((item) => item.locked)).toBe(true);
  expect(input.project.blueprint.every((item) => item.locked)).toBe(true);
  expect(input.project.chapters.map((item) => item.id)).toEqual(["chapter-1", "chapter-2", "chapter-3"]);
  expect(input.project.chapters.find((item) => item.id === "chapter-2")?.content).toBe("当前正文");
  expect(input.project.chapters.find((item) => item.id === "chapter-1")?.content).toBe("");
  expect(input.project.chapters.some((item) => item.content === "远章正文" || item.summary === "远章摘要")).toBe(false);
  expect(input.input?.candidate).toEqual({ id: candidate.id, text: candidate.content, revision: state.contextRevision });
});

it("blocks stale and high-risk candidates even after acknowledgement, then accepts only after a clean recheck", () => {
  const state = stateWithCurrentCandidate();
  const candidate = state.candidates[0];
  const stale = structuredClone(state);
  stale.candidates[0].generatedRevision -= 1;
  expect(acceptCandidate(stale, candidate.id)).toBe(stale);

  state.consistencyReports = [highRiskReport(state)];
  expect(acceptCandidate(state, candidate.id)).toBe(state);

  const confirmed = confirmConsistencyReport(state, candidate.id, "confirmed");
  expect(acceptCandidate(confirmed, candidate.id)).toBe(confirmed);

  confirmed.consistencyReports = [{ ...highRiskReport(state), findings: [], userConfirmation: "reviewed" }];
  const accepted = acceptCandidate(confirmed, candidate.id);
  expect(accepted).not.toBe(confirmed);
  expect(accepted.candidates[0].status).toBe("accepted");
  expect(accepted.versions.at(-1)?.chapterId).toBe(state.activeChapterId);
});

it("blocks a current candidate until a matching consistency report exists", () => {
  const state = stateWithCurrentCandidate();

  expect(acceptCandidate(state, state.candidates[0].id)).toBe(state);
});

it("invalidates chapter candidates, reports and versions when that chapter is deleted", () => {
  const state = stateWithCurrentCandidate();
  const deletedId = state.activeChapterId;
  state.chapters.push({ ...state.chapters[0], id: "chapter-keep", title: "保留章", order: 1 });
  state.consistencyReports = [highRiskReport(state)];
  state.versions = [{ id: "version-delete", versionNo: 2, chapterId: deletedId, content: "旧稿", source: "candidate", createdAt: "刚刚" }];

  const result = deleteStoryItem(state, "chapters", deletedId);

  expect(result.candidates.some((item) => item.target.type === "chapter" && item.target.id === deletedId)).toBe(false);
  expect(result.consistencyReports.some((item) => item.candidateId === state.candidates[0].id)).toBe(false);
  expect(result.versions.some((item) => item.chapterId === deletedId)).toBe(false);
});

it("does not restore an explicitly targeted version when its chapter no longer exists", () => {
  const state = stateWithCurrentCandidate();
  state.versions = [{ id: "missing-version", versionNo: 9, chapterId: "deleted-chapter", content: "不应覆盖第一章", source: "candidate", createdAt: "刚刚" }];

  expect(restoreVersion(state, "missing-version")).toBe(state);
  expect(state.chapters[0].content).not.toBe("不应覆盖第一章");
});

it("does not restore a runtime legacy version without a chapter target", () => {
  const state = stateWithCurrentCandidate();
  state.versions = [{ id: "targetless-version", versionNo: 10, content: "不得回退当前章", source: "manual", createdAt: "刚刚" } as unknown as StoryState["versions"][number]];

  expect(restoreVersion(state, "targetless-version")).toBe(state);
  expect(state.chapters.find((chapter) => chapter.id === state.activeChapterId)?.content).not.toBe("不得回退当前章");
});
