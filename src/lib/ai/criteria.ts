import data from "./criteria-data.json";

export type DimensionId = "结构组织" | "连贯衔接" | "信息密度与节奏" | "具体性与感官" | "意象复现" | "视角一致性";
export const CRITERIA_VERSION = "v1.0";
export interface CriterionFields {
  statement: string;
  checkable: string;
  metric: string;
  typicalTrue: string;
  typicalFalse: string;
  commonFalsePositive: string;
  notApplicable: string;
}
export interface CriterionHit {
  id: string;
  dimension: DimensionId;
  block: CriterionFields;
  status: "draft" | "draft-pending-threshold" | "agreed";
}
export interface CriterionQuery { dimension: DimensionId; includePending?: boolean; limit?: number }
export interface CriterionResult { mode: "exact" | "none"; hits: CriterionHit[] }

export function getCriteria({ dimension, includePending = false, limit = 3 }: CriterionQuery): CriterionResult {
  const hits = data.filter(row => row.dimension === dimension && (includePending || row.confidence !== "draft-pending-threshold"))
    .slice(0, Math.max(0, Math.min(limit, 3)))
    .map(row => ({
      id: row.id,
      dimension,
      block: {
        statement: row.statement,
        checkable: row.checkable,
        metric: row.metric,
        typicalTrue: row.typicalTrue,
        typicalFalse: row.typicalFalse,
        commonFalsePositive: row.commonFalsePositive,
        notApplicable: row.notApplicable,
      },
      status: row.confidence as CriterionHit["status"],
    }));
  return { mode: hits.length ? "exact" : "none", hits };
}

export function stampCriteriaVersion(ids: string[]) {
  return ids.map(id => `${id}@${CRITERIA_VERSION}`);
}

/**
 * 把判据序列化成 prompt 片段。
 *
 * 取舍（依据 docs/knowledge/检索契约_v1.0.md §3.2）：
 * - 进 prompt：id / statement / checkable / metric / 正例 / 反例 / 易误报 / 不适用 / 状态
 * - 不进 prompt：authority（出处给人看的，给模型只会诱发复述文献名）
 *
 * 每条用 [ID] 包裹，模型才能稳定识别并回填 criteriaIds。
 */
export function serializeCriteriaForPrompt(hits: CriterionHit[]): string {
  if (!hits.length) return "";
  return hits
    .map((hit) => {
      const c = hit.block;
      const line = (label: string, value: unknown) =>
        typeof value === "string" && value.trim() ? `${label}：${value.trim()}` : null;
      const parts = [
        `[${hit.id}] ${hit.dimension}`,
        line("判据", c.statement),
        line("可判定", c.checkable),
        line("量法", c.metric),
        line("正例", c.typicalTrue),
        line("反例", c.typicalFalse),
        line("易误报", c.commonFalsePositive),
        line("不适用", c.notApplicable),
        `状态：${hit.status}`,
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n");
}

export const INJECTED_DIMENSIONS: DimensionId[] = ["结构组织", "连贯衔接", "信息密度与节奏", "具体性与感官", "意象复现", "视角一致性"];

/** 取本期要注入的全部判据（已跳过 pending） */
export function getInjectedCriteria(): CriterionHit[] {
  return INJECTED_DIMENSIONS.flatMap((dimension) => getCriteria({ dimension }).hits);
}

/** 注入判据的 ID 集合，供校验层判断模型是否引用了不存在的编号 */
export function injectedCriteriaIds(): string[] {
  return getInjectedCriteria().map((hit) => hit.id);
}
