"use client";

import { AlertTriangle, CheckCircle2, Network } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initialStoryState } from "@/data/mock-data";
import { CharacterGraph } from "@/components/analysis/character-graph";
import { EvidenceDrawer } from "@/components/analysis/evidence-drawer";
import { StoryCurves } from "@/components/analysis/story-curves";

export function AnalysisWorkspace() {
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [state, setState] = useState<"success" | "loading" | "error">("success");
  const openEvidence = useCallback((id: string) => setEvidenceId(id), []);
  return <div className="analysis-page"><header className="analysis-head"><div><span className="eyebrow">文学诊断 · 版本 2</span><h1>雾港来信</h1></div><div className="analysis-state">{state === "success" && <><StatusBadge kind="success">分析已完成</StatusBadge><span>刚刚更新</span></>}{state === "loading" && <StatusBadge>分析中</StatusBadge>}{state === "error" && <StatusBadge kind="warning">分析失败</StatusBadge>}<Button variant="secondary" onClick={() => { setState("loading"); window.setTimeout(() => setState("success"), 500); }}>刷新分析</Button></div></header>{state === "error" ? <div className="analysis-error" role="alert"><AlertTriangle /><div><strong>分析暂时不可用</strong><p>正文和已有证据未受影响，可切回演示结果。</p></div><Button onClick={() => setState("success")}>使用演示结果</Button></div> : <div className="analysis-grid"><section className="dimension-panel"><div className="dimension-title"><div><h2>六维诊断</h2><p>结论均链接到可核对证据。</p></div><StatusBadge>演示数据</StatusBadge></div><div className="dimension-list">{initialStoryState.analysis.map((dimension) => <article data-testid="analysis-dimension" key={dimension.id}><div className="dimension-score"><span>{dimension.name}</span><strong>{dimension.score}</strong></div><div className="dimension-copy"><h3>{dimension.summary}</h3><p>{dimension.impact}</p><div className="suggestion"><CheckCircle2 size={15} /><span>{dimension.suggestion}</span></div><div className="evidence-links">{dimension.evidenceIds.map((id) => <Button key={id} variant="ghost" aria-label={`证据 ${id}`} onClick={() => openEvidence(id)}>{id}</Button>)}</div></div></article>)}</div></section><section className="visual-panel"><Tabs defaultValue="graph"><TabsList className="analysis-tabs"><TabsTrigger value="graph"><Network size={15} />人物关系</TabsTrigger><TabsTrigger value="plot">情节曲线</TabsTrigger><TabsTrigger value="emotion">情绪曲线</TabsTrigger></TabsList><TabsContent value="graph"><CharacterGraph graph={initialStoryState.characterGraph} onSelect={() => openEvidence("E1")} /></TabsContent><TabsContent value="plot"><StoryCurves type="plot" data={initialStoryState.plotCurve} onEvidence={openEvidence} /></TabsContent><TabsContent value="emotion"><StoryCurves type="emotion" data={initialStoryState.emotionCurve} onEvidence={openEvidence} /></TabsContent></Tabs><div className="conflict-note"><AlertTriangle size={16} /><div><strong>一致性提示</strong><p>沈砚“从未离开值班室”与第二章回忆中“去过第七码头”可能冲突。仅提示，不自动修改。</p></div></div></section></div>}<EvidenceDrawer evidence={initialStoryState.evidence.find((item) => item.id === evidenceId)} onClose={() => setEvidenceId(null)} /></div>;
}
