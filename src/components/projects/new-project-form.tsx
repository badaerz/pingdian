"use client";

import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiProgress, type AiProgressStatus } from "@/components/ui/ai-progress";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AiTask, AiTaskPayload, StoryContext } from "@/lib/ai/tasks";
import type { BlueprintNode, Candidate, Character, WorldEntry } from "@/lib/types";
import { useStory } from "@/providers/story-provider";

type Pending =
  | { kind: "ideas" | "opening"; candidates: Candidate[] }
  | { kind: "setting"; characters: Character[]; worldEntries: WorldEntry[] }
  | { kind: "blueprint"; blueprint: BlueprintNode[] };

const defaultBlueprint: BlueprintNode[] = ["开端", "冲突", "发展", "转折", "结局"].map((title, order) => ({ id: `wizard-blueprint-${order + 1}`, title, beatType: title, summary: "", active: order === 0, locked: false, order }));
const defaultWorld: WorldEntry[] = [
  { id: "wizard-world-era", category: "时代", label: "故事时代", content: "", locked: false, order: 0 },
  { id: "wizard-world-place", category: "地点", label: "核心地点", content: "", locked: false, order: 1 },
  { id: "wizard-world-rules", category: "规则", label: "核心规则", content: "", locked: false, order: 2 },
];
const defaultCharacter: Character = { id: "wizard-character-1", name: "", role: "主角", desire: "", flaw: "", arc: "", fear: "", notes: "", locked: false, order: 0 };

export function NewProjectForm() {
  const router = useRouter();
  const { createProject } = useStory();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("纯文学短篇");
  const [logline, setLogline] = useState("");
  const [character, setCharacter] = useState(defaultCharacter);
  const [worldEntries, setWorldEntries] = useState(defaultWorld);
  const [blueprint, setBlueprint] = useState(defaultBlueprint);
  const [opening, setOpening] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState<AiProgressStatus>("idle");
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const context = (): StoryContext => ({
    title: title || "未命名作品", genre, logline, activeChapterId: "wizard-chapter-1", contextRevision: step,
    chapters: [{ id: "wizard-chapter-1", title: "第一章", content: opening, wordCount: opening.replace(/\s/g, "").length, summary: blueprint[0]?.summary ?? "", order: 0 }],
    characters: character.name ? [character] : [], worldEntries, blueprint,
  });
  const call = async (task: AiTask) => {
    const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, project: context() }) });
    const data = await response.json() as { result?: AiTaskPayload; warnings?: string[]; notices?: string[] };
    if (!response.ok || !data.result) throw new Error("AI_TASK_FAILED");
    if (data.warnings?.length) setWarning(data.warnings.join(" "));
    if (data.notices?.length) setNotice(data.notices.join(" "));
    return data.result;
  };
  const generate = async () => {
    setStatus("loading"); setWarning(""); setNotice(""); setPending(null);
    try {
      if (step === 1) {
        const result = await call("ideas");
        if (!("candidates" in result)) throw new Error("INVALID_RESULT");
        setPending({ kind: "ideas", candidates: result.candidates });
      } else if (step === 2) {
        const [people, world] = await Promise.all([call("characters"), call("world")]);
        if (!("characters" in people) || !("worldEntries" in world)) throw new Error("INVALID_RESULT");
        setPending({ kind: "setting", characters: people.characters, worldEntries: world.worldEntries });
      } else if (step === 3) {
        const result = await call("blueprint");
        if (!("blueprint" in result)) throw new Error("INVALID_RESULT");
        setPending({ kind: "blueprint", blueprint: result.blueprint });
      } else {
        const result = await call("opening");
        if (!("candidates" in result)) throw new Error("INVALID_RESULT");
        setPending({ kind: "opening", candidates: result.candidates });
      }
      setStatus("success");
    } catch { setStatus("error"); setWarning("AI 暂时不可用，可继续手动完成这一步。"); }
  };
  const next = () => {
    setError(""); setPending(null); setStatus("idle");
    if (step === 1 && (!title.trim() || !logline.trim())) { setError("请先填写作品名称和一句话灵感。"); return; }
    setStep((current) => Math.min(4, current + 1));
  };
  const finish = () => {
    if (!opening.trim()) { setError("请写下或采用一个首段候选。"); return; }
    const id = createProject({ title: title.trim(), genre, logline: logline.trim() }, {
      workflowStage: "complete", contextRevision: 4,
      chapters: [{ id: "chapter-1", title: blueprint[0]?.title || "第一章", content: opening.trim(), wordCount: opening.trim().replace(/\s/g, "").length, summary: blueprint[0]?.summary ?? "", order: 0 }],
      characters: character.name.trim() ? [{ ...character, name: character.name.trim() }] : [], worldEntries, blueprint,
    });
    router.push(`/project/${id}/studio`);
  };
  const updateWorld = (index: number, content: string) => setWorldEntries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, content } : item));
  const stepTitle = ["体裁与灵感", "人物与世界", "故事蓝图", "写出首段"][step - 1];

  return <div className="new-project-page wizard-page">
    <aside className="new-project-aside wizard-aside"><Image className="new-project-visual" src="/visuals/new-project-spark.png" alt="故事熔炉中的叙事线索" fill priority sizes="(max-width: 700px) 100vw, 34vw" /><Link href="/projects" className="back-link"><ArrowLeft size={16} />返回项目桌面</Link><div><span className="eyebrow">故事熔炉 / New Story</span><h1>三分钟，<br />写出可确认的首段</h1><p>你可以手工完成每一步，也可以让 AI 提供候选。正式设定始终由你确认。</p></div><StatusBadge>本地优先 · 人工确认</StatusBadge></aside>
    <main className="wizard-main"><header className="wizard-progress"><div><span>{step} / 4</span><h2>{stepTitle}</h2></div><ol>{[1, 2, 3, 4].map((item) => <li key={item} className={item <= step ? "active" : ""}><i>{item < step ? <Check size={12} /> : item}</i><span>{["灵感", "设定", "蓝图", "首段"][item - 1]}</span></li>)}</ol></header>
      <section className="wizard-stage">
        {step === 1 && <div className="wizard-fields"><label className="field"><span>作品名称</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：潮汐日记" /></label><label className="field"><span>体裁</span><select className="select" value={genre} onChange={(event) => setGenre(event.target.value)}><option>纯文学短篇</option><option>成长小说</option><option>悬疑中篇</option><option>现实主义长篇</option><option>科幻小说</option></select></label><label className="field wizard-span"><span>一句话灵感</span><textarea className="textarea" value={logline} onChange={(event) => setLogline(event.target.value)} placeholder="一个人物，在什么处境下，必须做出怎样的选择？" /></label></div>}
        {step === 2 && <div className="wizard-fields"><label className="field"><span>主角姓名</span><input className="input" value={character.name} onChange={(event) => setCharacter((item) => ({ ...item, name: event.target.value }))} /></label><label className="field"><span>人物身份</span><input className="input" value={character.role} onChange={(event) => setCharacter((item) => ({ ...item, role: event.target.value }))} /></label><label className="field"><span>核心欲望</span><textarea className="textarea" value={character.desire} onChange={(event) => setCharacter((item) => ({ ...item, desire: event.target.value }))} /></label><label className="field"><span>核心恐惧</span><textarea className="textarea" value={character.fear} onChange={(event) => setCharacter((item) => ({ ...item, fear: event.target.value }))} /></label>{worldEntries.map((entry, index) => <label className="field" key={entry.id}><span>{entry.label}</span><input className="input" value={entry.content} onChange={(event) => updateWorld(index, event.target.value)} /></label>)}</div>}
        {step === 3 && <ol className="wizard-blueprint">{blueprint.map((node, index) => <li key={node.id}><span>{String(index + 1).padStart(2, "0")}</span><div><input className="input" aria-label={`蓝图节点 ${index + 1} 标题`} value={node.title} onChange={(event) => setBlueprint((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} /><textarea className="textarea" aria-label={`蓝图节点 ${index + 1} 摘要`} value={node.summary} onChange={(event) => setBlueprint((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, summary: event.target.value } : item))} placeholder="这一阶段发生什么变化？" /></div></li>)}</ol>}
        {step === 4 && <div className="wizard-opening"><div><span className="eyebrow">首段目标</span><h3>让人物在具体场景里做出第一个动作</h3><p>{logline}</p></div><label className="field"><span>作品首段</span><textarea className="textarea" value={opening} onChange={(event) => setOpening(event.target.value)} placeholder="从一个具体的声音、动作、物件或矛盾开始……" /></label></div>}
        <div className="wizard-ai"><Button variant="secondary" onClick={generate} disabled={status === "loading"}><Sparkles size={16} />{step === 1 ? "AI 生成故事方向" : step === 2 ? "AI 生成人物与世界" : step === 3 ? "AI 生成故事蓝图" : "AI 生成首段候选"}</Button><span>候选不会自动写入</span></div><AiProgress status={status} label={`${stepTitle} AI 生成进度`} />
        {warning && <p className="wizard-warning" role="status">{warning}</p>}
        {notice && <p className="ai-notice" role="status">{notice}</p>}
        {pending?.kind === "ideas" && <div className="wizard-candidates">{pending.candidates.map((candidate) => <article key={candidate.id}><strong>{candidate.label}</strong><p>{candidate.content}</p><small>{candidate.rationale}</small><Button variant="secondary" aria-label={`采用${candidate.label}`} onClick={() => setLogline(candidate.content)}>采用此方向</Button></article>)}</div>}
        {pending?.kind === "opening" && <div className="wizard-candidates">{pending.candidates.map((candidate) => <article key={candidate.id}><strong>{candidate.label}</strong><p>{candidate.content}</p><small>{candidate.rationale}</small><Button variant="secondary" aria-label={`采用${candidate.label}`} onClick={() => setOpening(candidate.content)}>采用此首段</Button></article>)}</div>}
        {pending?.kind === "setting" && <div className="wizard-preview"><strong>人物与世界候选</strong><p>{pending.characters.map((item) => `${item.name}｜${item.role}`).join("；")}</p><p>{pending.worldEntries.map((item) => `${item.label}：${item.content}`).join("；")}</p><Button variant="secondary" onClick={() => { setCharacter(pending.characters[0] ?? character); setWorldEntries(pending.worldEntries); }}>采用这组设定</Button></div>}
        {pending?.kind === "blueprint" && <div className="wizard-preview"><strong>蓝图候选</strong><p>{pending.blueprint.map((item) => item.title).join(" → ")}</p><Button variant="secondary" onClick={() => setBlueprint(pending.blueprint)}>采用这份蓝图</Button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
      <footer className="wizard-footer">{step > 1 ? <Button variant="ghost" onClick={() => { setStep((current) => current - 1); setPending(null); setStatus("idle"); }}><ArrowLeft size={16} />上一步</Button> : <span />}{step < 4 ? <Button onClick={next}>下一步：{["人物与世界", "故事蓝图", "写出首段"][step - 1]}<ArrowRight size={16} /></Button> : <Button onClick={finish}>完成并进入创作台<ArrowRight size={16} /></Button>}</footer>
    </main>
  </div>;
}
