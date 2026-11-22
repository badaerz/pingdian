import { afterEach, expect, it, vi } from "vitest";
import { clearAssetBlobs } from "@/lib/assets/indexed-db";
import { GET as capabilities } from "@/app/api/assets/capabilities/route";
import { POST as ai } from "@/app/api/ai/route";
import { POST as generate } from "@/app/api/generate/route";
import { POST as generateAsset } from "@/app/api/assets/generate/route";
import { GET as downloadAsset } from "@/app/api/assets/download/route";

afterEach(() => {
  vi.unstubAllGlobals();
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
] as const)("marks %s responses as non-cacheable", async (_name, request) => {
  const response = await request();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
