"use client";

import type { ThemeHeatmapCell } from "@/lib/types";

export function ThemeHeatmap({ cells, selectedSegment, onEvidence }: {
  cells: ThemeHeatmapCell[];
  selectedSegment?: string;
  onEvidence: (evidenceId: string, segment: string) => void;
}) {
  const themes = Array.from(new Set(cells.map((cell) => cell.theme)));
  const segments = Array.from(new Set(cells.map((cell) => cell.segment)));
  const byCoordinate = new Map(cells.map((cell) => [`${cell.theme}\u0000${cell.segment}`, cell]));
  return <div className="theme-heatmap-scroll">
    <table className="theme-heatmap" aria-label="主题演变热力图">
      <thead><tr><th scope="col">主题</th>{segments.map((segment) => <th key={segment} scope="col">{segment}</th>)}</tr></thead>
      <tbody>{themes.map((theme) => <tr key={theme}><th scope="row">{theme}</th>{segments.map((segment) => {
        const cell = byCoordinate.get(`${theme}\u0000${segment}`);
        if (!cell) return <td key={segment} aria-label={`${theme} · ${segment} · 无数据`}>—</td>;
        return <td key={segment}><button
          type="button"
          className={selectedSegment === segment ? "theme-cell theme-cell-selected" : "theme-cell"}
          aria-label={`${theme} · ${segment} · 强度 ${cell.value}`}
          title={`${theme} / ${segment}: ${cell.value}`}
          style={{ "--heat-strength": cell.value / 100 } as React.CSSProperties}
          onClick={() => onEvidence(cell.evidenceId, segment)}
        ><span>{cell.value}</span></button></td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}
