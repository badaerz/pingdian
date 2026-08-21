# AI Progress and Analysis Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为全部现有 AI 入口加入统一阶段式进度反馈，并消除人物关系列表切换时的 DOM 卸载异常。

**Architecture:** 使用一个客户端 `AiProgress` 组件和 `useAiProgress` Hook 统一阶段、定时推进与完成状态；现有业务组件只负责在请求开始、成功和失败时调用该接口。人物图谱保持 Cytoscape 容器常驻，React 列表使用独立容器，避免双重管理 DOM。

**Tech Stack:** Next.js 16 Client Components、React 19、TypeScript、Cytoscape、Vitest、Testing Library、Playwright。

---

### Task 1: 先建立失败回归测试

**Files:**
- Create: `tests/components/ai-progress.test.tsx`
- Modify: `tests/components/analysis-flow.test.tsx`
- Modify: `tests/e2e/core-flow.spec.ts`

- [ ] 添加进度条语义、阶段推进和完成态测试。
- [ ] 添加人物图谱/列表反复切换与点击人物证据测试。
- [ ] 运行目标测试并确认其在实现前失败。

### Task 2: 实现统一 AI 进度反馈

**Files:**
- Create: `src/components/ui/ai-progress.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/studio/setup-panel.tsx`
- Modify: `src/components/studio/candidate-panel.tsx`
- Modify: `src/components/analysis/analysis-workspace.tsx`
- Modify: `src/components/training/training-workspace.tsx`

- [ ] 实现四阶段定时推进、92% 等待上限和 100% 完成反馈。
- [ ] 将组件接入灵感、人物、世界观、蓝图、续写、改写、诊断、解释和训练入口。
- [ ] 保留现有响应校验、错误反馈、候选确认和记录逻辑。

### Task 3: 修复人物关系 DOM 所有权冲突

**Files:**
- Modify: `src/components/analysis/character-graph.tsx`
- Modify: `src/app/globals.css`

- [ ] 让 Cytoscape 画布与 React 列表使用永久独立的 DOM 容器。
- [ ] 恢复图谱显示时重新计算尺寸和适应画布。
- [ ] 将 `character` 节点类型显示为“人物”。

### Task 4: 验证

**Files:**
- Modify only if a regression is found in task scope.

- [ ] 运行相关组件测试。
- [ ] 运行 lint、typecheck、全部 Vitest 和 production build。
- [ ] 运行 Playwright 核心回归及全量 E2E。
- [ ] 在桌面和移动端检查进度反馈、列表切换和页面溢出。

本计划遵循用户明确要求，不包含提交、推送或部署步骤。
