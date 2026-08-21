import { describe, expect, it } from "vitest";
import { canMutateDemoState, isDefenseProjectId, isDemoLocked } from "@/lib/demo-mode";

const baseState = {
  activeProjectId: "demo",
  chapters: [{ id: "chapter-1", content: "原始正文" }],
  characters: [{ id: "character-1", name: "杭盖" }],
  worldEntries: [{ id: "world-1", content: "矿区规则" }],
  blueprint: [{ id: "beat-1", summary: "开端" }],
  versions: [],
};

describe("答辩模式边界", () => {
  it("只把内置答辩项目识别为受保护项目", () => {
    expect(isDefenseProjectId("demo")).toBe(true);
    expect(isDefenseProjectId("demo-demo_002")).toBe(true);
    expect(isDefenseProjectId("project-user-created")).toBe(false);
  });

  it("只在显式开启 NEXT_PUBLIC_DEMO_LOCKED 时锁定", () => {
    expect(isDemoLocked({ NEXT_PUBLIC_DEMO_LOCKED: "true" })).toBe(true);
    expect(isDemoLocked({ NEXT_PUBLIC_DEMO_LOCKED: "false" })).toBe(false);
    expect(isDemoLocked({})).toBe(false);
  });

  it("锁定时阻止主案例正文结构变化，但允许候选与分析结果更新", () => {
    expect(canMutateDemoState(baseState, { ...baseState, chapters: [{ id: "chapter-1", content: "被改写" }] }, true)).toBe(false);
    expect(canMutateDemoState(baseState, { ...baseState, candidates: [{ id: "candidate-1" }] }, true)).toBe(true);
    expect(canMutateDemoState(baseState, { ...baseState, analysisSnapshots: [{ id: "snapshot-1" }] }, true)).toBe(true);
    expect(canMutateDemoState({ ...baseState, activeProjectId: "project-user-created" }, { ...baseState, activeProjectId: "project-user-created", chapters: [{ id: "chapter-1", content: "用户新稿" }] }, true)).toBe(true);
  });

  it("环境开关关闭时仍拒绝答辩案例正式字段变化", () => {
    expect(canMutateDemoState(baseState, { ...baseState, chapters: [{ id: "chapter-1", content: "被改写" }] }, false)).toBe(false);
    expect(canMutateDemoState(baseState, { ...baseState, candidates: [{ id: "candidate-1" }] }, false)).toBe(true);
  });

});
