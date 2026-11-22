"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ReadingInput() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function diagnose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const source = String(new FormData(event.currentTarget).get("source") ?? "").trim();
    if (!source || busy) return;
    setBusy(true);
    setError("");
    try {
      const { loadStoryStore, createStoryStore, saveStoryStore, createProjectDocument } = await import("@/lib/story-store");
      const store = loadStoryStore() ?? createStoryStore();
      const draft = createProjectDocument({ title: source.split(/\r?\n/)[0].slice(0, 18), genre: "随笔", logline: "" });
      const chapter = draft.chapters[0];
      chapter.content = source;
      chapter.wordCount = source.replace(/\s/g, "").length;
      draft.project.wordCount = chapter.wordCount;
      draft.project.status = "writing";
      draft.workflowStage = "complete";
      store.documents[draft.project.id] = draft;
      saveStoryStore(store);
      router.push(`/project/${draft.project.id}/analysis?read=1`);
    } catch {
      setError("这段文字未能保存在当前浏览器中，请检查本地存储后重试。");
      setBusy(false);
    }
  }
  return <form id="try-reading" onSubmit={diagnose} className="reading-input">
    <h2><label htmlFor="reading-source">贴一段你写的文字</label></h2>
    <textarea id="reading-source" name="source" required rows={5} placeholder="从第一句开始……" />
    <button disabled={busy}>{busy ? "正在打开作品…" : "开始诊断"}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
