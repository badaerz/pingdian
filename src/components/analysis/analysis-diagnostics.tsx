"use client";

import { AlertTriangle, ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import type { LiteraryDiagnostic } from "@/lib/types";

const hasExercise = (id?: string): id is string => Boolean(id && /^EX_[0-9]{3}$/.test(id));

/**
 * 判据维度 → 练习的确定性映射。
 *
 * 线上真实诊断不会带 trainingExerciseId（那是演示夹具里预置的），
 * 之前的结果是：真跑模型时「去专项训练」整条消失，黄金路径第 6 步走不通。
 * 练习按判据维度就能定，不需要模型给——模型给的仍然优先。
 */
const DIMENSION_EXERCISE: Record<string, string> = {
  P: "EX_001", // 具体性与感官 → 展示而非告知
  M: "EX_005", // 意象复现     → 场景与氛围
  S: "EX_006", // 结构组织     → 铺垫与回收
  C: "EX_003", // 连贯衔接     → 对话潜台词（衔接断裂最常出现在对话里）
  D: "EX_004", // 信息密度节奏 → 冷峻白描
  V: "EX_004", // 视角一致性   → 冷峻白描（叙事距离）
};

/** 从裸判据编号（P1 / M3）推出练习；模型自带的有效 ID 优先。 */
function exerciseFor(diagnostic: LiteraryDiagnostic): string | null {
  if (hasExercise(diagnostic.trainingExerciseId)) return diagnostic.trainingExerciseId;
  for (const id of diagnostic.criteriaIds ?? []) {
    const exercise = DIMENSION_EXERCISE[id.slice(0, 1)];
    if (exercise) return exercise;
  }
  return null;
}

export function AnalysisDiagnostics({ diagnostics, selectedId, onSelect }: {
  diagnostics: LiteraryDiagnostic[];
  selectedId?: string;
  onSelect: (diagnostic: LiteraryDiagnostic) => void;
}) {
  return <section className="analysis-diagnostics" aria-labelledby="analysis-diagnostics-title">
    <header><div><span className="eyebrow">可执行诊断</span><h2 id="analysis-diagnostics-title">具体修改建议</h2></div><AlertTriangle size={18} /></header>
    <div className="diagnostic-list">{diagnostics.map((diagnostic) => <article key={diagnostic.id} data-selected={diagnostic.id === selectedId}>
      <div className="diagnostic-location"><MapPin size={14} /><span>{diagnostic.location}</span><small>{Number.isFinite(diagnostic.confidence) ? `置信提示 ${Math.round(diagnostic.confidence * 100)}%` : "未给出置信度"}</small></div>
      <q>{diagnostic.quote}</q>
      <p>{diagnostic.effect}</p>
      <button type="button" onClick={() => onSelect(diagnostic)} aria-label={`${diagnostic.action}，定位原文证据`}>
        <span>{diagnostic.action}</span><ArrowRight size={15} />
      </button>
      {(() => {
        const exercise = exerciseFor(diagnostic);
        return exercise ? <Link className="diagnostic-training-link" href={`/training?exercise=${encodeURIComponent(exercise)}&diagnostic=${encodeURIComponent(diagnostic.id)}`}>去专项训练</Link> : null;
      })()}
    </article>)}</div>
    {diagnostics.length > 0 && !diagnostics.some(item => exerciseFor(item)) &&
      <p className="muted">本次诊断未关联练习。<Link className="diagnostic-training-link" href="/training">浏览专项练习</Link></p>}
  </section>;
}
