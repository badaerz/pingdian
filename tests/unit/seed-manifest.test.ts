import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("Supabase knowledge seed manifest", () => {
  it("contains the 12 supplemental works needed to reach 20", async () => {
    const content = await readFile("incoming/knowledge/supplemental_knowledge_seed.json", "utf8");
    const works = JSON.parse(content) as Array<{ id?: string }>;
    expect(works).toHaveLength(12);
    expect(new Set(works.map((work) => work.id)).size).toBe(12);
  });

  it("defines the 384-dimensional secure-invoker literature match RPC", async () => {
    const sql = await readFile("supabase/migrations/002_literature_rag.sql", "utf8");
    expect(sql).toContain("match_literature_knowledge");
    expect(sql).toContain("query_embedding vector(384)");
    expect(sql).toContain("filter_work_ids text[] default null");
    expect(sql).toContain("filter_chunk_types text[] default null");
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toMatch(/embedding is not null/i);
    expect(sql).toMatch(/grant execute[\s\S]*to anon, authenticated/i);
    expect(sql).toMatch(/using gin\s*\(metadata\)/i);
    expect(sql).toMatch(/add column if not exists source_status/i);
    expect(sql).toMatch(/limit least\s*\(\s*greatest[\s\S]*8\s*\)/i);
    expect(sql).toMatch(/source_status/);
    expect(sql).toMatch(/drop policy if exists "knowledge chunks public read"/i);
    expect(sql).toMatch(/metadata->>'source_status'\s*=\s*'verified'/i);
    expect(sql).toMatch(/char_length\(content\)\s*<=\s*2000/i);
    expect(sql).toMatch(/join public\.kb_works as works\s+on works\.id = chunks\.work_id/i);
    expect(sql).toMatch(/works\.source_status\s*=\s*'verified'/i);
    expect(sql).toMatch(/kb_chunks_chunk_type_check[\s\S]*chunk_type in \('summary', 'technique_explanation', 'case_excerpt', 'text_sample'\)/i);
    expect(sql).toMatch(/list_public_knowledge_chunks/i);
    expect(sql).toMatch(/replace_literature_knowledge_chunks/i);
    const publicPolicy = sql.slice(sql.indexOf('create policy "knowledge chunks public read"'), sql.indexOf("create or replace function public.list_public_knowledge_chunks"));
    const publicMatch = sql.slice(sql.indexOf("create or replace function public.match_literature_knowledge("), sql.indexOf("grant execute on function public.match_literature_knowledge"));
    expect(publicPolicy).toMatch(/chunk_type in \('summary', 'technique_explanation', 'case_excerpt'\)/i);
    expect(publicPolicy).not.toContain("chunk_type = 'text_sample'");
    expect(publicMatch).toMatch(/chunks\.chunk_type in \('summary', 'technique_explanation', 'case_excerpt'\)/i);
    expect(publicMatch).not.toContain("chunks.chunk_type = 'text_sample'");
    expect(sql).toMatch(/match_literature_knowledge_private[\s\S]*works\.source_status\s*=\s*'verified'[\s\S]*metadata->>'source_status'\s*=\s*'verified'/i);
    expect(sql).toMatch(/revoke all on function public\.match_literature_knowledge_private[\s\S]*grant execute[\s\S]*to service_role/i);
  });

  it("does not issue a direct delete when the transactional chunk replacement fails", async () => {
    const moduleUrl = pathToFileURL(resolve("scripts/seed-supabase.mjs")).href;
    const program = `
      import { replaceSeedChunks } from ${JSON.stringify(moduleUrl)};
      const calls = [];
      const client = {
        rpc: async (name) => { calls.push(\`rpc:\${name}\`); return { error: { message: "insert failed" } }; },
        from: (name) => ({ delete: () => { calls.push(\`delete:\${name}\`); } }),
      };
      let error = "";
      try { await replaceSeedChunks(client, ["KB_001"], [{ work_id: "KB_001", chunk_type: "summary", content: "摘要", metadata: {} }]); }
      catch (value) { error = value instanceof Error ? value.message : String(value); }
      process.stdout.write(JSON.stringify({ calls, error }));
    `;
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", program], { cwd: process.cwd() });
    expect(JSON.parse(stdout)).toEqual({ calls: ["rpc:replace_literature_knowledge_chunks"], error: "insert failed" });
  });

  it("builds keyword-only safe chunks when embedding configuration is absent", async () => {
    const work = {
      id: "KB_001",
      title: "待核验作品",
      author: "测试作者",
      copyright: { status: "public_domain", source_url: "https://source.example/work" },
      core_summary: "作品摘要",
      themes: { main_theme: "主题" },
      techniques_and_craft: { narrative_perspective: "限制视角", literary_devices: [{ name: "留白", function: "保留言外之意" }] },
      why_write_this_way_case: { selected_text: "安全的短案例", literary_analysis: "结构化分析", writing_advice: "写作建议" },
    };
    const moduleUrl = pathToFileURL(resolve("scripts/seed-supabase.mjs")).href;
    const program = `
      import { buildSeedChunks } from ${JSON.stringify(moduleUrl)};
      const result = await buildSeedChunks(${JSON.stringify([work])}, {
        embeddingConfig: null,
        readSourceText: async () => "不得导入的本地长文本".repeat(100),
      });
      process.stdout.write(JSON.stringify(result));
    `;
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", program], {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", EMBEDDING_API_KEY: "" },
    });
    const result = JSON.parse(stdout);

    expect(result.mode).toBe("keyword");
    expect(result.chunks.map((chunk: { chunk_type: string }) => chunk.chunk_type)).toEqual(["summary", "technique_explanation", "case_excerpt"]);
    expect(result.chunks.some((chunk: { chunk_type: string }) => chunk.chunk_type === "text_sample")).toBe(false);
    expect(result.chunks.every((chunk: { metadata: Record<string, unknown> }) => chunk.metadata.source_status === "pending")).toBe(true);
    expect(result.chunks.every((chunk: { metadata: Record<string, unknown> }) => ["title", "author", "source_status", "source_url", "quote", "start", "end"].every((key) => key in chunk.metadata))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("不得导入的本地长文本");
  });

  it("reports partial mode when only some configured embeddings succeed", async () => {
    const moduleUrl = pathToFileURL(resolve("scripts/seed-supabase.mjs")).href;
    const program = `
      import { buildSeedChunks } from ${JSON.stringify(moduleUrl)};
      let calls = 0;
      const result = await buildSeedChunks([{
        id: "PARTIAL_1", title: "部分向量", author: "作者", core_summary: "摘要",
        techniques_and_craft: { narrative_perspective: "视角" },
        why_write_this_way_case: { selected_text: "案例" },
      }], { embeddingConfig: {
        apiKey: "secret", baseUrl: "https://embedding.example/v1", model: "model",
        fetcher: async () => ++calls === 1
          ? Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0) }] })
          : new Response("failed", { status: 503 }),
      }});
      process.stdout.write(JSON.stringify({ mode: result.mode, embedded: result.chunks.filter((item) => item.embedding).length }));
    `;
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", program], { cwd: process.cwd() });
    expect(JSON.parse(stdout)).toEqual({ mode: "partial", embedded: 1 });
  });

  it("does not generate embeddings for a non-384-dimensional seed configuration", async () => {
    const moduleUrl = pathToFileURL(resolve("scripts/seed-supabase.mjs")).href;
    const program = `
      import { buildSeedChunks } from ${JSON.stringify(moduleUrl)};
      let calls = 0;
      const result = await buildSeedChunks([{
        id: "DIM_1", title: "维度契约", author: "作者", core_summary: "摘要",
        techniques_and_craft: { narrative_perspective: "视角" },
        why_write_this_way_case: { selected_text: "案例" },
      }], { embeddingConfig: {
        apiKey: "secret", baseUrl: "https://embedding.example/v1", model: "model", dimensions: 1536,
        fetcher: async () => { calls += 1; return Response.json({ data: [{ embedding: Array.from({ length: 1536 }, () => 0) }] }); },
      }});
      process.stdout.write(JSON.stringify({ mode: result.mode, embedded: result.chunks.filter((item) => item.embedding).length, calls }));
    `;
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", program], { cwd: process.cwd() });
    expect(JSON.parse(stdout)).toEqual({ mode: "keyword", embedded: 0, calls: 0 });
  });
});
