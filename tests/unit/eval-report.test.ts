import { expect, it } from "vitest";
import { renderReport, type Run } from "../../scripts/eval-report.mjs";

it("同一天的分片合并，排除回退和空输出，按不同样本计算缺口", () => {
  const runs = ["live", "demo", "live"].map((mode,i): Run => ({
    file: i + ".json", ranAt: `2026-11-19T0${i}:00:00Z`, mode: "live",
    cases: [{ id: "GC_" + i, title: "样本", mode, empty: i === 2, matched: 0, expected: 1, diagnostics: 1, anchoredCount: 1, missedClaims: ["预期发现"] }],
    summary: { conclusionAccuracy: 0, traceabilityRate: 100, hallucinationRate: 0,
      counts: { cases: 1, matchedTotal: 0, expectedTotal: 1, diagnosticsTotal: 1, anchoredTotal: 1 } },
  }));
  const report = renderReport(runs, new Date(runs[0].ranAt));
  const trend = report.split("\n").filter(line => line.startsWith("|2026-11-19|"));
  expect(trend).toHaveLength(1);
  expect(trend[0]).toContain("|1/3|");
  expect(trend[0]).toMatch(/\|0\/1\|$/);
  expect(report).toContain("|demo 回退|GC_1|");
  expect(report).toContain("|空输出|GC_2|");
  expect(report).toContain("距下限尚差 27 条");
});
