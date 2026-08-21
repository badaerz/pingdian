"use client";

import { ArrowRight, MessageSquareText, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AiProgress } from "@/components/ui/ai-progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { aggregateTrainingTrend, diffSummary, normalizeTrainingFeedback, TREND_DIMENSIONS, type NormalizedTrainingFeedback } from "@/components/training/training-feedback";
import { useStory } from "@/providers/story-provider";
import { knowledgeRecords } from "@/lib/knowledge/catalog";
import exerciseData from "../../../incoming/exercises/writing_exercises.json";

interface Exercise {
  id: string;
  title: string;
  description: string;
  prompt: string;
  rubric: Array<{ dimension: string; weight: string; criteria: string }>;
  guardrails: { strictGhostwritingProhibition?: boolean; feedbackStrategy?: string; forbiddenBehaviors?: string[]; requiredFeedbackFlow?: string[] };
}

type Feedback = NormalizedTrainingFeedback;

const exercises: Exercise[] = exerciseData.map((exercise) => ({
  id: exercise.id,
  title: exercise.technique_name,
  description: exercise.objective,
  prompt: exercise.prompt,
  rubric: exercise.evaluation_rubrics.map((item) => ({ dimension: item.dimension, weight: item.weight, criteria: item.criteria })),
  guardrails: {
    strictGhostwritingProhibition: Boolean(exercise.ai_guardrails.strict_ghostwriting_prohibition),
    feedbackStrategy: exercise.ai_guardrails.feedback_strategy,
    forbiddenBehaviors: exercise.ai_guardrails.forbidden_behaviors,
    requiredFeedbackFlow: exercise.ai_guardrails.required_feedback_flow,
  },
}));

const emptyProject = {
  title: "文学课堂练习",
  genre: "写作训练",
  logline: "通过过程反馈练习文学技法。",
  activeChapterId: "training",
  contextRevision: 0,
  chapters: [],
  characters: [],
  worldEntries: [],
  blueprint: [],
};

export function TrainingWorkspace({ exerciseId, diagnosticId }: { exerciseId?: string; diagnosticId?: string } = {}) {
  const { trainingHistory: history, recordTrainingAttempt, clearTrainingHistory, recordAiRun } = useStory();
  const requestedExercise = exercises.find((exercise) => exercise.id === exerciseId);
  const [active, setActive] = useState<Exercise>(requestedExercise ?? exercises[0]);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "feedback" | "error">("idle");
  const [mode, setMode] = useState<"live" | "demo">("demo");
  const [warning, setWarning] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [practiceMode, setPracticeMode] = useState<"individual" | "classroom">("individual");
  const [classroomReferenceId, setClassroomReferenceId] = useState(knowledgeRecords.find((record) => record.sourceStatus === "verified" || record.authorized)?.id ?? "");
  const [referenceId, setReferenceId] = useState(knowledgeRecords.find((record) => record.sourceStatus === "verified" || record.authorized)?.id ?? "");
  const requestSequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const answerRevisionRef = useRef(0);
  const reference = knowledgeRecords.find((record) => record.id === referenceId && (record.sourceStatus === "verified" || record.authorized));
  const classroomReference = knowledgeRecords.find((record) => record.id === classroomReferenceId && (record.sourceStatus === "verified" || record.authorized));
  const validExercise = Boolean(requestedExercise);
  const entryNotice = diagnosticId && exerciseId
    ? validExercise ? `诊断入口：已载入专项练习 ${exerciseId}。` : `诊断入口：${exerciseId} 未匹配，已回退到 ${exercises[0].id}。`
    : "";

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
    requestSequenceRef.current += 1;
  }, []);

  const choose = (exercise: Exercise) => {
    abortRef.current?.abort();
    requestSequenceRef.current += 1;
    answerRevisionRef.current += 1;
    setActive(exercise); setAnswer(""); setFeedback(null); setWarning(""); setStatus("idle");
  };

  const submit = async () => {
    const answerSnapshot = answer.trim();
    if (practiceMode === "classroom" || !answerSnapshot || !mountedRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const sequence = ++requestSequenceRef.current;
    const answerRevision = answerRevisionRef.current;
    const exerciseSnapshot = active;
    const previous = history.find((item) => item.exerciseId === exerciseSnapshot.id);
    const attemptNo = (previous?.attemptNo ?? history.filter((item) => item.exerciseId === exerciseSnapshot.id).length) + 1;
    const referenceEvidence = reference?.deconstruction.selectedText?.trim().slice(0, 500);
    const prompt = [
      "rubric:", JSON.stringify(exerciseSnapshot.rubric),
      "guardrails:", JSON.stringify(exerciseSnapshot.guardrails),
      "scores.dimension 必须严格映射到固定六维：证据具体性、动作设计、感官细节、结构节律、语言控制、自主修订；量规维度只用于解释，不得创建其他维度。",
      "训练不代写，只反馈用户过程。",
      referenceEvidence ? `verified_reference_evidence: ${referenceEvidence}` : "verified_reference_evidence: none",
    ].join("\n");
    setStatus("loading"); setWarning(""); setFeedback(null);
    try {
      const response = await fetch("/api/ai", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "training-feedback-v2", project: emptyProject, input: { exerciseId: exerciseSnapshot.id, answer: answerSnapshot, sourceText: answerSnapshot, prompt } }) });
      const data = await response.json() as { mode?: "live" | "demo"; result?: unknown; warnings?: string[] };
      if (controller.signal.aborted || !mountedRef.current || sequence !== requestSequenceRef.current || answerRevision !== answerRevisionRef.current || exerciseSnapshot.id !== active.id) return;
      const next = normalizeTrainingFeedback(data.result, answerSnapshot, attemptNo, previous?.answer, new Set(TREND_DIMENSIONS));
      recordAiRun({ task: "training-feedback-v2", mode: data.mode ?? "demo", request: { exerciseId: exerciseSnapshot.id, answerLength: answerSnapshot.length, referenceId: reference?.id }, result: { trainingFeedback: next } });
      recordTrainingAttempt({ exerciseId: exerciseSnapshot.id, title: exerciseSnapshot.title, note: next.nextExperiment, answer: answerSnapshot, feedback: next, attemptNo, previousAttemptId: previous?.id, scores: next.scores, evidenceQuotes: next.evidenceQuotes, referenceId: reference?.id, sourceDiagnosticId: diagnosticId });
      setMode(data.mode ?? "demo"); setWarning(data.warnings?.join(" ") ?? ""); setFeedback(next); setStatus("feedback");
    } catch {
      if (controller.signal.aborted || !mountedRef.current || sequence !== requestSequenceRef.current || answerRevision !== answerRevisionRef.current) return;
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const exerciseHistory = useMemo(() => history.filter((item) => item.exerciseId === active.id), [active.id, history]);
  const trend = useMemo(() => aggregateTrainingTrend(history, active.id), [active.id, history]);

  return <div className="page training-page"><header className="page-head visual-page-head"><div><h1 className="page-title">写作训练</h1><p className="page-subtitle">一次只练一个动作，反馈指向下一次可执行的尝试。</p></div><figure className="page-chapter-visual"><Image src="/visuals/training-workshop.png" alt="文学写作训练工坊" fill sizes="(max-width: 700px) 100vw, 320px" /></figure><StatusBadge kind={mode === "live" ? "success" : "demo"}>{mode === "live" ? "真实反馈" : "离线演示"}</StatusBadge><div className="training-mode-toggle" role="group" aria-label="训练模式"><button type="button" className={practiceMode === "individual" ? "active" : ""} onClick={() => setPracticeMode("individual")}>个人练习</button><button type="button" className={practiceMode === "classroom" ? "active" : ""} onClick={() => setPracticeMode("classroom")}>课堂演示</button></div></header>{entryNotice && <div className="analysis-warning" role="status">{entryNotice}</div>}<div className="training-grid"><aside className="exercise-list">{exercises.map((exercise, index) => <button key={exercise.id} className={exercise.id === active.id ? "active" : ""} onClick={() => choose(exercise)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{exercise.title}</strong><p>{exercise.description.slice(0, 56)}{exercise.description.length > 56 ? "…" : ""}</p></div><ArrowRight size={16} /></button>)}</aside><main className="exercise-work">{practiceMode === "classroom" && <section className="classroom-demo" data-testid="classroom-demo"><header><span className="eyebrow">课堂演示</span><strong>选择作品与技法，观察分析方法</strong></header><div className="classroom-controls"><label className="field"><span>课堂作品</span><select aria-label="课堂作品" value={classroomReference?.id ?? ""} onChange={(event) => setClassroomReferenceId(event.target.value)}><option value="">选择已核验作品</option>{knowledgeRecords.filter((record) => record.sourceStatus === "verified" || record.authorized).map((record) => <option key={record.id} value={record.id}>{record.title} · {record.author}</option>)}</select></label><label className="field"><span>课堂技法</span><select aria-label="课堂技法" value={active.id} onChange={(event) => { const selected = exercises.find((exercise) => exercise.id === event.target.value); if (selected) choose(selected); }}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.title}</option>)}</select></label></div><div className="classroom-analysis" data-testid="classroom-analysis-result"><span>分析结果</span><p>课堂分析：{classroomReference?.deconstruction.explanation ?? "请选择一部已核验作品。"}</p><small>课堂演示只展示分析方法，不自动保存训练记录，也不生成可提交范文。</small></div></section>}<div className="reference-context"><label className="field"><span>参考作品</span><select aria-label="参考作品" value={reference?.id ?? ""} onChange={(event) => setReferenceId(event.target.value)}><option value="">不使用参考作品</option>{knowledgeRecords.filter((record) => record.sourceStatus === "verified" || record.authorized).map((record) => <option key={record.id} value={record.id}>{record.title} · {record.author}</option>)}</select></label>{reference && <div className="reference-summary"><span className="eyebrow">本次技法目标</span><small>已核验参考</small><strong>{reference.title}</strong><p>{active.description}</p><small>仅发送短引与技法说明，不发送题库示例答案。</small></div>}</div><div className="exercise-head"><span className="eyebrow">当前练习</span><h2>{active.title}</h2><p>{active.prompt}</p></div><label className="field training-input"><span>练习文本</span><textarea className="textarea" aria-label="练习文本" value={answer} onChange={(event) => { setAnswer(event.target.value); answerRevisionRef.current += 1; }} placeholder="在这里写下你的版本…" /></label><div className="exercise-actions"><span>{answer.replace(/\s/g, "").length} 字 · 尝试 {exerciseHistory.length + (status === "loading" || status === "feedback" ? 1 : 0)}</span><Button onClick={submit} disabled={!answer.trim() || status === "loading" || practiceMode === "classroom"}><Send size={16} />{status === "loading" ? "正在分析…" : "提交练习"}</Button></div><AiProgress status={status === "feedback" ? "success" : status} label="写作训练评价进度" />{warning && <div className="analysis-warning" role="status">{warning}</div>}{status === "loading" && <div className="feedback-loading"><Sparkles size={18} /><span>正在整理过程反馈</span></div>}{status === "error" && <div className="analysis-error" role="alert"><Sparkles size={18} /><span>反馈暂时不可用，请重试。</span></div>}{status === "feedback" && feedback && <section className="feedback-panel"><div className="feedback-head"><div><StatusBadge kind="success"><span>反馈完成</span><span>尝试 {feedback.attemptNo}</span></StatusBadge><h3>{feedback.strengths[0] ?? "这次尝试留下了可继续观察的细节"}</h3></div><Button variant="secondary" onClick={submit} disabled={!answer.trim()}><RotateCcw size={15} />再次评价</Button></div><div className="feedback-grid"><article><span>观察到的优势</span><p>{feedback.strengths.join("；") || "继续保留具体动作。"}</p></article><article><span>文本证据</span><p>{feedback.evidenceQuotes.join("；") || "暂无文本证据"}</p></article><article><span>待观察问题</span><p>{feedback.issues.join("；") || "暂无待观察问题"}</p></article><article><span>下一步实验</span><p>{feedback.nextExperiment}</p></article></div>{feedback.questions.length > 0 && <div className="feedback-questions"><span>自问</span>{feedback.questions.map((question) => <p key={question}>{question}</p>)}</div>}{feedback.previousAnswer && <div className="analysis-warning"><strong>与上次尝试的文本差异</strong><p>{diffSummary(feedback.previousAnswer, answer)}</p></div>}</section>}{feedback && <section className="training-trend" data-testid="training-trend"><header><span className="eyebrow">成长记录</span><strong>六维趋势</strong></header><div className="training-trend-grid">{TREND_DIMENSIONS.map((dimension) => <article data-testid="training-trend-dimension" key={dimension}><span>{dimension}</span><strong>{trend[dimension].mean ?? "—"}</strong><small>{trend[dimension].values.length ? `${trend[dimension].direction === "up" ? "↑" : trend[dimension].direction === "down" ? "↓" : "→"} ${trend[dimension].values.join(" · ")}` : "暂无历史分数"}</small></article>)}</div></section>}</main><aside className="training-history"><div><span className="eyebrow">最近记录</span><Button variant="icon" aria-label="删除训练记录" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /></Button></div>{history.length ? history.map((item, index) => <article key={`${item.id}-${index}`}><MessageSquareText size={16} /><div><strong>{item.title} · 尝试 {item.attemptNo ?? 1}</strong><span>{item.date}</span><p>下一步：{item.note}</p></div></article>) : <p className="muted">提交一次练习后会出现在这里。</p>}</aside></div><Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title="删除训练记录" description="删除后仅清空当前演示会话的记录。"><div className="dialog-actions"><Button variant="secondary" onClick={() => setConfirmDelete(false)}>取消</Button><Button variant="danger" onClick={() => { clearTrainingHistory(); setConfirmDelete(false); }}>确认删除</Button></div></Dialog></div>;
}
