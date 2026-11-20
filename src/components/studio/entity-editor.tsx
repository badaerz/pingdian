"use client";

import { LockKeyhole, UnlockKeyhole } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { StudioSelection } from "@/components/studio/story-navigator";
import { updateStoryItem } from "@/lib/story-state";
import { useStory } from "@/providers/story-provider";

function Field({ label, value, onChange, multiline = false, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; readOnly?: boolean }) {
  return <label className="field"><span>{label}</span>{multiline ? <textarea className="textarea" value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} /> : <input className="input" value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />}</label>;
}

export function EntityEditor({ selection, readOnly = false }: { selection: StudioSelection; readOnly?: boolean }) {
  const { state, setState } = useStory();
  const [edited, setEdited] = useState(false);
  const update = (patch: Record<string, unknown>) => {
    if (readOnly) return;
    setState((current) => updateStoryItem(current, selection.type === "character" ? "characters" : selection.type === "world" ? "worldEntries" : "blueprint", selection.id, patch));
    setEdited(true);
  };
  const consistencyNotice = edited && <p role="status" className="muted">设定已更新。生成新候选后，将按最新设定进行一致性检查。</p>;
  if (selection.type === "character") {
    const item = state.characters.find((entry) => entry.id === selection.id);
    if (!item) return null;
    return <div className="entity-editor"><header><div><span className="eyebrow">人物卡 / Character</span><h1>{item.name || "未命名人物"}</h1></div><Button variant="secondary" disabled={readOnly} onClick={() => update({ locked: !item.locked })}>{item.locked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}{item.locked ? "已锁定事实" : "锁定为事实"}</Button></header><div className="entity-grid">
      <Field label="人物姓名" value={item.name} onChange={(name) => update({ name })} readOnly={readOnly} />
      <Field label="身份 / 角色" value={item.role} onChange={(role) => update({ role })} readOnly={readOnly} />
      <Field label="核心欲望" value={item.desire} onChange={(desire) => update({ desire })} multiline readOnly={readOnly} />
      <Field label="核心恐惧" value={item.fear} onChange={(fear) => update({ fear })} multiline readOnly={readOnly} />
      <Field label="性格缺陷" value={item.flaw} onChange={(flaw) => update({ flaw })} multiline readOnly={readOnly} />
      <Field label="人物弧光" value={item.arc} onChange={(arc) => update({ arc })} multiline readOnly={readOnly} />
      <div className="entity-span"><Field label="创作备注" value={item.notes} onChange={(notes) => update({ notes })} multiline readOnly={readOnly} /></div>
    </div>{consistencyNotice}</div>;
  }
  if (selection.type === "world") {
    const item = state.worldEntries.find((entry) => entry.id === selection.id);
    if (!item) return null;
    return <div className="entity-editor"><header><div><span className="eyebrow">世界条目 / World</span><h1>{item.label || "新设定"}</h1></div><Button variant="secondary" disabled={readOnly} onClick={() => update({ locked: !item.locked })}>{item.locked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}{item.locked ? "已锁定事实" : "锁定为事实"}</Button></header><div className="entity-grid">
      <Field label="条目名称" value={item.label} onChange={(label) => update({ label })} readOnly={readOnly} />
      <label className="field"><span>分类</span><select className="select" disabled={readOnly} value={item.category} onChange={(event) => update({ category: event.target.value })}><option>时代</option><option>地点</option><option>规则</option><option>社会</option><option>氛围</option><option>自定义</option></select></label>
      <div className="entity-span"><Field label="设定内容" value={item.content} onChange={(content) => update({ content })} multiline readOnly={readOnly} /></div>
    </div>{consistencyNotice}</div>;
  }
  const item = state.blueprint.find((entry) => entry.id === selection.id);
  if (!item) return null;
  return <div className="entity-editor"><header><div><span className="eyebrow">蓝图节点 / Story beat</span><h1>{item.title || "新节点"}</h1></div><Button variant="secondary" disabled={readOnly} onClick={() => update({ locked: !item.locked })}>{item.locked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}{item.locked ? "已锁定事实" : "锁定为事实"}</Button></header><div className="entity-grid">
    <Field label="节点名称" value={item.title} onChange={(title) => update({ title })} readOnly={readOnly} />
    <Field label="节拍类型" value={item.beatType} onChange={(beatType) => update({ beatType })} readOnly={readOnly} />
    <div className="entity-span"><Field label="情节摘要" value={item.summary} onChange={(summary) => update({ summary })} multiline readOnly={readOnly} /></div>
  </div>{consistencyNotice}</div>;
}
