# 答辩锁定与数据边界 Implementation Plan

> **For agentic workers:** 已按本计划在当前工作区完成实现和验收。

**Goal:** 提供可重复的答辩锁定模式，并将 AI 运行同步限制为元数据，保证主案例稳定、数据边界清晰且后续可维护。

**Architecture:** 通过 `src/lib/demo-mode.ts` 集中定义锁定开关和内置案例边界；Provider 在状态写入边界阻止受保护内容变化，API 路由在锁定时强制使用 Demo。Supabase `ai_runs` 保留既有表结构，但把 request/result 序列化为形状摘要，训练记录继续保留用户主动提交的答案以支持成长链。

**Tech Stack:** Next.js App Router、React、TypeScript、Vitest、Supabase、localStorage、IndexedDB。

---

## 已完成任务

- [x] 为内置项目、锁定开关、主案例只读边界编写单元测试。
- [x] 为 AI 运行记录不包含私密文本编写 Supabase 同步测试。
- [x] 为 DeepSeek、ModelScope 和 Supabase 浏览器客户端接入锁定策略。
- [x] 为创作台正文、人物/世界观/蓝图编辑器和候选采纳增加答辩只读边界。
- [x] 更新 README、Supabase 部署说明和当前实现版 PRD。
- [x] 执行全量 Vitest、typecheck、lint、build、diff-check 和本地运行 smoke。
