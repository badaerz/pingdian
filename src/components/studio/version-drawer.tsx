"use client";

import { Clock3, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useStory } from "@/providers/story-provider";

export function VersionDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, restore } = useStory();
  const [restoreId, setRestoreId] = useState<string | null>(null);
  return <><Dialog open={open} onOpenChange={onOpenChange} title="版本记录" description="版本快照仅保存在当前演示会话。"><div className="version-list">{[...state.versions].reverse().map((version) => <article key={version.id}><div><Clock3 size={15} /><span>版本 {version.versionNo}</span><small>{version.createdAt}</small></div><p>{version.content.slice(0, 76)}…</p><Button variant="secondary" onClick={() => setRestoreId(version.id)}><RotateCcw size={15} />恢复</Button></article>)}</div></Dialog><Dialog open={Boolean(restoreId)} onOpenChange={(value) => !value && setRestoreId(null)} title="恢复旧版本" description="系统会先保存当前正文快照，再恢复所选版本。"><div className="dialog-actions"><Button variant="secondary" onClick={() => setRestoreId(null)}>取消</Button><Button onClick={() => { if (restoreId) restore(restoreId); setRestoreId(null); onOpenChange(false); }}>确认恢复</Button></div></Dialog></>;
}
