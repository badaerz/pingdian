import type { StoryState } from "@/lib/types";

export const initialStoryState: StoryState = {
  projects: [], activeProjectId: "", activeChapterId: "", contextRevision: 1, workflowStage: "inspiration",
  chapters: [], characters: [], worldEntries: [], blueprint: [], candidates: [], versions: [], ipAssets: [],
  dialogueThreads: [], imageGenerationSettings: { prompt: "", negativePrompt: "", model: "Qwen/Qwen-Image", size: "1328x1328", advanced: {} },
  analysisSnapshots: [], consistencyReports: [], trainingAttemptRefs: [], evidence: [], analysis: [],
  characterGraph: { nodes: [], edges: [] }, plotCurve: [], emotionCurve: [],
  knowledge: {
    nodes: [
      { id: "w-lu", label: "故乡", type: "work", era: "现代", themes: ["孤独", "归乡"], techniques: ["意象复沓"], description: "以故乡空间组织人物记忆与疏离。" },
      { id: "a-lu", label: "鲁迅", type: "author", description: "现代文学作家。" },
      { id: "t-alone", label: "孤独", type: "theme", era: "现代", themes: ["孤独"] },
      { id: "k-image", label: "意象复沓", type: "technique", era: "现代", techniques: ["意象复沓"] },
      { id: "w-bian", label: "边城", type: "work", era: "现代", themes: ["乡土", "等待"], techniques: ["环境叙事"], description: "自然节律与人物命运并置。" },
      { id: "a-shen", label: "沈从文", type: "author", description: "现代文学作家。" },
      { id: "t-wait", label: "等待", type: "theme", era: "现代", themes: ["等待"] },
      { id: "k-env", label: "环境叙事", type: "technique", era: "现代", techniques: ["环境叙事"] },
      { id: "w-live", label: "活着", type: "work", era: "当代", themes: ["苦难", "生命"], techniques: ["克制叙述"], description: "以平静语调承载连续命运转折。" },
      { id: "a-yu", label: "余华", type: "author", description: "当代文学作家。" },
    ],
    edges: [
      { id: "e1", source: "w-lu", target: "a-lu", label: "作者" },
      { id: "e2", source: "w-lu", target: "t-alone", label: "主题" },
      { id: "e3", source: "w-lu", target: "k-image", label: "技法" },
      { id: "e4", source: "w-bian", target: "a-shen", label: "作者" },
      { id: "e5", source: "w-bian", target: "t-wait", label: "主题" },
      { id: "e6", source: "w-bian", target: "k-env", label: "技法" },
      { id: "e7", source: "w-live", target: "a-yu", label: "作者" },
    ],
  },
};
