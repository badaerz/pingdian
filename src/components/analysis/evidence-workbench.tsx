"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiteraryAnalysisResult } from "@/lib/types";
import { exerciseFor } from "./analysis-diagnostics";

type Result = Pick<LiteraryAnalysisResult, "analysis" | "diagnostics" | "discardedDiagnostics">;
const reasons = {
  field_invalid: "字段缺失或格式不符",
  duplicate_id: "与另一条诊断重复",
  quote_not_in_source: "引文逐字不符，无法在原文中定位",
  no_observation_evidence: "无法定位到可核验的原文证据",
  proofreading_not_allowed: "属于校对意见",
  unknown_criteria: "引用了本次未提供的判据",
  missing_criteria: "缺少判据编号",
};

export function EvidenceWorkbench({ result, source: originalSource, mode, criteriaCount }: {
  result: Result; source: string; mode: "live" | "demo"; criteriaCount?: number;
}) {
  const replay = criteriaCount !== undefined;
  const source = replay ? originalSource.replace(/，\r?\n/g, "，") : originalSource;
  const [selected, select] = useState<string>();
  const [highlighted, highlight] = useState<string>();
  const [dimension, setDimension] = useState<string>();
  const notes = result.diagnostics.map(note => ({ ...note, start: note.quote ? source.indexOf(note.quote) : -1 }));
  const active = notes.find(note => note.id === (selected ?? highlighted)) ?? notes[0];
  const exercise = active ? exerciseFor(active) : null;
  const discarded = result.discardedDiagnostics;
  const anchored = notes.filter(note => note.start >= 0).length;
  const criteria = new Set(notes.flatMap(note => note.criteriaIds ?? []));
  const indexed = notes.filter(note => note.start >= 0 && (note === active || !active || active.start < 0 ||
    note.start >= active.start + active.quote.length || note.start + note.quote.length <= active.start)).sort((a,b) => a.start - b.start);
  function renderSource(start: number, limit: number) {
    let cursor = start;
    const fragments = [];
    for (const note of indexed) {
      const end = note.start + note.quote.length;
      if (note.start < cursor || end > limit) continue;
      const before = source.slice(cursor, note.start);
      cursor = end;
      const linked = active && active.start >= 0 && active.start < end && active.start + active.quote.length > note.start;
      fragments.push(<span key={note.id}>{before}<button type="button" className="ew-anchor" aria-pressed={Boolean(linked)}
        onPointerEnter={() => highlight(note.id)} onPointerLeave={() => highlight(undefined)}
        onFocus={() => highlight(note.id)} onBlur={() => highlight(undefined)} onClick={() => select(note.id)}>{note.quote}</button></span>);
    }
    return <>{fragments}{source.slice(cursor, limit)}</>;
  }
  let lineStart = 0;
  const couplets = replay ? source.split("\n").map(line => {
    const start = lineStart;
    lineStart += line.length + 1;
    return <span className="ew-couplet" key={start}>{renderSource(start, start + line.length)}</span>;
  }) : null;
  return <section className="ew" aria-label="原文与批注核对">
    <header className="ew-top"><h2>{replay ? "杜甫《登高》" : "原文与批注"}</h2>{replay && <span>示例作品 · 已保存的真实分析</span>}<span>{mode === "demo" ? "本地演示 · 引文取自原文，评语和分数为示范" : ""} <b className="ew-stamp" aria-label={mode === "live" ? "真实分析" : "演示结果"}>{mode === "live" ? "真" : "演"}</b></span></header>
    <div className="ew-grid">
      <aside className="ew-side">
        <h3>六维目录</h3>
        {result.analysis.map(item => <button className="ew-dimension" type="button" key={item.id} aria-expanded={dimension === item.id} onClick={() => setDimension(dimension === item.id ? undefined : item.id)}>
          <span>{item.name}</span><span className="ew-score-track" aria-hidden="true"><span style={{ width: `${item.score}%` }} /></span><span className="ew-score">{item.score}</span>
        </button>)}
        {replay && !result.analysis.some(item => item.name === "连贯衔接") && <p className="ew-dimension ew-dimension-missing"><span>连贯衔接</span> · 未记录</p>}
        {result.analysis.find(item => item.id === dimension)?.summary && <p className="ew-summary">{result.analysis.find(item => item.id === dimension)?.summary}</p>}
        <div className="ew-run"><h3>本轮统计</h3><dl>
          <div><dt>过筛判据</dt><dd>{criteriaCount ?? "未记录"}</dd></div>
          <div><dt>引用判据</dt><dd>{criteria.size}</dd></div>
          <div><dt>产出批注</dt><dd>{notes.length}</dd></div>
          <div><dt>丢弃</dt><dd>{discarded?.length ?? "未记录"}</dd></div>
          <div><dt>已定位引文</dt><dd>{anchored} / {notes.length}</dd></div>
        </dl></div>
      </aside>
      <div className="ew-center">
        <h3>原文</h3><p className="ew-source" data-pinned={Boolean(selected && active?.start >= 0)}>{source ? couplets ?? renderSource(0, source.length) : "本次结果没有可展示的原文。"}</p>
        <section className="ew-evidence" aria-label="证据" aria-live="polite">
          <h3>证据</h3>
          {active?.start >= 0 ? <>
            <blockquote>{source.slice(active.start, active.start + active.quote.length)}</blockquote>
            <p>{active.location} · 逐字命中 · 置信 {active.confidence.toFixed(2)}</p>
            <p>判据 {active.criteriaIds?.join(" / ") || "未记录"} · 冲突 {active.criteriaEvaluation?.some(item => item.result === "fail") ? "有判据未通过" : active.criteriaEvaluation?.length ? "未发现判据冲突" : "未记录"}</p>
            {exercise && <Link className="ew-training" href={`/training?exercise=${encodeURIComponent(exercise)}&diagnostic=${encodeURIComponent(active.id)}`}>去专项训练 ↗</Link>}
          </> : <p>{active ? "这条批注的引文在当前原文中无法定位。" : "暂无可核对的批注。"}</p>}
        </section>
      </div>
      <section className="ew-notes" aria-label="批注流"><h3>批注 <span>{notes.length}</span></h3>
        {notes.map((note, index) => <button type="button" key={note.id} aria-pressed={active?.id === note.id}
          onPointerEnter={() => highlight(note.id)} onPointerLeave={() => highlight(undefined)}
          onFocus={() => highlight(note.id)} onBlur={() => highlight(undefined)} onClick={() => select(note.id)}>
          <span className="ew-note-head"><b>[{String(index + 1).padStart(2, "0")}] {note.criteriaIds?.join(" / ")}</b><span>{note.confidence.toFixed(2)}</span></span>
          <span className="ew-claim">{note.effect}</span><small>{note.location} · {note.start >= 0 ? "逐字命中" : "原文无法定位"}</small>
        </button>)}
      </section>
    </div>
    <details className="ew-dropped"><summary>丢弃台账 <span>{discarded?.length ?? "未记录"}</span></summary>
      {discarded?.length ? <ul>{discarded.map(({ attempted, reason }, index) => <li key={index}><del>{attempted.effect || attempted.quote || attempted.location || `第 ${index + 1} 条`}</del><span>{reasons[reason]}</span></li>)}</ul>
        : <p>{discarded ? "本轮没有丢弃诊断。" : "原始记录未保存逐条丢弃原因。"}</p>}
    </details>
  </section>;
}
