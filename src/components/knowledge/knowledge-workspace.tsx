"use client";

import { BookMarked, FileText, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { CharacterGraph } from "@/components/analysis/character-graph";
import { AcademicGraph } from "@/components/knowledge/academic-graph";
import { AiProgress, type AiProgressStatus } from "@/components/ui/ai-progress";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { createKnowledgeGraph, knowledgeRecords, type KnowledgeRecord } from "@/lib/knowledge/catalog";
import { extractTextGraph, MAX_TEXT_SOURCE_CHARS, validateTextUpload, type AcademicKnowledgeGraph } from "@/lib/knowledge/text-extraction";
import { contextFromState } from "@/lib/ai/story-context";
import { searchKnowledge } from "@/lib/supabase/sync";
import { useStoryOptional } from "@/providers/story-provider";
import { aiRequestHeaders } from "@/lib/ai/user-key";

const nodeTypeLabels: Record<string, string> = {
  work: "作品",
  author: "作者",
  theme: "主题",
  technique: "技法",
};

export function KnowledgeWorkspace() {
  const story = useStoryOptional();
  const [mode, setMode] = useState<"classic" | "mine">("classic");
  return <KnowledgeWorkspaceContent key={story?.state.activeProjectId ?? "standalone"} story={story} mode={mode} setMode={setMode} />;
}

function KnowledgeWorkspaceContent({ story, mode, setMode }: { story: ReturnType<typeof useStoryOptional>; mode: "classic" | "mine"; setMode: (mode: "classic" | "mine") => void }) {
  const state = story?.state;
  const [era, setEra] = useState("");
  const [theme, setTheme] = useState("");
  const [technique, setTechnique] = useState("");
  const [selected, setSelected] = useState("work-KB_001");
  const [records, setRecords] = useState<KnowledgeRecord[]>(knowledgeRecords);
  const [myText, setMyText] = useState("");
  const [myTextName, setMyTextName] = useState("");
  const [myGraph, setMyGraph] = useState<AcademicKnowledgeGraph | null>(null);
  const [myError, setMyError] = useState("");
  const [myNotice, setMyNotice] = useState("");
  const [myStatus, setMyStatus] = useState<AiProgressStatus>("idle");
  const [mySourceKind, setMySourceKind] = useState<"narrative" | "argumentative">("narrative");
  const requestRef = useRef<AbortController | null>(null);
  const requestEpochRef = useRef(0);
  const filters = useMemo(() => ({ era, theme, technique }), [era, theme, technique]);

  useEffect(() => {
    let active = true;
    searchKnowledge(null, filters).then((next) => {
      if (active) setRecords(next);
    });
    return () => { active = false; };
  }, [filters]);

  useEffect(() => () => { requestEpochRef.current += 1; requestRef.current?.abort(); }, []);

  const graph = useMemo(() => createKnowledgeGraph(records), [records]);
  const node = graph.nodes.find((item) => item.id === selected) ?? graph.nodes[0];
  const connections = useMemo(() => node ? graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id) : [], [graph, node]);
  const relatedNodes = useMemo(() => connections.map((edge) => ({
    edge,
    node: graph.nodes.find((item) => item.id === (edge.source === node?.id ? edge.target : edge.source)),
  })).filter((item) => item.node), [connections, graph, node]);
  const work = node?.type === "work" ? records.find((item) => `work-${item.id}` === node.id) : undefined;
  const reset = () => { setEra(""); setTheme(""); setTechnique(""); };
  const eras = [...new Set(knowledgeRecords.map((item) => item.era))];
  const themes = [...new Set(knowledgeRecords.flatMap((item) => item.themes))];
  const techniques = [...new Set(knowledgeRecords.flatMap((item) => item.techniques))];

  const projectText = useMemo(() => state?.chapters.map((chapter) => chapter.content).filter(Boolean).join("\n\n") ?? "", [state?.chapters]);
  const clearMySource = () => {
    requestEpochRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setMyText("");
    setMyTextName("");
    setMyGraph(null);
    setMyError("");
    setMyNotice("");
    setMyStatus("idle");
  };
  const chooseProjectText = () => {
    clearMySource();
    if (projectText.length > MAX_TEXT_SOURCE_CHARS) { setMyError("当前项目文本超过 20,000 字，请先拆分章节后再分析。"); setMyStatus("error"); return; }
    setMyText(projectText); setMyTextName("当前项目");
  };
  const readUpload = async (file?: File) => {
    clearMySource();
    if (!file) return;
    const uploadEpoch = requestEpochRef.current;
    const validation = validateTextUpload(file);
    if (!validation.ok) { setMyError(validation.message); setMyStatus("error"); return; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (uploadEpoch !== requestEpochRef.current) return;
      if (!text.trim()) { setMyError("文件为空，无法建立文本证据。"); setMyStatus("error"); return; }
      if (text.length > MAX_TEXT_SOURCE_CHARS) { setMyError("文本超过 20,000 字，请截取需要分析的部分。"); setMyStatus("error"); return; }
      setMyText(text); setMyTextName(file.name);
    } catch { if (uploadEpoch === requestEpochRef.current) { setMyError("文件不是有效的 UTF-8 文本。"); setMyStatus("error"); } }
  };
  const analyzeMyText = async () => {
    const sourceText = myText.trim();
    if (!sourceText || sourceText.length > MAX_TEXT_SOURCE_CHARS) { setMyError("请输入 20,000 字以内的 TXT / MD 文本。"); setMyStatus("error"); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    const requestEpoch = ++requestEpochRef.current;
    requestRef.current = controller;
    setMyStatus("loading"); setMyError(""); setMyNotice("");
    try {
      if (!state) throw new Error("STORY_CONTEXT_REQUIRED");
      const response = await fetch("/api/ai", { method: "POST", signal: controller.signal, headers: aiRequestHeaders(), body: JSON.stringify({ task: "knowledge-extract", project: contextFromState(state), input: { sourceText, sourceKind: mySourceKind, prompt: "仅分析本次会话文本，输出带逐字证据的知识图谱；不要写入项目。" } }) });
      const data = await response.json() as { result?: { knowledgeGraph?: unknown; evidence?: unknown[]; sourceKind?: "narrative" | "argumentative" }; warnings?: string[] };
      if (!response.ok || !data.result?.knowledgeGraph) throw new Error("INVALID_GRAPH");
      if (controller.signal.aborted || requestEpoch !== requestEpochRef.current) return;
      setMyGraph(extractTextGraph(sourceText, data.result as Parameters<typeof extractTextGraph>[1]));
      setMyStatus("success");
      if (data.warnings?.length) setMyNotice(`图谱已基于本次上传文本生成。${data.warnings.join(" ")}`);
    } catch (error) { if (!controller.signal.aborted && requestEpoch === requestEpochRef.current && !(error instanceof DOMException && error.name === "AbortError")) { setMyError("文本分析暂不可用；请检查 AI 服务或继续使用经典知识库。"); setMyStatus("error"); } }
    finally { if (requestRef.current === controller) requestRef.current = null; }
  };

  return (
    <div className="page knowledge-page">
      <header className="page-head knowledge-page-head">
        <div>
          <span className="eyebrow">Digital Humanities / Knowledge Base</span>
          <h1 className="page-title">文学知识图谱</h1>
          <p className="page-subtitle">从作品、作者、主题和技法之间的明确关系进入阅读。</p>
        </div>
        <div className="knowledge-head-visual">
          <Image src="/visuals/knowledge-atlas.png" alt="文学知识关系图谱" fill sizes="(max-width: 700px) 100vw, 320px" />
          <StatusBadge kind="knowledge">{knowledgeRecords.length} 部精选文本</StatusBadge>
        </div>
      </header>

      <div className="knowledge-mode-tabs" role="tablist" aria-label="知识来源模式">
        <button type="button" role="tab" aria-selected={mode === "classic"} className={mode === "classic" ? "active" : ""} onClick={() => setMode("classic")}>经典知识库</button>
        <button type="button" role="tab" aria-selected={mode === "mine"} className={mode === "mine" ? "active" : ""} onClick={() => setMode("mine")}>我的文本</button>
      </div>

      {mode === "mine" && <section className="knowledge-import-panel" aria-label="我的文本分析">
        <div className="knowledge-import-head"><div><span className="eyebrow">SESSION-BOUND TEXT ANALYSIS</span><h2>把作品变成可核验的知识图谱</h2><p>当前项目或临时 TXT / MD 只在本次会话使用，不写入项目文档或云端。</p></div><StatusBadge kind={myGraph ? "success" : "knowledge"}>{myGraph ? `${myGraph.nodes.length} 节点 · ${myGraph.edges.length} 关系` : "等待文本"}</StatusBadge></div>
        <div className="knowledge-import-actions"><Button variant="secondary" onClick={chooseProjectText}><FileText size={15} />读取当前项目</Button><label className="knowledge-upload"><Upload size={15} /><span>{myTextName || "上传 TXT / MD"}</span><input type="file" aria-label="上传知识图谱文本" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void readUpload(event.target.files?.[0])} /></label><label className="knowledge-source-kind">文本类型<select aria-label="文本类型" value={mySourceKind} onChange={(event) => { setMySourceKind(event.target.value as "narrative" | "argumentative"); setMyGraph(null); setMyNotice(""); setMyError(""); setMyStatus("idle"); }}><option value="narrative">叙事文本</option><option value="argumentative">议论文</option></select></label><Button onClick={() => void analyzeMyText()} disabled={!myText.trim() || myStatus === "loading"}>{myStatus === "loading" ? <LoaderCircle size={15} className="spin" /> : <BookMarked size={15} />}分析文本</Button></div>
        <AiProgress status={myStatus} label="知识图谱生成进度" />
        <textarea className="knowledge-import-text" aria-label="粘贴待分析文本" value={myText} maxLength={MAX_TEXT_SOURCE_CHARS} onChange={(event) => { setMyText(event.target.value); setMyTextName("粘贴文本"); setMyGraph(null); setMyError(""); setMyNotice(""); setMyStatus("idle"); }} placeholder="粘贴学生作文、小说片段或当前项目文本……" />
        {myNotice && <p className="knowledge-import-notice" data-testid="knowledge-import-notice" role="status">{myNotice}</p>}
        {myError && <p className="knowledge-import-error" role="alert">{myError}</p>}
        {myGraph && <AcademicGraph graph={myGraph} className="knowledge-academic-graph" />}
      </section>}

      {mode === "classic" && <div className="knowledge-filters">
        <label><span>时代</span><select value={era} onChange={(event) => setEra(event.target.value)}><option value="">全部</option>{eras.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>主题</span><select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="">全部</option>{themes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>技法</span><select value={technique} onChange={(event) => setTechnique(event.target.value)}><option value="">全部</option>{techniques.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <Button variant="ghost" onClick={reset}><RotateCcw size={15} />重置</Button>
        <span>{records.length} 部作品 · {graph.edges.length} 条关系</span>
      </div>}

      {mode === "classic" && graph.nodes.length ? (
        <div className="knowledge-grid">
          <section className="knowledge-canvas">
            <header className="knowledge-canvas-head">
              <div><span>RELATION MAP / {graph.nodes.length} NODES</span><strong>关系视野</strong></div>
              <div className="knowledge-legend" aria-label="知识图谱节点类型">
                <span><i className="legend-work" />作品</span>
                <span><i className="legend-author" />作者</span>
                <span><i className="legend-theme" />主题</span>
                <span><i className="legend-technique" />技法</span>
              </div>
            </header>
            {node && <div className="knowledge-focus" aria-label="当前图谱焦点">
              <div className="knowledge-focus-main">
                <span className={`knowledge-focus-type knowledge-focus-${node.type}`}>{nodeTypeLabels[node.type] ?? node.type}</span>
                <strong>{node.label}</strong>
                <small>{connections.length} 条直接关系</small>
              </div>
              <div className="knowledge-focus-links" aria-label="相邻节点">
                {relatedNodes.slice(0, 3).map(({ edge, node: related }) => related && <button key={edge.id} type="button" title={related.label} onClick={() => setSelected(related.id)}><span>{edge.label}</span>{related.label}</button>)}
                {relatedNodes.length > 3 && <small>+{relatedNodes.length - 3}</small>}
              </div>
            </div>}
            <CharacterGraph graph={graph} onSelect={setSelected} selectedId={node?.id} variant="dark" />
          </section>

          <aside className="knowledge-detail">
            <span className="eyebrow">Selected Node / 节点详情</span>
            <div className="knowledge-symbol"><BookMarked /></div>
            <h2>{node?.label || "选择节点"}</h2>
            <p>{node?.description || "点击图谱或列表中的节点查看来源与解构。"}</p>
            <dl>
              <div><dt>类型</dt><dd>{node ? nodeTypeLabels[node.type] ?? node.type : "-"}</dd></div>
              <div><dt>时代</dt><dd>{node?.era || "跨时代"}</dd></div>
              <div><dt>来源</dt><dd>{work ? `${work.author} · ${work.genre}` : "公开书目信息与原创结构化解构"}</dd></div>
              <div><dt>来源状态</dt><dd>{work?.sourceStatus === "verified" ? "已核验" : work?.sourceStatus === "summary_only" ? "摘要来源" : work?.sourceStatus === "pending" ? "待核验" : "结构化来源"}</dd></div>
            </dl>
            {work?.sourceUrl && <a href={work.sourceUrl} target="_blank" rel="noreferrer" className="source-link">查看公共来源</a>}
            {work && (
              <section className="knowledge-deconstruction">
                <span className="eyebrow">作品阅读</span>
                <h3>经典文本解构</h3>
                <div><strong>情节结构</strong>{work.deconstruction.plot.map((part) => <p key={part.stage}><b>{part.stage}</b>{part.description}</p>)}</div>
                <div><strong>片段证据</strong><blockquote>{work.deconstruction.selectedText || "暂无短片段，先从结构字段进入阅读。"}</blockquote></div>
                <div><strong>为什么这样写</strong><p>{work.deconstruction.explanation}</p></div>
                <div><strong>训练提示</strong><p>{work.deconstruction.trainingPrompt}</p></div>
              </section>
            )}
          </aside>
        </div>
      ) : (
        mode === "classic" ? <div className="empty-state"><BookMarked size={28} /><h2>没有匹配的知识节点</h2><p>调整时代、主题或技法组合。</p><Button onClick={reset}>重置筛选</Button></div> : null
      )}
    </div>
  );
}
