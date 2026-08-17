"use client";

import { Clock3, PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useStory } from "@/providers/story-provider";
import { CandidatePanel } from "@/components/studio/candidate-panel";
import { ProseEditor } from "@/components/studio/prose-editor";
import { StoryNavigator } from "@/components/studio/story-navigator";
import { VersionDrawer } from "@/components/studio/version-drawer";

export function StudioWorkspace({ projectId }: { projectId?: string }) {
  const { state, setState, selectProject } = useStory();
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "failed">("saved");
  const [candidateOpen, setCandidateOpen] = useState(true);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [mobileCandidateOpen, setMobileCandidateOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const handleChange = (content: string) => {
    setSaveStatus("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setState((current) => ({ ...current, chapters: [{ ...current.chapters[0], content, wordCount: content.replace(/\s/g, "").length }, ...current.chapters.slice(1)] }));
      setSaveStatus("saved");
    }, 800);
  };
  useEffect(() => { if (projectId) selectProject(projectId); }, [projectId, selectProject]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);
  const content = state.chapters[0].content;
  return <div className={`studio ${candidateOpen ? "" : "studio-focus"}`}><StoryNavigator /><section className="writing-area"><header className="writing-head"><div><span className="eyebrow">第一章</span><h1>潮声</h1></div><div className="writing-actions"><span className={`save-state save-${saveStatus}`}>{saveStatus === "saving" ? "保存中…" : saveStatus === "failed" ? "保存失败" : "已保存"}</span><Button variant="secondary" onClick={() => setVersionsOpen(true)}><Clock3 size={16} />版本 {state.versions.at(-1)?.versionNo}</Button><Tooltip label={candidateOpen ? "关闭候选区" : "打开候选区"}><Button variant="icon" className="desktop-candidate-toggle" aria-label={candidateOpen ? "关闭候选区" : "打开候选区"} onClick={() => setCandidateOpen((value) => !value)}>{candidateOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</Button></Tooltip><Tooltip label={mobileCandidateOpen ? "关闭候选区" : "打开候选区"}><Button variant="icon" className="mobile-candidate-toggle" aria-label={mobileCandidateOpen ? "关闭候选区" : "打开候选区"} onClick={() => setMobileCandidateOpen((value) => !value)}><Sparkles size={18} /></Button></Tooltip></div></header><div className="writing-scroll"><ProseEditor content={content} onChange={handleChange} /><footer className="word-count">{content.replace(/\s/g, "").length} 字 · 预计阅读 3 分钟</footer></div></section>{candidateOpen && <CandidatePanel className={mobileCandidateOpen ? "mobile-candidate-open" : ""} />}<VersionDrawer open={versionsOpen} onOpenChange={setVersionsOpen} /></div>;
}
