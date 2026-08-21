"use client";

import { BookOpenText, ChevronRight, Globe2, GripVertical, ListTree, LockKeyhole, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { addStoryItem, deleteStoryItem, moveStoryItem, type StoryCollection } from "@/lib/story-state";
import { useStory } from "@/providers/story-provider";

export type StudioSelection = { type: "chapter" | "character" | "world" | "blueprint"; id: string };

interface NavigatorProps {
  selection: StudioSelection;
  onSelect: (selection: StudioSelection) => void;
  readOnly?: boolean;
}

const collectionFor = (type: StudioSelection["type"]): StoryCollection => type === "chapter" ? "chapters" : type === "character" ? "characters" : type === "world" ? "worldEntries" : "blueprint";

export function StoryNavigator({ selection, onSelect, readOnly = false }: NavigatorProps) {
  const { state, setState } = useStory();
  const add = (type: StudioSelection["type"]) => {
    if (readOnly) return;
    const collection = collectionFor(type);
    setState((current) => {
      const next = addStoryItem(current, collection);
      const id = next[collection].at(-1)?.id;
      if (id) queueMicrotask(() => onSelect({ type, id }));
      return next;
    });
  };
  const remove = (type: StudioSelection["type"], id: string) => {
    if (readOnly) return;
    if (type === "chapter" && state.chapters.length === 1) return;
    const item = state[collectionFor(type)].find((entry) => entry.id === id);
    if (item && "locked" in item && item.locked) return;
    if (!window.confirm("删除后无法直接恢复，确认继续？")) return;
    setState((current) => deleteStoryItem(current, collectionFor(type), id));
    if (selection.id === id) {
      const source = state[collectionFor(type)];
      const index = source.findIndex((item) => item.id === id);
      const next = source[index + 1] ?? source[index - 1];
      if (next) onSelect({ type, id: next.id });
    }
  };
  const move = (type: StudioSelection["type"], id: string, target: number) => {
    if (!readOnly) setState((current) => moveStoryItem(current, collectionFor(type), id, target));
  };
  const sections = [
    { type: "chapter" as const, label: "章节", icon: BookOpenText, items: state.chapters, addLabel: "新增章节" },
    { type: "character" as const, label: "人物", icon: Users, items: state.characters, addLabel: "新增人物" },
    { type: "world" as const, label: "世界观", icon: Globe2, items: state.worldEntries, addLabel: "新增世界条目" },
    { type: "blueprint" as const, label: "故事蓝图", icon: ListTree, items: state.blueprint, addLabel: "新增蓝图节点" },
  ];

  return <aside className="story-navigator" aria-label="故事档案夹">
    <div className="binder-title"><span className="eyebrow">Story binder</span><strong>故事档案夹</strong></div>
    {sections.map(({ type, label, icon: Icon, items, addLabel }) => <section key={type}>
      <div className="section-label"><span><Icon size={13} />{label}</span><span>{items.length}</span></div>
      <div className="binder-list">
        {items.map((item, index) => {
          const title = "name" in item ? item.name : "label" in item ? item.label : item.title;
          const detail = type === "chapter" ? `${"wordCount" in item ? item.wordCount : 0} 字` : type === "character" ? ("role" in item ? item.role : "") : type === "world" ? ("category" in item ? item.category : "") : ("beatType" in item ? item.beatType : "");
          const locked = "locked" in item && item.locked;
          return <div key={item.id} className={`binder-row ${selection.type === type && selection.id === item.id ? "binder-row-active" : ""}`} draggable={!readOnly} onDragStart={(event) => event.dataTransfer.setData("text/story-id", item.id)} onDragOver={(event) => { if (!readOnly) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); move(type, event.dataTransfer.getData("text/story-id"), index); }}>
            <GripVertical className="drag-handle" size={14} aria-hidden />
            <button aria-label={`${title}，${detail}`} aria-pressed={selection.type === type && selection.id === item.id} onClick={() => {
              if (type === "chapter") setState((current) => ({ ...current, activeChapterId: item.id }));
              onSelect({ type, id: item.id });
            }}><strong>{title || "未命名"}</strong><small>{detail || "待补充"}</small></button>
            {locked ? <LockKeyhole size={13} aria-label="已锁定" /> : <ChevronRight size={13} aria-hidden />}
            <Tooltip label={readOnly ? "答辩案例只读" : locked ? "已锁定事实" : type === "chapter" && items.length === 1 ? "至少保留一章" : `删除${label}`}><Button variant="icon" aria-label={`删除${title || label}`} disabled={readOnly || locked || (type === "chapter" && items.length === 1)} onClick={() => remove(type, item.id)}><Trash2 size={13} /></Button></Tooltip>
          </div>;
        })}
      </div>
      <Button variant="ghost" className="binder-add" aria-label={addLabel} disabled={readOnly} onClick={() => add(type)}><Plus size={14} />{addLabel}</Button>
    </section>)}
  </aside>;
}
