import type { AiEvidence, BlueprintNode, Candidate, Character, Chapter, ConsistencyReport, ImageGenerationSettings, KnowledgeGraph, LiteraryAnalysisResult, LiterarySourceKind, MentorResponse, RetrievalEvidence, StoryDirectionResult, StoryState, TrainingFeedbackResult, WorldEntry } from "@/lib/types";
import { buildAiContextPacketFromStoryContext } from "@/lib/ai/context";
import { fixtureForTask } from "@/lib/ai/fixtures";
import { retrieveKnowledge } from "@/lib/ai/retrieval";
import { resolveAiSourceText } from "@/lib/ai/story-context";
import { validateTaskPayload, type PayloadEvidenceContext } from "@/lib/ai/validation";
import { serializeCriteriaForPrompt, getInjectedCriteria } from "@/lib/ai/criteria";

export const AI_TASKS = [
  "ideas", "characters", "world", "blueprint", "opening", "prose", "continue", "rewrite", "expand", "condense", "sensory",
  "analysis", "mentor", "visual-brief", "storyboard", "training",
  "story-direction", "consistency-check", "analysis-v2", "knowledge-extract", "image-parameter-recommendation", "training-feedback-v2",
] as const;

export type AiTask = typeof AI_TASKS[number];

export interface StoryContext {
  title: string;
  genre: string;
  logline: string;
  activeChapterId: string;
  contextRevision: number;
  chapters: Chapter[];
  characters: Character[];
  worldEntries: WorldEntry[];
  blueprint: BlueprintNode[];
}

export interface AiTaskInput {
  task: AiTask;
  project: StoryContext;
  input?: {
    prompt?: string;
    selectedText?: string;
    exerciseId?: string;
    characterId?: string;
    sourceText?: string;
    evidenceText?: string;
    answer?: string;
    thread?: Array<{ role: "user" | "assistant"; content: string }>;
    candidate?: { id: string; text: string; revision: number };
    retrievalEvidence?: RetrievalEvidence[];
    currentImageSettings?: ImageGenerationSettings;
    sourceKind?: LiterarySourceKind;
  };
}

export type AiTaskPayload =
  | { candidates: Candidate[] }
  | { characters: Character[] }
  | { worldEntries: WorldEntry[] }
  | { blueprint: BlueprintNode[] }
  | { analysis: StoryState["analysis"]; evidence: StoryState["evidence"]; characterGraph: StoryState["characterGraph"]; plotCurve: StoryState["plotCurve"]; emotionCurve: StoryState["emotionCurve"] }
  | { mentor: MentorResponse }
  | { visualBrief: { title: string; subject: string; composition: string; palette: string[]; atmosphere: string; negativePrompt: string } }
  | { storyboard: Array<{ shot: number; framing: string; action: string; sound: string; prompt: string }> }
  | { feedback: { strengths?: string[]; evidence?: string; issue?: string; nextStep?: string; questions?: string[] } }
  | { direction: StoryDirectionResult }
  | { consistencyReport: ConsistencyReport }
  | LiteraryAnalysisResult
  | { knowledgeGraph: KnowledgeGraph; evidence: AiEvidence[]; sourceKind: LiterarySourceKind }
  | { imageRecommendation: { settings: ImageGenerationSettings; reasons: Record<string, string>; confidence: number } }
  | { trainingFeedback: TrainingFeedbackResult };

export interface AiTaskConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxInputChars: number;
}

export interface AiEnvelope<T> {
  mode: "live" | "demo";
  task: AiTask;
  requestId: string;
  contextRevision: number;
  result: T;
  warnings: string[];
  notices?: string[];
}

export type AiTaskResult = AiEnvelope<AiTaskPayload>;

export interface AiTaskDependencies {
  onParsedForEval?: (payload: unknown) => void;
  retrieveKnowledge?: typeof retrieveKnowledge;
  trustedRetrievalEvidence?: RetrievalEvidence[];
}

const taskInstructions: Record<AiTask, string> = {
  ideas: "返回 { candidates: [{ label, content, rationale, tags }] }，给出 2 到 3 个故事方向；必须从当前作品基底、人物、世界观和蓝图出发，不得改换题材或核心冲突。",
  characters: "返回 { characters: [{ id, name, role, desire, flaw, arc, fear, notes, locked }] }；保留当前人物设定中的事实锚点，只补全或深化缺失字段。",
  world: "返回 { worldEntries: [{ id, category, label, content, locked }] }；以当前世界观字段为基底补全细节，保留已有地点、规则、时间限制和因果关系，不得凭空换题材。",
  blueprint: "返回 { blueprint: [{ id, title, beatType, summary, active, locked }] }；围绕当前灵感、人物目标和世界规则组织五段推进，不得返回泛用模板。",
  opening: "返回 { candidates: [{ label, content, rationale, tags }] }，生成 2 个不同策略的首段候选；首段必须落在当前人物、场景和世界规则上。",
  prose: "返回 { candidates: [{ label, content, rationale, tags }] }，给出 2 到 3 个正文片段候选；保持当前人物、世界观、蓝图和叙述视角。",
  continue: "返回 { candidates: [{ label, content, rationale, tags }] }，给出 2 到 3 个续写候选；承接当前正文最后动作，不重复已发生事实，不引入未授权的核心设定。",
  rewrite: "返回 { candidates: [{ label, content, rationale, tags }] }，改写选区并保持人物、世界观、时间线和因果事实不变。",
  expand: "返回 { candidates: [{ label, content, rationale, tags }] }，扩写选区中的动作与场景；新增细节必须服从当前世界规则和人物设定。",
  condense: "返回 { candidates: [{ label, content, rationale, tags }] }，精简选区但保留叙事信息、设定约束和关键动作。",
  sensory: "返回 { candidates: [{ label, content, rationale, tags }] }，增强选区的感官细节；感官描写必须来自当前场景和世界观，避免泛化辞藻。",
  analysis: "返回 { analysis, evidence, characterGraph, plotCurve, emotionCurve }，所有结论关联证据。",
  mentor: "返回 { mentor: { thesis, evidence: [{ quote, source, note, retrievalId? }], craft, effect, consistency, experiments, questions, references } }。evidence/craft/effect/consistency/experiments/questions 均非空；observation 必须逐字引用用户文本；knowledge 必须带 retrievalId；inference 明示为推断。无检索知识时 references=[]；有知识时每项 reference 返回 title、sourceTitle、note、retrievalId、sourceStatus，且与提供的 retrievalEvidence 一致。",
  "visual-brief": "返回 { visualBrief: { title, subject, composition, palette, atmosphere, negativePrompt } }。视觉简报必须同时落实当前人物身份/欲望、媒介、色彩、作品时代与世界规则；subject 不能写成泛化主角，composition 要给出可执行的主体位置、景别和空间关系，negativePrompt 必须排除文字、标志、水印及与当前设定冲突的时代/材质。",
  storyboard: "返回 { storyboard: [{ shot, framing, action, sound, prompt }] }，严格六镜头。六镜头必须围绕当前已确认的视觉简报、人物行动、媒介、色彩和世界规则推进，每镜头写清景别、动作、声音与可直接生图的 prompt，不得改换人物或时代。",
  training: "返回 { feedback: { strengths, evidence, issue, nextStep, questions } }，只给过程反馈，不代写成稿。",
  "story-direction": "只返回 { direction: { understanding, recommendation, risks, question, suggestedTags } }；suggestedTags 只能来自指定六个标签，不能返回正文或候选段落。",
  "consistency-check": "只返回 { consistencyReport }；只报告可核验矛盾，不自动修改候选，candidateQuote 与 priorEvidence 必须逐字可核验。",
  "analysis-v2": "返回 LiteraryAnalysisResult：sourceKind、domainAnalysis、analysis、evidence、relationGraph、paceCurve、emotionCurve、styleProfile、diagnostics、retrievalEvidence。narrative 的 domainAnalysis 必含 characters.goals/actions/relationshipChanges、plot.turningPoints/setups/payoffs、themes.stages（含 change/reason）；argumentative 改为 argument.claims/evidenceUnits/reasoningSteps 与 themes.stages，不得使用人物叙事节点。styleProfile.metrics 必须是 6 个元素的数组，每个元素形如 {\"key\":\"sentenceLength\",\"dimension\":\"句长\",\"value\":62,\"interpretation\":\"…\",\"evidenceIds\":[\"ev_001\"]}，key 取值为 sentenceLength/dialogueRatio/sensoryDensity/rhetoric/narrativeDistance/rhythm 各一次。所有图节点/边、曲线、style 与 domainAnalysis evidenceId 必须至少引用本次 source 的 observation evidence，禁止仅引用 inference/knowledge。analysis 和 diagnostics 都必须是 JSON 对象数组。元素结构示例（尖括号内是占位说明，不得照抄）：`analysis: [{\"id\":\"<维度ID>\",\"name\":\"<维度名>\",\"summary\":\"<分析结论>\",\"impact\":\"<文本效果>\",\"suggestion\":\"<建议>\",\"score\":80,\"evidenceIds\":[\"<本次证据ID>\"]}]`；`diagnostics: [{\"id\":\"<诊断ID>\",\"location\":\"<原文位置>\",\"quote\":\"<逐字摘录的原文>\",\"effect\":\"<该处的具体效果>\",\"action\":\"<针对该处的建议>\",\"confidence\":0.8,\"evidenceIds\":[\"<与引句匹配的原文证据ID>\"]}]`。score 为 0 至 100 的数值，confidence 为 0 至 1 的数值；示例数值不是默认值。",
  "knowledge-extract": "返回 { knowledgeGraph, evidence, sourceKind }；节点 ID 唯一，边端点与 evidenceIds 必须存在。argumentative 不得使用 character、event、place 节点。",
  "image-parameter-recommendation": "返回 { imageRecommendation: { settings, reasons, confidence } }；只建议图像参数，不生成图片。settings 必须强化当前人物、场景、媒介、色彩和正文证据，正向词具体到主体、构图、光线、材质和镜头语言，负向词覆盖文字/水印/畸形与时代冲突；model 只能沿用当前设置或当前能力列表中的模型 ID，不得臆造模型。每个 reasons 说明必须能回指当前正文或项目设定。",
  "training-feedback-v2": "返回 { trainingFeedback: { strengths, evidenceQuotes, issues, nextExperiment, questions, scores } }；训练不代写，不得返回 replacement prose，evidenceQuotes 必须逐字来自用户回答或 sourceText；scores.dimension 必须严格映射到固定六维：证据具体性、动作设计、感官细节、结构节律、语言控制、自主修订，量规维度只用于解释，不得创建其他维度。",
};

const taskMaxTokens: Record<AiTask, number> = {
  ideas: 2_400, characters: 3_200, world: 2_400, blueprint: 3_200,
  opening: 2_400, prose: 2_400, continue: 2_400, rewrite: 2_400, expand: 2_400, condense: 1_800, sensory: 2_400,
  analysis: 4_000, mentor: 2_800, "visual-brief": 1_600, storyboard: 2_800, training: 1_800,
  "story-direction": 1_600, "consistency-check": 2_800, "analysis-v2": 12_000, "knowledge-extract": 4_000,
  "image-parameter-recommendation": 1_800, "training-feedback-v2": 2_400,
};

/**
 * 判据注入块：只对 analysis-v2 生效。
 *
 * 这是「结论必须引用判据」的落点——不注入判据，模型只能凭感觉说"这里不好"，
 * 说不出按的是哪条标准。注入用于明确判定依据，不代表预期发现覆盖率必然提高。
 *
 * 成本：两维 6 条约 2.8k 字符，占 maxInputChars 的 12%，安全。
 */
export function criteriaBlock(task: AiTask): string {
  if (task !== "analysis-v2") return "";
  const hits = getInjectedCriteria();
  if (!hits.length) return "";
  return `

以下是本次判定必须依据的判据（共 ${hits.length} 条）。你的每条诊断必须在 criteriaIds 里回填所依据的判据 ID，不允许只写维度名，也不允许自造编号。

${serializeCriteriaForPrompt(hits)}

输出要求：diagnostics 数组的每个元素必须额外包含字段 criteriaIds，值为字符串数组，元素取自上面列出的判据 ID（如 ["S2"]，不带版本号）。`;
}

const MAX_MODEL_RESPONSE_CHARS = 200_000;

async function readLimitedResponse(response: Response, maximum: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) return null;
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) {
      await reader.cancel();
      return null;
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  const text = chunks.join("");
  return text.length <= maximum ? text : null;
}

const KNOWLEDGE_TASKS = new Set<AiTask>([
  "ideas", "characters", "world", "blueprint", "opening", "prose", "continue", "rewrite", "expand", "condense", "sensory",
  "analysis", "mentor", "visual-brief", "storyboard", "story-direction", "consistency-check", "analysis-v2", "knowledge-extract", "training", "training-feedback-v2",
  "image-parameter-recommendation",
]);

function activeChapterText(input: AiTaskInput) {
  return input.project.chapters.find((chapter) => chapter.id === input.project.activeChapterId)?.content ?? "";
}

function retrievalQuery(input: AiTaskInput) {
  const settings = [
    input.project.title,
    input.project.genre,
    input.project.logline,
    ...input.project.characters.flatMap((item) => [item.name, item.role, item.desire, item.fear, item.notes]),
    ...input.project.worldEntries.flatMap((item) => [item.label, item.content]),
    ...input.project.blueprint.flatMap((item) => [item.title, item.summary]),
  ].filter((value) => value.trim()).join(" ");
  return [input.task, input.input?.prompt, resolveAiSourceText(input.input, activeChapterText(input)), input.input?.answer, input.input?.currentImageSettings?.prompt, settings]
    .filter((value): value is string => Boolean(value?.trim())).join(" ").slice(0, 12_000);
}

function mergeRetrievalEvidence(trusted: RetrievalEvidence[] | undefined, retrieved: RetrievalEvidence[]) {
  const seen = new Set<string>();
  return [...(trusted ?? []), ...retrieved].filter((item) => {
    if (seen.has(item.retrievalId)) return false;
    seen.add(item.retrievalId);
    return true;
  }).slice(0, 8);
}

function withoutClientRetrieval(input: AiTaskInput): AiTaskInput {
  if (!input.input?.retrievalEvidence) return input;
  const safeInput = { ...input.input };
  delete safeInput.retrievalEvidence;
  return { ...input, input: safeInput };
}

function serializedInput(input: AiTaskInput, contextPacket: ReturnType<typeof buildAiContextPacketFromStoryContext>): string {
  return JSON.stringify({ task: input.task, context: contextPacket, input: input.input ?? {} });
}

function validationContext(input: AiTaskInput): PayloadEvidenceContext {
  const expectedSourceKind = input.input?.sourceKind === "narrative" || input.input?.sourceKind === "argumentative"
    ? input.input.sourceKind
    : undefined;
  return {
    sourceText: resolveAiSourceText(input.input, activeChapterText(input)),
    answer: input.input?.answer,
    candidate: input.input?.candidate,
    retrievalEvidence: input.input?.retrievalEvidence,
    expectedSourceKind,
  };
}

function demoResult(input: AiTaskInput, warnings: string[], notices: string[] = []): AiTaskResult {
  const fixture = fixtureForTask(input.task, input.project, input.input);
  if (!validateTaskPayload(input.task, fixture, input.project, "demo", validationContext(input))) {
    throw new Error(`AI_DEMO_FIXTURE_INVALID:${input.task}`);
  }
  return {
    mode: "demo",
    task: input.task,
    requestId: crypto.randomUUID(),
    contextRevision: input.project.contextRevision,
    result: fixture,
    warnings,
    ...(notices.length ? { notices } : {}),
  };
}

function parseModelJson(content: string): unknown | null {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start && (start > 0 || end < cleaned.length - 1)) candidates.push(cleaned.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next bounded JSON fragment when the provider adds prose around it.
    }
  }
  return null;
}

async function withKnowledge(input: AiTaskInput, dependencies: AiTaskDependencies) {
  const safeInput = withoutClientRetrieval(input);
  if (!KNOWLEDGE_TASKS.has(safeInput.task)) return { input: safeInput, warnings: [] as string[], notices: [] as string[] };
  const trusted = mergeRetrievalEvidence(dependencies.trustedRetrievalEvidence, []);
  try {
    const retrieval = await (dependencies.retrieveKnowledge ?? retrieveKnowledge)({ query: retrievalQuery(safeInput), limit: 5 });
    const evidence = mergeRetrievalEvidence(trusted, retrieval.evidence);
    return {
      input: { ...safeInput, input: { ...safeInput.input, retrievalEvidence: evidence } },
      warnings: retrieval.warnings ?? [],
      notices: [`知识检索：${retrieval.mode}（${retrieval.evidence.length} 条）。`],
    };
  } catch {
    return {
      input: { ...safeInput, input: { ...safeInput.input, retrievalEvidence: trusted } },
      warnings: [trusted.length ? "知识检索异常，已降级为内部可信知识参考。" : "知识检索异常，已降级为无知识参考模式。"],
      notices: [],
    };
  }
}

export async function runAiTask(input: AiTaskInput, config: AiTaskConfig, fetcher: typeof fetch = fetch, dependencies: AiTaskDependencies = {}): Promise<AiTaskResult> {
  const safeInput = withoutClientRetrieval(input);
  if (!config.apiKey) return demoResult(safeInput, ["未配置 DeepSeek 密钥，已使用离线演示结果。"]);
  const knowledge = await withKnowledge(safeInput, dependencies);
  const effectiveInput = knowledge.input;
  const contextPacket = buildAiContextPacketFromStoryContext(effectiveInput.project, {
    instruction: effectiveInput.input?.prompt ?? `${effectiveInput.task}任务`,
    selection: effectiveInput.input?.selectedText,
    maxCharacters: config.maxInputChars,
    retrievalEvidence: effectiveInput.input?.retrievalEvidence,
  });
  const contextWarnings = contextPacket.warning && !contextPacket.blocked ? [contextPacket.warning] : [];
  const warnings = [...knowledge.warnings, ...contextWarnings];
  const notices = knowledge.notices;
  if (contextPacket.blocked) return demoResult(effectiveInput, [...warnings, contextPacket.warning ?? "锁定事实超过上下文上限，已使用离线演示结果。"], notices);
  if (serializedInput(effectiveInput, contextPacket).length > config.maxInputChars * 1.25) return demoResult(effectiveInput, [...warnings, "作品上下文超过单次输入限制，已使用离线演示结果。"], notices);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetcher(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.7,
        max_tokens: taskMaxTokens[effectiveInput.task],
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `你是中文文学创作协作者。${taskInstructions[effectiveInput.task]}${criteriaBlock(effectiveInput.task)}当前创作设定、正文和锁定事实是本次任务的优先约束；知识参考只用于技法、风格和方法，不得冒充用户事实或照抄。每个判断都要能回到上下文中的原文证据或 RAG retrievalId。不得覆盖用户原文；知识参考与用户观察分离；训练不代写；一致性检查只报告不自动修改；故事方向不返回正文候选。视觉简报和图像参数推荐必须严格服从人物、场景、时代、材质和负面限制，禁止输出泛用审美套话。只返回 JSON。` },
          { role: "user", content: serializedInput(effectiveInput, contextPacket) },
        ],
      }),
    });
    if (!response.ok) return demoResult(effectiveInput, [...warnings, `模型请求失败（${response.status}），已使用离线演示结果。`], notices);
    const responseText = await readLimitedResponse(response, MAX_MODEL_RESPONSE_CHARS);
    if (responseText === null) return demoResult(effectiveInput, [...warnings, "模型响应过大，已使用离线演示结果。"], notices);
    let payload: { choices?: Array<{ message?: { content?: string } }> };
    try {
      payload = JSON.parse(responseText) as typeof payload;
    } catch {
      return demoResult(effectiveInput, [...warnings, "模型响应不是有效 JSON，已使用离线演示结果。"], notices);
    }
    const raw = payload.choices?.[0]?.message?.content?.replace(/^```json\s*|\s*```$/g, "");
    if (!raw) return demoResult(effectiveInput, [...warnings, "模型未返回内容，已使用离线演示结果。"], notices);
    const parsed = parseModelJson(raw);
    if (parsed === null) {
      return demoResult(effectiveInput, [...warnings, "模型返回的 JSON 无法解析，已使用离线演示结果。"], notices);
    }
    dependencies.onParsedForEval?.(parsed);
    let failure: string | undefined;
    const result = validateTaskPayload(effectiveInput.task, parsed, effectiveInput.project, "live", { ...validationContext(effectiveInput), onFailure: reason => { failure = reason; } });
    if (!result && failure) return demoResult(effectiveInput, [...warnings, `模型返回结构或证据不符合要求：${failure}，已使用离线演示结果。`], notices);
    if (!result) return demoResult(effectiveInput, [...warnings, "模型返回结构或证据不符合任务要求，已使用与当前项目上下文绑定的离线演示结果（不是本次远端原始结果）。"], notices);
    return { mode: "live", task: effectiveInput.task, requestId: crypto.randomUUID(), contextRevision: effectiveInput.project.contextRevision, result, warnings, ...(notices.length ? { notices } : {}) };
  } catch {
    return demoResult(effectiveInput, [...warnings, "模型连接或超时，已使用离线演示结果。"], notices);
  } finally {
    clearTimeout(timeout);
  }
}
