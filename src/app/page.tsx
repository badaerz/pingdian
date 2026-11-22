import { ReadingSession } from "@/components/marketing/reading-session";
import "./reading-session.css";
import "./ink-hero.css";
import { ReadingInput } from "@/components/marketing/reading-input";
import localFont from "next/font/local";
import replay from "@/data/gc-038-replay.json";

const lines = replay.source.split("\n");
const anchoredQuotes = replay.result.diagnostics.map(({ quote }) => quote);

const serif = localFont({ src: "./reading-fonts/serif.woff2", variable: "--pd-serif", display: "swap", weight: "400 700" });
const sans = localFont({ src: "./reading-fonts/sans.woff2", variable: "--pd-sans", display: "swap", weight: "400 700" });
const mono = localFont({ src: "./reading-fonts/mono.woff2", variable: "--pd-mono", display: "swap", weight: "400 700" });

export const metadata = {
  title: "评点 PINGDIAN · 文学诊断终端",
  description: "每一句，都有出处。逐句核对文学批注与原文证据。",
};

export default function HomePage() {
  // 首屏 LCP 元素是立绘。曾经在这里手写一条 <link rel="preload" as="image">，
  // 实测多余：真正触发提前抓取的是 <img fetchPriority="high">，去掉手写 preload 后
  // 资源开始时间 29ms → 39ms，在噪声范围内，而且手写那条会和 Next 自动生成的重复。
  return <main className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
    <ReadingSession />
    <section className="pd-replay" aria-labelledby="pd-replay-title">
      <ReadingInput />
      <header><p>示例作品 · 杜甫《登高》</p><h2 id="pd-replay-title">逐句过筛</h2></header>
      <ol>{lines.map((line) => {
        const matched = anchoredQuotes.some((quote) => line.includes(quote));
        return <li key={line} data-matched={matched}><span>{line}</span><small>{matched ? "批注命中" : "未绑定批注"}</small></li>;
      })}</ol>
      <p>本示例未附丢弃台账。</p>
      <footer><h3>每条结论，都要指回原文</h3><p>指不上的，自动丢弃，不写进结果</p></footer>
    </section>
  </main>;
}
