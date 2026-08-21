import { describe, expect, it, vi } from "vitest";
import { matchLiteratureKnowledge, searchKnowledge, type SupabaseKnowledgeClient, type SupabaseTableClient, type SupabaseVectorRpcClient } from "@/lib/supabase/sync";
import { knowledgeRecords } from "@/lib/knowledge/catalog";

describe("Supabase public knowledge boundary", () => {
  it("falls back to local knowledge records and applies metadata filters", async () => {
    const result = await searchKnowledge(null, { theme: "孤独", technique: "" });
    expect(result.some((item) => item.title.includes("老人与海"))).toBe(true);
    expect(result.every((item) => item.themes.some((theme) => theme.includes("孤独")))).toBe(true);
  });

  it("merges public remote records without duplicates", async () => {
    const remote = { ...knowledgeRecords[0], title: "远程覆盖标题" };
    const client: SupabaseKnowledgeClient = {
      from() {
        return { async upsert() { return { error: null }; }, async select() { return { data: [remote], error: null }; } };
      },
      async rpc() { return { data: [], error: null }; },
    };
    const result = await searchKnowledge(client, {});
    expect(result).toHaveLength(knowledgeRecords.length);
    expect(result.filter((item) => item.id === remote.id)).toHaveLength(1);
    expect(result.find((item) => item.id === remote.id)?.title).toBe("远程覆盖标题");
  });

  it("uses the server-filtered public chunk RPC and never selects the chunk table", async () => {
    const selectedTables: string[] = [];
    const rpcCalls: Array<{ name: string; params: unknown }> = [];
    const work = knowledgeRecords[0];
    const client = {
      from(name: string) {
        selectedTables.push(name);
        return { async upsert() { return { error: null }; }, async select() { return { data: [{ ...work, core_summary: work.summary, source_status: "pending" }], error: null }; } };
      },
      async rpc(name: string, params: unknown) {
        rpcCalls.push({ name, params });
        return { data: [{ id: "safe-summary", work_id: work.id, chunk_type: "summary", content: "受限摘要", metadata: {} }], error: null };
      },
    };
    const result = await searchKnowledge(client as unknown as SupabaseTableClient, {});
    expect(rpcCalls).toEqual([{ name: "list_public_knowledge_chunks", params: { filter_work_ids: [work.id], match_count: 500 } }]);
    expect(selectedTables).not.toContain("kb_chunks");
    expect(result.find((item) => item.id === work.id)?.sourceChunks).toContain("受限摘要");
  });

  it("calls the public literature vector RPC with its isolated parameter contract", async () => {
    const calls: Array<{ name: string; params: unknown }> = [];
    const embedding = Array.from({ length: 384 }, () => 0);
    const client: SupabaseVectorRpcClient = {
      async rpc(name, params) {
        calls.push({ name, params });
        return { data: [{ id: "chunk-1", work_id: "KB_001", chunk_type: "summary", content: "摘要", metadata: {}, similarity: 0.88 }], error: null };
      },
    };
    const rows = await matchLiteratureKnowledge(client, { embedding, threshold: 0.42, limit: 3, workIds: ["KB_001"], chunkTypes: ["summary"] });
    expect(calls).toEqual([{ name: "match_literature_knowledge", params: { query_embedding: embedding, match_threshold: 0.42, match_count: 3, filter_work_ids: ["KB_001"], filter_chunk_types: ["summary"] } }]);
    expect(rows[0]).toMatchObject({ id: "chunk-1", similarity: 0.88 });
  });

  it("does not call the vector RPC for a non-384-dimensional query", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const rows = await matchLiteratureKnowledge({ rpc } as unknown as SupabaseVectorRpcClient, { embedding: [0], limit: 3 });
    expect(rows).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("drops unknown chunk types returned by the vector RPC", async () => {
    const client: SupabaseVectorRpcClient = {
      async rpc() {
        return { data: [
          { id: "safe", work_id: "KB_001", chunk_type: "summary", content: "摘要", metadata: {}, similarity: 0.8 },
          { id: "unsafe", work_id: "KB_001", chunk_type: "full_text", content: "全文", metadata: {}, similarity: 0.9 },
        ], error: null };
      },
    };
    const rows = await matchLiteratureKnowledge(client, { embedding: Array.from({ length: 384 }, () => 0), limit: 3 });
    expect(rows.map((row) => row.id)).toEqual(["safe"]);
  });

  it("returns local knowledge without querying remote tables when the safe chunk RPC is missing", async () => {
    const from = vi.fn(() => { throw new Error("remote tables must not be queried"); });
    const result = await searchKnowledge({ from } as unknown as SupabaseTableClient, { theme: "孤独" });
    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual(await searchKnowledge(null, { theme: "孤独" }));
  });

  it("returns local knowledge when the public chunk RPC fails", async () => {
    const localTitle = knowledgeRecords[0].title;
    const client = {
      from() {
        return { async upsert() { return { error: null }; }, async select() { return { data: [{ ...knowledgeRecords[0], title: "不得合并的远端标题" }], error: null }; } };
      },
      async rpc() { return { data: null, error: { message: "rpc unavailable" } }; },
    };
    const result = await searchKnowledge(client as unknown as SupabaseTableClient, {});
    expect(result.find((item) => item.id === knowledgeRecords[0].id)?.title).toBe(localTitle);
  });
});
