import { vi } from "vitest";

vi.mock("@/lib/story-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/story-store")>();
  const { createFixtureStore } = await import("./story-store");
  return { ...actual, createStoryStore: createFixtureStore };
});
