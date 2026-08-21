"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { LiteraryCurvePoint, StoryState } from "@/lib/types";

export function StoryCurves({ type, data, selectedSegment, onEvidence }: { type: "plot" | "emotion"; data: StoryState["plotCurve"] | LiteraryCurvePoint[]; selectedSegment?: string; onEvidence: (id: string, segment?: string) => void }) {
  const isPlot = type === "plot";
  const normalized = data.map((point) => ({ ...point, label: "segment" in point ? point.segment : point.beat }));
  // 从 CSS 变量读取设计 token，确保图表颜色与全站主题一致
  const rootStyle = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const green = rootStyle?.getPropertyValue("--green").trim() || "#315947";
  const gold = rootStyle?.getPropertyValue("--gold").trim() || "#a77a2b";
  const line = rootStyle?.getPropertyValue("--line").trim() || "#d8d2c7";
  const muted = rootStyle?.getPropertyValue("--muted").trim() || "#706c64";
  return <div className="curve-module"><div className="curve-legend"><strong>{isPlot ? "情节张力" : "情绪温度"}</strong><span>{isPlot ? "越高表示冲突与信息压力越强" : "越高表示情绪唤起程度越强"}</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={normalized} margin={{ top: 18, right: 18, bottom: 8, left: -18 }}><CartesianGrid vertical={false} stroke={line} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: muted, fontSize: 11 }} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: muted, fontSize: 10 }} /><ChartTooltip contentStyle={{ border: `1px solid ${line}`, borderRadius: 4, fontSize: 12 }} /><Line type="monotone" dataKey="value" stroke={isPlot ? green : gold} strokeWidth={2.5} dot={{ r: 5, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 7 }} /></LineChart></ResponsiveContainer></div><div className="curve-points" aria-label="曲线数据列表">{normalized.map((point) => <button className={selectedSegment === point.label ? "curve-point-selected" : undefined} key={point.label} onClick={() => onEvidence(point.evidenceId, point.label)}><span>{point.label}</span><strong>{point.value}</strong></button>)}</div></div>;
}
