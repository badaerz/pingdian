"use client";

import { fetchAi } from "@/lib/ai/client";

import { Globe2, RefreshCw, Route, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AiProgress, type AiProgressStatus } from "@/components/ui/ai-progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { contextFromState } from "@/lib/ai/story-context";
import type { AiTaskPayload } from "@/lib/ai/tasks";
import type { Candidate, Character } from "@/lib/types";
import { useStory } from "@/providers/story-provider";
import { aiRequestHeaders } from "@/lib/ai/user-key";

type SetupTab = "ideas" | "characters" | "world" | "blueprint";

const tabs: Array<{ id: SetupTab; label: string; icon: typeof Sparkles }> = [
  { id: "ideas", label: "灵感", icon: Sparkles },
  { id: "characters", label: "人物", icon: Users },
  { id: "world", label: "世界观", icon: Globe2 },
  { id: "blueprint", label: "蓝图", icon: Route },
];

const taskLabels: Record<SetupTab, string> = {
  ideas: "故事方向生成进度",
  characters: "人物卡生成进度",
  world: "世界观生成进度",
  blueprint: "故事蓝图生成进度",
};

export function SetupPanel() {
  const { state, setState, recordAiRun } = useStory();
  const [tab, setTab] = useState<SetupTab>("ideas");
  const [loading, setLoading] = useState<SetupTab | null>(null);
  const [progressStatus, setProgressStatus] = useState<AiProgressStatus>("idle");
  const [progressTask, setProgressTask] = useState<SetupTab>("ideas");
  const [mode, setMode] = useState<"live" | "demo" | null>(null);
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [ideaCandidates, setIdeaCandidates] = useState<Candidate[]>([]);
  const project = useMemo(() => state.projects.find((item) => item.id === state.activeProjectId) ?? state.projects[0], [state.activeProjectId, state.projects]);

  const requestTask = async (task: SetupTab) => {
    if (loading) return;
    setLoading(task);
    setProgressTask(task);
    setProgressStatus("loading");
    setWarning(""); setNotice("");
    try {
      const response = await fetchAi(taskLabels[task], {
        method: "POST",
        headers: aiRequestHeaders(),
        body: JSON.stringify({ task, project: contextFromState(state), input: { prompt: task === "characters" ? "基于当前作品灵感、世界观和蓝图补全人物卡，保留已有事实。" : task === "world" ? "基于当前作品灵感、人物目标和蓝图补全世界观，保留已有规则与时间限制。" : task === "blueprint" ? "基于当前作品灵感、人物和世界观组织故事蓝图。" : "基于当前作品设定提出具体故事方向。" } }),
      });
      const data = await response.json() as { mode?: "live" | "demo"; result?: AiTaskPayload; warnings?: string[]; notices?: string[] };
      if (!response.ok || !data.result) throw new Error("AI_TASK_FAILED");
      const taskResult = data.result;
      recordAiRun({ projectId: state.activeProjectId, task, mode: data.mode ?? "demo", request: { task, project: contextFromState(state) }, result: taskResult });
      setMode(data.mode ?? "demo");
      setWarning(data.warnings?.join(" ") ?? "");
      setNotice(data.notices?.join(" ") ?? "");
      if ("candidates" in taskResult) setIdeaCandidates(taskResult.candidates);
      if ("characters" in taskResult) setState((current) => ({ ...current, characters: taskResult.characters }));
      if ("worldEntries" in taskResult) setState((current) => ({ ...current, worldEntries: taskResult.worldEntries, contextRevision: current.contextRevision + 1 }));
      if ("blueprint" in taskResult) setState((current) => ({ ...current, blueprint: taskResult.blueprint }));
      setProgressStatus("success");
    } catch {
      setProgressStatus("error");
      setWarning("生成暂时不可用，请检查网络后重试。");
    } finally {
      setLoading(null);
    }
  };

  const updateProject = (logline: string) => setState((current) => ({
    ...current,
    projects: current.projects.map((item) => item.id === current.activeProjectId ? { ...item, logline, updatedAt: "刚刚" } : item),
  }));
  const updateCharacter = (index: number, field: keyof Character, value: string) => setState((current) => {
    const characters = current.characters.length ? current.characters : [{ id: "character-draft", name: "", role: "", desire: "", flaw: "", arc: "", fear: "", notes: "", locked: false, order: 0 }];
    return { ...current, characters: characters.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) };
  });

  return (
    <section className="setup-panel" aria-label="创作设定">
      <div className="setup-head">
        <div><span className="eyebrow">故事底座</span><h2>创作设定</h2></div>
        {mode && <StatusBadge kind={mode === "live" ? "success" : "demo"}>{mode === "live" ? "真实生成" : "离线演示"}</StatusBadge>}
      </div>
      <div className="setup-tabs" role="tablist" aria-label="创作设定模块">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={15} />{label}</button>)}
      </div>
      <AiProgress status={progressStatus} label={taskLabels[progressTask]} />

      {tab === "ideas" && <div className="setup-content">
        <label className="field"><span>一句话灵感</span><textarea className="textarea" value={project?.logline ?? ""} onChange={(event) => updateProject(event.target.value)} placeholder="一个人物，在什么处境下，必须做出怎样的选择？" /></label>
        <div className="setup-actions"><Button onClick={() => requestTask("ideas")} disabled={loading === "ideas"}><Sparkles size={16} />{loading === "ideas" ? "正在生成…" : "生成故事方向"}</Button><span>方向只会更新灵感，不会改动正文。</span></div>
        {ideaCandidates.length > 0 && <div className="idea-candidate-list">{ideaCandidates.map((candidate) => <article key={candidate.id}><strong>{candidate.label}</strong><p>{candidate.content}</p><small>{candidate.rationale}</small><Button variant="secondary" onClick={() => updateProject(candidate.content)}>采用方向</Button></article>)}</div>}
      </div>}

      {tab === "characters" && <div className="setup-content">
        <div className="setup-actions"><Button onClick={() => requestTask("characters")} disabled={loading === "characters"}><Users size={16} />{loading === "characters" ? "正在生成…" : "生成人物卡"}</Button><span>人物会成为续写和分析的共同上下文。</span></div>
        <div className="character-editor">{(state.characters.length ? state.characters : [{ id: "character-draft", name: "", role: "", desire: "", flaw: "", arc: "", fear: "", notes: "", locked: false, order: 0 }]).map((character, index) => <article key={character.id}><label className="field"><span>姓名</span><input className="input" value={character.name} onChange={(event) => updateCharacter(index, "name", event.target.value)} /></label><label className="field"><span>身份</span><input className="input" value={character.role} onChange={(event) => updateCharacter(index, "role", event.target.value)} /></label><label className="field"><span>欲望</span><input className="input" value={character.desire} onChange={(event) => updateCharacter(index, "desire", event.target.value)} /></label><label className="field"><span>缺陷</span><input className="input" value={character.flaw} onChange={(event) => updateCharacter(index, "flaw", event.target.value)} /></label></article>)}</div>
      </div>}

      {tab === "world" && <div className="setup-content">
        <div className="setup-actions"><Button onClick={() => requestTask("world")} disabled={loading === "world"}><Globe2 size={16} />{loading === "world" ? "正在生成…" : "生成世界观"}</Button><span>设定字段可随时编辑并即时保存。</span></div>
        <div className="world-editor">{state.worldEntries.map((entry) => <label className="field" key={entry.id}><span>{entry.label}</span><input className="input" value={entry.content} onChange={(event) => setState((current) => ({ ...current, contextRevision: current.contextRevision + 1, worldEntries: current.worldEntries.map((item) => item.id === entry.id ? { ...item, content: event.target.value } : item) }))} /></label>)}</div>
      </div>}

      {tab === "blueprint" && <div className="setup-content">
        <div className="setup-actions"><Button onClick={() => requestTask("blueprint")} disabled={loading === "blueprint"}><Route size={16} />{loading === "blueprint" ? "正在生成…" : "生成故事蓝图"}</Button><span>蓝图可编辑，生成不会直接改正文。</span></div>
        <ol className="blueprint-editor">{state.blueprint.map((node, index) => <li key={node.id}><span>{index + 1}</span><label className="field"><input className="input" value={node.title} aria-label={`蓝图节点 ${index + 1} 标题`} onChange={(event) => setState((current) => ({ ...current, blueprint: current.blueprint.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) }))} /><textarea className="textarea" value={node.summary} aria-label={`蓝图节点 ${index + 1} 概述`} onChange={(event) => setState((current) => ({ ...current, blueprint: current.blueprint.map((item, itemIndex) => itemIndex === index ? { ...item, summary: event.target.value } : item) }))} /></label></li>)}</ol>
      </div>}

      {warning && <div className="setup-warning" role="status"><RefreshCw size={15} />{warning}</div>}
      {notice && <div className="ai-notice" role="status">{notice}</div>}
    </section>
  );
}
