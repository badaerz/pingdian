import { describe, it, expect } from "vitest";
import { criteriaBlock } from "@/lib/ai/tasks";

/**
 * 判据注入回归测试。
 *
 * 守住两条纪律：
 * 1. analysis-v2 注入六维全部可判定条目
 * 2. pending 判据（C1/D2）不得注入 —— 阈值未定，注入了模型会强行判定
 */
describe("判据注入", () => {
  it("analysis-v2 注入 16 条不同判据", () => {
    const block = criteriaBlock("analysis-v2");
    expect(new Set(block.match(/^\[[A-Z]\d+\]/gm)).size).toBe(16);
    console.log("\n注入块长度:", block.length);
    for (const id of ["P1","P2","P3","M1","M2","M3"]) {
      console.log(`  含 [${id}]:`, block.includes(`[${id}]`));
    }
    console.log("  含 criteriaIds 要求:", block.includes("criteriaIds"));
    expect(block).toContain("[P1]");
    expect(block).toContain("[M3]");
    expect(block).toContain("criteriaIds");
  });

  it("其他任务不注入", () => {
    for (const t of ["ideas", "prose", "mentor", "knowledge-extract"] as const) {
      expect(criteriaBlock(t)).toBe("");
    }
    console.log("\n  其他任务均不注入 ✓");
  });

  it("不注入 pending 判据（C1/D2）", () => {
    const block = criteriaBlock("analysis-v2");
    console.log("  含 [C1]:", block.includes("[C1]"), " 含 [D2]:", block.includes("[D2]"));
    expect(block).not.toContain("[C1]");
    expect(block).not.toContain("[D2]");
  });
});
