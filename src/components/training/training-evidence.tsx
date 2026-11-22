"use client";

import { useState } from "react";
import { diffSummary, TREND_DIMENSIONS, type NormalizedTrainingFeedback } from "./training-feedback";

export function TrainingEvidence({ answer, feedback, previousScores, onRevise, onReevaluate }: {
  answer: string;
  feedback: NormalizedTrainingFeedback;
  previousScores: Pick<NormalizedTrainingFeedback["scores"][number], "dimension" | "score">[];
  onRevise: () => void;
  onReevaluate: () => void;
}) {
  const [active, setActive] = useState<string>();
  const quotes = [...new Set(feedback.evidenceQuotes)].filter(quote => answer.includes(quote));
  const segments = [];
  let cursor = 0;
  while (cursor < answer.length) {
    const hit = quotes.map(quote => ({ quote, start: answer.indexOf(quote, cursor) }))
      .filter(item => item.start >= 0).sort((a,b) => a.start - b.start || b.quote.length - a.quote.length)[0];
    if (!hit) break;
    segments.push(<span key={hit.start}>{answer.slice(cursor, hit.start)}<mark data-active={hit.quote === active}>{hit.quote}</mark></span>);
    cursor = hit.start + hit.quote.length;
  }
  const groups = [["strengths", "做到了", "观察到的优势"], ["issues", "还缺", "待观察问题"]] as const;
  return <section className="te" aria-label="写作训练反馈">
    <header className="te-head"><strong>反馈完成</strong><span>尝试 {feedback.attemptNo}</span><button type="button" onClick={onReevaluate}>再次评价</button><button type="button" onClick={onRevise}>再写一版 ↑</button></header>
    <div className="te-grid">
      <div className="te-answer">
        <h3>我的答案 <span>v{feedback.attemptNo}</span></h3>
        <p className="te-prose">{segments}{answer.slice(cursor)}</p>
        <section className="te-bindings">
          <h3>本页引用的证据 <span>逐字核对 {quotes.length} 处</span></h3>
          {quotes.length === 0 && <p>暂无可核对的引文。</p>}
          {quotes.map(quote => {
            const links = (feedback.evidenceBindings ?? []).filter(link => link.quote === quote);
            return <button key={quote} type="button" aria-pressed={active === quote}
              onFocus={() => setActive(quote)} onMouseEnter={() => setActive(quote)} onClick={() => setActive(quote)}>
              <q>{quote}</q><i aria-hidden="true" /><span>{links.length ? links.map(link => `${link.group === "strengths" ? "做到了" : "还缺"} ${link.index + 1}`).join(" · ") : "未标注关联反馈"}</span>
            </button>;
          })}
        </section>
        {feedback.previousAnswer && <RevisionComparison previous={feedback.previousAnswer} current={answer} />}
      </div>
      <div className="te-feedback">
        {groups.map(([group, label, accessibleLabel]) => <section key={group} aria-label={accessibleLabel}>
          <h3>{label}<span>{feedback[group].length}</span></h3>
          {group === "strengths" && <span className="sr-only">观察到的优势</span>}
          <ol>{feedback[group].map((item, index) => <li key={index} data-active={Boolean(active && feedback.evidenceBindings?.some(link => link.quote === active && link.group === group && link.index === index))}>{item}</li>)}</ol>
        </section>)}
        <section className="te-teacher"><div><h3>练习提示</h3><p>{feedback.teacherNote || feedback.nextExperiment}</p></div></section>
        <section data-testid="training-trend"><h3>六维 <span>{feedback.previousAnswer ? "较上一版" : "本次"}</span></h3>
          {TREND_DIMENSIONS.map(dimension => {
            const score = feedback.scores.find(item => item.dimension === dimension)?.score;
            const previous = previousScores.find(item => item.dimension === dimension)?.score;
            return <div className="te-score" key={dimension} data-testid="training-trend-dimension" data-up={score !== undefined && previous !== undefined && score > previous}>
              <span>{dimension}</span><span className="te-track" aria-hidden="true"><i style={{ width: `${score ?? 0}%` }} /></span><span>{score ?? "—"}</span>
            </div>;
          })}
        </section>
        {feedback.teacherNote && <section><h3>下一步实验</h3><p>{feedback.nextExperiment}</p></section>}
        {!!feedback.questions.length && <section><h3>自问</h3><ul>{feedback.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></section>}
      </div>
    </div>
  </section>;
}

function RevisionComparison({ previous, current }: { previous: string; current: string }) {
  const [reveal, setReveal] = useState(50);
  return <section className="te-diff">
    <h3>与上次尝试的文本差异</h3>
    <p>{previous === current ? "两版文字相同。" : diffSummary(previous, current)}</p>
    <div className="te-wipe">
      <p className="te-prose" aria-label="上一版">{previous}</p>
      <p className="te-prose te-revision" aria-label="这一版" style={{clipPath: `inset(0 ${100 - reveal}% 0 0)`}}>{current}</p>
      <i aria-hidden="true" style={{left: `${reveal}%`}} />
    </div>
    <label><span>上一版</span><input type="range" min="0" max="100" value={reveal} aria-label="擦除对比" aria-valuetext={`显示这一版 ${reveal}%`} onChange={event => setReveal(Number(event.target.value))} /><span>这一版</span></label>
  </section>;
}
