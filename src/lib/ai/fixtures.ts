import { initialStoryState } from "@/data/mock-data";
import { resolveAiSourceText } from "@/lib/ai/story-context";
import type { AiEvidence, BlueprintNode, Candidate, Character, KnowledgeGraph, StoryState } from "@/lib/types";
import type { AiTask, AiTaskInput, AiTaskPayload, StoryContext } from "@/lib/ai/tasks";

function candidates(task: "ideas" | "opening" | "prose" | "continue" | "rewrite" | "expand" | "condense" | "sensory", context: StoryContext): Candidate[] {
  const anchor = context.chapters.at(-1)?.content.trim().slice(-80) || context.logline || context.title;
  const target = { type: "chapter" as const, id: context.activeChapterId };
  return [
    { id: `demo-${task}-1`, label: "克制推进", content: `夜色没有立刻回答。${anchor}，人物先做了一个无法收回的小动作。`, rationale: "保持当前意象与叙述节奏，用行动推进悬念。", tags: ["演示", "行动"], status: "pending", target, applyMode: task === "continue" || task === "ideas" || task === "opening" ? "append" : "replace-selection", generatedRevision: context.contextRevision, mode: "demo" },
    { id: `demo-${task}-2`, label: "关系转折", content: `门外的人终于开口，却只叫出了${context.title}里一个尚未解释的名字。`, rationale: "引入关系线索，但不提前解释核心谜底。", tags: ["演示", "关系"], status: "pending", target, applyMode: task === "continue" || task === "ideas" || task === "opening" ? "append" : "replace-selection", generatedRevision: context.contextRevision, mode: "demo" },
  ];
}

function quoteFrom(value: string | undefined, maximum = 80) {
  const trimmed = value?.trim() ?? "";
  return trimmed.slice(0, maximum);
}

function sourceText(context: StoryContext, input: AiTaskInput["input"]) {
  return resolveAiSourceText(input, context.chapters.find((chapter) => chapter.id === context.activeChapterId)?.content)?.trim() ?? "";
}

function sourceSegments(value: string) {
  const paragraphs = value.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length >= 2) return paragraphs.slice(0, 3).map((text, index) => ({ label: ["开端", "发展", "转折"][index], text }));
  const characters = Array.from(value.trim());
  if (characters.length < 12) return [{ label: "当前片段", text: value.trim() }];
  const size = Math.ceil(characters.length / 3);
  return [0, 1, 2].map((index) => ({ label: ["开端", "发展", "转折"][index], text: characters.slice(index * size, (index + 1) * size).join("").trim() })).filter((item) => item.text);
}

function analysisEvidence(context: StoryContext, input: AiTaskInput["input"]): AiEvidence[] {
  const fullSource = sourceText(context, input);
  const segments = sourceSegments(fullSource);
  const evidence: AiEvidence[] = [{ id: "demo-observation-1", source: "observation", quote: quoteFrom(fullSource), note: "本次分析来源的逐字文本证据。" }];
  segments.slice(1).forEach((segment, index) => evidence.push({ id: `demo-observation-${index + 2}`, source: "observation", quote: quoteFrom(segment.text), note: `${segment.label}的逐字文本证据，仅来自本次分析来源。` }));
  const retrieval = input?.retrievalEvidence?.[0];
  if (retrieval) evidence.push({ id: "demo-knowledge-1", source: "knowledge", quote: retrieval.quote, retrievalId: retrieval.retrievalId, note: "知识参考与用户原文分离。" });
  return evidence;
}

function analysisGraph(sourceKind: "narrative" | "argumentative" = "narrative", context?: StoryContext, input?: AiTaskInput["input"]): KnowledgeGraph {
  if (sourceKind === "argumentative") {
    return {
      nodes: [
        { id: "demo-concept-1", label: "核心概念", type: "concept", evidenceIds: ["demo-observation-1"] },
        { id: "demo-argument-1", label: "中心论点", type: "argument", evidenceIds: ["demo-observation-1"] },
        { id: "demo-evidence-1", label: "文本证据", type: "evidence", evidenceIds: ["demo-observation-1"] },
      ],
      edges: [
        { id: "demo-argument-edge-1", source: "demo-concept-1", target: "demo-argument-1", label: "界定", evidenceIds: ["demo-observation-1"], confidence: 0.72 },
        { id: "demo-argument-edge-2", source: "demo-evidence-1", target: "demo-argument-1", label: "支持", evidenceIds: ["demo-observation-1"], confidence: 0.72 },
      ],
    };
  }
  const text = context ? sourceText(context, input) : "";
  const mentioned = context?.characters.filter((character) => text.includes(character.name)).slice(0, 3) ?? [];
  const characterNodes = mentioned.length
    ? mentioned.map((character) => ({ id: `demo-character-${character.id}`, label: character.name, type: "character" as const, evidenceIds: ["demo-observation-1"] }))
    : [{ id: "demo-character-subject", label: "文本主体", type: "character" as const, evidenceIds: ["demo-observation-1"] }];
  return {
    nodes: [
      ...characterNodes,
      { id: "demo-event-1", label: "关键行动", type: "event", evidenceIds: ["demo-observation-1"] },
      { id: "demo-place-1", label: "叙事场域", type: "place", evidenceIds: ["demo-observation-1"] },
    ],
    edges: [
      ...characterNodes.map((node, index) => ({ id: `demo-character-edge-${index + 1}`, source: node.id, target: "demo-event-1", label: "参与", evidenceIds: ["demo-observation-1"], confidence: 0.68 })),
      { id: "demo-setting-edge-1", source: "demo-event-1", target: "demo-place-1", label: "发生于", evidenceIds: ["demo-observation-1"], confidence: 0.64 },
    ],
  };
}

export function fixtureForTask(task: AiTask, context: StoryContext, input?: AiTaskInput["input"]): AiTaskPayload {
  const characters: Character[] = context.characters.length ? context.characters : initialStoryState.characters.slice(0, 2);
  const blueprint: BlueprintNode[] = context.blueprint.length ? context.blueprint : initialStoryState.blueprint;
  switch (task) {
    case "ideas":
    case "opening":
    case "prose":
    case "continue":
    case "rewrite":
    case "expand":
    case "condense":
    case "sensory":
      return { candidates: candidates(task, context) };
    case "characters":
      return { characters };
    case "world":
      return { worldEntries: context.worldEntries.length ? context.worldEntries : initialStoryState.worldEntries };
    case "blueprint":
      return { blueprint };
    case "analysis":
      if (!sourceText(context, input)) {
        return { analysis: [], evidence: [], characterGraph: { nodes: [], edges: [] }, plotCurve: [], emotionCurve: [] };
      }
      return {
        analysis: [{ id: "demo-analysis-1", name: "文本动作", summary: "当前片段以可见细节承载叙事信息。", impact: "判断可以回到本次文本逐字核验。", suggestion: "只围绕现有证据检查动作与结果的衔接。", score: 76, evidenceIds: ["demo-analysis-evidence-1"] }],
        evidence: [{ id: "demo-analysis-evidence-1", source: "user", quote: quoteFrom(sourceText(context, input)), note: "仅引用本次请求明确允许的文本。", chapter: context.chapters.find((chapter) => chapter.id === context.activeChapterId)?.title ?? "本次文本" }],
        characterGraph: {
          nodes: [{ id: "demo-analysis-node-1", label: "当前文本", type: "concept" }],
          edges: [],
        },
        plotCurve: [{ beat: "当前片段", value: 52, evidenceId: "demo-analysis-evidence-1" }],
        emotionCurve: [{ beat: "当前片段", value: 18, evidenceId: "demo-analysis-evidence-1" }],
      };
    case "mentor":
      return { mentor: { thesis: "动作延迟让人物的回避变得可观察。", evidence: [{ quote: quoteFrom(sourceText(context, input)), source: "observation", note: "仅引用当前选区或当前项目文本。" }, { quote: "可能害怕旧事返回", source: "inference", note: "这是文学推断，不是情节事实。" }], craft: ["延宕", "以动作替代心理说明"], effect: ["让读者参与推断，维持克制张力"], consistency: ["与人物长期守候的设定一致"], experiments: ["把关键动作拆为两个短句，比较节奏变化"], questions: ["人物最不愿在信里看见哪一个名字？"], references: (input?.retrievalEvidence ?? []).slice(0, 3).map((item) => ({ title: item.chunkType, sourceTitle: item.workId ?? item.sourceUrl ?? "文学知识库", note: "知识参考用于说明技法，不作为原文事实。", retrievalId: item.retrievalId, sourceStatus: item.sourceStatus })) } };
    case "visual-brief":
      return { visualBrief: { title: `${context.title}·角色主视觉`, subject: context.characters.find((character) => character.id === input?.characterId)?.name ?? context.characters[0]?.name ?? "故事主人公", composition: "人物位于画面左侧，叙事空间在右侧展开", palette: ["森林绿", "氧化金", "雾白"], atmosphere: "文学感、克制、可辨识的时代细节", negativePrompt: "文字、水印、泛用奇幻铠甲、过度磨皮" } };
    case "storyboard":
      return { storyboard: Array.from({ length: 6 }, (_, index) => ({ shot: index + 1, framing: index % 2 ? "中景" : "远景", action: `第 ${index + 1} 个叙事动作`, sound: index === 0 ? "环境底噪" : "人物动作声", prompt: `${context.title}，镜头 ${index + 1}，电影感文学改编` })) };
    case "training":
      return { feedback: { strengths: ["文本包含可感知的动作"], evidence: "找到一个具体动词作为证据。", issue: "可以增加动作与环境的互动。", nextStep: "下一次尝试加入一个阻力细节。", questions: ["人物此刻最想隐藏什么？"] } };
    case "story-direction":
      return { direction: { understanding: "人物正处于行动与回避之间，当前需要明确下一步叙事压力。", recommendation: "用一个不可撤回的小动作推进冲突，不直接展开正文候选。", risks: ["过早解释核心悬念"], question: "哪个选择会让人物付出最明确的代价？", suggestedTags: ["推进冲突", "埋设悬念"] } };
    case "consistency-check": {
      const candidate = input?.candidate;
      const priorEvidence = context.characters.find((item) => item.locked)?.notes.trim()
        || context.worldEntries.find((item) => item.locked)?.content.trim()
        || context.blueprint.find((item) => item.locked)?.summary.trim()
        || quoteFrom(context.chapters.find((chapter) => chapter.id === context.activeChapterId)?.content);
      const candidateQuote = quoteFrom(candidate?.text, 40);
      return { consistencyReport: { candidateId: candidate?.id ?? "demo-candidate", contextRevision: candidate?.revision ?? context.contextRevision, findings: candidateQuote && priorEvidence ? [{ id: "demo-finding-1", category: "plot", severity: "medium", expectedFact: priorEvidence, candidateQuote, priorEvidence, suggestion: "确认这一变化是否有足够动机；系统不会自动修改候选。" }] : [], checkedAt: "2026-01-01T00:00:00.000Z", mode: "demo", userConfirmation: "none" } };
    }
    case "analysis-v2": {
      const evidence = analysisEvidence(context, input);
      const sourceKind = input?.sourceKind ?? "narrative";
      const segments = sourceSegments(sourceText(context, input));
      const observationIds = evidence.filter((item) => item.source === "observation").map((item) => item.id);
      const evidenceId = (index: number) => observationIds[Math.min(index, observationIds.length - 1)] ?? "demo-observation-1";
      const finding = (label: string, description: string, index = 0) => ({ label, description, evidenceIds: [evidenceId(index)] });
      const analysis = sourceKind === "narrative"
        ? [
          { id: "demo-dimension-character", name: "人物关系", summary: "人物或叙述主体通过关键行动进入关系网络。", impact: "关系变化承担了叙事推进，而不是停留在人物标签。", suggestion: "核对每次关系变化前是否有可见动作或对话证据。", score: 76, evidenceIds: [evidenceId(0)] },
          { id: "demo-dimension-plot", name: "情节结构", summary: "当前文本已形成开端、发展与转折的压力变化。", impact: "关键转折可被定位，但前置因果仍需复核。", suggestion: "在转折前补入一个可回收的异常细节。", score: 72, evidenceIds: [evidenceId(0), evidenceId(1)] },
          { id: "demo-dimension-theme", name: "主题演变", summary: "主题从处境描述逐步进入人物选择。", impact: "主题通过重复动作与意象显影，避免直接说理。", suggestion: "让后续选择回应前文已出现的母题。", score: 79, evidenceIds: [evidenceId(1), evidenceId(2)] },
          { id: "demo-dimension-style", name: "语言风格", summary: "叙述以具体动作和感官信息维持可观察性。", impact: "语言判断能够回到逐字证据，不以抽象赞美代替分析。", suggestion: "在关键动作前后比较句长与停顿。", score: 81, evidenceIds: [evidenceId(0)] },
        ]
        : [
          { id: "demo-dimension-argument", name: "论证结构", summary: "核心概念、中心论点与文本证据形成基本链路。", impact: "读者可以区分主张与支持材料。", suggestion: "补明证据如何支持论点，避免只并列材料。", score: 74, evidenceIds: [evidenceId(0)] },
          { id: "demo-dimension-evidence", name: "证据链", summary: "当前判断均回到本次输入文本。", impact: "论证范围清晰，未凭空引入人物关系。", suggestion: "为核心主张增加一个反例检验。", score: 77, evidenceIds: [evidenceId(0)] },
          { id: "demo-dimension-theme", name: "主题演变", summary: "主题由方法主张推进到边界判断。", impact: "概念关系具有可追踪的演进方向。", suggestion: "在段落转折处显式标出限制条件。", score: 78, evidenceIds: [evidenceId(1)] },
          { id: "demo-dimension-style", name: "语言风格", summary: "表达以判断句为主，论述语调稳定。", impact: "抽象概念集中，需要具体证据调节密度。", suggestion: "在连续概念句之间加入一个可核验例证。", score: 75, evidenceIds: [evidenceId(0)] },
        ];
      return {
        sourceKind,
        domainAnalysis: sourceKind === "narrative" ? {
          kind: "narrative",
          characters: {
            goals: [finding("人物目标", "人物试图改变当前处境，目标由可见行动承载。")],
            actions: [finding("关键行动", "人物对当前压力做出可定位的行动回应。", 1)],
            relationshipChanges: [finding("关系变化", "人物与他者或关键对象的关系由回避转向面对。", 1)],
          },
          plot: {
            turningPoints: [finding("关键转折", "后段信息改变了前文行动的意义。", Math.max(0, segments.length - 1))],
            setups: [finding("前置铺垫", "开端已经出现可供后文回收的异常细节。")],
            payoffs: [finding("线索回收", "转折回应前文异常，使因果链能够复核。", Math.max(0, segments.length - 1))],
          },
          themes: { stages: segments.map((segment, index) => ({ stage: segment.label, theme: "选择与归属", change: index === 0 ? "由处境进入压力" : "由压力进入选择", reason: "主题变化来自本段可观察行动与意象。", evidenceIds: [evidenceId(index)] })) },
        } : {
          kind: "argumentative",
          argument: {
            claims: [finding("中心论点", "文本提出可辨识的核心判断。")],
            evidenceUnits: [finding("论据单元", "文本材料为中心判断提供直接支持。", 1)],
            reasoningSteps: [finding("推理步骤", "材料经由因果或限制条件连接到结论。", 1)],
          },
          themes: { stages: segments.map((segment, index) => ({ stage: segment.label, theme: "方法与边界", change: index === 0 ? "提出方法主张" : "推进到适用边界", reason: "阶段变化由本段判断与连接词支持。", evidenceIds: [evidenceId(index)] })) },
        },
        analysis,
        evidence,
        relationGraph: analysisGraph(sourceKind, context, input),
        paceCurve: segments.map((segment, index) => ({ segment: segment.label, value: [34, 56, 78][index] ?? 58, evidenceId: evidenceId(index) })),
        emotionCurve: segments.map((segment, index) => ({ segment: segment.label, value: [42, 61, 70][index] ?? 58, evidenceId: evidenceId(index) })),
        themeHeatmap: ["选择", "归属"].flatMap((theme, themeIndex) => segments.map((segment, index) => ({ theme, segment: segment.label, value: Math.min(100, 28 + themeIndex * 18 + index * 23), evidenceId: evidenceId(index) }))),
        styleProfile: { metrics: [
          { key: "sentenceLength", dimension: "句长", value: Math.max(1, Math.min(200, quoteFrom(sourceText(context, input)).length)), unit: "字", interpretation: "句长反映信息推进与停顿密度。", evidenceIds: [evidenceId(0)] },
          { key: "dialogueRatio", dimension: "对话比例", value: 12, unit: "%", interpretation: "对话占比较低，叙述承担主要信息。", evidenceIds: [evidenceId(0)] },
          { key: "sensoryDensity", dimension: "感官密度", value: 68, unit: "%", interpretation: "感官细节为抽象判断提供可见支点。", evidenceIds: [evidenceId(0)] },
          { key: "rhetoric", dimension: "修辞", value: 56, unit: "分", interpretation: "重复意象组织段落间呼应。", evidenceIds: [evidenceId(1)] },
          { key: "narrativeDistance", dimension: "叙事距离", value: 64, unit: "分", interpretation: "叙述保持中近距离观察，不直接替人物定性。", evidenceIds: [evidenceId(0)] },
          { key: "rhythm", dimension: "节律", value: 72, unit: "分", interpretation: "短停顿与信息延后共同塑造节律。", evidenceIds: [evidenceId(1)] },
        ] },
        diagnostics: [
          { id: "demo-diagnostic-setup", location: segments.at(-1)?.label ?? "当前片段", quote: quoteFrom(segments.at(-1)?.text ?? sourceText(context, input)), effect: "转折信息出现后，读者能感到变化，但前文可回收的先兆不足。", action: "此处铺垫不足：在前一分段补入一个相同意象或异常动作，后文再回收。", confidence: 0.72, evidenceIds: [evidenceId(Math.max(0, segments.length - 1))], trainingExerciseId: "EX_006" },
          { id: "demo-diagnostic-style", location: segments[0]?.label ?? "当前片段", quote: quoteFrom(segments[0]?.text ?? sourceText(context, input)), effect: "具体动作让判断能够回到原文核验。", action: "保留该动作，只改一个句式变量并比较阅读节奏。", confidence: 0.68, evidenceIds: [evidenceId(0)] },
        ],
        retrievalEvidence: input?.retrievalEvidence ?? [],
      };
    }
    case "knowledge-extract":
      return { sourceKind: input?.sourceKind ?? "narrative", knowledgeGraph: analysisGraph(input?.sourceKind ?? "narrative", context, input), evidence: analysisEvidence(context, input) };
    case "image-parameter-recommendation":
      return { imageRecommendation: { settings: input?.currentImageSettings ?? { prompt: `${context.title}，文学叙事主视觉，人物、关键道具与环境关系清晰`, negativePrompt: "文字，水印，现代错置，过度磨皮", model: "story-forge-image-v1", size: "1024x1024", advanced: { steps: 28, guidance: 6.5 } }, reasons: { prompt: "保留作品主体和叙事关系。", negativePrompt: "排除影响阅读与时代一致性的元素。", size: "方形尺寸适合作品主视觉预览。" }, confidence: 0.78 } };
    case "training-feedback-v2": {
      const answer = input?.answer?.trim() || input?.sourceText?.trim() || sourceText(context, input);
      return { trainingFeedback: { strengths: ["回答包含可核验的具体表达。"], evidenceQuotes: [quoteFrom(answer, 40)], issues: ["动作后果还可以更明确。"], nextExperiment: "只改一个动作变量，再比较修改前后的阅读效果。", questions: ["这个动作如何改变人物下一步选择？"], scores: [{ dimension: "证据具体性", score: 74, reason: "已有明确表达，但因果说明仍可加强。" }] } };
    }
  }
}

export function fixtureForContext(task: AiTask, context: StoryContext, input?: AiTaskInput["input"]): AiTaskPayload {
  return fixtureForTask(task, context, input);
}

export type FixtureStoryState = Pick<StoryState, "analysis" | "evidence" | "characterGraph" | "plotCurve" | "emotionCurve">;
