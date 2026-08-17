"use client";

import { ArrowRight, MessageSquareText, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";

const exercises = [
  { id: "show-dont-tell", title: "展示，而非告知", description: "把抽象情绪改写成动作、环境与感官细节。", prompt: "不要直接写“她很紧张”，用一个动作和一个环境细节表达。" },
  { id: "character-action", title: "用行动塑造人物", description: "让一次选择同时暴露欲望与缺陷。", prompt: "一个习惯控制局面的人必须请求陌生人帮助。写出他的第一次尝试。" },
  { id: "dialogue-subtext", title: "对话中的潜台词", description: "让表层目标与真实情绪错开。", prompt: "两位旧友谈论天气，其中一人其实准备告别。写四句对话。" },
];

export function TrainingWorkspace() {
  const [active, setActive] = useState(exercises[0]); const [answer, setAnswer] = useState(""); const [status, setStatus] = useState<"idle" | "loading" | "feedback">("idle"); const [history, setHistory] = useState([{ title: "展示，而非告知", date: "今天 19:20", note: "动作细节比情绪判断更有说服力" }]); const [confirmDelete, setConfirmDelete] = useState(false);
  const submit = () => { if (!answer.trim()) return; setStatus("loading"); window.setTimeout(() => setStatus("feedback"), 380); };
  const choose = (exercise: typeof exercises[number]) => { setActive(exercise); setAnswer(""); setStatus("idle"); };
  return <div className="page training-page"><header className="page-head"><div><h1 className="page-title">写作训练</h1><p className="page-subtitle">一次只练一个动作，反馈指向下一次可执行的尝试。</p></div><StatusBadge>演示反馈</StatusBadge></header><div className="training-grid"><aside className="exercise-list">{exercises.map((exercise, index) => <button key={exercise.id} className={exercise.id === active.id ? "active" : ""} onClick={() => choose(exercise)}><span>{String(index + 1).padStart(2,"0")}</span><div><strong>{exercise.title}</strong><p>{exercise.description}</p></div><ArrowRight size={16} /></button>)}</aside><main className="exercise-work"><div className="exercise-head"><span className="eyebrow">当前练习</span><h2>{active.title}</h2><p>{active.prompt}</p></div><label className="field training-input"><span>练习文本</span><textarea className="textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="在这里写下你的版本…" /></label><div className="exercise-actions"><span>{answer.replace(/\s/g,"").length} 字</span><Button onClick={submit} disabled={!answer.trim() || status === "loading"}><Send size={16} />{status === "loading" ? "正在分析…" : "提交练习"}</Button></div>{status === "loading" && <div className="feedback-loading"><Sparkles size={18} /><span>正在整理过程反馈</span></div>}{status === "feedback" && <section className="feedback-panel"><div className="feedback-head"><div><StatusBadge kind="success">反馈完成</StatusBadge><h3>这次改写让情绪有了可见的阻力</h3></div><Button variant="secondary" onClick={() => { setAnswer(""); setStatus("idle"); }}><RotateCcw size={15} />再练一次</Button></div><div className="feedback-grid"><article><span>观察到的优势</span><p>动作具体，而且没有替读者命名情绪。</p></article><article><span>文本证据</span><p>“握紧门把，直到指节发白”同时包含力度和持续时间。</p></article><article><span>下一步实验</span><p>加入一个与动作相冲突的声音，让人物的迟疑更清楚。</p></article></div></section>}</main><aside className="training-history"><div><span className="eyebrow">最近记录</span><Button variant="icon" aria-label="删除训练记录" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /></Button></div>{history.length ? history.map((item) => <article key={item.date}><MessageSquareText size={16} /><div><strong>{item.title}</strong><span>{item.date}</span><p>{item.note}</p></div></article>) : <p className="muted">还没有训练记录。</p>}</aside></div><Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title="删除训练记录" description="删除后仅清空当前演示会话的记录。"><div className="dialog-actions"><Button variant="secondary" onClick={() => setConfirmDelete(false)}>取消</Button><Button variant="danger" onClick={() => { setHistory([]); setConfirmDelete(false); }}>确认删除</Button></div></Dialog></div>;
}
