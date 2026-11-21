import { describe, expect, it } from "vitest";
import { fixtureForTask } from "@/lib/ai/fixtures";
import type { AiTask, AiTaskInput, StoryContext } from "@/lib/ai/tasks";
import { validateTaskPayload } from "@/lib/ai/validation";

const project: StoryContext = {
  title: "雾港来信",
  genre: "纯文学短篇",
  logline: "一封迟到二十年的信，迫使守夜人重新选择离开或留下。",
  activeChapterId: "chapter-1",
  contextRevision: 7,
  chapters: [{
    id: "chapter-1",
    title: "第一章",
    content: "码头的钟停在凌晨三点十七分。他没有拆开那封信。",
    wordCount: 24,
    summary: "来信抵达",
    order: 0,
  }],
  characters: [{
    id: "character-1",
    name: "守夜人",
    role: "主角",
    desire: "离开雾港",
    flaw: "回避旧事",
    arc: "直面来信",
    fear: "重演失去",
    notes: "二十年前没有赴约",
    locked: true,
    order: 0,
  }],
  worldEntries: [],
  blueprint: [],
};

const retrievalEvidence = [{
  retrievalId: "knowledge-1",
  workId: "work-1",
  chunkType: "technique_explanation",
  content: "延宕通过推迟关键动作，使读者持续预期结果。",
  quote: "延宕通过推迟关键动作",
  sourceStatus: "verified" as const,
}];

const evidenceContext = {
  sourceText: project.chapters[0].content,
  evidenceText: project.chapters[0].content,
  answer: "我让人物把信封压在灯下，直到汽笛第二次响起。",
  candidate: { id: "candidate-1", text: "他把信封投入火盆，转身离开码头。", revision: 7 },
  retrievalEvidence,
};

function evidence() {
  return [
    { id: "e-user", source: "observation", quote: "他没有拆开那封信。", note: "当前章节原文" },
    { id: "e-knowledge", source: "knowledge", quote: "延宕通过推迟关键动作", retrievalId: "knowledge-1", note: "知识参考" },
    { id: "e-inference", source: "inference", claim: "人物可能在回避旧事", note: "文学推断" },
  ];
}

function graph() {
  return {
    nodes: [
      { id: "n-1", label: "守夜人", type: "character", evidenceIds: ["e-user"] },
      { id: "n-2", label: "来信", type: "concept", evidenceIds: ["e-user"] },
    ],
    edges: [{ id: "edge-1", source: "n-1", target: "n-2", label: "回避", evidenceIds: ["e-user"] }],
  };
}

function argumentativeGraph() {
  return {
    nodes: [
      { id: "concept-1", label: "核心概念", type: "concept", evidenceIds: ["e-user"] },
      { id: "argument-1", label: "中心论点", type: "argument", evidenceIds: ["e-user"] },
      { id: "evidence-1", label: "文本证据", type: "evidence", evidenceIds: ["e-user"] },
    ],
    edges: [
      { id: "argument-edge-1", source: "concept-1", target: "argument-1", label: "界定", evidenceIds: ["e-user"] },
      { id: "argument-edge-2", source: "evidence-1", target: "argument-1", label: "支持", evidenceIds: ["e-user"] },
    ],
  };
}

function analysisPayload() {
  const finding = (label: string) => ({ label, description: `${label}能够由原文动作验证。`, evidenceIds: ["e-user"] });
  return {
    sourceKind: "narrative",
    domainAnalysis: {
      kind: "narrative",
      characters: {
        goals: [finding("离开雾港")],
        actions: [finding("没有拆信")],
        relationshipChanges: [finding("人与来信由回避转为对峙")],
      },
      plot: {
        turningPoints: [finding("来信抵达")],
        setups: [finding("钟停在三点十七分")],
        payoffs: [finding("延迟拆信回收时间异常")],
      },
      themes: { stages: [{ stage: "来信抵达", theme: "回避", change: "从处境转为选择", reason: "人物用不拆信的行动回应过去。", evidenceIds: ["e-user"] }] },
    },
    analysis: [
      { id: "dimension-character", name: "人物关系", summary: "人物通过行动进入关系。", impact: "关系推动叙事。", suggestion: "核对关系变化。", score: 81, evidenceIds: ["e-user"] },
      { id: "dimension-plot", name: "情节结构", summary: "关键动作被延后。", impact: "维持悬念。", suggestion: "保留动作延迟。", score: 82, evidenceIds: ["e-user", "e-knowledge"] },
      { id: "dimension-theme", name: "主题演变", summary: "回避逐步显影。", impact: "主题进入人物选择。", suggestion: "回收前文意象。", score: 79, evidenceIds: ["e-user"] },
      { id: "dimension-style", name: "语言风格", summary: "动作句保持克制。", impact: "语调稳定。", suggestion: "比较关键句式。", score: 84, evidenceIds: ["e-user"] },
    ],
    evidence: evidence(),
    relationGraph: graph(),
    paceCurve: [{ segment: "开端", value: 42, evidenceId: "e-user" }],
    emotionCurve: [{ segment: "来信抵达", value: 68, evidenceId: "e-user" }],
    themeHeatmap: [{ theme: "回避", segment: "来信抵达", value: 76, evidenceId: "e-user" }],
    styleProfile: { metrics: [
      { key: "sentenceLength", dimension: "句长", value: 14, unit: "字", interpretation: "短句压缩动作时间。", evidenceIds: ["e-user"] },
      { key: "dialogueRatio", dimension: "对话比例", value: 0, unit: "%", interpretation: "无对话强化沉默。", evidenceIds: ["e-user"] },
      { key: "sensoryDensity", dimension: "感官密度", value: 58, unit: "%", interpretation: "视觉细节承载压力。", evidenceIds: ["e-user"] },
      { key: "rhetoric", dimension: "修辞", value: 45, unit: "分", interpretation: "时间意象形成反复。", evidenceIds: ["e-user"] },
      { key: "narrativeDistance", dimension: "叙事距离", value: 66, unit: "分", interpretation: "外部聚焦保持克制。", evidenceIds: ["e-user"] },
      { key: "rhythm", dimension: "节律", value: 72, unit: "分", interpretation: "停顿延后关键动作。", evidenceIds: ["e-user"] },
    ] },
    diagnostics: [{
      id: "diagnostic-1",
      criteriaIds: ["S2"],
      location: "第一章",
      quote: "他没有拆开那封信。",
      effect: "动作延迟形成悬念。",
      action: "此处铺垫不足：保留延宕，并在动作前补充一个环境反应。",
      confidence: 0.88,
      evidenceIds: ["e-user", "e-knowledge"],
      trainingExerciseId: "exercise-1",
    }],
    retrievalEvidence,
  };
}

describe("validateTaskPayload strict AI task contracts", () => {
  it("保留有原文证据的判定过程，逐条丢弃未知判据和非原文证据", () => {
    const payload = analysisPayload();
    const valid = { criteriaId: "S2", countedAt: ["e-user"], result: "fail", reason: "原文动作在结尾落点前被推迟。" };
    const invalid = [
      { ...valid, criteriaId: "Z999" },
      { ...valid, criteriaId: "C1" },
      { ...valid, countedAt: ["e-user", "missing"] },
      { ...valid, countedAt: ["e-user", "e-inference"] },
      { ...valid, countedAt: ["e-knowledge"] },
      { ...valid, countedAt: ["e-user", "e-user"] },
      { ...valid, result: "maybe" },
    ];
    const diagnostics = [{ ...payload.diagnostics[0], criteriaEvaluation: [...invalid, valid] }];
    expect(validateTaskPayload("analysis-v2", { ...payload, diagnostics }, project, "live", evidenceContext)).toMatchObject({
      diagnostics: [{ id: "diagnostic-1", criteriaEvaluation: [valid] }],
    });
  });

  it.each([undefined, null, {}, [{ criteriaId: "Z999" }]])("判定过程缺失或无有效项时保留诊断（%j）", (criteriaEvaluation) => {
    const payload = analysisPayload();
    const diagnostics = [{ ...payload.diagnostics[0], criteriaEvaluation }];
    const result = validateTaskPayload("analysis-v2", { ...payload, diagnostics }, project, "live", evidenceContext);
    expect(result).toMatchObject({ diagnostics: [{ id: "diagnostic-1" }] });
    expect(result && "diagnostics" in result ? result.diagnostics[0] : undefined).not.toHaveProperty("criteriaEvaluation");
  });

  it("accepts all six new task payloads", () => {
    const payloads: Array<[AiTask, unknown]> = [
      ["story-direction" as AiTask, {
        direction: {
          understanding: "人物在离开与留下之间犹疑。",
          recommendation: "让来信触发一个不可撤回的选择。",
          risks: ["过早解释来信内容"],
          question: "守夜人最害怕信中出现谁的名字？",
          suggestedTags: ["推进冲突", "埋设悬念"],
        },
      }],
      ["consistency-check" as AiTask, {
        consistencyReport: {
          candidateId: "model-must-not-control-this",
          contextRevision: 999,
          findings: [{
            id: "finding-1",
            category: "character",
            severity: "high",
            expectedFact: "守夜人回避旧事",
            candidateQuote: "转身离开码头",
            priorEvidence: "二十年前没有赴约",
            suggestion: "补足他突然销毁来信的动机。",
          }],
          checkedAt: "2026-08-20T00:00:00.000Z",
          mode: "live",
          userConfirmation: "none",
        },
      }],
      ["analysis-v2" as AiTask, analysisPayload()],
      ["knowledge-extract" as AiTask, {
        sourceKind: "narrative",
        knowledgeGraph: graph(),
        evidence: evidence(),
      }],
      ["image-parameter-recommendation" as AiTask, {
        imageRecommendation: {
          settings: {
            prompt: "雾港守夜人站在老式码头灯下，手持未拆封的信，克制的文学电影感",
            negativePrompt: "文字，水印，现代霓虹，过度磨皮",
            model: "story-forge-image-v1",
            size: "1024x1024",
            advanced: { steps: 28, guidance: 6.5, seedLocked: true, sampler: "dpmpp" },
          },
          reasons: { prompt: "保留人物、道具与环境的叙事关系。", size: "方形适合作品封面预览。" },
          confidence: 0.84,
        },
      }],
      ["training-feedback-v2" as AiTask, {
        trainingFeedback: {
          strengths: ["使用了具体动作"],
          evidenceQuotes: ["把信封压在灯下"],
          issues: ["环境阻力仍可更具体"],
          nextExperiment: "只增加一个声音细节，再比较节奏。",
          questions: ["第二次汽笛改变了人物什么决定？"],
          scores: [{ dimension: "动作设计", score: 78, reason: "动作清楚但后果未展开。" }],
        },
      }],
    ];

    for (const [task, payload] of payloads) {
      expect(validateTaskPayload(task, payload, project, "live", evidenceContext), task).not.toBeNull();
    }

    const consistency = validateTaskPayload(
      "consistency-check" as AiTask,
      payloads[1][1],
      project,
      "live",
      evidenceContext,
    );
    expect(consistency).toMatchObject({ consistencyReport: { candidateId: "candidate-1", contextRevision: 7 } });
  });

  it("rejects missing fields, invalid tags, ranges and replacement prose", () => {
    expect(validateTaskPayload("story-direction" as AiTask, {
      direction: { understanding: "理解", recommendation: "建议", risks: [], question: "问题", suggestedTags: ["不存在的标签"] },
    }, project, "live", evidenceContext)).toBeNull();

    const invalidAnalysis = analysisPayload();
    invalidAnalysis.diagnostics[0].confidence = 1.01;
    expect(validateTaskPayload("analysis-v2" as AiTask, invalidAnalysis, project, "live", evidenceContext)).toBeNull();

    expect(validateTaskPayload("image-parameter-recommendation" as AiTask, {
      imageRecommendation: {
        settings: { prompt: "", negativePrompt: "水印", model: "m", size: "1024x1024", advanced: {} },
        reasons: {},
        confidence: -0.1,
      },
    }, project, "live", evidenceContext)).toBeNull();

    expect(validateTaskPayload("training-feedback-v2" as AiTask, {
      trainingFeedback: {
        strengths: ["有动作"], evidenceQuotes: ["把信封压在灯下"], issues: ["问题"],
        nextExperiment: "实验", questions: ["问题？"], scores: [{ dimension: "动作", score: 101, reason: "越界" }],
        replacementProse: "一整段代写内容",
      },
    }, project, "live", evidenceContext)).toBeNull();

    expect(validateTaskPayload("training-feedback-v2" as AiTask, {
      trainingFeedback: {
        strengths: ["有动作"], evidenceQuotes: ["把信封压在灯下"], issues: ["问题"],
        nextExperiment: "实验", questions: ["问题？"], scores: [{ dimension: "动作可见性", score: 78, reason: "未注册的维度" }],
      },
    }, project, "live", evidenceContext)).toBeNull();
  });

  it("rejects shallow analysis domains and user-derived structures without observation evidence", () => {
    const shallow = analysisPayload() as Record<string, unknown>;
    delete shallow.domainAnalysis;
    expect(validateTaskPayload("analysis-v2", shallow, project, "live", evidenceContext)).toBeNull();

    const inferredGraph = analysisPayload();
    inferredGraph.relationGraph.nodes[0].evidenceIds = ["e-inference"];
    expect(validateTaskPayload("analysis-v2", inferredGraph, project, "live", evidenceContext)).toBeNull();

    const inferredCurve = analysisPayload();
    inferredCurve.paceCurve[0].evidenceId = "e-inference";
    expect(validateTaskPayload("analysis-v2", inferredCurve, project, "live", evidenceContext)).toMatchObject({
      paceCurve: [], degraded: expect.arrayContaining([expect.objectContaining({ path: "paceCurve[0].evidenceId" })]),
    });

    const incompleteStyle = analysisPayload();
    incompleteStyle.styleProfile.metrics = incompleteStyle.styleProfile.metrics.slice(0, 3);
    expect(validateTaskPayload("analysis-v2", incompleteStyle, project, "live", evidenceContext)).toBeNull();
  });

  it("rejects an internally valid analysis when it contradicts the trusted expected source kind", () => {
    const narrative = analysisPayload();
    const argumentative = fixtureForTask("analysis-v2", project, {
      sourceText: evidenceContext.sourceText,
      sourceKind: "argumentative",
    });

    expect(validateTaskPayload("analysis-v2", narrative, project, "live", {
      ...evidenceContext,
      expectedSourceKind: "argumentative",
    } as typeof evidenceContext & { expectedSourceKind: "argumentative" })).toBeNull();
    expect(validateTaskPayload("analysis-v2", argumentative, project, "live", {
      ...evidenceContext,
      expectedSourceKind: "narrative",
    } as typeof evidenceContext & { expectedSourceKind: "narrative" })).toBeNull();
  });

  it("rejects an empty-shell mentor and preserves closed RAG reference metadata", () => {
    const shell = { mentor: { thesis: "判断", evidence: [], craft: [], effect: [], consistency: [], experiments: [], questions: [], references: [] } };
    expect(validateTaskPayload("mentor", shell, project, "live", evidenceContext)).toBeNull();

    const mentor = { mentor: {
      thesis: "动作延迟让回避可见。",
      evidence: [{ quote: "他没有拆开那封信。", source: "observation" }],
      craft: ["延宕"], effect: ["维持张力"], consistency: ["与回避旧事一致"], experiments: ["比较拆句前后节奏"], questions: ["人物害怕什么？"],
      references: [{ title: "延宕技法", sourceTitle: "授权文学知识库", note: "技法说明", retrievalId: "knowledge-1", sourceStatus: "verified" }],
    } };
    expect(validateTaskPayload("mentor", mentor, project, "live", evidenceContext)).toEqual(mentor);
  });

  it("rejects evidence quotes that do not exist in user text or retrieval whitelist", () => {
    const fakeObservation = analysisPayload();
    fakeObservation.evidence[0] = { id: "e-user", source: "observation", quote: "原文中根本不存在的句子", note: "伪证据" };
    expect(validateTaskPayload("analysis-v2" as AiTask, fakeObservation, project, "live", evidenceContext)).toBeNull();

    const fakeKnowledge = analysisPayload();
    fakeKnowledge.evidence[1] = { id: "e-knowledge", source: "knowledge", quote: "延宕通过推迟关键动作", retrievalId: "unknown", note: "伪知识" };
    expect(validateTaskPayload("analysis-v2" as AiTask, fakeKnowledge, project, "live", evidenceContext)).toBeNull();

    const fakeAnswer = {
      trainingFeedback: {
        strengths: ["有动作"], evidenceQuotes: ["回答里不存在"], issues: ["问题"],
        nextExperiment: "实验", questions: ["问题？"], scores: [{ dimension: "动作", score: 50, reason: "一般" }],
      },
    };
    expect(validateTaskPayload("training-feedback-v2" as AiTask, fakeAnswer, project, "live", evidenceContext)).toBeNull();
  });

  it("accepts exact consistency evidence from an adjacent chapter summary without trusting unlocked facts", () => {
    const summaryEvidence = "旧码头的灯每逢退潮就会熄灭";
    const contextWithSummary: StoryContext = {
      ...project,
      chapters: [
        ...project.chapters,
        { id: "chapter-2", title: "第二章", content: "守夜人沿堤岸向北走。", wordCount: 10, summary: summaryEvidence, order: 1 },
      ],
      characters: [
        ...project.characters,
        { ...project.characters[0], id: "character-unlocked", name: "旧友", notes: "只有未锁定卡片知道的秘密", locked: false, order: 1 },
      ],
    };
    const payload = {
      consistencyReport: {
        findings: [{
          id: "finding-summary",
          category: "world",
          severity: "medium",
          expectedFact: "退潮时灯会熄灭",
          candidateQuote: "转身离开码头",
          priorEvidence: summaryEvidence,
          suggestion: "补充灯光变化。",
        }],
        checkedAt: "2026-08-21T00:00:00.000Z",
      },
    };

    expect(validateTaskPayload("consistency-check", payload, contextWithSummary, "live", evidenceContext)).not.toBeNull();

    payload.consistencyReport.findings[0].priorEvidence = "只有未锁定卡片知道的秘密";
    expect(validateTaskPayload("consistency-check", payload, contextWithSummary, "live", evidenceContext)).toBeNull();
  });

  it("does not treat a non-active chapter as the current observation source", () => {
    const otherChapterProject: StoryContext = {
      ...project,
      chapters: [...project.chapters, { id: "chapter-2", title: "第二章", content: "另一章中出现了独有句子。", wordCount: 13, summary: "另一章", order: 1 }],
    };
    const payload = analysisPayload();
    payload.evidence[0].quote = "另一章中出现了独有句子。";

    expect(validateTaskPayload("analysis-v2", payload, otherChapterProject, "live", {
      ...evidenceContext,
      sourceText: project.chapters[0].content,
      evidenceText: undefined,
    })).toBeNull();
  });

  it("uses an explicit evidence source exclusively instead of also trusting the active chapter", () => {
    const payload = analysisPayload();
    const explicitContext = {
      ...evidenceContext,
      sourceText: "本次明确提供的文本。",
      evidenceText: undefined,
    };

    expect(validateTaskPayload("analysis-v2", payload, project, "live", explicitContext)).toBeNull();

    payload.evidence[0].quote = "本次明确提供的文本。";
    payload.diagnostics[0].quote = "本次明确提供的文本。";
    expect(validateTaskPayload("analysis-v2", payload, project, "live", explicitContext)).not.toBeNull();
  });

  it("treats evidenceText-only as the explicit source and ignores blank sourceText", () => {
    const payload = analysisPayload();
    const evidenceOnly = "证据文本只写到窗台上的一粒盐。";
    payload.evidence[0].quote = evidenceOnly;
    payload.diagnostics[0].quote = evidenceOnly;

    expect(validateTaskPayload("analysis-v2", payload, project, "live", {
      ...evidenceContext,
      sourceText: "  ",
      evidenceText: evidenceOnly,
    })).not.toBeNull();

    payload.evidence[0].quote = project.chapters[0].content;
    payload.diagnostics[0].quote = project.chapters[0].content;
    expect(validateTaskPayload("analysis-v2", payload, project, "live", {
      ...evidenceContext,
      sourceText: "  ",
      evidenceText: evidenceOnly,
    })).toBeNull();
  });

  it("rejects dangling evidence references and graph endpoints", () => {
    const danglingEvidence = analysisPayload();
    danglingEvidence.analysis[0].evidenceIds = ["missing"];
    // 2026-11-19 变更：单条维度证据悬空 → 丢弃该维度，其余保留（契约 AC6 逐条裁定）。
    // 之前整包 null 会导致"一条坏证据毁掉全部诊断"。
    const rD = validateTaskPayload("analysis-v2" as AiTask, danglingEvidence, project, "live", evidenceContext) as { analysis?: Array<{ id: string }> } | null;
    expect(rD).not.toBeNull();
    expect(rD?.analysis?.some((d) => d.id === "dimension-character")).toBe(false);
    expect((rD?.analysis?.length ?? 0) > 0).toBe(true);

    const danglingNode = {
      sourceKind: "narrative",
      knowledgeGraph: graph(),
      evidence: evidence(),
    };
    danglingNode.knowledgeGraph.edges[0].target = "missing-node";
    // 2026-11-21 变更（设计变更，非放松）：knowledge-extract 从「全或无」改为逐项降级。
    // 理由：线上真实返回里只要有一条边引用了检索 id，整张图文谱就作废，
    // 黄金路径「上传作文看知识图谱」这一步直接走不通。现在丢坏边、留好节点。
    const danglingResult = validateTaskPayload("knowledge-extract" as AiTask, danglingNode, project, "live", evidenceContext) as { knowledgeGraph?: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> } } | null;
    expect(danglingResult).not.toBeNull();
    expect(danglingResult?.knowledgeGraph?.nodes.length).toBeGreaterThan(0);
    expect(danglingResult?.knowledgeGraph?.edges.some((edge) => edge.id === danglingNode.knowledgeGraph.edges[0].id)).toBe(false);

    const inferenceGraph = {
      sourceKind: "narrative",
      knowledgeGraph: graph(),
      evidence: evidence(),
    };
    inferenceGraph.knowledgeGraph.nodes[0].evidenceIds = ["e-inference"];
    // 断言改精确：不再要求整包 null，而是要求「只用推断证据撑起来的那个节点不得幸存」。
    // 防幻觉底线不变——编造的节点一条都活不下来；变的是局部坏不再连坐整体。
    const inferenceResult = validateTaskPayload("knowledge-extract" as AiTask, inferenceGraph, project, "live", evidenceContext) as { knowledgeGraph?: { nodes: Array<{ id: string }> } } | null;
    expect(inferenceResult?.knowledgeGraph?.nodes.some((node) => node.id === inferenceGraph.knowledgeGraph.nodes[0].id) ?? false).toBe(false);
  });

  it("builds deterministic fixtures that pass their own validator", () => {
    const fixtureInput: NonNullable<AiTaskInput["input"]> = {
      sourceText: evidenceContext.sourceText,
      evidenceText: evidenceContext.evidenceText,
      answer: evidenceContext.answer,
      candidate: evidenceContext.candidate,
      retrievalEvidence,
      currentImageSettings: {
        prompt: "雾港人物概念图",
        negativePrompt: "文字，水印",
        model: "story-forge-image-v1",
        size: "1024x1024",
        advanced: {},
      },
      sourceKind: "narrative",
    };
    const tasks = [
      "story-direction",
      "consistency-check",
      "analysis-v2",
      "knowledge-extract",
      "image-parameter-recommendation",
      "training-feedback-v2",
    ] as AiTask[];

    for (const task of tasks) {
      const first = fixtureForTask(task, project, fixtureInput);
      const second = fixtureForTask(task, project, fixtureInput);
      expect(second, task).toEqual(first);
      expect(validateTaskPayload(task, first, project, "demo", evidenceContext), task).not.toBeNull();
    }
  });

  it("keeps every legacy task fixture compatible with validation", () => {
    const legacyTasks = [
      "ideas", "characters", "world", "blueprint", "opening", "prose", "continue", "rewrite", "expand", "condense", "sensory",
      "analysis", "mentor", "visual-brief", "storyboard", "training",
    ] as AiTask[];
    const legacyInput: NonNullable<AiTaskInput["input"]> = { selectedText: "他没有拆开那封信。" };

    for (const task of legacyTasks) {
      const fixture = fixtureForTask(task, project, legacyInput);
      expect(validateTaskPayload(task, fixture, project, "demo", { evidenceText: legacyInput.selectedText }), task).not.toBeNull();
    }
  });

  it("keeps legacy analysis observations inside this request's allowed text", () => {
    const currentText = "本次作品只写到石阶上的一枚旧纽扣。";
    const currentProject: StoryContext = {
      ...project,
      title: "石阶",
      logline: "",
      chapters: [{ ...project.chapters[0], content: currentText }],
    };
    const fixture = fixtureForTask("analysis", currentProject, { selectedText: currentText });

    expect(JSON.stringify(fixture)).not.toContain("雾港");
    expect(JSON.stringify(fixture)).not.toContain("他没有拆开");
    expect(validateTaskPayload("analysis", fixture, currentProject, "demo", { evidenceText: currentText })).not.toBeNull();

    const forged = structuredClone(fixture) as { evidence: Array<{ quote: string }> };
    forged.evidence[0].quote = "他没有拆开那封信。";
    expect(validateTaskPayload("analysis", forged, currentProject, "live", { evidenceText: currentText })).toBeNull();
  });

  it("normalizes provider palette strings while rejecting malformed legacy visual briefs and storyboards", () => {
    expect(validateTaskPayload("visual-brief", {
      visualBrief: { title: "主视觉", subject: "守夜人", composition: "左侧构图", palette: "森林绿 / 信号金", atmosphere: "克制", negativePrompt: "水印" },
    }, project, "live", evidenceContext)).toMatchObject({ visualBrief: { palette: ["森林绿", "信号金"] } });
    expect(validateTaskPayload("visual-brief", {
      visualBrief: { title: "主视觉", subject: "守夜人", palette: ["森林绿"], atmosphere: "克制", negativePrompt: "水印" },
    }, project, "live", evidenceContext)).toBeNull();

    const validShots = Array.from({ length: 6 }, (_, index) => ({ shot: index + 1, framing: "中景", action: "人物动作", sound: "环境声", prompt: "文学电影镜头" }));
    const nullShot = [...validShots];
    nullShot[2] = null as never;
    expect(validateTaskPayload("storyboard", { storyboard: nullShot }, project, "live", evidenceContext)).toBeNull();
    expect(validateTaskPayload("storyboard", { storyboard: validShots.map((shot, index) => index === 1 ? { ...shot, prompt: "" } : shot) }, project, "live", evidenceContext)).toBeNull();
    expect(validateTaskPayload("storyboard", { storyboard: validShots.map((shot, index) => index === 5 ? { ...shot, shot: 1 } : shot) }, project, "live", evidenceContext)).toBeNull();
  });

  it("keeps existing project facts when a generation response omits editable fields", () => {
    const context: StoryContext = {
      ...project,
      characters: [{ ...project.characters[0], locked: false }],
      worldEntries: [{ id: "world-rules", category: "规则", label: "时间限制", content: "潮汐落下前必须离开矿坑。", locked: false, order: 0 }],
      blueprint: [{ id: "beat-1", title: "迟到的信", beatType: "开端", summary: "守夜人收到信。", active: true, locked: false, order: 0 }],
    };

    expect(validateTaskPayload("characters", { characters: [{ id: "character-1", role: "守夜人" }] }, context, "live")).toMatchObject({
      characters: [{ id: "character-1", name: "守夜人", desire: "离开雾港" }],
    });
    expect(validateTaskPayload("world", { worldEntries: [{ id: "world-rules", label: "时间限制" }] }, context, "live")).toMatchObject({
      worldEntries: [{ id: "world-rules", content: "潮汐落下前必须离开矿坑。" }],
    });
    expect(validateTaskPayload("blueprint", { blueprint: [{ id: "beat-1", title: "迟到的信" }] }, context, "live")).toMatchObject({
      blueprint: [{ id: "beat-1", summary: "守夜人收到信。", beatType: "开端" }],
    });
  });


  it("allows conceptual argumentative graphs and rejects narrative person nodes", () => {
    const validAnalysis = analysisPayload();
    validAnalysis.sourceKind = "argumentative";
    const argumentDomain = {
      kind: "argumentative",
      argument: {
        claims: [{ label: "中心论点", description: "概念关系必须回到文本证据。", evidenceIds: ["e-user"] }],
        evidenceUnits: [{ label: "论据", description: "未拆信动作构成当前文本证据。", evidenceIds: ["e-user"] }],
        reasoningSteps: [{ label: "推理", description: "由行动延迟推到人物回避。", evidenceIds: ["e-user"] }],
      },
      themes: { stages: [{ stage: "当前段", theme: "证据边界", change: "由材料进入判断", reason: "判断由逐字证据支持。", evidenceIds: ["e-user"] }] },
    };
    (validAnalysis as unknown as { domainAnalysis: unknown }).domainAnalysis = argumentDomain;
    validAnalysis.relationGraph = argumentativeGraph();
    validAnalysis.analysis = [
      { id: "dimension-argument", name: "论证结构", summary: "概念支持主张。", impact: "论证可追踪。", suggestion: "补足推理连接。", score: 80, evidenceIds: ["e-user"] },
      { id: "dimension-evidence", name: "证据链", summary: "证据来自文本。", impact: "边界清晰。", suggestion: "增加反例检验。", score: 78, evidenceIds: ["e-user"] },
      { id: "dimension-theme", name: "主题演变", summary: "主题逐步展开。", impact: "概念有演进。", suggestion: "标出限制条件。", score: 76, evidenceIds: ["e-user"] },
      { id: "dimension-style", name: "语言风格", summary: "判断句稳定。", impact: "概念集中。", suggestion: "加入具体例证。", score: 75, evidenceIds: ["e-user"] },
    ];
    expect(validateTaskPayload("analysis-v2", validAnalysis, project, "live", evidenceContext)).not.toBeNull();

    const invalidAnalysis = analysisPayload();
    invalidAnalysis.sourceKind = "argumentative";
    (invalidAnalysis as unknown as { domainAnalysis: unknown }).domainAnalysis = argumentDomain;
    invalidAnalysis.relationGraph = graph();
    expect(validateTaskPayload("analysis-v2", invalidAnalysis, project, "live", evidenceContext)).toBeNull();

    expect(validateTaskPayload("knowledge-extract", {
      sourceKind: "argumentative",
      knowledgeGraph: argumentativeGraph(),
      evidence: evidence(),
    }, project, "live", evidenceContext)).not.toBeNull();
    // 同上：叙事专有的人/事件节点不得出现在论证图里，但合法的概念节点可以留下。
    const narrativeAsArgument = validateTaskPayload("knowledge-extract", {
      sourceKind: "argumentative",
      knowledgeGraph: graph(),
      evidence: evidence(),
    }, project, "live", evidenceContext) as { knowledgeGraph?: { nodes: Array<{ id: string; type: string }> } } | null;
    expect(narrativeAsArgument?.knowledgeGraph?.nodes.some((node) => node.type === "character" || node.type === "event") ?? false).toBe(false);
  });
});
