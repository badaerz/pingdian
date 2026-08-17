"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useStory } from "@/providers/story-provider";

export function NewProjectForm() {
  const router = useRouter(); const { createProject } = useStory(); const [title, setTitle] = useState(""); const [genre, setGenre] = useState("纯文学短篇"); const [topic, setTopic] = useState("记忆与离别"); const [logline, setLogline] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!title.trim() || !logline.trim()) { setError("请填写作品名称和一句话灵感。"); return; } setLoading(true); window.setTimeout(() => { const id = createProject({ title: title.trim(), genre, logline: logline.trim() }); router.push(`/project/${id}/studio`); }, 450); };
  return <div className="new-project-page"><div className="new-project-aside"><Link href="/" className="back-link"><ArrowLeft size={16} />返回项目桌面</Link><div><span className="eyebrow">新作品</span><h1>把一个念头<br />放进熔炉</h1><p>项目建立后会同时生成空章节、人物集、世界观与五段式蓝图容器。</p></div><StatusBadge>本地演示</StatusBadge></div><form className="new-project-form" onSubmit={submit}><div className="form-head"><h2>作品底稿</h2><p>这些字段会成为后续创作与分析的共同上下文。</p></div><label className="field"><span>作品名称</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：雾港来信" /></label><div className="form-grid"><label className="field"><span>体裁</span><select className="select" value={genre} onChange={(event) => setGenre(event.target.value)}><option>纯文学短篇</option><option>成长小说</option><option>悬疑中篇</option><option>现实主义长篇</option></select></label><label className="field"><span>题材</span><select className="select" value={topic} onChange={(event) => setTopic(event.target.value)}><option>记忆与离别</option><option>家庭与代际</option><option>城市与漂泊</option><option>身份与选择</option></select></label></div><label className="field"><span>一句话灵感</span><textarea className="textarea" value={logline} onChange={(event) => setLogline(event.target.value)} placeholder="一个人物，在什么处境下，必须做出怎样的选择？" /></label><div className="idea-presets"><span>灵感片段</span>{["一封迟到二十年的信", "不存在的第七码头", "最后一班夜渡船"].map((text) => <button type="button" key={text} onClick={() => setLogline(`${text}迫使主人公重新面对一次被掩埋的选择。`)}>{text}</button>)}</div>{error && <p role="alert" className="form-error">{error}</p>}<div className="form-submit"><span>创建后进入创作台</span><Button type="submit" disabled={loading}><Sparkles size={16} />{loading ? "正在建立…" : "建立作品"}</Button></div></form></div>;
}
