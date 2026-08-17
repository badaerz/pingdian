"use client";

import { Check, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useStory } from "@/providers/story-provider";
import { cn } from "@/lib/utils";

export function CandidatePanel({ className }: { className?: string }) {
  const { state, setState, accept, discard } = useStory();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mode, setMode] = useState<"live" | "demo">("demo");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const generate = async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "continue", title: state.projects.find((project) => project.id === state.activeProjectId)?.title ?? "未命名作品", content: state.chapters[0]?.content ?? "" }),
      });
      const result = await response.json() as { candidates?: typeof state.candidates; mode?: "live" | "demo" };
      if (!response.ok || !result.candidates?.length) throw new Error("Generation failed");
      setState((current) => ({ ...current, candidates: result.candidates ?? [] }));
      setMode(result.mode ?? "demo");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };
  const current = state.candidates.find((item) => item.id === selected);
  return <aside className={cn("candidate-panel", className)} aria-label="AI 候选区"><div className="candidate-head"><div><span className="eyebrow">AI 候选区</span><h2>接下来怎么写</h2></div><StatusBadge>{mode === "live" ? "真实生成" : "演示数据"}</StatusBadge></div><div className="ai-actions"><Button onClick={generate} disabled={status === "loading"}><Sparkles size={16} />{status === "loading" ? "生成中…" : "续写"}</Button><Button variant="secondary" onClick={() => setStatus("error")}>改写</Button><Button variant="secondary" onClick={() => { setState((current) => ({ ...current, candidates: [] })); setStatus("idle"); }}>清空</Button></div><div className="candidate-status" aria-live="polite">{status === "idle" && <p>选择操作后，结果只会进入候选区。</p>}{status === "loading" && <div className="candidate-skeleton"><i /><i /><i /></div>}{status === "success" && <strong><Check size={15} />生成完成</strong>}{status === "error" && <div role="alert" className="inline-error"><span>生成失败，已保留当前正文。</span><Button variant="ghost" onClick={generate}><RefreshCw size={15} />重试</Button></div>}</div><div className="candidate-list">{status === "success" && state.candidates.filter((candidate) => candidate.status === "pending").map((candidate) => <article key={candidate.id} className="candidate-card"><div className="candidate-meta"><strong>{candidate.label}</strong><span>{candidate.tags.join(" · ")}</span></div><p>{candidate.content}</p><small>{candidate.rationale}</small><div className="candidate-buttons"><Button aria-label="采纳候选" onClick={() => setSelected(candidate.id)}><Check size={15} />采纳</Button><Button variant="secondary" aria-label="编辑后采纳" onClick={() => { setEditing(candidate.id); setDraft(candidate.content); }}><Pencil size={15} />编辑</Button><Button variant="ghost" aria-label="放弃候选" onClick={() => discard(candidate.id)}><Trash2 size={15} /></Button></div></article>)}</div><Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} title="确认采纳" description="采纳后会写入当前章节，并创建一个新版本。"><div className="confirm-copy">{current?.content}</div><div className="dialog-actions"><Button variant="secondary" onClick={() => setSelected(null)}>返回候选</Button><Button onClick={() => { if (selected) accept(selected); setSelected(null); }}>确认采纳</Button></div></Dialog><Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title="编辑后采纳" description="这里的修改不会影响正文，直到确认采纳。"><label className="field"><span>候选文本</span><textarea className="textarea" value={draft} onChange={(event) => setDraft(event.target.value)} /></label><div className="dialog-actions"><Button variant="secondary" onClick={() => setEditing(null)}>取消</Button><Button onClick={() => { if (editing) accept(editing, draft); setEditing(null); }}>确认采纳</Button></div></Dialog></aside>;
}
