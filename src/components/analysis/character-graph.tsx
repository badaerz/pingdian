"use client";

import cytoscape, { type Core, type StylesheetCSS } from "cytoscape";
import { List, Network, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { KnowledgeGraph } from "@/lib/types";

type GraphVariant = "paper" | "dark";

const nodeTypeLabels: Record<string, string> = {
  character: "人物",
  work: "作品",
  author: "作者",
  theme: "主题",
  technique: "技法",
};

function compactLabel(label: string, limit = 10) {
  const characters = Array.from(label);
  return characters.length > limit ? `${characters.slice(0, limit).join("")}…` : label;
}

export function CharacterGraph({ graph, onSelect, selectedId, variant = "paper" }: { graph: KnowledgeGraph; onSelect: (id: string) => void; selectedId?: string; variant?: GraphVariant }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<Core | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    // 从 CSS 变量读取设计 token，避免硬编码导致主题色不一致
    const rootStyle = getComputedStyle(document.documentElement);
    const green = rootStyle.getPropertyValue("--green").trim() || "#315947";
    const greenSoft = rootStyle.getPropertyValue("--green-soft").trim() || "#e6eee9";
    const gold = rootStyle.getPropertyValue("--gold").trim() || "#a77a2b";
    const ink = rootStyle.getPropertyValue("--ink").trim() || "#1d1d1b";
    const dark = variant === "dark";
    const core = cytoscape({
      container: containerRef.current,
      elements: [...graph.nodes.map((node) => ({ data: { id: node.id, label: node.label, shortLabel: compactLabel(node.label, node.type === "work" ? 12 : 9), type: node.type } })), ...graph.edges.map((edge) => ({ data: edge }))],
      layout: dark
        ? { name: "cose", animate: false, padding: 58, nodeRepulsion: 9000, idealEdgeLength: 96, componentSpacing: 86 }
        : { name: "circle", padding: 48 },
      style: [
        { selector: "node", style: { "background-color": green, color: dark ? "#f4f0e7" : ink, label: dark ? "data(shortLabel)" : "data(label)", "font-size": dark ? 10 : 13, "font-family": "Noto Sans SC", "text-valign": "bottom", "text-margin-y": dark ? 8 : 12, width: dark ? 32 : 42, height: dark ? 32 : 42, "border-width": dark ? 2 : 4, "border-color": dark ? "#d3a456" : greenSoft, "text-wrap": "wrap", "text-max-width": dark ? 82 : 116, "text-background-color": dark ? "#0d1c18" : "#fff", "text-background-opacity": dark ? .82 : 0, "text-background-padding": dark ? 3 : 0 } },
        { selector: 'node[type = "work"]', style: { "background-color": "#d3a456", "border-color": "#f0cf8b", width: dark ? 44 : 46, height: dark ? 44 : 46, "font-weight": 700, label: dark ? "data(shortLabel)" : "data(label)" } },
        { selector: 'node[type = "author"]', style: { "background-color": "#7184a5", "border-color": "#aab6ca", shape: "diamond" } },
        { selector: 'node[type = "theme"]', style: { "background-color": "#9f5a4d", "border-color": "#cf8f7f", shape: "round-rectangle", width: dark ? 35 : 42, height: dark ? 24 : 34 } },
        { selector: 'node[type = "technique"]', style: { "background-color": "#336558", "border-color": "#83a79e", shape: "hexagon" } },
        { selector: "edge", style: { width: dark ? 1 : 1.5, "line-color": dark ? "#8f7551" : gold, "target-arrow-color": dark ? "#d3a456" : gold, "target-arrow-shape": "triangle", "arrow-scale": .65, label: dark ? "" : "data(label)", "font-size": 10, "text-background-color": "#fff", "text-background-opacity": dark ? 0 : 1, "text-background-padding": 3, "curve-style": "bezier", opacity: dark ? .62 : 1 } },
        { selector: ".context-muted", style: { opacity: dark ? .36 : .22 } },
        { selector: "edge.context-edge", style: { width: dark ? 2.3 : 2, opacity: 1, "line-color": dark ? "#d3a456" : gold, "target-arrow-color": dark ? "#f0cf8b" : gold } },
        { selector: "node.context-node", style: { opacity: 1, "border-color": dark ? "#f0cf8b" : gold } },
        { selector: ":selected", style: { "border-color": "#fff1c8", "border-width": dark ? 5 : 6, "overlay-color": gold, "overlay-opacity": dark ? .18 : .08, "overlay-padding": 8, label: dark ? "data(shortLabel)" : "data(label)", "z-index": 10 } },
      ] as unknown as StylesheetCSS[],
    });
    core.on("tap", "node", (event) => onSelect(event.target.id()));
    coreRef.current = core;
    return () => core.destroy();
  }, [graph, onSelect, variant]);

  useEffect(() => {
    if (view !== "graph" || !coreRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      coreRef.current?.resize();
      coreRef.current?.fit(undefined, 36);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core || !selectedId) return;
    const selected = core.$id(selectedId);
    core.elements().unselect().removeClass("context-muted context-edge context-node");
    if (!selected.length) return;
    const context = selected.closedNeighborhood();
    core.elements().difference(context).addClass("context-muted");
    selected.connectedEdges().addClass("context-edge");
    selected.neighborhood("node").addClass("context-node");
    selected.select();
  }, [selectedId, graph]);

  const list = <div className="graph-list">{graph.nodes.map((node) => <button className={selectedId === node.id ? "graph-list-active" : undefined} aria-pressed={selectedId === node.id} key={node.id} onClick={() => onSelect(node.id)}><span className={`node-dot node-dot-${node.type}`} /><strong>{node.label}</strong><small>{nodeTypeLabels[node.type] ?? node.type} · {graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).map((edge) => edge.label).join("、") || "暂无关系"}</small></button>)}</div>;
  return <div className={`graph-module graph-module-${variant}`}><div className="viz-toolbar"><div className="segmented"><button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}><Network size={15} />图谱</button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={15} />列表</button></div>{view === "graph" && <div className="graph-tools"><Tooltip label="放大"><Button variant="icon" aria-label="放大图谱" onClick={() => coreRef.current?.zoom(coreRef.current.zoom() * 1.2)}><ZoomIn size={17} /></Button></Tooltip><Tooltip label="缩小"><Button variant="icon" aria-label="缩小图谱" onClick={() => coreRef.current?.zoom(coreRef.current.zoom() * .8)}><ZoomOut size={17} /></Button></Tooltip><Tooltip label="适应画布"><Button variant="icon" aria-label="重置图谱" onClick={() => coreRef.current?.fit(undefined, 36)}><RotateCcw size={17} /></Button></Tooltip></div>}</div><div ref={containerRef} className={`graph-canvas${view === "graph" ? "" : " graph-canvas-hidden"}`} data-testid="character-graph" aria-label="关系图" aria-hidden={view !== "graph"} />{view === "list" && list}<div className="mobile-graph-list">{list}</div></div>;
}
