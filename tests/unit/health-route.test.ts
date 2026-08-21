import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("health route", () => {
  it("returns only public service health metadata without caching", async () => {
    vi.stubEnv("APP_VERSION", "2026.08.22");
    vi.stubEnv("npm_package_version", "9.8.7");
    vi.stubEnv("DEEPSEEK_API_KEY", "provider-secret-must-not-leak");
    vi.stubEnv("DEEPSEEK_MODEL", "private-provider-model");

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      status: "ok",
      service: "story-forge",
      version: "2026.08.22",
    });
    expect(text).not.toContain("provider-secret-must-not-leak");
    expect(text).not.toContain("private-provider-model");
  });

  it("falls back to npm package metadata when the deployment version is unavailable", async () => {
    vi.stubEnv("APP_VERSION", "");
    vi.stubEnv("npm_package_version", "9.8.7");

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "story-forge",
      version: "9.8.7",
    });
  });

  it("uses an unknown version when package metadata is unavailable", async () => {
    vi.stubEnv("APP_VERSION", "");
    vi.stubEnv("npm_package_version", "");

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "story-forge",
      version: "unknown",
    });
  });
});
