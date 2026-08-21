import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";

function single(value: string | string[] | undefined, maximum: number) {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected?.slice(0, maximum);
}

export default async function AnalysisPage({ params, searchParams }: PageProps<"/project/[id]/analysis">) {
  const { id } = await params;
  const query = await searchParams;
  const source = single(query.source, 20);
  return <AnalysisWorkspace
    projectId={id}
    sourceProjectId={single(query.projectId, 120)}
    chapterId={single(query.chapterId, 120)}
    sourceContext={source === "studio" ? "studio" : undefined}
    initialSelection={single(query.selection, 8_000)}
  />;
}
