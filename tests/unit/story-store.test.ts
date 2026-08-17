import { beforeEach, describe, expect, it } from "vitest";
import {
  STORY_STORE_KEY,
  createProjectDocument,
  createStoryStore,
  loadStoryStore,
  saveStoryStore,
} from "@/lib/story-store";

describe("story store", () => {
  beforeEach(() => localStorage.clear());

  it("persists a new project's independent chapter and setup data", () => {
    const store = createStoryStore();
    const document = createProjectDocument({
      title: "潮汐日记",
      genre: "纯文学短篇",
      logline: "一名潜水员在退潮后发现一座倒置的房子。",
    });
    document.chapters[0].content = "第一段正文";
    document.world.place = "海边小镇";
    store.documents[document.project.id] = document;

    saveStoryStore(store);

    const restored = loadStoryStore();
    expect(restored?.documents[document.project.id].chapters[0].content).toBe("第一段正文");
    expect(restored?.documents[document.project.id].world.place).toBe("海边小镇");
  });

  it("falls back to a fresh store when cached data is invalid", () => {
    localStorage.setItem(STORY_STORE_KEY, "not-json");

    const restored = loadStoryStore();

    expect(restored).toBeNull();
  });
});
