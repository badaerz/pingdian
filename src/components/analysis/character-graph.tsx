"use client";

import cytoscape, { type Core, type StylesheetCSS } from "cytoscape";
import { Focus, List, Network, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { KnowledgeGraph } from "@/lib/types";

export function CharacterGraph({ graph, onSelect }: { graph: KnowledgeGraph; onSelect: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<Core | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined" || view !== "graph") return;
    const core = cytoscape({
      container: containerRef.current,
      elements: [...graph.nodes.map((node) => ({ data: { id: node.id, label: node.label } })), ...graph.edges.map((edge) => ({ data: edge }))],
      layout: { name: "circle", padding: 48 },
      style: [
        { selector: "node", style: { "background-color": "#315947", color: "#1d1d1b", label: "data(label)", "font-size": 13, "font-family": "Noto Sans SC", "text-valign": "bottom", "text-margin-y": 12, width: 42, height: 42, "border-width": 4, "border-color": "#e6eee9" } },
        { selector: "edge", style: { width: 1.5, "line-color": "#a77a2b", "target-arrow-color": "#a77a2b", "target-arrow-shape": "triangle", label: "data(label)", "font-size": 10, "text-background-color": "#fff", "text-background-opacity": 1, "text-background-padding": 3, "curve-style": "bezier" } },
        { selector: ":selected", style: { "border-color": "#a77a2b", "border-width": 6 } },
      ] as unknown as StylesheetCSS[],
    });
    core.on("tap", "node", (event) => onSelect(event.target.id()));
    coreRef.current = core;
    return () => core.destroy();
  }, [graph, onSelect, view]);
  const list = <div className="graph-list">{graph.nodes.map((node) => <button key={node.id} onClick={() => onSelect(node.id)}><span className="node-dot" /><strong>{node.label}</strong><small>{graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).map((edge) => edge.label).join("、") || "暂无关系"}</small></button>)}</div>;
  return <div className="graph-module"><div className="viz-toolbar"><div className="segmented"><button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}><Network size={15} />图谱</button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={15} />列表</button></div>{view === "graph" && <div className="graph-tools"><Tooltip label="放大"><Button variant="icon" aria-label="放大图谱" onClick={() => coreRef.current?.zoom(coreRef.current.zoom() * 1.2)}><ZoomIn size={17} /></Button></Tooltip><Tooltip label="缩小"><Button variant="icon" aria-label="缩小图谱" onClick={() => coreRef.current?.zoom(coreRef.current.zoom() * .8)}><ZoomOut size={17} /></Button></Tooltip><Tooltip label="适应画布"><Button variant="icon" aria-label="重置图谱" onClick={() => coreRef.current?.fit(undefined, 36)}><RotateCcw size={17} /></Button></Tooltip></div>}</div>{view === "graph" ? <div ref={containerRef} className="graph-canvas" data-testid="character-graph"><div className="graph-loading"><Focus size={18} />关系图加载中</div></div> : list}<div className="mobile-graph-list">{list}</div></div>;
}
