import type { ProjectDocument, StoryStore } from "@/lib/story-store";
import { initialStoryState } from "./story-state";
import cases from "../../incoming/demo_projects/demo_cases.json";

type DemoCase = {
  id: string;
  is_primary_defense_case: boolean;
  title: string;
  genre: string;
  logline: string;
  worldbuilding: { era: string; location: string; social_background: string; core_rules: string };
  character_cards: Array<{ id: string; name: string; role: string; traits: string[]; desire: string; fear?: string; internal_conflict?: string }>;
  blueprint_5_stages: Array<{ stage: string; name: string; summary: string }>;
  analysis_focus: { character_network: string; thematic_depth: string; imagery_system: string[] };
};

function createImportedDemoDocument(source: DemoCase): ProjectDocument {
  const id = source.is_primary_defense_case ? "fixture" : "fixture-other";
  const chapterContent = source.blueprint_5_stages.slice(0, 3).map((beat) => `${beat.name}。${beat.summary}`).join("\n\n");
  const evidence = source.blueprint_5_stages.slice(0, 3).map((beat, index) => ({ id: `E${index + 1}`, source: index === 1 ? "knowledge" as const : "user" as const, quote: beat.summary, note: index === 1 ? "该转折对应当前蓝图中的因果推进。" : "来自当前作品的已导入答辩素材。", chapter: "第一章" }));
  const dimensions = ["人物", "情节", "主题", "意象", "语言", "情绪"].map((name, index) => ({ id: `analysis-${index + 1}`, name, summary: index === 0 ? source.analysis_focus.character_network : index === 1 ? "五段式蓝图已形成明确的推进层次。" : index === 2 ? source.analysis_focus.thematic_depth : `${source.analysis_focus.imagery_system[index % source.analysis_focus.imagery_system.length]}形成可追踪的写作线索。`, impact: "可在诊断页继续核对文本证据与下一步修改方向。", suggestion: "下一稿保留一个具体动作或声音细节，让设定进入人物选择。", score: 78 + (index % 3) * 4, evidenceIds: [evidence[index % evidence.length]?.id ?? "E1"] }));
  const characterNodes = source.character_cards.map((character) => ({ id: character.id, label: character.name, type: "character" as const }));
  return {
    dialogueThreads: [], analysisSnapshots: [], consistencyReports: [], trainingAttemptRefs: [],
    imageGenerationSettings: structuredClone(initialStoryState.imageGenerationSettings),
    project: { id, title: source.title, genre: source.genre, logline: source.logline, updatedAt: "已导入答辩案例", wordCount: chapterContent.replace(/\s/g, "").length, status: "writing" },
    activeChapterId: `${id}-chapter-1`,
    contextRevision: 1,
    workflowStage: "complete",
    chapters: [{ id: `${id}-chapter-1`, title: source.blueprint_5_stages[0]?.name ?? "第一章", content: chapterContent, wordCount: chapterContent.replace(/\s/g, "").length, summary: source.blueprint_5_stages[0]?.summary ?? "", order: 0 }],
    characters: source.character_cards.map((character, index) => ({ id: character.id, name: character.name, role: character.role, desire: character.desire, flaw: character.traits[0] ?? "未填写", arc: character.internal_conflict ?? character.traits.join("、"), fear: character.fear ?? "", notes: character.traits.join("、"), locked: index === 0, order: index })),
    worldEntries: [
      { id: `${id}-world-era`, category: "时代", label: "时间", content: source.worldbuilding.era, locked: true, order: 0 },
      { id: `${id}-world-place`, category: "地点", label: "地点", content: source.worldbuilding.location, locked: true, order: 1 },
      { id: `${id}-world-rules`, category: "规则", label: "核心规则", content: source.worldbuilding.core_rules, locked: true, order: 2 },
      { id: `${id}-world-atmosphere`, category: "氛围", label: "社会背景", content: source.worldbuilding.social_background, locked: false, order: 3 },
    ],
    blueprint: source.blueprint_5_stages.map((beat, index) => ({ id: `${id}-blueprint-${index + 1}`, title: beat.name, beatType: beat.stage, summary: beat.summary, active: index === 0, locked: index === 0, order: index })),
    candidates: [{
      id: `${id}-candidate-snapshot`,
      label: "声音线索推进",
      content: "风穿过废弃输送带时，旧钢索发出一个不属于草原的低音。杭盖停下录音，第一次在噪声里听见舅舅年轻时哼过的曲调。",
      rationale: "以声音线索连接人物记忆与工业遗址。",
      tags: ["案例快照", "声音叙事"],
      status: "pending",
      target: { type: "chapter", id: `${id}-chapter-1` },
      applyMode: "append",
      generatedRevision: 0,
      mode: "demo",
    }],
    ipAssets: [],
    versions: [{ id: `${id}-version-1`, versionNo: 1, chapterId: `${id}-chapter-1`, content: chapterContent, source: "manual", createdAt: "已导入" }],
    evidence,
    analysis: dimensions,
    characterGraph: { nodes: characterNodes, edges: characterNodes.slice(1).map((node, index) => ({ id: `${id}-relation-${index + 1}`, source: characterNodes[0]?.id ?? node.id, target: node.id, label: index === 0 ? "核心关系" : "共同处境" })) },
    knowledge: structuredClone(initialStoryState.knowledge),
    plotCurve: source.blueprint_5_stages.map((beat, index) => ({ beat: beat.name, value: 25 + index * 16, evidenceId: evidence[index % evidence.length]?.id ?? "E1" })),
    emotionCurve: source.blueprint_5_stages.map((beat, index) => ({ beat: beat.name, value: -35 + index * 18, evidenceId: evidence[index % evidence.length]?.id ?? "E1" })),
  };
}

export function createFixtureStore(): StoryStore {
  const entries = cases.map(source => createImportedDemoDocument(source));
  entries.sort((a, b) => Number(b.project.id === "fixture") - Number(a.project.id === "fixture"));
  return { version: 3, documents: Object.fromEntries(entries.map(document => [document.project.id, document])) };
}
