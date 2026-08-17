import { describe, expect, it } from "vitest";
import { acceptCandidate, filterKnowledge, restoreVersion } from "@/lib/story-state";
import { initialStoryState } from "@/data/mock-data";

describe("story state", () => {
  it("does not change prose until a candidate is accepted", () => {
    const before = initialStoryState.chapters[0].content;
    expect(initialStoryState.chapters[0].content).toBe(before);
    expect(initialStoryState.candidates[0].status).toBe("pending");
  });

  it("accepts a candidate and creates a version snapshot", () => {
    const result = acceptCandidate(initialStoryState, "candidate-1");
    expect(result.chapters[0].content).toContain("雾中的汽笛");
    expect(result.versions).toHaveLength(initialStoryState.versions.length + 1);
    expect(result.candidates[0].status).toBe("accepted");
  });

  it("restores an old version after keeping a safety snapshot", () => {
    const result = restoreVersion(initialStoryState, "version-1");
    expect(result.chapters[0].content).toBe(initialStoryState.versions[0].content);
    expect(result.versions.at(-1)?.source).toBe("restore-snapshot");
  });

  it("filters knowledge without dangling edges", () => {
    const result = filterKnowledge(initialStoryState.knowledge, { era: "现代", theme: "孤独", technique: "" });
    const ids = new Set(result.nodes.map((node) => node.id));
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
  });
});
