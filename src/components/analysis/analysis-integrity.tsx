"use client";

import { AlertTriangle, Info } from "lucide-react";
import type { LiteraryAnalysisResult } from "@/lib/types";

/**
 * 本次结果的可信度说明（AC25 三态 / AC27 丢弃原因可见）。
 *
 * 产品原则：丢弃和降级必须让用户看见，不许静默。
 * 用户看到的「真实分析（部分通过）」徽章只是信号，这里回答「到底哪部分没进来、为什么」。
 *
 * degraded 是校验层新增的降级台账，尚未进类型定义，因此用宽松读取，
 * 校验层落地前后都能显示，不需要两处同时改。
 */
type DegradationEntry = { path?: string; reason?: string; dropped?: number };

function readDegraded(result: LiteraryAnalysisResult): DegradationEntry[] {
  const raw = (result as LiteraryAnalysisResult & { degraded?: unknown }).degraded;
  return Array.isArray(raw) ? raw.filter((item): item is DegradationEntry => Boolean(item) && typeof item === "object") : [];
}

const DISCARD_REASONS: Record<string, string> = {
  field_invalid: "字段缺失或格式不符",
  duplicate_id: "与另一条诊断重复",
  quote_not_in_source: "引文未能在原文中找到",
  no_observation_evidence: "没有可核验的原文证据",
  proofreading_not_allowed: "属于校对意见，不属于文学诊断",
  unknown_criteria: "引用了本次未提供的判据编号",
  missing_criteria: "没有标明依据的判据",
};

export function AnalysisIntegrity({ result }: { result: LiteraryAnalysisResult }) {
  const discarded = result.discardedDiagnostics ?? [];
  const degradedRetrieval = result.degradedRetrievalIds ?? [];
  const unverified = result.evidence.filter((item) => item.verification === "unverified");
  const degraded = readDegraded(result);

  const quiet = !discarded.length && !degradedRetrieval.length && !unverified.length && !degraded.length;
  if (quiet) return null;

  return (
    <section className="analysis-integrity" aria-label="本次结果的可信度说明">
      <header>
        <h3>本次结果的可信度说明</h3>
        <p>下面这些内容没有进入结论，或被降低了可信度。其余结论不受影响，仍可逐条回到原文核验。</p>
      </header>

      {degraded.length > 0 && (
        <div>
          <h4><AlertTriangle size={14} /> 被降级的字段</h4>
          <ul>
            {degraded.map((entry, index) => (
              <li key={`${entry.path ?? "unknown"}-${index}`}>
                {entry.path ?? "未标注字段"}：{entry.reason ?? "结构不符，已置空"}
                {typeof entry.dropped === "number" && entry.dropped > 0 ? `（丢弃 ${entry.dropped} 项）` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {discarded.length > 0 && (
        <div>
          <h4><AlertTriangle size={14} /> 未采用的诊断</h4>
          <ul>
            {discarded.map(({ attempted, reason }, index) => (
              <li key={`discard-${index}`}>
                {attempted.location || attempted.id || `第 ${index + 1} 条`}：{DISCARD_REASONS[reason] ?? "未通过校验"}
                {attempted.quote && <q>{attempted.quote}</q>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {degradedRetrieval.length > 0 && (
        <div>
          <h4><Info size={14} /> 未能核验的知识参考</h4>
          <ul>
            {degradedRetrieval.map((id) => (
              <li key={id}>{id}：服务端未返回对应检索结果，未纳入结论。</li>
            ))}
          </ul>
        </div>
      )}

      {unverified.length > 0 && (
        <div>
          <h4><Info size={14} /> 未能核验的原文证据</h4>
          <ul>
            {unverified.map((item) => (
              <li key={item.id}>
                {item.id}：{item.source === "knowledge" ? "检索结果中找不到该条目，按待核验处理。" : "未能回到原文核对，按待核验处理。"}
                {"quote" in item && item.quote && <q>{item.quote}</q>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
