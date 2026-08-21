"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Maximize2, Minimize2, Redo2, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { AiTask } from "@/lib/ai/tasks";

const DISPLAY_KEY = "story-forge:editor-display:v1";
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value] ?? value);
const toHtml = (text: string) => text.split(/\n\n+/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");

interface ProseEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSelectionChange?: (selection: ProseSelection | null) => void;
  onAiAction?: (task: Extract<AiTask, "rewrite" | "expand" | "condense" | "sensory" | "mentor">, selection: ProseSelection) => void;
  onFocusModeChange?: (focused: boolean) => void;
  readOnly?: boolean;
}

export interface ProseSelection { from: number; to: number; text: string }

function readDisplayPreferences() {
  if (typeof window === "undefined") return { fontSize: 18, lineHeight: 2.05 };
  try {
    const saved = JSON.parse(window.localStorage.getItem(DISPLAY_KEY) ?? "{}") as { fontSize?: number; lineHeight?: number };
    return { fontSize: saved.fontSize ?? 18, lineHeight: saved.lineHeight ?? 2.05 };
  } catch {
    return { fontSize: 18, lineHeight: 2.05 };
  }
}

export function ProseEditor({ content, onChange, onSelectionChange, onAiAction, onFocusModeChange, readOnly = false }: ProseEditorProps) {
  const [display, setDisplay] = useState(readDisplayPreferences);
  const { fontSize, lineHeight } = display;
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState<ProseSelection | null>(null);
  const editor = useEditor({
    extensions: [StarterKit],
    content: toHtml(content),
    immediatelyRender: false,
    editable: !readOnly,
    onUpdate: ({ editor: current }) => onChange(current.getText({ blockSeparator: "\n\n" })),
    onSelectionUpdate: ({ editor: current }) => {
      const { from, to } = current.state.selection;
      const text = from === to ? "" : current.state.doc.textBetween(from, to, "\n\n");
      const start = current.state.doc.textBetween(0, from, "\n\n").length;
      const next = text ? { from: start, to: start + text.length, text } : null;
      setSelection(next);
      onSelectionChange?.(next);
    },
    editorProps: { attributes: { class: "prose-surface", "aria-label": "正文编辑器" } },
  });
  useEffect(() => {
    window.localStorage.setItem(DISPLAY_KEY, JSON.stringify({ fontSize, lineHeight }));
  }, [fontSize, lineHeight]);
  useEffect(() => {
    if (editor && editor.getText({ blockSeparator: "\n\n" }) !== content) editor.commands.setContent(toHtml(content), { emitUpdate: false });
  }, [content, editor]);
  useEffect(() => {
    if (editor && editor.isEditable !== !readOnly) editor.setEditable(!readOnly);
  }, [editor, readOnly]);
  const tools = [
    { label: "加粗", icon: Bold, action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive("bold") },
    { label: "斜体", icon: Italic, action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive("italic") },
    { label: "撤销", icon: Undo2, action: () => editor?.chain().focus().undo().run() },
    { label: "重做", icon: Redo2, action: () => editor?.chain().focus().redo().run() },
  ];
  const run = (task: Extract<AiTask, "rewrite" | "expand" | "condense" | "sensory" | "mentor">) => selection && onAiAction?.(task, selection);
  return <div className={`editor-shell ${focused ? "editor-shell-focus" : ""}`} style={{ "--editor-font-size": `${fontSize}px`, "--editor-line-height": lineHeight } as React.CSSProperties}>
    <div className="editor-toolbar">
      {tools.map(({ label, icon: Icon, action, active }) => <Tooltip key={label} label={label}><Button variant="icon" aria-label={label} className={active ? "tool-active" : ""} disabled={readOnly} onClick={action}><Icon size={17} /></Button></Tooltip>)}
      <label className="toolbar-select"><span className="sr-only">正文字号</span><select aria-label="正文字号" value={fontSize} onChange={(event) => setDisplay((current) => ({ ...current, fontSize: Number(event.target.value) }))}><option value="16">16 px</option><option value="18">18 px</option><option value="20">20 px</option><option value="22">22 px</option><option value="24">24 px</option></select></label>
      <label className="toolbar-select"><span className="sr-only">正文行距</span><select aria-label="正文行距" value={lineHeight} onChange={(event) => setDisplay((current) => ({ ...current, lineHeight: Number(event.target.value) }))}><option value="1.7">紧凑</option><option value="2.05">舒展</option><option value="2.35">宽松</option></select></label>
      <Tooltip label={focused ? "退出专注模式" : "进入专注模式"}><Button variant="icon" aria-label={focused ? "退出专注模式" : "进入专注模式"} onClick={() => { const next = !focused; setFocused(next); onFocusModeChange?.(next); }}>{focused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</Button></Tooltip>
    </div>
    {selection && <div className="selection-toolbar" aria-label="正文选区操作"><span>已选 {selection.text.length} 字</span>{[["rewrite", "改写"], ["expand", "扩写"], ["condense", "精简"], ["sensory", "感官细节"], ["mentor", "解释"]].map(([task, label]) => <Button key={task} variant={task === "mentor" ? "secondary" : "ghost"} onClick={() => run(task as Extract<AiTask, "rewrite" | "expand" | "condense" | "sensory" | "mentor">)}>{task === "mentor" && <Sparkles size={14} />}{label}</Button>)}</div>}
    <EditorContent data-testid="prose-editor" editor={editor} />
  </div>;
}
