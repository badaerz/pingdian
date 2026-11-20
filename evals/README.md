# evals/ — 评测体系

> 这是 v2.0 说"AIPM 的分水岭"的那一部分。当前状态：**骨架已建，基线已测，样本待人工审定**。

## 怎么跑

```bash
npm run eval                   # 离线：验证管线正确性，不调模型
npm run eval:live              # 真实模型：这才是"模型能力分数"
node scripts/run-eval.mjs --case GC_003    # 单条调试
```

两次运行都会写一份报告到 `evals/runs/`，文件名带时间戳与模式。

## 三个数字的含义

| 指标 | 定义 | 当前基线（2026-11-17） |
|---|---|---|
| 结论准确率 | 按 severity 加权的召回：应得结论里命中了多少（high 权重 3 / medium 2 / low 1） | 0%（live，因所有 payload 未通过校验） |
| 证据可溯源率 | 诊断引用的原文片段能在源文本中逐字定位的比例 | 无法计算（无 live 结果） |
| 幻觉率 | 引文无法在源文本定位的诊断占全部诊断的比例 | 无法计算 |

基线 0% 的成因与三个结构性缺陷见 [`docs/exec-plans/completed/2026-11-17-eval-baseline.md`](../docs/exec-plans/completed/2026-11-17-eval-baseline.md)。

**重要**：`npm run eval`（离线）的分数反映 **fixtures.ts 的确定性回退**，不是模型能力。
离线跑分永远不能对外说成"模型准确率"。runner 会在报告里标注模式并在 demo 回退出现时打警告。

## 目录

```
evals/
├── golden/
│   ├── schema.md          标注规则（改标注先改这里）
│   └── GC_*.json          样本，一条一段互不重叠的文本
└── runs/
    ├── baseline.json      可选：存在时会对新跑分做回归门禁（掉 >3 点则退出码非零）
    ├── <timestamp>_<mode>.json   每次运行
    └── raw-GC_*.json      调试脚本抓的模型原始输出（不进版本库）
```

## 当前样本覆盖

14 条 case，44 条应得结论，38 条反例陷阱。每条的文本互不重叠——这条由 `scripts/build-golden-set.mjs` 的 `assertDisjoint` 强制，因为重叠文本会把同一次模型输出在两个 case 里重复计分。

两条专门的反例样本（GC_001、GC_013）的核心作用是测**误报**：它们的 `forbiddenClaims` 里写着"判为铺垫不足属误报""判为节奏拖沓属误报"。模型越勤快地挑毛病，这两条分数越低。

## 待办（按优先级）

1. **人工审定 14 条样本**。当前全部是 `annotation.reviewedBy: null`，按 `schema.md` 的规定**不计入正式分数**。这是唯一的人工成本，也是面试被追问"标准可信度"时的唯一答案。
2. 扩充到 30–50 条。当前缺：supplemental 12 篇（只有摘要无 detail）的样本、3000 字长文本边界样本、论述类文本样本。
3. 建立 `baseline.json`（语义是"上一个被接受的分数"，不是"第一次跑分"），开启回归门禁。
4. 把 `assertsForbidden` 的字符重叠阈值（当前 0.8）在 30+ 审定样本上重新标定——现在这个值是拍的。

## 为什么评测脚本用 jiti 加载 TS

`src/lib/ai/*` 是 TypeScript，runner 是 `.mjs`。用 `jiti` 直接加载，避免为评测单独配一套构建。
`npm run eval` 因此不需要先 `npm run build`，可以离线秒级迭代。
