import { describe, expect, it, vi } from "vitest";
import { retrieveKnowledge } from "@/lib/ai/retrieval";
import type { KnowledgeRecord } from "@/lib/knowledge/catalog";

function knowledgeRecord(overrides: Partial<KnowledgeRecord> & Pick<KnowledgeRecord, "id" | "title">): KnowledgeRecord {
  const { id, title, ...rest } = overrides;
  return {
    id,
    title,
    author: "测试作者",
    era: "测试时期",
    genre: "小说",
    summary: "共同主题",
    themes: ["共同主题"],
    techniques: [],
    sourceStatus: "pending",
    sourceChunks: [],
    deconstruction: { plot: [], imagery: [], selectedText: "", explanation: "", trainingPrompt: "" },
    ...rest,
  };
}

describe("retrieveKnowledge", () => {
  it("prefers valid vector results and derives source status from the server catalog", async () => {
    const record = knowledgeRecord({ id: "work-1", title: "向量作品", sourceStatus: "verified", sourceUrl: "https://source.example/work-1" });
    const vectorSearch = vi.fn(async () => [{
      id: "chunk-1",
      work_id: "work-1",
      chunk_type: "summary",
      content: "向量命中的摘要",
      metadata: { source_status: "pending", source_url: "https://untrusted.example" },
      similarity: 0.91,
    }]);

    const result = await retrieveKnowledge({ query: "向量命中" }, {
      records: [record],
      createEmbedding: async () => Array.from({ length: 384 }, () => 0),
      vectorSearch,
    });

    expect(result.mode).toBe("vector");
    expect(vectorSearch).toHaveBeenCalledOnce();
    expect(result.evidence[0]).toMatchObject({
      retrievalId: "chunk-1",
      workId: "work-1",
      sourceStatus: "verified",
      sourceUrl: "https://source.example/work-1",
      similarity: 0.91,
    });
  });

  it("falls back to keyword retrieval when vector RPC fails and finds a subtext technique", async () => {
    const records = [
      knowledgeRecord({ id: "KB_007", title: "老人与海", techniques: ["冰山原则"], deconstruction: { plot: [], imagery: [], selectedText: "", explanation: "只写水面动作，把情绪留在水下。", trainingPrompt: "" } }),
      knowledgeRecord({ id: "KB_999", title: "无关作品", techniques: ["编年叙事"] }),
    ];

    const result = await retrieveKnowledge({ query: "如何写出对话的潜台词" }, {
      records,
      createEmbedding: async () => Array.from({ length: 384 }, () => 0),
      vectorSearch: async () => { throw new Error("rpc unavailable"); },
    });

    expect(result.mode).toBe("keyword");
    expect(result.evidence[0]).toMatchObject({ workId: "KB_007", chunkType: "technique_explanation" });
  });

  it("falls back to keyword retrieval when embedding creation throws", async () => {
    const record = knowledgeRecord({ id: "throw-1", title: "异常兜底", techniques: ["潜台词"] });
    const vectorSearch = vi.fn(async () => []);
    const result = await retrieveKnowledge({ query: "潜台词" }, {
      records: [record],
      createEmbedding: async () => { throw new Error("embedding unavailable"); },
      vectorSearch,
    });
    expect(result.mode).toBe("keyword");
    expect(result.evidence[0].workId).toBe("throw-1");
    expect(vectorSearch).not.toHaveBeenCalled();
  });

  it("does not trust vector metadata to expose pending long text samples by default", async () => {
    const pending = knowledgeRecord({ id: "pending-1", title: "待核验作品", sourceStatus: "pending", summary: "普通摘要", themes: [], sourceChunks: ["潮汐暗号".repeat(100)] });

    const result = await retrieveKnowledge({ query: "潮汐暗号" }, {
      records: [pending],
      createEmbedding: async () => Array.from({ length: 384 }, () => 0),
      vectorSearch: async () => [{ id: "unsafe", work_id: "pending-1", chunk_type: "text_sample", content: "潮汐暗号".repeat(100), metadata: { source_status: "verified" }, similarity: 0.99 }],
    });

    expect(result).toEqual({ mode: "none", evidence: [] });
  });

  it("never exposes pending text samples through the public imitation flag", async () => {
    const pending = knowledgeRecord({ id: "pending-2", title: "待核验作品", sourceStatus: "pending", summary: "普通摘要", themes: [], sourceChunks: ["未核验长文本"] });
    const result = await retrieveKnowledge({ query: "未核验长文本", allowImitation: true, chunkTypes: ["text_sample"] }, {
      records: [pending],
      createEmbedding: async () => Array.from({ length: 384 }, () => 0),
      vectorSearch: async () => [{ id: "unsafe-2", work_id: "pending-2", chunk_type: "text_sample", content: "未核验长文本", metadata: {}, similarity: 0.99 }],
    });
    expect(result).toEqual({ mode: "none", evidence: [] });
  });

  it("requires explicit imitation permission for verified text samples", async () => {
    const verified = knowledgeRecord({ id: "verified-1", title: "已核验作品", sourceStatus: "verified", summary: "普通摘要", themes: [], sourceChunks: ["已核验样本"] });
    const dependencies = { records: [verified], createEmbedding: async () => null, vectorSearch: async () => [] };
    await expect(retrieveKnowledge({ query: "已核验样本", chunkTypes: ["text_sample"] }, dependencies)).resolves.toEqual({ mode: "none", evidence: [] });
    const allowed = await retrieveKnowledge({ query: "已核验样本", allowImitation: true, chunkTypes: ["text_sample"] }, dependencies);
    expect(allowed.mode).toBe("keyword");
    expect(allowed.evidence[0]).toMatchObject({ chunkType: "text_sample", sourceStatus: "verified" });
  });

  it("rejects unknown vector chunk types and deduplicates by work, type, and content", async () => {
    const record = knowledgeRecord({ id: "safe-1", title: "安全作品", sourceStatus: "verified" });
    const result = await retrieveKnowledge({ query: "重复证据" }, {
      records: [record],
      createEmbedding: async () => Array.from({ length: 384 }, () => 0),
      vectorSearch: async () => [
        { id: "unknown-1", work_id: record.id, chunk_type: "full_text", content: "不得返回", similarity: 0.99 },
        { id: "unknown-2", work_id: record.id, chunk_type: "text-sample", content: "不得返回", similarity: 0.98 },
        { id: "duplicate-low", work_id: record.id, chunk_type: "summary", content: "重复证据", similarity: 0.7 },
        { id: "duplicate-high", work_id: record.id, chunk_type: "summary", content: "重复证据", similarity: 0.9 },
      ],
    });

    expect(result.mode).toBe("vector");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({ retrievalId: "duplicate-high", chunkType: "summary", similarity: 0.9 });
  });

  it("rejects verified text samples longer than the short evidence limit", async () => {
    const record = knowledgeRecord({ id: "verified-long", title: "已核验长文", sourceStatus: "verified", sourceChunks: ["长".repeat(2_001)] });
    const result = await retrieveKnowledge({ query: "长", allowImitation: true, chunkTypes: ["text_sample"] }, {
      records: [record],
      createEmbedding: async () => null,
      vectorSearch: async () => [],
    });
    expect(result).toEqual({ mode: "none", evidence: [] });
  });

  it("sorts ties stably, deduplicates evidence, and clamps limit to eight", async () => {
    const records = Array.from({ length: 10 }, (_, index) => knowledgeRecord({ id: `work-${String(index).padStart(2, "0")}`, title: `作品${index}`, summary: "共同主题" })).reverse();
    const result = await retrieveKnowledge({ query: "共同主题", limit: 99 }, {
      records,
      createEmbedding: async () => null,
      vectorSearch: async () => [],
    });

    expect(result.mode).toBe("keyword");
    expect(result.evidence).toHaveLength(8);
    expect(new Set(result.evidence.map((item) => item.retrievalId)).size).toBe(8);
    expect(result.evidence[0].workId).toBe("work-00");
  });

  it("returns none for an empty query", async () => {
    await expect(retrieveKnowledge({ query: "   " }, { records: [], createEmbedding: async () => null, vectorSearch: async () => [] })).resolves.toEqual({ mode: "none", evidence: [] });
  });

  it("keeps a single Chinese character as a keyword term", async () => {
    const result = await retrieveKnowledge({ query: "爱" }, {
      records: [knowledgeRecord({ id: "love-1", title: "相关作品", summary: "关于爱与选择", themes: ["爱"] })],
      createEmbedding: async () => null,
      vectorSearch: async () => [],
    });
    expect(result.mode).toBe("keyword");
    expect(result.evidence[0].workId).toBe("love-1");
  });
});
