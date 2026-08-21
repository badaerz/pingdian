"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Clapperboard, Download, FileText, ImagePlus, Maximize2, Minus, Palette, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiProgress } from "@/components/ui/ai-progress";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { contextFromState } from "@/lib/ai/story-context";
import type { AssetCapabilities, AssetGenerationInput } from "@/lib/assets/generation";
import { loadAssetBlob, saveAssetBlob } from "@/lib/assets/indexed-db";
import type { Candidate, ImageGenerationSettings, IpAssetMetadata } from "@/lib/types";
import { useStory } from "@/providers/story-provider";

type LabStatus = "idle" | "loading" | "success" | "error";
type RecommendationDraft = { settings: ImageGenerationSettings; reasons: Record<string, string>; confidence: number };

const defaultNegativePrompt = "低分辨率，低画质，肢体畸形，手指畸形，文字，标志，水印";
const maxUploadBytes = 128 * 1024;
const uploadMimeTypes = new Set(["text/plain", "text/markdown", "text/x-markdown"]);

function localFallbackAsset(input: AssetGenerationInput): IpAssetMetadata {
  return {
    id: `asset-demo-${crypto.randomUUID()}`,
    kind: input.kind,
    title: input.title,
    mode: "demo",
    previewUrl: input.kind === "poster" ? "/visuals/ip-lab-poster.webp" : "/visuals/ip-lab-character.webp",
    createdAt: new Date().toISOString(),
    confirmed: false,
    requestedSettings: input.settings,
    ...(input.characterId ? { characterId: input.characterId } : {}),
    generationStatus: "failed",
    failureStage: "timeout",
  };
}

function triggerImageDownload(blob: Blob, title: string) {
  const extension = blob.type.split("/")[1]?.split(";")[0] || "png";
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "story-forge-image";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeTitle}.${extension}`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function IpLabWorkspace({ projectId }: { projectId?: string }) {
  return <ProjectIpLabWorkspace key={projectId ?? "active-project"} projectId={projectId} />;
}

function ProjectIpLabWorkspace({ projectId }: { projectId?: string }) {
  const { state, setState, selectProject, recordAiRun, setImageGenerationSettings } = useStory();
  const [characterId, setCharacterId] = useState(state.characters[0]?.id ?? "");
  const [assetKind, setAssetKind] = useState<"character-visual" | "poster">("character-visual");
  const [medium, setMedium] = useState("电影感纪实摄影");
  const [palette, setPalette] = useState("冷绿 / 信号金 / 炭黑");
  const [brief, setBrief] = useState<Candidate | null>(null);
  const [briefConfirmed, setBriefConfirmed] = useState(false);
  const [imageCandidate, setImageCandidate] = useState<IpAssetMetadata | null>(() => state.ipAssets[state.ipAssets.length - 1] ?? null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imagePreviewAssetId, setImagePreviewAssetId] = useState("");
  const [imageConfirmed, setImageConfirmed] = useState(() => Boolean(state.ipAssets[state.ipAssets.length - 1]?.confirmed));
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [storyboard, setStoryboard] = useState<Candidate | null>(null);
  const [status, setStatus] = useState<LabStatus>("idle");
  const [task, setTask] = useState<"recommendation" | "brief" | "image" | "storyboard">("brief");
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [capabilities, setCapabilities] = useState<AssetCapabilities | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationDraft | null>(null);
  const [recommendationMode, setRecommendationMode] = useState<"live" | "demo">("demo");
  const [recommendationSource, setRecommendationSource] = useState<"project" | "upload">("project");
  const [uploadedText, setUploadedText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const projectRequestEpoch = useRef(0);
  const closeImageViewer = () => {
    setImageViewerOpen(false);
    setImageZoom(1);
  };

  useEffect(() => { if (projectId) selectProject(projectId); }, [projectId, selectProject]);
  useEffect(() => {
    return () => { projectRequestEpoch.current += 1; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const previewUrl = imageCandidate?.previewUrl ?? "";
    if (!previewUrl.startsWith("indexeddb://")) return () => { cancelled = true; };
    const assetId = previewUrl.slice("indexeddb://".length);
    if (imagePreviewAssetId === assetId && imagePreviewUrl) return () => { cancelled = true; };
    void loadAssetBlob(assetId).then((blob) => {
      if (!cancelled && blob) {
        setImagePreviewUrl(URL.createObjectURL(blob));
        setImagePreviewAssetId(assetId);
      }
    }).catch(() => {
      if (!cancelled) setWarning("本地图片读取失败，请重新保存图像。");
    });
    return () => { cancelled = true; };
  }, [imageCandidate?.previewUrl, imagePreviewAssetId, imagePreviewUrl]);
  useEffect(() => {
    if (!imageViewerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeImageViewer(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [imageViewerOpen]);
  useEffect(() => () => {
    if (imagePreviewUrl.startsWith("blob:")) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/assets/capabilities")
      .then(async (response) => {
        if (!response.ok) throw new Error("CAPABILITIES_UNAVAILABLE");
        return response.json() as Promise<AssetCapabilities>;
      })
      .then((value) => {
        if (cancelled) return;
        setCapabilities(value);
      })
      .catch(() => { if (!cancelled) setWarning("图像参数能力暂时不可用，请稍后重试。"); });
    return () => { cancelled = true; };
  }, []);

  const project = state.projects.find((item) => item.id === state.activeProjectId);
  const selectedCharacterId = state.characters.some((item) => item.id === characterId) ? characterId : state.characters[0]?.id ?? "";
  const character = state.characters.find((item) => item.id === selectedCharacterId) ?? state.characters[0];
  const projectPrompt = useMemo(() => [
    `作品：${project?.title ?? "未命名作品"}`,
    `人物：${character?.name ?? "主角"}；身份：${character?.role ?? "未设定"}；欲望：${character?.desire ?? "未设定"}`,
    `媒介：${medium}；色彩：${palette}`,
    `类型：${assetKind === "poster" ? "文学海报" : "角色主视觉"}`,
    "画面不得出现任何文字、标志或水印。",
  ].filter(Boolean).join("\n"), [assetKind, character, medium, palette, project?.title]);
  const settings = state.imageGenerationSettings;
  const effectiveSettings = useMemo<ImageGenerationSettings>(() => ({
    ...settings,
    prompt: settings.prompt.trim() || projectPrompt,
    negativePrompt: settings.negativePrompt || defaultNegativePrompt,
    model: capabilities?.models.some((item) => item.id === settings.model) ? settings.model : capabilities?.models[0]?.id ?? settings.model,
    size: capabilities?.sizes.includes(settings.size) ? settings.size : capabilities?.sizes[0] ?? settings.size,
    advanced: capabilities ? Object.fromEntries(Object.entries(settings.advanced).filter(([key]) => key in capabilities.advanced)) : settings.advanced,
  }), [capabilities, projectPrompt, settings]);
  const projectSourceText = useMemo(() => state.chapters.map((chapter) => chapter.content).filter(Boolean).join("\n\n").slice(0, 20_000), [state.chapters]);

  const updateSettings = (next: ImageGenerationSettings) => {
    setImageGenerationSettings(next);
  };

  const updateSetting = <Key extends keyof ImageGenerationSettings>(key: Key, value: ImageGenerationSettings[Key]) => {
    updateSettings({ ...effectiveSettings, [key]: value });
  };

  const updateAdvanced = (key: string, value: string) => {
    const advanced = { ...effectiveSettings.advanced };
    if (!value.trim()) delete advanced[key];
    else advanced[key] = Number(value);
    updateSetting("advanced", advanced);
  };

  const requestAi = async (aiTask: "visual-brief" | "storyboard", requestEpoch: number) => {
    const visualPrompt = [
      effectiveSettings.prompt,
      `人物：${character?.name ?? "未指定"}；身份：${character?.role ?? "未设定"}；欲望：${character?.desire ?? "未设定"}`,
      `媒介：${medium}；色彩：${palette}；资产类型：${assetKind === "poster" ? "文学海报" : "角色主视觉"}`,
      aiTask === "storyboard" ? "承接已确认视觉简报，生成六个连续可执行镜头。" : "先生成可编辑视觉简报，所有细节必须服从当前作品设定。",
    ].join("\n");
    const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: aiTask, project: contextFromState(state), input: { prompt: visualPrompt, characterId: selectedCharacterId } }) });
    let payload: { mode?: "live" | "demo"; result?: { candidates?: Candidate[]; visualBrief?: { title: string; subject: string; composition: string; palette: string[]; atmosphere: string; negativePrompt: string }; storyboard?: Array<{ shot: number; framing: string; action: string; sound: string; prompt: string }> }; warnings?: string[]; notices?: string[] };
    try {
      payload = await response.json();
    } catch {
      throw new Error("AI_INVALID_RESPONSE");
    }
    const mode = payload.mode ?? "demo";
    const result = payload.result;
    const candidate = result?.candidates?.[0] ?? (aiTask === "visual-brief" && result?.visualBrief ? {
      id: `visual-brief-${crypto.randomUUID()}`,
      label: result.visualBrief.title,
      content: `主体：${result.visualBrief.subject}\n构图：${result.visualBrief.composition}\n色彩：${result.visualBrief.palette.join("、")}\n氛围：${result.visualBrief.atmosphere}\n禁用元素：${result.visualBrief.negativePrompt}`,
      rationale: "从人物设定、媒介与色彩方向整理出可编辑的视觉前置约束。",
      tags: ["视觉简报", ...result.visualBrief.palette].slice(0, 4),
      status: "pending" as const,
      target: { type: "visual-brief" as const, id: state.activeProjectId },
      applyMode: "save-asset" as const,
      generatedRevision: state.contextRevision,
      mode,
    } : aiTask === "storyboard" && result?.storyboard ? {
      id: `storyboard-${crypto.randomUUID()}`,
      label: "六镜头分镜",
      content: result.storyboard.map((shot) => `${String(shot.shot).padStart(2, "0")} ${shot.framing}｜${shot.action}｜${shot.sound}`).join("\n"),
      rationale: "保持已确认主视觉的媒介与色彩约束，将人物行动拆成六个可执行镜头。",
      tags: ["六镜头", "分镜"],
      status: "pending" as const,
      target: { type: "storyboard" as const, id: state.activeProjectId },
      applyMode: "save-asset" as const,
      generatedRevision: state.contextRevision,
      mode,
    } : null);
    if (projectRequestEpoch.current !== requestEpoch) return null;
    if (!response.ok || !candidate) {
      if (payload.warnings?.length) setWarning(payload.warnings.join(" "));
      throw new Error("AI_TASK_FAILED");
    }
    setWarning(payload.warnings?.join(" ") ?? "");
    setNotice(payload.notices?.join(" ") ?? "");
    recordAiRun({ projectId: state.activeProjectId, task: aiTask, mode, request: { characterId: selectedCharacterId, prompt: visualPrompt, medium, palette, assetKind }, result: payload.result });
    return { ...candidate, mode, generatedRevision: state.contextRevision } as Candidate;
  };

  const generateBrief = async () => {
    const requestEpoch = projectRequestEpoch.current;
    setTask("brief"); setStatus("loading"); setWarning(""); setNotice(""); setBriefConfirmed(false); setImageCandidate(null); setImageConfirmed(false); setStoryboard(null);
    try {
      const candidate = await requestAi("visual-brief", requestEpoch);
      if (!candidate || projectRequestEpoch.current !== requestEpoch) return;
      setBrief(candidate);
      setStatus("success");
    } catch {
      if (projectRequestEpoch.current === requestEpoch) {
        setWarning((current) => current || "视觉简报返回结构无效，无法生成可编辑候选，请重试。" );
        setStatus("error");
      }
    }
  };

  const pollImageTask = async (input: AssetGenerationInput, providerTaskId: string, requestEpoch: number) => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      if (projectRequestEpoch.current !== requestEpoch) return;
      const response = await fetch("/api/assets/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, providerTaskId }) });
      const payload = await response.json() as { status?: "pending" | "live" | "demo"; asset?: IpAssetMetadata; result?: { asset?: IpAssetMetadata; warnings?: string[] }; warnings?: string[] };
      if (!response.ok) throw new Error("IMAGE_STATUS_FAILED");
      if (payload.status === "pending") continue;
      const completed = payload.status === "demo" ? payload.result?.asset : payload.asset;
      if (!completed) throw new Error("IMAGE_STATUS_INVALID");
      setImageCandidate({ ...completed, mode: payload.status === "live" ? "live" : completed.mode ?? "demo", confirmed: false });
      setWarning((payload.status === "demo" ? payload.result?.warnings : payload.warnings)?.join(" ") ?? "");
      setStatus("success");
      return;
    }
    setImageCandidate(localFallbackAsset(input));
    setWarning("ModelScope 任务等待超时，已切换为演示资产；可重试实时生成。");
    setStatus("success");
  };

  const generateImage = async (requestedInput?: AssetGenerationInput) => {
    if (!briefConfirmed) return;
    const requestEpoch = projectRequestEpoch.current;
    const generationInput: AssetGenerationInput = requestedInput ?? {
      kind: assetKind,
      title: `${character?.name ?? project?.title ?? "作品"}${assetKind === "poster" ? "文学海报" : "主视觉"}`,
      settings: effectiveSettings,
      characterId: selectedCharacterId,
    };
    setTask("image"); setStatus("loading"); setWarning(""); setNotice(""); setImageConfirmed(false); setStoryboard(null);
    try {
      const response = await fetch("/api/assets/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(generationInput) });
      let payload: { mode?: "live" | "demo"; asset?: IpAssetMetadata; warnings?: string[]; error?: string };
      try {
        payload = await response.json();
      } catch {
        throw new Error("IMAGE_INVALID_RESPONSE");
      }
      if (projectRequestEpoch.current !== requestEpoch) return;
      if (!response.ok || !payload.asset) {
        if (payload.warnings?.length) setWarning(payload.warnings.join(" "));
        else if (payload.error) setWarning(`图像任务未提交（${payload.error}），当前参数已保留，可重试。`);
        throw new Error("IMAGE_TASK_FAILED");
      }
      if (payload.asset.generationStatus === "pending" && payload.asset.providerTaskId) {
        setWarning(payload.warnings?.join(" ") ?? "图像任务已提交，正在等待模型返回结果。");
        await pollImageTask(generationInput, payload.asset.providerTaskId, requestEpoch);
        return;
      }
      setImageCandidate({ ...payload.asset, mode: payload.mode ?? payload.asset.mode ?? "demo", confirmed: false });
      setWarning(payload.warnings?.join(" ") ?? ""); setStatus("success");
    } catch {
      if (projectRequestEpoch.current !== requestEpoch) return;
      setWarning((current) => current || "图像生成请求失败，当前参数已保留，可直接重试。"); setStatus("error");
    }
  };

  const retryImage = () => {
    if (!imageCandidate?.requestedSettings || imageCandidate.kind === "storyboard") return;
    return generateImage({
      kind: imageCandidate.kind,
      title: imageCandidate.title,
      settings: imageCandidate.requestedSettings,
      ...(imageCandidate.characterId ? { characterId: imageCandidate.characterId } : {}),
    });
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    const requestEpoch = projectRequestEpoch.current;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "txt" && extension !== "md") {
      setWarning("仅支持 TXT 或 MD 临时文本。");
      return;
    }
    if (file.size > maxUploadBytes) {
      setWarning("临时文本文件大小不能超过 128 KB。");
      return;
    }
    if (file.type && !uploadMimeTypes.has(file.type.toLowerCase())) {
      setWarning("文件类型与 TXT 或 MD 不匹配。");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (projectRequestEpoch.current === requestEpoch) setWarning("临时文本读取失败，请重新选择文件。");
      return;
    }
    if (projectRequestEpoch.current !== requestEpoch) return;
    if (!text.trim() || text.length > 20_000) {
      setWarning("临时文本需为 1 至 20,000 个字符。");
      return;
    }
    setUploadedText(text);
    setUploadedFileName(file.name);
    setRecommendationSource("upload");
    setWarning(""); setNotice("");
  };

  const allowedRecommendation = (draft: ImageGenerationSettings) => {
    if (!capabilities) return effectiveSettings;
    const advanced = Object.fromEntries(Object.entries(draft.advanced).filter(([key, value]) => {
      const rule = capabilities.advanced[key];
      return rule?.type === typeof value
        && (typeof value !== "number" || (Number.isFinite(value) && (rule.min === undefined || value >= rule.min) && (rule.max === undefined || value <= rule.max)));
    }));
    return {
      prompt: draft.prompt,
      negativePrompt: draft.negativePrompt,
      model: capabilities.models.some((item) => item.id === draft.model) ? draft.model : effectiveSettings.model,
      size: capabilities.sizes.includes(draft.size) ? draft.size : effectiveSettings.size,
      advanced,
    };
  };

  const recommendParameters = async () => {
    const sourceText = recommendationSource === "upload" ? uploadedText : projectSourceText;
    if (!sourceText.trim()) {
      setWarning("当前来源没有可分析的正文，请先上传 TXT/MD 或在创作台写入正文。");
      return;
    }
    const requestEpoch = projectRequestEpoch.current;
    setTask("recommendation"); setStatus("loading"); setWarning(""); setNotice("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "image-parameter-recommendation",
          project: contextFromState(state),
          input: { sourceText, currentImageSettings: effectiveSettings },
        }),
      });
      const payload = await response.json() as { mode?: "live" | "demo"; result?: { imageRecommendation?: RecommendationDraft }; warnings?: string[]; notices?: string[] };
      if (projectRequestEpoch.current !== requestEpoch) return;
      if (!response.ok || !payload.result?.imageRecommendation) throw new Error("RECOMMENDATION_FAILED");
      const draft = { ...payload.result.imageRecommendation, settings: allowedRecommendation(payload.result.imageRecommendation.settings) };
      setRecommendation(draft);
      setRecommendationMode(payload.mode ?? "demo");
      setWarning(payload.warnings?.join(" ") ?? "");
      setNotice(payload.notices?.join(" ") ?? "");
      recordAiRun({ projectId: state.activeProjectId, task: "image-parameter-recommendation", mode: payload.mode ?? "demo", request: { source: recommendationSource, characterId: selectedCharacterId }, result: payload.result });
      setStatus("success");
    } catch {
      if (projectRequestEpoch.current !== requestEpoch) return;
      setWarning("AI 参数推荐暂时不可用，当前编辑内容已保留，可重试。");
      setStatus("error");
    }
  };

  const applyRecommendationField = (key: keyof ImageGenerationSettings) => {
    if (!recommendation) return;
    updateSetting(key, recommendation.settings[key]);
  };

  const applyRecommendationAdvanced = (key: string) => {
    if (!recommendation || recommendation.settings.advanced[key] === undefined) return;
    updateSetting("advanced", { ...effectiveSettings.advanced, [key]: recommendation.settings.advanced[key] });
  };

  const confirmImage = async () => {
    if (!imageCandidate) return;
    const requestEpoch = projectRequestEpoch.current;
    setTask("image"); setStatus("loading");
    try {
      const sourceUrl = imageCandidate.previewUrl.startsWith("http") ? `/api/assets/download?url=${encodeURIComponent(imageCandidate.previewUrl)}` : imageCandidate.previewUrl;
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error("IMAGE_DOWNLOAD_FAILED");
      const blob = await response.blob();
      if (projectRequestEpoch.current !== requestEpoch) return;
      await saveAssetBlob(imageCandidate.id, blob);
      if (projectRequestEpoch.current !== requestEpoch) return;
      triggerImageDownload(blob, imageCandidate.title);
      setImagePreviewUrl(URL.createObjectURL(blob));
      setImagePreviewAssetId(imageCandidate.id);
      const confirmedMetadata = { ...imageCandidate, previewUrl: `indexeddb://${imageCandidate.id}`, confirmed: true, createdAt: imageCandidate.createdAt || new Date().toISOString() };
      setState((current) => ({ ...current, ipAssets: [...current.ipAssets.filter((item) => item.id !== confirmedMetadata.id), confirmedMetadata] }));
      setImageCandidate(confirmedMetadata); setImageConfirmed(true); setStatus("success");
    } catch {
      if (projectRequestEpoch.current !== requestEpoch) return;
      setWarning("图像尚未保存到本机，请重试。项目文档未写入无效资产。"); setStatus("error");
    }
  };

  const downloadImage = async () => {
    if (!imageCandidate || !imagePreviewSource) return;
    const requestEpoch = projectRequestEpoch.current;
    setWarning("");
    try {
      const sourceUrl = imagePreviewSource.startsWith("http")
        ? `/api/assets/download?url=${encodeURIComponent(imagePreviewSource)}`
        : imagePreviewSource;
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error("IMAGE_DOWNLOAD_FAILED");
      const blob = await response.blob();
      if (projectRequestEpoch.current !== requestEpoch) return;
      triggerImageDownload(blob, imageCandidate.title);
    } catch {
      if (projectRequestEpoch.current === requestEpoch) setWarning("图像下载失败，请先确认图片已加载后重试。");
    }
  };

  const generateStoryboard = async () => {
    if (!imageConfirmed) return;
    const requestEpoch = projectRequestEpoch.current;
    setTask("storyboard"); setStatus("loading"); setWarning(""); setNotice("");
    try {
      const candidate = await requestAi("storyboard", requestEpoch);
      if (!candidate || projectRequestEpoch.current !== requestEpoch) return;
      setStoryboard(candidate);
      setState((current) => ({ ...current, candidates: [...current.candidates.filter((item) => item.target.type !== "storyboard"), candidate] }));
      setStatus("success");
    } catch {
      if (projectRequestEpoch.current === requestEpoch) setStatus("error");
    }
  };

  const storedAssetId = imageCandidate?.previewUrl.startsWith("indexeddb://") ? imageCandidate.previewUrl.slice("indexeddb://".length) : "";
  const imagePreviewSource = storedAssetId ? (imagePreviewAssetId === storedAssetId ? imagePreviewUrl : "") : imageCandidate?.previewUrl ?? "";
  const steps = [briefConfirmed, imageConfirmed, Boolean(storyboard)];
  return <main className="ip-lab-page">
    <header className="ip-lab-head"><div><span className="eyebrow">P2 可试用 / Cross-media Lab</span><h1>文学 IP 实验场</h1><p>{project?.title ?? "当前作品"} · 从文学设定生成可确认的视觉资产包</p></div><Link href={`/project/${state.activeProjectId}/studio`} className="button button-secondary"><ArrowLeft size={16} />返回创作台</Link></header>
    <ol className="ip-lab-steps" aria-label="IP 资产生成进度">{["视觉简报", "主视觉", "六镜头分镜"].map((label, index) => <li className={steps[index] ? "complete" : task === ["brief", "image", "storyboard"][index] ? "active" : ""} key={label}><span>{steps[index] ? <Check size={14} /> : index + 1}</span>{label}</li>)}</ol>
    <div className="ip-lab-grid">
      <aside className="ip-lab-controls"><div className="ip-lab-control-title"><Palette size={18} /><div><strong>视觉设定</strong><small>只影响下一次生成</small></div></div>
        <label className="field"><span>选择人物</span><select className="input" aria-label="选择人物" value={selectedCharacterId} onChange={(event) => setCharacterId(event.target.value)}>{state.characters.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role}</option>)}</select></label>
        <fieldset><legend>资产类型</legend><div className="segmented-control"><button type="button" aria-pressed={assetKind === "character-visual"} onClick={() => setAssetKind("character-visual")}>角色主视觉</button><button type="button" aria-pressed={assetKind === "poster"} onClick={() => setAssetKind("poster")}>文学海报</button></div></fieldset>
        <label className="field"><span>画面媒介</span><select className="input" value={medium} onChange={(event) => setMedium(event.target.value)}><option>电影感纪实摄影</option><option>版画与档案拼贴</option><option>现代东方概念艺术</option></select></label>
        <fieldset><legend>色彩方向</legend><div className="palette-options">{[["冷绿 / 信号金 / 炭黑", "palette-green"], ["矿物红 / 雾灰 / 纸白", "palette-red"], ["靛青 / 银灰 / 墨黑", "palette-indigo"]].map(([label, className]) => <button className={className} aria-label={label} aria-pressed={palette === label} onClick={() => setPalette(label)} key={label}><i /><span>{label}</span></button>)}</div></fieldset>
        <section className="ip-parameter-editor" aria-labelledby="image-parameter-title">
          <div><strong id="image-parameter-title">生图参数</strong><small>用户确认后才发起生成</small></div>
          <label className="field"><span>正向提示词</span><textarea className="input" aria-label="正向提示词" rows={7} value={settings.prompt} placeholder={projectPrompt} onChange={(event) => updateSetting("prompt", event.target.value)} /></label>
          <label className="field"><span>负向提示词</span><textarea className="input" aria-label="负向提示词" rows={4} value={settings.negativePrompt} onChange={(event) => updateSetting("negativePrompt", event.target.value)} /></label>
          <label className="field"><span>模型</span><select className="input" aria-label="图像模型" value={effectiveSettings.model} onChange={(event) => updateSetting("model", event.target.value)}>{capabilities?.models.map((item) => <option value={item.id} key={item.id}>{item.label}</option>) ?? <option value={effectiveSettings.model}>{effectiveSettings.model}</option>}</select></label>
          <label className="field"><span>画面尺寸</span><select className="input" aria-label="画面尺寸" value={effectiveSettings.size} onChange={(event) => updateSetting("size", event.target.value)}>{capabilities?.sizes.map((size) => <option value={size} key={size}>{size}</option>) ?? <option value={effectiveSettings.size}>{effectiveSettings.size}</option>}</select></label>
          {capabilities && <div className="ip-advanced-grid">
            {Object.entries(capabilities.advanced).map(([key, rule]) => <label className="field" key={key}><span>{key === "seed" ? "随机种子" : key === "steps" ? "采样步数" : "引导强度"}</span><input className="input" type="number" aria-label={key === "seed" ? "随机种子" : key === "steps" ? "采样步数" : "引导强度"} min={rule.min} max={rule.max} value={typeof effectiveSettings.advanced[key] === "number" ? effectiveSettings.advanced[key] : ""} onChange={(event) => updateAdvanced(key, event.target.value)} /></label>)}
          </div>}
          <p className="ip-parameter-note">ModelScope 在线接口当前仅核验模型与提示词；负向词会编译进提示词，尺寸与高级项作为可编辑草案记录，不宣称已由远端执行。</p>
        </section>
        <Button onClick={generateBrief} disabled={status === "loading"}><Sparkles size={16} />生成视觉简报</Button>
        <p className="ip-lab-privacy">图像确认后仅保存到本机 IndexedDB；首版不提供跨设备图像同步。</p>
      </aside>
      <section className="ip-lab-workbench">
        <section className="ip-stage ip-recommendation"><header><div><span>00 / Parameter advisor</span><h2>AI 参数推荐</h2></div>{recommendation && <StatusBadge kind={recommendationMode === "live" ? "success" : "demo"}>{recommendationMode === "live" ? "实时推荐" : "演示推荐"}</StatusBadge>}</header>
          <div className="ip-recommendation-source">
            <div className="segmented-control" aria-label="推荐分析来源"><button type="button" aria-pressed={recommendationSource === "project"} onClick={() => setRecommendationSource("project")}>分析当前作品</button><button type="button" aria-pressed={recommendationSource === "upload"} onClick={() => setRecommendationSource("upload")}>分析临时文本</button></div>
            <label className="ip-upload-control"><FileText size={17} /><span>{uploadedFileName || "上传 TXT / MD"}</span><input type="file" aria-label="上传临时文本" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void handleUpload(event.target.files?.[0])} /></label>
            <p>临时文本上限 20,000 字符，仅用于当前会话，不写入项目或云端。</p>
            <Button variant="secondary" aria-label="AI 推荐参数" onClick={() => void recommendParameters()} disabled={status === "loading" || !capabilities}><Sparkles size={16} />AI 推荐参数</Button>
            {task === "recommendation" && <AiProgress status={status} label="AI 参数推荐进度" />}
          </div>
          {recommendation && <article className="ip-recommendation-draft"><div><h3>AI 参数草案</h3><span>置信提示 {Math.round(recommendation.confidence * 100)}%</span></div>
            <dl><div><dt>正向提示词</dt><dd>{recommendation.settings.prompt}</dd><Button variant="ghost" aria-label="应用推荐正向提示词" onClick={() => applyRecommendationField("prompt")}>应用</Button></div><div><dt>负向提示词</dt><dd>{recommendation.settings.negativePrompt}</dd><Button variant="ghost" aria-label="应用推荐负向提示词" onClick={() => applyRecommendationField("negativePrompt")}>应用</Button></div><div><dt>模型</dt><dd>{recommendation.settings.model}</dd><Button variant="ghost" aria-label="应用推荐图像模型" onClick={() => applyRecommendationField("model")}>应用</Button></div><div><dt>尺寸</dt><dd>{recommendation.settings.size}</dd><Button variant="ghost" aria-label="应用推荐画面尺寸" onClick={() => applyRecommendationField("size")}>应用</Button></div>{Object.entries(recommendation.settings.advanced).map(([key, value]) => <div key={key}><dt>{key === "seed" ? "随机种子" : key === "steps" ? "采样步数" : key === "guidance" ? "引导强度" : key}</dt><dd>{String(value)}</dd><Button variant="ghost" aria-label={`应用推荐${key === "seed" ? "随机种子" : key === "steps" ? "采样步数" : key === "guidance" ? "引导强度" : key}`} onClick={() => applyRecommendationAdvanced(key)}>应用</Button></div>)}</dl>
            {Object.values(recommendation.reasons).length > 0 && <ul>{Object.values(recommendation.reasons).map((reason) => <li key={reason}>{reason}</li>)}</ul>}
            <Button aria-label="全部应用推荐参数" onClick={() => updateSettings(recommendation.settings)}><Check size={15} />全部应用</Button>
          </article>}
        </section>
        <section className="ip-stage"><header><div><span>01 / Visual brief</span><h2>视觉简报候选</h2></div>{brief && <StatusBadge kind={brief.mode === "live" ? "success" : "demo"}>{brief.mode === "live" ? "实时生成" : "演示生成"}</StatusBadge>}</header>{brief ? <article className="brief-candidate"><p>{brief.content}</p><small>{brief.rationale}</small><Button aria-label="确认视觉简报" onClick={() => setBriefConfirmed(true)} disabled={briefConfirmed}>{briefConfirmed ? <><Check size={15} />已确认</> : "确认视觉简报"}</Button></article> : <div className="ip-empty"><Sparkles size={22} /><p>先选择人物和视觉方向，生成一份可编辑前置简报。</p></div>}</section>
        <section className="ip-stage"><header><div><span>02 / Image candidate</span><h2>{assetKind === "poster" ? "文学海报" : "角色主视觉"}</h2></div>{imageCandidate && <StatusBadge kind={imageCandidate.mode === "live" ? "success" : "demo"}>{imageCandidate.mode === "live" ? "实时生成" : "演示兜底"}</StatusBadge>}</header>{task === "image" && <AiProgress status={status} label="图像预览生成进度" />}{imageCandidate && imagePreviewSource ? <figure className="ip-image-candidate"><button type="button" className="ip-image-preview-button" aria-label="查看大图" onClick={() => { setImageZoom(1); setImageViewerOpen(true); }}><Image src={imagePreviewSource} alt={imageCandidate.title} width={1024} height={assetKind === "poster" ? 1536 : 1024} style={{ objectFit: "contain" }} unoptimized /><span><Maximize2 size={15} />查看大图</span></button><figcaption><strong>{imageCandidate.title}</strong><span>单图候选 · 确认后保存到本机</span>{imageCandidate.providerTaskId && <span>任务 ID：{imageCandidate.providerTaskId}</span>}<Button aria-label="确认保存图像" onClick={() => void confirmImage()} disabled={imageConfirmed || status === "loading"}>{imageConfirmed ? <><Check size={15} />已保存</> : "确认保存图像"}</Button><Button variant="secondary" aria-label="下载图像" onClick={() => void downloadImage()} disabled={status === "loading"}><Download size={15} />下载图像</Button></figcaption></figure> : imageCandidate ? <div className="ip-empty ip-empty-image"><ImagePlus size={25} /><p>正在读取本地图片…</p></div> : <div className="ip-empty ip-empty-image"><ImagePlus size={25} /><p>确认视觉简报后生成一个图像候选。</p></div>}<div className="ip-image-actions"><Button onClick={() => void generateImage()} disabled={!briefConfirmed || status === "loading"} aria-label="生成主视觉"><ImagePlus size={16} />生成主视觉</Button>{imageCandidate?.mode === "demo" && !imageConfirmed && <Button variant="secondary" onClick={() => void retryImage()} disabled={status === "loading"} aria-label="重试图像生成"><RotateCcw size={16} />重试实时生成</Button>}</div>{task === "image" && <AiProgress status={status} label="图像生成控制进度" />}{task === "image" && warning && <p className="ip-lab-warning" role="status">{warning}</p>}</section>
        <section className="ip-stage ip-storyboard"><header><div><span>03 / Six shots</span><h2>六镜头分镜</h2></div></header>{storyboard ? <article className="storyboard-candidate"><pre>{storyboard.content}</pre><small>{storyboard.rationale}</small></article> : <div className="ip-empty"><Clapperboard size={24} /><p>主视觉保存后，按同一设定生成六镜头叙事序列。</p></div>}<Button onClick={generateStoryboard} disabled={!imageConfirmed || status === "loading"}><Clapperboard size={16} />生成六镜头分镜</Button></section>
      </section>
    </div>
     {task !== "image" && task !== "recommendation" && <AiProgress status={status} label={`${task === "brief" ? "视觉简报" : "六镜头分镜"}进度`} />}
     {task !== "image" && warning && <p className="ip-lab-warning" role="status">{warning}</p>}
     {notice && <p className="ai-notice" role="status">{notice}</p>}
     {imageViewerOpen && imageCandidate && imagePreviewSource && <div className="ip-image-viewer" role="dialog" aria-modal="true" aria-labelledby="ip-image-viewer-title"><div className="ip-image-viewer-panel"><header><strong id="ip-image-viewer-title">{imageCandidate.title}</strong><div className="ip-image-viewer-controls"><button type="button" aria-label="缩小大图" onClick={() => setImageZoom((value) => Math.max(1, Number((value - 0.2).toFixed(1))))} disabled={imageZoom <= 1}><Minus size={16} /></button><span aria-live="polite">{Math.round(imageZoom * 100)}%</span><button type="button" aria-label="放大大图" onClick={() => setImageZoom((value) => Math.min(3, Number((value + 0.2).toFixed(1))))} disabled={imageZoom >= 3}><Plus size={16} /></button><button type="button" aria-label="重置大图" onClick={() => setImageZoom(1)} disabled={imageZoom === 1}><RotateCcw size={16} /></button></div><button type="button" aria-label="关闭大图" onClick={closeImageViewer}><X size={18} /></button></header><div className="ip-image-viewer-stage"><Image src={imagePreviewSource} alt={imageCandidate.title} width={1600} height={1200} style={{ objectFit: "contain", transform: `scale(${imageZoom})`, transformOrigin: "center center", transition: "transform 160ms ease-out" }} unoptimized /></div></div></div>}
  </main>;
}
