# Golden set 规格

> 这是评测体系的**唯一真源**。改标注规则先改这里。

## 0. 一句话

每条 golden case 是「一段真实文本 + 一组专家认定的诊断结论 + 每条结论必须落在原文哪个位置」。
模型输出与这份人工标注比对，得出三项产品指标。

## 1. 为什么这样设计

v2.0 §3.4 要三项指标：结论准确率、证据可溯源率、幻觉率。

三者要能算出来，标注里必须分别有对应的东西：

| 指标 | 需要标注提供什么 | 怎么算 |
|---|---|---|
| 结论准确率 | 该文本**应该**被诊断出哪些问题（`expectedFindings`） | 模型诊断命中了多少条应得结论（召回）+ 模型多报了多少条不应有的（精确） |
| 证据可溯源率 | 每条应得结论**必须落在原文哪一处**（`requiredAnchor`） | 模型诊断的 `quote` 能否在本 case 文本中逐字定位 |
| 幻觉率 | 同上，反向判定 | 拿不出可定位引文、或引文不在原文中的诊断占比 |

**关键**：`requiredAnchor` 必须是该文本里**逐字存在**的子串。这是整套评测的锚点——如果标注者写了一个原文里没有的句子，这个 case 就是坏的。runner 会在开跑前自检这一点并拒绝执行。

## 2. Case 文件结构

放在 `evals/golden/`，一条 case 一个 JSON 文件，命名 `GC_<三位序号>_<短名>.json`。

```jsonc
{
  "id": "GC_001",
  "title": "边城·白塔坍塌段",
  "source": {
    "kind": "knowledge",              // knowledge | demo-project | user-corpus
    "ref": "KB_003",                  // knowledge → 知识库作品 ID；demo-project → 项目 ID
    "locator": "第三节·暴风雨段",       // 人读定位，不进机器判定
    "licenseStatus": "public_domain"  // 版权状态。非 public_domain 必须写明授权依据
  },
  "sourceKind": "narrative",          // narrative | argumentative
  "text": "那一夜，雷雨大作，溪水暴涨。……",   // 真正喂给模型的片段
  "expectedFindings": [
    {
      "dimension": "伏笔与铺垫",
      "claim": "白塔反复出现并最终坍塌，承担了爷爷之死的征兆功能",
      "mustMention": ["白塔", "征兆"],        // 诊断的 effect/action 至少命中其一
      "requiredAnchor": "白塔在暴风雨中坍塌了",  // 必须逐字存在于 text
      "idealKbIds": ["KB_003"],              // 期望被引用的知识条目
      "severity": "medium"                   // low | medium | high，用于加权
    }
  ],
  "forbiddenClaims": [
    {
      "claim": "翠翠与傩送已经成婚",
      "reason": "原文无此情节；断言即为事实性幻觉"
    }
  ],
  "annotation": {
    "by": "AI-draft",                 // AI-draft | <姓名>
    "reviewedBy": null,                // 人类审定者；null 表示尚未审定
    "reviewedAt": null,
    "confidence": "draft",             // draft | agreed | disputed
    "notes": "为什么这是应得结论"
  }
}
```

### 字段强制规则

- `text` 长度 **300–3000 字**。太短没有结构可诊断，太长会挤压上下文预算。
- `expectedFindings` **1–5 条**。超过 5 条说明这段文本该切成两个 case。
- `requiredAnchor` 必须 `text.includes(requiredAnchor) === true`。**这是硬校验，不满足则 case 无效。**
- `mustMention` **1–3 项**，每项 2–6 字。写成完整句子会导致关键词匹配失效。
- `forbiddenClaims` 可以为空数组，但字段必须在。
- `annotation.reviewedBy === null` 的 case **不计入正式分数**，只在报告里单列为"未审定草稿"。这条防止用未审定标注自欺欺人。

## 3. 标注流程（人机协作）

按 v2.0 §3.1「以本人与 AI 人机协作为主，标准由本人定稿」：

1. AI 起草 case：读原文 → 提出 `expectedFindings` 候选 → 填 `by: "AI-draft"`, `reviewedBy: null`。
2. **你审**：逐条判断"这真的是这段文本的问题吗"，删掉不成立的，改掉表述失准的。
3. 填写 `reviewedBy`（你的名字）、`reviewedAt`（日期）、`confidence`。
4. `confidence: "disputed"` 的 case 保留在库里但不计分，作为"标准尚未想清"的显式记录——**这个残留在面试时是加分项**，它证明你知道自己的标准边界在哪。

**不要跳过第 2 步。** 全部 AI 起草且未审定的 golden set，等于模型给自己打分，面试追问一句就失守。

## 4. 样本配额（目标 30–50 条）

| 来源 | 目标条数 | 目的 |
|---|---|---|
| 知识库 8 篇有完整 deconstruction 的作品 | 16 | 主体；有标准答案可对照 |
| 内置两案例（回响的草场 / 雾港来信） | 8 | 覆盖黄金演示路径，评测与演示同源 |
| supplemental 12 篇（仅摘要） | 6 | 检验知识库缺 detail 时的表现 |
| 反例/对抗样本（几乎无问题、或纯描写段） | 5 | **检验模型是否会无中生有**——这是幻觉率的主要来源 |
| 长文本边界（接近 3000 字） | 5 | 检验上下文预算不截断证据 |

**反例样本最重要**。一个只会挑毛病的模型在反例上会大量误报，这一项直接拉低准确率。没有反例的 golden set 会系统性高估模型。

## 5. 评测口径的一致性

- 一次评测必须固定：模型版本、prompt 版本、检索策略、golden set 版本。报告里四者都要记录，否则分数不可比。
- prompt 或检索一改，必须重跑全量，不得只跑"受影响的那几条"。
- 分数下降超过基线 **3 个百分点**即判定回归，runner 退出码非零。

## 6. 已知局限（必须写进演示材料）

1. `mustMention` 关键词匹配是**近似判定**，不认同义表述。模型说"预兆"而标注写"征兆"会被判未命中。这是可接受的假阴性，但要在报告里标出"可能被低估"的 case。
2. 上下文相关的深度解读（如反讽、双重叙述）无法用关键词可靠判定，本版不纳入计分，只在 `notes` 里保留。
3. 离线模式跑的是 `fixtures.ts` 的确定性回退，**分数反映的是管线正确性，不是模型能力**。只有 `--live` 模式的分数才能对外说成"模型表现"。混用这两种分数是不可接受的。
