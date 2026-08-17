import { Database, Sparkles } from "lucide-react";

export function StatusBadge({ kind = "demo", children }: { kind?: "demo" | "success" | "warning" | "knowledge"; children: React.ReactNode }) {
  return <span className={`status-badge status-${kind}`}>{kind === "demo" ? <Database size={13} /> : <Sparkles size={13} />}{children}</span>;
}
