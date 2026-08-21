# Story Forge 竞赛 Demo 全面升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有离线优先、候选确认和匿名隔离边界的前提下，完成真实可验证的轻量 RAG、创作对话、上下文一致性、文学诊断、学术知识图谱、图片参数、训练闭环、全站品牌升级，并依据最终实现改编 PRD v1.1。

**Architecture:** 继续使用 Next.js App Router + TypeScript + React。服务端统一承载 AI 任务、embedding 查询、ModelScope 轮询和严格校验；客户端通过 StoryProvider/LocalStorage 保存用户可恢复状态，外部上传文本仅保留在当前会话。Supabase `kb_chunks` 使用 pgvector 做真实检索，RPC/embedding 不可用时回退到本地结构化关键词检索。所有结果带 `live`/`demo`、来源和修订号。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Playwright、Supabase/Postgres + pgvector、Cytoscape、Recharts、Tiptap、Lucide。

---

## 受保护边界

- 工作区已有未提交改动，执行期间不得使用 `git reset`、`git checkout`、批量清理或覆盖用户文件。
- 不改现有路由、项目 ID、候选确认、版本回退、导出、本地优先和 RLS 语义。
- 不把 `SUPABASE_SERVICE_ROLE_KEY`、DeepSeek、ModelScope 或 embedding 密钥放入客户端代码、`NEXT_PUBLIC_*` 变量或测试输出。
- 每个任务先写失败测试，再写最小实现；验证失败时停在当前任务，记录证据后修正。
- 当前仓库不适合盲目提交整个工作树；每个任务以 `git diff --stat`、测试和类型检查作为检查点，不提交无关用户改动。

## 文件责任地图

| 文件 | 责任 |
| --- | --- |
| `src/lib/types.ts` | 共享项目、图谱、分析、对话、RAG、训练和一致性类型 |
| `src/lib/story-store.ts` | LocalStorage 版本迁移与默认值 |
| `src/lib/story-state.ts` | 修订号、候选、冲突确认和训练关联状态变更 |
| `src/providers/story-provider.tsx` | 业务状态、持久化、同步与训练历史 API |
| `src/lib/ai/tasks.ts` | AI 任务类型、上下文和服务端执行协议 |
| `src/lib/ai/validation.ts` | 任务响应严格运行时校验 |
| `src/lib/ai/retrieval.ts` | RAG/关键词检索统一接口和来源过滤 |
| `src/lib/ai/embeddings.ts` | OpenAI 兼容 embedding provider 与失败兜底 |
| `src/lib/ai/context.ts` | 锁定事实、检索证据和文本上下文组装 |
| `src/lib/assets/generation.ts` | ModelScope 创建、轮询、参数能力和结果归一化 |
| `src/app/api/ai/route.ts` | 服务端 AI 请求白名单与包络返回 |
| `src/app/api/assets/capabilities/route.ts` | 图片模型、尺寸和高级参数白名单 |
| `src/app/api/assets/generate/route.ts` | 图片输入校验与服务端生成 |
| `src/app/api/knowledge/search/route.ts` | RAG 检索服务端入口 |
| `src/components/studio/studio-workspace.tsx` | 创作台对话入口、诊断入口和一致性候选联动 |
| `src/components/studio/story-direction-chat.tsx` | 多轮故事方向对话与默认标签 |
| `src/components/studio/candidate-panel.tsx` | 续写候选、冲突提示和审阅确认 |
| `src/components/analysis/analysis-workspace.tsx` | 当前项目/外部文本诊断、热力图和训练跳转 |
| `src/components/analysis/analysis-diagnostics.tsx` | 证据定位诊断列表 |
| `src/components/analysis/theme-heatmap.tsx` | 主题演变热力图 |
| `src/components/knowledge/knowledge-workspace.tsx` | 经典知识库与“我的文本”双模式 |
| `src/components/knowledge/academic-graph.tsx` | 学术级图谱画布、指标、图例和列表替代 |
| `src/components/training/training-workspace.tsx` | 技法训练实验室、版本对照和成长视图 |
| `src/components/training/training-feedback.tsx` | 证据反馈和量规展示 |
| `src/lib/knowledge/catalog.ts` | 本地知识记录、来源状态和图谱构建 |
| `supabase/migrations/002_literature_rag.sql` | RAG RPC、索引和安全配置 |
| `scripts/seed-supabase.mjs` | 知识分块、embedding 生成和幂等导入 |
| `incoming/exercises/writing_exercises.json` | 六项训练题、量规、来源和禁止代写规则 |
| `public/brand/*`、`src/app/globals.css` | 正式 Logo 和全站视觉令牌 |
| `docs/PRD_v1.1_current.md` | 最终实现后生成的当前产品 PRD 源稿 |
| `docs/PRD_v1.1_current.docx` | 最终渲染校验后的正式 PRD |

## Task 1: 基线、共享类型和存储迁移

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/story-store.ts`
- Modify: `src/lib/story-state.ts`
- Modify: `src/providers/story-provider.tsx`
- Test: `tests/unit/story-store.test.ts`
- Test: `tests/unit/story-state.test.ts`

- [ ] **Step 1: 写迁移失败测试**

在 `tests/unit/story-store.test.ts` 增加旧 v2 文档迁移断言：旧文档加载后必须拥有空的 `dialogueThreads`、`imageGenerationSettings`、`analysisSnapshots`、`consistencyReports` 和与作品关联的 `trainingAttemptRefs` 扩展字段，且章节、人物、蓝图内容不变。训练答案和完整反馈仍由现有本地训练历史键与 Supabase `training_attempts` 保存，不写入作品正文。

```ts
it("migrates v2 documents without changing authored content", () => {
  const migrated = reconcileStoryStore({ version: 2, documents: { demo: legacyDocument } });
  expect(migrated.documents.demo.chapters[0].content).toBe(legacyDocument.chapters[0].content);
  expect(migrated.documents.demo.dialogueThreads).toEqual([]);
  expect(migrated.documents.demo.trainingAttemptRefs).toEqual([]);
  expect(migrated.documents.demo.imageGenerationSettings.model).toBe("Qwen/Qwen-Image");
});
```

- [ ] **Step 2: 定义共享数据类型**

在 `src/lib/types.ts` 增加以下类型，并把 `ProjectDocument` 扩展字段纳入 `StoryState`：

```ts
export interface StoryDirectionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tags: string[];
  createdAt: string;
  contextRevision: number;
}

export interface ImageGenerationSettings {
  prompt: string;
  negativePrompt: string;
  model: string;
  size: string;
  advanced: Record<string, string | number | boolean>;
}

export interface ConsistencyFinding {
  id: string;
  category: "character" | "world" | "plot" | "timeline";
  severity: "low" | "medium" | "high";
  expectedFact: string;
  candidateQuote: string;
  priorEvidence: string;
  suggestion: string;
}

export interface ConsistencyReport {
  candidateId: string;
  contextRevision: number;
  findings: ConsistencyFinding[];
  checkedAt: string;
  mode: "live" | "demo";
  userConfirmation: "none" | "reviewed" | "confirmed";
}

export interface RetrievalEvidence {
  retrievalId: string;
  workId?: string;
  chunkType: string;
  content: string;
  quote: string;
  sourceStatus: "verified" | "pending" | "summary_only";
  sourceUrl?: string;
  similarity?: number;
}
```

将图谱节点扩展为 `work | author | era | theme | technique | character | place | event | image | concept`，边增加 `sourceEvidenceIds`, `confidence` 和 `source`，保留旧字段可选兼容。

- [ ] **Step 3: 实现 v3 存储迁移**

把 `STORY_STORE_KEY` 升为 `story-forge:projects:v3`，保留 v1/v2 读取入口。新增 `migrateDocument` 默认值：

```ts
const defaults = {
  dialogueThreads: [],
  imageGenerationSettings: { prompt: "", negativePrompt: "", model: "Qwen/Qwen-Image", size: "1328x1328", advanced: {} },
  analysisSnapshots: [],
  consistencyReports: [],
  trainingAttemptRefs: [],
};
return { ...canonical, ...defaults, ...document };
```

确保外部文本和 RAG 检索片段不写入 `ProjectDocument`。

- [ ] **Step 4: 增加状态变更测试和实现**

在 `src/lib/story-state.ts` 增加纯函数：`appendDirectionMessage`、`setImageGenerationSettings`、`saveConsistencyReport`、`confirmConsistencyReport`。每次修改项目上下文的函数递增 `contextRevision`；只保存会话的分析不递增项目 revision。

- [ ] **Step 5: 运行基线测试**

运行 `npm test -- --run tests/unit/story-store.test.ts tests/unit/story-state.test.ts`，预期所有旧断言和新增迁移断言通过。

## Task 2: 轻量真实 RAG 与关键词兜底

**Files:**
- Create: `src/lib/ai/embeddings.ts`
- Create: `src/lib/ai/retrieval.ts`
- Create: `src/app/api/knowledge/search/route.ts`
- Create: `supabase/migrations/002_literature_rag.sql`
- Modify: `scripts/seed-supabase.mjs`
- Modify: `src/lib/supabase/sync.ts`
- Modify: `src/lib/ai/context.ts`
- Test: `tests/unit/retrieval.test.ts`
- Test: `tests/unit/embedding.test.ts`
- Test: `tests/unit/supabase-sync.test.ts`

- [ ] **Step 1: 写 embedding provider 契约测试**

测试 `createEmbedding` 对 OpenAI 兼容响应 `{ data: [{ embedding: number[] }] }` 返回 384 维向量；缺少 key、HTTP 错误、维数不符时返回 `null`，不抛出泄露密钥的错误。

```ts
it("accepts a 384-dimension compatible embedding response", async () => {
  const result = await createEmbedding("潜台词与关系张力", { apiKey: "secret", baseUrl: "https://embed.test", model: "m", fetcher: mockEmbeddingFetch(384) });
  expect(result).toHaveLength(384);
});
```

- [ ] **Step 2: 实现 `src/lib/ai/embeddings.ts`**

使用 `EMBEDDING_API_KEY`、`EMBEDDING_BASE_URL`、`EMBEDDING_MODEL`、`EMBEDDING_DIMENSIONS`，只在服务端读取。接口固定为：

```ts
export async function createEmbedding(text: string, config: EmbeddingConfig): Promise<number[] | null>
```

默认 `dimensions=384`，超过 2,000 字符先截取；任何失败返回 `null` 并由调用方选择关键词检索。

- [ ] **Step 3: 写检索排序与来源过滤测试**

在 `tests/unit/retrieval.test.ts` 验证：查询“潜台词”优先命中包含该词的技法片段；`pending` 片段在 `allowImitation=false` 时被过滤；没有 embedding 时仍返回 keyword 结果；每个结果包含 `retrievalId`、quote 和 sourceStatus。

- [ ] **Step 4: 实现统一检索接口**

在 `src/lib/ai/retrieval.ts` 实现：

```ts
export interface RetrievalQuery {
  query: string;
  limit?: number;
  workIds?: string[];
  chunkTypes?: string[];
  allowImitation?: boolean;
}

export async function retrieveKnowledge(query: RetrievalQuery, deps: RetrievalDeps): Promise<{ mode: "vector" | "keyword" | "none"; evidence: RetrievalEvidence[] }>
```

先尝试 embedding + Supabase RPC；RPC、embedding 或环境配置不可用时调用现有 `searchKnowledge` 并对本地 `summary/sourceChunks/deconstruction` 做词项计分。所有排序结果在服务端进行版权状态过滤。当前项目文本作为临时 chunk 参与关键词检索，不持久化。

- [ ] **Step 5: 增加 Supabase RAG 迁移**

在 `supabase/migrations/002_literature_rag.sql` 创建 `match_literature_knowledge`，为 `kb_chunks` 增加 metadata 索引和可选向量索引；函数返回 `id, work_id, chunk_type, content, metadata, similarity`，并限制 `similarity > match_threshold`。使用 `security invoker`，不允许匿名写入。

- [ ] **Step 6: 升级种子脚本**

`scripts/seed-supabase.mjs` 将摘要、技法解释、短片段分块，每块写入 `source_status`、`source_url`、`quote`、字符区间和版权状态。只有配置 `EMBEDDING_*` 时生成向量；没有 embedding 配置时仍完成文本种子导入并输出 `Seeded ... keyword-only`。禁止将待核验作品的长文本写入 `text_sample`。

- [ ] **Step 7: 接入 AI 上下文**

扩展 `buildAiContextPacket` 的知识区，使其接受已检索的 `RetrievalEvidence[]`，序列化为“知识参考”并附 `[retrievalId/sourceStatus]`。任务 prompt 明确：知识片段只能支持 `knowledge` 来源，不能伪装成用户原文观察。

- [ ] **Step 8: 实现搜索路由和测试**

`POST /api/knowledge/search` 只接受 `query`, `limit`, `chunkTypes`, `allowImitation`，服务端调用 `retrieveKnowledge`。新增测试验证无密钥时 `mode=keyword`、不返回环境变量、HTTP 错误返回可用兜底。

- [ ] **Step 9: 运行 RAG 验证**

运行 `npm test -- --run tests/unit/retrieval.test.ts tests/unit/embedding.test.ts tests/unit/supabase-sync.test.ts`。配置 Supabase 后运行 `npm run seed:supabase`，只记录作品数、分块数和模式，不输出令牌或向量内容。

## Task 3: 统一 AI 任务协议与严格证据校验

**Files:**
- Modify: `src/lib/ai/tasks.ts`
- Modify: `src/lib/ai/validation.ts`
- Modify: `src/lib/ai/fixtures.ts`
- Modify: `src/app/api/ai/route.ts`
- Test: `tests/unit/ai-tasks.test.ts`
- Test: `tests/unit/ai-validation.test.ts`

- [ ] **Step 1: 扩展任务枚举和输入**

加入 `story-direction`, `consistency-check`, `analysis-v2`, `knowledge-extract`, `image-parameter-recommendation`, `training-feedback-v2`，并为输入增加 `thread`, `retrieval`, `candidate`, `sourceText` 可选字段。

- [ ] **Step 2: 写严格校验失败测试**

测试分析缺少证据、曲线引用不存在、导师 observation 引用不在文本、训练 feedback 非数组和一致性 finding 缺字段时都返回 `null`；合法的知识引用允许 `source="knowledge"` 且必须带 `retrievalId`。

- [ ] **Step 3: 实现可组合校验器**

在 `validation.ts` 拆出 `readEvidence`, `readAnalysis`, `readGraph`, `readCurves`, `readConsistencyReport`, `readTrainingFeedback`。所有 quote 用 `evidenceText.includes(quote.trim())` 校验；曲线与维度的 evidenceId 必须存在；分数限制 0-100；图谱边 source/target 必须存在。

- [ ] **Step 4: 更新统一执行器**

`runAiTask` 在发送模型前调用 RAG 检索并把结果放进上下文；在线结果通过任务校验器，失败后调用 fixture 且 warning 写明原因。保持 `AiEnvelope` 的 `mode/task/requestId/contextRevision/result/warnings`。

- [ ] **Step 5: 更新可重复演示夹具**

为每个新增任务返回稳定、可验证的证据、方向标签、冲突和训练量规结果；fixture 中的 observation quote 必须来自输入文本，不能再使用固定且可能不存在的“他没有拆开”。

- [ ] **Step 6: 运行 AI 单测与类型检查**

运行 `npm test -- --run tests/unit/ai-tasks.test.ts tests/unit/ai-validation.test.ts` 和 `npm run typecheck`。

## Task 4: 图片 API、能力白名单、参数编辑和推荐

**Files:**
- Modify: `src/lib/assets/generation.ts`
- Modify: `src/app/api/assets/generate/route.ts`
- Create: `src/app/api/assets/capabilities/route.ts`
- Modify: `src/components/ip-lab/ip-lab-workspace.tsx`
- Modify: `src/lib/types.ts`
- Test: `tests/unit/asset-generation.test.ts`
- Test: `tests/unit/asset-capabilities.test.ts`
- Test: `tests/components/ip-lab-flow.test.tsx`

- [ ] **Step 1: 写轮询兼容失败测试**

覆盖 `task_status` 小写、`status`、`output_images`, `output.image_urls`, `results[].url`、FAILED、HTTP 错误和超时；仅成功状态且有可下载 URL 才返回 `live`。

- [ ] **Step 2: 实现状态归一化**

在 `src/lib/assets/generation.ts` 增加 `readModelScopeTaskStatus` 和 `readModelScopeImageUrl`，统一处理已知响应形状；未知形状返回可操作 warning。请求体由 `AssetGenerationSettings` 生成，服务端只接收能力白名单允许的 advanced 参数。

- [ ] **Step 3: 实现能力接口**

`GET /api/assets/capabilities` 返回：

```ts
{ models: [{ id: string; label: string }], sizes: string[], advanced: Record<string, { type: "string" | "number" | "boolean"; min?: number; max?: number }> }
```

模型、尺寸和参数来自服务端常量与环境默认模型，不返回 token、base URL 或完整环境变量。

- [ ] **Step 4: 增加参数状态与推荐草案**

IP 实验场提供正向提示词、负向提示词、模型、尺寸和允许的高级参数。推荐按钮把当前项目或临时 TXT/MD 发送到 `image-parameter-recommendation`，显示每项理由和置信提示；“全部应用/逐项应用”只更新草案。

- [ ] **Step 5: 测试参数边界和确认边界**

组件测试断言推荐不会自动调用生成，用户点击生成才调用 `/api/assets/generate`；缺少 key 显示 demo；模型不在 capabilities 白名单时 API 返回 400。

- [ ] **Step 6: 运行图片测试**

运行 `npm test -- --run tests/unit/asset-generation.test.ts tests/unit/asset-capabilities.test.ts tests/components/ip-lab-flow.test.tsx`。

## Task 5: 创作台多轮对话与上下文一致性

**Files:**
- Create: `src/components/studio/story-direction-chat.tsx`
- Modify: `src/components/studio/studio-workspace.tsx`
- Modify: `src/components/studio/candidate-panel.tsx`
- Modify: `src/lib/story-state.ts`
- Modify: `src/lib/ai/tasks.ts`
- Test: `tests/components/story-direction-chat.test.tsx`
- Test: `tests/components/studio-editing.test.tsx`
- Test: `tests/unit/consistency.test.ts`

- [ ] **Step 1: 写对话行为测试**

验证每轮显示六个默认标签；用户提交后只出现 assistant 讨论消息；正文内容和 `contextRevision` 不变；点击“生成续写”后才请求 `continue`。

- [ ] **Step 2: 实现 `StoryDirectionChat`**

组件接收 `project`, `messages`, `onAppend`, `onGenerateCandidates`。标签常量为：`跌宕起伏`, `轻松日常`, `推进冲突`, `深化人物关系`, `埋设悬念`, `强化情感`。每次消息保存 `contextRevision`，显示 live/demo 状态和检索参考。

- [ ] **Step 3: 扩展 `CandidatePanel`**

候选生成前显示对话摘要和当前修订号；收到一致性报告后按严重级别展示“低风险提示/建议审阅/审阅冲突”。高风险候选的主按钮只能进入审阅确认，不得直接应用。

- [ ] **Step 4: 实现一致性检查纯函数和任务**

增加 `buildConsistencyInput`，只读取锁定事实、蓝图、相邻摘要和候选内容；输出 `ConsistencyReport`。在候选接受前检查 `generatedRevision === current.contextRevision`，冲突确认状态为 `confirmed` 才调用 `acceptCandidate`。

同时为版本目标增加回归测试：新建版本必须记录 `chapterId`；显式目标章节已删除时禁止恢复，不能回退覆盖第一章；删除章节时清理或失效化指向该章节的待处理候选和版本入口。

- [ ] **Step 5: 运行创作流程测试**

运行 `npm test -- --run tests/components/story-direction-chat.test.tsx tests/components/studio-editing.test.tsx tests/unit/consistency.test.ts`，并确认旧的候选确认测试仍通过。

## Task 6: 文学诊断、RAG 证据和主题热力图

**Files:**
- Create: `src/components/analysis/analysis-diagnostics.tsx`
- Create: `src/components/analysis/theme-heatmap.tsx`
- Modify: `src/components/analysis/analysis-workspace.tsx`
- Modify: `src/components/analysis/story-curves.tsx`
- Modify: `src/components/analysis/evidence-drawer.tsx`
- Modify: `src/app/project/[id]/analysis/page.tsx`
- Modify: `src/lib/ai/tasks.ts`
- Test: `tests/components/analysis-flow.test.tsx`
- Test: `tests/components/theme-heatmap.test.tsx`
- Test: `tests/unit/analysis-validation.test.ts`

- [ ] **Step 1: 写分析结构失败测试**

覆盖人物关系、概念关系、情节曲线、主题热力图、语言风格、诊断 suggestion 和 evidence quote；非叙事文本必须返回 concept graph，不得凭空创建 character 节点。

- [ ] **Step 2: 扩展分析数据结构和校验**

新增 `themeHeatmap`, `styleProfile`, `diagnostics`, `sourceKind`, `retrievalEvidence`；每个诊断包含 `location`, `quote`, `effect`, `action`, `confidence`, `evidenceIds`。服务端校验每个观察引用在输入文本中存在。

- [ ] **Step 3: 实现诊断列表和证据联动**

`AnalysisDiagnostics` 点击“此处铺垫不足”等建议时同时更新 evidence drawer、曲线区段、热力图区段和选中文本；不能只弹出一段静态建议。

- [ ] **Step 4: 实现主题热力图**

用 CSS grid 或 SVG-free DOM 绘制主题 × 文本分段矩阵，颜色深度来自服务端 0-100 数值，单元格固定尺寸，点击单元格定位证据。移动端允许横向滚动但不压缩文字到不可读。

- [ ] **Step 5: 增加创作台直达链接**

创作台工具栏增加“文学诊断”链接，携带 `projectId`、`chapterId` 和选区 query；分析页读取后显示当前来源、修订号和“不会自动保存外部文本”。

- [ ] **Step 6: 接入 RAG 与导师解释**

分析和 mentor 任务调用 `retrieveKnowledge`，显示知识参考片段、来源状态和 `retrievalId`；观察/推断/知识三种来源在 UI 中颜色和标签区分。

- [ ] **Step 7: 运行分析测试**

运行 `npm test -- --run tests/components/analysis-flow.test.tsx tests/components/theme-heatmap.test.tsx tests/unit/analysis-validation.test.ts`。

## Task 7: 学术知识图谱与“我的文本”分析

**Files:**
- Create: `src/components/knowledge/academic-graph.tsx`
- Create: `src/lib/knowledge/text-extraction.ts`
- Modify: `src/components/knowledge/knowledge-workspace.tsx`
- Modify: `src/components/analysis/character-graph.tsx`
- Modify: `src/lib/knowledge/catalog.ts`
- Modify: `src/lib/types.ts`
- Test: `tests/components/knowledge-flow.test.tsx`
- Test: `tests/unit/knowledge-graph.test.ts`

- [ ] **Step 1: 写图谱证据测试**

验证每条用户文本关系都拥有原文证据、source/status/confidence；筛选、布局、列表替代和节点详情都不丢失证据。

- [ ] **Step 2: 实现文本提取归一化**

`extractTextGraph(text, result)` 把 AI 返回的实体和关系转换成统一 `KnowledgeGraph`；对无人物文本选择概念/论点节点，保持 `sourceEvidenceIds`。

- [ ] **Step 3: 实现学术画布**

`AcademicGraph` 只负责 Cytoscape 生命周期、布局和事件：力导向/分层/同心布局、节点类型图例、度数和中心性、筛选、fit/reset、列表替代。画布容器与列表容器分离，避免 React 清理 Cytoscape 子节点造成 `removeChild`。

- [ ] **Step 4: 增加知识库双模式**

经典知识库继续使用现有作品与来源状态；“我的文本”允许当前项目和临时 TXT/MD，调用 `knowledge-extract` 与 RAG，结果默认会话级保存。详情侧显示证据、来源状态和分析建议。

- [ ] **Step 5: 运行知识图谱测试**

运行 `npm test -- --run tests/components/knowledge-flow.test.tsx tests/unit/knowledge-graph.test.ts`，再运行图谱相关 Playwright 截图和非空像素检查。

## Task 8: 写作训练实验室闭环

**Files:**
- Create: `src/components/training/training-feedback.tsx`
- Modify: `src/components/training/training-workspace.tsx`
- Modify: `incoming/exercises/writing_exercises.json`
- Modify: `src/providers/story-provider.tsx`
- Modify: `src/lib/supabase/sync.ts`
- Modify: `src/lib/ai/tasks.ts`
- Test: `tests/components/training-flow.test.tsx`
- Test: `tests/components/training-settings.test.tsx`
- Test: `tests/unit/training-feedback.test.ts`

- [ ] **Step 1: 扩展练习题库**

保留 EX_001-EX_004，新增 EX_005“场景空间与氛围”和 EX_006“铺垫与回收”，每项包含 `objective`, `constraints`, `evaluation_rubrics`, `sourceStatus`, `ai_guardrails`，不得提供完整可提交范文。

- [ ] **Step 2: 写训练引用校验测试**

验证 feedback 的 `evidenceQuotes` 全部出现在 answer；缺失引用使 live 结果降级；量规分数限制 0-100；一次评价不会写入正文。

- [ ] **Step 3: 实现训练反馈与版本链**

将 `TrainingHistoryItem` 扩展为 `attemptNo`, `previousAttemptId`, `scores`, `evidenceQuotes`, `diagnosticId`。同一练习再次评价创建新版本，展示前后文本 diff 和分数变化。

- [ ] **Step 4: 接入诊断跳转和 RAG**

当分析建议包含 `trainingExerciseId` 时，链接到 `/training?exercise=EX_006&diagnostic=...`；训练页显示对应诊断证据和已核验参考技法，RAG 片段标记为知识参考。

- [ ] **Step 5: 实现成长和课堂演示模式**

按个人历史聚合具体性、人物塑造、场景感、潜台词、结构铺垫、语言控制六维趋势；记录不足时显示“完成更多同类练习后显示趋势”。课堂模式只改变布局，不创建教师后台。

- [ ] **Step 6: 运行训练测试**

运行 `npm test -- --run tests/components/training-flow.test.tsx tests/components/training-settings.test.tsx tests/unit/training-feedback.test.ts`。

## Task 9: 全站 Logo 视觉升级

**Files:**
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/marketing.css`
- Modify: `src/app/workspaces.css`
- Modify: `src/components/marketing/marketing-home.tsx`
- Modify: all page/workspace components under `src/components/`
- Verify: `public/brand/story-forge-full-logo-20260820.png`
- Test: `tests/components/app-shell.test.tsx`
- Test: `tests/e2e/responsive.spec.ts`

- [ ] **Step 1: 建立正式品牌令牌**

在全局 CSS 写入 `--paper: #FCF6EC`, `--ink: #191E24`, `--bronze: #D37302`, `--indigo`, `--forest`, `--oxide-red`，清理冲突的临时橙色/紫色渐变，但不改变功能状态颜色语义。

- [ ] **Step 2: 接入 Logo 三种资产**

首页和项目入口显示完整 Logo；AppShell 使用正式 Logo 的图形裁切；favicon 使用现有 `src/app/icon.png` 或从正式 Logo 生成的同源图标。不要重绘或生成新 Logo。

- [ ] **Step 3: 逐页收口视觉层级**

按首页、项目桌面、创作台、分析、知识、训练、IP Lab、设置顺序调整容器、页头、图谱和按钮。保留现有 aria-label、href、表单行为和移动底栏；禁止卡片套卡片、无语义轨道、渐变背景和大面积装饰光球。

- [ ] **Step 4: 运行响应式与无障碍验证**

运行 `npm run lint`、`npm run typecheck` 和 `npm run test:e2e -- tests/e2e/responsive.spec.ts`；检查 1280x800、1024x768、390x844 截图无横向溢出、文字遮挡和触控目标过小。

## Task 10: 真实 API、整站验证与 Demo 证据

**Files:**
- Modify: `README.md`
- Modify: `docs/supabase-setup.md`
- Create: `docs/demo-smoke-test.md`
- Test: `tests/e2e/core-flow.spec.ts`
- Test: `tests/e2e/responsive.spec.ts`

- [ ] **Step 1: 增加核心 Demo E2E 流程**

覆盖：打开答辩案例 → 多轮选标签讨论 → 生成续写 → 查看上下文冲突 → 审阅确认 → 送入文学诊断 → 查看热力图和具体建议 → 跳转铺垫训练 → 再评价 → 打开知识图谱。

- [ ] **Step 2: 增加图片 API 契约手工证据**

在 `docs/demo-smoke-test.md` 记录请求时间、创建 task ID 是否存在、轮询状态、最终 URL 或失败阶段；不记录 token、完整请求头或用户文本。

- [ ] **Step 3: 执行完整自动化验证**

按顺序运行：

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
```

任何失败必须先修复并重新运行，不以历史截图或旧运行结果替代当前证据。

- [ ] **Step 4: 验证在线与离线两条 AI 链路**

配置真实服务端变量后分别执行一次 DeepSeek 分析/对话、一次 ModelScope 图片请求、一次 embedding/RPC 检索；清空或隔离密钥后执行同样入口，确认 demo fallback、用户输入保留和 warning 可见。

## Task 11: 根据最终实现改编 PRD v1.1

**Files:**
- Create: `docs/PRD_v1.1_current.md`
- Create: `docs/PRD_v1.1_current.docx`
- Create: `docs/PRD_v1.1_current.pdf`
- Modify: `README.md`
- Test: `tests/unit/prd-manifest.test.ts`

- [ ] **Step 1: 生成当前能力清单**

从最终代码、测试报告和手工证据生成清单，字段固定为 `id`, `feature`, `status`, `priority`, `route`, `evidence`, `limitations`, `copyrightBoundary`。状态只能是 `已实现`, `部分实现`, `规划中`。

- [ ] **Step 2: 编写 Markdown PRD 源稿**

包含产品定位、用户流程、功能矩阵、RAG 架构、AI 任务协议、数据与隐私、版权状态、AI 伦理、异常兜底、验收标准、Demo 脚本和明确的未实现项。把完整 RAG、自有模型、教师后台降为规划或实验边界，除非当前证据明确证明已完成。

- [ ] **Step 3: 生成 Word/PDF 并视觉校验**

使用 documents skill 的 `render_docx.py` 渲染每页 PNG，检查目录、表格宽度、分页、中文字体、页眉页脚和长表格断行；修正后再次渲染。PDF 只作为便于评委查看的导出，不作为唯一源稿。

- [ ] **Step 4: 写 PRD 一致性测试**

`tests/unit/prd-manifest.test.ts` 检查 PRD manifest 中每个“已实现”功能都有对应 route/test/evidence，且正文不出现“已实现完整 RAG”或“教师后台已上线”等与代码不符表述。

- [ ] **Step 5: 更新 README 验证边界**

README 明确在线 AI、ModelScope、RAG 向量/关键词模式、离线 fallback、Supabase 同步和外部上传会话边界；不打印或示例化任何真实密钥。

## 自审清单

- [ ] 轻量 RAG 有 embedding、RPC、来源过滤、关键词兜底和可重复测试。
- [ ] RAG 片段和用户原文观察在数据结构、提示词和 UI 标签上分离。
- [ ] 多轮对话不会直接修改正文，续写候选仍需确认。
- [ ] 高风险一致性冲突变为“审阅冲突”，不会静默覆盖。
- [ ] 诊断包含人物/概念关系、情节或论证曲线、主题热力图、语言风格和可定位建议。
- [ ] 知识图谱使用学术画布和证据抽屉，不是普通思维导图。
- [ ] 训练模块有六项练习、过程反馈、修改对照、诊断跳转和个人趋势。
- [ ] 图片 API 轮询兼容、能力白名单、可编辑 prompt/negative/model/size 和推荐草案均有测试。
- [ ] 全站 Logo、色彩、响应式和无障碍验收完成后才改编 PRD。
- [ ] 最终 PRD 的每项“已实现”都有当前测试或手工证据。
