"use client";

import { Clock3, Download, FileText, FolderOpen, Images, PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { CandidatePanel, type AssistantRequest } from "@/components/studio/candidate-panel";
import { EntityEditor } from "@/components/studio/entity-editor";
import { ProseEditor, type ProseSelection } from "@/components/studio/prose-editor";
import { StoryNavigator, type StudioSelection } from "@/components/studio/story-navigator";
import { VersionDrawer } from "@/components/studio/version-drawer";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { serializeStory } from "@/lib/export-story";
import type { AiTask } from "@/lib/ai/tasks";
import { createPendingSaveCoordinator } from "@/lib/pending-save";
import { updateStoryItem } from "@/lib/story-state";
import { isDefenseProjectId } from "@/lib/demo-mode";
import { useStory } from "@/providers/story-provider";

export function StudioWorkspace({ projectId }: { projectId?: string }) {
  const { state, setState, selectProject } = useStory();
  const [selection, setSelection] = useState<StudioSelection>({ type: "chapter", id: state.activeChapterId });
  const [proseSelection, setProseSelection] = useState<ProseSelection | null>(null);
  const [assistantRequest, setAssistantRequest] = useState<AssistantRequest | null>(null);
  const [assistantTab, setAssistantTab] = useState<"candidates" | "mentor">("candidates");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "failed">("saved");
  const [candidateOpen, setCandidateOpen] = useState(true);
  const [binderOpen, setBinderOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [mobileCandidateOpen, setMobileCandidateOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [binderShare, setBinderShare] = useState(18);
  const [writingShare, setWritingShare] = useState(62);
  const [activeSplitter, setActiveSplitter] = useState<"binder" | "writing" | null>(null);
  const studioRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [saveCoordinator] = useState(() => createPendingSaveCoordinator(500));
  useEffect(() => { if (projectId) selectProject(projectId); }, [projectId, selectProject]);
  useEffect(() => () => saveCoordinator.dispose(), [saveCoordinator]);
  useEffect(() => () => saveCoordinator.flushProject(state.activeProjectId), [saveCoordinator, state.activeProjectId]);

  const chapter = state.chapters.find((item) => item.id === state.activeChapterId) ?? state.chapters[0];
  const readOnly = isDefenseProjectId(state.activeProjectId);
  const structureReadOnly = isDefenseProjectId(state.activeProjectId);
  const selectionExists = selection.type === "chapter" ? state.chapters.some((item) => item.id === selection.id) : selection.type === "character" ? state.characters.some((item) => item.id === selection.id) : selection.type === "world" ? state.worldEntries.some((item) => item.id === selection.id) : state.blueprint.some((item) => item.id === selection.id);
  const activeSelection: StudioSelection = selectionExists ? selection : { type: "chapter", id: state.activeChapterId };
  const handleChange = (content: string) => {
    const targetId = chapter.id;
    setSaveStatus("saving");
    saveCoordinator.schedule({ projectId: state.activeProjectId, chapterId: targetId, content }, (draft) => {
      setState((current) => current.chapters.find((item) => item.id === draft.chapterId)?.content === draft.content
        ? current
        : updateStoryItem(current, "chapters", draft.chapterId, { content: draft.content, wordCount: draft.content.replace(/\s/g, "").length }));
      setSaveStatus("saved");
    });
  };
  const prepareCandidateAcceptance = () => {
    const decision = saveCoordinator.resolveBeforeAccept(
      { projectId: state.activeProjectId, chapterId: state.activeChapterId },
      (draft) => state.chapters.find((item) => item.id === draft.chapterId)?.content,
    );
    if (decision.kind === "accept") {
      setSaveStatus("saved");
      return true;
    }
    setState((current) => {
      const invalidCandidateIds = new Set(current.candidates.filter((candidate) => candidate.target.type === "chapter" && candidate.target.id === decision.draft.chapterId).map((candidate) => candidate.id));
      const saved = updateStoryItem(current, "chapters", decision.draft.chapterId, {
        content: decision.draft.content,
        wordCount: decision.draft.content.replace(/\s/g, "").length,
      });
      return { ...saved, consistencyReports: saved.consistencyReports.filter((report) => !invalidCandidateIds.has(report.candidateId)) };
    });
    setSaveStatus("saved");
    return false;
  };
  const requestAi = (task: Extract<AiTask, "rewrite" | "expand" | "condense" | "sensory" | "mentor">, selected: ProseSelection) => {
    setAssistantTab(task === "mentor" ? "mentor" : "candidates");
    setCandidateOpen(true); setMobileCandidateOpen(true);
    setAssistantRequest({ id: Date.now(), task, selectedText: selected.text, selection: selected });
  };
  const setShareFromClientX = useCallback((kind: "binder" | "writing", clientX: number) => {
    const bounds = (kind === "binder" ? studioRef.current : splitRef.current)?.getBoundingClientRect();
    if (!bounds) return;
    const next = ((clientX - bounds.left) / bounds.width) * 100;
    if (kind === "binder") setBinderShare(Math.round(Math.min(30, Math.max(14, next))));
    else setWritingShare(Math.round(Math.min(72, Math.max(42, next))));
  }, []);
  useEffect(() => {
    if (!activeSplitter) return;
    const onPointerMove = (event: globalThis.PointerEvent) => setShareFromClientX(activeSplitter, event.clientX);
    const onPointerUp = () => setActiveSplitter(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeSplitter, setShareFromClientX]);
  const onSplitKeyDown = (kind: "binder" | "writing", event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 5 : 2;
    const [minimum, maximum] = kind === "binder" ? [14, 30] : [42, 72];
    const setValue = kind === "binder" ? setBinderShare : setWritingShare;
    if (event.key === "ArrowLeft") setValue((value) => Math.max(minimum, value - step));
    if (event.key === "ArrowRight") setValue((value) => Math.min(maximum, value + step));
    if (event.key === "Home") setValue(minimum);
    if (event.key === "End") setValue(maximum);
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) event.preventDefault();
  };
  const beginResize = (kind: "binder" | "writing", event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setActiveSplitter(kind);
  };
  const download = (format: "markdown" | "text") => {
    const blob = new Blob([serializeStory(state, format)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.projects.find((project) => project.id === state.activeProjectId)?.title ?? "故事熔炉作品"}.${format === "markdown" ? "md" : "txt"}`;
    link.click(); URL.revokeObjectURL(url);
  };
  const selectedTitle = activeSelection.type === "chapter" ? chapter.title : activeSelection.type === "character" ? state.characters.find((item) => item.id === activeSelection.id)?.name : activeSelection.type === "world" ? state.worldEntries.find((item) => item.id === activeSelection.id)?.label : state.blueprint.find((item) => item.id === activeSelection.id)?.title;

  return <div ref={studioRef} className={`studio ${candidateOpen ? "" : "studio-focus"} ${focusMode ? "studio-writing-focus" : ""} ${binderOpen ? "studio-binder-open" : ""}`} style={{ "--studio-binder-share": `${binderShare}fr`, "--studio-content-share": `${100 - binderShare}fr` } as CSSProperties}>
    {!focusMode && <StoryNavigator selection={activeSelection} onSelect={(next) => { setSelection(next); setBinderOpen(false); }} readOnly={structureReadOnly} />}
    {!focusMode && <div className={`studio-splitter studio-splitter-binder ${activeSplitter === "binder" ? "is-resizing" : ""}`} role="separator" aria-label="调整档案夹与编辑区宽度" aria-orientation="vertical" aria-valuemin={14} aria-valuemax={30} aria-valuenow={binderShare} aria-valuetext={`${binderShare}% 档案夹，${100 - binderShare}% 编辑工作区`} tabIndex={0} onKeyDown={(event) => onSplitKeyDown("binder", event)} onPointerDown={(event) => beginResize("binder", event)} />}
    <div ref={splitRef} className={`studio-main-split ${candidateOpen && !focusMode ? "" : "studio-main-split-focus"}`} style={{ "--studio-writing-share": `${writingShare}fr`, "--studio-candidate-share": `${100 - writingShare}fr` } as CSSProperties}>
    <section className="writing-area">
      <header className="writing-head"><div><span className="eyebrow">{activeSelection.type === "chapter" ? "当前章节" : activeSelection.type === "character" ? "人物档案" : activeSelection.type === "world" ? "世界设定" : "故事蓝图"}</span><h1>{selectedTitle || "未命名"}</h1></div><div className="writing-actions">
        <span className={`save-state save-${saveStatus}`}>{saveStatus === "saving" ? "保存中…" : saveStatus === "failed" ? "保存失败" : "已保存"}</span>
        <Button variant="secondary" className="binder-mobile-toggle" onClick={() => setBinderOpen((value) => !value)}><FolderOpen size={16} />档案</Button>
        <Button variant="secondary" onClick={() => download("markdown")}><Download size={16} />Markdown</Button><Button variant="secondary" onClick={() => download("text")}><FileText size={16} />TXT</Button>
        <Link href={`/project/${state.activeProjectId}/ip-lab`} className="button button-secondary"><Images size={16} />IP 实验场</Link>
        <Button variant="secondary" onClick={() => setVersionsOpen(true)}><Clock3 size={16} />版本 {state.versions.at(-1)?.versionNo ?? 0}</Button>
        {!focusMode && <Tooltip label={candidateOpen ? "关闭协作区" : "打开协作区"}><Button variant="icon" className="desktop-candidate-toggle" aria-label={candidateOpen ? "关闭协作区" : "打开协作区"} onClick={() => setCandidateOpen((value) => !value)}>{candidateOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</Button></Tooltip>}
        <Tooltip label={mobileCandidateOpen ? "关闭协作区" : "打开协作区"}><Button variant="icon" className="mobile-candidate-toggle" aria-label={mobileCandidateOpen ? "关闭协作区" : "打开协作区"} onClick={() => setMobileCandidateOpen((value) => !value)}><Sparkles size={18} /></Button></Tooltip>
      </div></header>
      <div className="writing-scroll">{activeSelection.type === "chapter" ? <>
        <div className="chapter-fields"><label className="field"><span>章节标题</span><input className="input" value={chapter.title} readOnly={readOnly} onChange={(event) => setState((current) => updateStoryItem(current, "chapters", chapter.id, { title: event.target.value }))} /></label><label className="field"><span>章节摘要（用于 AI 上下文）</span><input className="input" value={chapter.summary} readOnly={readOnly} onChange={(event) => setState((current) => updateStoryItem(current, "chapters", chapter.id, { summary: event.target.value }))} /></label></div>
        <ProseEditor content={chapter.content} onChange={handleChange} onSelectionChange={setProseSelection} onAiAction={requestAi} onFocusModeChange={setFocusMode} readOnly={readOnly} />
        <footer className="word-count">{chapter.content.replace(/\s/g, "").length} 字 · 当前上下文 revision {state.contextRevision}</footer>
      </> : <EntityEditor selection={activeSelection} readOnly={readOnly} />}</div>
    </section>
    {candidateOpen && !focusMode && <div className={`studio-splitter studio-splitter-writing ${activeSplitter === "writing" ? "is-resizing" : ""}`} role="separator" aria-label="调整编辑区与候选面板宽度" aria-orientation="vertical" aria-valuemin={42} aria-valuemax={72} aria-valuenow={writingShare} aria-valuetext={`${writingShare}% 编辑区，${100 - writingShare}% 候选面板`} tabIndex={0} onKeyDown={(event) => onSplitKeyDown("writing", event)} onPointerDown={(event) => beginResize("writing", event)} />}
    {candidateOpen && !focusMode && <CandidatePanel key={state.activeProjectId} className={mobileCandidateOpen ? "mobile-candidate-open" : ""} selectedText={proseSelection?.text ?? ""} selection={proseSelection} request={assistantRequest} onRequestHandled={() => setAssistantRequest(null)} tab={assistantTab} onTabChange={setAssistantTab} onBeforeAccept={prepareCandidateAcceptance} readOnly={readOnly} />}
    </div>
    <VersionDrawer open={versionsOpen} onOpenChange={setVersionsOpen} readOnly={readOnly} />
  </div>;
}
