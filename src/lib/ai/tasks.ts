import type { AiEvidence, BlueprintNode, Candidate, Character, Chapter, ConsistencyReport, ImageGenerationSettings, KnowledgeGraph, LiteraryAnalysisResult, LiterarySourceKind, MentorResponse, RetrievalEvidence, StoryDirectionResult, StoryState, TrainingFeedbackResult, WorldEntry } from "@/lib/types";
import { buildAiContextPacketFromStoryContext } from "@/lib/ai/context";
import { fixtureForTask } from "@/lib/ai/fixtures";
import { retrieveKnowledge } from "@/lib/ai/retrieval";
import { resolveAiSourceText } from "@/lib/ai/story-context";
import { validateTaskPayload, type PayloadEvidenceContext } from "@/lib/ai/validation";
import { serializeCriteriaForPrompt, getInjectedCriteria } from "@/lib/ai/criteria";
import { jsonrepair } from "jsonrepair";

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
  signal?: AbortSignal;
  onParsedForEval?: (payload: unknown) => void;
  retrieveKnowledge?: typeof retrieveKnowledge;
  trustedRetrievalEvidence?: RetrievalEvidence[];
}

const taskInstructions: Record<AiTask, string> = {
  "ideas": "【任务】从当前作品基底出发，给出 2 到 3 个不同的故事推进方向。禁止改换题材或核心冲突，禁止引入设定里没有的人物与规则。\n【输出】{ candidates: [{ label, content, rationale, tags }] }。示例：{\"candidates\":[{\"label\":\"激化\",\"content\":\"第二声汽笛响起，与守夜人等了二十年的时间对不上。\",\"rationale\":\"用一个可核验的时间矛盾推进\",\"tags\":[\"悬念\"]}]}\n【空值】想不出真正不同的方向时只给 1 个，不要同义改写凑数。",
  "characters": "【任务】补全或深化当前人物设定，只补空缺，已有的不要改写。禁止新增与现有关系网冲突的人物。\n【输出】{ characters: [{ id, name, role, desire, flaw, arc, fear, notes, locked }] }。示例：{\"characters\":[{\"id\":\"c1\",\"name\":\"守夜人\",\"role\":\"看守灯塔的老人\",\"desire\":\"想离开这座岛\",\"flaw\":\"把等待当成忠诚\",\"arc\":\"从守夜到放手\",\"fear\":\"承认自己已经等了太久\",\"notes\":\"左手有旧伤\",\"locked\":false}]}\ndesire/flaw/arc/fear 要具体可验证，不要写「内心复杂」。\n【空值】现有设定已完整时原样返回，不要为凑数编字段。",
  "world": "【任务】以当前世界观为基底补全细节，新增条目必须与既有规则相容。禁止换题材或引入矛盾规则。\n【输出】{ worldEntries: [{ id, category, label, content, locked }] }。示例：{\"worldEntries\":[{\"id\":\"w1\",\"category\":\"地点\",\"label\":\"选煤车间\",\"content\":\"停产二十年，铁轨还在，冬天结冰后能走人\",\"locked\":false}]}\ncontent 写可核验的事实陈述，不写「充满时代气息」这类评价。\n【空值】没有可补的细节时返回空数组。",
  "blueprint": "【任务】围绕当前灵感、人物目标和世界规则组织五段推进，段与段之间要有因果。禁止返回只有结构名的空模板。\n【输出】{ blueprint: [{ id, title, beatType, summary, active, locked }] }。示例：{\"blueprint\":[{\"id\":\"b1\",\"title\":\"第一次听见汽笛\",\"beatType\":\"激励事件\",\"summary\":\"守夜人听到第二声汽笛，与他等了二十年的那班船时间对不上\",\"active\":true,\"locked\":false}]}\nbeatType 取自：激励事件/上升行动/中点/危机/高潮/收束。\n【空值】无法组织时返回空数组。",
  "opening": "【任务】写 2 个开头候选，策略要不同（例如一动一静）。第一句就给可感知的东西，不要先交代背景。禁止以「这是一个关于……的故事」这类概括句开头。\n【输出】{ candidates: [{ label, content, rationale, tags }] }。示例：{\"candidates\":[{\"label\":\"动作切入\",\"content\":\"煤油灯第三次熄灭时，他终于起身。\",\"rationale\":\"用动作替代环境交代\",\"tags\":[\"开场\"]}]}\n【空值】只想到一种写法时给 1 个即可。",
  "prose": "【任务】给出 2 到 3 个正文片段候选，延续当前场景。禁止改变人物、世界观与叙述视角，禁止替人物解释心理。\n【输出】{ candidates: [{ label, content, rationale, tags }] }。示例：{\"candidates\":[{\"label\":\"克制\",\"content\":\"他把信封放回灯下，没有拆。\",\"rationale\":\"用动作停留代替心理描写\",\"tags\":[\"克制\"]}]}\n【空值】给不出不同写法时只给 1 个。",
  "continue": "【任务】基于当前全文的事实与人物处境，分不同路线合理续写 2 到 3 个候选。禁止改人物动机与既有设定，禁止重复已发生的事实。\n【输出】{ candidates: [{ label, content, rationale, tags }] }。示例：{\"candidates\":[{\"label\":\"推进\",\"content\":\"雾里传来第二声汽笛，时间与他记的不对。\",\"rationale\":\"用一个可核验的矛盾推进\",\"tags\":[\"悬念\"]}]}\n【空值】写不出真正不同的路线时只给 1 个，不要同义改写凑数。",
  "rewrite": "【任务】改写选中文字，保留原意与动作顺序，字数相差不超过三成。禁止新增原文没有的情节、人物或细节；禁止把含蓄表达改成直白解释。\n【输出】{ candidates: [{ label, content, rationale, tags }] }。示例：{\"candidates\":[{\"label\":\"收紧\",\"content\":\"他没有拆，把信塞回衣袋。\",\"rationale\":\"两个动作承接，不解释\",\"tags\":[\"精简\"]}]}\n【空值】原文已成立时说明「这段不需要改」，不要为改而改。",
  "expand": "【任务】扩写选中文字，把动作与场景写细，字数约为原文 1.5 到 3 倍。禁止新增人物、改变事件结果或世界规则；禁止用形容词堆砌代替具体动作。\n【输出】{ candidates: [{ label, content, rationale, tags }] }。示例：{\"candidates\":[{\"label\":\"加触感\",\"content\":\"他伸手碰了碰粥皮，指尖沾上一层凉。\",\"rationale\":\"用一个可感的触觉扩写静止场景\",\"tags\":[\"感官\"]}]}\n【空值】没有值得展开的地方时只给 1 个。",
  "condense": "【任务】精简选中文字，保留关键动作与因果，字数约为原文一半以上。禁止删掉推动情节的动作；禁止把具体描写压成概括评价。\n【输出】{ candidates: [{ label, content, rationale, tags }] }。示例：{\"candidates\":[{\"label\":\"去冗余\",\"content\":\"他把信塞回衣袋，走了。\",\"rationale\":\"保留两个动作，删掉修饰\",\"tags\":[\"精简\"]}]}\n【空值】原文已足够紧时说明「这段已经很紧」，不要硬删。",
  "sensory": "【任务】增强选中文字的感官细节，至少调动两种感官，细节必须来自当前场景里存在的东西。禁止写场景里没有的物件；禁止用「仿佛」「似乎」把具体描写换成比喻；禁止解释情绪。\n【输出】{ candidates: [{ label, content, rationale, tags }] }。示例：{\"candidates\":[{\"label\":\"视听并举\",\"content\":\"灯芯爆了一声，焦味混进潮气里。\",\"rationale\":\"听觉加嗅觉，都在当前场景内\",\"tags\":[\"感官\"]}]}\n【空值】场景里确实没有可加的感官细节时只给 1 个。",
  "analysis": "【任务】对当前文本做结构分析，每条结论要能回到原文。\n【输出】{ analysis, evidence, characterGraph, plotCurve, emotionCurve }。示例：{\"analysis\":[{\"id\":\"a1\",\"name\":\"结构\",\"summary\":\"开端建立了时间压力\",\"impact\":\"读者知道有截止点\",\"suggestion\":\"中段可回收这个时间点\",\"score\":78,\"evidenceIds\":[\"e1\"]}],\"evidence\":[{\"id\":\"e1\",\"source\":\"observation\",\"quote\":\"逐字原文\",\"note\":\"时间标记\"}]}\n新界面已改用 analysis-v2（文学诊断），此任务仅为兼容旧接口保留。\n【空值】没有可报结论时返回空数组。",
  "mentor": "【任务】解释选中文字为什么这样写、产生什么效果。核心判断要落到具体词句上，每条都给引文，区分「原文观察」与「我的推断」。禁止改写原文；禁止替作者下价值判断；禁止把推测当事实。\n【输出】{ mentor: { thesis, evidence: [{ quote, source, note, retrievalId? }], craft, effect, consistency, experiments, questions, references } }。示例：{\"mentor\":{\"thesis\":\"用未署名的信代替说明，读者被迫自己补来历\",\"evidence\":[{\"quote\":\"手里捏着一封没有署名的信\",\"source\":\"observation\",\"note\":\"动作代替说明\"}],\"craft\":[\"以物代人\"],\"effect\":[\"读者主动补全\"],\"consistency\":[\"与人物性格一致\"],\"experiments\":[\"删掉这句看信息是否还够\"],\"questions\":[\"他为什么不拆\"],\"references\":[]}}\nsource 取 observation（逐字原文）/ knowledge（带 retrievalId）/ inference（明示推断、不带 quote）。\n【空值】没有知识参考时 references 返回空数组，不要编。",
  "visual-brief": "【任务】为当前人物或场景写一份可直接交给美术的视觉简报。主体要具体到人物身份与此刻处境；构图给可执行的主体位置、景别与空间关系。禁止 subject 写成「一个年轻人」这类泛化主角；negativePrompt 必须排除文字、标志、水印与时代冲突元素。\n【输出】{ visualBrief: { title, subject, composition, palette, atmosphere, negativePrompt } }。示例：{\"visualBrief\":{\"title\":\"守夜人·雾夜\",\"subject\":\"六十岁守夜人，左手有旧伤，提煤油灯站在码头\",\"composition\":\"中景，人物居左下三分之一，灯在胸前，背景灯塔虚化\",\"palette\":[\"雾灰\",\"冷绿\",\"灯芯暖黄\"],\"atmosphere\":\"湿冷、静止、有风\",\"negativePrompt\":\"文字，水印，标志，现代灯具\"}}\n【空值】信息不足时写明缺哪一项，不要编造。",
  "storyboard": "【任务】把当前场景拆成六个镜头，每镜头写清景别、动作、声音和可直接生图的 prompt，六镜要连成一条动作线。禁止改换人物或时代；禁止与当前视觉简报的光线色彩冲突。\n【输出】{ storyboard: [{ shot, framing, action, sound, prompt }] }。示例：{\"storyboard\":[{\"shot\":1,\"framing\":\"远景\",\"action\":\"雾里只看见灯在移动\",\"sound\":\"水声，远处汽笛\",\"prompt\":\"雾夜码头，远景，一盏灯在人手中移动，冷绿灰调\"}]}\n镜头数不足六个时按实际返回，不要为凑数重复。\n【空值】场景不足以拆镜时返回空数组。",
  "training": "【任务】针对本次训练给出过程性反馈，指出做到了什么、还缺什么，每条引用学员原文。禁止替学员写成稿。\n【输出】{ feedback: { strengths, evidence, issue, nextStep, questions } }。示例：{\"feedback\":{\"strengths\":[\"用动作代替情绪词\"],\"evidence\":[\"他把信封放回灯下\"],\"issue\":\"动作后又补了一句解释，抵消了克制\",\"nextStep\":\"删掉解释那句，看信息还够不够\",\"questions\":[\"不解释的话读者会漏掉什么\"]}}\n【空值】学员未作答时如实说明，不要编。",
  "story-direction": "【任务】就当前故事走向给建议：先复述你理解的处境，再给建议，并说明这个选择会牺牲什么。禁止返回正文或候选段落；suggestedTags 只能来自指定六个标签。\n【输出】{ direction: { understanding, recommendation, risks, question, suggestedTags } }。示例：{\"direction\":{\"understanding\":\"你想让他离开，但线索都在把他留下\",\"recommendation\":\"让离开和留下的理由来自同一个物件\",\"risks\":\"会削弱前文铺垫的宿命感\",\"question\":\"如果有人替他做过一次选择，会是谁\",\"suggestedTags\":[\"深化人物关系\"]}}\n【空值】信息不足时先问一个问题，不要硬给路线。",
  "consistency-check": "【任务】检查候选段落与既有设定是否矛盾，只报告可核验的矛盾：每条都要给出候选原句和既有设定原句，两句都能逐字核对。禁止自动修改候选；禁止报告「可能」「也许」这类不确定的矛盾；禁止把风格差异当设定矛盾。\n【输出】{ consistencyReport: { findings: [{ id, category, severity, expectedFact, candidateQuote, priorEvidence, suggestion }] } }。示例：{\"consistencyReport\":{\"findings\":[{\"id\":\"f1\",\"category\":\"人物\",\"severity\":\"high\",\"expectedFact\":\"左手有旧伤\",\"candidateQuote\":\"他双手稳稳托起铁箱\",\"priorEvidence\":\"左手三根手指伸不直\",\"suggestion\":\"改成用右手或借助肩膀\"}]}}\n【空值】没发现可核验的矛盾就返回 findings: []。为了给点什么而编一条矛盾，比不给更糟。",
  "analysis-v2": "返回 LiteraryAnalysisResult：sourceKind、domainAnalysis、analysis、evidence、relationGraph、paceCurve、emotionCurve、themeHeatmap、styleProfile、diagnostics、retrievalEvidence。narrative 的 domainAnalysis 必含 characters.goals/actions/relationshipChanges、plot.turningPoints/setups/payoffs、themes.stages（含 change/reason）；argumentative 改为 argument.claims/evidenceUnits/reasoningSteps 与 themes.stages，不得使用人物叙事节点。styleProfile.metrics 必须是 6 个元素的数组，每个元素形如 {\"key\":\"sentenceLength\",\"dimension\":\"句长\",\"value\":62,\"interpretation\":\"…\",\"evidenceIds\":[\"ev_001\"]}，key 取值为 sentenceLength/dialogueRatio/sensoryDensity/rhetoric/narrativeDistance/rhythm 各一次。所有图节点/边、曲线、热力、style 与 domainAnalysis evidenceId 必须至少引用本次 source 的 observation evidence，禁止仅引用 inference/knowledge。analysis 和 diagnostics 都必须是 JSON 对象数组。元素结构示例（尖括号内是占位说明，不得照抄）：`evidence: [{\"id\":\"<证据ID>\",\"source\":\"observation\",\"quote\":\"<原文原句，连续复制不改字>\",\"note\":\"<这条证据说明了什么>\"}]`，evidence 不得省略，推断类改为 `{\"id\":\"<证据ID>\",\"source\":\"inference\",\"claim\":\"<推断结论>\",\"note\":\"<为什么这样推断>\"}` 且不得带 quote；`themeHeatmap: [{\"theme\":\"<主题名>\",\"segment\":\"<段落名>\",\"value\":<0-100 的强度>,\"evidenceId\":\"<本次证据ID>\"}]`（每个主题在每个段落各一项，可以为空数组但不要编造段落）；`analysis: [{\"id\":\"<维度ID>\",\"name\":\"<维度名>\",\"summary\":\"<分析结论>\",\"impact\":\"<文本效果>\",\"suggestion\":\"<建议>\",\"score\":80,\"evidenceIds\":[\"<本次证据ID>\"]}]`；`diagnostics: [{\"id\":\"<诊断ID>\",\"location\":\"<原文位置>\",\"quote\":\"<原文原句，连续复制不改字>\",\"effect\":\"<该处的具体效果>\",\"action\":\"<针对该处的建议>\",\"confidence\":0.8,\"evidenceIds\":[\"<与引句匹配的原文证据ID>\"]}]`。score 为 0 至 100 的数值，confidence 为 0 至 1 的数值；示例数值不是默认值。每条 diagnostics 可附带 criteriaEvaluation：对本条实际使用且适用的判据，依据本次注入的 checkable 与 metric 核对原文，只记录规则中的可核对计算与结论。每条记录四个字段：criteriaId 填本次实际使用的判据裸 ID（如 P1），每个判据最多一次；countedAt 填 1 至 20 个唯一的原文证据 ID，必须已列入本次返回的 evidence 且各指向可核对的 observation 或 user 原文引文；reason 用简短核对记录逐项说明哪条证据对应哪项计数、算出的数值与适用阈值，引用原句词或短语时保留原文；result 依据判据规则填 pass 或 fail。没有可核对记录时省略 criteriaEvaluation，照常返回诊断；判据不适用或阈值待定时，省略对应记录。示例（仅示结构）：`criteriaEvaluation: [{\"criteriaId\":\"P1\",\"countedAt\":[\"<证据ID>\"],\"result\":\"fail\",\"reason\":\"<哪条证据对应哪项计数、算出多少、阈值多少>\"}]`。\n【引文】quote 一律从本次原文连续复制：不改标点、不用「……」省略、不把两处不同位置的文字拼成一句。diagnostics 的 quote 必须包含支撑该条 effect 判断的具体词句——指出某处如何，就把那一处原样带出来；只引来旁边不相干的句子，这条诊断视为没有证据。",
  "knowledge-extract": "【任务】从文本中提取带逐字证据的知识图谱。节点 ID 唯一，边端点必须存在于节点中，每个节点与边都要引用至少一条原文观察证据。禁止论证类文本使用 character/event/place 节点；禁止把检索条目当原文证据。\n【输出】{ knowledgeGraph: { nodes, edges }, evidence, sourceKind }。示例：{\"knowledgeGraph\":{\"nodes\":[{\"id\":\"n1\",\"label\":\"孔乙己\",\"type\":\"character\",\"evidenceIds\":[\"e1\"]}],\"edges\":[]},\"evidence\":[{\"id\":\"e1\",\"source\":\"observation\",\"quote\":\"逐字原文\",\"note\":\"身份矛盾\"}],\"sourceKind\":\"narrative\"}\n【空值】提取不出可靠节点时返回空数组。",
  "image-parameter-recommendation": "【任务】为当前画面推荐生图参数（只建议，不生成图片）。正向词要具体到主体、构图、光线、材质与镜头语言；负向词覆盖文字/水印/畸形/时代冲突；每条参数说明理由。禁止臆造模型 ID，只能沿用当前设置或能力列表里的。\n【输出】{ imageRecommendation: { settings, reasons, confidence } }。示例：{\"imageRecommendation\":{\"settings\":{\"prompt\":\"六十岁守夜人，煤油灯，雾夜码头，冷绿灰调，中景\",\"negativePrompt\":\"文字，水印，现代灯具\",\"model\":\"story-forge-image-v1\",\"size\":\"1024x1024\",\"advanced\":{\"steps\":28,\"guidance\":6.5}},\"reasons\":{\"prompt\":\"保留人物年龄与光源位置\"},\"confidence\":0.8}}\n【空值】信息不足时给出保守参数并说明原因。",
  "training-feedback-v2": "【任务】对学员写作练习给出结构化反馈与评分。evidenceQuotes 必须逐字来自学员回答或原文；每个分数要能对应具体证据。禁止代写、禁止返回可替代学员提交的成稿、禁止创建六维以外的维度。\n【输出】{ trainingFeedback: { strengths, evidenceQuotes, issues, nextExperiment, questions, scores } }。示例：{\"trainingFeedback\":{\"strengths\":[\"用身体动作传递压力\"],\"evidenceQuotes\":[\"他把听诊器摘下又戴上\"],\"issues\":[\"第三句回到抽象概括\"],\"nextExperiment\":\"只用声音写家属的反应\",\"questions\":[\"他此刻最怕被谁看见\"],\"scores\":[{\"dimension\":\"证据具体性\",\"score\":80}]}}\nscores.dimension 严格取自：证据具体性/动作设计/感官细节/结构节律/语言控制/自主修订。\n【空值】学员未提交时如实说明。",
};;

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
 * 六维判据排除尚无阈值的条目。
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
  // 兜底：模型偶尔返回被截断或带多余逗号的 JSON（尤其输出变长之后）。
  // 这是 LLM 应用的常见故障，业界标准做法是用 jsonrepair 修复后再解析。
  // 修复只负责「让它能解析」，解析出来的内容仍要过完整校验，防幻觉底线不受影响。
  for (const candidate of candidates) {
    // 只修「看起来是 JSON」的内容：jsonrepair 会把纯文本包成一个字符串，
    // 那不是修复而是掩盖，不该走到这里。
    if (!/[{[\]]/.test(candidate)) continue;
    try {
      return JSON.parse(jsonrepair(candidate)) as unknown;
    } catch {
      // 不是 JSON，或修复也救不回来
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
  dependencies.signal?.throwIfAborted();
  const safeInput = withoutClientRetrieval(input);
  if (!config.apiKey) return demoResult(safeInput, ["未配置 DeepSeek 密钥，已使用离线演示结果。"]);
  const knowledge = await withKnowledge(safeInput, dependencies);
  dependencies.signal?.throwIfAborted();
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
      signal: dependencies.signal ? AbortSignal.any([controller.signal, dependencies.signal]) : controller.signal,
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
    dependencies.signal?.throwIfAborted();
    return demoResult(effectiveInput, [...warnings, "模型连接或超时，已使用离线演示结果。"], notices);
  } finally {
    clearTimeout(timeout);
  }
}
