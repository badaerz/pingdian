import type { AiEvidence, GraphEdge, GraphNode, KnowledgeGraph, LiterarySourceKind } from "@/lib/types";

export const MAX_TEXT_UPLOAD_BYTES = 256 * 1024;
export const MAX_TEXT_SOURCE_CHARS = 20_000;
const allowedNodeTypes = new Set<GraphNode["type"]>(["work", "author", "era", "theme", "technique", "character", "place", "event", "image", "concept", "argument", "evidence"]);
const argumentativeTypes = new Set<GraphNode["type"]>(["concept", "argument", "evidence"]);

export interface AcademicGraphEvidence extends AiEvidence {
  sourceStatus: "session" | "verified" | "pending" | "summary_only";
  sourceLabel: string;
}

export interface AcademicGraphNode extends GraphNode {
  confidence: number;
  sourceStatus: AcademicGraphEvidence["sourceStatus"];
  sourceEvidenceIds: string[];
}

export interface AcademicGraphEdge extends GraphEdge {
  confidence: number;
  sourceStatus: AcademicGraphEvidence["sourceStatus"];
  sourceEvidenceIds: string[];
}

export interface AcademicKnowledgeGraph extends KnowledgeGraph {
  sourceKind: LiterarySourceKind;
  sourceStatus: AcademicGraphEvidence["sourceStatus"];
  evidence: AcademicGraphEvidence[];
  nodes: AcademicGraphNode[];
  edges: AcademicGraphEdge[];
}

export type UploadValidation = { ok: true } | { ok: false; code: "type" | "size" | "empty"; message: string };

export function validateTextUpload(file: { name: string; type: string; size: number }): UploadValidation {
  const extensionOk = /\.(txt|md)$/i.test(file.name);
  const mimeOk = !file.type || ["text/plain", "text/markdown", "text/x-markdown"].includes(file.type.toLowerCase());
  if (!extensionOk || !mimeOk) return { ok: false, code: "type", message: "仅支持 UTF-8 编码的 TXT 或 MD 文件。" };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, code: "empty", message: "文件为空，无法建立文本证据。" };
  if (file.size > MAX_TEXT_UPLOAD_BYTES) return { ok: false, code: "size", message: "文件超过 256KB，请截取需要分析的部分。" };
  return { ok: true };
}

function cleanText(value: unknown, max = 2_000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
}

export function extractTextGraph(sourceText: string, payload: { sourceKind?: LiterarySourceKind; evidence?: AiEvidence[]; knowledgeGraph?: KnowledgeGraph }): AcademicKnowledgeGraph {
  const sourceKind = payload.sourceKind ?? "narrative";
  const sourceStatus = "session" as const;
  const evidence: AcademicGraphEvidence[] = (payload.evidence ?? []).filter((item): item is AiEvidence => Boolean(item?.id && item.quote)).map((item) => ({
    ...item,
    quote: cleanText(item.quote, 2_000),
    sourceStatus,
    sourceLabel: "本次上传文本（会话级）",
  }));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const fallbackEvidence: AcademicGraphEvidence = { id: "session-source-1", source: "observation", quote: sourceText.trim().slice(0, 2_000), note: "本次上传文本的会话级证据。", sourceStatus, sourceLabel: "本次上传文本（会话级）" };
  if (!evidence.length && sourceText.trim()) { evidence.push(fallbackEvidence); evidenceIds.add(fallbackEvidence.id); }
  const rawNodes = payload.knowledgeGraph?.nodes ?? [];
  const nodes: AcademicGraphNode[] = rawNodes.flatMap((item) => {
    if (!item || !allowedNodeTypes.has(item.type) || (sourceKind === "argumentative" && !argumentativeTypes.has(item.type))) return [];
    const sourceEvidenceIds = (item.evidenceIds ?? []).filter((id) => evidenceIds.has(id));
    if (!sourceEvidenceIds.length) return [];
    return [{ ...item, confidence: typeof (item as GraphNode & { confidence?: unknown }).confidence === "number" ? Math.max(0, Math.min(1, (item as GraphNode & { confidence: number }).confidence)) : 1, sourceStatus, sourceEvidenceIds, evidenceIds: sourceEvidenceIds }];
  });
  const nodeIds = new Set(nodes.map((item) => item.id));
  const edges: AcademicGraphEdge[] = (payload.knowledgeGraph?.edges ?? []).flatMap((item) => {
    if (!item || !nodeIds.has(item.source) || !nodeIds.has(item.target)) return [];
    const sourceEvidenceIds = (item.sourceEvidenceIds ?? item.evidenceIds ?? []).filter((id) => evidenceIds.has(id));
    if (!sourceEvidenceIds.length) return [];
    return [{ ...item, confidence: typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 1, sourceStatus, sourceEvidenceIds, evidenceIds: sourceEvidenceIds }];
  });
  return { sourceKind, sourceStatus, evidence, nodes, edges };
}

export function classicGraphToAcademic(graph: KnowledgeGraph): AcademicKnowledgeGraph {
  const evidence: AcademicGraphEvidence[] = [{ id: "catalog-source", source: "knowledge", quote: "结构化文学知识库记录", note: "经典知识库只展示来源状态与结构化字段。", sourceStatus: "verified", sourceLabel: "经典知识库（结构化来源）" }];
  return {
    sourceKind: "narrative",
    sourceStatus: "verified",
    evidence,
    nodes: graph.nodes.map((node) => ({ ...node, confidence: 1, sourceStatus: "verified", sourceEvidenceIds: ["catalog-source"], evidenceIds: ["catalog-source"] })),
    edges: graph.edges.map((edge) => ({ ...edge, confidence: edge.confidence ?? 1, sourceStatus: "verified", sourceEvidenceIds: ["catalog-source"], evidenceIds: ["catalog-source"] })),
  };
}
