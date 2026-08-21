"use client";

import { useEffect, useState } from "react";

export type AiProgressStatus = "idle" | "loading" | "success" | "error";

const stages = ["准备上下文", "检索资料", "生成内容", "校验整理"] as const;

function stageFor(progress: number) {
  if (progress < 28) return 0;
  if (progress < 52) return 1;
  if (progress < 78) return 2;
  return 3;
}

export function AiProgress({ status, label }: { status: AiProgressStatus; label: string }) {
  const [runningProgress, setRunningProgress] = useState(10);

  useEffect(() => {
    if (status !== "loading") return;
    const startedAt = Date.now();
    const reset = window.setTimeout(() => setRunningProgress(10), 0);
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = elapsed < 800 ? 24 : elapsed < 1800 ? 46 : elapsed < 3400 ? 68 : Math.min(92, 78 + Math.floor((elapsed - 3400) / 900) * 3);
      setRunningProgress(next);
    }, 300);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(timer);
    };
  }, [label, status]);

  if (status === "idle") return null;
  const complete = status === "success";
  const failed = status === "error";
  const progress = complete ? 100 : failed ? 0 : runningProgress;
  const stageIndex = complete ? stages.length - 1 : stageFor(progress);
  const stageLabel = complete ? "校验完成" : failed ? "生成中断" : stages[stageIndex];

  return (
    <div className="ai-progress" data-status={status} aria-live="polite">
      <div className="ai-progress-head"><strong>{stageLabel}</strong><span>{progress}%</span></div>
      <div
        className="ai-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${stageLabel}，${progress}%`}
      >
        <span className="ai-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <ol className="ai-progress-stages">
        {stages.map((stage, index) => <li key={stage} data-state={index < stageIndex || complete ? "done" : index === stageIndex ? "active" : "pending"}>{stage}</li>)}
      </ol>
    </div>
  );
}
