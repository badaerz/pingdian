# Story Forge Case, Graph, and Homepage Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复“回响的草场”被旧缓存替换的问题，并提升知识图谱与首页主展示的文字可读性、视觉层次和演示表现。

**Architecture:** 在 `story-store` 加入只针对内置演示案例的无损迁移：按作品标题识别旧数据、重映射稳定 ID、保留用户编辑并补齐缺失案例。图谱继续使用 Cytoscape，不更换数据模型；新增短标签和选中关系摘要。首页使用一张本地生成的“回响的草场”案例图像，加上 CSS 数据层与受控动效，不接触 P0/P1 业务处理。

**Tech Stack:** Next.js 16、React 19、TypeScript、Cytoscape、Vitest、Testing Library、Playwright、GPT Image。

**Constraint:** 用户明确要求不提交、不部署，因此本计划不执行 Git commit。

---

### Task 1: 无损迁移内置演示案例

**Files:**
- Modify: `src/lib/story-store.ts`
- Test: `tests/unit/story-store.test.ts`

- [ ] **Step 1: 写入失败测试**

新增一个旧缓存场景：`documents.demo` 是用户编辑过的“雾港来信”，并断言迁移后：

```ts
const migrated = reconcileStoryStore(legacyStore);
expect(migrated.documents.demo.project.title).toBe("回响的草场");
expect(migrated.documents["demo-demo_002"].chapters[0].content).toContain("用户保留段落");
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- --run tests/unit/story-store.test.ts`

Expected: FAIL，因为 `reconcileStoryStore` 尚不存在。

- [ ] **Step 3: 实现最小迁移**

导出并在 `loadStoryStore()` 中调用：

```ts
export function reconcileStoryStore(saved: StoryStore): StoryStore {
  const canonical = createStoryStore();
  // 按标题保留旧演示案例编辑，仅补齐缺失的稳定 ID。
  return { version: 1, documents: reconciledDocuments };
}
```

规则：主案例固定为 `demo`；回归案例固定为 `demo-demo_002`；旧 `demo` 若为“雾港来信”则整体迁到回归 ID；自建项目保持原 ID 和内容；已有正确案例不覆盖。

- [ ] **Step 4: 运行单元测试并确认通过**

Run: `npm.cmd test -- --run tests/unit/story-store.test.ts`

Expected: PASS。

### Task 2: 让知识图谱始终可读

**Files:**
- Modify: `src/components/analysis/character-graph.tsx`
- Modify: `src/components/knowledge/knowledge-workspace.tsx`
- Modify: `src/app/workspaces.css`
- Test: `tests/components/knowledge-flow.test.tsx`

- [ ] **Step 1: 写入失败测试**

断言知识图谱提供当前节点的完整名称、类型、关系数量和相邻节点摘要，同时图谱组件为节点准备短标签：

```tsx
expect(await screen.findByLabelText("当前图谱焦点")).toHaveTextContent("孔乙己");
expect(screen.getByText(/直接关系/)).toBeVisible();
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- --run tests/components/knowledge-flow.test.tsx`

Expected: FAIL，因为当前没有焦点摘要。

- [ ] **Step 3: 实现短标签与关系聚焦**

在 Cytoscape 元素中同时存储 `label` 和截断后的 `shortLabel`；深色主题常驻显示 `shortLabel`，选中时不切换成完整长文本。选中节点时降低无关节点和边透明度，完整文本仍由 React 详情区域呈现。

- [ ] **Step 4: 增加画布焦点条与关系摘要**

在 `KnowledgeWorkspace` 中计算相邻节点和边，并在画布标题下方显示当前节点、类型、直接关系数量及最多三个相邻节点。CSS 保证桌面不遮挡画布，移动端横向可滚动或换行。

- [ ] **Step 5: 运行组件测试并确认通过**

Run: `npm.cmd test -- --run tests/components/knowledge-flow.test.tsx`

Expected: PASS。

### Task 3: 强化首页与“回响的草场”案例展示

**Files:**
- Create: `public/brand/echoing-grassland.png`
- Modify: `src/components/marketing/marketing-home.tsx`
- Modify: `src/app/marketing.css`
- Test: `tests/components/marketing-home.test.tsx`

- [ ] **Step 1: 写入失败测试**

断言主案例链接使用稳定主案例路径、案例图像有准确替代文本、首屏含声景证据数据层：

```tsx
expect(screen.getByRole("img", { name: "回响的草场声景案例" })).toBeVisible();
expect(screen.getByText("50 Hz")).toBeVisible();
expect(screen.getByRole("link", { name: /进入回响的草场/ })).toHaveAttribute("href", "/project/demo/studio");
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- --run tests/components/marketing-home.test.tsx`

Expected: FAIL，因为首页尚无案例图像和声景数据层。

- [ ] **Step 3: 生成并检查本地案例图像**

使用 GPT Image 生成 16:9 横图：北方草场与废弃露天矿交界，青年声音采集师持专业麦克风，远处钢结构与马头琴演奏者，纪实、克制、深墨绿/铜金色调，无文字、无 Logo、主体清晰。保存到 `public/brand/echoing-grassland.png`，检查构图和清晰度。

- [ ] **Step 4: 重构首页视觉层**

在首屏右侧加入可读的数据轨道、声谱刻度、证据节点与轻量扫描动效；把主案例卡改为图像支持的全宽案例舞台，覆盖层保持文字对比度，CTA 明确写为“进入回响的草场”。所有连续动效在 `prefers-reduced-motion` 下关闭。

- [ ] **Step 5: 运行组件测试并确认通过**

Run: `npm.cmd test -- --run tests/components/marketing-home.test.tsx`

Expected: PASS。

### Task 4: 真实链路与多端回归

**Files:**
- Modify: `tests/e2e/core-flow.spec.ts`
- Modify: `tests/e2e/responsive.spec.ts`
- Update generated screenshots only through the existing E2E flow.

- [ ] **Step 1: 增加跳转和图谱可读性 E2E**

覆盖旧缓存迁移后的主案例跳转；桌面端断言图谱焦点条和短标签画布可见；移动端断言列表与详情可达。

- [ ] **Step 2: 运行目标 E2E**

Run: `npm.cmd run test -- tests/e2e/core-flow.spec.ts tests/e2e/responsive.spec.ts`

Expected: PASS，且桌面/平板/移动截图无横向溢出、标签遮挡和 CTA 误跳。

- [ ] **Step 3: 运行完整验证**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
npm.cmd run test
```

Expected: 全部通过；报告分别列出已验证、尚未验证和需要用户参与的操作。
