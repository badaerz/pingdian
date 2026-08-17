"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { StoryState } from "@/lib/types";

export function StoryCurves({ type, data, onEvidence }: { type: "plot" | "emotion"; data: StoryState["plotCurve"]; onEvidence: (id: string) => void }) {
  const isPlot = type === "plot";
  return <div className="curve-module"><div className="curve-legend"><strong>{isPlot ? "情节张力" : "情绪温度"}</strong><span>{isPlot ? "越高表示冲突与信息压力越强" : "零点以上偏明亮，以下偏压抑"}</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 18, right: 18, bottom: 8, left: -18 }}><CartesianGrid vertical={false} stroke="#e6e0d7" /><XAxis dataKey="beat" tickLine={false} axisLine={false} tick={{ fill: "#706c64", fontSize: 11 }} /><YAxis domain={isPlot ? [0, 100] : [-100, 100]} tickLine={false} axisLine={false} tick={{ fill: "#706c64", fontSize: 10 }} /><ChartTooltip contentStyle={{ border: "1px solid #d8d2c7", borderRadius: 4, fontSize: 12 }} /><Line type="monotone" dataKey="value" stroke={isPlot ? "#315947" : "#a77a2b"} strokeWidth={2.5} dot={{ r: 5, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 7 }} /></LineChart></ResponsiveContainer></div><div className="curve-points" aria-label="曲线数据列表">{data.map((point) => <button key={point.beat} onClick={() => onEvidence(point.evidenceId)}><span>{point.beat}</span><strong>{point.value}</strong></button>)}</div></div>;
}
