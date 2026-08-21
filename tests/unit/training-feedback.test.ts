import { describe, expect, it } from "vitest";
import { aggregateTrainingTrend, normalizeTrainingFeedback, TREND_DIMENSIONS } from "@/components/training/training-feedback";

const validFeedback = {
  trainingFeedback: {
    strengths: ["动作具体"],
    evidenceQuotes: ["他握住了门把。"],
    issues: ["环境互动不足"],
    nextExperiment: "补一个声音细节",
    questions: ["人物在回避什么？"],
    scores: TREND_DIMENSIONS.map((dimension, index) => ({ dimension, score: 60 + index, reason: "可核验" })),
  },
};

describe("training feedback pure functions", () => {
  it("normalizes strict v2 feedback only when evidence and scores are valid", () => {
    const result = normalizeTrainingFeedback(validFeedback, "他握住了门把。", 1, undefined, new Set(TREND_DIMENSIONS));
    expect(result.evidenceQuotes).toEqual(["他握住了门把。"]);
    expect(result.scores).toHaveLength(6);
  });

  it("fails closed for replacement, out-of-range scores, unknown dimensions, and foreign evidence", () => {
    expect(() => normalizeTrainingFeedback({ trainingFeedback: { ...validFeedback.trainingFeedback, replacement: "代写" } }, "他握住了门把。", 1, undefined, new Set(TREND_DIMENSIONS))).toThrow();
    expect(() => normalizeTrainingFeedback({ trainingFeedback: { ...validFeedback.trainingFeedback, scores: [{ dimension: TREND_DIMENSIONS[0], score: 101, reason: "越界" }] } }, "他握住了门把。", 1, undefined, new Set(TREND_DIMENSIONS))).toThrow();
    expect(() => normalizeTrainingFeedback({ trainingFeedback: { ...validFeedback.trainingFeedback, scores: [{ dimension: "陌生维度", score: 60, reason: "未知" }] } }, "他握住了门把。", 1, undefined, new Set(TREND_DIMENSIONS))).toThrow();
    expect(() => normalizeTrainingFeedback({ trainingFeedback: { ...validFeedback.trainingFeedback, evidenceQuotes: ["不在原文"] } }, "他握住了门把。", 1, undefined, new Set(TREND_DIMENSIONS))).toThrow();
  });

  it("rejects legacy evidence that is not an exact substring of the answer", () => {
    const degraded = normalizeTrainingFeedback({ feedback: { strengths: ["可见"], evidence: "外部范文", issue: ["不足"], nextStep: "再试一次", questions: [] } }, "他握住了门把。", 1, undefined, new Set(TREND_DIMENSIONS));
    expect(degraded.evidenceQuotes).toEqual([]);
  });

  it("aggregates six dimensions across the same exercise history", () => {
    const trend = aggregateTrainingTrend([
      { exerciseId: "EX_001", scores: [{ dimension: TREND_DIMENSIONS[0], score: 40 }] },
      { exerciseId: "EX_001", scores: [{ dimension: TREND_DIMENSIONS[0], score: 80 }] },
      { exerciseId: "EX_002", scores: [{ dimension: TREND_DIMENSIONS[0], score: 99 }] },
    ], "EX_001");
    expect(trend["证据具体性"]).toMatchObject({ values: [40, 80], mean: 60, direction: "up" });
    expect(trend["动作设计"].values).toEqual([]);
  });
});
