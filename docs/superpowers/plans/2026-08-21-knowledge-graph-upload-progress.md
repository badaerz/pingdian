# 知识图谱文本上传与生成进度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复文本上传后的知识图谱结果反馈，并在分析按钮附近加入可访问生成进度。

**Architecture:** 保持现有上传、服务端 `knowledge-extract` 和 `extractTextGraph` 数据流不变；仅在 `KnowledgeWorkspace` 增加成功/降级提示状态，并复用 `AiProgress` 组件。通过组件回归测试覆盖上传文本、loading、warning-success 和真实错误分支。

**Tech Stack:** Next.js 16、React 19、Vitest、Testing Library、已有 AiProgress/Cytoscape。

---

### Task 1: 为上传分析流程补失败回归测试

**Files:**
- Modify: `tests/components/knowledge-academic-flow.test.tsx`

- [ ] **Step 1: 添加 loading 状态测试**

让 fetch 返回一个未完成 Promise；上传文本后点击“分析文本”，断言 `role=progressbar` 的标签为“知识图谱生成进度”，并断言按钮被禁用。随后 resolve 响应，避免测试泄漏。

- [ ] **Step 2: 添加 warning-success 测试**

让 fetch 返回包含合法 `knowledgeGraph` 和 `warnings` 的成功响应；断言图谱可见，warning 以 `role=status` 或普通提示呈现，且 `role=alert` 不存在。

- [ ] **Step 3: 添加真实失败测试**

让 fetch 返回 500 或缺少 `knowledgeGraph` 的响应；断言 `role=alert` 呈现“文本分析暂不可用”。

- [ ] **Step 4: 运行定向测试确认新测试先失败**

运行：
`npm.cmd test -- --run tests/components/knowledge-academic-flow.test.tsx`
预期：新增断言因当前没有 `AiProgress`、warning 仍是 alert 而失败。

### Task 2: 实现最小 UI/状态修复

**Files:**
- Modify: `src/components/knowledge/knowledge-workspace.tsx`
- Modify: `src/app/globals.css`（仅必要的提示间距/样式）
- Reuse: `src/components/ui/ai-progress.tsx`

- [ ] **Step 1: 引入 `AiProgress` 和成功状态类型**

增加 `AiProgress` import；将 `myStatus` 扩展为 `idle | loading | success | error`，增加中性 `myNotice`。

- [ ] **Step 2: 在分析按钮下方渲染进度**

将操作区拆为操作行和进度区，loading 时显示“知识图谱生成进度”；请求完成且图谱有效时保留 success 一小段状态，随后回到 idle 或保持 success，不能在 finally 立即清掉可见状态。

- [ ] **Step 3: 分离 warning 与 error**

成功生成图谱后把 `data.warnings` 写入 `myNotice`，使用 `role=status`；只有 catch/无效响应写入 `myError`，使用 `role=alert`。提示文案包含“图谱已基于本次上传文本生成”。

- [ ] **Step 4: 保持清理和取消语义**

`clearMySource` 同时清空 notice；上传新文件或切换文本类型时清空旧图谱、进度和提示；abort 不显示错误。

- [ ] **Step 5: 运行定向测试并修正类型/结构**

运行：
`npm.cmd test -- --run tests/components/knowledge-academic-flow.test.tsx tests/unit/knowledge-graph.test.ts`

### Task 3: 完整验证与浏览器复现

**Files:**
- No new production files.

- [ ] **Step 1: 运行 lint、typecheck、全量 Vitest**

`npm.cmd run lint`
`npm.cmd run typecheck`
`npm.cmd test -- --run`

- [ ] **Step 2: 运行 production build**

`npm.cmd run build`

- [ ] **Step 3: 浏览器验证真实上传流程**

在 `/knowledge` 选择“我的文本”，上传 UTF-8 TXT，点击“分析文本”，确认按钮下方出现进度条，最终图谱可见；无密钥离线模式下确认提示为中性 status 而非错误 alert。

- [ ] **Step 4: 检查最终 diff**

`git diff -- src/components/knowledge/knowledge-workspace.tsx src/app/globals.css tests/components/knowledge-academic-flow.test.tsx`
只保留本请求相关变更。
