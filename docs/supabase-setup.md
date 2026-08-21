# Supabase 公开知识库配置

Story Forge v1.2 实行零数据保留：Supabase 只承载公开/授权文学知识库，不保存用户项目、训练答案、AI 运行记录或上传文本。浏览器端 Supabase client 被强制禁用，也不会创建匿名登录会话。

## 数据库迁移

新项目按顺序执行 `supabase/migrations/001_story_forge.sql` 至 `004_zero_user_data_retention.sql`。其中 `004_zero_user_data_retention.sql` 会永久删除旧版的 `projects`、`ai_runs` 与 `training_attempts` 表及其中数据，只保留 `kb_works`、`kb_chunks` 和公开知识检索函数。

已有环境升级前如需保留历史数据，先在受控环境导出；执行 004 后产品不再提供云端用户数据恢复能力。当前代码不会连接这些旧用户表。

## 服务端环境变量

以下变量只由 Next.js 服务端路由读取：

```env
SUPABASE_URL=你的 Supabase URL
SUPABASE_ANON_KEY=你的 Supabase Anon Key
EMBEDDING_PUBLIC_SEARCH_ENABLED=true
```

浏览器只通过 `/api/knowledge/search` 和 `/api/ai` 使用经过版权状态过滤的公开检索结果。未配置 Supabase 或向量服务时，知识模块自动使用应用内置目录，不影响 Demo。

## 导入公开知识库

`SUPABASE_SERVICE_ROLE_KEY` 仅在本地导入命令的当前终端中临时设置，不要写入前端代码或提交到仓库。导入完成后立即清除该环境变量。

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="临时服务端密钥"
node --env-file=.env.local scripts/seed-supabase.mjs
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

导入脚本只写 `kb_works` 与 `kb_chunks`。待核验来源不会作为可仿写长文本下发；向量服务缺失时仍可完成关键词模式导入。

## 零保留验收

- 浏览器 Network/Application 面板中不存在 Supabase 匿名登录和用户表请求。
- `projects`、`ai_runs`、`training_attempts` 三张旧表已由迁移 004 删除。
- 用户作品只存在 `localStorage`，生成图片只存在 `IndexedDB/story-forge-assets`。
- 用户清除该站点的数据，或在设置页执行“清除本地创作数据”，即可移除本地作品。
- `/api/ai`、`/api/generate`、`/api/assets/*`、`/api/knowledge/search` 均返回 `Cache-Control: no-store`。
