"use client";

import { BookOpen, BrainCircuit, LibraryBig } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Evidence } from "@/lib/types";

const labels = { user: "用户文本", knowledge: "精选知识", inference: "模型推断" } as const;
const icons = { user: BookOpen, knowledge: LibraryBig, inference: BrainCircuit };

export function EvidenceDrawer({ evidence, onClose }: { evidence?: Evidence; onClose: () => void }) {
  if (!evidence) return null;
  const Icon = icons[evidence.source];
  const kind = evidence.source === "user" ? "success" : evidence.source === "knowledge" ? "knowledge" : "demo";
  return <Dialog open onOpenChange={(open) => !open && onClose()} title="原文证据" description={`${evidence.chapter} · ${evidence.id}`}><div className="evidence-source"><StatusBadge kind={kind}><Icon size={13} />{labels[evidence.source]}</StatusBadge></div><blockquote>{evidence.quote}</blockquote><section className="evidence-note"><span className="eyebrow">分析说明</span><p>{evidence.note}</p></section></Dialog>;
}
