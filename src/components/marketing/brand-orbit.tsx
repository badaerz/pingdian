import Image from "next/image";
import { BookOpenText, Feather, Globe2, Network, Search, Sparkles } from "lucide-react";

const orbitNodes = [
  { label: "灵感", className: "orbit-inspiration", angle: -90, icon: Sparkles },
  { label: "人物", className: "orbit-character", angle: 150, icon: Network },
  { label: "世界", className: "orbit-world", angle: -30, icon: Globe2 },
  { label: "分析", className: "orbit-analysis", angle: 90, icon: Search },
  { label: "写作", className: "orbit-writing", angle: 30, icon: Feather },
  { label: "知识", className: "orbit-knowledge", angle: 210, icon: BookOpenText },
] as const;

export function BrandOrbit() {
  return (
    <div className="brand-orbit" data-motion-logo>
      <svg className="brand-orbit-lines" viewBox="0 0 100 100" aria-hidden="true">
        <ellipse cx="50" cy="50" rx="44" ry="28" />
        <ellipse cx="50" cy="50" rx="28" ry="44" transform="rotate(38 50 50)" />
      </svg>
      <Image className="brand-orbit-logo" src="/brand/story-forge-logo-20260821.png" alt="故事熔炉完整品牌标识" width={1254} height={1254} priority />
      {orbitNodes.map(({ label, className, angle, icon: Icon }) => (
        <span className={`brand-orbit-node ${className}`} data-motion-orbit data-orbit-angle={angle} key={label}>
          <Icon aria-hidden="true" size={16} />
          <small>{label}</small>
        </span>
      ))}
    </div>
  );
}
