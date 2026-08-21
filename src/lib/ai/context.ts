import type { AiContextPacket, AiContextSection, AiContextSectionKind, RetrievalEvidence, StoryState } from "@/lib/types";
import type { StoryContext } from "@/lib/ai/tasks";

interface ContextOptions {
  instruction: string;
  selection?: string;
  maxCharacters?: number;
  retrievalEvidence?: RetrievalEvidence[];
}

function joinNonEmpty(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).join("\n");
}

function projectSettingsContent(title: string, genre: string, logline: string, characters: StoryState["characters"], worldEntries: StoryState["worldEntries"], blueprint: StoryState["blueprint"]) {
  return joinNonEmpty([
    `作品：${title}｜体裁：${genre}`,
    logline ? `一句话灵感：${logline}` : undefined,
    ...characters.filter((item) => !item.locked).map((item) => `人物设定｜${item.name}：身份 ${item.role}；欲望 ${item.desire}；缺陷 ${item.flaw}；弧光 ${item.arc}；恐惧 ${item.fear}；备注 ${item.notes}`),
    ...worldEntries.filter((item) => !item.locked).map((item) => `世界观设定｜${item.category}·${item.label}：${item.content}`),
    ...blueprint.filter((item) => !item.locked).map((item) => `蓝图设定｜${item.beatType}·${item.title}：${item.summary}`),
  ]);
}

function section(kind: AiContextSectionKind, label: string, content: string): AiContextSection {
  return { kind, label, content, originalCharacters: content.length, usedCharacters: content.length, trimmed: false };
}

function retrievalKnowledge(evidence: RetrievalEvidence[] | undefined) {
  if (!evidence?.length) return "";
  return [
    "以下内容是知识参考，不是用户原文；不得把它当作用户已写事实。",
    ...evidence.map((item) => `[${item.retrievalId}/${item.sourceStatus}] ${item.chunkType}｜${item.quote}${item.sourceUrl ? `｜来源 ${item.sourceUrl}` : ""}${item.similarity === undefined ? "" : `｜相似度 ${item.similarity.toFixed(3)}`}｜${item.content}`),
  ].join("\n");
}

function buildPacket(revision: number, chapters: StoryState["chapters"], characters: StoryState["characters"], worldEntries: StoryState["worldEntries"], blueprint: StoryState["blueprint"], settingsContent: string, knowledgeContent: string, activeChapterId: string, options: ContextOptions): AiContextPacket {
  const maxCharacters = options.maxCharacters ?? 12_000;
  const activeIndex = Math.max(0, chapters.findIndex((chapter) => chapter.id === activeChapterId));
  const active = chapters[activeIndex];
  const adjacentIds = new Set([chapters[activeIndex - 1]?.id, chapters[activeIndex + 1]?.id].filter(Boolean));
  const instruction = joinNonEmpty([
    options.instruction ? `用户指令：${options.instruction}` : undefined,
    options.selection ? `正文选区：${options.selection}` : undefined,
  ]);
  const locked = section("locked-facts", "锁定事实", joinNonEmpty([
    ...characters.filter((item) => item.locked).map((item) => `人物｜${item.name}：身份 ${item.role}；欲望 ${item.desire}；恐惧 ${item.fear}；备注 ${item.notes}`),
    ...worldEntries.filter((item) => item.locked).map((item) => `世界｜${item.category}·${item.label}：${item.content}`),
    ...blueprint.filter((item) => item.locked).map((item) => `蓝图｜${item.beatType}·${item.title}：${item.summary}`),
  ]));
  const raw = [
    locked,
    section("instruction", "用户指令 / 选区", instruction),
    section("story-settings", "当前创作设定", settingsContent),
    section("active-chapter", "当前章节", joinNonEmpty([active?.title, active?.content])),
    section("adjacent-summaries", "相邻章节摘要", chapters.filter((chapter) => adjacentIds.has(chapter.id)).map((chapter) => `${chapter.title}：${chapter.summary || "暂无摘要"}`).join("\n")),
    section("other-summaries", "其他章节摘要", chapters.filter((chapter) => chapter.id !== active?.id && !adjacentIds.has(chapter.id)).map((chapter) => `${chapter.title}：${chapter.summary || "暂无摘要"}`).join("\n")),
    section("knowledge", "知识参考", knowledgeContent),
  ];
  if (locked.originalCharacters > maxCharacters) return { revision, maxCharacters, usedCharacters: locked.originalCharacters, remainingCharacters: 0, blocked: true, warning: `锁定事实共 ${locked.originalCharacters} 字，已超过 ${maxCharacters} 字上限。请解除部分锁定或精简内容后重试。`, sections: raw };
  let remaining = maxCharacters;
  const sections = raw.map((item) => {
    const content = item.content.slice(0, Math.max(0, remaining));
    remaining -= content.length;
    return { ...item, content, usedCharacters: content.length, trimmed: content.length < item.originalCharacters };
  });
  return { revision, maxCharacters, usedCharacters: maxCharacters - remaining, remainingCharacters: Math.max(0, remaining), blocked: false, warning: sections.some((item) => item.trimmed) ? "低优先级上下文已按预算裁剪，详情可见。" : undefined, sections };
}

export function buildAiContextPacket(state: StoryState, options: ContextOptions): AiContextPacket {
  const project = state.projects.find((item) => item.id === state.activeProjectId) ?? state.projects[0];
  const knowledgeContent = joinNonEmpty([
    retrievalKnowledge(options.retrievalEvidence),
    state.knowledge.nodes.filter((node) => node.type === "work").map((node) => `${node.label}：${node.description ?? ""}`).join("\n"),
  ]);
  return buildPacket(state.contextRevision, state.chapters, state.characters, state.worldEntries, state.blueprint, projectSettingsContent(project?.title ?? "未命名作品", project?.genre ?? "", project?.logline ?? "", state.characters, state.worldEntries, state.blueprint), knowledgeContent, state.activeChapterId, options);
}

export function buildAiContextPacketFromStoryContext(context: StoryContext, options: ContextOptions): AiContextPacket {
  return buildPacket(context.contextRevision, context.chapters, context.characters, context.worldEntries, context.blueprint, projectSettingsContent(context.title, context.genre, context.logline, context.characters, context.worldEntries, context.blueprint), retrievalKnowledge(options.retrievalEvidence), context.activeChapterId, options);
}
