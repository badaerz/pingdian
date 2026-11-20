#!/usr/bin/env node
// One-off builder for the initial golden set (2026-11-17).
//
// Slices come from the real source files, so `text` and `requiredAnchor` are
// guaranteed consistent. Re-runnable; overwrites GC_*.json.
//
// Three invariants are machine-enforced by `add()`:
//   1. DISJOINT SLICES — no two cases may draw from overlapping paragraph
//      ranges of the same work. Overlapping text double-counts one model run:
//      findings expected by case A get scored as false positives in case B.
//   2. ANCHORS EXIST — every requiredAnchor must appear verbatim in `text`.
//      A bad anchor silently corrupts every traceability score downstream.
//   3. LENGTH BUDGET — 150..3000 chars, so the passage is worth diagnosing but
//      does not crowd the model's context window.

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "evals", "golden");
const MIN_CHARS = 150;
const MAX_CHARS = 3000;

async function kbBody(file) {
  const raw = await readFile(path.join(ROOT, "incoming", "knowledge", "texts", file), "utf8");
  return raw
    .replace(/^---[\s\S]*?\n---\n/, "")
    .trim()
    .replace(/^#.*\n+/, "")
    .trim();
}

async function demoBody(file) {
  const raw = await readFile(path.join(ROOT, "incoming", "demo_projects", file), "utf8");
  const prose = raw.split(/^## .*正文.*$/m)[1];
  if (!prose) throw new Error(`no prose section in ${file}`);
  return prose.split(/^## /m)[0].replace(/^---$/gm, "").trim();
}

function paragraphs(body) {
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && p !== "……");
}

/** Join paragraphs [from, to) with blank lines; records the range for overlap checks. */
function take(work, body, from, to) {
  const all = paragraphs(body);
  if (to > all.length) throw new Error(`${work}: slice [${from},${to}) beyond ${all.length} paragraphs`);
  return { text: all.slice(from, to).join("\n\n"), work, from, to };
}

const cases = [];
const claimedRanges = [];

function assertDisjoint(entry, slice) {
  for (const claimed of claimedRanges) {
    if (claimed.work !== slice.work) continue;
    if (slice.from < claimed.to && claimed.from < slice.to) {
      throw new Error(
        `${entry.id}: paragraphs [${slice.from},${slice.to}) of ${slice.work} overlap ` +
          `${claimed.id}'s [${claimed.from},${claimed.to}) — cases must own disjoint passages`,
      );
    }
  }
  claimedRanges.push({ id: entry.id, work: slice.work, from: slice.from, to: slice.to });
}

function add(entry) {
  const slice = entry._slice;
  delete entry._slice;
  for (const finding of entry.expectedFindings) {
    if (!entry.text.includes(finding.requiredAnchor)) {
      throw new Error(`${entry.id}: anchor not in text -> "${finding.requiredAnchor}"`);
    }
  }
  const length = [...entry.text].length;
  if (length < MIN_CHARS || length > MAX_CHARS) {
    throw new Error(`${entry.id}: text length ${length} outside ${MIN_CHARS}-${MAX_CHARS}`);
  }
  if (entry.expectedFindings.length < 1 || entry.expectedFindings.length > 5) {
    throw new Error(`${entry.id}: needs 1-5 expectedFindings`);
  }
  if (!Array.isArray(entry.forbiddenClaims)) throw new Error(`${entry.id}: forbiddenClaims must be an array`);
  assertDisjoint(entry, slice);
  cases.push(entry);
}

const biancheng = await kbBody("03_bian_cheng.md");
const kongyiji = await kbBody("01_kong_yi_ji.md");
const linchong = await kbBody("02_lin_chong_shan_shen_miao.md");
const oldman = await kbBody("07_the_old_man_and_the_sea.md");
const cuzhi = await kbBody("05_cu_zhi.md");
const honglou = await kbBody("04_hong_lou_meng_excerpt.md");
const necklace = await kbBody("08_the_necklace.md");
const metamorphosis = await kbBody("06_metamorphosis.md");
const grassland = await demoBody("01_echoes_in_the_grassland.md");
const mistharbour = await demoBody("02_letters_from_the_mist_harbour.md");

const DRAFT = (notes) => ({ by: "AI-draft", reviewedBy: null, reviewedAt: null, confidence: "draft", notes });

// ============ GC_001 · 边城 前半 ============
{
  const s = take("KB_003", biancheng, 0, 4);
  add({
    id: "GC_001",
    title: "边城·地理开场与端午初见",
    source: { kind: "knowledge", ref: "KB_003", locator: "第一至三节·地理、渡船、初遇", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "视角与叙述者",
        claim: "全知叙述者以地理方位起笔（由四川过湖南去），先建空间再进人物，是传统说部的地理开场法",
        mustMention: ["全知", "地理", "开场"],
        requiredAnchor: "由四川过湖南去",
        idealKbIds: ["KB_003"],
        severity: "medium",
      },
      {
        dimension: "细节与人物",
        claim: "「只一个老人，一个女孩子，一只黄狗」用三重递减的数量词完成家户交代，全句无一个形容字",
        mustMention: ["数量", "递减", "交代"],
        requiredAnchor: "只一个老人，一个女孩子，一只黄狗",
        idealKbIds: ["KB_003"],
        severity: "medium",
      },
      {
        dimension: "人物塑造",
        claim: "老人追着塞还铜钱并说「我有口粮」，一个动作同时交代了他的穷、他的自尊与他在此地的位置",
        mustMention: ["铜钱", "自尊", "动作"],
        requiredAnchor: "老人便追过去塞还别人",
        idealKbIds: [],
        severity: "low",
      },
      {
        dimension: "对话潜台词",
        claim: "「大鱼要咬了你」表面是玩笑恐吓，实为二老的试探与好感表达；翠翠「以为调戏」是叙述者明示的误读",
        mustMention: ["潜台词", "试探", "误读"],
        requiredAnchor: "大鱼要咬了你",
        idealKbIds: ["KB_003"],
        severity: "high",
      },
    ],
    forbiddenClaims: [
      { claim: "开篇存在铺垫不足或伏笔失效的结构缺陷", reason: "反例防线：本段功能是建立地理空间，不以埋设伏笔为目标，判为缺陷属误报" },
      { claim: "翠翠在本段主动向二老表白", reason: "原文中翠翠误读并骂了对方，无表白动作" },
      { claim: "翠翠的父母在本段中登场", reason: "本段只交代她与爷爷同住，父母未出现" },
    ],
    annotation: DRAFT("文本健康，含 4 条观察与 3 条反例防线——同时承担「正例 + 不误报」双重职能。"),
  });
}

// ============ GC_002 · 边城 后半 ============
{
  const s = take("KB_003", biancheng, 4, 8);
  add({
    id: "GC_002",
    title: "边城·白塔坍塌与结局留白",
    source: { kind: "knowledge", ref: "KB_003", locator: "第四至五节·提亲至结局", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "情节因果",
        claim: "天保之死被处理为「不愿争夺」的主动退出而非意外，因果链指向兄弟情义；触礁只是执行方式，不是原因",
        mustMention: ["不愿争夺", "因果", "退出"],
        requiredAnchor: "天保自知歌声不如弟弟，不愿争夺",
        idealKbIds: [],
        severity: "medium",
      },
      {
        dimension: "伏笔与铺垫",
        claim: "白塔在第一段已被交代位置，本段坍塌与爷爷之死在同一句内并置，塔与人构成征兆关系",
        mustMention: ["白塔", "征兆", "并置"],
        requiredAnchor: "发现白塔在暴风雨中坍塌了",
        idealKbIds: ["KB_003"],
        severity: "high",
      },
      {
        dimension: "人物弧光",
        claim: "翠翠从被渡船老人照顾到接过竹篙摆渡，完成照护者身份接替；新船与重修白塔同时复位，恢复的是秩序而非旧生活",
        mustMention: ["接替", "摆渡", "身份"],
        requiredAnchor: "翠翠接过了爷爷手里的竹篙",
        idealKbIds: [],
        severity: "medium",
      },
      {
        dimension: "留白与结局",
        claim: "结尾把「明天」加引号，不确定性被显式标记，叙述者拒绝给读者闭合答案",
        mustMention: ["留白", "不确定"],
        requiredAnchor: "也许“明天”回来",
        idealKbIds: ["KB_003"],
        severity: "high",
      },
    ],
    forbiddenClaims: [
      { claim: "翠翠与傩送已经成婚或明确在一起", reason: "原文只说「永远不回来」或「明天回来」，无婚配情节" },
      { claim: "天保是被弟弟设计害死的", reason: "原文写天保自知歌声不如弟弟、不愿争夺而驾船下辰州触礁，非被害" },
      { claim: "白塔在结尾被彻底放弃、不再重建", reason: "原文明确写乡邻集资重修了白塔" },
    ],
    annotation: DRAFT("四个考点覆盖因果/伏笔/弧光/留白，是全部 case 中维度最全的一条。"),
  });
}

// ============ GC_003 · 孔乙己 ============
{
  const s = take("KB_001", kongyiji, 0, paragraphs(kongyiji).length);
  add({
    id: "GC_003",
    title: "孔乙己·末次出场的外貌降级",
    source: { kind: "knowledge", ref: "KB_001", locator: "全文", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "人物塑造",
        claim: "长衫从「又脏又破」降级为「破夹袄」，衣着变化承担人物彻底坠落的全部信息，叙述者不作任何评判",
        mustMention: ["长衫", "破夹袄", "衣着"],
        requiredAnchor: "穿一件破夹袄",
        idealKbIds: ["KB_001"],
        severity: "high",
      },
      {
        dimension: "视角与叙述者",
        claim: "以小伙计视角叙述，限制视角使孔乙己的悲剧只呈现外部可见部分，读者与叙述者同样被隔绝在人物内心之外",
        mustMention: ["小伙计", "限制视角", "视角"],
        requiredAnchor: "我从十二岁起，便在镇口的咸亨酒店里当伙计",
        idealKbIds: ["KB_001"],
        severity: "medium",
      },
      {
        dimension: "语气与克制",
        claim: "结尾「大约……的确」把推测词与肯定词强行并置，用语法矛盾表达无人确知的社会性死亡",
        mustMention: ["大约", "的确", "矛盾"],
        requiredAnchor: "大约孔乙己的确死了",
        idealKbIds: ["KB_001"],
        severity: "high",
      },
    ],
    forbiddenClaims: [
      { claim: "孔乙己被打死的过程在文中有明确场面描写", reason: "原文只有「大约……的确死了」这一不确定推断，无死亡场面" },
      { claim: "叙述者明确表达了对孔乙己的同情判断", reason: "小伙计视角全程不作道德评判，同情由读者补充" },
    ],
    annotation: DRAFT("「大约……的确」适合检验模型能否识别矛盾修辞而非编造死因。"),
  });
}

// ============ GC_004 · 林冲 ============
{
  const s = take("KB_002", linchong, 0, paragraphs(linchong).length);
  add({
    id: "GC_004",
    title: "林冲·山神庙隔门偷听",
    source: { kind: "knowledge", ref: "KB_002", locator: "全文·庙门段", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "道具与情节",
        claim: "「把大石掇过来靠了门」既是自救的物理条件，也是他无法推门出去、只能隔缝听见真相的技术前提；缺此动作偷听不成立",
        mustMention: ["大石", "靠门", "前提"],
        requiredAnchor: "把大石掇过来靠了门",
        idealKbIds: ["KB_002"],
        severity: "high",
      },
      {
        dimension: "节奏控制",
        claim: "动作被拆成「跳起身—壁缝看—推门—大喝」四节点，信息逐层递进；爆发前的停顿由「必必剥剥」的拟声词承担",
        mustMention: ["递进", "节奏", "拟声"],
        requiredAnchor: "必必剥剥地爆响",
        idealKbIds: ["KB_002"],
        severity: "medium",
      },
      {
        dimension: "人物塑造",
        claim: "入庙先说「神明庇佑，改日来烧纸钱」，逃命中仍守着礼数与许愿，与其后「大喝一声」形成同一人的两面",
        mustMention: ["礼数", "许愿", "两面"],
        requiredAnchor: "神明庇佑，改日来烧纸钱",
        idealKbIds: [],
        severity: "medium",
      },
    ],
    forbiddenClaims: [
      { claim: "林冲在本段内与三人正面搏斗并将其杀死", reason: "片段止于「大喝一声」，搏斗不在本段文本内" },
      { claim: "林冲在山神庙中先睡了一夜才遇袭", reason: "本段他只入庙顶礼、搬石靠门，未写就寝" },
    ],
    annotation: DRAFT("文本止于爆发瞬间，专门测模型是否越界续写结论。"),
  });
}

// ============ GC_005 · 老人与海 外貌 ============
{
  const s = take("KB_007", oldman, 0, 4);
  add({
    id: "GC_005",
    title: "老人与海·外貌与眼睛的例外",
    source: { kind: "knowledge", ref: "KB_007", locator: "开场·外貌段", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "细节与人物",
        claim: "「眼睛像海水一般蔚蓝」是全身老态中唯一的例外，人物精神被压缩到一个身体部位上",
        mustMention: ["眼睛", "蔚蓝", "例外"],
        requiredAnchor: "唯独那双眼睛像海水一般蔚蓝",
        idealKbIds: ["KB_007"],
        severity: "high",
      },
      {
        dimension: "语言控制",
        claim: "伤疤被写成「像无鱼的荒漠里被风蚀的裂缝」，把身体痕迹并入全篇的海洋—荒漠意象系统",
        mustMention: ["伤疤", "荒漠", "意象"],
        requiredAnchor: "全像无鱼的荒漠里被风蚀的裂缝一样古老",
        idealKbIds: [],
        severity: "medium",
      },
      {
        dimension: "视角与叙述者",
        claim: "「萨劳」以方言词加括号释义的方式引入，叙述者为读者提供本地语汇，是报告体叙述的典型标记",
        mustMention: ["萨劳", "方言", "叙述"],
        requiredAnchor: "萨劳",
        idealKbIds: [],
        severity: "low",
      },
    ],
    forbiddenClaims: [
      { claim: "老人的皮肤癌变被写成本段的主要危险", reason: "原文明确为「良性皮肤癌变」，是外貌描写而非情节威胁" },
      { claim: "男孩在本段已被父母带走且不再关心老人", reason: "原文只写父母说老人倒了血霉，男孩此后仍照顾老人" },
    ],
    annotation: DRAFT("纯静态外貌段，检验模型能否在无强情节时仍给出可锚定的观察。"),
  });
}

// ============ GC_006 · 老人与海 出海 ============
{
  const s = take("KB_007", oldman, 4, paragraphs(oldman).length);
  add({
    id: "GC_006",
    title: "老人与海·鲨鱼夺鱼与硬汉独白",
    source: { kind: "knowledge", ref: "KB_007", locator: "出海至结尾", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "主题表达",
        claim: "「可以被毁灭，但不能被打败」把失败重新定义为物质损失而非精神屈服，与只剩骨架的结局形成直接对照",
        mustMention: ["毁灭", "打败", "失败"],
        requiredAnchor: "一个人可以被毁灭，但不能被打败",
        idealKbIds: ["KB_007"],
        severity: "high",
      },
      {
        dimension: "意象与结构",
        claim: "狮子只出现在结尾睡梦中，与开篇的老人形象呼应，且始终不出现在现实层，因此是精神图腾而非现实事件",
        mustMention: ["狮子", "梦境", "图腾"],
        requiredAnchor: "老人正梦见狮子",
        idealKbIds: ["KB_007"],
        severity: "medium",
      },
      {
        dimension: "节奏控制",
        claim: "鲨鱼段落用「随后是……」「刀刃折断了，他就……」的连续短句推进，逐级降级武器而非一次写完失败",
        mustMention: ["短句", "降级", "推进"],
        requiredAnchor: "刀刃折断了，他就用短棍和舵把击打",
        idealKbIds: [],
        severity: "medium",
      },
    ],
    forbiddenClaims: [
      { claim: "老人最终把大马林鱼完整带回港口", reason: "原文明确鲨鱼群将鱼啃食得只剩骨架" },
      { claim: "男孩马诺林随老人一同出海捕鱼", reason: "男孩在头四十天后已被父母安排离开，本段未随行" },
      { claim: "老人失去了对自己能力的信念", reason: "原文的独白明确表达不服输，与「信念丧失」相反" },
    ],
    annotation: DRAFT("主题、结构、节奏三层覆盖。"),
  });
}

// ============ GC_007 · 促织 ============
{
  const s = take("KB_005", cuzhi, 0, paragraphs(cuzhi).length);
  add({
    id: "GC_007",
    title: "促织·成名丧子与异史氏评",
    source: { kind: "knowledge", ref: "KB_005", locator: "全文·转折与评论", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "结构与反讽",
        claim: "儿子投井与虫斗获胜在文本中前后紧邻，喜与悲在同一推进段内并置，叙述者不加评论，反讽由结构本身产生",
        mustMention: ["反讽", "并置", "投井"],
        requiredAnchor: "见投井死",
        idealKbIds: ["KB_005"],
        severity: "high",
      },
      {
        dimension: "叙述干预",
        claim: "「异史氏曰」是明确的叙述者介入，把志怪故事升格为政论；它与正文的冷静叙述构成两层声音",
        mustMention: ["异史氏", "介入", "两层"],
        requiredAnchor: "异史氏曰",
        idealKbIds: ["KB_005"],
        severity: "high",
      },
      {
        dimension: "暗示与明写",
        claim: "小虫由儿子魂魄所化这层含义未被明写，只靠前后紧邻与「忽闻门外促织鸣」的时机暗示，属留白型因果",
        mustMention: ["留白", "暗示", "因果"],
        requiredAnchor: "忽闻门外促织鸣",
        idealKbIds: [],
        severity: "medium",
      },
    ],
    forbiddenClaims: [
      { claim: "文中明确写出小虫是儿子的魂魄所化", reason: "原文未明写，属暗示；断言为明写即误读叙述层次" },
      { claim: "成名之子投井后被救活并与父亲团聚", reason: "原文只写「见投井死」，无获救情节" },
      { claim: "成名最终因献虫获罪被抄家", reason: "原文结局是免赋税、田产骤富，与获罪相反" },
    ],
    annotation: DRAFT("专测「暗示 vs 明写」的区分能力，文言短篇最易被过度解读处。"),
  });
}

// ============ GC_008 · 项链 ============
{
  const s = take("KB_008", necklace, 0, paragraphs(necklace).length);
  add({
    id: "GC_008",
    title: "项链·十年偿还与结尾反转",
    source: { kind: "knowledge", ref: "KB_008", locator: "全文·偿还至结局", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "结构",
        claim: "结局以一句对话推翻此前全部因果，属欧·亨利式反转；反转能成立，依赖前文对项链真伪的持续假设从未被质疑",
        mustMention: ["反转", "假设", "结构"],
        requiredAnchor: "我那串项链是假的",
        idealKbIds: ["KB_008"],
        severity: "high",
      },
      {
        dimension: "主题表达",
        claim: "十年劳作被一句廉价估价清零，讽刺同时指向诚实与虚荣的双重代价，而非单纯嘲笑虚荣",
        mustMention: ["十年", "代价", "讽刺"],
        requiredAnchor: "整整持续了十年",
        idealKbIds: ["KB_008"],
        severity: "medium",
      },
      {
        dimension: "人物弧光",
        claim: "「粗暴、嗓门大、头发蓬乱」与「依旧会坐在窗前回想」并置，外在磨蚀与内在记忆不同步，人物未被完全改写",
        mustMention: ["磨蚀", "记忆", "改写"],
        requiredAnchor: "她依旧会坐在窗前",
        idealKbIds: [],
        severity: "medium",
      },
    ],
    forbiddenClaims: [
      { claim: "玛蒂尔德在得知真相后自杀或精神崩溃的具体场面", reason: "原文止于对话揭示，无后续反应描写，更无自杀" },
      { claim: "佛来思节夫人当场承认当年故意借出假项链", reason: "原文只说出真品价格，未交待她当时的认知" },
      { claim: "项链丢失后丈夫提出离婚", reason: "原文中夫妻共同借债偿还，无离婚情节" },
    ],
    annotation: DRAFT("经典反转结尾，专测模型是否为强效果脑补收场。"),
  });
}

// ============ GC_009 · 红楼梦 宝黛初会 ============
{
  const s = take("KB_004", honglou, 1, 7);
  add({
    id: "GC_009",
    title: "红楼梦·宝黛初会的双重限知视角",
    source: { kind: "knowledge", ref: "KB_004", locator: "第一节·宝黛初会", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "视角与叙述者",
        claim: "同一场相见被连写两遍：先由黛玉看宝玉，再由宝玉看黛玉。视角切换制造互相打量的对等感，而非单向凝视",
        mustMention: ["视角", "切换", "对等"],
        requiredAnchor: "宝玉便走近黛玉身边坐下，细细打量",
        idealKbIds: ["KB_004"],
        severity: "high",
      },
      {
        dimension: "对话潜台词",
        claim: "王熙凤未到声先到，黛玉心中的「放诞无礼」与贾母的「泼皮破落户」介绍互补，人物由他人反应定义",
        mustMention: ["未见其人", "反应", "定义"],
        requiredAnchor: "这来者系谁，这样放诞无礼",
        idealKbIds: ["KB_004"],
        severity: "high",
      },
      {
        dimension: "伏笔与铺垫",
        claim: "「这个妹妹我曾见过的」在情节内被当作胡话带过，却与太虚幻境的前缘构成预叙，是宿命结构的第一次显影",
        mustMention: ["曾见过", "预叙", "宿命"],
        requiredAnchor: "这个妹妹我曾见过的",
        idealKbIds: ["KB_004"],
        severity: "medium",
      },
    ],
    forbiddenClaims: [
      { claim: "宝黛在本段已互诉衷情或确立关系", reason: "原文为初见，双方仅有眼熟之感，无情感表白" },
      { claim: "黛玉在本段直接识破王熙凤的身份并当面指出", reason: "原文中她只在心中纳罕，未说出口" },
    ],
    annotation: DRAFT("「双重限知视角」是本段最硬的技法点，也最能拉开模型水平差距。"),
  });
}

// ============ GC_010 · 红楼梦 判词 ============
{
  const s = take("KB_004", honglou, 7, 12);
  add({
    id: "GC_010",
    title: "红楼梦·太虚幻境判词预叙",
    source: { kind: "knowledge", ref: "KB_004", locator: "第二节·判词", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "伏笔与铺垫",
        claim: "判词以韵文提前给出人物结局，是全书最大的结构性预叙装置；首次阅读时不可解，重读时意义反转",
        mustMention: ["判词", "预叙", "伏笔"],
        requiredAnchor: "玉带林中挂，金簪雪里埋",
        idealKbIds: ["KB_004"],
        severity: "high",
      },
      {
        dimension: "意象与结构",
        claim: "图与诗成对出现（画两株枯木悬玉带，配「玉带林中挂」），图像先给谜面，韵文再给半个谜底",
        mustMention: ["图", "诗", "谜"],
        requiredAnchor: "画着两株枯木，木上悬着一围玉带",
        idealKbIds: ["KB_004"],
        severity: "high",
      },
    ],
    forbiddenClaims: [
      { claim: "本段中判词已被人物当场解读透彻", reason: "判词在情节内的解读逐步展开，本段人物并未完全理解" },
      { claim: "判词明确写出林黛玉与薛宝钗的最终死因", reason: "判词以谐音与意象暗示，未直陈死因" },
    ],
    annotation: DRAFT("纯韵文段，测模型能否处理非叙述性文本。"),
  });
}

// ============ GC_011 · 变形记 ============
{
  const s = take("KB_006", metamorphosis, 0, paragraphs(metamorphosis).length);
  add({
    id: "GC_011",
    title: "变形记·叙述语气与存在危机的降格",
    source: { kind: "knowledge", ref: "KB_006", locator: "全文·开篇至结尾", licenseStatus: "public_domain" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "视角与叙述者",
        claim: "荒诞事件以完全平实的日常语气交代，叙述者不给惊讶；人物第一反应是确认「这并不是梦」然后照常思考现实事务",
        mustMention: ["平实", "荒诞", "语气"],
        requiredAnchor: "这并不是梦",
        idealKbIds: ["KB_006"],
        severity: "high",
      },
      {
        dimension: "人物塑造",
        claim: "变形后的第一个长段念头抱怨的是出差、换乘与饮食，把存在危机降格为职场焦虑，构成核心反讽",
        mustMention: ["差使", "劳顿", "反讽"],
        requiredAnchor: "天天舟车劳顿",
        idealKbIds: ["KB_006"],
        severity: "high",
      },
      {
        dimension: "结构与反讽",
        claim: "结尾家人用「它不是格里高尔」完成除名，而他死前「心头充满对全家人的温情」，讽刺落在被爱者的单向温情上",
        mustMention: ["除名", "单向", "温情"],
        requiredAnchor: "它不是格里高尔",
        idealKbIds: ["KB_006"],
        severity: "high",
      },
    ],
    forbiddenClaims: [
      { claim: "文中有对变形过程痛苦挣扎的详细生理描写", reason: "原文以平铺语气交代，未渲染变形瞬间的痛感" },
      { claim: "格里高尔在变虫前已与家人决裂", reason: "原文未写决裂；关系恶化发生在变形之后" },
      { claim: "家人最终为格里高尔举行了正式的葬礼", reason: "原文止于他呼出最后一丝气息，无葬礼场面" },
    ],
    annotation: DRAFT("考验模型能否识别「叙述语气与事件性质不匹配」这一核心技法。"),
  });
}

// ============ GC_012 · 回响的草场 演奏 ============
{
  const s = take("demo", grassland, 4, 18);
  add({
    id: "GC_012",
    title: "回响的草场·钢丝马头琴首次演奏",
    source: { kind: "demo-project", ref: "demo", locator: "正文片段·马头琴至断弦", licenseStatus: "original" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "意象与主题",
        claim: "琴弦是废旧进口钢缆改制、琴筒是车间木模拼合，工业材料被强行纳入游牧乐器，器物本身即两种文明的杂交伤口",
        mustMention: ["钢缆", "杂交", "意象"],
        requiredAnchor: "一号电铲主起重臂上的牵引钢缆",
        idealKbIds: [],
        severity: "high",
      },
      {
        dimension: "感官描写",
        claim: "声音被写成「金属毛刺感」「车削铸铁件的啸叫」，以工业听觉替换草原长调的柔和原型，完成逆向通感",
        mustMention: ["毛刺", "车削", "工业"],
        requiredAnchor: "带有极重金属毛刺感与工业钝痛的轰鸣",
        idealKbIds: [],
        severity: "high",
      },
      {
        dimension: "动作设计",
        claim: "杭盖脱下羽绒服撑开挡风，主动放弃调增益这一技术手段，用身体替代设备；这是他态度转变的唯一实证动作",
        mustMention: ["羽绒服", "挡风", "转变"],
        requiredAnchor: "脱下自己身上的羽绒服",
        idealKbIds: [],
        severity: "high",
      },
      {
        dimension: "节奏控制",
        claim: "「咔嚓。」与「上弦崩断了。」各自独立成段，用极短句强制停顿，把高潮收在声音消失处而非情绪顶点",
        mustMention: ["崩断", "停顿", "短句"],
        requiredAnchor: "上弦崩断了",
        idealKbIds: [],
        severity: "medium",
      },
    ],
    forbiddenClaims: [
      { claim: "巴特尔在演奏过程中死亡", reason: "原文他只手背留下血痕并仍说话「入库吧」，仍在行动" },
      { claim: "矿区爆破在本段内已经发生", reason: "爆破在蓝图中属后续情节，本段仅提及「再过两天」" },
      { claim: "杭盖在本段成功录制到无瑕疵的音频", reason: "原文中录音机过载灯疯狂闪烁，最终是断弦收场" },
    ],
    annotation: DRAFT("原创案例无 KB 可引，专测「无知识条目命中时能否仍给出原文锚定结论」。"),
  });
}

// ============ GC_013 · 回响的草场 开篇（反例） ============
{
  const s = take("demo", grassland, 0, 4);
  add({
    id: "GC_013",
    title: "反例·回响的草场开篇声景",
    source: { kind: "demo-project", ref: "demo", locator: "正文片段·开篇四段", licenseStatus: "original" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "感官描写",
        claim: "32 赫兹次声波被写成「隔着鞋底叩击脚底板」，把不可听频率转译为体感，完成感官换轨",
        mustMention: ["次声波", "体感", "转译"],
        requiredAnchor: "一下下叩击着他的脚底板",
        idealKbIds: [],
        severity: "medium",
      },
      {
        dimension: "语言控制",
        claim: "「掺了煤灰的重油」一个比喻同时给出颜色、质地与工业属性，无一字冗余",
        mustMention: ["比喻", "质地", "工业"],
        requiredAnchor: "暮色像一层掺了煤灰的重油",
        idealKbIds: [],
        severity: "low",
      },
    ],
    forbiddenClaims: [
      { claim: "开篇缺少人物欲望或目标交代，属人物塑造缺陷", reason: "反例样本：本段任务为建立声景与空间，欲望由人物卡与后续情节承担，此处要求属错置标准" },
      { claim: "开篇节奏拖沓，应加快进入冲突", reason: "反例样本：慢节奏是有意的声景铺垫，本段功能即建立听觉空间，判为拖沓属误报" },
      { claim: "开篇缺少情节推进属于结构缺陷", reason: "反例样本：开篇以氛围与空间建立为主要任务，情节推进由下一段对话承担" },
      { claim: "开篇使用第二人称或直接向读者说话，破坏叙述连贯", reason: "反例样本：本段全程为第三人称限知，无越界叙述" },
    ],
    annotation: DRAFT("反例一：最易被判「节奏慢/缺动机」的段落类型，测模型是否把「不是缺点的写法」当缺点。"),
  });
}

// ============ GC_014 · 雾港来信 ============
{
  const s = take("demo-demo_002", mistharbour, 0, paragraphs(mistharbour).length);
  add({
    id: "GC_014",
    title: "雾港来信·九封信与灯塔光柱",
    source: { kind: "demo-project", ref: "demo-demo_002", locator: "正文片段·开盒至读信", licenseStatus: "original" },
    sourceKind: "narrative",
    text: s.text,
    _slice: s,
    expectedFindings: [
      {
        dimension: "道具叙事",
        claim: "九封信有邮票无邮戳，是「从未寄出」的单一物证；凭此一点即可推出有人刻意不寄，无需任何外部信息",
        mustMention: ["邮票", "邮戳", "物证"],
        requiredAnchor: "没有加盖任何邮戳",
        idealKbIds: [],
        severity: "high",
      },
      {
        dimension: "对话潜台词",
        claim: "阿夏用「折寿」的迷信说辞劝阻，同时以「没有回答」回避收件人是谁的追问，是全镇集体沉默的微型预演",
        mustMention: ["潜台词", "回避", "沉默"],
        requiredAnchor: "阳间的人看了折寿",
        idealKbIds: [],
        severity: "high",
      },
      {
        dimension: "意象与节奏",
        claim: "光柱「每隔十二秒扫过一次」把时间量化成可数间隔，既承担节奏标记，又暗示真相的周期性逼近",
        mustMention: ["十二秒", "节奏", "光柱"],
        requiredAnchor: "光芒每隔十二秒扫过一次房间",
        idealKbIds: [],
        severity: "medium",
      },
      {
        dimension: "人物塑造",
        claim: "顾沉戴白棉布手套取信，把调查记者的职业习惯写成一个动作，无需交代他的过往职业",
        mustMention: ["手套", "习惯", "职业"],
        requiredAnchor: "戴着白棉布手套的手指",
        idealKbIds: [],
        severity: "medium",
      },
    ],
    forbiddenClaims: [
      { claim: "信中明确写出周伯生承认自己关闸", reason: "信纸只有指控语句，无认罪陈述；周伯生的坦白在蓝图高潮段，不在本段" },
      { claim: "顾沉在本段已读完九封信", reason: "本段只抽出最上面一封并读到第一行" },
      { claim: "阿夏在本段承认自己知道信件的全部内容", reason: "原文她只说「别看了」，未承认知情" },
    ],
    annotation: DRAFT("悬疑文本最易诱发脑补案情，forbiddenClaims 专守此关。"),
  });
}

// ============ write ============
for (const entry of cases) {
  await writeFile(path.join(OUT, `${entry.id}.json`), `${JSON.stringify(entry, null, 2)}\n`, "utf8");
}

// Stale cases from a previous build are reported, not deleted: some sandboxes
// mount the folder read-only for unlink. Remove them by hand.
const expected = new Set(cases.map((entry) => `${entry.id}.json`));
const stale = (await readdir(OUT)).filter((name) => name.startsWith("GC_") && name.endsWith(".json") && !expected.has(name));
if (stale.length) {
  console.warn(`\nWARNING: ${stale.length} stale case file(s) left over from an earlier build:`);
  for (const name of stale) console.warn(`  evals/golden/${name}`);
  console.warn("Delete them by hand, or the runner will load them alongside the new set.");
}

const findings = cases.reduce((n, c) => n + c.expectedFindings.length, 0);
const forbidden = cases.reduce((n, c) => n + c.forbiddenClaims.length, 0);
const reviewed = cases.filter((c) => c.annotation.reviewedBy !== null).length;
console.log(`wrote ${cases.length} cases`);
console.log(`  expected findings : ${findings}`);
console.log(`  forbidden claims  : ${forbidden}  (these double as false-positive traps)`);
console.log(`  human-reviewed    : ${reviewed} / ${cases.length}  (unreviewed cases do not count toward the official score)`);
console.log(`  total prose chars : ${cases.reduce((n, c) => n + [...c.text].length, 0)}`);
