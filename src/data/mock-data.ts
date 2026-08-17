import type { StoryState } from "@/lib/types";

const originalText = `码头的钟停在凌晨三点十七分。

沈砚推开值班室的木窗，潮气立刻卷进来，把桌上的航运日志吹得沙沙作响。二十年来，他每天都在同一个时刻望向防波堤，却从未见过今晚这样沉的雾。

门外传来三下很轻的敲击。没有脚步，也没有说话声。门槛上只躺着一封被海水浸透的信，收件人写着他的名字，落款日期却是二十年前。

他没有拆开。指腹沿着封口处那道旧蜡痕慢慢划过，像在确认一道早已愈合的伤口。远处，一艘本不该进港的船鸣响了汽笛。`;

export const initialStoryState: StoryState = {
  projects: [
    { id: "demo", title: "雾港来信", genre: "纯文学短篇", logline: "一封迟到二十年的信，迫使守夜人重新选择离开或留下。", updatedAt: "刚刚", wordCount: 6842, status: "writing" },
    { id: "p-2", title: "纸月亮", genre: "成长小说", logline: "女孩在旧照相馆里寻找失踪的母亲。", updatedAt: "昨天", wordCount: 12840, status: "analysis" },
    { id: "p-3", title: "第七码头", genre: "悬疑中篇", logline: "不存在的码头每天凌晨收到一件遗失物。", updatedAt: "3 天前", wordCount: 3190, status: "draft" },
  ],
  activeProjectId: "demo",
  chapters: [
    { id: "chapter-1", title: "第一章 潮声", content: originalText, wordCount: 2316 },
    { id: "chapter-2", title: "第二章 旧信", content: "信纸在灯下慢慢舒展，墨水已经晕成一片灰蓝。", wordCount: 1874 },
    { id: "chapter-3", title: "第三章 离岸", content: "", wordCount: 0 },
  ],
  characters: [
    { id: "shen", name: "沈砚", role: "码头守夜人", desire: "弄清弟弟失踪的真相", flaw: "把沉默误认为忠诚", arc: "从守候过去到主动离岸" },
    { id: "lin", name: "林槐", role: "旧友与船医", desire: "让沈砚停止自我惩罚", flaw: "习惯替别人做决定", arc: "从隐瞒到坦白" },
    { id: "yu", name: "余声", role: "来历不明的信使", desire: "完成一次迟到的托付", flaw: "身份与记忆不稳定", arc: "从谜面成为见证者" },
  ],
  world: { era: "1998 年深秋", place: "南方虚构港城雾津", rules: "每逢大雾，废弃航道会短暂恢复旧日信号", atmosphere: "潮湿、迟滞、带有工业遗迹的冷寂" },
  blueprint: [
    { id: "b1", title: "异常来信", beatType: "诱发事件", summary: "沈砚收到落款二十年前的信。", active: true },
    { id: "b2", title: "追索航运簿", beatType: "推进", summary: "值班记录指向一艘被注销的船。" },
    { id: "b3", title: "林槐的隐瞒", beatType: "中点", summary: "旧友承认当年修改过名单。" },
    { id: "b4", title: "第七码头", beatType: "危机", summary: "沈砚在雾中看到失踪之船靠岸。" },
    { id: "b5", title: "选择离岸", beatType: "结局", summary: "他读完信，第一次离开值班室。" },
  ],
  candidates: [
    { id: "candidate-1", label: "克制推进", content: "雾中的汽笛又响了一次。沈砚终于撕开封口，里面没有信纸，只有一张褪色的船票。背面那行字仍然清晰：别再替我守港。", rationale: "用物件承载信息，维持当前克制语气。", tags: ["旧信", "沈砚", "雾津"], status: "pending" },
    { id: "candidate-2", label: "悬念强化", content: "沈砚抬头时，窗玻璃上多了一枚湿漉漉的手印。那手印只有四根手指，与二十年前事故报告中的记录完全相同。", rationale: "增加可验证的异常细节，提高段末推动力。", tags: ["事故报告", "悬念", "码头"], status: "pending" },
  ],
  versions: [
    { id: "version-1", versionNo: 1, content: originalText.split("\n\n").slice(0, 3).join("\n\n"), source: "manual", createdAt: "今天 20:12" },
    { id: "version-2", versionNo: 2, content: originalText, source: "manual", createdAt: "今天 21:46" },
  ],
  evidence: [
    { id: "E1", source: "user", quote: "他没有拆开。指腹沿着封口处那道旧蜡痕慢慢划过", note: "延迟动作让人物回避欲望显形。", chapter: "第一章 潮声" },
    { id: "E2", source: "knowledge", quote: "以重复空间承载人物停滞", note: "精选知识条目：空间作为心理结构。", chapter: "知识条目 K-07" },
    { id: "E3", source: "inference", quote: "远处，一艘本不该进港的船鸣响了汽笛", note: "可能预示过去以实体形式返回。", chapter: "模型推断" },
  ],
  analysis: [
    { id: "a1", name: "人物", summary: "行动克制，回避动机清晰。", impact: "沈砚的沉默形成稳定的人物辨识度。", suggestion: "下一场用一次错误选择打破静态守候。", score: 82, evidenceIds: ["E1"] },
    { id: "a2", name: "情节", summary: "异常事件出现及时，因果线仍待加强。", impact: "信件与汽笛构成双重悬念。", suggestion: "让下一段动作直接回应其中一个疑问。", score: 76, evidenceIds: ["E3"] },
    { id: "a3", name: "主题", summary: "守候与离开形成明确张力。", impact: "私人愧疚被置于港口公共空间中。", suggestion: "避免过早解释二十年前的事故。", score: 88, evidenceIds: ["E2"] },
    { id: "a4", name: "意象", summary: "雾、旧蜡与停钟彼此呼应。", impact: "时间停滞获得可感知的物质形态。", suggestion: "后续减少新增意象，深化既有母题。", score: 91, evidenceIds: ["E1", "E3"] },
    { id: "a5", name: "语言", summary: "句式稳健，感官信息密度适中。", impact: "叙述保持低声部，不抢夺事件本身。", suggestion: "个别长句可在关键动作前断开。", score: 84, evidenceIds: ["E1"] },
    { id: "a6", name: "情绪", summary: "压抑曲线在段尾产生第一次抬升。", impact: "汽笛提供了由静到动的明确转折。", suggestion: "下一节暂缓继续升高，先制造短暂平静。", score: 79, evidenceIds: ["E3"] },
  ],
  characterGraph: {
    nodes: [
      { id: "shen", label: "沈砚", type: "character" },
      { id: "lin", label: "林槐", type: "character" },
      { id: "yu", label: "余声", type: "character" },
    ],
    edges: [
      { id: "shen-lin", source: "shen", target: "lin", label: "旧友 / 隐瞒" },
      { id: "yu-shen", source: "yu", target: "shen", label: "托付 / 追索" },
      { id: "lin-yu", source: "lin", target: "yu", label: "知情 / 防备" },
    ],
  },
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
  plotCurve: [
    { beat: "停钟", value: 28, evidenceId: "E1" }, { beat: "来信", value: 52, evidenceId: "E1" }, { beat: "旧痕", value: 61, evidenceId: "E2" }, { beat: "汽笛", value: 86, evidenceId: "E3" },
  ],
  emotionCurve: [
    { beat: "停钟", value: -18, evidenceId: "E1" }, { beat: "来信", value: -35, evidenceId: "E1" }, { beat: "旧痕", value: -62, evidenceId: "E2" }, { beat: "汽笛", value: -22, evidenceId: "E3" },
  ],
};
