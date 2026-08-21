import type { RetrievalEvidence } from "@/lib/types";
import { knowledgeRecords, type KnowledgeRecord } from "@/lib/knowledge/catalog";

export interface RetrievalQuery {
  query: string;
  limit?: number;
  workIds?: string[];
  chunkTypes?: string[];
  allowImitation?: boolean;
}

export interface VectorSearchInput {
  embedding: number[];
  limit: number;
  workIds?: string[];
  chunkTypes?: string[];
}

export interface VectorSearchRow {
  id: string;
  work_id: string;
  chunk_type: string;
  content: string;
  metadata?: unknown;
  similarity?: number;
}

export interface RetrievalDependencies {
  createEmbedding?: (text: string) => Promise<number[] | null>;
  vectorSearch?: (input: VectorSearchInput) => Promise<VectorSearchRow[]>;
  records?: KnowledgeRecord[];
}

export interface RetrievalResult {
  mode: "vector" | "keyword" | "none";
  evidence: RetrievalEvidence[];
  warnings?: string[];
}

export const SAFE_KNOWLEDGE_CHUNK_TYPES = ["summary", "technique_explanation", "case_excerpt"] as const;
export const KNOWLEDGE_CHUNK_TYPES = [...SAFE_KNOWLEDGE_CHUNK_TYPES, "text_sample"] as const;

interface ScoredEvidence {
  evidence: RetrievalEvidence;
  score: number;
}

const SUBTEXT_ALIASES = ["冰山", "留白", "言外", "暗示", "对话"];

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function quote(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function limitValue(value: number | undefined) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(8, Math.max(1, Math.trunc(value!)));
}

function requested(query: RetrievalQuery, workId: string, chunkType: string) {
  return (!query.workIds?.length || query.workIds.includes(workId))
    && (!query.chunkTypes?.length || query.chunkTypes.includes(chunkType));
}

function recordSourceStatus(record: KnowledgeRecord): RetrievalEvidence["sourceStatus"] {
  return record.sourceStatus;
}

function sourceSafe(query: RetrievalQuery, record: KnowledgeRecord, chunkType: string, content: string) {
  if ((SAFE_KNOWLEDGE_CHUNK_TYPES as readonly string[]).includes(chunkType)) return true;
  if (chunkType !== "text_sample") return false;
  return recordSourceStatus(record) === "verified" && query.allowImitation === true && content.length <= 2_000;
}

function evidenceFromRow(row: VectorSearchRow, record: KnowledgeRecord): RetrievalEvidence | null {
  if (!row.id || !row.content.trim() || !row.chunk_type) return null;
  return {
    retrievalId: row.id,
    workId: record.id,
    chunkType: row.chunk_type,
    content: row.content,
    quote: quote(row.content),
    sourceStatus: recordSourceStatus(record),
    ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
    ...(typeof row.similarity === "number" && Number.isFinite(row.similarity) ? { similarity: row.similarity } : {}),
  };
}

function normalize(text: string) {
  return text.normalize("NFKC").toLowerCase();
}

function queryTerms(query: string) {
  const normalized = normalize(query);
  const terms = new Set(normalized.split(/[^\p{L}\p{N}]+/u).filter((item) => item.length > 1));
  for (const segment of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (const character of segment) terms.add(character);
    for (let index = 0; index < segment.length - 1; index += 1) terms.add(segment.slice(index, index + 2));
  }
  if (normalized.includes("潜台词") || normalized.includes("言外之意")) SUBTEXT_ALIASES.forEach((item) => terms.add(item));
  return [...terms];
}

function scoreText(terms: string[], fields: Array<{ text: string; weight: number }>) {
  return terms.reduce((score, term) => score + fields.reduce((fieldScore, field) => fieldScore + (normalize(field.text).includes(term) ? field.weight : 0), 0), 0);
}

function localCandidates(record: KnowledgeRecord): Array<{ retrievalId: string; chunkType: string; content: string; fields: Array<{ text: string; weight: number }> }> {
  const common = [
    { text: record.title, weight: 6 },
    { text: record.author, weight: 5 },
  ];
  const techniqueContent = [
    `${record.title}｜技法：${record.techniques.join("、")}`,
    record.deconstruction.explanation,
    record.deconstruction.plot.map((item) => `${item.stage}：${item.description}`).join("\n"),
    record.deconstruction.imagery.length ? `意象：${record.deconstruction.imagery.join("、")}` : "",
  ].filter(Boolean).join("\n");
  const candidates = [
    {
      retrievalId: `${record.id}:summary`,
      chunkType: "summary",
      content: record.summary,
      fields: [...common, { text: record.summary, weight: 3 }, ...record.themes.map((text) => ({ text, weight: 4 }))],
    },
    {
      retrievalId: `${record.id}:technique_explanation`,
      chunkType: "technique_explanation",
      content: techniqueContent,
      fields: [...common, { text: techniqueContent, weight: 3 }, ...record.techniques.map((text) => ({ text, weight: 5 }))],
    },
  ];
  if (record.deconstruction.selectedText.trim()) {
    candidates.push({
      retrievalId: `${record.id}:case_excerpt`,
      chunkType: "case_excerpt",
      content: record.deconstruction.selectedText,
      fields: [...common, { text: record.deconstruction.selectedText, weight: 2 }],
    });
  }
  (record.sourceChunks ?? []).forEach((content, index) => {
    candidates.push({
      retrievalId: `${record.id}:text_sample:${index}`,
      chunkType: "text_sample",
      content,
      fields: [...common, { text: content, weight: 2 }],
    });
  });
  return candidates;
}

function keywordSearch(query: RetrievalQuery, records: KnowledgeRecord[], limit: number): RetrievalEvidence[] {
  const terms = queryTerms(query.query);
  const scored: ScoredEvidence[] = [];
  records.forEach((record) => {
    localCandidates(record).forEach((candidate) => {
      if (!candidate.content.trim() || !requested(query, record.id, candidate.chunkType) || !sourceSafe(query, record, candidate.chunkType, candidate.content)) return;
      const score = scoreText(terms, candidate.fields);
      if (score <= 0) return;
      scored.push({
        score,
        evidence: {
          retrievalId: candidate.retrievalId,
          workId: record.id,
          chunkType: candidate.chunkType,
          content: candidate.content,
          quote: quote(candidate.content),
          sourceStatus: recordSourceStatus(record),
          ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
        },
      });
    });
  });
  scored.sort((left, right) => right.score - left.score || compareText(left.evidence.retrievalId, right.evidence.retrievalId));
  const seen = new Set<string>();
  return scored.filter((item) => {
    const key = `${item.evidence.workId}|${item.evidence.chunkType}|${item.evidence.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit).map((item) => item.evidence);
}

export async function retrieveKnowledge(query: RetrievalQuery, dependencies: RetrievalDependencies = {}): Promise<RetrievalResult> {
  const text = query.query.trim();
  if (!text) return { mode: "none", evidence: [] };
  const limit = limitValue(query.limit);
  const records = dependencies.records ?? knowledgeRecords;
  const recordById = new Map(records.map((record) => [record.id, record]));

  if (dependencies.createEmbedding && dependencies.vectorSearch) {
    try {
      const embedding = await dependencies.createEmbedding(text);
      if (embedding) {
        const rows = await dependencies.vectorSearch({ embedding, limit, workIds: query.workIds, chunkTypes: query.chunkTypes });
        const evidence = rows.flatMap((row) => {
          const record = recordById.get(row.work_id);
          if (!record || !requested(query, record.id, row.chunk_type) || !sourceSafe(query, record, row.chunk_type, row.content)) return [];
          const item = evidenceFromRow(row, record);
          return item ? [item] : [];
        }).sort((left, right) => (right.similarity ?? -1) - (left.similarity ?? -1) || compareText(left.retrievalId, right.retrievalId));
        const seen = new Set<string>();
        const uniqueEvidence = evidence.filter((item) => {
          const key = `${item.workId}|${item.chunkType}|${item.content}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, limit);
        if (uniqueEvidence.length) return { mode: "vector", evidence: uniqueEvidence };
      }
    } catch {
      // Keyword fallback is the expected availability path for embedding or RPC failures.
    }
  }

  const evidence = keywordSearch({ ...query, query: text }, records, limit);
  return evidence.length ? { mode: "keyword", evidence } : { mode: "none", evidence: [] };
}
