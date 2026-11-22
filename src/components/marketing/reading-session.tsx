"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";

/* 原文与批注都取自 evals 里已保存的真实分析（gc-038），不是编的示例。
   第 02 条是「误写演示」：故意把「停」写成「亭」，用来展示核对失败会怎样。
   它必须标明是演示——否则就是用一条假数据演示「我们不发假数据」。 */
const COUPLETS: ReadonlyArray<readonly [string, string]> = [
  ["风急天高猿啸哀，", "渚清沙白鸟飞回。"],
  ["无边落木萧萧下，", "不尽长江滚滚来。"],
  ["万里悲秋常作客，", "百年多病独登台。"],
  ["艰难苦恨繁霜鬓，", "潦倒新停浊酒杯。"],
];
const GOOD_QUOTE = "无边落木萧萧下，";
const BAD_QUOTE = "潦倒新亭浊酒杯。";
const BAD_INDEX = 3; // 第 4 字「亭」

/** 逐字散开时的位移/旋转：用下标做确定性伪随机，服务端和客户端算出来一致，不会有 hydration 差异。
    位移压在 8px 内：再大就会撞到下面那行说明文字，看起来像渲染坏了而不是「被划掉」。 */
function drift(index: number): CSSProperties {
  const dx = (((index * 37) % 11) - 5) * 1.4;
  const dy = 2 + ((index * 59) % 7);
  const rot = (((index * 53) % 9) - 4) * 0.5;
  return { "--i": String(index), "--dx": `${dx.toFixed(1)}px`, "--dy": `${dy}px`, "--rot": `${rot.toFixed(1)}deg` } as CSSProperties;
}

export function ReadingSession() {
  const root = useRef<HTMLElement>(null);
  const finish = useRef<() => void>(() => {});

  useEffect(() => {
    const scene = root.current;
    if (!scene) return;
    const q = <E extends HTMLElement = HTMLElement>(sel: string) => scene.querySelector<E>(sel);
    const on = (sel: string) => q(sel)?.classList.add("on");

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timers: number[] = [];
    const frames: number[] = [];
    let cancelled = false;
    const at = (ms: number, run: () => void) => { timers.push(window.setTimeout(run, ms)); };

    // 「逐字命中 n/7」从 0 数到 7，比直接跳终值更有说服力：它看起来像真的在比对
    const tally = (from: number, to: number, duration: number) => {
      const node = q("#tally");
      if (!node) return;
      const start = performance.now();
      const step = (now: number) => {
        if (cancelled) return;
        const k = Math.min(1, (now - start) / duration);
        node.textContent = `逐字命中 ${Math.round(from + (to - from) * k)}/7`;
        if (k < 1) frames.push(requestAnimationFrame(step));
      };
      frames.push(requestAnimationFrame(step));
    };

    const settle = () => {
      q("#sheet")?.classList.add("on");
      on("#rule");
      on("#claim1");
      const node = q("#tally");
      if (node) node.textContent = "逐字命中 7/7";
      on("#seal");
      on("#claim2");
      q("#claim2")?.setAttribute("data-gone", "");
      on("#drop");
    };

    const skip = () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
      scene.dataset.skip = "";
      settle();
    };
    finish.current = skip;

    // 减少动画时没有动画可跳，但 Esc 仍然要能被按下并留下 data-skip：
    // 这是首屏对外的行为契约，两种动效偏好下都得成立。
    window.addEventListener("keydown", skip);
    if (media.matches) {
      settle();
      return () => { window.removeEventListener("keydown", skip); };
    }

    scene.dataset.flow = "";
    // 标题、导语、按钮不上场动画：它们是首屏 LCP 文字，直接可读。
    // 只有右侧那张「校对纸」在动。
    at(120, () => q("#sheet")?.classList.add("on"));
    at(520, () => on("#rule"));
    at(860, () => on("#claim1"));
    at(1000, () => tally(0, 7, 640));
    at(1780, () => on("#seal"));
    at(2260, () => on("#claim2"));
    at(2820, () => q("#claim2")?.setAttribute("data-mark", "")); // 第 4 字闪朱红
    at(3480, () => q("#claim2")?.setAttribute("data-gone", "")); // 整条散字
    at(3860, () => on("#drop"));

    const reduce = () => { if (media.matches) skip(); };
    window.addEventListener("keydown", skip);
    media.addEventListener("change", reduce);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
      window.removeEventListener("keydown", skip);
      media.removeEventListener("change", reduce);
    };
  }, []);

  return (
    <section
      className="ink-hero"
      ref={root}
      aria-labelledby="h1"
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        const scene = event.currentTarget;
        const rect = scene.getBoundingClientRect();
        const cursor = scene.querySelector<HTMLElement>(".cur");
        if (!cursor) return;
        scene.dataset.pointer = "";
        cursor.style.transform = `translate(${event.clientX - rect.left}px,${event.clientY - rect.top}px)`;
        cursor.classList.toggle("ring", !!(event.target as Element).closest("button,a"));
      }}
      onPointerLeave={(event) => { delete event.currentTarget.dataset.pointer; }}
    >
      <header className="bar">
        <div className="brand"><span className="zh">评点</span><span className="en">PINGDIAN</span></div>
        <nav aria-label="首页导航">
          <Link href="/project/reading/analysis?sample=denggao">诊断</Link>
          <Link href="/training">训练</Link>
          <Link href="/knowledge">图谱</Link>
          <Link href="/projects" className="go">开始阅读 →</Link>
        </nav>
      </header>

      <div className="hero-grid">
        <div className="lead-col">
          <p className="eyebrow"><i />示例作品 · 杜甫《登高》 · 逐字核对</p>
          <h1 id="h1">每一句，<br />都有<em>出处</em>。</h1>
          <p className="lede">把批注钉在原文上。钉不住的，它自己删掉。<br />贴一段你写的文字，三十秒后看它怎么读你。</p>
          <a href="#try-reading" className="cta">贴一段文字试试 <span>→</span></a>
        </div>

        <div className="sheet" id="sheet" aria-label="逐字核对演示">
          <div className="sheet-head"><span>原文</span><span>已保存的真实分析</span></div>

          <ol className="couplets">
            {COUPLETS.map(([upper, lower], row) => (
              <li key={row}>
                <span className={row === 1 ? "hit" : undefined}>
                  {upper}
                  {row === 1 ? <i className="rule" id="rule" /> : null}
                </span>
                <span>{lower}</span>
              </li>
            ))}
          </ol>

          <div className="claims">
            <div className="claim" id="claim1">
              <header><b>批注 01</b><span className="seal" id="seal">真</span></header>
              <blockquote>{GOOD_QUOTE}</blockquote>
              <p className="meta"><b id="tally">逐字命中 0/7</b> · 判据 S2 · 置信 0.62</p>
            </div>

            <div className="claim bad" id="claim2">
              <header><b>批注 02</b><span className="tag-demo">误写演示</span><span className="verdict">丢弃</span></header>
              <blockquote>
                {Array.from(BAD_QUOTE).map((char, index) => (
                  <span key={index} style={drift(index)} data-miss={index === BAD_INDEX ? "" : undefined}>{char}</span>
                ))}
              </blockquote>
              <p className="meta">第 4 字「亭」不在原文中 · 引文逐字不符</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="foot">
        <div className="drop" id="drop"><em>丢弃台账</em><span id="ledger">本轮丢弃 1 条 · 引文逐字不符</span></div>
        <button type="button" className="skip" onClick={() => finish.current()}>跳过 ↓</button>
      </footer>

      <div className="cur" aria-hidden="true" />
    </section>
  );
}
