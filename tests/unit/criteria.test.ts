import { expect, it } from "vitest";
import { CRITERIA_VERSION, getCriteria, stampCriteriaVersion } from "@/lib/ai/criteria";

it("returns the three structural criteria in source order", () => {
  expect(getCriteria({ dimension: "结构组织", limit: 9 }).hits.map(h => h.id)).toEqual(["S1", "S2", "S3"]);
});
it("excludes pending criteria by default", () => {
  expect(getCriteria({ dimension: "连贯衔接" }).hits.map(h => h.id)).toEqual(["C2", "C3"]);
  expect(getCriteria({ dimension: "信息密度与节奏" }).hits.map(h => h.id)).toEqual(["D1", "D3"]);
});
it("allows explicit pending retrieval", () => {
  expect(getCriteria({ dimension: "连贯衔接", includePending: true }).hits.map(h => h.id)).toEqual(["C1", "C2", "C3"]);
});
it("keeps reviewer notes and authority out of injected blocks", () => {
  // block 是结构化对象（2026-11-19 从 JSON 字符串改来），只携带进 prompt 的字段。
  // 纪律：authority（出处给人看）与 note（回代推导过程）不得进 prompt —— 前者会诱发模型复述文献名，
  // 后者等于把答案提前给出。
  const fields = Object.keys(getCriteria({ dimension: "结构组织" }).hits[0].block);
  expect(fields).not.toContain("authority");
  expect(fields).not.toContain("note");
  expect(fields).toEqual(
    expect.arrayContaining(["statement", "checkable", "metric", "typicalTrue", "typicalFalse", "commonFalsePositive", "notApplicable"]),
  );
});
it("returns none for a zero limit", () => {
  expect(getCriteria({ dimension: "意象复现", limit: 0 })).toEqual({ mode: "none", hits: [] });
});
it("stamps version separately", () => {
  expect(CRITERIA_VERSION).toBe("v1.0");
  expect(stampCriteriaVersion(["S2"])).toEqual(["S2@v1.0"]);
});
