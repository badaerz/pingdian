"use client";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { pendingAi } from "@/lib/ai/client";
import { Button } from "./button";

export function SlowAiRequests() {
  const requests = useSyncExternalStore(pendingAi.subscribe, pendingAi.snapshot, pendingAi.serverSnapshot);
  if (!requests.length) return null;
  return <aside className="ai-waiting" aria-label="等待中的 AI 请求">{requests.map(request =>
    <div key={request.id}><span role="status">{request.label} · 等待服务器响应</span>
      <Button variant="ghost" aria-label={`取消${request.label}`} onClick={request.cancel}><X size={16} />取消</Button>
    </div>)}</aside>;
}
