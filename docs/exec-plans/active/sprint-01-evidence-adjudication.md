# Sprint 1 合约：逐条裁定 + 维度约束 + 四段面板

> ## ⚠️ 本文档已被 `sprint-01-status.md` 取代
>
> **下面的 16 条 AC 是 Claude 在 2026-11-17 单方面定的，未经用户确认。**
> 用户已在 2026-11-18 明确：计划怎么排、需求怎么定、算不算过，由用户拍板。
>
> 实际情况：
> - AC1–AC3、AC6（部分）、AC7、AC8、AC14、AC15 已在前四批落地
> - AC9 的「16 个维度名」已作废——维度已收敛到**六维 18 条判据**
> - 真正的执行状态与剩余项，**以 [`sprint-01-status.md`](sprint-01-status.md) 为准**
>
> 保留本文档只为留痕（为什么当初这么定、AC 是怎么来的）。**不要按这里的 AC 执行。**

**生成者**：Planner（Claude）· **实现者**：Generator（Codex）· **验收者**：Evaluator（Claude）
**上游规格**：`docs/product-specs/literary-diagnosis-agent.md`（F1–F4）
**基线证据**：`docs/exec-plans/completed/2026-11-17-eval-baseline.md`
**创建日期**：2026-11-17

---

## Sprint Goal

让 `analysis-v2` 在真实模型下**第一次跑通全链路**，并让"被丢弃的结论"成为界面上可见、可解释的对象。

一句话验收：**跑 `node scripts/run-eval.mjs --live`，14 条样本不再全部回退 demo，且报告里能读出准确率与幻觉率。**

---

## In Scope（本轮必须完成）

1. **删除 `validation.ts:341` 的"铺垫不足"强制要求**，并补回归测试断言其不存在。
2. **`analysis-v2` 改为逐条裁定**：按 `product-specs §F1` 的判定表实现，返回 `kept` / `observation_only` / `discarded` 三态。
3. **新增 `discardedDiagnostics` 字段**到 `LiteraryAnalysisResult` 与 `AnalysisSnapshot`，含 `reason` + `attempted`。
4. **补 `analysis-v2` 的字段形状规格到 prompt**（`tasks.ts` 的 `taskInstructions["analysis-v2"]`），并**把 `taskMaxTokens["analysis-v2"]` 从 5000 提到 9000**。
5. **维度约束**：prompt 限定 16 个维度、显式排除校对类意见（判据按 `§F4`）。
6. **四段可解释面板**：在 `/project/[id]/analysis` 诊断区下方实现 输入 / 检索 / 任务 / 校验 四段，含空状态文案。
7. **评测脚本对接**：`run-eval.mjs` 的 `scoreCase` 改为读 `kept` 集合参与准确率，`discarded` 计入幻觉率分母的观察项。

## Out of Scope（本轮明确不做）

- 知识库从"按作品"重构为"按维度"——**周级改动，本轮不做**。本轮用 `observation_only` 兜住原创作品的场景。
- 向量检索接入。
- 自动改写、总评打分、跨章节诊断。
- 任何 UI 视觉重设计（沿用现有 design token，只加结构不加皮）。
- `story-store.ts` / `ip-lab-workspace.tsx` 的拆分。

---

## Acceptance Checks（可勾选验收，Evaluator 逐条核）

### 逐条裁定（F1）
- [ ] **AC1** 构造 payload：3 条诊断，第 2 条 `quote` 不在原文。断言返回 3 条记录：2 条 `kept` + 1 条 `discarded`（`reason: "quote_not_in_source"`），**且整体不是 demo**。
- [ ] **AC2** 构造 payload：某条诊断 `evidenceIds` 只指向 `inference`。断言该条 `discarded`，`reason: "no_observation_evidence"`。
- [ ] **AC3** 构造 payload：合法诊断但 `evidenceIds` 不含 knowledge。断言该条 `kept` 且 `evidenceTier === "observation_only"`。
- [ ] **AC4** 构造 payload：`diagnostics` 键缺失。断言整包回退 demo 且 `warnings` 非空。
- [ ] **AC5** 构造 payload：`sourceKind: "narrative"` 但诊断中**没有任何**"铺垫不足"。断言**通过**（当前会失败，这正是要修的）。

### 丢弃记录（F2）
- [ ] **AC6** AC1 用例中 `discardedDiagnostics[0].attempted.quote` 等于被拒的原始引文（非空、非占位符）。

### Prompt 与预算（F4 + 修复 2/3）
- [ ] **AC7** `taskInstructions["analysis-v2"]` 含每个顶层字段的**结构示例**（`analysis` 与 `diagnostics` 必须写明是数组且给出元素字段）。
- [ ] **AC8** `taskMaxTokens["analysis-v2"] >= 9000`。
- [ ] **AC9** `taskInstructions["analysis-v2"]` 出现过 16 个维度名，且显式列出被排除的校对类词（生硬/直白/冗长/费解/混淆/不搭）。

### 四段面板（F3）
- [ ] **AC10** 打开 `/project/demo/analysis`，页面存在四个可定位区域，分别标注 输入 / 检索 / 任务 / 校验。
- [ ] **AC11** 在 `retrievalEvidence` 为空的样本上，检索段渲染"本次未召回知识条目"文案，不是空白节点。
- [ ] **AC12** 在存在 `discardedDiagnostics` 的样本上，校验段列出每条被丢弃结论及其 `reason` 的中文说明。
- [ ] **AC13** 四段内所有可交互元素可用 Tab 到达，焦点可见。

### 端到端
- [ ] **AC14** `node scripts/run-eval.mjs --live` 跑完全部 14 条，**至少 10 条返回 `mode: "live"`**（基线是 0 条）。
- [ ] **AC15** 上述运行的报告写入 `evals/runs/`，且控制台输出四个指标数字，不是全部 `n/a`。
- [ ] **AC16** `npm run verify` 全绿（lint / typecheck / layering / filesize / test / build）。

---

## Artifacts To Update

| 文件 | 动作 |
|---|---|
| `src/lib/ai/validation.ts` | 改 `readLiteraryAnalysis` 为逐条裁定；删 341 行；导出丢弃原因类型 |
| `src/lib/ai/tasks.ts` | 改 `taskInstructions["analysis-v2"]`；改 `taskMaxTokens` |
| `src/lib/types.ts` | 加 `DiscardedDiagnostic`、`EvidenceTier`；扩 `LiteraryAnalysisResult` 与 `AnalysisSnapshot` |
| `src/lib/analysis/snapshot.ts` | 快照透传 `discardedDiagnostics` |
| `src/lib/ai/fixtures.ts` | demo 回退也要产出合法的 `discardedDiagnostics`（通常为空数组） |
| `src/components/analysis/analysis-explainability.tsx` | **新建**，四段面板 |
| `src/components/analysis/analysis-workspace.tsx` | 挂载新面板 |
| `src/app/workspaces.css` | 新增面板样式（不改现有 token） |
| `tests/unit/ai-validation.test.ts` | 补 AC1–AC6 |
| `tests/components/analysis-explainability.test.tsx` | **新建**，补 AC10–AC13 |
| `scripts/run-eval.mjs` | 评分逻辑对接 `kept` / `discarded` |
| `docs/PRD_v1.2_current.md` | 更新文学诊断那一行的状态与验收口径 |

---

## 工作纪律（Generator 必须遵守）

1. **先写测试再改实现**。AC1–AC6 必须先红后绿。
2. 分层不变：`lib` 不得 import `components`。`npm run check:layering` 必须过。
3. 新文件不超过 500 行。超了就拆，不要往 `EXEMPT` 里加。
4. **不要改** `scripts/check-layering.mjs`、`scripts/check-filesize.mjs` 的规则。
5. 不要提交 `.env.local`、`evals/runs/raw-*.json`（原始模型输出含完整上下文，不进版本库）。
6. 改完在 `docs/exec-plans/active/` 更新进度，不要只写在对话里。

---

## 若遇到阻塞

**不要自行放宽验收标准。** 在 `docs/exec-plans/active/` 记录：哪一条 AC 过不了、卡在哪里、你判断的原因。
Evaluator 会重新议定这一条，而不是允许"差不多能用"。

预判两个可能卡点：
- **AC14 涉及真实模型调用**，单次约 30–60 秒 × 14 条。若超时，先跑 `--case GC_003` 验证单条通，再跑全量。
- **AC3 的 `observation_only` 分级**需要同时改类型、校验、UI 三处。若类型改动波及面过大，先只改校验与类型，UI 分级标记记为 Sprint 2。
