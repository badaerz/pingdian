import type { TrainingFeedbackResult } from "@/lib/types";

type Binding = NonNullable<TrainingFeedbackResult["evidenceBindings"]>[number];

export function trainingBindings(raw: unknown, feedback: Pick<TrainingFeedbackResult, "strengths" | "issues" | "evidenceQuotes">): Binding[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0, 36).flatMap(item => {
    if (!item || typeof item.quote !== "string" || !feedback.evidenceQuotes.includes(item.quote)) return [];
    const group = item.group as unknown;
    const index = item.index as unknown;
    if ((group !== "strengths" && group !== "issues") || typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= feedback[group].length) return [];
    const key = JSON.stringify([item.quote, group, index]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ quote: item.quote, group, index }];
  });
}
