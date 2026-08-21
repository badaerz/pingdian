import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { clearAssetBlobs } from "@/lib/assets/indexed-db";
import { GET as capabilities } from "@/app/api/assets/capabilities/route";
import { POST as ai } from "@/app/api/ai/route";
import { POST as generate } from "@/app/api/generate/route";
import { POST as generateAsset } from "@/app/api/assets/generate/route";
import { GET as downloadAsset } from "@/app/api/assets/download/route";
import { POST as searchKnowledge } from "@/app/api/knowledge/search/route";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

it("never creates a browser Supabase client even when credentials are configured", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";

  expect(createSupabaseBrowserClient()).toBeNull();
});

it("deletes the local generated-asset database when IndexedDB is available", async () => {
  const deleteDatabase = vi.fn(() => {
    const request = {} as IDBOpenDBRequest;
    queueMicrotask(() => request.onsuccess?.(new Event("success") as unknown as Event));
    return request;
  });
  vi.stubGlobal("indexedDB", { deleteDatabase });

  await clearAssetBlobs();

  expect(deleteDatabase).toHaveBeenCalledWith("story-forge-assets");
});

it.each([
  ["capabilities", () => capabilities()],
  ["ai invalid request", () => ai(new Request("http://localhost/api/ai", { method: "POST", body: "{}" }))],
  ["legacy generation invalid request", () => generate(new Request("http://localhost/api/generate", { method: "POST", body: "{}" }))],
  ["asset generation invalid request", () => generateAsset(new Request("http://localhost/api/assets/generate", { method: "POST", body: "{}" }))],
  ["asset download invalid request", () => downloadAsset(new Request("http://localhost/api/assets/download"))],
  ["knowledge search invalid request", () => searchKnowledge(new Request("http://localhost/api/knowledge/search", { method: "POST", body: "{}" }))],
] as const)("marks %s responses as non-cacheable", async (_name, request) => {
  const response = await request();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("removes legacy user-retention tables while preserving the public knowledge schema", async () => {
  const sql = await readFile("supabase/migrations/004_zero_user_data_retention.sql", "utf8");
  expect(sql).toContain("drop table if exists public.ai_runs");
  expect(sql).toContain("drop table if exists public.training_attempts");
  expect(sql).toContain("drop table if exists public.projects");
  expect(sql).not.toContain("drop table if exists public.kb_works");
  expect(sql).not.toContain("drop table if exists public.kb_chunks");
});
