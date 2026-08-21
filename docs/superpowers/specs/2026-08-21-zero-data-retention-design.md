# 零数据保留设计

## 目标

Story Forge 不在产品自有云端保留用户创作数据。用户作品、人物/世界观、训练记录、AI 运行记录与生成资产只保存在当前浏览器的 `localStorage` 或 `IndexedDB`；用户清除该站点数据后，这些数据随之删除。

## 边界

- 浏览器端不创建 Supabase client、不登录匿名用户、不写入 `projects`、`training_attempts` 或 `ai_runs`。
- Supabase 仅保留公开/授权文学知识库及服务端检索能力，不接收用户作品作为持久化数据。
- `/api/ai`、`/api/generate`、`/api/assets/*` 与 `/api/knowledge/search` 返回 `Cache-Control: no-store`，站内不缓存请求正文或响应。
- 第三方模型供应商可能按其自身政策处理单次请求；产品不宣称能控制供应商留存，答辩模式默认使用本地确定性回退。
- 只清理 HTTP 缓存不会删除作品；产品文案与 PRD 使用“清除该站点数据/网站数据”。

## 数据流

```text
用户编辑 -> StoryProvider -> localStorage
生成图片 -> IndexedDB(story-forge-assets) + localStorage 元数据
单次 AI 请求 -> 服务端代理 -> 第三方模型（不写站内数据库） -> 浏览器
公开知识检索 -> 服务端 Supabase/本地目录（仅公共知识源）
```

## 用户控制

设置页显示“仅保存在此浏览器”状态，并提供确认式“一键清除本地创作数据”。该操作删除 Story Forge 的 localStorage keys、训练历史和生成资产数据库，然后恢复内置答辩案例；内置案例是编译进应用的演示数据，不属于用户创作数据。

## 验收

1. 即使配置 Supabase 环境变量，浏览器端也不初始化 Supabase 或发起任何用户同步请求。
2. 新建项目、正文编辑、训练记录和生成资产仍可在同一浏览器刷新后恢复。
3. 清除本地创作数据后，用户项目、训练历史和 IndexedDB 资产不存在；内置答辩案例仍可进入。
4. 相关 API 响应带 `Cache-Control: no-store`。
5. 设置页、README、Supabase 文档和当前 PRD 不再宣称用户数据云同步。
