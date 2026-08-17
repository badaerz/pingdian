"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, ChartNoAxesCombined, FolderKanban, GraduationCap, LibraryBig, Menu, Settings, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "项目桌面", icon: FolderKanban },
  { href: "/project/demo/studio", label: "创作台", icon: BookOpenText },
  { href: "/project/demo/analysis", label: "文学诊断", icon: ChartNoAxesCombined },
  { href: "/knowledge", label: "文学图谱", icon: LibraryBig },
  { href: "/training", label: "写作训练", icon: GraduationCap },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="app-shell"><a className="skip-link" href="#main-content">跳到主要内容</a><header className="top-bar"><div className="brand-lockup"><span className="brand-mark">炉</span><span>故事熔炉</span></div><div className="project-context"><span>雾港来信</span><span className="hairline" /><span className="muted">第一章 潮声</span></div><div className="top-actions"><StatusBadge>演示数据</StatusBadge><Tooltip label={menuOpen ? "关闭导航" : "打开导航"}><Button variant="icon" className="mobile-menu" aria-label={menuOpen ? "关闭导航" : "打开导航"} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</Button></Tooltip><div className="avatar" aria-label="访客账户">访</div></div></header><aside className={cn("side-nav", menuOpen && "side-nav-open")} aria-label="主要导航"><nav>{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={cn("nav-link", pathname === href && "nav-link-active")}><Icon size={18} /><span>{label}</span></Link>)}</nav><div className="sidebar-foot"><span className="eyebrow">本地原型</span><p>所有内容仅保存在当前演示会话。</p></div></aside><main id="main-content" className="app-main">{children}</main><nav className="mobile-nav" aria-label="移动导航">{links.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn(pathname === href && "active")}><Icon size={20} /><span>{label.replace("项目桌面", "项目").replace("文学诊断", "诊断").replace("文学图谱", "图谱")}</span></Link>)}</nav></div>;
}
