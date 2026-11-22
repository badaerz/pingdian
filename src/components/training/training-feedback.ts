import { TRAINING_FEEDBACK_DIMENSIONS, type TrainingFeedbackResult } from "@/lib/types";
import { trainingBindings } from "@/lib/training/bindings";

export const TREND_DIMENSIONS = TRAINING_FEEDBACK_DIMENSIONS;

export interface NormalizedTrainingFeedback extends TrainingFeedbackResult {
  attemptNo: number;
  previousAnswer?: string;
}

export interface TrainingHistoryScoreItem {
  exerciseId: string;
  attemptNo?: number;
  scores?: Array<{ dimension: string; score: number }>;
  feedback?: unknown;
}

export interface TrendSummary {
  values: number[];
  mean: number | null;
  direction: "up" | "down" | "flat";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function strictTextList(value: unknown, allowEmpty = true): string[] | null {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every((item) => typeof item === "string" && Boolean(item.trim()))) return null;
  return value.map((item) => item.trim());
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function looseTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/**
 * reason 是可选的。prompt 里的示例只有 {dimension, score}，模型经常给空字符串，
 * 而这里原先强制要求非空——只要有一条为空就整包抛错，界面显示「生成中断」。
 *
 * 这是「校验器比 prompt 严」的老毛病。服务端 validator 早就放宽了，
 * 前端这份没跟上，于是演示态正常、有密钥必挂。两处契约必须一致。
 */
function normalizeScores(value: unknown, allowedDimensions: ReadonlySet<string>): TrainingFeedbackResult["scores"] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) throw new Error("INVALID_TRAINING_SCORES");
  const scores = value.map((item) => {
    const reason = isRecord(item) && typeof item.reason === "string" ? item.reason.trim() : "";
    if (!isRecord(item) || typeof item.dimension !== "string" || !item.dimension.trim() || !allowedDimensions.has(item.dimension) || typeof item.score !== "number" || !Number.isFinite(item.score) || item.score < 0 || item.score > 100) throw new Error("INVALID_TRAINING_SCORES");
    return { dimension: item.dimension, score: item.score, reason };
  });
  if (new Set(scores.map((item) => item.dimension)).size !== scores.length) throw new Error("INVALID_TRAINING_SCORES");
  return scores;
}

export function normalizeTrainingFeedback(value: unknown, answer: string, attemptNo: number, previousAnswer?: string, allowedDimensions: ReadonlySet<string> = new Set(TREND_DIMENSIONS)): NormalizedTrainingFeedback {
  if (!isRecord(value)) throw new Error("TRAINING_FAILED");
  const rawV2 = value.trainingFeedback;
  if (rawV2 !== undefined) {
    if (!isRecord(rawV2) || ["replacement", "replacementProse", "prose"].some((key) => key in rawV2)) throw new Error("INVALID_TRAINING_FEEDBACK");
    const strengths = strictTextList(rawV2.strengths, false);
    const rawQuotes = strictTextList(rawV2.evidenceQuotes);
    const issues = strictTextList(rawV2.issues);
    const questions = strictTextList(rawV2.questions);
    // 引文必须逐字出现在答案里——但**只丢那一条，不连坐整包**。
    // 原先是 every() 一票否决：模型把标点改一个、把弯引号换成直引号、
    // 或者多引一个空格，整个反馈就被判无效，界面显示「生成中断」。
    // 有密钥时稳定复现，演示态不触发，所以自测很容易漏掉。
    // 这和产品其他地方的规则一致：单条不合格只丢单条，剩下的照常展示。
    const evidenceQuotes = (rawQuotes ?? []).filter((quote) => answer.includes(quote));
    if (!strengths || !issues || !questions || !textValue(rawV2.nextExperiment, "")) throw new Error("INVALID_TRAINING_FEEDBACK");
    const evidenceBindings = trainingBindings(rawV2.evidenceBindings, { strengths, issues, evidenceQuotes });
    const teacherNote = textValue(rawV2.teacherNote, "").slice(0, 600);
    return { strengths, evidenceQuotes, issues, nextExperiment: textValue(rawV2.nextExperiment, ""), questions, scores: normalizeScores(rawV2.scores, allowedDimensions), attemptNo, ...(evidenceBindings.length ? { evidenceBindings } : {}), ...(teacherNote ? { teacherNote } : {}), ...(previousAnswer ? { previousAnswer } : {}) };
  }

  const legacy = value.feedback;
  if (isRecord(legacy)) {
    const evidence = textValue(legacy.evidence, "");
    const evidenceQuotes = evidence && answer.includes(evidence) ? [evidence] : [];
    return { strengths: looseTextList(legacy.strengths), evidenceQuotes, issues: looseTextList(legacy.issue), nextExperiment: textValue(legacy.nextStep, "再做一次局部尝试"), questions: looseTextList(legacy.questions), scores: [], attemptNo, ...(previousAnswer ? { previousAnswer } : {}) };
  }
  throw new Error("TRAINING_FAILED");
}

export function diffSummary(previous: string | undefined, current: string) {
  if (!previous) return "首次尝试，没有可比较的上一版。";
  let prefix = 0;
  while (prefix < previous.length && prefix < current.length && previous[prefix] === current[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < current.length - prefix && previous[previous.length - 1 - suffix] === current[current.length - 1 - suffix]) suffix += 1;
  return `从第 ${prefix + 1} 个字起发生变化，修改 ${Math.max(previous.length - prefix - suffix, current.length - prefix - suffix)} 字。`;
}

function scoresFromHistory(item: TrainingHistoryScoreItem): Array<{ dimension: string; score: number }> {
  if (item.scores) return item.scores;
  if (isRecord(item.feedback) && Array.isArray(item.feedback.scores)) return item.feedback.scores.filter((score): score is { dimension: string; score: number } => isRecord(score) && typeof score.dimension === "string" && typeof score.score === "number" && Number.isFinite(score.score));
  return [];
}

export function aggregateTrainingTrend(history: TrainingHistoryScoreItem[], exerciseId: string): Record<string, TrendSummary> {
  const values: Record<string, number[]> = Object.fromEntries(TREND_DIMENSIONS.map((dimension) => [dimension, []]));
  const matching = history.filter((item) => item.exerciseId === exerciseId);
  const ordered = matching.some((item) => typeof item.attemptNo === "number")
    ? [...matching].sort((left, right) => (left.attemptNo ?? 0) - (right.attemptNo ?? 0))
    : matching;
  ordered.forEach((item) => {
    scoresFromHistory(item).forEach((score) => {
      if (score.dimension in values && score.score >= 0 && score.score <= 100) values[score.dimension].push(score.score);
    });
  });
  return Object.fromEntries(TREND_DIMENSIONS.map((dimension) => {
    const series = values[dimension];
    const mean = series.length ? Math.round(series.reduce((total, score) => total + score, 0) / series.length) : null;
    const direction = series.length < 2 ? "flat" : series.at(-1)! > series[0] ? "up" : series.at(-1)! < series[0] ? "down" : "flat";
    return [dimension, { values: series, mean, direction }];
  })) as Record<string, TrendSummary>;
}
