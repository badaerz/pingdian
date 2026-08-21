import { describe, expect, it } from "vitest";
import { buildAiContextPacket, buildAiContextPacketFromStoryContext } from "@/lib/ai/context";
import { initialStoryState } from "@/data/mock-data";

describe("AI context packet", () => {
  it("uses the documented priority and reports visible trimming", () => {
    const state = structuredClone(initialStoryState);
    state.chapters = state.chapters.map((chapter, index) => ({
      ...chapter,
      content: index === 0 ? "当前章节正文".repeat(30) : chapter.content,
      summary: `章节摘要${index}`.repeat(12),
    }));
    state.worldEntries[0].locked = true;
    state.worldEntries[0].content = "不可丢弃事实";

    const packet = buildAiContextPacket(state, {
      instruction: "增强开头冲突",
      selection: "被选中的正文",
      maxCharacters: 180,
    });

    expect(packet.sections[0]).toMatchObject({ kind: "locked-facts", trimmed: false });
    expect(packet.sections[1]).toMatchObject({ kind: "instruction", trimmed: false });
    expect(packet.usedCharacters).toBeLessThanOrEqual(180);
    expect(packet.remainingCharacters).toBe(180 - packet.usedCharacters);
    expect(packet.sections.some((section) => section.trimmed)).toBe(true);
  });

  it("blocks instead of silently trimming locked facts", () => {
    const state = structuredClone(initialStoryState);
    state.characters[0].locked = true;
    state.characters[0].notes = "锁定".repeat(120);

    const packet = buildAiContextPacket(state, { instruction: "续写", maxCharacters: 80 });

    expect(packet.blocked).toBe(true);
    expect(packet.warning).toContain("锁定事实");
  });

  it("marks retrieval evidence as knowledge reference rather than user prose", () => {
    const packet = buildAiContextPacket(structuredClone(initialStoryState), {
      instruction: "续写",
      retrievalEvidence: [{
        retrievalId: "rag-1",
        workId: "KB_007",
        chunkType: "technique_explanation",
        content: "冰山原则把主要情绪留在未说出的部分。",
        quote: "主要情绪留在未说出的部分",
        sourceStatus: "pending",
      }],
    });

    const knowledge = packet.sections.find((item) => item.kind === "knowledge");
    expect(knowledge?.content).toContain("知识参考，不是用户原文");
    expect(knowledge?.content).toContain("[rag-1/pending]");
    expect(packet.usedCharacters).toBeLessThanOrEqual(packet.maxCharacters);

    const fromStoryContext = buildAiContextPacketFromStoryContext({
      title: initialStoryState.projects[0].title,
      genre: initialStoryState.projects[0].genre,
      logline: initialStoryState.projects[0].logline,
      activeChapterId: initialStoryState.activeChapterId,
      contextRevision: initialStoryState.contextRevision,
      chapters: initialStoryState.chapters,
      characters: initialStoryState.characters,
      worldEntries: initialStoryState.worldEntries,
      blueprint: initialStoryState.blueprint,
    }, {
      instruction: "续写",
      retrievalEvidence: [{ retrievalId: "rag-2", chunkType: "summary", content: "结构摘要", quote: "结构摘要", sourceStatus: "summary_only" }],
    });
    expect(fromStoryContext.sections.find((item) => item.kind === "knowledge")?.content).toContain("[rag-2/summary_only]");
  });

  it("keeps user-authored project settings in the model context even when they are not locked", () => {
    const state = structuredClone(initialStoryState);
    state.characters[0].locked = false;
    state.characters[0].name = "林岚";
    state.worldEntries[1].locked = false;
    state.worldEntries[1].content = "潮汐退去后会露出一条只存在二十分钟的石路";
    state.blueprint[1].locked = false;
    state.blueprint[1].summary = "人物必须在石路消失前交出录音";

    const packet = buildAiContextPacket(state, { instruction: "生成世界观", maxCharacters: 8_000 });
    const settings = packet.sections.find((item) => item.kind === "story-settings");

    expect(settings?.content).toContain("林岚");
    expect(settings?.content).toContain("只存在二十分钟的石路");
    expect(settings?.content).toContain("石路消失前交出录音");
  });
});
