"use client";

import Link from "next/link";
import { useStory } from "@/providers/story-provider";

const steps = [
  ["人物设定", "3:4", "从原文提取人物与动作约束。"],
  ["视觉简报", "16:9", "列出场景、光线和材质在原文中的依据。"],
  ["分镜", "6 格", "把有依据的动作转成镜头要求。"],
];

export function IpConcept({ projectId }: { projectId: string }) {
  const { documents } = useStory();
  const doc = documents[projectId];
  const chapter = doc?.chapters.find(item => item.id === doc.activeChapterId) ?? doc?.chapters[0];
  const quote = chapter?.content.match(/[^。！？\n]+[。！？]?/u)?.[0]?.trim();
  return <section className="pd-vision">
    <h1>IP 实验场</h1>
    {doc && <p>{doc.project.title}</p>}
    <p className="pd-vision-notice">产品愿景。下方为概念示意，当前页面未接入生图链路。</p>
    <ol className="pd-vision-steps">{steps.map(([title, size, detail], index) => <li key={title}>
      <h2>{index + 1}. {title}</h2><p>{detail}</p><div className="pd-vision-placeholder">图像占位 · {size}</div>
    </li>)}</ol>
    <h2>证据继续生效</h2>
    {quote ? <><blockquote>{quote}</blockquote><p>{chapter?.title} · 原文节选</p><p>本镜画面只采用引文写明的动作与可见事物。人物外貌、服饰与场景细节留待作者确认。</p></> : <p>当前作品暂无原文可供引用。</p>}
    {doc && <p><Link href={`/project/${encodeURIComponent(projectId)}/studio`}>返回作品 ↗</Link></p>}
  </section>;
}
