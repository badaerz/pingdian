import { TrainingWorkspace } from "@/components/training/training-workspace";
import "./training-evidence.css";

function single(value: string | string[] | undefined, maximum: number) {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected?.slice(0, maximum);
}

export default async function TrainingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <TrainingWorkspace exerciseId={single(query.exercise, 32)} diagnosticId={single(query.diagnostic, 120)} />;
}
