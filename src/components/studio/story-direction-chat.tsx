"use client";

import { AlertTriangle, MessageSquareText, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AiEnvelope, StoryContext } from "@/lib/ai/tasks";
import type { StoryDirectionMessage, StoryDirectionResult } from "@/lib/types";
import { aiRequestHeaders } from "@/lib/ai/user-key";

export const STORY_DIRECTION_TAGS = ["跌宕起伏", "轻松日常", "推进冲突", "深化人物关系", "埋设悬念", "强化情感"] as const;

interface StoryDirectionChatProps {
  projectKey: string;
  project: StoryContext;
  messages: StoryDirectionMessage[];
  onAppend: (message: StoryDirectionMessage) => void;
  onGenerateCandidates: (summary: string) => void;
  onRecordRun?: (input: { mode: "live" | "demo"; request: unknown; result: unknown }) => void;
  composer?: StoryDirectionComposer;
}

export interface StoryDirectionComposer {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  selectedTags: string[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
}

interface DirectionRequestSnapshot {
  scope: string;
  userMessage: StoryDirectionMessage;
  content: string;
  thread: Array<{ role: "user" | "assistant"; content: string }>;
  body: { task: "story-direction"; project: StoryContext; input: { prompt: string; thread: Array<{ role: "user" | "assistant"; content: string }> } };
}

function messageId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function discussionSummary(messages: StoryDirectionMessage[]) {
  const summary = messages.slice(-20).map((message) => `${message.role === "user" ? "作者" : "AI"}：${message.content}`).join("\n");
  return summary.length <= 4_000 ? summary : summary.slice(-4_000);
}

export function StoryDirectionChat({ projectKey, project, messages, onAppend, onGenerateCandidates, onRecordRun, composer }: StoryDirectionChatProps) {
  const [localDraft, setLocalDraft] = useState("");
  const [localSelectedTags, setLocalSelectedTags] = useState<string[]>([]);
  const draft = composer?.draft ?? localDraft;
  const setDraft = composer?.setDraft ?? setLocalDraft;
  const selectedTags = composer?.selectedTags ?? localSelectedTags;
  const setSelectedTags = composer?.setSelectedTags ?? setLocalSelectedTags;
  const scope = `${projectKey}:${project.activeChapterId}:${project.contextRevision}`;
  return <ScopedStoryDirectionChat key={scope} {...{
    projectKey,
    project,
    messages,
    onAppend,
    onGenerateCandidates,
    onRecordRun,
    draft,
    setDraft,
    selectedTags,
    setSelectedTags,
  }} />;
}

interface ScopedStoryDirectionChatProps extends StoryDirectionChatProps {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  selectedTags: string[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
}

function ScopedStoryDirectionChat({ projectKey, project, messages, onAppend, onGenerateCandidates, onRecordRun, draft, setDraft, selectedTags, setSelectedTags }: ScopedStoryDirectionChatProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [failedRequest, setFailedRequest] = useState<DirectionRequestSnapshot | null>(null);
  const scope = `${projectKey}:${project.activeChapterId}:${project.contextRevision}`;
  const scopeRef = useRef(scope);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const controllersRef = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  const submit = async (retry?: DirectionRequestSnapshot) => {
    if (status === "loading" || (!retry && !draft.trim() && selectedTags.length === 0)) return;
    const scope = retry?.scope ?? `${projectKey}:${project.activeChapterId}:${project.contextRevision}`;
    const requestId = ++requestRef.current;
    const content = retry?.content ?? [selectedTags.length ? `方向标签：${selectedTags.join("、")}` : "", draft.trim()].filter(Boolean).join("；");
    const userMessage: StoryDirectionMessage = retry?.userMessage ?? {
      id: messageId("direction-user"),
      role: "user",
      content,
      tags: selectedTags,
      createdAt: new Date().toISOString(),
      contextRevision: project.contextRevision,
    };
    const thread = retry?.thread ?? [...messages.slice(-19), userMessage].map(({ role, content: itemContent }) => ({ role, content: itemContent }));
    const request: DirectionRequestSnapshot = retry ?? {
      scope,
      userMessage,
      content,
      thread,
      body: { task: "story-direction", project, input: { prompt: content, thread } },
    };
    if (!retry) onAppend(userMessage);
    setStatus("loading");
    setError("");
    setFailedRequest(null);
    const controller = new AbortController();
    controllersRef.current.add(controller);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: aiRequestHeaders(),
        signal: controller.signal,
        body: JSON.stringify(request.body),
      });
      const payload = await response.json() as AiEnvelope<{ direction: StoryDirectionResult }>;
      if (!response.ok || !payload.result?.direction) throw new Error("DIRECTION_FAILED");
      if (!mountedRef.current || scopeRef.current !== scope || requestRef.current !== requestId) return;
      const direction = payload.result.direction;
      onAppend({
        id: messageId("direction-assistant"),
        role: "assistant",
        content: direction.recommendation,
        tags: direction.suggestedTags,
        createdAt: new Date().toISOString(),
        contextRevision: payload.contextRevision,
        direction,
        mode: payload.mode,
        warnings: payload.warnings,
      });
      onRecordRun?.({ mode: payload.mode, request: { content, thread }, result: payload.result });
      setDraft("");
      setSelectedTags([]);
      setStatus("idle");
    } catch {
      if (!mountedRef.current || scopeRef.current !== scope || requestRef.current !== requestId) return;
      setStatus("error");
      setError("讨论请求未完成，已保留你的本轮方向。可稍后重试。");
      setFailedRequest(request);
    } finally {
      controllersRef.current.delete(controller);
    }
  };

  return <section className="story-direction-chat" aria-label="与 AI 讨论下一步">
    <header><div><span className="eyebrow">Story direction</span><h3>先讨论，再生成</h3></div><MessageSquareText size={18} /></header>
    <div className="direction-thread" aria-live="polite">
      {messages.length === 0 && <p className="direction-empty">用标签与补充说明细化下一步。讨论不会修改正文，也不会自动生成候选。</p>}
      {messages.map((message) => <article key={message.id} className={`direction-message direction-${message.role}`}>
        <div><strong>{message.role === "user" ? "你" : "AI 方向顾问"}</strong>{message.role === "assistant" && message.mode && <StatusBadge kind={message.mode === "live" ? "success" : "demo"}>{message.mode === "live" ? "实时分析" : "演示分析"}</StatusBadge>}</div>
        {message.direction ? <>
          <p>{message.direction.understanding}</p>
          <strong>{message.direction.recommendation}</strong>
          {message.direction.risks.length > 0 && <p className="direction-risk"><AlertTriangle size={13} />{message.direction.risks.join("；")}</p>}
          <p className="direction-question">追问：{message.direction.question}</p>
        </> : <p>{message.content}</p>}
        {message.tags.length > 0 && <div className="direction-message-tags">{message.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        {message.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
      </article>)}
    </div>
    <div className="direction-tags" aria-label="本轮方向标签">{STORY_DIRECTION_TAGS.map((tag) => <Button key={tag} type="button" variant={selectedTags.includes(tag) ? "primary" : "secondary"} aria-pressed={selectedTags.includes(tag)} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</Button>)}</div>
    <label className="field direction-input"><span>本轮补充</span><textarea className="textarea" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：先让冲突从舅甥之间的一次误解开始，不要揭晓谜底。" /></label>
    {error && <div className="candidate-warning" role="alert"><AlertTriangle size={14} /><span>{error}</span>{failedRequest && <Button type="button" variant="ghost" onClick={() => void submit(failedRequest)}>重试本轮讨论</Button>}</div>}
    <div className="direction-actions"><Button type="button" variant="secondary" onClick={() => void submit()} disabled={status === "loading" || (!draft.trim() && selectedTags.length === 0)}><Send size={15} />{status === "loading" ? "分析中…" : "发送并继续讨论"}</Button><Button type="button" onClick={() => onGenerateCandidates(discussionSummary(messages))}><Sparkles size={15} />生成续写候选</Button></div>
  </section>;
}
