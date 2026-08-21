import { describe, expect, it } from "vitest";
import { fixtureForTask } from "@/lib/ai/fixtures";
import { contextFromState } from "@/lib/ai/story-context";
import { validateTaskPayload } from "@/lib/ai/validation";
import { initialStoryState } from "@/data/mock-data";
import type { LiteraryAnalysisResult } from "@/lib/types";

describe("analysis-v2 competition diagnosis", () => {
  const project = contextFromState(initialStoryState);
  const sourceText = project.chapters.find((chapter) => chapter.id === project.activeChapterId)!.content;

  it("returns complete narrative domains with traceable setup advice", () => {
    const fixture = fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
    const result = validateTaskPayload("analysis-v2", fixture, project, "demo", { sourceText });

    expect(result).not.toBeNull();
    const validated = result as LiteraryAnalysisResult;
    expect(validated.analysis.map((dimension) => dimension.name)).toEqual(expect.arrayContaining(["人物关系", "情节结构", "主题演变", "语言风格"]));
    expect(validated.relationGraph.edges.length).toBeGreaterThan(0);
    expect(new Set(validated.themeHeatmap.map((cell) => cell.segment)).size).toBeGreaterThan(1);
    expect(validated.diagnostics.some((item) => item.action.includes("铺垫不足"))).toBe(true);
    expect(validated.diagnostics.every((item) => sourceText.includes(item.quote))).toBe(true);
  });

  it("rejects a diagnostic quote that does not belong to this source", () => {
    const fixture = structuredClone(fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" })) as LiteraryAnalysisResult;
    fixture.diagnostics[0].quote = "另一部作品中的句子";

    expect(validateTaskPayload("analysis-v2", fixture, project, "live", { sourceText })).toBeNull();
  });

  it("rejects a narrative diagnosis without a located setup-insufficient recommendation", () => {
    const fixture = structuredClone(fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" })) as LiteraryAnalysisResult;
    fixture.diagnostics = fixture.diagnostics.map((item) => ({ ...item, effect: "节奏需要复核。", action: "调整句式并再次比较。" }));

    expect(validateTaskPayload("analysis-v2", fixture, project, "live", { sourceText })).toBeNull();
  });

  it("uses concept relations instead of invented characters for argumentative text", () => {
    const argumentative = "数字人文方法强调证据链。可视化只是解释工具，不应替代文本细读。";
    const fixture = fixtureForTask("analysis-v2", project, { sourceText: argumentative, sourceKind: "argumentative" }) as LiteraryAnalysisResult;
    const result = validateTaskPayload("analysis-v2", fixture, project, "demo", { sourceText: argumentative }) as LiteraryAnalysisResult;

    expect(result).not.toBeNull();
    expect(result.relationGraph.nodes.some((node) => node.type === "character" || node.type === "event" || node.type === "place")).toBe(false);
  });
});
