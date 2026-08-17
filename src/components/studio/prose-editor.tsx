"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Redo2, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const toHtml = (text: string) => text.split(/\n\n+/).map((paragraph) => `<p>${paragraph}</p>`).join("");

export function ProseEditor({ content, onChange }: { content: string; onChange: (content: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: toHtml(content),
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(current.getText({ blockSeparator: "\n\n" })),
    editorProps: { attributes: { class: "prose-surface", "aria-label": "正文编辑器" } },
  });
  useEffect(() => {
    if (editor && editor.getText({ blockSeparator: "\n\n" }) !== content) editor.commands.setContent(toHtml(content), { emitUpdate: false });
  }, [content, editor]);
  const tools = [
    { label: "加粗", icon: Bold, action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive("bold") },
    { label: "斜体", icon: Italic, action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive("italic") },
    { label: "撤销", icon: Undo2, action: () => editor?.chain().focus().undo().run() },
    { label: "重做", icon: Redo2, action: () => editor?.chain().focus().redo().run() },
  ];
  return <div className="editor-shell"><div className="editor-toolbar">{tools.map(({ label, icon: Icon, action, active }) => <Tooltip key={label} label={label}><Button variant="icon" aria-label={label} className={active ? "tool-active" : ""} onClick={action}><Icon size={17} /></Button></Tooltip>)}<span className="toolbar-note">正文 · 中文衬线阅读模式</span></div><EditorContent data-testid="prose-editor" editor={editor} /></div>;
}
