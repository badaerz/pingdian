/**
 * 存档层的降级验收（Claude 写，独立于实现）。
 *
 * 背景：校验层改成「逐项降级」之后，诊断不再回退成 demo 了。
 * 但结果要经 createAnalysisSnapshot 存本地、下次加载再走一遍存档校验。
 * 实测发现存档层还是降级之前的老逻辑：任一项不合规就整条快照作废，
 * **用户看到一份正常诊断，刷新一次页面就没了，而且没有任何提示**。
 *
 * 这份测试固定两件事：
 *   1. 降级产生的空块（热力图/曲线/维度/样式指标）不许把整条快照弄死
 *   2. 防幻觉底线在存档层同样不许松：证据指向不存在、编造 inference 撑图、
 *      诊断全空，这三类必须继续被拒
 *
 * 期望（2026-11-20 用 probe_snapshot_survive.mjs 实测确认过）：
 *   基准 / 热力图置空 / 曲线置空 / 专业维度名 / 样式指标不足六项  → 存活
 *   编造 evidence 撑图节点 / 诊断全空                          → 整条丢弃
 *   单条诊断证据造假                                            → 存活，但该条不得幸存
 */
import { describe, it, expect } from "vitest";
import { createStoryStore, reconcileStoryStore } from "@/lib/story-store";
import { createAnalysisSnapshot } from "@/lib/analysis/snapshot";
import { fixtureForTask } from "@/lib/ai/fixtures";
import { contextFromState } from "@/lib/ai/story-context";
import { initialStoryState } from "@/data/mock-data";
import type { LiteraryAnalysisResult } from "@/lib/types";

function survives(degrade: (result: LiteraryAnalysisResult) => void, id: string): boolean {
  const store = createStoryStore();
  const context = contextFromState(initialStoryState);
  const sourceText = context.chapters[0].content;
  const result = fixtureForTask("analysis-v2", context, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
  degrade(result);
  const snapshot = createAnalysisSnapshot({
    projectId: "demo",
    chapterId: "demo-chapter-1",
    sourceText,
    contextRevision: 3,
    mode: "live",
    warnings: [],
    result,
    id,
    now: "2026-08-21T00:00:00.000Z",
  });
  const document = { ...structuredClone(store.documents.demo), analysisSnapshots: [snapshot] };
  const reconciled = reconcileStoryStore({ version: 3, documents: { demo: document } } as never);
  return reconciled.documents.demo.analysisSnapshots.length === 1;
}

describe("降级产生的空块不许把整条快照弄死", () => {
  it("基准：未降级的结果刷新后仍在（基准不过，后面都不成立）", () => {
    expect(survives(() => {}, "base")).toBe(true);
  });

  it("themeHeatmap 被降级置空：快照仍保留", () => {
    expect(survives((result) => { result.themeHeatmap = []; }, "empty-heatmap")).toBe(true);
  });

  it("曲线被降级置空：快照仍保留", () => {
    expect(survives((result) => { result.paceCurve = []; }, "empty-curve")).toBe(true);
  });

  it("维度名用专业名（不匹配写死的四类词）：快照仍保留", () => {
    // 校验层早已删掉「四域名必须含 人物/情节/主题/语言」这条规则，
    // 存档层不能比校验层更严，否则前端放行的东西后端存不下。
    expect(survives((result) => {
      result.analysis = result.analysis.map((dimension, index) => ({
        ...dimension,
        name: ["以喜衬悲与语调控制", "结尾留白", "叠字与重复", "白描节奏", "短句压迫"][index] ?? dimension.name,
      }));
    }, "pro-dimension-names")).toBe(true);
  });

  it("曲线只剩一个有效点：快照存活，且那一个点要留下来", () => {
    const store = createStoryStore();
    const context = contextFromState(initialStoryState);
    const sourceText = context.chapters[0].content;
    const result = fixtureForTask("analysis-v2", context, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
    result.paceCurve = [{ segment: "开端", value: 40, evidenceId: result.paceCurve[0].evidenceId }];
    result.emotionCurve = [{ segment: "开端", value: 30, evidenceId: result.emotionCurve[0].evidenceId }];
    const snapshot = createAnalysisSnapshot({
      projectId: "demo", chapterId: "demo-chapter-1", sourceText, contextRevision: 3,
      mode: "live", warnings: [], result, id: "single-point-curve", now: "2026-08-21T00:00:00.000Z",
    });
    const document = { ...structuredClone(store.documents.demo), analysisSnapshots: [snapshot] };
    const reconciled = reconcileStoryStore({ version: 3, documents: { demo: document } } as never);
    const kept = reconciled.documents.demo.analysisSnapshots;
    expect(kept.length).toBe(1);
    expect(kept[0]!.plotCurve).toHaveLength(1);
    expect(kept[0]!.emotionCurve).toHaveLength(1);
    expect(kept[0]!.plotCurve[0]!.value).toBe(40);
  });

  it("样式指标不足六项：保留有效项，不否决整条", () => {
    expect(survives((result) => { result.styleProfile = { metrics: result.styleProfile.metrics.slice(0, 3) }; }, "partial-style")).toBe(true);
  });
});

describe("防幻觉底线在存档层同样不许松", () => {
  it("诊断的证据指向不存在的证据 id：该条诊断不得幸存，其余照常保留", () => {
    // 夹具里有两条诊断。篡改第一条的证据后，正确行为是「丢这一条、留另一条」，
    // 而不是整条快照作废——但编造的那一条绝对不许活下来。
    const store = createStoryStore();
    const context = contextFromState(initialStoryState);
    const sourceText = context.chapters[0].content;
    const result = fixtureForTask("analysis-v2", context, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
    const tamperedId = result.diagnostics[0].id;
    const survivorId = result.diagnostics[1].id;
    result.diagnostics[0].evidenceIds = ["missing-evidence"];
    const snapshot = createAnalysisSnapshot({
      projectId: "demo", chapterId: "demo-chapter-1", sourceText, contextRevision: 3,
      mode: "live", warnings: [], result, id: "fake-diagnostic-evidence", now: "2026-08-21T00:00:00.000Z",
    });
    const document = { ...structuredClone(store.documents.demo), analysisSnapshots: [snapshot] };
    const reconciled = reconcileStoryStore({ version: 3, documents: { demo: document } } as never);
    const kept = reconciled.documents.demo.analysisSnapshots;
    expect(kept.length).toBe(1);
    const ids = (kept[0]!.diagnostics ?? []).map((diagnostic) => diagnostic.id);
    expect(ids).not.toContain(tamperedId);
    expect(ids).toContain(survivorId);
  });

  it("用编造的 inference 证据撑图节点：整条快照被拒", () => {
    expect(survives((result) => {
      result.evidence.push({ id: "inference-only", source: "inference", claim: "编造", note: "推断" });
      result.relationGraph.nodes[0].evidenceIds = ["inference-only"];
    }, "inference-graph")).toBe(false);
  });

  it("诊断被清空：核心不成立，整条快照被拒", () => {
    expect(survives((result) => { result.diagnostics = []; }, "no-diagnostics")).toBe(false);
  });
});
