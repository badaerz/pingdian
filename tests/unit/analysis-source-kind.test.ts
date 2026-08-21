import { describe, expect, it } from "vitest";
import { detectLiterarySourceKind } from "@/lib/analysis/source-kind";

describe("literary source kind detection", () => {
  it("detects argumentative reasoning instead of relying on the default selector", () => {
    expect(detectLiterarySourceKind("数字人文可视化必须回到证据链。因此，图谱不能替代文本细读；首先应核验材料来源，其次说明推理边界。"))
      .toBe("argumentative");
  });

  it("keeps scene-and-action prose in the narrative branch", () => {
    expect(detectLiterarySourceKind("门外传来三下敲击。沈砚推开木窗，看见潮水正越过码头。他没有拆开那封信。"))
      .toBe("narrative");
  });
});
