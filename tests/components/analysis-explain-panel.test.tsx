import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AnalysisExplainPanel } from "@/components/analysis/analysis-explain-panel";
import { getInjectedCriteria } from "@/lib/ai/criteria";
import type { LiteraryAnalysisResult } from "@/lib/types";

/**
 * 可解释面板（PRD 2.0 §3.3 四段）。
 *
 * 核心断言是「据实呈现」：检索段必须说明判据是确定性注入、不是检索召回，
 * 知识参考为空时要明说为空，不能用装饰性文案掩盖。
 */

function result(overrides: Partial<LiteraryAnalysisResult> = {}): LiteraryAnalysisResult {
  return {
    sourceKind: "narrative",
    domainAnalysis: {
      kind: "narrative",
      characters: { goals: [], actions: [], relationshipChanges: [] },
      plot: { turningPoints: [], setups: [], payoffs: [] },
      themes: { stages: [] },
    },
    analysis: [{ id: "D1", name: "具体性", summary: "动作具体。", impact: "读者能看见手部细节。", suggestion: "保留。", score: 72, evidenceIds: ["ev_001"] }],
    evidence: [{ id: "ev_001", source: "observation", quote: "他站在门口。", note: "" }],
    relationGraph: { nodes: [], edges: [] },
    paceCurve: [],
    emotionCurve: [],
    themeHeatmap: [],
    styleProfile: { metrics: [] },
    diagnostics: [{
      id: "dg-1",
      location: "第一段",
      quote: "他站在门口。",
      effect: "用站位代替说明。",
      action: "补一个手部动作。",
      confidence: 0.7,
      evidenceIds: ["ev_001"],
      criteriaIds: ["P1@v1.0"],
    }],
    retrievalEvidence: [],
    ...overrides,
  };
}

function renderPanel(overrides: Partial<LiteraryAnalysisResult> = {}, mode: "live" | "demo" = "live") {
  return render(
    <AnalysisExplainPanel
      result={result(overrides)}
      sourceText={"他站在门口，手里捏着一封信。"}
      sourceKind="narrative"
      mode={mode}
      prompt="对当前作品来源做完整、可定位的文学诊断。"
    />,
  );
}

describe("四段可解释面板", () => {
  it("四段导航齐全，任意一段都能定位", () => {
    renderPanel();
    const nav = screen.getByRole("navigation", { name: "面板分段" });
    for (const label of ["输入", "检索", "任务", "校验"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeVisible();
    }
    expect(document.getElementById("explain-input")).not.toBeNull();
    expect(document.getElementById("explain-retrieval")).not.toBeNull();
    expect(document.getElementById("explain-task")).not.toBeNull();
    expect(document.getElementById("explain-check")).not.toBeNull();
  });

  it("输入段写清文本类型、字数、结果来源和触发参数", () => {
    renderPanel({}, "live");
    expect(screen.getByText("叙事文本")).toBeVisible();
    expect(screen.getByText(`${"他站在门口，手里捏着一封信。".length} 字`)).toBeVisible();
    expect(screen.getByText("真实模型调用")).toBeVisible();
    expect(screen.getByText(/触发参数：/)).toBeVisible();
  });

  it("演示结果不能冒充真实调用", () => {
    renderPanel({}, "demo");
    expect(screen.getByText("结构化演示结果")).toBeVisible();
  });

  it("检索段说清判据是确定性注入，不是检索召回", () => {
    renderPanel();
    expect(screen.getByText(/确定性注入/)).toBeVisible();
    expect(screen.getByText(/不是检索召回/)).toBeVisible();
  });

  it("注入的判据全部列出，被引用的与未被引用的可区分", () => {
    renderPanel();
    const injected = getInjectedCriteria();
    expect(screen.getByText(`本次注入判据 ${injected.length} 条`)).toBeVisible();
    expect(screen.getByText(`其中被结论引用 1 条`)).toBeVisible();
    // 未被引用的要说明「这是判据在起作用，不是漏检」
    expect(screen.getByText(/说明模型判断这些问题在这段文本里不成立/)).toBeVisible();
  });

  it("知识参考为空时如实说空，而不是装作有检索", () => {
    renderPanel();
    expect(screen.getByText("知识参考（关键词检索召回 0 条）")).toBeVisible();
    expect(screen.getByText(/本次没有召回知识参考/)).toBeVisible();
  });

  it("有知识参考时逐条列出", () => {
    renderPanel({
      retrievalEvidence: [{ retrievalId: "KB_003:technique_explanation", chunkType: "technique_explanation", content: "白描与留白。", quote: "白描与留白。", sourceStatus: "pending" }],
    });
    expect(screen.getByText("知识参考（关键词检索召回 1 条）")).toBeVisible();
    expect(screen.getByText("KB_003:technique_explanation")).toBeVisible();
  });

  it("任务段按「看什么→判断→下一步」呈现，并回指判据原文", () => {
    renderPanel();
    const task = document.getElementById("explain-task")!;
    expect(within(task).getByText(/判断：/)).toBeVisible();
    expect(within(task).getByText(/下一步：/)).toBeVisible();
    expect(within(task).getByText(/依据：/)).toBeVisible();
    // 判据原文也要回指到任务段（检索段也有一份，所以限定在任务段内断言）
    const criterion = getInjectedCriteria().find((hit) => hit.id === "P1");
    expect(criterion).toBeDefined();
    expect(within(task).getByText(new RegExp(criterion!.block.statement.slice(0, 8)))).toBeVisible();
  });

  it("没有判定记录时显示缺省说明，仍保留置信度和建议", () => {
    renderPanel();
    const task = within(document.getElementById("explain-task")!);
    expect(task.getByText("本次未提供判定过程")).toBeVisible();
    expect(task.queryByText("判定过程", { exact: true })).not.toBeInTheDocument();
    expect(task.getByText("置信度 70%")).toBeVisible();
    expect(task.getByText(/下一步：/)).toBeVisible();
  });

  it("展开判定过程后可核对原规则、计数、引文和结论", async () => {
    const user = userEvent.setup();
    const baseline = result();
    const reason = "原句出现可指认的地点「门口」。";
    renderPanel({ diagnostics: [{
      ...baseline.diagnostics[0],
      criteriaEvaluation: [{ criteriaId: "P1", countedAt: ["ev_001"], result: "pass", reason }],
    }] });
    const task = within(document.getElementById("explain-task")!);
    const summary = task.getByText("判定过程", { exact: true });
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    await user.click(summary);
    expect(details.open).toBe(true);
    const criterion = getInjectedCriteria().find((hit) => hit.id === "P1")!;
    const process = within(details);
    expect(process.getByText(criterion.block.checkable)).toBeVisible();
    expect(process.getByText(criterion.block.metric)).toBeVisible();
    expect(process.getByText(/1 条原文证据/)).toBeVisible();
    expect(process.getByText("他站在门口。")).toBeVisible();
    expect(process.getByText("通过")).toBeVisible();
    expect(process.getByText(reason)).toBeVisible();
  });

  it("校验段复用同一份可信度说明，丢弃原因不会被吞掉", () => {
    renderPanel({
      discardedDiagnostics: [{ attempted: { location: "第三段" }, reason: "quote_not_in_source" }],
    });
    const check = document.getElementById("explain-check")!;
    expect(within(check).getByText(/第三段：引文未能在原文中找到/)).toBeVisible();
  });

  it("原文可展开查看，默认折叠不铺满页面", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    // jsdom 里 details 内容始终在 DOM 中，所以要断言 open 状态而不是文本是否存在
    const details = container.querySelector("details.explain-source") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByText(/展开本次被诊断的原文/));
    expect(details.open).toBe(true);
    expect(within(details).getByText("他站在门口，手里捏着一封信。")).toBeVisible();
  });
});
