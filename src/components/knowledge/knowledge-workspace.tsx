"use client";

import { BookMarked, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { CharacterGraph } from "@/components/analysis/character-graph";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { initialStoryState } from "@/data/mock-data";
import { filterKnowledge } from "@/lib/story-state";

export function KnowledgeWorkspace() {
  const [era, setEra] = useState(""); const [theme, setTheme] = useState(""); const [technique, setTechnique] = useState(""); const [selected, setSelected] = useState("w-lu");
  const graph = useMemo(() => filterKnowledge(initialStoryState.knowledge, { era, theme, technique }), [era, theme, technique]); const node = initialStoryState.knowledge.nodes.find((item) => item.id === selected); const reset = () => { setEra(""); setTheme(""); setTechnique(""); };
  return <div className="page knowledge-page"><header className="page-head"><div><h1 className="page-title">文学知识图谱</h1><p className="page-subtitle">从作品、作者、主题和技法之间的明确关系进入阅读。</p></div><StatusBadge kind="knowledge">精选知识</StatusBadge></header><div className="knowledge-filters"><label><span>时代</span><select value={era} onChange={(event) => setEra(event.target.value)}><option value="">全部</option><option>现代</option><option>当代</option></select></label><label><span>主题</span><select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="">全部</option><option>孤独</option><option>等待</option></select></label><label><span>技法</span><select value={technique} onChange={(event) => setTechnique(event.target.value)}><option value="">全部</option><option>意象复沓</option><option>环境叙事</option></select></label><Button variant="ghost" onClick={reset}><RotateCcw size={15} />重置</Button><span>{graph.nodes.length} 个节点 · {graph.edges.length} 条关系</span></div>{graph.nodes.length ? <div className="knowledge-grid"><section className="knowledge-canvas"><CharacterGraph graph={graph} onSelect={setSelected} /></section><aside className="knowledge-detail"><span className="eyebrow">节点详情</span><div className="knowledge-symbol"><BookMarked /></div><h2>{node?.label || "选择节点"}</h2><p>{node?.description || "点击图谱或列表中的节点查看来源与解构。"}</p><dl><div><dt>类型</dt><dd>{node?.type || "-"}</dd></div><div><dt>时代</dt><dd>{node?.era || "跨时代"}</dd></div><div><dt>来源</dt><dd>公开书目信息与原创结构化解构</dd></div></dl><a href="https://www.nlc.cn/" target="_blank" rel="noreferrer" className="source-link">查看公共来源</a></aside></div> : <div className="empty-state"><BookMarked size={28} /><h2>没有匹配的知识节点</h2><p>调整时代、主题或技法组合。</p><Button onClick={reset}>重置筛选</Button></div>}</div>;
}
