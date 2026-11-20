# AI 输出稳定性：用到的方案

> 这份文档回答一个问题：**面对 LLM 输出不稳定，这个项目用了哪些业界成熟方案，而不是靠一次次手改。**

---

## 一、问题的性质

LLM 的结构化输出有 **三类**不稳定，各自需要不同的解法。把它们混在一起处理，就会出现「改了一处、另一处又坏」的空转。

| 类型 | 表现 | 属于哪一层 |
|---|---|---|
| **① 字段命名漂移** | 同一个字段，模型这次叫 `source`、下次叫 `type`、再下次叫 `sourceText` | 归一化层 |
| **② 枚举值漂移** | 图节点类型 schema 允许 12 类，模型实测给出 25 种 | 归一化层 |
| **③ 内容真实性** | 引文不在原文、证据指向不存在的 ID | **校验层，不可放宽容忍** |

**关键判断**：①② 是**表现层**问题（模型想表达的东西是对的，只是名字不同），③ 是**实质**问题（模型编造了东西）。

→ **①② 可以归一化，③ 必须拒绝。** 这条线划错，就会出现"为了通过率放松防幻觉"的严重后果。

---

## 二、用到的三个成熟方案

### 方案 1：Schema 归一化层（Normalize-then-Validate）

**业界叫法**：`post-processing` / `coercion layer` / `output parser`
**代表实现**：LangChain 的 `OutputParser`、instructor 的 `patch()`、Vercel AI SDK 的 schema coercion

**本项目做法**：`src/lib/ai/normalize-payload.ts`

在进入校验器之前，把模型输出统一映射成 schema 要的形状：

| 原始形态 | 归一化为 |
|---|---|
| `evidence: {type, text}` | `{source, quote}` |
| `evidence.source: "sourceText"` | `"observation"`（有引文即可） |
| `graph.nodes: {kind}` | `{type}` |
| `graph.edges: {from, to, relation}` | `{source, target, label}` |
| `domainAnalysis.characters.goals: [{character, goal}]` | `[{label, description}]` |
| `styleProfile.metrics: {dimension: "句子长度"}` | `{key: "sentenceLength"}` |
| `paceCurve: {points: [{position, pace}]}` | `[{segment, value, evidenceId}]` |
| `themeHeatmap.segments: [0.6, 0.8, ...]` | `[{theme, segment, value, evidenceId}]` |

**为什么有效**：只写一次，覆盖 21 个任务的全部结构。前七轮之所以空转，是因为一直在**逐个补字段别名**——补到第 10 个，模型会想出第 11 个。

**实测**：同一批 14 份真实模型响应，归一化前 **0/14** 通过，归一化后 **13/14**。

---

### 方案 2：枚举语义归类（Enum Coercion by Keyword）

**业界叫法**：`enum coercion` / `soft enum matching`
**代表实现**：OpenAI function calling 的 `enum` 宽松匹配、instructor 的 `Literal` 容错

**本项目做法**：`mapNodeType()` 三级降级

```
1. 精确命中     "character" ∈ 允许集合          → 直接用
2. 已知别名     "protagonist" → "character"    → 查别名表
3. 语义归类     "verse"/"诗句" → 匹配 /image|verse|poem/ → "image"
4. 兜底        都不中 → "concept"              → 永不拒绝
```

**不做的事**：不维护穷举别名表。模型实测出现过 **25 种**节点类型，穷举追不上；11 条正则关键词规则的覆盖面是它的超集。

**纪律**：语义归类**只在"不影响语义归属"时使用**。例如 `antagonist` 不映射成 `character`——论证类文本不允许人物节点，映射过去会让本该被拒的图蒙混过关。

---

### 方案 3：三级降级策略（Graceful Degradation）

**业界叫法**：`partial success` / `field-level fallback` / `best-effort parsing`
**代表实现**：Pydantic 的 `model_validate(..., strict=False)`、JSON Schema 的 `additionalProperties`

**本项目做法**：`validation.ts` 的 L1 / L2 / L3

| 级别 | 何时使用 | 用户看到 |
|---|---|---|
| **L1 逐条丢弃** | 数组里个别元素不合格 | 其余正常，被丢的进「已丢弃」清单并附原因 |
| **L2 字段容错** | 非关键字段缺失 | 补默认值或跳过，标 `degraded` |
| **L3 整包回退** | **全部**不符合协议（根对象缺失、数组整体为空） | 回退演示数据 |

**核心原则**：从「一条不合格就全盘作废」改成「能救的救，救不了的才丢，且用户能看见丢了什么、为什么」。

---

## 三、明确拒绝的方案

| 方案 | 为什么不用 |
|---|---|
| **自动重试（retry on invalid）** | 每次重试都是真金白银；且不解决根因，只是把失败概率乘方。本项目先做归一化，把失败率降到 1/14 再谈重试 |
| **多模型投票（ensemble）** | 成本 ×3，且投票无法判断"哪份更真"。本项目的问题不是模型选错，是字段名不同 |
| **降低校验强度换通过率** | 曾经试过「证据失效就挂到首个可用证据」，结果编造的推断证据也能过关，被三条严格性测试抓出后撤销。**这是防幻觉底线，不为通过率让步** |
| **向量库做语义匹配** | 18 条判据用精确匹配就够，上向量库是自造运维题（PRD 2.0 已明确砍掉） |

---

## 四、验证方式（避免"两套标准"）

之前踩过的坑：我写了一版 Python 近似校验器，报 12/14，而网站真实校验器报 0/14。**两套标准 = 永远对不上。**

**现在的做法**：`tests/unit/offline-replay.test.ts`

- 直接 `import { validateTaskPayload }`，**与生产同一条代码路径**
- 读 `evals/runs/raw-GC_*-<时间戳>.json`（评测时落盘的真实模型响应）
- 门槛 10/14，**不达标测试就红**

**这是免费的、不限次数的回归验证**——不用调 API 就能复现任何一轮评测的结果。

---

## 五、效果汇总

| 指标 | 归一化前 | 归一化后 |
|---|---|---|
| 14 份真实响应通过率 | 0/14 | **13/14** |
| 诊断链路 live 返回 | 0/14 | **12/14**（线上实测） |
| 单次评测成本 | — | 约 0.7 元 |

**剩下没通过的 1–2 条，是模型真实的引文错误**（把「。」写成「。”」，提前闭合引号；或曲线点引用了被丢弃的证据）。**这些应该被拒，不是校验错。**
