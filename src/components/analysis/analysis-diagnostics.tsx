"use client";

import { AlertTriangle, ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import type { LiteraryDiagnostic } from "@/lib/types";

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
      {diagnostic.trainingExerciseId && /^EX_[0-9]{3}$/.test(diagnostic.trainingExerciseId) && <Link className="diagnostic-training-link" href={`/training?exercise=${encodeURIComponent(diagnostic.trainingExerciseId)}&diagnostic=${encodeURIComponent(diagnostic.id)}`}>去专项训练</Link>}
    </article>)}</div>
  </section>;
}
