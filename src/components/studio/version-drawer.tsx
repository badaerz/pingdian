"use client";

import { Clock3, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useStory } from "@/providers/story-provider";

export function VersionDrawer({ open, onOpenChange, readOnly = false }: { open: boolean; onOpenChange: (open: boolean) => void; readOnly?: boolean }) {
  const { state, restore, rollbackPrevious } = useStory();
  const [restoreId, setRestoreId] = useState<string | null>(null);
  return <><Dialog open={open} onOpenChange={onOpenChange} title="版本记录" description="回退前会自动保存当前正文安全快照。"><div className="version-drawer-actions"><Button onClick={() => { rollbackPrevious(); onOpenChange(false); }} disabled={readOnly || state.versions.length < 2}><RotateCcw size={15} />回退至上一版本</Button><span>{readOnly ? "答辩案例只读" : state.versions.length < 2 ? "还没有可回退的版本" : `当前版本 ${state.versions.at(-1)?.versionNo}`}</span></div><div className="version-list">{[...state.versions].reverse().map((version) => <article key={version.id}><div><Clock3 size={15} /><span>版本 {version.versionNo}</span><small>{version.createdAt}</small></div><p>{version.content.slice(0, 76)}…</p><Button variant="secondary" onClick={() => setRestoreId(version.id)} disabled={readOnly || version.id === state.versions.at(-1)?.id}><RotateCcw size={15} />回退到此版本</Button></article>)}</div></Dialog><Dialog open={Boolean(restoreId)} onOpenChange={(value) => !value && setRestoreId(null)} title="回退旧版本" description="系统会先保存当前正文快照，再回退所选版本。"><div className="dialog-actions"><Button variant="secondary" onClick={() => setRestoreId(null)}>取消</Button><Button disabled={readOnly} onClick={() => { if (restoreId) restore(restoreId); setRestoreId(null); onOpenChange(false); }}>确认回退</Button></div></Dialog></>;
}
