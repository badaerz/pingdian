import { describe, expect, it } from "vitest";
import { initialStoryState } from "@/data/mock-data";
import { serializeStory } from "@/lib/export-story";

describe("serializeStory", () => {
  it("exports project context and chapters as readable markdown", () => {
    const markdown = serializeStory(initialStoryState, "markdown");

    expect(markdown).toContain("# 雾港来信");
    expect(markdown).toContain("## 第一章 潮声");
    expect(markdown).toContain("一封迟到二十年的信");
  });

  it("exports plain text without markdown headings", () => {
    const text = serializeStory(initialStoryState, "text");

    expect(text).toContain("雾港来信");
    expect(text).not.toContain("# 雾港来信");
  });
});
