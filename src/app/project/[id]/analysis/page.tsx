import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { EvidenceWorkbench } from "@/components/analysis/evidence-workbench";
import replay from "@/data/gc-038-replay.json";
import type { LiteraryAnalysisResult } from "@/lib/types";
import "./evidence-workbench.css";

function single(value: string | string[] | undefined, maximum: number) {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected?.slice(0, maximum);
}

export default async function AnalysisPage({ params, searchParams }: PageProps<"/project/[id]/analysis">) {
  const { id } = await params;
  const query = await searchParams;
  if (id === "reading" && query.sample === "denggao") {
    return <EvidenceWorkbench result={replay.result as Pick<LiteraryAnalysisResult, "analysis" | "diagnostics">} source={replay.source} mode="live" criteriaCount={replay.criteriaCount} />;
  }
  const source = single(query.source, 20);
  return <AnalysisWorkspace
    projectId={id}
    autoRead={query.read === "1"}
    sourceProjectId={single(query.projectId, 120)}
    chapterId={single(query.chapterId, 120)}
    sourceContext={source === "studio" ? "studio" : undefined}
    initialSelection={single(query.selection, 8_000)}
  />;
}
