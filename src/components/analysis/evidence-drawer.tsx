"use client";

import { BookOpen, BrainCircuit, LibraryBig } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AiEvidence, Evidence } from "@/lib/types";

const labels = { user: "用户文本", observation: "原文观察", knowledge: "知识参考", inference: "模型推断" } as const;
const icons = { user: BookOpen, observation: BookOpen, knowledge: LibraryBig, inference: BrainCircuit };

export function EvidenceDrawer({ evidence, onClose }: { evidence?: Evidence | AiEvidence; onClose: () => void }) {
  if (!evidence) return null;
  const Icon = icons[evidence.source];
  const kind = evidence.source === "user" || evidence.source === "observation" ? "success" : evidence.source === "knowledge" ? "knowledge" : "demo";
  const chapter = "chapter" in evidence ? evidence.chapter : "retrievalId" in evidence && evidence.retrievalId ? `检索编号 ${evidence.retrievalId}` : "本次分析";
  const excerpt = evidence.quote || ("claim" in evidence ? evidence.claim : undefined);
  return <Dialog open onOpenChange={(open) => !open && onClose()} title="原文证据" description={`${chapter} · ${evidence.id}`}><div className="evidence-source"><StatusBadge kind={kind}><Icon size={13} />{labels[evidence.source]}</StatusBadge></div>{excerpt && <blockquote>{excerpt}</blockquote>}<section className="evidence-note"><span className="eyebrow">分析说明</span><p>{evidence.note}</p></section></Dialog>;
}
