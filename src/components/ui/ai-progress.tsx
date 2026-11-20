import { LoaderCircle } from "lucide-react";

export type AiProgressStatus = "idle" | "loading" | "success" | "error";

export function AiProgress({ status, label }: { status: AiProgressStatus; label: string }) {
  if (status === "idle") return null;
  const running = status === "loading";
  const stageLabel = running ? "等待服务器响应" : status === "success" ? "请求完成" : "生成中断";

  return (
    <div className="ai-progress" data-status={status} aria-live="polite">
      <div className="ai-progress-head" role="progressbar" aria-label={label} aria-valuetext={stageLabel}
        aria-valuenow={running ? undefined : status === "success" ? 100 : 0}>
        {running && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
        <strong>{stageLabel}</strong>
      </div>
    </div>
  );
}
