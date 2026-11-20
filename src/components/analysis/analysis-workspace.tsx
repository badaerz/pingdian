"use client";

import { AlertTriangle, CheckCircle2, FileText, Lightbulb, Network, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisDiagnostics } from "@/components/analysis/analysis-diagnostics";
import { AnalysisIntegrity } from "@/components/analysis/analysis-integrity";
import { CharacterGraph } from "@/components/analysis/character-graph";
import { EvidenceDrawer } from "@/components/analysis/evidence-drawer";
import { StoryCurves } from "@/components/analysis/story-curves";
import { AiProgress, type AiProgressStatus } from "@/components/ui/ai-progress";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analysisResultFromSnapshot, analysisSourceHash, createAnalysisSnapshot, findCurrentAnalysisSnapshot, resolveProjectAnalysisSource } from "@/lib/analysis/snapshot";
import { detectLiterarySourceKind } from "@/lib/analysis/source-kind";
import { contextFromState } from "@/lib/ai/story-context";
import type { AiTaskPayload } from "@/lib/ai/tasks";
import type { LiteraryAnalysisResult, LiteraryDiagnostic, MentorResponse, StoryState } from "@/lib/types";
import { useStory } from "@/providers/story-provider";
import { aiRequestHeaders } from "@/lib/ai/user-key";

type AnalysisStatus = "success" | "loading" | "error";
type SourceMode = "snapshot" | "project" | "import";

function isLiteraryAnalysis(result: AiTaskPayload): result is LiteraryAnalysisResult {
  return "sourceKind" in result && "relationGraph" in result && "diagnostics" in result;
}

function mentorSource(source: MentorResponse["evidence"][number]["source"]) {
  return source === "observation" ? "原文观察" : source === "inference" ? "文学推断" : "知识参考";
}

function legacyAnalysis(state: StoryState): LiteraryAnalysisResult {
  const evidence = state.evidence.map((item) => ({
    id: item.id,
    source: item.source,
    ...(item.source === "inference" ? { claim: item.quote } : { quote: item.quote }),
    note: item.note,
  }));
  const firstEvidence = evidence.find((item) => item.source === "user") ?? evidence[0];
  const legacyEvidenceIds = firstEvidence ? [firstEvidence.id] : [];
  const legacyFinding = (label: string) => ({ label, description: "当前为旧版案例快照，重跑后可获得结构化证据。", evidenceIds: legacyEvidenceIds });
  const segments = state.plotCurve.map((point) => point.beat);
  return {
    sourceKind: "narrative",
    domainAnalysis: {
      kind: "narrative",
      characters: { goals: [legacyFinding("人物目标")], actions: [legacyFinding("人物行动")], relationshipChanges: [legacyFinding("关系变化")] },
      plot: { turningPoints: [legacyFinding("情节转折")], setups: [legacyFinding("前置铺垫")], payoffs: [legacyFinding("线索回收")] },
      themes: { stages: [{ stage: segments[0] ?? "当前片段", theme: "核心主题", change: "等待重跑识别", reason: "旧版快照仅用于兼容展示。", evidenceIds: legacyEvidenceIds }] },
    },
    analysis: state.analysis,
    evidence,
    relationGraph: state.characterGraph,
    paceCurve: state.plotCurve.map((point) => ({ segment: point.beat, value: point.value, evidenceId: point.evidenceId })),
    emotionCurve: state.emotionCurve.map((point) => ({ segment: point.beat, value: Math.max(0, Math.min(100, point.value + 50)), evidenceId: point.evidenceId })),
    themeHeatmap: segments.flatMap((segment, index) => [
      { theme: "核心主题", segment, value: Math.min(100, 38 + index * 11), evidenceId: state.plotCurve[index]?.evidenceId ?? firstEvidence?.id ?? "" },
      { theme: "人物选择", segment, value: Math.min(100, 26 + index * 14), evidenceId: state.plotCurve[index]?.evidenceId ?? firstEvidence?.id ?? "" },
    ]).filter((cell) => cell.evidenceId),
    styleProfile: { metrics: [
      { key: "sentenceLength", dimension: "句长", value: 1, unit: "字", interpretation: "等待重跑", evidenceIds: legacyEvidenceIds },
      { key: "dialogueRatio", dimension: "对话比例", value: 0, unit: "%", interpretation: "等待重跑", evidenceIds: legacyEvidenceIds },
      { key: "sensoryDensity", dimension: "感官密度", value: 0, unit: "%", interpretation: "等待重跑", evidenceIds: legacyEvidenceIds },
      { key: "rhetoric", dimension: "修辞", value: 0, unit: "分", interpretation: "等待重跑", evidenceIds: legacyEvidenceIds },
      { key: "narrativeDistance", dimension: "叙事距离", value: 0, unit: "分", interpretation: "等待重跑", evidenceIds: legacyEvidenceIds },
      { key: "rhythm", dimension: "节律", value: 0, unit: "分", interpretation: "等待重跑", evidenceIds: legacyEvidenceIds },
    ] },
    diagnostics: firstEvidence && "quote" in firstEvidence && firstEvidence.quote ? [{ id: "legacy-diagnostic", location: segments[0] ?? "当前片段", quote: firstEvidence.quote, effect: "当前为项目内置诊断快照，建议重跑以获得逐段结构分析。", action: "重跑后检查此处铺垫是否充分。", confidence: 0.5, evidenceIds: [firstEvidence.id] }] : [],
    retrievalEvidence: [],
  };
}

function DomainAnalysisLedger({ result, onEvidence }: { result: LiteraryAnalysisResult; onEvidence: (id: string) => void }) {
  const findingGroup = (title: string, findings: Array<{ label: string; description: string; evidenceIds: string[] }>) => <article key={title}>
    <h3>{title}</h3>
    {findings.map((finding, index) => <button key={`${finding.label}-${index}`} type="button" onClick={() => onEvidence(finding.evidenceIds[0])}>
      <strong>{finding.label}</strong><span>{finding.description}</span><small>{finding.evidenceIds.join(" · ")}</small>
    </button>)}
  </article>;
  const domain = result.domainAnalysis;
  const groups = domain.kind === "narrative"
    ? [
      findingGroup("人物目标", domain.characters.goals),
      findingGroup("人物行动", domain.characters.actions),
      findingGroup("关系变化", domain.characters.relationshipChanges),
      findingGroup("情节转折", domain.plot.turningPoints),
      findingGroup("前置铺垫", domain.plot.setups),
      findingGroup("线索回收", domain.plot.payoffs),
    ]
    : [
      findingGroup("核心论点", domain.argument.claims),
      findingGroup("论据单元", domain.argument.evidenceUnits),
      findingGroup("推理链路", domain.argument.reasoningSteps),
    ];
  return <section className="analysis-domain-ledger" aria-labelledby="analysis-domain-title">
    <header><div><span className="eyebrow">结构化分析域</span><h2 id="analysis-domain-title">完整领域分析</h2></div><small>{domain.kind === "narrative" ? "叙事机制" : "论证机制"}</small></header>
    <div className="analysis-domain-grid">{groups}<article><h3>主题阶段</h3>{domain.themes.stages.map((stage, index) => <button key={`${stage.stage}-${stage.theme}-${index}`} type="button" onClick={() => onEvidence(stage.evidenceIds[0])}><strong>{stage.stage} · {stage.theme}</strong><span>{stage.change}</span><span>{stage.reason}</span><small>{stage.evidenceIds.join(" · ")}</small></button>)}</article></div>
  </section>;
}

export function AnalysisWorkspace({ projectId, sourceProjectId, chapterId, sourceContext, initialSelection }: {
  projectId?: string;
  sourceProjectId?: string;
  chapterId?: string;
  sourceContext?: "studio";
  initialSelection?: string;
}) {
  const { state: storyState, setState, selectProject, recordAiRun } = useStory();
  const linkProjectMismatch = Boolean(sourceProjectId && projectId && sourceProjectId !== projectId);
  const routedProjectExists = !projectId || storyState.projects.some((project) => project.id === projectId);
  const routeReady = !projectId || storyState.activeProjectId === projectId;
  const isCase = storyState.activeProjectId === "demo" || storyState.activeProjectId.startsWith("demo-");
  const [selectedSourceMode, setSourceMode] = useState<SourceMode>(sourceContext === "studio" ? "project" : isCase ? "snapshot" : "project");
  const sourceMode = selectedSourceMode === "snapshot" && !isCase ? "project" : selectedSourceMode;
  const projectSource = routeReady && routedProjectExists ? resolveProjectAnalysisSource(storyState, projectId ?? storyState.activeProjectId, chapterId) : null;
  const invalidChapter = Boolean(routeReady && chapterId && !projectSource);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importError, setImportError] = useState("");
  const safeInitialSelection = useMemo(() => initialSelection?.trim() && projectSource?.text.includes(initialSelection.trim()) ? initialSelection.trim().slice(0, 8_000) : "", [initialSelection, projectSource?.text]);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<LiteraryAnalysisResult | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>("success");
  const [aiStatus, setAiStatus] = useState<AiProgressStatus>("idle");
  const [progressTask, setProgressTask] = useState<"analysis" | "mentor">("analysis");
  const [analysisMode, setAnalysisMode] = useState<"live" | "demo">("demo");
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [analysisNotices, setAnalysisNotices] = useState<string[]>([]);
  const [mentorMode, setMentorMode] = useState<"live" | "demo">("demo");
  const [mentorWarnings, setMentorWarnings] = useState<string[]>([]);
  const [mentorNotices, setMentorNotices] = useState<string[]>([]);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [selectedSegment, setSelectedSegment] = useState<string | undefined>();
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState<string | undefined>();
  const [mentor, setMentor] = useState<MentorResponse | null>(null);
  const [sourceKindOverride, setSourceKindOverride] = useState<{ sourceHash: string; kind: "narrative" | "argumentative" } | null>(null);
  const effectiveImportLength = importText.trim().length;

  useEffect(() => { if (projectId) selectProject(projectId); }, [projectId, selectProject]);

  const projectAnalysisText = safeInitialSelection || projectSource?.text || "";
  const analysisText = sourceMode === "import" ? importText.trim() : projectAnalysisText;
  const sourceHash = analysisSourceHash(analysisText);
  const detectedSourceKind = detectLiterarySourceKind(analysisText);
  const hasSourceKindOverride = sourceKindOverride?.sourceHash === sourceHash;
  const sourceKind = hasSourceKindOverride ? sourceKindOverride.kind : detectedSourceKind;
  const sourceToken = [
    projectSource?.projectId ?? projectId ?? storyState.activeProjectId,
    projectSource?.chapterId ?? chapterId ?? "",
    sourceMode,
    sourceHash,
    sourceKind,
    storyState.contextRevision,
  ].join("|");
  const currentSnapshot = projectSource ? findCurrentAnalysisSnapshot(storyState.analysisSnapshots, {
    projectId: projectSource.projectId,
    chapterId: projectSource.chapterId,
    sourceText: projectAnalysisText,
    contextRevision: storyState.contextRevision,
  }) : null;
  const restoredAnalysis = currentSnapshot ? analysisResultFromSnapshot(currentSnapshot) : null;
  const displayAnalysis = analysisResult ?? (sourceMode === "project" ? restoredAnalysis : null) ?? (sourceMode === "snapshot" ? legacyAnalysis(storyState) : null);
  const displayAnalysisMode = analysisResult ? analysisMode : restoredAnalysis && currentSnapshot ? currentSnapshot.mode : "demo";
  const partial = displayAnalysisMode === "live" && Boolean(displayAnalysis?.discardedDiagnostics?.length || displayAnalysis?.degradedRetrievalIds?.length || displayAnalysis?.evidence.some(e => e.verification === "unverified"));
  const displayAnalysisWarnings = status === "error" && progressTask === "analysis"
    ? analysisWarnings
    : analysisResult ? analysisWarnings : restoredAnalysis && currentSnapshot ? currentSnapshot.warnings ?? [] : [];
  const hasStaleSnapshot = Boolean(projectSource && !currentSnapshot && storyState.analysisSnapshots.some((snapshot) => snapshot.sourceProjectId === projectSource.projectId && snapshot.sourceChapterId === projectSource.chapterId));
  const activeText = selectedText ?? (safeInitialSelection || analysisText.slice(0, 8_000));
  const requestSequenceRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const currentSourceTokenRef = useRef(sourceToken);
  const currentMentorTokenRef = useRef(`${sourceToken}|${analysisSourceHash(activeText)}`);

  useEffect(() => {
    currentSourceTokenRef.current = sourceToken;
    currentMentorTokenRef.current = `${sourceToken}|${analysisSourceHash(activeText)}`;
  }, [activeText, sourceToken]);

  const invalidatePendingRequest = useCallback(() => {
    requestSequenceRef.current += 1;
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
  }, []);

  useEffect(() => {
    invalidatePendingRequest();
    return invalidatePendingRequest;
  }, [invalidatePendingRequest, sourceToken]);

  const beginRequest = useCallback((requestToken: string) => {
    activeAbortRef.current?.abort();
    const controller = new AbortController();
    const sequence = ++requestSequenceRef.current;
    activeAbortRef.current = controller;
    return { controller, sequence, requestToken };
  }, []);

  const isCurrentRequest = useCallback((request: { controller: AbortController; sequence: number; requestToken: string }) => (
    !request.controller.signal.aborted
      && request.sequence === requestSequenceRef.current
      && request.requestToken === currentSourceTokenRef.current
  ), []);

  const isCurrentMentorRequest = useCallback((request: { controller: AbortController; sequence: number; requestToken: string }) => (
    !request.controller.signal.aborted
      && request.sequence === requestSequenceRef.current
      && request.requestToken === currentMentorTokenRef.current
  ), []);

  const openEvidence = useCallback((id: string, segment?: string) => { if (id) setEvidenceId(id); if (segment) setSelectedSegment(segment); }, []);
  const selectCharacter = useCallback((id: string) => { setSelectedNodeId(id); openEvidence(displayAnalysis?.relationGraph.edges.find((edge) => edge.source === id || edge.target === id)?.evidenceIds?.[0] ?? displayAnalysis?.evidence[0]?.id ?? ""); }, [displayAnalysis, openEvidence]);
  const requestContext = () => {
    const context = contextFromState(storyState);
    return projectSource ? { ...context, activeChapterId: projectSource.chapterId } : context;
  };

  const runAnalysis = async () => {
    if (!analysisText || invalidChapter || !routedProjectExists || linkProjectMismatch || (sourceMode === "import" && effectiveImportLength > 20_000)) return;
    const request = beginRequest(sourceToken);
    setStatus("loading"); setAiStatus("loading"); setProgressTask("analysis"); setAnalysisWarnings([]);
    try {
      const response = await fetch("/api/ai", { method: "POST", signal: request.controller.signal, headers: aiRequestHeaders(), body: JSON.stringify({ task: "analysis-v2", project: requestContext(), input: { sourceText: analysisText, sourceKind, prompt: sourceMode === "import" ? "分析用户临时导入文本；文本仅用于本次请求，不保存为项目。" : "对当前作品来源做完整、可定位的文学诊断。" } }) });
      const data = await response.json() as { mode?: "live" | "demo"; result?: AiTaskPayload; warnings?: string[]; notices?: string[]; contextRevision?: number };
      if (!isCurrentRequest(request)) return;
      if (!response.ok || !data.result || !isLiteraryAnalysis(data.result)) throw new Error("INVALID_ANALYSIS");
      const warnings = data.warnings ?? [];
      setAnalysisResult(data.result); setAnalysisMode(data.mode ?? "demo"); setAnalysisWarnings(warnings); setAnalysisNotices(data.notices ?? []); setStatus("success"); setAiStatus("success");
      if (sourceMode !== "import" && projectSource) {
        const snapshot = createAnalysisSnapshot({ projectId: projectSource.projectId, chapterId: projectSource.chapterId, sourceText: analysisText, contextRevision: data.contextRevision ?? storyState.contextRevision, mode: data.mode ?? "demo", warnings, result: data.result });
        setState((current) => current.activeProjectId !== projectSource.projectId ? current : { ...current, analysisSnapshots: [snapshot, ...current.analysisSnapshots.filter((item) => item.sourceChapterId !== projectSource.chapterId)].slice(0, 12) });
      }
      if (sourceMode !== "import") recordAiRun({ projectId: storyState.activeProjectId, task: "analysis-v2", mode: data.mode ?? "demo", request: { sourceMode, sourceKind, chapterId: projectSource?.chapterId, characters: analysisText.length }, result: data.result });
    } catch {
      if (!isCurrentRequest(request)) return;
      setAnalysisWarnings(["AI 分析请求失败；当前来源文本与已有证据未受影响，未生成未经校验的结论。"]);
      setStatus("error"); setAiStatus("error");
    } finally {
      if (activeAbortRef.current === request.controller) activeAbortRef.current = null;
    }
  };

  const askMentor = async () => {
    if (!activeText.trim()) return;
    const request = beginRequest(`${sourceToken}|${analysisSourceHash(activeText)}`);
    setStatus("loading"); setAiStatus("loading"); setProgressTask("mentor"); setMentorWarnings([]);
    try {
      const response = await fetch("/api/ai", { method: "POST", signal: request.controller.signal, headers: aiRequestHeaders(), body: JSON.stringify({ task: "mentor", project: requestContext(), input: { prompt: "为什么这样写？请区分观察、推断和知识参考。", selectedText: activeText, sourceText: activeText } }) });
      const data = await response.json() as { mode?: "live" | "demo"; result?: { mentor?: MentorResponse }; warnings?: string[]; notices?: string[] };
      if (!isCurrentMentorRequest(request)) return;
      if (!response.ok || !data.result?.mentor) throw new Error("MENTOR_FAILED");
      setMentor(data.result.mentor); setMentorMode(data.mode ?? "demo"); setMentorWarnings(data.warnings ?? []); setMentorNotices(data.notices ?? []); setStatus("success"); setAiStatus("success");
      if (sourceMode !== "import") recordAiRun({ projectId: storyState.activeProjectId, task: "mentor", mode: data.mode ?? "demo", request: { selectedText: activeText, sourceMode }, result: data.result });
    } catch {
      if (!isCurrentMentorRequest(request)) return;
      setMentorWarnings(["导师解释请求失败；系统没有把未经校验的结论显示为真实分析。"]);
      setStatus("error"); setAiStatus("error");
    } finally {
      if (activeAbortRef.current === request.controller) activeAbortRef.current = null;
    }
  };

  const readFile = async (file?: File) => {
    setImportError("");
    setAnalysisResult(null); setMentor(null); setSelectedText(null); setAnalysisWarnings([]); setAnalysisNotices([]); setMentorWarnings([]); setMentorNotices([]); setStatus("success"); setAiStatus("idle");
    if (!file) return;
    const supportedType = !file.type || file.type === "text/plain" || file.type === "text/markdown" || file.type === "text/x-markdown";
    if (!/\.(txt|md)$/i.test(file.name) || !supportedType) { setImportError("仅支持 UTF-8 编码的 TXT 或 MD 文件。"); return; }
    if (file.size > 256 * 1024) { setImportError("文件超过 256KB，请截取需要分析的部分。"); return; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (text.trim().length > 20_000) { setImportError("有效分析文本超过 20,000 字，请截取后重试。"); setImportText(text); return; }
      setImportName(file.name); setImportText(text); setAnalysisResult(null);
    } catch { setImportError("文件不是有效的 UTF-8 文本。"); }
  };

  const changeSource = (next: SourceMode) => { setSourceMode(next); setSourceKindOverride(null); setAnalysisResult(null); setMentor(null); setStatus("success"); setAnalysisMode("demo"); setMentorMode("demo"); setAnalysisWarnings([]); setAnalysisNotices([]); setMentorWarnings([]); setMentorNotices([]); setEvidenceId(null); };
  const selectDiagnostic = (diagnostic: LiteraryDiagnostic) => { setSelectedDiagnosticId(diagnostic.id); setSelectedText(diagnostic.quote); setSelectedSegment(diagnostic.location); openEvidence(diagnostic.evidenceIds[0], diagnostic.location); };
  const selectedEvidence = displayAnalysis?.evidence.find((item) => item.id === evidenceId);
  const sourceError = linkProjectMismatch ? "链接中的来源项目与当前路由不一致，未加载其他项目内容。" : !routedProjectExists ? "链接中的项目不存在，未加载其他项目内容。" : invalidChapter ? "链接中的章节不属于当前项目，未回退到其他章节。" : "";
  const runDisabled = status === "loading" || Boolean(sourceError) || !analysisText || (sourceMode === "import" && effectiveImportLength > 20_000);

  return <div className="analysis-page">
    <header className="analysis-head analysis-head-live"><div><span className="eyebrow">文学诊断 / Evidence Lab</span><h1>{storyState.projects.find((project) => project.id === storyState.activeProjectId)?.title ?? "未命名作品"}</h1></div><div className="analysis-source" aria-label="分析来源"><button aria-pressed={sourceMode === "snapshot"} disabled={!isCase} onClick={() => changeSource("snapshot")}>案例快照</button><button aria-pressed={sourceMode === "project"} onClick={() => changeSource("project")}>当前项目</button><button aria-pressed={sourceMode === "import"} onClick={() => changeSource("import")}>用户文本</button></div><div className="analysis-state"><StatusBadge kind={sourceMode === "snapshot" && !analysisResult ? "demo" : displayAnalysisMode === "live" ? "success" : "demo"}>{sourceMode === "snapshot" && !analysisResult ? "案例快照" : partial ? "真实分析（部分通过）" : displayAnalysisMode === "live" ? "真实分析" : "演示结果"}</StatusBadge><Button aria-label={sourceMode === "import" ? "分析用户文本" : "真实重跑"} onClick={runAnalysis} disabled={runDisabled}><RefreshCw size={15} />{sourceMode === "import" ? "分析用户文本" : "真实重跑"}</Button></div></header>
    {sourceContext === "studio" && projectSource && <section className="analysis-context-banner"><strong>创作台直达</strong><span>当前来源：{projectSource.title} · revision {storyState.contextRevision}{safeInitialSelection ? " · 当前选区" : " · 完整章节"}</span></section>}
    {sourceError && <div className="analysis-warning" role="alert"><AlertTriangle size={16} />{sourceError}</div>}
    {initialSelection && projectSource && !safeInitialSelection && <div className="analysis-warning" role="status"><AlertTriangle size={16} />链接选区不在当前章节中，已忽略该选区。</div>}
    {hasStaleSnapshot && sourceMode === "project" && !analysisResult && <div className="analysis-warning" role="status"><AlertTriangle size={16} />作品文本或上下文修订已变化，旧诊断快照已失效，请重新分析。</div>}
    {sourceMode === "import" && <section className="analysis-import"><div className="import-head"><div><FileText size={18} /><strong>{importName || "临时文本"}</strong></div><label className="button button-secondary"><Upload size={15} />选择 TXT / MD<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void readFile(event.target.files?.[0])} /></label></div><textarea className="textarea" aria-label="待分析文本" value={importText} onChange={(event) => { const value = event.target.value; setImportText(value); setImportError(value.trim().length > 20_000 ? "有效分析文本超过 20,000 字，请截取后重试。" : ""); setAnalysisResult(null); }} placeholder="粘贴需要分析的文本……" /><footer><span>{effectiveImportLength.toLocaleString("en-US")} / 20,000 字</span><span>不会自动保存为项目或分析快照</span></footer>{importError && <p role="alert" className="form-error">{importError}</p>}</section>}
    {sourceMode !== "snapshot" && <div className="field analysis-kind"><span>{hasSourceKindOverride ? `用户修正：${sourceKind === "narrative" ? "叙事文本" : "论述文本"}` : `系统识别：${sourceKind === "narrative" ? "叙事文本" : "论述文本"}`}</span><select aria-label="文本类型" value={sourceKind} onChange={(event) => setSourceKindOverride({ sourceHash, kind: event.target.value as typeof sourceKind })}><option value="narrative">叙事文本</option><option value="argumentative">论述文本</option></select>{hasSourceKindOverride && <button type="button" className="analysis-kind-reset" onClick={() => setSourceKindOverride(null)}>恢复系统识别</button>}</div>}
    {displayAnalysisWarnings.map((item) => <div className="analysis-warning" role="status" key={item}><AlertTriangle size={16} />{item}</div>)}
    {analysisNotices.map((item) => <div className="ai-notice" role="status" key={item}><CheckCircle2 size={16} />{item}</div>)}
    <AiProgress status={progressTask === "analysis" ? aiStatus : "idle"} label="文学诊断生成进度" />
    {status === "error" && progressTask === "analysis" ? <div className="analysis-error" role="alert"><AlertTriangle /><div><strong>分析暂时不可用</strong><p>当前文本和已有证据未受影响。</p></div>{displayAnalysis && <Button onClick={() => setStatus("success")}>查看上次结果</Button>}</div> : displayAnalysis ? <>
      <div className="analysis-grid"><section className="dimension-panel"><div className="dimension-title"><div><h2>{displayAnalysis.sourceKind === "narrative" ? "文学结构诊断" : "论证结构诊断"}</h2><p>每项结论都可回到本次来源证据。</p></div><StatusBadge>{displayAnalysis.analysis.length ? "已生成" : "等待分析"}</StatusBadge></div><div className="dimension-list">{displayAnalysis.analysis.map((dimension) => <article data-testid="analysis-dimension" key={dimension.id}><div className="dimension-score"><span>{dimension.name}</span><strong>{dimension.score} / 100</strong></div><div className="dimension-copy"><h3>{dimension.summary}</h3><p>{dimension.impact}</p><div className="suggestion"><CheckCircle2 size={15} /><span>{dimension.suggestion}</span></div><div className="evidence-links">{dimension.evidenceIds.map((id) => <Button key={id} variant="ghost" aria-label={`证据 ${id}`} onClick={() => openEvidence(id)}>{id}</Button>)}</div></div></article>)}</div></section><section className="visual-panel"><Tabs defaultValue="graph"><TabsList className="analysis-tabs"><TabsTrigger value="graph"><Network size={15} />关系网络</TabsTrigger><TabsTrigger value="plot">情节节奏</TabsTrigger><TabsTrigger value="emotion">情绪曲线</TabsTrigger><TabsTrigger value="style">语言风格</TabsTrigger></TabsList><TabsContent value="graph"><CharacterGraph graph={displayAnalysis.relationGraph} selectedId={selectedNodeId} onSelect={selectCharacter} /></TabsContent><TabsContent value="plot"><StoryCurves type="plot" data={displayAnalysis.paceCurve} selectedSegment={selectedSegment} onEvidence={openEvidence} /></TabsContent><TabsContent value="emotion"><StoryCurves type="emotion" data={displayAnalysis.emotionCurve} selectedSegment={selectedSegment} onEvidence={openEvidence} /></TabsContent><TabsContent value="style"><div className="style-profile" aria-label="语言风格指标">{displayAnalysis.styleProfile.metrics.map((metric) => <button key={metric.dimension} onClick={() => openEvidence(metric.evidenceIds[0])}><span><b>{metric.dimension}</b><small>{metric.interpretation}</small></span><strong>{metric.value}{metric.unit ?? ""}</strong></button>)}</div></TabsContent></Tabs></section></div>
      <DomainAnalysisLedger result={displayAnalysis} onEvidence={openEvidence} />
      <AnalysisDiagnostics diagnostics={displayAnalysis.diagnostics} selectedId={selectedDiagnosticId} onSelect={selectDiagnostic} />
      <AnalysisIntegrity result={displayAnalysis} />
      {displayAnalysis.retrievalEvidence.length > 0 && <section className="analysis-retrieval"><span className="eyebrow">知识参考</span>{displayAnalysis.retrievalEvidence.map((item) => <article key={item.retrievalId}><StatusBadge kind="knowledge">{item.sourceStatus === "verified" ? "已核验" : item.sourceStatus === "summary_only" ? "摘要" : "待核验"}</StatusBadge><q>{item.quote}</q><small>{item.retrievalId}</small></article>)}</section>}
    </> : <section className="analysis-empty"><h2>等待分析</h2><p>选择当前项目或导入 TXT / MD 后运行文学诊断。</p></section>}
    <section className="explain-panel"><div className="explain-heading"><div><span className="eyebrow">文学导师</span><h2>为什么这样写</h2></div>{mentor ? <StatusBadge kind={mentorMode === "live" ? "success" : "demo"}>{mentorMode === "live" ? "在线解释" : "演示解释"}</StatusBadge> : <Lightbulb size={20} />}</div><label className="field"><span>选中文本</span><textarea className="textarea" aria-label="选中文本" value={activeText} onChange={(event) => setSelectedText(event.target.value)} /></label><Button onClick={askMentor} disabled={!activeText.trim() || status === "loading" || Boolean(sourceError)}><Lightbulb size={16} />解释这段文字</Button>{progressTask === "mentor" && <AiProgress status={aiStatus} label="文本解释生成进度" />}{mentorWarnings.map((item) => <div className="analysis-warning" role="status" key={item}><AlertTriangle size={16} />{item}</div>)}{mentorNotices.map((item) => <div className="ai-notice" role="status" key={item}><CheckCircle2 size={16} />{item}</div>)}{mentor && <div className="mentor-result analysis-mentor-result"><section><span>核心判断</span><h3>{mentor.thesis}</h3></section><section><span>原文证据</span>{mentor.evidence.map((item, index) => <article key={`${item.quote}-${index}`}><StatusBadge kind={item.source === "observation" ? "success" : item.source === "knowledge" ? "knowledge" : "demo"}>{mentorSource(item.source)}</StatusBadge><q>{item.quote}</q>{item.note && <p>{item.note}</p>}{item.retrievalId && <small>{item.retrievalId}</small>}</article>)}</section>{[["文学技法", mentor.craft], ["阅读效果", mentor.effect], ["一致性问题", mentor.consistency], ["修改实验", mentor.experiments], ["启发式追问", mentor.questions]].map(([label, items]) => <section key={label as string}><span>{label as string}</span><ul>{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul></section>)}{mentor.references.length > 0 && <section className="mentor-references"><span>知识参考</span>{mentor.references.map((item) => <article key={item.retrievalId}><StatusBadge kind="knowledge">{item.sourceStatus === "verified" ? "已核验" : item.sourceStatus === "summary_only" ? "摘要" : "待核验"}</StatusBadge><strong>{item.title}</strong><p>{item.sourceTitle}</p><small>{item.retrievalId}</small><p>{item.note}</p></article>)}</section>}</div>}</section>
    <EvidenceDrawer evidence={selectedEvidence} onClose={() => setEvidenceId(null)} />
  </div>;
}
