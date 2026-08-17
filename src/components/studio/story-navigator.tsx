"use client";

import { ChevronRight, LockKeyhole } from "lucide-react";
import { useStory } from "@/providers/story-provider";
import { useState } from "react";

export function StoryNavigator() {
  const { state } = useStory();
  const [chapterId, setChapterId] = useState(state.chapters[0].id);
  const [characterId, setCharacterId] = useState<string | null>(null);
  return <aside className="story-navigator" aria-label="作品结构"><section><div className="section-label"><span>章节</span><span>{state.chapters.length}</span></div><div className="chapter-list">{state.chapters.map((chapter, index) => <button key={chapter.id} className={chapter.id === chapterId ? "chapter-active" : ""} aria-pressed={chapter.id === chapterId} onClick={() => setChapterId(chapter.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{chapter.title}</strong><small>{chapter.wordCount || "空白"} 字</small></div><ChevronRight size={15} /></button>)}</div></section><section><div className="section-label"><span>人物</span><span>{state.characters.length}</span></div><div className="compact-list">{state.characters.map((character) => <button key={character.id} className={character.id === characterId ? "character-active" : ""} aria-pressed={character.id === characterId} onClick={() => setCharacterId(character.id)}><span className="initial">{character.name[0]}</span><span><strong>{character.name}</strong><small>{character.role}</small></span><LockKeyhole size={13} /></button>)}</div></section><section><div className="section-label"><span>故事蓝图</span><span>5</span></div><ol className="blueprint-list">{state.blueprint.map((node, index) => <li key={node.id} className={node.active ? "active" : ""}><span>{index + 1}</span><div><strong>{node.title}</strong><small>{node.beatType}</small></div></li>)}</ol></section></aside>;
}
