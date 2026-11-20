# AGENTS.md — 项目导航入口

故事熔炉 Story Forge：面向中文创作者与数字人文学习者的**防幻觉文学诊断工具**。
核心主张：每条 AI 诊断结论都必须绑定可核验的原文与知识库证据；拿不出证据的结论会被丢弃。

技术栈：Next.js 16 · React 19 · TypeScript · Tailwind 4 · Vitest · Playwright · Supabase（仅公开知识库）
AI：DeepSeek 经 `/api/ai` 单一路由，22 个任务 · 生图：ModelScope（v2.0 起降级为愿景）

## 这个文件是目录，不是百科

这里只指路。**真正的知识在下面这些文件里**，需要时再读，不要指望这一份说全。

| 你想知道 | 去读 |
|---|---|
| **文学诊断判什么、怎么判** | [`docs/knowledge/`](docs/knowledge/) |
| 代码该放哪一层、依赖方向 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 什么算"做完了"、验收怎么写 | [`docs/QUALITY.md`](docs/QUALITY.md) |
| **AI 输出不稳定怎么处理** | [`docs/ai-stability-strategies.md`](docs/ai-stability-strategies.md) |
| **项目重心与叙事主线** | [`docs/PROJECT_FOCUS.md`](docs/PROJECT_FOCUS.md) |
| **演示脚本（3 分钟）** | [`docs/demo-script.md`](docs/demo-script.md) |
| **面试问答准备** | [`docs/interview-prep.md`](docs/interview-prep.md) |
| **用户测试方案** | [`docs/user-testing-plan.md`](docs/user-testing-plan.md) |
| 产品要什么、不要什么 | [`docs/product-specs/`](docs/product-specs/) |
| 为什么当初这么决定 | [`docs/exec-plans/completed/`](docs/exec-plans/completed/) |
| 接下来做什么 | [`docs/exec-plans/active/`](docs/exec-plans/active/) |
| 当前功能实现到哪一步 | [`docs/PRD_v1.2_current.md`](docs/PRD_v1.2_current.md) |
| 怎么评测、分数多少 | [`evals/README.md`](evals/README.md) |
| 怎么部署 | [`docs/deployment.md`](docs/deployment.md) |

## 工作目录

- 业务代码只在 `src/` 下；测试在 `tests/`；文档在 `docs/`；评测在 `evals/`；校验脚本在 `scripts/`。
- `incoming/` 是随应用发布的共享素材（知识库、练习、演示案例），**不是用户数据**。
- 用户作品只存浏览器 `localStorage` / `IndexedDB`。**任何把用户作品写入服务端或数据库的改动都直接拒绝。**

## 三条不能破的线

1. **证据可核验**：`observation` 证据的引文必须逐字出现在用户原文里；`knowledge` 证据的引文必须出现在对应检索块中。校验只在 `src/lib/ai/validation.ts`，组件层不得自行判定。
   **配套**：模型输出的字段命名差异由 `src/lib/ai/normalize-payload.ts` 归一化（策略见 `docs/ai-stability-strategies.md`）。**归一化只改字段名，绝不放宽证据要求**——往归一化层加"证据失效就挂到别的证据上"这类兜底，等于击穿防幻觉底线。
2. **失败不写脏数据**：校验不通过就不写入状态，返回带 `warnings` 的 `mode: "demo"` 回退，且不得伪装成 live。
3. **不代写**：训练反馈不产出可提交的替代作文；故事方向不产出正文候选。

## 判据纪律（`docs/knowledge/` 里的三条硬规矩）

1. **`C1`、`D2` 是 `draft-pending-threshold`**：只采集数值，不产出达标结论。**不许给它们补阈值。**
2. **结论必须引用判据 ID**：引用不存在的编号、或引用该文本不适用的判据，代码层丢弃。
3. **校对类意见不是文学诊断**：措辞生硬、用词不当、标点错别字一律挡在门外。判据是「如果这条意见换成另一段文字也成立，它就不是针对这段文本的诊断」。

## 质量门禁

改完必须跑：

```bash
npm run verify
```

含 lint / typecheck / 分层检查 / 文件大小 / 单测 / 构建。**任何一项红，不要说完成了。**

细节和豁免规则见 `docs/QUALITY.md`。

## 快速开始

```bash
npm.cmd install          # Windows 用 npm.cmd，PowerShell 会拦 npm.ps1
npm.cmd run dev          # http://localhost:3000
npm.cmd run verify       # 提交前
npm run eval             # 跑评测集，离线确定性可跑
```

## 禁止事项

- 禁止修改 `scripts/check-layering.mjs` 或 `scripts/check-filesize.mjs` 的规则来让检查通过（除新建 exec-plan 说明理由）。
- 禁止往 `EXEMPT` 名单里新增文件。
- 禁止提交密钥；`.env.local` 不进版本库。
- 禁止提交没有对应测试的行为改动。
- 禁止在组件里拼接 `/api/ai` 请求体（应走 `src/lib/ai/client.ts`，见架构文档 §5）。
- 禁止使用未在 `docs/ARCHITECTURE.md` 声明的技术或新增重型依赖而不留记录。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
