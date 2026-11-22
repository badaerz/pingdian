"use client";

import Link from "next/link";
import { AlertCircle, BookOpenText, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useStory } from "@/providers/story-provider";

export function ProjectDashboard() {
  const { state, documents, removeProject } = useStory();
  const [query, setQuery] = useState("");
  const [viewState, setViewState] = useState<"success" | "loading" | "error" | "empty">("success");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const projects = useMemo(
    () => viewState === "empty" ? [] : state.projects.filter((project) => `${project.title}${project.genre}`.includes(query)),
    [query, state.projects, viewState],
  );
  const remove = () => {
    if (deleteId) removeProject(deleteId);
    setDeleteId(null);
  };

  return (
    <div className="pd-index">
      <header><h1>项目桌面</h1><Link href="/projects/new" className="button button-secondary"><Plus size={16} />新建作品</Link></header>
      <section className="dashboard-tools">
        <label className="search-field"><Search size={17} /><span className="sr-only">搜索项目</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品或体裁" /></label>
        <div className="state-switch" aria-label="演示状态">
          <button className={viewState === "success" ? "active" : ""} aria-pressed={viewState === "success"} onClick={() => setViewState("success")}>项目</button>
          <button className={viewState === "loading" ? "active" : ""} aria-pressed={viewState === "loading"} onClick={() => setViewState("loading")}>加载</button>
          <button className={viewState === "error" ? "active" : ""} aria-pressed={viewState === "error"} onClick={() => setViewState("error")}>失败</button>
          <button className={viewState === "empty" ? "active" : ""} aria-pressed={viewState === "empty"} onClick={() => setViewState("empty")}>空状态</button>
        </div>
      </section>

      {viewState === "loading" ? (
        <div className="project-list" aria-label="正在加载">{[1, 2, 3].map((item) => <div className="project-row project-row-loading" key={item}><i /><i /><i /></div>)}</div>
      ) : viewState === "error" ? (
        <div className="empty-state" role="alert"><AlertCircle size={28} /><h2>项目暂时无法读取</h2><p>请重新读取作品列表。</p><Button onClick={() => setViewState("success")}><RotateCcw size={16} />重试</Button></div>
      ) : projects.length === 0 ? (
        <div className="empty-state"><BookOpenText size={28} /><h2>{query ? "没有匹配的作品" : "还没有作品。新建一个，或到首页贴一段文字试试。"}</h2>{query && <p>换一个标题或体裁关键词。</p>}{query ? <Button variant="secondary" onClick={() => setQuery("")}>清除搜索</Button> : <div className="project-dialog-links"><Link href="/projects/new" className="button button-primary">新建作品</Link><Link href="/" className="button button-secondary">到首页贴一段文字</Link></div>}</div>
      ) : (
        <div className="pd-index-list">
          {projects.map((project, index) => {
            const doc = documents[project.id];
            const snapshot = doc?.analysisSnapshots.reduce<(typeof doc.analysisSnapshots)[number] | undefined>((latest, entry) => !latest || entry.createdAt > latest.createdAt ? entry : latest, undefined);
            const mode = snapshot?.mode;
            return <article className="pd-index-row" key={project.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><Link className="pd-index-title" href={`/project/${encodeURIComponent(project.id)}/studio`}>{project.title}</Link><small>{[project.genre, doc && `${doc.chapters.length} 章`, snapshot && `最近诊断 ${snapshot.createdAt.slice(0, 10)}`].filter(Boolean).join(" · ")}</small></div>
              <small className="pd-index-count">{(doc ? doc.chapters.reduce((n, chapter) => n + chapter.content.replace(/\s/g, "").length, 0) : project.wordCount).toLocaleString()} 字{snapshot?.diagnostics && ` · ${snapshot.diagnostics.length} 条批注`}</small>
              <div><Tooltip label="更多操作"><Button variant="icon" aria-label={`${project.title} 更多操作`} onClick={() => setDetailsId(project.id)}><MoreHorizontal size={17} /></Button></Tooltip>
              <Tooltip label="删除项目"><Button variant="icon" aria-label={`删除 ${project.title}`} onClick={() => setDeleteId(project.id)}><Trash2 size={16} /></Button></Tooltip></div>
              {mode && <span className="pd-stamp" data-mode={mode} aria-label={mode === "live" ? "真实诊断" : "演示结果"}>{mode === "live" ? "真" : "演"}</span>}
            </article>;
          })}
        </div>
      )}

      <footer>红框「真」表示最近一次真实诊断，灰框「演」表示演示结果。</footer>
      <Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)} title="删除项目" description="删除后无法恢复。">
        <p>确认从项目桌面移除此项目吗？</p><div className="dialog-actions"><Button variant="secondary" onClick={() => setDeleteId(null)}>取消</Button><Button variant="danger" onClick={remove}>确认删除</Button></div>
      </Dialog>
      <Dialog open={Boolean(detailsId)} onOpenChange={(open) => !open && setDetailsId(null)} title="项目操作" description={state.projects.find((project) => project.id === detailsId)?.title}>
        <div className="project-dialog-links"><Link href={`/project/${detailsId}/studio`} className="button button-secondary">打开创作台</Link><Link href={`/project/${detailsId}/analysis`} className="button button-secondary">查看文学诊断</Link></div>
      </Dialog>
    </div>
  );
}
