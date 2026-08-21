# 答辩案例编辑区永久只读实施计划

> 按已确认的设计执行：正式作品只读，候选生成与候选编辑保留，候选采纳和版本回退禁止。

## 目标

让内置答辩案例 `demo` 与 `demo-demo_002` 的正式内容永久只读，不受 `NEXT_PUBLIC_DEMO_LOCKED` 开关影响；用户自建项目保持原有编辑能力。

## 实施步骤

1. **固定状态层边界**
   - 在 `tests/unit/demo-mode.test.ts` 增加环境开关关闭时仍拒绝章节等正式字段变化的回归测试。
   - 修改 `src/lib/demo-mode.ts`，对答辩案例始终比较 `chapters`、`characters`、`worldEntries`、`blueprint`、`versions`；候选和分析状态仍可写入。

2. **统一工作区只读传播**
   - 在 `src/components/studio/studio-workspace.tsx` 以 `isDefenseProjectId(activeProjectId)` 计算正式内容只读状态。
   - 将只读状态继续传递给导航、章节字段、正文、人物/世界观编辑器和版本抽屉。
   - 候选生成、候选编辑和清空保留；仅禁用答辩案例的候选采纳及确认采纳。

3. **组件回归覆盖**
   - 在 `tests/components/studio-editing.test.tsx` 验证默认答辩案例的标题、摘要和正文不可编辑。
   - 保证已有用户项目编辑与候选流程测试继续通过。

4. **验收**
   - 运行定向 Vitest、`npm run typecheck`、`npm run lint`、`npm run build` 和 `git diff --check`。
