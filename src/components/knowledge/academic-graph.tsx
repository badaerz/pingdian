"use client";

import cytoscape, { type Core, type StylesheetCSS } from "cytoscape";
import { List, Network, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { GraphNode, KnowledgeGraph } from "@/lib/types";
import type { AcademicKnowledgeGraph } from "@/lib/knowledge/text-extraction";

export type AcademicLayoutMode = "force" | "layered" | "concentric";
export type AcademicGraphFilter = { types?: GraphNode["type"][]; minConfidence?: number };
export interface AcademicGraphMetric { id: string; degree: number; centrality: number; }

export function layoutForMode(mode: AcademicLayoutMode) {
  if (mode === "layered") return { name: "breadthfirst", directed: true, spacingFactor: 1.35, padding: 48 } as const;
  if (mode === "concentric") return { name: "concentric", concentric: (node: { degree: () => number }) => node.degree(), levelWidth: () => 2, padding: 48 } as const;
  return { name: "cose", animate: false, nodeRepulsion: 8_000, idealEdgeLength: 110, componentSpacing: 100, padding: 48 } as const;
}

export function filterGraph(graph: AcademicKnowledgeGraph, filter: AcademicGraphFilter): AcademicKnowledgeGraph {
  const allowedTypes = filter.types ? new Set(filter.types) : null;
  const minimum = filter.minConfidence ?? 0;
  const nodes = graph.nodes.filter((node) => (!allowedTypes || allowedTypes.has(node.type)) && node.confidence >= minimum);
  const nodeIds = new Set(nodes.map((node) => node.id));
  return { ...graph, nodes, edges: graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.confidence >= minimum) };
}

export function graphMetrics(graph: KnowledgeGraph): AcademicGraphMetric[] {
  const counts = new Map<string, number>(graph.nodes.map((node) => [node.id, 0]));
  graph.edges.forEach((edge) => { counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1); counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1); });
  const maximum = Math.max(1, ...counts.values());
  return graph.nodes.map((node) => ({ id: node.id, degree: counts.get(node.id) ?? 0, centrality: Number(((counts.get(node.id) ?? 0) / maximum).toFixed(3)) }));
}

const labels: Record<string, string> = { work: "作品", author: "作者", era: "时代", theme: "主题", technique: "技法", character: "人物", place: "地点", event: "事件", image: "意象", concept: "概念", argument: "论点", evidence: "证据" };
const colors: Record<string, string> = { work: "#d37302", author: "#7785a5", era: "#9d8d72", theme: "#a16455", technique: "#477267", character: "#d37302", place: "#8b7a60", event: "#b6574d", image: "#8c6790", concept: "#617aa3", argument: "#d37302", evidence: "#477267" };

function shortLabel(label: string) { return Array.from(label).slice(0, 12).join("") + (Array.from(label).length > 12 ? "…" : ""); }

export function AcademicGraph({ graph, onSelect, selectedId, onEvidence, className = "" }: { graph: AcademicKnowledgeGraph; onSelect?: (id: string) => void; selectedId?: string; onEvidence?: (ids: string[]) => void; className?: string }) {
  const availableTypes = useMemo(() => [...new Set(graph.nodes.map((node) => node.type))], [graph]);
  const [mode, setMode] = useState<AcademicLayoutMode>("force");
  const [view, setView] = useState<"graph" | "table">("graph");
  const [excludedTypes, setExcludedTypes] = useState<GraphNode["type"][]>([]);
  const [minimum, setMinimum] = useState(0);
  const [detailId, setDetailId] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<Core | null>(null);
  const types = useMemo(() => availableTypes.filter((type) => !excludedTypes.includes(type)), [availableTypes, excludedTypes]);
  const visible = useMemo(() => filterGraph(graph, { types, minConfidence: minimum }), [graph, minimum, types]);
  const metrics = useMemo(() => graphMetrics(visible), [visible]);

  useEffect(() => {
    if (!containerRef.current) return;
    const root = getComputedStyle(document.documentElement);
    const ink = root.getPropertyValue("--ink").trim() || "#191e24";
    const paper = root.getPropertyValue("--paper").trim() || "#fcf6ec";
    let core: Core;
    try {
      core = cytoscape({
      container: containerRef.current,
      elements: [...visible.nodes.map((node) => ({ data: { id: node.id, label: shortLabel(node.label), fullLabel: node.label, type: node.type, color: colors[node.type] ?? "#617aa3" } })), ...visible.edges.map((edge) => ({ data: { ...edge, id: edge.id } }))],
      layout: layoutForMode(mode),
      style: [
        { selector: "node", style: { "background-color": "data(color)", label: "data(label)", color: paper, "font-size": 11, "font-family": "Noto Sans SC", "text-valign": "bottom", "text-margin-y": 9, width: 28, height: 28, "border-width": 2, "border-color": paper, "text-background-color": ink, "text-background-opacity": .82, "text-background-padding": 3 } },
        ...Object.entries(colors).map(([type, color]) => ({ selector: `node[type = "${type}"]`, style: { "background-color": color, shape: type === "argument" ? "diamond" : type === "evidence" ? "hexagon" : type === "theme" ? "round-rectangle" : "ellipse", width: type === "argument" ? 38 : 28, height: type === "argument" ? 38 : 28 } })),
        { selector: "edge", style: { width: 1.4, "line-color": "#b99456", "target-arrow-color": "#d37302", "target-arrow-shape": "triangle", "arrow-scale": .65, "curve-style": "bezier", opacity: .68, label: "data(label)", "font-size": 9, color: paper, "text-background-color": ink, "text-background-opacity": .75, "text-background-padding": 2 } },
        { selector: ":selected", style: { "border-color": "#f0cf8b", "border-width": 4, "overlay-color": "#d37302", "overlay-opacity": .15, "overlay-padding": 8, "z-index": 10 } },
      ] as unknown as StylesheetCSS[],
      });
    } catch {
      // jsdom and restricted browsers may not expose a 2D canvas; the table view remains usable.
      coreRef.current = null;
      return;
    }
    core.on("tap", "node", (event) => { const id = event.target.id(); const node = visible.nodes.find((item) => item.id === id); setDetailId(id); onSelect?.(id); onEvidence?.(node?.sourceEvidenceIds ?? []); });
    coreRef.current = core;
    return () => { core.destroy(); coreRef.current = null; };
  }, [mode, onEvidence, onSelect, visible]);

  useEffect(() => {
    if (view !== "graph" || !coreRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      coreRef.current?.resize();
      coreRef.current?.fit(undefined, 48);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  useEffect(() => { const core = coreRef.current; if (!core || !selectedId) return; core.elements().unselect(); const node = core.$id(selectedId); if (node.length) { node.select(); core.animate({ fit: { eles: node.closedNeighborhood(), padding: 80 } }, { duration: 180 }); } }, [selectedId]);
  const toggleType = (type: GraphNode["type"]) => setExcludedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  const list = <div className="academic-graph-table" data-testid="academic-graph-table"><div className="academic-table-row academic-table-head"><span>节点</span><span>类型</span><span>度数</span><span>中心性</span></div>{visible.nodes.map((node) => { const metric = metrics.find((item) => item.id === node.id); return <button type="button" className="academic-table-row" key={node.id} onClick={() => { setDetailId(node.id); onSelect?.(node.id); onEvidence?.(node.sourceEvidenceIds); }}><strong>{node.label}</strong><span>{labels[node.type] ?? node.type}</span><span>{metric?.degree ?? 0}</span><span>{metric?.centrality.toFixed(2)}</span></button>; })}</div>;
  const detailNode = visible.nodes.find((node) => node.id === (selectedId ?? detailId));
  const detailEvidence = detailNode ? visible.evidence.filter((item) => detailNode.sourceEvidenceIds.includes(item.id)) : [];
  return <section className={`academic-graph ${className}`} aria-label="学术知识图谱"><header className="academic-graph-toolbar"><div className="segmented"><button type="button" className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}><Network size={15} />画布</button><button type="button" className={view === "table" ? "active" : ""} onClick={() => setView("table")}><List size={15} />表格</button></div><div className="academic-layout-switch" aria-label="布局模式">{(["force", "layered", "concentric"] as AcademicLayoutMode[]).map((item) => <button type="button" key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item === "force" ? "力导向" : item === "layered" ? "分层" : "同心"}</button>)}</div><div className="graph-tools"><Tooltip label="放大"><Button variant="icon" aria-label="放大图谱" onClick={() => coreRef.current?.zoom(coreRef.current.zoom() * 1.2)}><ZoomIn size={16} /></Button></Tooltip><Tooltip label="缩小"><Button variant="icon" aria-label="缩小图谱" onClick={() => coreRef.current?.zoom(coreRef.current.zoom() * .8)}><ZoomOut size={16} /></Button></Tooltip><Tooltip label="适配画布"><Button variant="icon" aria-label="适配画布" onClick={() => coreRef.current?.fit(undefined, 48)}><RotateCcw size={16} /></Button></Tooltip></div></header><div className="academic-graph-controls"><fieldset><legend>节点类型</legend>{availableTypes.map((type) => <label key={type}><input type="checkbox" checked={!excludedTypes.includes(type)} onChange={() => toggleType(type)} /><i style={{ backgroundColor: colors[type] }} />{labels[type] ?? type}</label>)}</fieldset><label className="academic-confidence">置信度 ≥ <input aria-label="最低置信度" type="range" min="0" max="1" step="0.1" value={minimum} onChange={(event) => setMinimum(Number(event.target.value))} /><output>{minimum.toFixed(1)}</output></label></div><div className="academic-graph-body"><div className="academic-graph-canvas" ref={containerRef} data-testid="academic-graph-canvas" aria-label="学术图谱画布" aria-hidden={view !== "graph"} style={{ display: view === "graph" ? undefined : "none" }} />{view === "table" && list}<aside className="academic-graph-evidence" aria-label="图谱证据详情"><span className="eyebrow">EVIDENCE RECORD</span><h3>{detailNode?.label ?? "选择节点"}</h3>{detailNode ? <><p>类型：{labels[detailNode.type] ?? detailNode.type} · 置信度 {(detailNode.confidence * 100).toFixed(0)}%</p>{detailEvidence.map((item) => <blockquote key={item.id}>{item.quote}<small>{item.sourceLabel} · {item.sourceStatus === "session" ? "会话级" : item.sourceStatus === "verified" ? "已核验" : item.sourceStatus === "summary_only" ? "摘要" : "待核验"}</small></blockquote>)}</> : <p>点击节点或表格行，查看原文证据与来源状态。</p>}</aside></div><footer className="academic-graph-status"><span>{visible.nodes.length} 节点 · {visible.edges.length} 关系</span><span>证据 {visible.evidence.length} 条 · {graph.sourceStatus === "session" ? "会话级来源" : "已核验来源"}</span></footer></section>;
}
