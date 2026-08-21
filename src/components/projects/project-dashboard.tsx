"use client";

import Link from "next/link";
import Image from "next/image";
import { AlertCircle, ArrowRight, BookOpenText, Clock3, MoreHorizontal, Network, PenLine, Plus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { isDefenseProjectId } from "@/lib/demo-mode";
import { useStory } from "@/providers/story-provider";

const humanitiesEdges = [
  { id: "story-person", path: "M 20 22 C 36 14, 56 15, 72 28", duration: "4.8s" },
  { id: "person-craft", path: "M 76 34 C 82 45, 82 57, 78 68", duration: "4.2s" },
  { id: "craft-theme", path: "M 70 73 C 55 82, 41 82, 29 73", duration: "5.1s" },
  { id: "theme-story", path: "M 26 67 C 18 54, 16 38, 19 29", duration: "4.5s" },
] as const;

export function ProjectDashboard() {
  const { state, removeProject, reset } = useStory();
  const [query, setQuery] = useState("");
  const [viewState, setViewState] = useState<"success" | "loading" | "error" | "empty">("success");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const projects = useMemo(
    () => viewState === "empty" ? [] : state.projects.filter((project) => `${project.title}${project.genre}`.includes(query)),
    [query, state.projects, viewState],
  );
  const activeProject = state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0];
  const remove = () => {
    if (deleteId) removeProject(deleteId);
    setDeleteId(null);
  };

  return (
    <div className="page dashboard">
      <section className="dashboard-hero">
        <Image className="dashboard-hero-image" src="/visuals/projects-archive.png" alt="作品项目档案" fill priority sizes="(max-width: 900px) 100vw, 70vw" />
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={13} />创作正在发生</span>
          <p className="hero-kicker">Story Forge / 叙事智能创作工作台</p>
          <h1>{activeProject?.title ?? "从一个念头开始"}</h1>
          <p className="hero-logline">{activeProject?.logline ?? "把一个念头放进锻造台，让人物、世界与情节慢慢显形。"}</p>
          <div className="hero-actions">
            <Link href={`/project/${activeProject?.id ?? "demo"}/studio`} className="button button-primary"><PenLine size={17} />继续创作</Link>
            <Link href="/projects/new" className="button button-secondary"><Plus size={17} />新建作品</Link>
          </div>
          <div className="hero-meta"><span>{activeProject?.genre ?? "纯文学短篇"}</span><span>{activeProject?.wordCount.toLocaleString() ?? 0} 字</span><span>最后编辑 {activeProject?.updatedAt ?? "刚刚"}</span></div>
        </div>

        <aside className="humanities-panel">
          <div className="humanities-heading"><div><span className="eyebrow">数字人文索引</span><h2>让故事的关系<br />显露出来</h2></div><Network size={21} /></div>
          <div className="humanities-graph" aria-label="人物、主题与技法的关系图">
            <svg className="humanities-graph-layer" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <defs><marker id="humanities-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" /></marker></defs>
              {humanitiesEdges.map((edge, index) => <g key={edge.id}><path className="graph-link" d={edge.path} markerEnd="url(#humanities-arrow)" /><circle className="graph-traveler" r="1.7"><animateMotion dur={edge.duration} begin={`${index * -0.8}s`} repeatCount="indefinite" path={edge.path} /></circle></g>)}
            </svg>
            <button className="graph-node node-story">雾港</button><button className="graph-node node-person">沈砚</button><button className="graph-node node-theme">守候</button><button className="graph-node node-craft">意象</button>
          </div>
          <div className="humanities-footer"><span>人物 03</span><span>主题 02</span><span>证据 03</span></div>
        </aside>
      </section>

      <header className="page-head dashboard-title"><div><span className="eyebrow">作品索引</span><h2 className="page-title">你的书架</h2></div></header>
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
        <div className="empty-state" role="alert"><AlertCircle size={28} /><h2>项目暂时无法读取</h2><p>本地草稿没有丢失，可以重试或恢复演示数据。</p><Button onClick={() => { reset(); setViewState("success"); }}><RotateCcw size={16} />恢复演示数据</Button></div>
      ) : projects.length === 0 ? (
        <div className="empty-state"><BookOpenText size={28} /><h2>{query ? "没有匹配的作品" : "桌面还是空的"}</h2><p>{query ? "换一个标题或体裁关键词。" : "创建第一部作品，系统会同时准备章节与蓝图。"}</p>{query ? <Button variant="secondary" onClick={() => setQuery("")}>清除搜索</Button> : <Link href="/projects/new" className="button button-primary">新建作品</Link>}</div>
      ) : (
        <div className="project-list">
          {projects.map((project, index) => (
            <article className="project-row" key={project.id}>
              <div className={`project-index tone-${index % 3}`}>{String(index + 1).padStart(2, "0")}</div>
              <div className="project-copy">
                <div><h3>{project.title}</h3>{isDefenseProjectId(project.id) && <StatusBadge>答辩案例 · 永久保留</StatusBadge>}</div>
                <p>{project.logline}</p>
                <div className="project-meta"><span>{project.genre}</span><span><Clock3 size={13} />{project.updatedAt}</span><span>{project.wordCount.toLocaleString()} 字</span></div>
              </div>
              <div className="project-progress"><span>{project.status === "analysis" ? "待复核" : project.status === "draft" ? "草稿" : "创作中"}</span><i><b style={{ width: `${Math.min(100, Math.max(22, project.wordCount / 160))}%` }} /></i></div>
              <div className="project-actions">
                <Link href={`/project/${project.id}/studio`} aria-label={`打开 ${project.title}`} className="button button-secondary">打开<ArrowRight size={16} /></Link>
                {!isDefenseProjectId(project.id) && <Tooltip label="删除项目"><Button variant="icon" aria-label={`删除 ${project.title}`} onClick={() => setDeleteId(project.id)}><Trash2 size={16} /></Button></Tooltip>}
                <Tooltip label="更多操作"><Button variant="icon" aria-label={`${project.title} 更多操作`} onClick={() => setDetailsId(project.id)}><MoreHorizontal size={17} /></Button></Tooltip>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)} title="删除项目" description="此操作只影响当前演示会话，仍需明确确认。">
        <p>确认从项目桌面移除此项目吗？</p><div className="dialog-actions"><Button variant="secondary" onClick={() => setDeleteId(null)}>取消</Button><Button variant="danger" onClick={remove}>确认删除</Button></div>
      </Dialog>
      <Dialog open={Boolean(detailsId)} onOpenChange={(open) => !open && setDetailsId(null)} title="项目操作" description={state.projects.find((project) => project.id === detailsId)?.title}>
        <div className="project-dialog-links"><Link href={`/project/${detailsId}/studio`} className="button button-secondary">打开创作台</Link><Link href={`/project/${detailsId}/analysis`} className="button button-secondary">查看文学诊断</Link></div>
      </Dialog>
    </div>
  );
}
