import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Counts = Record<"cases" | "expectedTotal" | "matchedTotal" | "diagnosticsTotal" | "anchoredTotal", number>;
interface Case {
  id: string; title: string; mode?: string; empty: boolean; expected: number; matched: number;
  missedClaims: string[]; diagnostics: number; anchoredCount: number;
}
export interface Run {
  file: string; ranAt: string; mode: string; cases: Case[];
  summary: {
    counts: Counts;
    conclusionAccuracy: number | null;
    traceabilityRate: number | null;
    hallucinationRate: number | null;
    // 这两项是后加的：老报告文件里没有，所以都可选
    precision?: number | null;
    missedAttribution?: Record<string, number>;
  };
}

const pct = (n: number | null) => n === null ? "—" : n.toFixed(2) + "%";
const cell = (s: string) => s.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
const usable = (c: Case) => c.mode === "live" && !c.empty;
const dateOf = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });

export function renderReport(input: Run[], now: Date) {
  const runs = [...input].sort((a,b) => Date.parse(a.ranAt) - Date.parse(b.ranAt) || a.file.localeCompare(b.file));
  const unique = new Map<string, Run>();
  const sources = new Map<Run, string[]>();
  for (const run of runs) {
    const key = JSON.stringify([run.ranAt, run.mode, run.summary, run.cases]);
    const first = unique.get(key) ?? run;
    unique.set(key, first);
    sources.set(first, [...(sources.get(first) ?? []), run.file]);
  }
  const rows = [...unique.values()];
  const lines = ["# 文学诊断评测报告", "", "## 概览", "",
    `生成时间（北京时间）${now.toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" })}。共 ${runs.length} 个报告文件、${rows.length} 次独立运行。同次运行的副本列在同一行。`,
    "", "链路可用性按返回有效 live 诊断的样本数统计。命中率衡量诊断覆盖预期发现的程度。两者分别报告。",
    "", "|运行|时间（UTC）|模式|源文件|", "|---|---|---|---|"];
  rows.forEach((r,i) => lines.push(`|R${i+1}|${r.ranAt}|${r.mode}|${sources.get(r)!.map(cell).join("、")}|`));
  lines.push("", "## 三大指标", "", "下表逐项抄录 summary，百分比保留两位。结论准确率按 severity 加权。原始分包含回退结果，不能用作纯模型分数。破折号表示分母为零或无法计算。",
    "", "|运行|结论准确率|精确率|证据可溯源率|幻觉率|cases|expectedTotal|matchedTotal|diagnosticsTotal|anchoredTotal|",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  const batches = new Map<string, Run[]>();
  const sampleIds = new Set<string>();
  const misses = new Map<string, string[]>();
  rows.forEach((r,i) => {
    const s = r.summary, c = s.counts;
    lines.push(`|R${i+1}|${pct(s.conclusionAccuracy)}|${pct(s.precision ?? null)}|${pct(s.traceabilityRate)}|${pct(s.hallucinationRate)}|${c.cases}|${c.expectedTotal}|${c.matchedTotal}|${c.diagnosticsTotal}|${c.anchoredTotal}|`);
    if (r.mode === "live") {
      const day = dateOf(new Date(r.ranAt));
      batches.set(day, [...(batches.get(day) ?? []), r]);
    }
    for (const item of r.cases) {
      sampleIds.add(item.id);
      if (item.matched >= item.expected) continue;
      const status = [r.mode === "offline" && "离线", item.mode === "demo" && "demo 回退", item.empty && "空输出"].filter(Boolean).join("、") || (usable(item) ? "有效 live" : "无有效 live");
      const detail = [status, item.id, item.title, item.matched + "/" + item.expected, item.missedClaims.join("；")].map(cell).join("|");
      misses.set(detail, [...(misses.get(detail) ?? []), "R" + (i+1)]);
    }
  });
  lines.push("", "## 迭代前后对比", "",
    "同一北京时间日期的 live 文件合并为一行。链路列按样本 ID 取当天最后一次结果。三项原始分按运行顺序并列，分片未保存 severity 权重分母，无法合算时保留各片分数。",
    "", "|日期|运行|链路可用|原始结论准确率|原始证据可溯源率|原始幻觉率|有效 live 命中/预期（未加权）|",
    "|---|---|---:|---|---|---|---:|");
  let gate = "无 live 批次，无法判定";
  for (const [day, batch] of batches) {
    const latest = new Map(batch.flatMap(r => r.cases.map(c => [c.id,c] as const)));
    const valid = [...latest.values()].filter(usable);
    const rates = (key: "conclusionAccuracy" | "traceabilityRate" | "hallucinationRate") =>
      batch.map(r => pct(r.summary[key])).join(" / ");
    const matched = valid.reduce((n,c) => n+c.matched, 0);
    const expected = valid.reduce((n,c) => n+c.expected, 0);
    lines.push(`|${day}|${batch.map(r=>"R"+(rows.indexOf(r)+1)).join("、")}|${valid.length}/${latest.size}|${rates("conclusionAccuracy")}|${rates("traceabilityRate")}|${rates("hallucinationRate")}|${expected ? matched+"/"+expected : "—"}|`);
    gate = day + "，" + valid.length + "/" + latest.size + "，" + (latest.size !== 14 ? "批次样本数与门槛分母不一致，无法判定" : valid.length >= 10 ? "达到门槛" : "未达到门槛");
  }
  lines.push("", "## 漏报归因（PRD §3.4 三分类）", "",
    "归因是**启发式推断**，只回答「模型有没有机会说对」，不回答「它为什么没说」。",
    "口径：`知识库未注入` = 该结论依据的判据本次没进 prompt；`未定位到位置` = 模型的证据没碰到过该处；`定位到但没说` = 走到了位置但没给出结论。",
    "", "|运行|知识库未注入|未定位到位置|定位到但没说|", "|---|---:|---:|---:|");
  rows.forEach((r, i) => {
    const a = (r.summary as { missedAttribution?: Record<string, number> }).missedAttribution ?? {};
    lines.push(`|R${i+1}|${a.criteria_not_injected ?? 0}|${a.not_located ?? 0}|${a.not_expressed ?? 0}|`);
  });

  lines.push("", "## Badcase 归因", "", "相同样本、状态及漏项合并列出运行编号。仅“有效 live”行进入模型命中统计。漏项记录来自 missedClaims。", "",
    "|运行|输出状态|ID|标题|命中/预期|漏掉的预期发现|", "|---|---|---|---|---:|---|");
  for (const [detail, refs] of misses) lines.push(`|${refs.join("、")}|${detail}|`);
  lines.push("", "## 样本量与门槛", "",
    `现有 run 覆盖的 golden set 去重样本数为 ${sampleIds.size}。PRD 目标 30–50 条，距下限尚差 ${Math.max(0,30-sampleIds.size)} 条，距上限尚差 ${Math.max(0,50-sampleIds.size)} 条。`,
    "", `最近已保存 live 批次的 AC4（≥10/14）结果：${gate}。`, "");
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dir = path.resolve(import.meta.dirname, "../evals");
  const files = (await readdir(path.join(dir,"runs"))).filter(f => f.endsWith(".json") && !f.startsWith("raw-"));
  if (!files.length) throw new Error("没有已保存的 run 报告");
  const runs: Run[] = [];
  for (const file of files) {
    const data = JSON.parse(await readFile(path.join(dir,"runs",file),"utf8"));
    runs.push({ ...data, file });
  }
  const now = new Date();
  const report = path.join(dir,"reports",dateOf(now)+"_评测报告.md");
  await mkdir(path.dirname(report), { recursive: true });
  await writeFile(report, renderReport(runs, now));
  console.log(report);
}
