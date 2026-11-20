"use client";

import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, Download, EyeOff, Gauge, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { useStory } from "@/providers/story-provider";

export function SettingsWorkspace() {
  const { clearLocalUserData, reset, state, syncStatus } = useStory();
  const [failure, setFailure] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearResult, setClearResult] = useState("");
  const projectId = state.activeProjectId;
  const syncLabel = "仅保存在此浏览器";

  return <div className="page settings-page"><header className="page-head visual-page-head"><div><h1 className="page-title">设置</h1><p className="page-subtitle">管理当前浏览器中的作品、隐私边界与恢复操作。</p></div><figure className="page-chapter-visual"><Image src="/visuals/settings-vault.png" alt="本地优先的数据档案" fill sizes="(max-width: 700px) 100vw, 320px" /></figure><StatusBadge kind={syncStatus === "offline" ? "warning" : "success"}>{syncLabel}</StatusBadge></header>{failure && <div className="settings-alert" role="alert"><AlertTriangle size={18} /><div><strong>离线提示已展示</strong><p>本地正文仍然可编辑；外部 AI 不可用时会切换为结构化演示结果，不会影响本地作品。</p></div><Button variant="secondary" onClick={() => setFailure(false)}>恢复</Button></div>}{clearResult && <div className="settings-alert" role="status"><ShieldCheck size={18} /><div><strong>{clearResult}</strong><p>内置答辩案例仍可使用，用户创建的作品与训练记录已移除。</p></div><Button variant="secondary" onClick={() => setClearResult("")}>关闭</Button></div>}<div className="settings-layout"><nav className="settings-nav"><a href="#mode">运行</a><a href="#ai-key">AI 密钥</a><a href="#privacy">隐私</a><a href="#budget">调用边界</a><a href="#danger">危险操作</a></nav><div className="settings-content"><section id="mode"><div className="settings-heading"><div><Gauge /><h2>运行状态</h2></div><p>AI 只通过服务端调用；没有密钥、超时或模型错误时自动切换为结构化离线结果。</p></div><div className="privacy-row"><Gauge /><div><strong>{syncLabel}</strong><p>作品、人物与世界观、训练记录和生成资产只写入当前浏览器，不上传 Story Forge 数据库。</p></div></div><Button variant="secondary" aria-label="模拟失败状态" onClick={() => setFailure(true)}>检查离线提示</Button></section><AiKeyPanel /><section id="privacy"><div className="settings-heading"><div><ShieldCheck /><h2>隐私与导出</h2></div><p>只发送完成当前 AI 任务所需的作品上下文；站内接口不缓存请求或响应。</p></div><div className="privacy-row"><EyeOff /><div><strong>零数据保留</strong><p>浏览器不创建匿名云端账户。清除该站点的数据或网站存储会删除本地作品；仅清除图片与脚本缓存通常不会删除作品。</p></div></div><div className="privacy-row"><Download /><div><strong>项目导出</strong><p>创作台提供真实 Markdown 与 TXT 本地导出，不会生成服务端文件。</p></div><Link href={`/project/${projectId}/studio`} className="button button-secondary">前往导出</Link></div></section><section id="budget"><div className="settings-heading"><div><Gauge /><h2>调用边界</h2></div><p>服务端会限制单次上下文长度并在请求超时后自动回退；第三方模型仅接收完成当次任务所需的上下文，其自身留存政策需以供应商条款为准。</p></div><p className="muted">答辩锁定模式不调用外部 AI；其他模式的当前 AI 状态由生成、诊断与训练反馈旁的模式标签说明。</p></section><section id="danger" className="danger-zone"><div className="settings-heading"><div><Trash2 /><h2>危险操作</h2></div><p>改变内容前始终要求确认。</p></div><div><div><strong>重置答辩案例</strong><p>恢复回响的草场、雾港来信与当前会话中的候选、版本和分析数据。</p></div><Button variant="danger" onClick={() => setDeleteOpen(true)}>重置项目</Button></div><div><div><strong>清除全部本地创作数据</strong><p>删除此浏览器中的用户作品、训练记录和生成资产；内置答辩案例会恢复。</p></div><Button variant="danger" onClick={() => setClearOpen(true)}>清除本地创作数据</Button></div></section></div></div><Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title="重置答辩案例" description="当前会话中的编辑、候选采纳和版本记录会恢复为初始数据。"><div className="dialog-actions"><Button variant="secondary" onClick={() => setDeleteOpen(false)}>取消</Button><Button variant="danger" onClick={() => { reset(); setDeleteOpen(false); }}><RotateCcw size={16} />确认重置</Button></div></Dialog><Dialog open={clearOpen} onOpenChange={setClearOpen} title="清除本地创作数据" description="此操作会删除当前浏览器中的用户作品、训练记录与生成资产，且无法恢复。请先导出需要保留的作品。"><div className="dialog-actions"><Button variant="secondary" onClick={() => setClearOpen(false)}>取消</Button><Button variant="danger" onClick={async () => { try { await clearLocalUserData(); setClearResult("本地创作数据已清除"); } catch { setClearResult("部分本地资产未能清除，请关闭其他 Story Forge 页面后重试"); } finally { setClearOpen(false); } }}><Trash2 size={16} />确认清除</Button></div></Dialog></div>;
}
