import { describe, expect, it } from "vitest";
import { extractTextGraph, validateTextUpload } from "@/lib/knowledge/text-extraction";
import { graphMetrics, filterGraph, layoutForMode } from "@/components/knowledge/academic-graph";
import type { AiTaskPayload } from "@/lib/ai/tasks";

const payload = (sourceKind: "narrative" | "argumentative" = "narrative"): Extract<AiTaskPayload, { knowledgeGraph: unknown }> => ({
  sourceKind,
  evidence: [
    { id: "e1", source: "observation", quote: "甲在码头等待。", note: "原文证据" },
    { id: "e2", source: "observation", quote: "乙递来一封信。", note: "原文证据" },
  ],
  knowledgeGraph: sourceKind === "narrative" ? {
    nodes: [
      { id: "character-a", label: "甲", type: "character", evidenceIds: ["e1"] },
      { id: "event-1", label: "等待", type: "event", evidenceIds: ["e1"] },
    ],
    edges: [{ id: "r1", source: "character-a", target: "event-1", label: "参与", evidenceIds: ["e1"], confidence: 0.82 }],
  } : {
    nodes: [
      { id: "concept-1", label: "方法", type: "concept", evidenceIds: ["e1"] },
      { id: "argument-1", label: "主张", type: "argument", evidenceIds: ["e1"] },
    ],
    edges: [{ id: "r1", source: "concept-1", target: "argument-1", label: "界定", evidenceIds: ["e1"], confidence: 0.82 }],
  },
});

describe("knowledge graph extraction", () => {
  it("normalizes entities, relations and evidence into a closed academic graph", () => {
    const graph = extractTextGraph("甲在码头等待。乙递来一封信。", payload());
    expect(graph.sourceStatus).toBe("session");
    expect(graph.nodes[0]).toMatchObject({ id: "character-a", sourceStatus: "session", confidence: 1 });
    expect(graph.edges[0]).toMatchObject({ source: "character-a", target: "event-1", sourceEvidenceIds: ["e1"], sourceStatus: "session" });
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const evidenceIds = new Set(graph.evidence.map((item) => item.id));
    expect(graph.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.sourceEvidenceIds.every((id) => evidenceIds.has(id)))).toBe(true);
  });

  it("keeps argumentative text from inventing narrative entities", () => {
    const graph = extractTextGraph("方法应当透明，因为证据可以复核。", payload("argumentative"));
    expect(graph.nodes.map((node) => node.type)).not.toEqual(expect.arrayContaining(["character", "event", "place"]));
    expect(graph.nodes.map((node) => node.type)).toEqual(expect.arrayContaining(["concept", "argument"]));
  });

  it("rejects unsupported, oversized, or empty uploads before reading", () => {
    expect(validateTextUpload({ name: "essay.pdf", type: "application/pdf", size: 20 })).toMatchObject({ ok: false, code: "type" });
    expect(validateTextUpload({ name: "essay.md", type: "text/markdown", size: 6_000_001 })).toMatchObject({ ok: false, code: "size" });
    expect(validateTextUpload({ name: "essay.md", type: "text/markdown", size: 0 })).toMatchObject({ ok: false, code: "empty" });
    expect(validateTextUpload({ name: "essay.md", type: "text/markdown", size: 20 })).toMatchObject({ ok: true });
  });
});

describe("academic graph view helpers", () => {
  const graph = extractTextGraph("甲在码头等待。乙递来一封信。", payload());

  it("supports deterministic layout modes and node filtering", () => {
    expect(layoutForMode("force").name).toBe("cose");
    expect(layoutForMode("layered").name).toBe("breadthfirst");
    expect(layoutForMode("concentric").name).toBe("concentric");
    expect(filterGraph(graph, { types: ["character"], minConfidence: 0 }).nodes.map((node) => node.type)).toEqual(["character"]);
  });

  it("calculates degree and centrality for the table alternative", () => {
    expect(graphMetrics(graph).find((metric) => metric.id === "character-a")).toMatchObject({ degree: 1, centrality: 1 });
  });
});
