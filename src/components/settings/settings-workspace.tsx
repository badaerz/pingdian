"use client";

import Link from "next/link";
import { readingSizes, readingSpacing, useReadingPreferences } from "@/lib/reading-preferences";
import { AlertTriangle, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { useStory } from "@/providers/story-provider";

export function SettingsWorkspace() {
  const { clearLocalUserData, state, syncStatus } = useStory();
  const [failure, setFailure] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearResult, setClearResult] = useState("");
  const projectId = state.activeProjectId;
  const [reading, setReading] = useReadingPreferences();
  const syncLabel = "仅保存在此浏览器";

  return <div className="pd-settings"><header><h1>设置</h1></header>{failure && <div className="settings-alert" role="alert"><AlertTriangle size={18} /><div><strong>离线提示已展示</strong><p>本地正文仍然可编辑；外部 AI 不可用时会切换为结构化演示结果，不会影响本地作品。</p></div><Button variant="secondary" onClick={() => setFailure(false)}>恢复</Button></div>}{clearResult && <div className="settings-alert" role="status"><ShieldCheck size={18} /><div><strong>{clearResult}</strong></div><Button variant="secondary" onClick={() => setClearResult("")}>关闭</Button></div>}<section id="mode"><h2>AI 状态</h2><div className="settings-field"><span>作品存储</span><StatusBadge kind={syncStatus === "offline" ? "warning" : "success"}>{syncLabel}</StatusBadge></div><div className="settings-field"><span>AI 运行</span><div><p>模型不可用时，结果会标为演示。</p><Button variant="secondary" aria-label="模拟失败状态" onClick={() => setFailure(true)}>检查离线提示</Button></div></div></section>
    <AiKeyPanel />
    <section id="reading"><h2>阅读</h2><label className="settings-field">正文字号<select value={reading.fontSize} onChange={event => setReading(current => ({ ...current, fontSize: Number(event.target.value) }))}>{readingSizes.map(size => <option key={size} value={size}>{size} px</option>)}</select></label>
    <label className="settings-field">正文行距<select value={reading.lineHeight} onChange={event => setReading(current => ({ ...current, lineHeight: Number(event.target.value) }))}>{readingSpacing.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></section>
    <section id="privacy"><h2>数据</h2><div className="settings-field"><span>零数据保留</span><p>作品与训练记录保存在浏览器中。仅清除图片与脚本缓存通常不会删除作品。</p></div><div className="settings-field"><span>作品导出</span><Link href={projectId ? `/project/${projectId}/studio` : "/projects"} className="button button-secondary">前往导出</Link></div>
    <div className="pd-danger"><strong>清除全部本地创作数据</strong><p>删除此浏览器中的用户作品、训练记录和生成资产。</p><Button variant="danger" onClick={() => setClearOpen(true)}>清除本地创作数据</Button></div></section><Dialog open={clearOpen} onOpenChange={setClearOpen} title="清除本地创作数据" description="此操作会删除当前浏览器中的用户作品、训练记录与生成资产，且无法恢复。请先导出需要保留的作品。"><div className="dialog-actions"><Button variant="secondary" onClick={() => setClearOpen(false)}>取消</Button><Button variant="danger" onClick={async () => { try { await clearLocalUserData(); setClearResult("本地创作数据已清除"); } catch { setClearResult("部分本地资产未能清除，请关闭其他 评点页面后重试"); } finally { setClearOpen(false); } }}><Trash2 size={16} />确认清除</Button></div></Dialog></div>;
}
