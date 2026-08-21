# Story Forge（故事熔炉）

> Forging Literary Craft with Narrative Intelligence
>
> 以叙事智能，淬炼文学匠心

Story Forge 是一个面向中文创作者的数字人文写作、文学分析与技法训练 Demo，覆盖“灵感 -> 结构 -> 正文 -> 分析 -> 训练”的创作闭环。AI 输出只进入候选区，用户确认后才会改变正文。

## 参赛演示

- 主答辩案例：`回响的草场`
- 回归案例：`雾港来信`
- 创作工坊：灵感、人物、世界观、蓝图、正文、续写、候选确认、版本回退、安全快照、Markdown/TXT 导出
- 文学分析：六维诊断、人物关系图、情节/情绪曲线、证据抽屉与“为什么这样写”
- 文学课堂：6 道本地练习题、结构化反馈、再次评价与训练历史
- 知识库：20 部精选作品、结构化情节/意象/技法解构与可检索片段；服务端可读取 Supabase 公开知识库，失败时回退本地目录

## 本地运行

```bash
npm.cmd install
npm.cmd run dev
```

打开 `http://localhost:3000` 查看宣传首页，点击“进入工作台”或直接访问 `http://localhost:3000/projects` 进入模块页。Windows PowerShell 若阻止 `npm.ps1`，请使用 `npm.cmd`。

## 环境变量

在项目根目录创建 `.env.local`，只在服务端配置 DeepSeek、ModelScope 与公开知识库参数。不要提交密钥，也不要使用 `NEXT_PUBLIC_` 暴露任何 AI 密钥。

```env
DEEPSEEK_API_KEY=你的服务端密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
MODELSCOPE_API_TOKEN=你的 ModelScope Access Token
MODELSCOPE_API_BASE_URL=https://api-inference.modelscope.cn
MODELSCOPE_IMAGE_MODEL=Qwen/Qwen-Image
# 可选：仅保留已注册模型；不填写则显示 Qwen、FLUX.1 Schnell、FLUX.1 Dev
MODELSCOPE_IMAGE_MODELS=Qwen/Qwen-Image,AI-ModelScope/FLUX.1-schnell,AI-ModelScope/FLUX.1-dev
MODELSCOPE_IMAGE_TIMEOUT_MS=90000
NEXT_PUBLIC_DEMO_LOCKED=false
SUPABASE_URL=你的 Supabase URL
SUPABASE_ANON_KEY=你的 Supabase Anon Key
```

没有 DeepSeek 密钥、请求超时、限流或非法结果时，应用会返回结构化 `demo` 候选，不阻断演示。

答辩前将 `NEXT_PUBLIC_DEMO_LOCKED=true`，应用会关闭外部 AI、生图和公开向量检索，并让内置答辩项目的正文与实体编辑器只读，使用稳定的本地演示结果；用户仍可创建新项目进行交互。无论该开关是否启用，两个内置答辩案例的档案结构都不能删除，损坏或误删的 canonical 内容会在加载时恢复；用户作品都不会同步到云端。

跨媒介实验场通过 ModelScope API-Inference 异步调用服务端能力白名单中的图像模型，默认提供 `Qwen/Qwen-Image`、`AI-ModelScope/FLUX.1-schnell`、`AI-ModelScope/FLUX.1-dev` 三个选项；可用 `MODELSCOPE_IMAGE_MODELS` 缩小到已注册模型。服务端创建任务并轮询 `v1/tasks/{task_id}`，每次只取一个图像候选。未配置令牌、模型不支持、调用失败或超时会返回明确标注的《回响的草场》演示资产；图像确认后才保存到浏览器 IndexedDB，首版不宣称跨设备图片同步。

## 零数据保留

用户项目、人物与世界观、训练答案、AI 运行记录只保存在当前浏览器 `localStorage`；生成图片保存在 `IndexedDB/story-forge-assets`。浏览器不创建 Supabase client 或匿名会话，产品数据库不接收这些用户数据。

6 道练习题、20 部知识作品和 2 个演示项目是随应用发布的共享素材，不属于用户数据。Supabase 只承载 `kb_works`、`kb_chunks` 等公开/授权文学知识；用户上传文本和当前作品不会写入公共知识库。

站内用户内容 API 返回 `Cache-Control: no-store`，服务端不把请求正文或响应写入产品数据库。第三方 AI 供应商可能按其条款处理单次请求；答辩锁定模式不会发送外部 AI 请求。

设置页提供“清除本地创作数据”，会删除用户项目、训练记录与生成资产并恢复内置案例。浏览器设置中应选择“清除该站点的数据/网站存储”；只清除图片与脚本缓存通常不会删除作品。

初始化公开知识库前按顺序执行四条迁移。`004_zero_user_data_retention.sql` 会永久删除旧版用户数据表，仅保留公开知识表。然后在当前终端临时设置 `SUPABASE_SERVICE_ROLE_KEY` 并运行：

```bash
node --env-file=.env.local scripts/seed-supabase.mjs
```

该命令仅为本地导入临时使用 `SUPABASE_SERVICE_ROLE_KEY`，完成后应立即移除；应用运行不需要它。

## 验证

```bash
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
npm.cmd run test
```

真实外部链路需分别人工确认：DeepSeek、ModelScope 和服务端 Supabase 公开知识检索。验收时还应确认浏览器没有 Supabase 匿名会话、用户表请求或用户作品上传。

## 生产部署

单人低成本部署使用北京区轻量服务器 + Docker standalone + Nginx，作品仍只保存在用户浏览器。完整的备案、TLS、限流、答辩锁定、健康检查和回滚步骤见 [`docs/deployment.md`](docs/deployment.md)。发布前必须通过 `npm.cmd run verify`、正常/锁定两种模式的 Playwright 验收，并在服务器上检查 `/api/health` 与安全响应头。

## 目录说明

- `src/app`：页面与服务端 API
- `src/components`：创作、分析、知识图谱、训练和设置界面
- `src/lib/supabase`：服务端公开知识库检索边界；不包含用户数据写入
- `src/lib/knowledge`：知识检索与本地图谱数据
- `incoming`：演示项目、练习题、知识库和视觉参考
- `supabase/migrations`：数据库表、索引与 RLS 策略

项目当前仅用于竞赛 Demo 验收，未配置 Netlify 部署。
