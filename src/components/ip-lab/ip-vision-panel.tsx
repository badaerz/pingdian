"use client";

import { ArrowRight, Building2, GraduationCap, Sparkles, Users } from "lucide-react";

/**
 * IP 实验场的愿景层呈现（PRD 2.0 §4）。
 *
 * PRD 的原话很直接：这块的价值在讲清楚"为什么"，不在做一个能用的生图按钮。
 * 同一件事，表述成"产品下一步的想象力"就是 vision，表述成"我做了个功能但没做完"就是半成品
 * ——AIPM 面试的差距正在这句话。
 *
 * 所以这里不删任何已有能力，只把**框架**摆正：
 *   1. 顶部明确标注这是愿景层，不是本期交付
 *   2. 四步概念流：作文 → 人物卡 → 分镜 → 视觉简报
 *   3. 商业路径四阶段（PRD §2.1：仅作路径规划，不实现付费墙）
 */

const CONCEPT_FLOW = [
  { step: "作文", detail: "一篇学生的记叙文" },
  { step: "人物卡", detail: "从描写里抽出可复用的人物设定" },
  { step: "分镜", detail: "把场景拆成可拍摄的镜头序列" },
  { step: "视觉简报", detail: "给美术的材质、光线、时代约束" },
];

const BUSINESS_PATH = [
  { stage: "学生免费", detail: "写作课与竞赛辅导场景，先把评估闭环跑通", icon: GraduationCap },
  { stage: "Pro 订阅", detail: "教师与独立创作者，按作品数与诊断深度计费", icon: Sparkles },
  { stage: "课程版", detail: "高校写作中心，按班级与学期授权", icon: Users },
  { stage: "机构版", detail: "出版与内容公司，作品 IP 化的前置评估", icon: Building2 },
];

export function IpVisionPanel() {
  return (
    <section className="ip-vision" aria-label="IP 实验场产品愿景">
      <div className="ip-vision-banner">
        <span className="eyebrow">产品愿景 · 非本期交付</span>
        <h2>用户作品如何走向 IP 化</h2>
        <p>
          这一层的价值在于把商业闭环讲清楚，不在于做一个能用的生图按钮。
          下面展示的是概念流与路径设计，用于说明「下一步可以往哪走」。
        </p>
      </div>

      <ol className="ip-vision-flow" aria-label="作品 IP 化概念流">
        {CONCEPT_FLOW.map((item, index) => (
          <li key={item.step}>
            <span className="ip-vision-index">{index + 1}</span>
            <strong>{item.step}</strong>
            <span>{item.detail}</span>
            {index < CONCEPT_FLOW.length - 1 && <ArrowRight size={14} aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="ip-vision-path">
        <h3>商业路径（仅作规划，不实现付费墙）</h3>
        <ul>
          {BUSINESS_PATH.map(({ stage, detail, icon: Icon }) => (
            <li key={stage}>
              <Icon size={15} aria-hidden />
              <strong>{stage}</strong>
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
