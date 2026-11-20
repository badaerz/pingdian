import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnalysisIntegrity } from "@/components/analysis/analysis-integrity";
import type { LiteraryAnalysisResult } from "@/lib/types";

/**
 * AC25 / AC27 的守门测试。
 *
 * 产品原则：丢弃和降级必须让用户看见，不许静默。
 * 「真实分析（部分通过）」徽章只是信号，这一块负责回答「哪部分没进来、为什么」。
 */

function baseResult(): LiteraryAnalysisResult {
  return {
    sourceKind: "narrative",
    domainAnalysis: {
      kind: "narrative",
      characters: { goals: [], actions: [], relationshipChanges: [] },
      plot: { turningPoints: [], setups: [], payoffs: [] },
      themes: { stages: [] },
    },
    analysis: [],
    evidence: [],
    relationGraph: { nodes: [], edges: [] },
    paceCurve: [],
    emotionCurve: [],
    themeHeatmap: [],
    styleProfile: { metrics: [] },
    diagnostics: [],
    retrievalEvidence: [],
  };
}

describe("本次结果的可信度说明", () => {
  it("干净结果不渲染这一块，避免无谓噪音", () => {
    const { container } = render(<AnalysisIntegrity result={baseResult()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("未采用的诊断要给出原因和原文引句", () => {
    const result = baseResult();
    result.discardedDiagnostics = [
      { attempted: { location: "第三段", quote: "他站住了。" }, reason: "quote_not_in_source" },
      { attempted: { id: "d-2" }, reason: "proofreading_not_allowed" },
      { attempted: {}, reason: "unknown_criteria" },
    ];
    render(<AnalysisIntegrity result={result} />);

    expect(screen.getByRole("region", { name: "本次结果的可信度说明" })).toBeVisible();
    expect(screen.getByText(/第三段：引文未能在原文中找到/)).toBeVisible();
    expect(screen.getByText(/他站住了。/)).toBeVisible();
    expect(screen.getByText(/d-2：属于校对意见，不属于文学诊断/)).toBeVisible();
    expect(screen.getByText(/第 3 条：引用了本次未提供的判据编号/)).toBeVisible();
  });

  it("降级的检索证据与未核验的原文证据都要点名，不许只显示一个徽章", () => {
    const result = baseResult();
    result.degradedRetrievalIds = ["KB_003:technique_explanation"];
    result.evidence = [
      { id: "ev_001", source: "observation", quote: "柜台外站着喝酒的短衣帮。", note: "", verification: "unverified" },
      { id: "ev_002", source: "observation", quote: "孔乙己是站着喝酒而穿长衫的唯一的人。", note: "" },
    ];
    render(<AnalysisIntegrity result={result} />);

    expect(screen.getByText(/KB_003:technique_explanation：服务端未返回对应检索结果/)).toBeVisible();
    expect(screen.getByText(/ev_001：未能回到原文核对/)).toBeVisible();
    // 已核验的证据不该出现在这张「问题清单」里
    expect(screen.queryByText(/ev_002/)).toBeNull();
  });

  it("校验层新增的降级台账（degraded）在校验层落地前后都能显示", () => {
    const result = baseResult() as LiteraryAnalysisResult & { degraded: unknown };
    result.degraded = [
      { path: "themeHeatmap", reason: "字段无效，已置空" },
      { path: "domainAnalysis.plot.payoffs", reason: "数量不符，已置空", dropped: 3 },
    ];
    render(<AnalysisIntegrity result={result} />);

    expect(screen.getByText(/themeHeatmap：字段无效，已置空/)).toBeVisible();
    expect(screen.getByText(/domainAnalysis.plot.payoffs：数量不符，已置空（丢弃 3 项）/)).toBeVisible();
  });

  it("降级台账是脏数据时不炸页面（校验层形态还在变）", () => {
    const result = baseResult() as LiteraryAnalysisResult & { degraded: unknown };
    result.degraded = [null, "oops", { path: "paceCurve" }];
    render(<AnalysisIntegrity result={result} />);
    expect(screen.getByText(/paceCurve：结构不符，已置空/)).toBeVisible();
  });
});
