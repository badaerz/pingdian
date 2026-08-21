import knowledgeData from "../../../incoming/knowledge/literary_knowledge_base.json";
import { supplementalKnowledgeRecords } from "@/lib/knowledge/supplemental";
import type { GraphEdge, GraphNode, KnowledgeGraph } from "@/lib/types";

export type KnowledgeSourceStatus = "verified" | "pending" | "summary_only";

export interface KnowledgeRecord {
  id: string;
  title: string;
  author: string;
  era: string;
  genre: string;
  summary: string;
  themes: string[];
  techniques: string[];
  sourceStatus: KnowledgeSourceStatus;
  authorized?: boolean;
  sourceUrl?: string;
  sourceChunks?: string[];
  deconstruction: {
    plot: Array<{ stage: string; description: string }>;
    imagery: string[];
    selectedText: string;
    explanation: string;
    trainingPrompt: string;
  };
}

type RawKnowledgeRecord = {
  id: string;
  title: string;
  author: string;
  era: string;
  genre: string;
  core_summary: string;
  themes?: { main_theme?: string; sub_themes?: string[] };
  techniques_and_craft?: { narrative_perspective?: string; literary_devices?: Array<{ name?: string }> };
  plot_blueprint?: Array<{ stage?: string; description?: string }>;
  imagery_and_symbols?: Array<{ imagery?: string }>;
  why_write_this_way_case?: { selected_text?: string; literary_analysis?: string; writing_advice?: string };
  training_prompts?: { show_dont_tell_exercise?: string; imitation_exercise?: string };
  source_status?: "verified" | "pending" | "summary_only";
  copyright?: { source_url?: string; source_status?: "verified" | "pending" | "summary_only" };
};

function sourceStatus(value: unknown): KnowledgeSourceStatus {
  return value === "verified" || value === "summary_only" ? value : "pending";
}

const primaryKnowledgeRecords: KnowledgeRecord[] = (knowledgeData as RawKnowledgeRecord[]).map((item) => ({
  id: item.id,
  title: item.title,
  author: item.author,
  era: item.era,
  genre: item.genre,
  summary: item.core_summary,
  themes: [item.themes?.main_theme, ...(item.themes?.sub_themes ?? [])].filter((value): value is string => Boolean(value)),
  techniques: [item.techniques_and_craft?.narrative_perspective, ...(item.techniques_and_craft?.literary_devices ?? []).map((device) => device.name)].filter((value): value is string => Boolean(value)),
  sourceStatus: sourceStatus(item.source_status ?? item.copyright?.source_status),
  authorized: (item.copyright as { status?: string } | undefined)?.status === "public_domain",
  sourceUrl: item.copyright?.source_url,
  deconstruction: {
    plot: (item.plot_blueprint ?? []).filter((part): part is { stage: string; description: string } => Boolean(part?.stage && part?.description)).map((part) => ({ stage: part.stage, description: part.description })),
    imagery: (item.imagery_and_symbols ?? []).map((item) => item.imagery).filter((value): value is string => Boolean(value)),
    selectedText: item.why_write_this_way_case?.selected_text ?? "",
    explanation: item.why_write_this_way_case?.literary_analysis ?? "",
    trainingPrompt: item.training_prompts?.imitation_exercise ?? item.training_prompts?.show_dont_tell_exercise ?? "",
  },
}));

export const knowledgeRecords: KnowledgeRecord[] = [...primaryKnowledgeRecords, ...supplementalKnowledgeRecords];

export function filterKnowledgeRecords(records: KnowledgeRecord[], filters: { era?: string; theme?: string; technique?: string }) {
  return records.filter((record) => (!filters.era || record.era.includes(filters.era)) && (!filters.theme || record.themes.some((theme) => theme.includes(filters.theme!))) && (!filters.technique || record.techniques.some((technique) => technique.includes(filters.technique!))));
}

export function createKnowledgeGraph(records: KnowledgeRecord[]): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const addNode = (node: GraphNode) => { if (!nodes.has(node.id)) nodes.set(node.id, node); };
  records.forEach((record) => {
    const workId = `work-${record.id}`;
    addNode({ id: workId, label: record.title, type: "work", era: record.era, themes: record.themes, techniques: record.techniques, description: record.summary });
    const authorId = `author-${record.author}`;
    addNode({ id: authorId, label: record.author, type: "author", description: `${record.author} 的代表作品与写作语境` });
    edges.push({ id: `${workId}-${authorId}`, source: workId, target: authorId, label: "作者" });
    record.themes.slice(0, 3).forEach((theme) => {
      const themeId = `theme-${theme}`;
      addNode({ id: themeId, label: theme, type: "theme" });
      edges.push({ id: `${workId}-${themeId}`, source: workId, target: themeId, label: "主题" });
    });
    record.techniques.slice(0, 3).forEach((technique) => {
      const techniqueId = `technique-${technique}`;
      addNode({ id: techniqueId, label: technique, type: "technique" });
      edges.push({ id: `${workId}-${techniqueId}`, source: workId, target: techniqueId, label: "技法" });
    });
  });
  return { nodes: [...nodes.values()], edges };
}
