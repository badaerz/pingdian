import { describe, expect, it } from "vitest";
import { fixtureForTask } from "@/lib/ai/fixtures";
import { contextFromState } from "@/lib/ai/story-context";
import { validateTaskPayload, isProofreadingClaim } from "@/lib/ai/validation";
import { initialStoryState } from "../fixtures/story-state";
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
    expect(validated.diagnostics.every((item) => sourceText.includes(item.quote))).toBe(true);
  });

  it("rejects a diagnostic quote that does not belong to this source", () => {
    const fixture = structuredClone(fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" })) as LiteraryAnalysisResult;
    fixture.diagnostics[0].quote = "另一部作品中的句子";
    fixture.diagnostics.push({ ...fixture.diagnostics[1], id: "third" });
    const checked = validateTaskPayload("analysis-v2", { ...fixture, themeHeatmap: undefined }, project, "live", { sourceText }) as LiteraryAnalysisResult;
    expect(checked.diagnostics).toHaveLength(2);
    expect(checked.themeHeatmap).toEqual([]);
    expect(checked.discardedDiagnostics).toMatchObject([{ attempted: { quote: "另一部作品中的句子" }, reason: "quote_not_in_source" }]);
    expect(validateTaskPayload("analysis-v2", { ...fixture, diagnostics: fixture.diagnostics.slice(0, 1) }, project, "live", { sourceText })).toBeNull();
  });

  it.each([
    ["'育养'一词稍显生硬", "可改为自然养育她", true], ["'一副'用于笑脸稍显不搭", "通常用一张", true],
    ["人物关系变化显得生硬", "通过一个具体场景来展现隔阂", false], ["'翻翻覆覆'略显生硬", "可考虑更自然的表达", true],
    ["内心独白稍显冗长", "可精简", true], ["'正是'一词稍显直白", "", true], ["比喻费解", "可能影响理解", true],
    ["外貌降级的顶点，长衫换破夹袄", "", false], ["以空间格局建立阶层区隔的舞台", "", false],
  ] as const)("proofreading: %s", (effect, action, expected) => { expect(isProofreadingClaim(effect, action)).toBe(expected); });

  it("accepts a grounded relationship transition, but rejects metadata-only findings", () => {
    const fixture = structuredClone(fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" })) as LiteraryAnalysisResult;
    if (fixture.domainAnalysis.kind !== "narrative") throw new Error("expected narrative");
    const evidenceIds = fixture.domainAnalysis.characters.relationshipChanges[0].evidenceIds;
    const check = (finding: unknown) => validateTaskPayload("analysis-v2", { ...fixture, domainAnalysis: { ...fixture.domainAnalysis, characters: { ...("characters" in fixture.domainAnalysis ? fixture.domainAnalysis.characters : {}), relationshipChanges: [finding] } } }, project, "live", { sourceText });
    expect(check({ from: "陌生", to: "熟悉", evidenceIds })).not.toBeNull();
    for (const invalid of [{ id: "empty", evidenceIds }, { from: "陌生", to: "熟悉", evidenceIds: ["missing"] }]) {
      expect(check(invalid)).toMatchObject({
        domainAnalysis: { characters: { relationshipChanges: [] } },
        degraded: expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining("relationshipChanges") })]),
      });
    }
  });

  it.each([false, true])("accepts dimension aliases and independent literary labels (Chinese=%s)", (chinese) => {
    const fixture = structuredClone(fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" })) as LiteraryAnalysisResult;
    const names = { sentenceLength: "句子长度", dialogueRatio: "对话比例", sensoryDensity: "感官密度", rhetoric: "修辞手法", narrativeDistance: "叙事距离", rhythm: "节奏" };
    const metrics = fixture.styleProfile.metrics.map(({ key, ...item }) => ({ ...item, dimension: chinese ? names[key] : key }));
    const payload = { ...fixture, analysis: fixture.analysis.map(item => ({ ...item, name: "结尾留白" })), styleProfile: { metrics } };
    const result = validateTaskPayload("analysis-v2", payload, project, "live", { sourceText }) as LiteraryAnalysisResult;
    expect(result?.styleProfile.metrics.map(item => item.key)).toEqual(fixture.styleProfile.metrics.map(item => item.key));
  });

  it("marks knowledge evidence unverified only when retrieval is empty and fills a blank note", () => {
    const fixture = fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
    const item = { id: "extra", source: "knowledge", quote: "未对照的知识引文", retrievalId: "kb", note: "" };
    const payload = { ...fixture, evidence: [...fixture.evidence, item] };
    const result = validateTaskPayload("analysis-v2", payload, project, "live", { sourceText, retrievalEvidence: [] }) as LiteraryAnalysisResult;
    expect(result?.evidence.at(-1)).toMatchObject({ verification: "unverified", note: "（模型未提供说明）" });
    const trusted = { retrievalId: "kb", content: "不同内容", quote: "不同内容", chunkType: "test", sourceStatus: "verified" as const };
    expect(validateTaskPayload("analysis-v2", payload, project, "live", { sourceText, retrievalEvidence: [trusted] })).toBeNull();
  });

  it.each(["type", "text", "placeholder"]) ("normalizes evidence aliases: %s", variant => {
    const fixture = fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
    const quote = sourceText.slice(0, 8);
    const entry = { id: "alias-test", note: "原文", source: variant === "type" ? undefined : variant === "placeholder" ? "source" : "observation", type: "observation", quote: variant === "type" ? quote : undefined, text: quote };
    const check = (item: typeof entry) => validateTaskPayload("analysis-v2", { ...fixture, evidence: [...fixture.evidence, item] }, project, "live", { sourceText }) as LiteraryAnalysisResult | null;
    expect(check(entry)?.evidence.at(-1)).toEqual({ id: entry.id, note: entry.note, source: "observation", quote });
    // 2026-11-19 变更：引文不在原文的**这一条**被丢弃，其余证据保留（契约 AC6 逐条裁定）。
    // 之前是整包返回 null —— 一条坏证据毁掉全部诊断，已废弃。
    const partial = check({ ...entry, quote: undefined, text: "这段引文不属于原文。" });
    expect(partial).not.toBeNull();
    expect(partial?.evidence.some((item) => item.id === entry.id)).toBe(false);
  });

  it.each([false, true])("validates fifth-batch alternate shapes and ordered excerpts (reversed=%s)", reversed => {
    const fixture = fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
    const a = "第一段被摘录的话", b = "第二段被摘录的话";
    const payload = { ...fixture,
      evidence: [...fixture.evidence, { id: "excerpt", quote: reversed ? `${b}……${a}` : `${a}……${b}` }],
      domainAnalysis: { ...fixture.domainAnalysis, kind: undefined, themes: { stages: fixture.domainAnalysis.themes.stages.map(stage => ({ ...stage, theme: undefined })) } },
      paceCurve: { points: fixture.paceCurve }, emotionCurve: { points: fixture.emotionCurve }, themeHeatmap: { themes: fixture.themeHeatmap },
    };
    const result = validateTaskPayload("analysis-v2", payload, project, "live", { sourceText: `${sourceText}\n> ${a}\n中间的内容\n> ${b}` }) as LiteraryAnalysisResult | null;
    if (reversed) {
      // 倒序拼接的引文应被**丢弃该条**，而不是整包拒绝（契约 AC6）。
      expect(result).not.toBeNull();
      expect(result?.evidence.some((item) => item.id === "excerpt")).toBe(false);
    } else {
      expect(result?.domainAnalysis.kind).toBe("narrative");
      expect(result?.domainAnalysis.themes.stages[0].theme).toBe(fixture.domainAnalysis.themes.stages[0].stage);
      expect(result?.evidence.at(-1)?.source).toBe("observation");
    }
  });

  it("keeps unverified retrieval IDs separate from trusted evidence", () => {
    const fixture = fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" });
    const payload = { ...fixture, retrievalEvidence: [{ retrievalId: "unverified", sourceStatus: "verified" }] };
    expect(validateTaskPayload("analysis-v2", payload, project, "live", { sourceText, retrievalEvidence: [] })).toMatchObject({ retrievalEvidence: [], degradedRetrievalIds: ["unverified"] });
    const trusted = { retrievalId: "server", chunkType: "test", content: "原文", quote: "原文", sourceStatus: "verified" as const };
    expect(validateTaskPayload("analysis-v2", payload, project, "live", { sourceText, retrievalEvidence: [trusted] })).toBeNull();
  });

  it("accepts a narrative diagnosis without any setup-insufficient claim", () => {
    const fixture = structuredClone(fixtureForTask("analysis-v2", project, { sourceText, sourceKind: "narrative" })) as LiteraryAnalysisResult;
    fixture.diagnostics = fixture.diagnostics.map((item) => ({
      ...item,
      effect: "此处转折缺少可回收的前文线索。",
      action: "在前一分段补入一个相同意象，后文再回收。",
    }));

    expect(validateTaskPayload("analysis-v2", fixture, project, "live", { sourceText })).not.toBeNull();
  });

  it("uses concept relations instead of invented characters for argumentative text", () => {
    const argumentative = "数字人文方法强调证据链。可视化只是解释工具，不应替代文本细读。";
    const fixture = fixtureForTask("analysis-v2", project, { sourceText: argumentative, sourceKind: "argumentative" }) as LiteraryAnalysisResult;
    const result = validateTaskPayload("analysis-v2", fixture, project, "demo", { sourceText: argumentative }) as LiteraryAnalysisResult;

    expect(result).not.toBeNull();
    expect(result.relationGraph.nodes.some((node) => node.type === "character" || node.type === "event" || node.type === "place")).toBe(false);
  });
});
