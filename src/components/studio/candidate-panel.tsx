"use client";

import { AlertTriangle, Check, ChevronDown, Pencil, Send, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProseSelection } from "@/components/studio/prose-editor";
import { StoryDirectionChat, type StoryDirectionComposer } from "@/components/studio/story-direction-chat";
import { AiProgress } from "@/components/ui/ai-progress";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildAiContextPacket } from "@/lib/ai/context";
import { contextFromState } from "@/lib/ai/story-context";
import type { AiTask } from "@/lib/ai/tasks";
import { buildConsistencyInput } from "@/lib/consistency";
import { saveConsistencyReport as upsertConsistencyReport } from "@/lib/story-state";
import type { Candidate, ConsistencyReport, MentorResponse, StoryState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStory } from "@/providers/story-provider";

export interface AssistantRequest {
  id: number;
  task: Extract<AiTask, "rewrite" | "expand" | "condense" | "sensory" | "mentor">;
  selectedText: string;
  selection?: ProseSelection;
}

type GenerationTask = Extract<AiTask, "continue" | "prose" | "rewrite" | "expand" | "condense" | "sensory">;

interface GenerationRequestSnapshot {
  task: GenerationTask;
  selectedText: string;
  selection?: ProseSelection;
  prompt: string;
  projectId: string;
  chapterId: string;
  contextRevision: number;
  body: { task: GenerationTask; project: ReturnType<typeof contextFromState>; input: Record<string, unknown> };
}

interface CandidatePanelProps {
  className?: string;
  selectedText?: string;
  selection?: ProseSelection | null;
  request?: AssistantRequest | null;
  onRequestHandled?: () => void;
  tab?: "candidates" | "mentor";
  onTabChange?: (tab: "candidates" | "mentor") => void;
  onBeforeAccept?: (candidateId: string) => boolean;
  readOnly?: boolean;
}

function sourceLabel(source: MentorResponse["evidence"][number]["source"]) {
  return source === "observation" ? "原文观察" : source === "inference" ? "文学推断" : "知识参考";
}

function isChapterCandidate(candidate: Candidate): candidate is Extract<Candidate, { target: { type: "chapter" } }> {
  return candidate.target.type === "chapter";
}

export function CandidatePanel(props: CandidatePanelProps) {
  const { state } = useStory();
  return <ProjectCandidatePanel key={state.activeProjectId} {...props} />;
}

function ProjectCandidatePanel(props: CandidatePanelProps) {
  const { state } = useStory();
  const [directionDraft, setDirectionDraft] = useState("");
  const [directionTags, setDirectionTags] = useState<string[]>([]);
  const directionComposer: StoryDirectionComposer = {
    draft: directionDraft,
    setDraft: setDirectionDraft,
    selectedTags: directionTags,
    setSelectedTags: setDirectionTags,
  };
  const scope = `${state.activeProjectId}:${state.activeChapterId}:${state.contextRevision}`;
  return <ScopedCandidatePanel key={scope} {...props} directionComposer={directionComposer} />;
}

interface ScopedCandidatePanelProps extends CandidatePanelProps {
  directionComposer: StoryDirectionComposer;
}

function ScopedCandidatePanel({ className, selectedText = "", selection, request, onRequestHandled, tab, onTabChange, onBeforeAccept, directionComposer, readOnly = false }: ScopedCandidatePanelProps) {
  const { state, setState, accept, discard, appendDirectionMessage, recordAiRun } = useStory();
  const [internalTab, setInternalTab] = useState<"candidates" | "mentor">("candidates");
  const activeTab = tab ?? internalTab;
  const changeTab = (value: string) => { const next = value as "candidates" | "mentor"; setInternalTab(next); onTabChange?.(next); };
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mode, setMode] = useState<"live" | "demo">("demo");
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [lastRequest, setLastRequest] = useState<GenerationRequestSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [checkingIds, setCheckingIds] = useState<Set<string>>(() => new Set());
  const [checkFailures, setCheckFailures] = useState<Set<string>>(() => new Set());
  const [question, setQuestion] = useState("");
  const [mentor, setMentor] = useState<MentorResponse | null>(null);
  const handledRequest = useRef(0);
  const generationRequest = useRef(0);
  const scopeRef = useRef(`${state.activeProjectId}:${state.activeChapterId}:${state.contextRevision}`);
  const mountedRef = useRef(true);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const consistencyRequestsRef = useRef<Set<string>>(new Set());
  const autoCheckAttemptedRef = useRef<Set<string>>(new Set());
  const contextPacket = useMemo(() => buildAiContextPacket(state, { instruction: question || "续写与分析", selection: selectedText }), [question, selectedText, state]);

  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    return () => {
      mountedRef.current = false;
      generationRequest.current += 1;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  const normalize = (items: Candidate[], resultMode: "live" | "demo", task: AiTask, snapshot: StoryState, selectionText = "", selectedRange?: ProseSelection) => items.map((candidate) => ({
    ...candidate,
    target: { type: "chapter" as const, id: snapshot.activeChapterId },
    applyMode: candidate.applyMode ?? (["rewrite", "expand", "condense", "sensory"].includes(task) ? "replace-selection" as const : "append" as const),
    selection: ("selection" in candidate ? candidate.selection : undefined) ?? selectedRange ?? (selectionText ? { from: 0, to: selectionText.length, text: selectionText } : undefined),
    generatedRevision: candidate.generatedRevision ?? snapshot.contextRevision,
    mode: candidate.mode ?? resultMode,
  })) as Candidate[];

  const checkConsistency = async (candidate: Extract<Candidate, { target: { type: "chapter" } }>, snapshot: StoryState) => {
    const projectId = snapshot.activeProjectId;
    const revision = snapshot.contextRevision;
    const chapterId = snapshot.activeChapterId;
    const scope = `${projectId}:${chapterId}:${revision}`;
    const requestKey = `${scope}:${candidate.id}`;
    if (consistencyRequestsRef.current.has(requestKey)) return;
    consistencyRequestsRef.current.add(requestKey);
    const controller = new AbortController();
    controllersRef.current.add(controller);
    setCheckingIds((current) => new Set(current).add(candidate.id));
    setCheckFailures((current) => { const next = new Set(current); next.delete(candidate.id); return next; });
    try {
      const request = buildConsistencyInput(snapshot, candidate);
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(request) });
      const payload = await response.json() as { mode?: "live" | "demo"; result?: { consistencyReport?: ConsistencyReport }; warnings?: string[]; notices?: string[] };
      if (!response.ok || !payload.result?.consistencyReport) throw new Error("Consistency failed");
      if (!mountedRef.current || scopeRef.current !== scope) return;
      const report = payload.result.consistencyReport;
      if (report.candidateId !== candidate.id || report.contextRevision !== candidate.generatedRevision) throw new Error("Consistency scope mismatch");
      setState((current) => current.activeProjectId === projectId && current.activeChapterId === chapterId && current.contextRevision === revision && current.candidates.some((item) => item.id === candidate.id)
        ? upsertConsistencyReport(current, report)
        : current);
      recordAiRun({ projectId, task: "consistency-check", mode: payload.mode ?? report.mode, request: request.input, result: payload.result });
      if (payload.warnings?.length) setWarning(payload.warnings.join(" "));
      if (payload.notices?.length) setNotice(payload.notices.join(" "));
    } catch {
      if (mountedRef.current && scopeRef.current === scope) setCheckFailures((current) => new Set(current).add(candidate.id));
    } finally {
      controllersRef.current.delete(controller);
      consistencyRequestsRef.current.delete(requestKey);
      if (mountedRef.current && scopeRef.current === scope) setCheckingIds((current) => { const next = new Set(current); next.delete(candidate.id); return next; });
    }
  };

  const autoCheckKey = state.candidates
    .filter((candidate) => candidate.status === "pending"
      && candidate.target.type === "chapter"
      && candidate.target.id === state.activeChapterId
      && candidate.generatedRevision === state.contextRevision
      && !state.consistencyReports.some((report) => report.candidateId === candidate.id && report.contextRevision === candidate.generatedRevision))
    .map((candidate) => candidate.id)
    .sort()
    .join(":");
  const runAutomaticConsistencyChecks = useEffectEvent(() => {
    const snapshot = state;
    snapshot.candidates.filter(isChapterCandidate).forEach((candidate) => {
      const missingCurrentReport = candidate.status === "pending"
        && candidate.target.id === snapshot.activeChapterId
        && candidate.generatedRevision === snapshot.contextRevision
        && !snapshot.consistencyReports.some((report) => report.candidateId === candidate.id && report.contextRevision === candidate.generatedRevision);
      if (!missingCurrentReport || autoCheckAttemptedRef.current.has(candidate.id)) return;
      autoCheckAttemptedRef.current.add(candidate.id);
      void checkConsistency(candidate, snapshot);
    });
  });

  useEffect(() => {
    if (!autoCheckKey) return;
    const timer = window.setTimeout(() => runAutomaticConsistencyChecks(), 0);
    return () => window.clearTimeout(timer);
  }, [autoCheckKey]);

  const generate = async (task: GenerationTask = "continue", selectionText = "", selectedRange?: ProseSelection, prompt = "", retryRequest?: GenerationRequestSnapshot) => {
    const snapshot = state;
    const input = {
      ...(selectionText ? { selectedText: selectionText } : {}),
      ...(prompt ? { prompt } : {}),
      ...(task === "continue" ? { thread: snapshot.dialogueThreads.slice(-20).map(({ role, content }) => ({ role, content })) } : {}),
    };
    const requestSnapshot: GenerationRequestSnapshot = retryRequest ?? {
      task,
      selectedText,
      ...(selectedRange === undefined ? {} : { selection: { ...selectedRange } }),
      prompt,
      projectId: snapshot.activeProjectId,
      chapterId: snapshot.activeChapterId,
      contextRevision: snapshot.contextRevision,
      body: { task, project: contextFromState(snapshot), input },
    };
    const packet = buildAiContextPacket(snapshot, { instruction: requestSnapshot.prompt || question || "续写与分析", selection: requestSnapshot.selectedText });
    if (packet.blocked) { setWarning(packet.warning ?? "锁定事实超过上限。"); setStatus("error"); return; }
    const requestId = ++generationRequest.current;
    const scope = `${requestSnapshot.projectId}:${requestSnapshot.chapterId}:${requestSnapshot.contextRevision}`;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    setStatus("loading"); setLastRequest(requestSnapshot); setWarning(""); setNotice("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestSnapshot.body),
      });
      const payload = await response.json() as { candidates?: Candidate[]; result?: { candidates?: Candidate[] }; mode?: "live" | "demo"; warnings?: string[]; notices?: string[] };
      const items = payload.candidates ?? payload.result?.candidates;
      if (!response.ok || !items?.length) throw new Error("Generation failed");
      if (!mountedRef.current || scopeRef.current !== scope || generationRequest.current !== requestId) return;
      const next = normalize(items, payload.mode ?? "demo", requestSnapshot.task, snapshot, requestSnapshot.selectedText, requestSnapshot.selection);
      recordAiRun({ projectId: snapshot.activeProjectId, task: requestSnapshot.task, mode: payload.mode ?? "demo", request: requestSnapshot.body.input, result: { candidates: next } });
      setState((current) => current.activeProjectId === snapshot.activeProjectId && current.activeChapterId === snapshot.activeChapterId && current.contextRevision === snapshot.contextRevision
        ? { ...current, candidates: [...next, ...current.candidates.filter((old) => !next.some((item) => item.id === old.id))] }
        : current);
      setMode(payload.mode ?? "demo"); setWarning(payload.warnings?.join(" ") ?? ""); setStatus("success");
      setNotice(payload.notices?.join(" ") ?? "");
      next.filter(isChapterCandidate).forEach((candidate) => void checkConsistency(candidate, { ...snapshot, candidates: [...next, ...snapshot.candidates] }));
    } catch {
      if (mountedRef.current && scopeRef.current === scope && generationRequest.current === requestId) setStatus("error");
    } finally {
      controllersRef.current.delete(controller);
    }
  };

  const askMentor = async (prompt = question, selectionText = selectedText) => {
    const snapshot = state;
    const scope = `${snapshot.activeProjectId}:${snapshot.activeChapterId}:${snapshot.contextRevision}`;
    const requestId = ++generationRequest.current;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    setStatus("loading"); setWarning(""); setNotice("");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ task: "mentor", project: contextFromState(snapshot), input: { prompt, selectedText: selectionText } }) });
      const payload = await response.json() as { mode?: "live" | "demo"; result?: { mentor?: MentorResponse }; warnings?: string[]; notices?: string[] };
      if (!response.ok || !payload.result?.mentor) throw new Error("Mentor failed");
      if (!mountedRef.current || scopeRef.current !== scope || generationRequest.current !== requestId) return;
      setMentor(payload.result.mentor); setMode(payload.mode ?? "demo"); setWarning(payload.warnings?.join(" ") ?? ""); setStatus("success");
      setNotice(payload.notices?.join(" ") ?? "");
      recordAiRun({ projectId: snapshot.activeProjectId, task: "mentor", mode: payload.mode ?? "demo", request: { prompt, selectedText: selectionText }, result: payload.result });
    } catch {
      if (mountedRef.current && scopeRef.current === scope && generationRequest.current === requestId) setStatus("error");
    } finally {
      controllersRef.current.delete(controller);
    }
  };

  const handleRequest = useEffectEvent((currentRequest: AssistantRequest) => {
    if (handledRequest.current === currentRequest.id) return;
    handledRequest.current = currentRequest.id;
    const nextTab = currentRequest.task === "mentor" ? "mentor" : "candidates";
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
    if (currentRequest.task === "mentor") void askMentor("为什么这样写？", currentRequest.selectedText);
    else void generate(currentRequest.task, currentRequest.selectedText, currentRequest.selection);
    onRequestHandled?.();
  });

  useEffect(() => {
    if (!request || handledRequest.current === request.id) return;
    const currentRequest = request;
    const timer = window.setTimeout(() => handleRequest(currentRequest), 0);
    return () => window.clearTimeout(timer);
  }, [request]);

  const current = state.candidates.find((item) => item.id === selected);
  const reviewingCandidate = state.candidates.find((item) => item.id === reviewing);
  const reviewingReport = state.consistencyReports.find((item) => item.candidateId === reviewing);
  const activeChapter = state.chapters.find((chapter) => chapter.id === state.activeChapterId);
  const pending = state.candidates.filter((candidate) => candidate.status === "pending" && candidate.target.type === "chapter" && candidate.target.id === state.activeChapterId);
  const saveEditedCandidate = () => {
    const candidate = state.candidates.find((item) => item.id === editing);
    if (!candidate || candidate.target.type !== "chapter" || !draft.trim()) return;
    const editedCandidate = { ...candidate, content: draft.trim() } as Extract<Candidate, { target: { type: "chapter" } }>;
    const snapshot: StoryState = {
      ...state,
      candidates: state.candidates.map((item) => item.id === candidate.id ? editedCandidate : item),
      consistencyReports: state.consistencyReports.filter((report) => report.candidateId !== candidate.id),
    };
    setState((currentState) => currentState.activeProjectId === state.activeProjectId && currentState.contextRevision === state.contextRevision
      ? { ...currentState, candidates: snapshot.candidates, consistencyReports: snapshot.consistencyReports }
      : currentState);
    setEditing(null);
    void checkConsistency(editedCandidate, snapshot);
  };
  const reviseFromConflict = () => {
    if (!reviewingCandidate || !reviewingReport) return;
    const instructions = reviewingReport.findings.map((finding) => finding.suggestion).join("；");
    setReviewing(null);
    void generate("continue", "", undefined, `请保留当前故事方向，重写下面的候选并解决一致性问题。候选：${reviewingCandidate.content.slice(0, 2_500)}\n修订要求：${instructions.slice(0, 1_000)}`);
  };
  return <aside className={cn("candidate-panel", className)} aria-label="创作协作区">
    <Tabs value={activeTab} onValueChange={changeTab}>
      <TabsList className="assistant-tabs" aria-label="创作协作模式"><TabsTrigger value="candidates">创作候选</TabsTrigger><TabsTrigger value="mentor">文学导师</TabsTrigger></TabsList>
      <TabsContent value="candidates">
        <div className="candidate-head"><div><span className="eyebrow">Candidate desk</span><h2>接下来怎么写</h2><small>当前章：{activeChapter?.title ?? "未命名章节"}</small></div><StatusBadge kind={mode === "live" ? "success" : "demo"}>{mode === "live" ? "真实生成" : "演示模式"}</StatusBadge></div>
        <StoryDirectionChat
          composer={directionComposer}
          projectKey={state.activeProjectId}
          project={contextFromState(state)}
          messages={state.dialogueThreads}
          onAppend={appendDirectionMessage}
          onGenerateCandidates={(summary) => void generate("continue", "", undefined, summary)}
          onRecordRun={(run) => recordAiRun({ projectId: state.activeProjectId, task: "story-direction", mode: run.mode, request: run.request, result: run.result })}
        />
        {selectedText && <div className="selection-context"><strong>正文选区</strong><p>{selectedText}</p><div>{[["rewrite", "改写"], ["expand", "扩写"], ["condense", "精简"], ["sensory", "感官细节"]].map(([task, label]) => <Button key={task} variant="secondary" onClick={() => generate(task as GenerationTask, selectedText, selection ?? undefined)}>{label}</Button>)}</div></div>}
        <div className="ai-actions"><Button variant="secondary" onClick={() => generate("prose")} disabled={status === "loading"}>改写整段</Button><Button variant="ghost" onClick={() => setState((current) => ({ ...current, candidates: current.candidates.map((item) => item.status === "pending" && item.target.type === "chapter" && item.target.id === current.activeChapterId ? { ...item, status: "discarded" } : item) }))}>清空待选</Button></div>
        <AiProgress status={status} label="候选生成进度" />
        <div className="candidate-status" aria-live="polite">{status === "idle" && <p>AI 结果先进入候选，确认后才修改正文。</p>}{status === "success" && <strong><Check size={15} />生成完成</strong>}{status === "error" && <div role="alert" className="inline-error"><span>请求未完成，正文保持不变。</span>{lastRequest && <Button variant="ghost" onClick={() => generate(lastRequest.task, lastRequest.selectedText, lastRequest.selection, lastRequest.prompt, lastRequest)}>重试</Button>}</div>}</div>
        {warning && <p className="candidate-warning"><AlertTriangle size={14} />{warning}</p>}
        {notice && <p className="ai-notice" role="status">{notice}</p>}
        <div className="candidate-list">{pending.map((candidate) => {
          const stale = candidate.generatedRevision !== state.contextRevision;
          const report = state.consistencyReports.find((item) => item.candidateId === candidate.id && item.contextRevision === candidate.generatedRevision);
          const highRisk = report?.findings.some((finding) => finding.severity === "high") ?? false;
          const mediumRisk = report?.findings.some((finding) => finding.severity === "medium") ?? false;
          const checking = checkingIds.has(candidate.id);
          const checkFailed = checkFailures.has(candidate.id);
          const riskLabel = highRisk ? "审阅冲突" : mediumRisk ? "建议审阅" : "低风险提示";
          return <article key={candidate.id} className={`candidate-card ${stale ? "candidate-stale" : ""}`}>
            <div className="candidate-meta"><strong>{candidate.label}</strong><span>{candidate.mode === "live" ? "实时" : "演示"}</span></div>
            {stale && <div className="stale-note"><AlertTriangle size={13} />基于旧设定 <Button variant="ghost" onClick={() => generate("continue")}>按最新上下文重生成</Button></div>}
            {!stale && <div className={`consistency-status ${highRisk ? "consistency-high" : ""}`}>{checking ? "一致性检查中…" : checkFailed ? "检查失败" : report ? riskLabel : "等待一致性检查"}{!checking && !report && isChapterCandidate(candidate) && <Button variant="ghost" aria-label="重新检查一致性" onClick={() => void checkConsistency(candidate, state)}>重新检查</Button>}</div>}
            <p>{candidate.content}</p><small>{candidate.rationale}</small>
            {report && report.findings.length > 0 && <details className="consistency-details"><summary>查看 {report.findings.length} 条一致性证据</summary>{report.findings.map((finding) => <div key={finding.id}><strong>{finding.category} · {finding.severity}</strong><q>{finding.candidateQuote}</q><p>既有证据：{finding.priorEvidence}</p><p>{finding.suggestion}</p></div>)}</details>}
            <div className="candidate-buttons">
              <Button aria-label={highRisk ? "审阅候选冲突" : "采纳候选"} disabled={highRisk ? stale || checking || checkFailed || !report : readOnly || stale || checking || checkFailed || !report} onClick={() => highRisk ? setReviewing(candidate.id) : setSelected(candidate.id)}>{highRisk ? <AlertTriangle size={15} /> : <Check size={15} />}{highRisk ? "审阅冲突" : "采纳"}</Button>
              <Button variant="secondary" aria-label="编辑候选" disabled={stale || checking} onClick={() => { setEditing(candidate.id); setDraft(candidate.content); }}><Pencil size={15} />编辑</Button>
              <Button variant="ghost" aria-label="放弃候选" onClick={() => discard(candidate.id)}><Trash2 size={15} /></Button>
            </div>
          </article>;
        })}</div>
      </TabsContent>
      <TabsContent value="mentor">
        <div className="candidate-head"><div><span className="eyebrow">Literary mentor</span><h2>为什么这样写</h2></div><StatusBadge kind={mode === "live" ? "success" : "demo"}>{mode === "live" ? "真实分析" : "演示分析"}</StatusBadge></div>
        {selectedText && <blockquote className="mentor-selection">{selectedText}</blockquote>}
        <label className="field mentor-question"><span>向文学导师提问</span><textarea className="textarea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：这段为什么显得克制？人物行动是否与设定一致？" /></label>
        <Button onClick={() => askMentor()} disabled={status === "loading" || (!question.trim() && !selectedText)}><Send size={15} />请导师分析</Button>
        <AiProgress status={status} label="文学导师分析进度" />
        {warning && <p className="candidate-warning"><AlertTriangle size={14} />{warning}</p>}
        {notice && <p className="ai-notice" role="status">{notice}</p>}
        {mentor && <div className="mentor-result"><section><span>核心判断</span><h3>{mentor.thesis}</h3></section><section><span>原文证据</span>{mentor.evidence.map((item, index) => <article key={`${item.quote}-${index}`}><StatusBadge kind={item.source === "observation" ? "success" : item.source === "knowledge" ? "knowledge" : "demo"}>{sourceLabel(item.source)}</StatusBadge><q>{item.quote}</q>{item.note && <p>{item.note}</p>}</article>)}</section>{[["文学技法", mentor.craft], ["阅读效果", mentor.effect], ["一致性问题", mentor.consistency], ["修改实验", mentor.experiments], ["启发式追问", mentor.questions]].map(([label, items]) => <section key={label as string}><span>{label as string}</span><ul>{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul></section>)}{mentor.references.length > 0 && <section><span>知识库参考</span>{mentor.references.map((item) => <p key={item.title}><strong>{item.title}</strong>：{item.note}</p>)}</section>}</div>}
      </TabsContent>
    </Tabs>
    <details className="context-budget"><summary>上下文详情 <ChevronDown size={14} /></summary><div className="context-meter"><span style={{ width: `${Math.min(100, contextPacket.usedCharacters / contextPacket.maxCharacters * 100)}%` }} /></div><p>已用 {contextPacket.usedCharacters} / {contextPacket.maxCharacters} 字，剩余 {contextPacket.remainingCharacters} 字</p>{contextPacket.sections.map((section) => <div key={section.kind}><strong>{section.label}</strong><span>{section.usedCharacters} 字{section.trimmed ? " · 已裁剪" : ""}</span></div>)}</details>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} title="确认采纳" description="采纳后会写入目标章节，并创建一个新版本。"><div className="confirm-copy">{current?.content}</div><div className="dialog-actions"><Button variant="secondary" onClick={() => setSelected(null)}>返回候选</Button><Button disabled={readOnly} onClick={() => { if (selected && (onBeforeAccept?.(selected) ?? true)) accept(selected); setSelected(null); }}>确认采纳</Button></div></Dialog>
    <Dialog open={Boolean(reviewing)} onOpenChange={(open) => !open && setReviewing(null)} title="上下文冲突" description="高严重度冲突不能直接采纳。请编辑后重新检查，或让 AI 按证据修订。"><div className="consistency-review-list">{reviewingReport?.findings.map((finding) => <article key={finding.id}><StatusBadge kind={finding.severity === "high" ? "warning" : "demo"}>{finding.severity === "high" ? "高风险" : "需关注"}</StatusBadge><q>{finding.candidateQuote}</q><p>既有证据：{finding.priorEvidence}</p><strong>{finding.suggestion}</strong></article>)}</div><div className="dialog-actions"><Button variant="secondary" onClick={() => setReviewing(null)}>返回候选</Button><Button variant="secondary" aria-label="请 AI 按建议重写" onClick={reviseFromConflict}>请 AI 按建议重写</Button><Button onClick={() => { if (reviewingCandidate) { setEditing(reviewingCandidate.id); setDraft(reviewingCandidate.content); } setReviewing(null); }}>编辑并重新检查</Button></div></Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title="编辑候选" description="保存后会重新运行一致性检查，不会直接写入正文。"><label className="field"><span>候选文本</span><textarea className="textarea" value={draft} onChange={(event) => setDraft(event.target.value)} /></label><div className="dialog-actions"><Button variant="secondary" onClick={() => setEditing(null)}>取消</Button><Button onClick={saveEditedCandidate} disabled={!draft.trim()}>保存并重新检查</Button></div></Dialog>
  </aside>;
}
