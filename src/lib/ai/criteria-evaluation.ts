import type { CriteriaEvaluation } from "@/lib/types";
import { injectedCriteriaIds } from "@/lib/ai/criteria";

const injectedIds = new Set(injectedCriteriaIds());

export function readCriteriaEvaluation(raw: unknown, observationIds: ReadonlySet<string>): CriteriaEvaluation[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const evaluations: CriteriaEvaluation[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const { criteriaId, countedAt, result, reason } = item as Record<string, unknown>;
    if (typeof criteriaId !== "string" || !injectedIds.has(criteriaId) || seen.has(criteriaId)) continue;
    if (result !== "pass" && result !== "fail") continue;
    if (typeof reason !== "string" || !reason.trim() || reason.length > 2_000) continue;
    if (!Array.isArray(countedAt) || countedAt.length < 1 || countedAt.length > 20
      || new Set(countedAt).size !== countedAt.length
      || !countedAt.every((id): id is string => typeof id === "string" && observationIds.has(id))) continue;
    seen.add(criteriaId);
    evaluations.push({ criteriaId, countedAt: [...countedAt], result, reason: reason.trim() });
  }
  return evaluations.length ? evaluations : undefined;
}
