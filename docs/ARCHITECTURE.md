# ARCHITECTURE.md — 域与包分层地图

> 本文回答一个问题：**代码应该放在哪一层**。
> 读代码前先读这份地图；改代码前先确认改动不违反本文的依赖方向。

## 1. 分层与依赖方向

依赖只能**单向向下**。违反这条的 PR 不应合并。

```
src/app/          页面与 HTTP 路由（Next.js App Router）
    ↓
src/components/   可交互 UI（client components）
src/providers/    跨页状态注入（StoryProvider）
    ↓
src/lib/          领域逻辑：类型、校验、检索、上下文、存储
    ↓
src/data/         纯静态数据
```

**硬约束**：

- `src/lib/**` 与 `src/data/**` **不得** import `src/components/**` 或 `src/app/**`。这条当前成立，用 `npm run check:layering` 守住。
- `src/lib/**` **不得**读取 `process.env`，唯一例外是 `src/app/api/**` 的 route handler 与 `src/lib/ai/tasks.ts` 的配置注入口。环境变量只在服务端边界读取，由调用方以参数注入。
- **不要**在组件里拼 AI 请求体。所有 `/api/ai` 调用必须经过 `src/lib/ai/client.ts`（见 §5 待建项）。
- 任何 AI 结论**不得**由组件层自行判定真伪。校验只在 `src/lib/ai/validation.ts`。

## 2. `src/lib` 子域职责

| 子域 | 职责 | 关键入口 | 不得做 |
|---|---|---|---|
| `lib/types.ts` | 全量领域类型，单一真源 | `StoryState`、`LiteraryAnalysisResult`、`RetrievalEvidence` | 不放运行时代码，不放校验 |
| `lib/ai/` | AI 任务编排、上下文组装、输出校验、检索、降级 | `tasks.ts`（任务表）、`validation.ts`（校验）、`context.ts`（上下文预算）、`retrieval.ts`（混合检索） | 不 import React；不直接读 env（除 tasks 配置注入） |
| `lib/analysis/` | 分析快照、来源类型判定 | `snapshot.ts`、`source-kind.ts` | 不调 AI |
| `lib/knowledge/` | 知识条目目录与文本抽取 | `catalog.ts` | 不做检索打分（打分在 `ai/retrieval.ts`） |
| `lib/assets/` | 生图链路（v2.0 起降级为愿景） | `generation.ts`、`indexed-db.ts` | 不得成为演示阻塞点 |
| `lib/http/` | 限流预算、无缓存响应头 | `request-budget.ts`、`no-store.ts` | 不含业务逻辑 |
| `lib/supabase/` | 仅公开知识库检索边界 | `sync.ts`、`browser.ts` | **绝不**读写用户数据 |
| `story-store.ts` | localStorage 持久化与内置案例修复 | `load`/`save` | 不 import AI 模块（见 §6 技术债） |

## 3. `lib/ai` 内部数据流

```
组件 fetch("/api/ai", { task, project, input })
  → route.ts        isTaskInput() 白名单校验 + 请求预算
  → tasks.ts        runAiTask()
       ├ withKnowledge()   → retrieval.ts  召回知识 → 注入 input.retrievalEvidence
       ├ context.ts        组上下文包（锁定事实优先，按字符预算裁剪）
       ├ fetch 模型        仅当 config.apiKey 存在；否则走 demo
       └ validation.ts     validateTaskPayload() 结构化校验
                            ├ 通过 → 返回 live
                            └ 不通过 → fixtures.ts 本地确定性回退，标注 demo
```

**关键不变量**：

1. `input.retrievalEvidence` 由客户端传入的一律丢弃（`withoutClientRetrieval`），只信服务端检索结果。这是防伪造证据的底线。
2. 校验失败**不写入** `StoryState`，只返回带 `warnings` 的 demo 结果。
3. `demo` 结果必须与当前 `contextRevision` 绑定，不能冒充 live 结果。

## 4. 任务契约表

22 个 AI 任务定义在 `src/lib/ai/tasks.ts` 的 `AI_TASKS`。每个任务必须有且只有：

- `taskInstructions[task]` —— 输出结构的自然语言约束
- `taskMaxTokens[task]` —— 输出预算
- `validation.ts` 中对应的 `read*` 校验分支
- `fixtures.ts` 中对应的确定性回退
- `tests/unit/ai-tasks.test.ts` 与 `tests/unit/ai-validation.test.ts` 中的用例

**增加新任务必须同时补齐这五项**，缺一项视为未完成。

## 5. 待建项（v2.0 范围内）

| 待建 | 为什么 | 状态 |
|---|---|---|
| `src/lib/ai/client.ts` | 当前 8 个组件各自 `fetch("/api/ai")`，请求体形状无共享约束，改协议要改 8 处 | 未开始 |
| `src/lib/ai/evidence.ts` | 逐条证据裁定（v2.0 §3.2 原子事实纪律）需要把"整包校验"与"单条裁定"拆开 | 未开始 |
| `evals/` | 评测体系（golden set、三项指标、回归）当前完全不存在 | 进行中 |

## 6. 已知技术债（不在当前修复范围）

- `src/lib/story-store.ts`（1106 行）同时承担持久化、迁移、内置案例修复三件事，应拆分。触碰前先在 `exec-plans/active/` 留计划。
- `src/lib/ai/validation.ts`（571 行）为单文件集中式校验，`analysis-v2` 分支已接近可读性上限。
- `src/lib/ai/validation.ts` 与 `tasks.ts` 之间存在**类型循环引用**（validation 从 tasks 取 `AiTask`/`AiTaskPayload` 类型，tasks 从 validation 取函数）。因为是 `import type`，运行时无环，但类型改动会互相牵制。修法：把这些类型下沉到 `lib/ai/contracts.ts`。
- 6 个源文件超过 500 行（含 3 个测试文件）。`docs/QUALITY.md` 定的是新文件 500 行上限，存量文件在触碰时才拆分，不做事前大重构。
