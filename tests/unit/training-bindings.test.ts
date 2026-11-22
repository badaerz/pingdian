import { expect, it } from "vitest";
import { trainingBindings } from "@/lib/training/bindings";

it("keeps only unique bindings to accepted quotes and existing feedback", () => {
  const valid = { quote: "叮当响", group: "strengths", index: 0 };
  const feedback = { evidenceQuotes: ["叮当响"], strengths: ["用声音开场"], issues: [] };
  expect(trainingBindings([
    valid, valid, { ...valid, quote: "不存在" }, { ...valid, group: "issues" }, { ...valid, index: 1 },
  ], feedback)).toEqual([valid]);
});
