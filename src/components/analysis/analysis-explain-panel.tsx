"use client";

import { CheckCircle2, FileText, Library, ListTree, ShieldCheck } from "lucide-react";
import type { LiteraryAnalysisResult } from "@/lib/types";
import { getInjectedCriteria, type CriterionFields } from "@/lib/ai/criteria";
import { AnalysisIntegrity } from "@/components/analysis/analysis-integrity";

/**
 * 可解释面板（PRD 2.0 §3.3 四段）。
 *
 * 设计原则：**据实呈现**。
 * 我们不假装有一条向量检索管线——诊断时真正的依据是判据库按维度确定性注入，
 * 知识参考（作品技法）走关键词检索且经常为空。面板必须如实分开这两件事，
 * 否则「检索段」会变成一块跟结论无关的装饰，反而削弱可信度。
 *
 * 四段对应 PRD：
 *   1 输入段 —— 本次被诊断的文本与触发参数
 *   2 检索段 —— 命中了哪些判据（确定性命中）/ 召回哪些知识参考（关键词检索）
 *   3 任务段 —— 各维度判断、置信度、下一步建议
 *   4 校验段 —— 每条结论证据是否成立，被丢弃的单列并说明原因
 */

const SECTION_META = [
  { key: "input", label: "输入", icon: FileText },
  { key: "retrieval", label: "检索", icon: Library },
  { key: "task", label: "任务", icon: ListTree },
  { key: "check", label: "校验", icon: ShieldCheck },
] as const;

function criteriaMap() {
  const map = new Map<string, { id: string; dimension: string } & Pick<CriterionFields, "statement" | "checkable" | "metric">>();
  for (const hit of getInjectedCriteria()) {
    const { statement, checkable, metric } = hit.block;
    map.set(hit.id, { id: hit.id, dimension: hit.dimension, statement, checkable, metric });
  }
  return map;
}

/** 诊断上的判据编号带版本后缀（P1@v1.0），查表前要剥掉。 */
function bareId(stamped: string) {
  return stamped.replace(/@.*$/, "");
}

export function AnalysisExplainPanel({ sourceText, sourceKind, mode, prompt, result }: {
  sourceText: string;
  sourceKind: "narrative" | "argumentative";
  mode: "live" | "demo";
  prompt?: string;
  result: LiteraryAnalysisResult;
}) {
  const byId = criteriaMap();
  const allCriteria = [...byId.values()];
  const cited = new Set(result.diagnostics.flatMap((diagnostic) => (diagnostic.criteriaIds ?? []).map(bareId)));
  const uncited = allCriteria.filter((criterion) => !cited.has(criterion.id));
  const retrieved = result.retrievalEvidence;
  const evidenceById = new Map(result.evidence.map((item) => [item.id, item]));

  return (
    <section className="explain-panel-four" aria-label="可解释面板">
      <header className="explain-four-head">
        <div>
          <span className="eyebrow">可解释面板</span>
          <h2>这份诊断是怎么做出来的</h2>
          <p>四段留痕：输入了什么、命中了哪些判据、模型给了什么判断、哪些结论没通过校验。</p>
        </div>
        <nav aria-label="面板分段">
          {SECTION_META.map(({ key, label, icon: Icon }) => (
            <a key={key} href={`#explain-${key}`}><Icon size={14} />{label}</a>
          ))}
        </nav>
      </header>

      {/* 1 输入段 */}
      <section id="explain-input" className="explain-four-section" aria-labelledby="explain-input-title">
        <h3 id="explain-input-title">① 输入</h3>
        <dl className="explain-facts">
          <div><dt>文本类型</dt><dd>{sourceKind === "narrative" ? "叙事文本" : "论述文本"}</dd></div>
          <div><dt>字数</dt><dd>{sourceText.length} 字</dd></div>
          <div><dt>结果来源</dt><dd>{mode === "live" ? "真实模型调用" : "结构化演示结果"}</dd></div>
          <div><dt>任务</dt><dd>analysis-v2 · 文学诊断</dd></div>
        </dl>
        {prompt && <p className="explain-prompt">触发参数：{prompt}</p>}
        <details className="explain-source">
          <summary>展开本次被诊断的原文（前 400 字）</summary>
          <pre>{sourceText.slice(0, 400)}{sourceText.length > 400 ? "……" : ""}</pre>
        </details>
      </section>

      {/* 2 检索段 */}
      <section id="explain-retrieval" className="explain-four-section" aria-labelledby="explain-retrieval-title">
        <h3 id="explain-retrieval-title">② 检索</h3>
        <p className="explain-note">
          这一层是<b>确定性注入</b>，不是检索召回：判据库按评价维度整批进入 prompt，
          所以「命中」是指这条判据本次在模型手上，而不是被算法搜出来的。
        </p>
        <div className="explain-criteria">
          <div className="explain-criteria-head">
            <strong>本次注入判据 {allCriteria.length} 条</strong>
            <span>其中被结论引用 {cited.size} 条</span>
          </div>
          <ul>
            {allCriteria.map((criterion) => (
              <li key={criterion.id} data-cited={cited.has(criterion.id)}>
                <span className="criteria-id">{criterion.id}</span>
                <span className="criteria-dim">{criterion.dimension}</span>
                <span className="criteria-statement">{criterion.statement}</span>
                {cited.has(criterion.id) && <CheckCircle2 size={14} aria-label="被引用" />}
              </li>
            ))}
          </ul>
          {uncited.length > 0 && (
            <p className="explain-note">
              未被引用的 {uncited.length} 条（{uncited.map((c) => c.id).join("、")}）说明模型判断这些问题在这段文本里不成立，
              这是判据在起作用，不是漏检。
            </p>
          )}
        </div>

        <div className="explain-retrieved">
          <strong>知识参考（关键词检索召回 {retrieved.length} 条）</strong>
          {retrieved.length === 0 ? (
            <p className="explain-note">本次没有召回知识参考。诊断依据全部来自上面的判据，不依赖作品技法条目。</p>
          ) : (
            <ul>
              {retrieved.map((item) => (
                <li key={item.retrievalId}>
                  <span className="criteria-id">{item.retrievalId}</span>
                  <span>{item.quote}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 3 任务段 */}
      <section id="explain-task" className="explain-four-section" aria-labelledby="explain-task-title">
        <h3 id="explain-task-title">③ 任务</h3>
        <p className="explain-note">模型给出的判断，按「看到了什么 → 所以怎样 → 建议怎么做」排列。</p>
        <ol className="explain-diagnostics">
          {result.diagnostics.map((diagnostic) => (
            <li key={diagnostic.id}>
              <div className="explain-diagnostic-head">
                <strong>{diagnostic.location}</strong>
                <span>置信度 {Math.round(diagnostic.confidence * 100)}%</span>
                {(diagnostic.criteriaIds ?? []).map((id) => (
                  <span className="criteria-chip" key={id} title={byId.get(bareId(id))?.statement}>
                    {byId.get(bareId(id))?.dimension ?? bareId(id)}
                  </span>
                ))}
              </div>
              <q>{diagnostic.quote}</q>
              <p><b>判断：</b>{diagnostic.effect}</p>
              <p><b>下一步：</b>{diagnostic.action}</p>
              {(diagnostic.criteriaIds ?? []).length > 0 && (
                <p className="explain-basis">
                  依据：{(diagnostic.criteriaIds ?? []).map((id) => byId.get(bareId(id))?.statement).filter(Boolean).join("；")}
                </p>
              )}
              {diagnostic.criteriaEvaluation?.length ? (
                <details className="explain-source">
                  <summary>判定过程</summary>
                  {diagnostic.criteriaEvaluation.map((evaluation) => {
                    const criterion = byId.get(evaluation.criteriaId);
                    return (
                      <dl key={evaluation.criteriaId}>
                        <dt>判据</dt>
                        <dd>
                          <b>{criterion?.dimension ?? evaluation.criteriaId}</b>　{criterion?.statement}
                          <span className="criteria-code" title="判据编号，用于追溯到知识库条目">{evaluation.criteriaId}</span>
                        </dd>
                        <dt>判定规则</dt>
                        <dd><p>{criterion?.checkable}</p><p>{criterion?.metric}</p></dd>
                        <dt>本例计数</dt>
                        <dd>
                          <p>{evaluation.reason}</p>
                          <p>{evaluation.countedAt.length} 条原文证据</p>
                          {evaluation.countedAt.map((id) => <blockquote key={id}>{evidenceById.get(id)?.quote}</blockquote>)}
                        </dd>
                        <dt>结论</dt>
                        <dd>{evaluation.result === "pass" ? "通过" : "未通过"}</dd>
                      </dl>
                    );
                  })}
                </details>
              ) : (
                <p className="explain-note">本次未提供判定过程</p>
              )}
            </li>
          ))}
        </ol>
        <p className="explain-note">
          各维度得分（{result.analysis.length} 项）：
          {result.analysis.map((dimension) => `${dimension.name} ${dimension.score}`).join(" · ") || "本次未给出"}
        </p>
      </section>

      {/* 4 校验段：复用可信度说明，保证两处口径一致 */}
      <section id="explain-check" className="explain-four-section" aria-labelledby="explain-check-title">
        <h3 id="explain-check-title">④ 校验</h3>
        <p className="explain-note">
          每条结论都要过两道关：引文必须逐字出现在原文，判据编号必须在本次注入的集合里。
          过关的留下，不过关的单条丢弃并写明原因——不会因为一条不合格就把整份结果作废。
        </p>
        <AnalysisIntegrity result={result} />
        {result.diagnostics.length > 0 && (
          <p className="explain-note">
            本次 {result.diagnostics.length} 条诊断全部通过校验；被丢弃的条目见上方清单。
          </p>
        )}
      </section>
    </section>
  );
}
