# 永久保留答辩案例 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让两个内置答辩案例始终保留在项目桌面，用户无法删除，同时不改变用户自建作品的删除行为。

**Architecture:** 复用 `isDefenseProjectId()` 作为唯一保护判定，在 `StoryProvider.removeProject` 的状态写入边界无条件拒绝两个内置 ID。项目桌面对受保护项目显示明确的永久保留状态并移除删除入口；现有 `reconcileStoryStore` 的 canonical 恢复逻辑继续负责旧存储缺失时补回案例。

**Tech Stack:** Next.js App Router、React、TypeScript、Vitest、Testing Library、localStorage。

---

### Task 1: Provider 删除边界

**Files:**
- Modify: `tests/components/story-provider.test.tsx`
- Modify: `src/providers/story-provider.tsx:157-165`

- [x] **Step 1: Write the failing test**

新增 `BuiltinDeleteProbe`，在 `NEXT_PUBLIC_DEMO_LOCKED` 未开启时分别调用 `removeProject("demo")` 和 `removeProject("demo-demo_002")`，断言两个标题仍存在且 v3 存储仍保留两个 ID。

- [x] **Step 2: Run the focused test and verify it fails**

运行 `npm run test -- tests/components/story-provider.test.tsx`，预期新增用例失败，因为当前实现只在答辩锁定开关开启时拒绝内置案例删除。

- [x] **Step 3: Implement the minimal guard**

把 `removeProject` 的保护条件从 `(demoLocked && isDefenseProjectId(id))` 改为 `isDefenseProjectId(id)`，保留用户项目删除和最后一个项目保护逻辑不变。

- [x] **Step 4: Run the focused test and verify it passes**

再次运行 `npm run test -- tests/components/story-provider.test.tsx`，预期全部通过。

### Task 2: 项目桌面永久保留提示

**Files:**
- Modify: `tests/components/project-dashboard.test.tsx`
- Modify: `src/components/projects/project-dashboard.tsx:1,88-98`

- [x] **Step 1: Write the failing UI test**

断言两个内置案例各显示一次“答辩案例 · 永久保留”，并且“删除 回响的草场”和“删除 雾港来信”按钮不存在。

- [x] **Step 2: Run the focused test and verify it fails**

运行 `npm run test -- tests/components/project-dashboard.test.tsx`，预期新增断言失败，因为当前页面只给主案例显示“示例项目”且两个项目都有删除按钮。

- [x] **Step 3: Implement the minimal UI change**

在项目桌面复用 `isDefenseProjectId(project.id)`；受保护项目显示永久保留徽标，用户项目保持原有删除按钮和确认对话框。

- [x] **Step 4: Run focused tests**

运行 `npm run test -- tests/components/project-dashboard.test.tsx tests/components/story-provider.test.tsx`，预期全部通过。

### Task 3: 回归验证

**Files:**
- No additional files.

- [x] **Step 1: Run related unit tests**

运行 `npm run test -- tests/unit/demo-mode.test.ts tests/unit/story-store.test.ts tests/components/project-dashboard.test.tsx tests/components/story-provider.test.tsx`。

- [x] **Step 2: Run typecheck and lint**

运行 `npm run typecheck` 与 `npm run lint`，确认没有类型或规则回归。

- [x] **Step 3: Inspect diff**

运行 `git diff --check`，并确认变更只涉及永久保留判定、项目桌面提示和对应测试/计划文档。
