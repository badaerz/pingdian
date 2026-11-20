/**
 * 降级契约的独立验收测试（Claude 写，不依赖 Codex 的自测）。
 *
 * 为什么单独一份：
 * 2026-11-20 实测，14 条 live 里 3 条因为「某一个字段不对」整包回退成 demo，
 * 47 份历史 raw 离线回放有 6 份被拒，原因全是单项字段不符。
 * 用户定的规矩是：只有模型输出**全部**不符合协议才回退，局部不符一律降级。
 *
 * 这份测试的做法：先搭一份**最小合法 payload**（基准必须通过），
 * 再对它做**单点损坏**——每次只坏一处。这样「坏掉的东西是不是被单独处理了」
 * 才是一个干净的因果判断，而不是混在一堆差异里猜。
 *
 * 两条底线必须同时被守住，缺一条就是击穿防幻觉：
 *   1. 引文必须逐字在原文
 *   2. evidenceIds 必须指向真实存在的原文证据
 * 所以文件后半部分是「降级不许放水」的严格性测试，任何一条被删都是回归。
 */
import { describe, it, expect } from "vitest";
import { validateTaskPayload } from "@/lib/ai/validation";
import type { LiteraryAnalysisResult } from "@/lib/types";

const TEXT = "他站在门口，手里捏着一封没有署名的信。\n风吹过来，信纸抖了一下。\n他没有拆开，把信塞回衣袋。";

function project() {
  return {
    title: "无署名信",
    genre: "评测样本",
    logline: "",
    activeChapterId: "c1",
    contextRevision: 1,
    chapters: [{ id: "c1", title: "无署名信", content: TEXT, wordCount: TEXT.length, summary: "", order: 0 }],
    characters: [],
    worldEntries: [],
    blueprint: [],
  } as never;
}

const finding = (label: string, evidenceIds: string[] = ["ev_001"]) => ({ label, description: `${label}的具体表现。`, evidenceIds });

/** 最小合法 payload：每一项都能回到 ev_001 / ev_002 这两条原文证据。 */
function validPayload() {
  return {
    sourceKind: "narrative" as const,
    domainAnalysis: {
      characters: { goals: [finding("目标")], actions: [finding("行动")], relationshipChanges: [finding("关系变化")] },
      plot: { turningPoints: [finding("转折")], setups: [finding("铺垫")], payoffs: [finding("回收")] },
      themes: { stages: [{ stage: "开端", theme: "迟疑", change: "人物停住", reason: "未拆信", evidenceIds: ["ev_001"] }] },
    },
    analysis: [{ id: "D1", name: "具体性", summary: "动作具体。", impact: "读者能看见手部细节。", suggestion: "保留捏信动作。", score: 72, evidenceIds: ["ev_001"] }],
    evidence: [
      { id: "ev_001", source: "observation", quote: "他站在门口，手里捏着一封没有署名的信。", note: "开场动作" },
      { id: "ev_002", source: "observation", quote: "风吹过来，信纸抖了一下。", note: "环境反馈" },
      { id: "ev_003", source: "inference", claim: "人物在压抑一次未完成的决定。", note: "推断" },
    ],
    relationGraph: {
      nodes: [
        { id: "n1", label: "他", type: "character", evidenceIds: ["ev_001"] },
        { id: "n2", label: "未署名的信", type: "image", evidenceIds: ["ev_001"] },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", label: "持有", evidenceIds: ["ev_001"] }],
    },
    paceCurve: [
      { segment: "开端", value: 40, evidenceId: "ev_001" },
      { segment: "中段", value: 62, evidenceId: "ev_002" },
    ],
    emotionCurve: [
      { segment: "开端", value: 30, evidenceId: "ev_002" },
      { segment: "中段", value: 55, evidenceId: "ev_001" },
    ],
    themeHeatmap: [{ theme: "迟疑", segment: "开端", value: 50, evidenceId: "ev_001" }],
    styleProfile: {
      metrics: [
        { key: "sentenceLength", dimension: "句长", value: 18, unit: "字", interpretation: "短句为主。", evidenceIds: ["ev_001"] },
        { key: "dialogueRatio", dimension: "对话比例", value: 0, unit: "%", interpretation: "无对话。", evidenceIds: ["ev_001"] },
        { key: "sensoryDensity", dimension: "感官密度", value: 35, unit: "%", interpretation: "触觉为主。", evidenceIds: ["ev_002"] },
        { key: "rhetoric", dimension: "修辞", value: 40, unit: "分", interpretation: "克制。", evidenceIds: ["ev_002"] },
        { key: "narrativeDistance", dimension: "叙事距离", value: 30, unit: "分", interpretation: "贴近人物。", evidenceIds: ["ev_001"] },
        { key: "rhythm", dimension: "节律", value: 45, unit: "分", interpretation: "三句递进。", evidenceIds: ["ev_001"] },
      ],
    },
    diagnostics: [{
      id: "dg-1",
      criteriaIds: ["P1"],
      location: "第一段",
      quote: "他站在门口，手里捏着一封没有署名的信。",
      effect: "用未署名的信代替说明，读者被迫自行补齐来历。",
      action: "保留这个动作，不要再补一句解释性的内心独白。",
      confidence: 0.7,
      evidenceIds: ["ev_001"],
    }],
    retrievalEvidence: [],
  };
}

interface DegradationRow { path?: string; reason?: string; dropped?: number }
interface LiteraryAnalysisLike { degraded?: DegradationRow[] }
type LiteralPayload = LiteraryAnalysisResult & { degraded?: DegradationRow[] };

function validate(mutate: (payload: ReturnType<typeof validPayload>) => void) {
  const payload = validPayload();
  mutate(payload);
  let failure: string | undefined;
  const result = validateTaskPayload("analysis-v2", payload, project(), "live", {
    sourceText: TEXT,
    expectedSourceKind: "narrative",
    onFailure: (reason: string) => { failure = reason; },
  }) as (LiteraryAnalysisResult & LiteraryAnalysisLike) | null;
  const degradedPaths = (result?.degraded ?? []).map((entry) => entry.path ?? "");
  return { result, failure, degradedPaths };
}

describe("单点损坏一律降级，不许整包回退", () => {
  it("基准：合法 payload 必须通过（基准不过，后面所有结论都不成立）", () => {
    const { result, failure } = validate(() => {});
    expect(failure).toBeUndefined();
    expect(result).not.toBeNull();
    expect(result?.diagnostics.length).toBe(1);
    // 合法的东西不该被误降级
    expect((result as LiteraryAnalysisLike).degraded).toEqual([]);
  });

  it("themeHeatmap 某项字段无效：置空该块，其余结论保留", () => {
    // 注意：缺 theme / value 超范围 这类损伤会被归一化层先修好（补默认值、夹范围），
    // 打不到校验器。只有「引用了不存在的证据」是归一化层修不了的，
    // 而这正是线上真实失败的那一类（themeHeatmap[0].evidenceId 不是有效的原文证据）。
    const { result, degradedPaths } = validate((payload) => { payload.themeHeatmap[0].evidenceId = "ev_999"; });
    expect(result).not.toBeNull();
    expect(result?.diagnostics.length).toBe(1);
    expect(result?.themeHeatmap).toEqual([]);
    expect(degradedPaths.some((path) => path.startsWith("themeHeatmap"))).toBe(true);
  });

  it("inference 条目带了 quote：丢引文保结论，不连坐整包", () => {
    const { result, degradedPaths } = validate((payload) => {
      payload.evidence.push({ id: "ev_004", source: "inference", claim: "场景在暗示拒绝。", quote: "风吹过来，信纸抖了一下。", note: "" } as never);
    });
    expect(result).not.toBeNull();
    expect(result?.diagnostics.length).toBe(1);
    const added = result?.evidence.find((item) => item.id === "ev_004");
    expect(added).toBeDefined();
    expect(added?.source).toBe("inference");
    // 关键：不许把「多给了出处」洗成 observation
    expect(added?.quote).toBeUndefined();
    expect(added?.claim).toBe("场景在暗示拒绝。");
    expect(degradedPaths.some((path) => path.includes("evidence"))).toBe(true);
  });

  it("plot.payoffs 为空数组：该分支置空，不连坐整个 domainAnalysis", () => {
    const { result, degradedPaths } = validate((payload) => { payload.domainAnalysis.plot.payoffs = []; });
    expect(result).not.toBeNull();
    expect(result?.domainAnalysis.kind).toBe("narrative");
    expect(result?.domainAnalysis.kind === "narrative" && result.domainAnalysis.plot.payoffs).toEqual([]);
    // 同组其它分支还在
    expect(result?.domainAnalysis.kind === "narrative" && result.domainAnalysis.plot.setups.length).toBe(1);
    expect(degradedPaths).toContain("domainAnalysis.plot.payoffs");
  });

  it("曲线单个点证据无效：丢该点，保留其余点", () => {
    const { result, degradedPaths } = validate((payload) => { payload.paceCurve.push({ segment: "结尾", value: 70, evidenceId: "ev_999" }); });
    expect(result).not.toBeNull();
    expect(result?.paceCurve.length).toBe(2);
    expect(result?.paceCurve.every((point) => point.evidenceId !== "ev_999")).toBe(true);
    expect(degradedPaths.some((path) => path.startsWith("paceCurve"))).toBe(true);
  });

  it("sourceKind 模型漏写：以服务端判定为准，不整包回退", () => {
    // sourceKind 是服务端事实（detectLiterarySourceKind + 用户可修正），
    // 模型的职责不是复述它。漏写不该毁掉整份诊断。
    const payload = validPayload() as Record<string, unknown>;
    delete payload.sourceKind;
    let failure: string | undefined;
    const result = validateTaskPayload("analysis-v2", payload, project(), "live", {
      sourceText: TEXT, expectedSourceKind: "narrative", onFailure: (reason: string) => { failure = reason; },
    }) as LiteralPayload | null;
    expect(failure).toBeUndefined();
    expect(result).not.toBeNull();
    expect(result?.sourceKind).toBe("narrative");
    expect(result?.diagnostics.length).toBe(1);
    expect((result?.degraded ?? []).some((entry) => entry.path === "sourceKind")).toBe(true);
  });

  it("sourceKind 模型判错：按服务端口径继续，记账但不作废", () => {
    const payload = validPayload();
    payload.sourceKind = "argumentative" as never;
    const result = validateTaskPayload("analysis-v2", payload, project(), "live", {
      sourceText: TEXT, expectedSourceKind: "narrative",
    }) as LiteralPayload | null;
    expect(result).not.toBeNull();
    expect(result?.sourceKind).toBe("narrative");
    expect((result?.degraded ?? []).some((entry) => entry.path === "sourceKind")).toBe(true);
  });

  it("整体被包在数组里返回：取首个对象继续校验", () => {
    const payload = validPayload();
    const result = validateTaskPayload("analysis-v2", [payload], project(), "live", {
      sourceText: TEXT, expectedSourceKind: "narrative",
    }) as LiteralPayload | null;
    expect(result).not.toBeNull();
    expect(result?.diagnostics.length).toBe(1);
    expect((result?.degraded ?? []).some((entry) => entry.path === "payload")).toBe(true);
  });

  it("曲线只剩一个有效点：保留该点，不因点数少就清空", () => {
    // 短文本只有一段时，曲线天然是单点。这是诊断规则的正常结果，不是缺陷。
    const { result, degradedPaths } = validate((payload) => {
      payload.paceCurve = [{ segment: "开端", value: 40, evidenceId: "ev_001" }];
      payload.emotionCurve = [{ segment: "开端", value: 30, evidenceId: "ev_002" }];
    });
    expect(result).not.toBeNull();
    expect(result?.paceCurve).toEqual([{ segment: "开端", value: 40, evidenceId: "ev_001" }]);
    expect(result?.emotionCurve).toEqual([{ segment: "开端", value: 30, evidenceId: "ev_002" }]);
    expect(degradedPaths.some((path) => path.startsWith("paceCurve"))).toBe(false);
  });

  it("单个 stage 证据无效：丢该 stage，保留其余", () => {
    const { result, degradedPaths } = validate((payload) => {
      payload.domainAnalysis.themes.stages.push({ stage: "转折", theme: "决定", change: "塞回衣袋", reason: "拒绝拆开", evidenceIds: ["ev_999"] });
    });
    expect(result).not.toBeNull();
    expect(result?.domainAnalysis.themes.stages.length).toBe(1);
    expect(result?.domainAnalysis.themes.stages[0].stage).toBe("开端");
    expect(degradedPaths.some((path) => path.startsWith("themes.stages"))).toBe(true);
  });
});

describe("降级不许放水：两条底线任何时候都要守住", () => {
  it.each([
    [undefined, "missing_criteria"], ["C1", "unknown_criteria"], ["D2", "unknown_criteria"],
  ] as const)("逐条丢弃无依据的诊断 %s", (id, reason) => {
    const { result } = validate(payload => {
      const extra = { ...payload.diagnostics[0], id: "dg-2", criteriaIds: id ? [id] : [] };
      if (!id) Reflect.deleteProperty(extra, "criteriaIds");
      payload.diagnostics.push(extra);
    });
    expect(result?.diagnostics.map(item => item.id)).toEqual(["dg-1"]);
    expect(result?.discardedDiagnostics?.map(item => item.reason)).toEqual([reason]);
  });

  it("诊断引文不在原文：该条被丢且不转成别的来源，全部丢完就回退", () => {
    const { result, failure } = validate((payload) => { payload.diagnostics[0].quote = "他站在门口，手里捏着一封署名的信。"; });
    expect(result).toBeNull();
    expect(failure).toBeTruthy();
  });

  it("部分诊断引文失效：丢坏的那条，好的那条照常保留", () => {
    const { result } = validate((payload) => {
      payload.diagnostics.push({ ...payload.diagnostics[0], id: "dg-2", quote: "他站在门口，手里捏着一封署名的信。" } as never);
    });
    expect(result).not.toBeNull();
    expect(result?.diagnostics.map((item) => item.id)).toEqual(["dg-1"]);
    expect(result?.discardedDiagnostics?.some((item) => item.reason === "quote_not_in_source")).toBe(true);
  });

  it("evidence 为空：回退（核心证据不存在，没有任何结论可立）", () => {
    const { result } = validate((payload) => { payload.evidence = []; });
    expect(result).toBeNull();
  });

  it("原文观察证据全部失效：回退，不许靠 inference 顶上来", () => {
    const { result } = validate((payload) => {
      payload.evidence = payload.evidence.map((item) => item.id === "ev_001" || item.id === "ev_002" ? { ...item, quote: "这段文字不在原文里。" } : item) as never;
    });
    expect(result).toBeNull();
  });

  it("降级之后 evidenceIds 仍必须指向真实存在的证据，不许挂空", () => {
    const { result } = validate((payload) => { payload.themeHeatmap[0].evidenceId = "ev_999"; });
    const evidenceIds = new Set((result?.evidence ?? []).map((item) => item.id));
    for (const stage of result?.domainAnalysis.themes.stages ?? []) {
      for (const id of stage.evidenceIds) expect(evidenceIds.has(id)).toBe(true);
    }
    for (const point of result?.paceCurve ?? []) expect(evidenceIds.has(point.evidenceId)).toBe(true);
  });
});
