"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, ChartNoAxesCombined, FolderKanban, GraduationCap, LibraryBig, Menu, Settings, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { ScrollMotion } from "@/components/ui/scroll-motion";
import { SlowAiRequests } from "@/components/ui/slow-ai-requests";
import { cn } from "@/lib/utils";
import { useStory } from "@/providers/story-provider";

const projectLinks = (projectId: string) => [
  { href: "/projects", label: "项目桌面", icon: FolderKanban },
  ...(projectId ? [{ href: `/project/${encodeURIComponent(projectId)}/studio`, label: "创作台", icon: BookOpenText },
  { href: `/project/${encodeURIComponent(projectId)}/analysis`, label: "文学诊断", icon: ChartNoAxesCombined }] : []),
  { href: "/knowledge", label: "知识图谱", icon: LibraryBig },
  { href: "/training", label: "写作训练", icon: GraduationCap },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { state, syncStatus, demoLocked } = useStory();
  const project = state.projects.find((item) => item.id === state.activeProjectId);
  const links = projectLinks(state.activeProjectId);
  const syncLabel = demoLocked ? "演示模式" : "仅存本地";

  if (pathname === "/") return <>{children}</>;
  if (["/projects", "/knowledge", "/settings"].includes(pathname) || /^\/project\/[^/]+\/(studio|ip-lab)$/.test(pathname)) return <div className="pd-workspace">
    <nav className="pd-workspace-bar" aria-label="主要导航">
      <Link href="/">评点</Link>
      {[...links, ...(state.activeProjectId ? [{ href: `/project/${encodeURIComponent(state.activeProjectId)}/ip-lab`, label: "IP 实验场" }] : [])].map(({ href, label }) =>
        <Link key={label} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}
      <span className="pd-storage-status">{syncLabel}</span>
    </nav>
    <SlowAiRequests />
    <main id="main-content">{children}</main>
  </div>;
  if (pathname === "/training") return <main className="training-route" id="main-content">
    <header className="training-route-bar"><Link href="/">评点</Link><Link href="/projects">项目桌面</Link></header>
    <SlowAiRequests />
    {children}
  </main>;
  if (/^\/project\/[^/]+\/analysis\/?$/.test(pathname)) return <main className="analysis-route" id="main-content">
    <header className="analysis-route-bar">
      <Link href="/">评点</Link>
      <Link href={project ? `/project/${encodeURIComponent(project.id)}/studio` : "/projects"}>← 返回作品</Link>
    </header>
    <SlowAiRequests />
    {children}
  </main>;

  return (
    <div className={cn("app-shell", demoLocked && "app-shell-demo-locked")}>
      <ScrollMotion />
      <SlowAiRequests />
      <a className="skip-link" href="#main-content">跳到主要内容</a>

      {/* 顶栏：品牌标识 + 项目上下文 + 操作区 */}
      <header className="top-bar">
        <Link href="/" className="brand-lockup" aria-label="评点首页">
          <span className="brand-wordmark"><b>评点</b></span>
        </Link>

        <div className="project-context">
          <span>{project?.title ?? "未命名作品"}</span>
          <span className="hairline" />
          <span className="muted">{state.chapters[0]?.title ?? "未开始正文"}</span>
        </div>

        <div className="top-actions">
          <StatusBadge kind={syncStatus === "synced" ? "success" : syncStatus === "offline" ? "warning" : "demo"}>{syncLabel}</StatusBadge>
          <Tooltip label={menuOpen ? "关闭导航" : "打开导航"}>
            <Button
              variant="icon"
              className="mobile-menu"
              aria-label={menuOpen ? "关闭导航" : "打开导航"}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </Button>
          </Tooltip>
          <div className="avatar" aria-label="访客账户">访</div>
        </div>
      </header>
      {demoLocked && <div className="demo-lock-banner" role="status">演示模式：不调用外部模型，结果均为本地演示</div>}

      {/* 侧边导航 */}
      <aside className={cn("side-nav", menuOpen && "side-nav-open")} aria-label="主要导航">
        <nav>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={cn("nav-link", pathname === href && "nav-link-active")}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="eyebrow">本地优先</span>
          <p>作品仅保存在当前浏览器，不上传产品数据库。</p>
        </div>
      </aside>

      {/* 主内容区 */}
      <main id="main-content" className="app-main" data-motion-section>
        <div data-motion-item>
        {children}
        </div>
      </main>

      {/* 移动端底部导航 */}
      <nav className="mobile-nav" aria-label="移动导航">
        {links.slice(0, 4).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn(pathname === href && "active")}>
            <Icon size={20} />
            <span>
              {label
                .replace("项目桌面", "项目")
                .replace("文学诊断", "诊断")
                .replace("知识图谱", "图谱")}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
