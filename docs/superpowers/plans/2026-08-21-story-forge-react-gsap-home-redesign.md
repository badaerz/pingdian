# Story Forge React + GSAP Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用用户提供的新 Logo、React 和 GSAP 重构完整 Story Forge 主页，同时修复 Logo 裁切、图谱断线、浅底白字、主页标点和创作台标题遮挡。

**Architecture:** `MarketingHome` 保留内容编排和真实路由，品牌轨道、创作流程与文学图谱拆为三个无状态展示组件。`ScrollMotion` 统一管理 GSAP 生命周期与 reduced-motion 降级，CSS 负责品牌设计系统和响应式布局，Playwright 负责几何关系、对比度和多视口视觉回归。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、GSAP 3 + ScrollTrigger、Next Image、Vitest + Testing Library、Playwright。

---

## 文件结构

- Create: `public/brand/story-forge-logo-20260821.png` - 用户确认的新完整 Logo。
- Create: `src/components/marketing/brand-orbit.tsx` - Hero Logo、轨道与品牌节点。
- Create: `src/components/marketing/process-timeline.tsx` - 五步创作流程与 SVG 进度线。
- Create: `src/components/marketing/literary-graph.tsx` - 同一 SVG 坐标系中的文学节点和连线。
- Modify: `src/components/marketing/marketing-home.tsx` - 完整主页内容结构和真实入口。
- Modify: `src/components/ui/scroll-motion.tsx` - Hero、章节和进度线的 GSAP 动效。
- Modify: `src/app/marketing.css` - Logo 色彩体系、整页布局、响应式和 reduced-motion 样式。
- Modify: `src/app/workspaces.css` - 创作台标题与操作区不重叠。
- Modify: `tests/components/marketing-home.test.tsx` - 品牌资产、页面结构、链接与标点回归。
- Create: `tests/components/scroll-motion.test.tsx` - GSAP 注册、章节动画和 reduced-motion 回归。
- Create: `tests/e2e/home-visual.spec.ts` - Logo、图谱连线、文字对比与首屏几何验收。
- Modify: `tests/e2e/responsive.spec.ts` - 新 Hero 图片语义和创作台标题遮挡回归。

### Task 1: 锁定新 Logo 资产与主页语义契约

**Files:**
- Create: `public/brand/story-forge-logo-20260821.png`
- Modify: `tests/components/marketing-home.test.tsx`
- Modify: `src/components/marketing/marketing-home.tsx`

- [ ] **Step 1: 写入失败的品牌与标点测试**

将现有主页测试的旧 Logo 断言替换为新资产，并增加整页结构和标点断言：

```tsx
it("uses the complete 20260821 brand asset across the homepage", () => {
  const { container } = render(<MarketingHome />);

  expect(container.querySelectorAll('img[src*="story-forge-logo-20260821.png"]')).toHaveLength(3);
  expect(screen.getByRole("img", { name: "故事熔炉完整品牌标识" })).toBeVisible();
});

it("presents the approved full-page narrative without the stray punctuation", () => {
  render(<MarketingHome />);

  expect(screen.getByRole("heading", { name: "以叙事智能 淬炼文学匠心" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "从灵感到作品，一条可解释的创作路径" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "文学知识图谱" })).toBeVisible();
  expect(screen.queryByText(/能，/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行组件测试并确认按预期失败**

Run: `npm test -- --run tests/components/marketing-home.test.tsx`

Expected: FAIL，旧资产仍为 `story-forge-full-logo-20260820.png`，且新标题尚不存在。

- [ ] **Step 3: 阅读当前 Next.js 图片与 CSS 文档**

Run:

```powershell
Get-Content -Raw node_modules/next/dist/docs/01-app/01-getting-started/12-images.md
Get-Content -Raw node_modules/next/dist/docs/01-app/01-getting-started/11-css.md
```

Expected: 确认静态 `/public` 图片可直接作为 `Image` 的 `src`，并继续通过现有全局 CSS 文件组织主页样式。

- [ ] **Step 4: 复制用户确认的新 Logo 到品牌目录**

Run:

```powershell
Copy-Item -LiteralPath 'C:\Users\babaerz\Documents\xwechat_files\wxid_racs1p6uzure22_a800\temp\RWTemp\2026-08\4a4a9d2d99469f1a3428fb7e2a2aa752\77089a91fc41e0f3e4146ac6f01d7fdc.png' -Destination 'public\brand\story-forge-logo-20260821.png'
```

Expected: 新文件尺寸为 `1254 x 1254`，原文件保持不变。

- [ ] **Step 5: 先将三个 Logo 引用切换到新资产并提供可访问名称**

在 `MarketingHome` 中统一使用：

```tsx
const brandLogo = "/brand/story-forge-logo-20260821.png";

<Image
  src={brandLogo}
  alt="故事熔炉完整品牌标识"
  width={1254}
  height={1254}
  priority
/>
```

导航和页脚的装饰性重复 Logo 使用 `alt=""`，Hero 中的主 Logo 保留上述可访问名称。

- [ ] **Step 6: 运行测试确认资产契约中的 Logo 断言通过**

Run: `npm test -- --run tests/components/marketing-home.test.tsx`

Expected: Logo 断言 PASS；新章节标题断言仍 FAIL，证明后续结构测试仍有效。

- [ ] **Step 7: 提交品牌资产与测试基线**

```powershell
git add public/brand/story-forge-logo-20260821.png tests/components/marketing-home.test.tsx src/components/marketing/marketing-home.tsx
git commit -m "test: lock homepage brand redesign contract"
```

### Task 2: 建立品牌轨道、流程和文学图谱组件

**Files:**
- Create: `src/components/marketing/brand-orbit.tsx`
- Create: `src/components/marketing/process-timeline.tsx`
- Create: `src/components/marketing/literary-graph.tsx`
- Modify: `src/components/marketing/marketing-home.tsx`
- Test: `tests/components/marketing-home.test.tsx`

- [ ] **Step 1: 扩展失败测试，锁定五步流程和图谱节点**

```tsx
it("renders the five-step workflow and connected literary dimensions", () => {
  render(<MarketingHome />);

  ["输入灵感", "生成设定", "构建蓝图", "协作写作", "诊断与导出"].forEach((label) => {
    expect(screen.getByText(label)).toBeVisible();
  });
  ["文学", "作品", "作者", "主题", "技法"].forEach((label) => {
    expect(screen.getByText(label)).toBeVisible();
  });
  expect(screen.getByTestId("literary-path-work")).toHaveAttribute("data-connects", "work");
});
```

- [ ] **Step 2: 运行测试确认缺少新组件而失败**

Run: `npm test -- --run tests/components/marketing-home.test.tsx`

Expected: FAIL，找不到五步流程文本和 `literary-path-work`。

- [ ] **Step 3: 创建品牌轨道组件**

`brand-orbit.tsx` 使用一个完整 Logo 和六个节点，不重复绘制 Logo 内部图形：

```tsx
import Image from "next/image";
import { BookOpenText, Feather, Globe2, Network, Search, Sparkles } from "lucide-react";

const orbitNodes = [
  { label: "灵感", className: "orbit-inspiration", icon: Sparkles },
  { label: "人物", className: "orbit-character", icon: Network },
  { label: "世界", className: "orbit-world", icon: Globe2 },
  { label: "分析", className: "orbit-analysis", icon: Search },
  { label: "写作", className: "orbit-writing", icon: Feather },
  { label: "知识", className: "orbit-knowledge", icon: BookOpenText },
] as const;

export function BrandOrbit() {
  return (
    <div className="brand-orbit" data-motion-logo>
      <svg className="brand-orbit-lines" viewBox="0 0 100 100" aria-hidden="true">
        <ellipse cx="50" cy="50" rx="44" ry="28" />
        <ellipse cx="50" cy="50" rx="28" ry="44" transform="rotate(38 50 50)" />
      </svg>
      <Image className="brand-orbit-logo" src="/brand/story-forge-logo-20260821.png" alt="故事熔炉完整品牌标识" width={1254} height={1254} priority />
      {orbitNodes.map(({ label, className, icon: Icon }) => (
        <span className={`brand-orbit-node ${className}`} data-motion-orbit key={label}>
          <Icon aria-hidden="true" size={16} />
          <small>{label}</small>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 创建五步流程组件**

```tsx
const steps = ["输入灵感", "生成设定", "构建蓝图", "协作写作", "诊断与导出"];

export function ProcessTimeline() {
  return (
    <ol className="marketing-process-list">
      <svg className="marketing-process-line" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
        <path d="M20 12 H980" data-motion-process-line />
      </svg>
      {steps.map((label, index) => (
        <li data-motion-item key={label}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 5: 创建同坐标系文学图谱组件**

```tsx
const graphNodes = [
  { id: "work", label: "作品", x: 16, y: 18 },
  { id: "author", label: "作者", x: 84, y: 18 },
  { id: "theme", label: "主题", x: 20, y: 82 },
  { id: "craft", label: "技法", x: 80, y: 82 },
] as const;

export function LiteraryGraph() {
  return (
    <svg className="literary-graph" viewBox="0 0 100 100" role="img" aria-label="文学知识关系示意图">
      {graphNodes.map((node) => (
        <line key={node.id} x1="50" y1="50" x2={node.x} y2={node.y} data-testid={`literary-path-${node.id}`} data-connects={node.id} />
      ))}
      <circle cx="50" cy="50" r="12" />
      <text x="50" y="50" data-node="literature">文学</text>
      {graphNodes.map((node) => (
        <g key={node.id} data-node={node.id} transform={`translate(${node.x} ${node.y})`}>
          <rect x="-7" y="-4" width="14" height="8" />
          <text>{node.label}</text>
        </g>
      ))}
    </svg>
  );
}
```

- [ ] **Step 6: 在主页中接入三个组件并建立完整章节标题**

在 `marketing-home.tsx` 中导入组件，并使用以下章节顺序：Hero、理念、核心能力、流程、知识图谱、IP 实验场、案例、CTA。流程章节标题必须为：

```tsx
<h2>从灵感到作品，一条可解释的创作路径</h2>
```

理念文案使用无“能，”组合的句子：

```tsx
<p>AI 可以生成文字，但文学判断仍由作者完成。</p>
```

- [ ] **Step 7: 运行主页组件测试**

Run: `npm test -- --run tests/components/marketing-home.test.tsx`

Expected: 所有主页结构、Logo、链接、流程、图谱和标点断言 PASS。

- [ ] **Step 8: 提交主页结构组件**

```powershell
git add src/components/marketing tests/components/marketing-home.test.tsx
git commit -m "feat: rebuild homepage narrative structure"
```

### Task 3: 扩展 GSAP 动效并保证 reduced-motion 降级

**Files:**
- Create: `tests/components/scroll-motion.test.tsx`
- Modify: `src/components/ui/scroll-motion.tsx`

- [ ] **Step 1: 写入失败的 GSAP 生命周期测试**

```tsx
import { render } from "@testing-library/react";
import { ScrollMotion } from "@/components/ui/scroll-motion";

const fromTo = vi.fn();
const set = vi.fn();
const registerPlugin = vi.fn();
const revert = vi.fn();

vi.mock("gsap", () => ({
  gsap: {
    registerPlugin,
    context: (callback: () => void) => { callback(); return { revert }; },
    utils: { toArray: (selector: string) => Array.from(document.querySelectorAll(selector)) },
    fromTo,
    set,
  },
}));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: {} }));

it("animates hero, orbit nodes, sections, and the process line", () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  document.body.innerHTML = `
    <div data-motion-hero></div>
    <div data-motion-logo></div>
    <div data-motion-orbit></div>
    <section data-motion-section><div data-motion-item></div></section>
    <svg><path data-motion-process-line></path></svg>`;

  render(<ScrollMotion />);

  expect(registerPlugin).toHaveBeenCalledTimes(1);
  expect(fromTo).toHaveBeenCalled();
  expect(set).toHaveBeenCalledWith(expect.anything(), { strokeDasharray: 1, strokeDashoffset: 1 });
});

it("does not initialize animation when reduced motion is requested", () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  render(<ScrollMotion />);
  expect(registerPlugin).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试确认流程线和 Logo 动画尚未实现**

Run: `npm test -- --run tests/components/scroll-motion.test.tsx`

Expected: FAIL，`gsap.set` 未针对流程线调用。

- [ ] **Step 3: 用 GSAP context 实现四类动画**

在现有章节 reveal 基础上加入：

```tsx
const logo = document.querySelector<HTMLElement>("[data-motion-logo]");
if (logo) {
  gsap.fromTo(logo, { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 1, ease: "power3.out" });
}

const orbitNodes = gsap.utils.toArray<HTMLElement>("[data-motion-orbit]");
if (orbitNodes.length) {
  gsap.fromTo(orbitNodes, { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.55, stagger: 0.12, delay: 0.35, ease: "back.out(1.5)" });
}

const processLine = document.querySelector<SVGPathElement>("[data-motion-process-line]");
if (processLine) {
  const length = processLine.getTotalLength();
  gsap.set(processLine, { strokeDasharray: length, strokeDashoffset: length });
  gsap.to(processLine, {
    strokeDashoffset: 0,
    ease: "none",
    scrollTrigger: { trigger: processLine, start: "top 82%", end: "bottom 42%", scrub: true },
  });
}
```

测试中的 `strokeDasharray` 期望相应改为模拟 `getTotalLength()` 返回值 `1`。

- [ ] **Step 4: 运行动效测试并确认通过**

Run: `npm test -- --run tests/components/scroll-motion.test.tsx`

Expected: 2 tests PASS，无未清理的 effect 警告。

- [ ] **Step 5: 提交 GSAP 动效**

```powershell
git add src/components/ui/scroll-motion.tsx tests/components/scroll-motion.test.tsx
git commit -m "feat: animate homepage narrative with GSAP"
```

### Task 4: 建立 Logo 调性的整页 CSS 与响应式布局

**Files:**
- Modify: `src/app/marketing.css`
- Create: `tests/e2e/home-visual.spec.ts`

- [ ] **Step 1: 写入失败的主页几何和对比度 Playwright 测试**

```ts
import { expect, test } from "@playwright/test";

test("homepage keeps the complete logo visible and exposes the next section", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByRole("img", { name: "故事熔炉完整品牌标识" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveCSS("object-fit", "contain");
  const metrics = await logo.evaluate((image: HTMLImageElement) => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    rect: image.getBoundingClientRect().toJSON(),
  }));
  expect(metrics.naturalWidth).toBe(1254);
  expect(metrics.naturalHeight).toBe(1254);
  expect(metrics.rect.bottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  await expect(page.locator(".marketing-manifesto")).toBeInViewport({ ratio: 0.01 });
});

test("knowledge graph paths reach their labelled nodes", async ({ page }) => {
  await page.goto("/");
  const distance = await page.getByTestId("literary-path-work").evaluate((line: SVGLineElement) => {
    const svg = line.ownerSVGElement!;
    const point = svg.createSVGPoint();
    point.x = line.x2.baseVal.value;
    point.y = line.y2.baseVal.value;
    const screenPoint = point.matrixTransform(svg.getScreenCTM()!);
    const node = svg.querySelector<SVGGElement>('[data-node="work"]')!.getBoundingClientRect();
    return Math.hypot(screenPoint.x - (node.left + node.width / 2), screenPoint.y - (node.top + node.height / 2));
  });
  expect(distance).toBeLessThan(3);
});

test("roadmap titles have readable contrast on the light surface", async ({ page }) => {
  await page.goto("/");
  const colors = await page.locator(".marketing-ip-roadmap h3").first().evaluate((element) => {
    const style = getComputedStyle(element);
    const background = getComputedStyle(element.closest("article")!).backgroundColor;
    return { foreground: style.color, background };
  });
  expect(colors.foreground).not.toBe("rgb(255, 255, 255)");
  expect(colors.background).not.toBe("rgb(15, 15, 15)");
});
```

- [ ] **Step 2: 运行桌面主页视觉测试并确认样式尚未满足**

Run: `npx playwright test tests/e2e/home-visual.spec.ts --project=desktop`

Expected: FAIL，Logo 样式、Hero 几何或路线图颜色至少一项不符合。

- [ ] **Step 3: 重写主页设计 token 和主要区块样式**

在 `marketing.css` 顶部使用明确品牌 token：

```css
.marketing-home {
  --marketing-bg: #fbf6ed;
  --marketing-surface: #fffdf8;
  --marketing-ink: #171c22;
  --marketing-muted: #6f6a61;
  --marketing-orange: #cf7300;
  --marketing-orange-bright: #e58a00;
  --marketing-line: #d8cdbd;
  --marketing-dark: #111820;
  min-height: 100vh;
  overflow: clip;
  background: var(--marketing-bg);
  color: var(--marketing-ink);
}
```

Hero 采用全幅而非左右卡片：

```css
.marketing-hero {
  position: relative;
  display: grid;
  min-height: min(94svh, 980px);
  place-items: center;
  padding: 104px clamp(20px, 5vw, 72px) 76px;
  border-bottom: 1px solid var(--marketing-line);
}
.brand-orbit { position: relative; width: min(62vh, 620px); aspect-ratio: 1; }
.brand-orbit-logo { position: absolute; inset: 10%; width: 80%; height: 80%; object-fit: contain; }
.brand-orbit-lines { position: absolute; inset: 0; width: 100%; height: 100%; fill: none; stroke: color-mix(in srgb, var(--marketing-orange) 60%, transparent); }
```

核心能力使用连续信息带，知识图谱使用深色全宽章节，IP 路线图标题明确为深色：

```css
.marketing-capability { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; border-top: 1px solid var(--marketing-line); padding: 28px 0; }
.marketing-humanities-feature { background: var(--marketing-dark); color: #fff8ec; }
.marketing-ip-roadmap article { background: #f1eadf; color: var(--marketing-ink); }
.marketing-ip-roadmap h3 { color: #20252b; }
.marketing-ip-roadmap p { color: #69635b; }
```

- [ ] **Step 4: 添加桌面、平板、移动端约束**

```css
@media (max-width: 900px) {
  .marketing-nav nav { display: none; }
  .marketing-hero { min-height: auto; padding-top: 92px; }
  .brand-orbit { width: min(82vw, 520px); }
  .marketing-process-list { grid-template-columns: 1fr; }
  .marketing-process-line { display: none; }
}

@media (max-width: 600px) {
  .marketing-hero-copy h1 { font-size: clamp(36px, 12vw, 58px); }
  .marketing-hero-actions { align-items: stretch; flex-direction: column; }
  .marketing-capability { grid-template-columns: 48px minmax(0, 1fr); }
  .marketing-capability > a { grid-column: 2; justify-self: start; }
}

@media (prefers-reduced-motion: reduce) {
  .brand-orbit-node, .brand-orbit-lines, [data-motion-item], [data-motion-hero] { animation: none !important; transform: none !important; opacity: 1 !important; }
}
```

- [ ] **Step 5: 运行桌面主页视觉测试**

Run: `npx playwright test tests/e2e/home-visual.spec.ts --project=desktop`

Expected: 3 tests PASS。

- [ ] **Step 6: 运行三视口主页无溢出测试并生成截图**

Run: `npx playwright test tests/e2e/responsive.spec.ts --grep "home renders"`

Expected: desktop、tablet、mobile 均 PASS，并更新三个主页截图。

- [ ] **Step 7: 提交主页视觉系统**

```powershell
git add src/app/marketing.css tests/e2e/home-visual.spec.ts tests/e2e/responsive.spec.ts tests/e2e/screenshots/desktop-home.png tests/e2e/screenshots/tablet-home.png tests/e2e/screenshots/mobile-home.png
git commit -m "feat: apply Story Forge brand visual system"
```

### Task 5: 修复创作台标题与工具栏遮挡

**Files:**
- Modify: `tests/e2e/responsive.spec.ts`
- Modify: `src/app/workspaces.css`

- [ ] **Step 1: 写入失败的标题边界回归测试**

在桌面创作台测试中增加：

```ts
test("studio title never enters the action toolbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "桌面工具栏专用回归");
  await page.goto("/project/demo/studio");

  const geometry = await page.locator(".writing-head").evaluate((header) => {
    const title = header.querySelector("h1")!.getBoundingClientRect();
    const actions = header.querySelector(".writing-actions")!.getBoundingClientRect();
    return { titleRight: title.right, actionsLeft: actions.left };
  });
  expect(geometry.titleRight).toBeLessThanOrEqual(geometry.actionsLeft - 8);
});
```

- [ ] **Step 2: 运行创作台回归并确认当前布局失败**

Run: `npx playwright test tests/e2e/responsive.spec.ts --project=desktop --grep "studio title"`

Expected: FAIL，标题右边界进入操作区。

- [ ] **Step 3: 最小修改标题与操作区 CSS**

```css
.writing-head { grid-template-columns: minmax(0, 1fr) auto; }
.writing-head > div:first-child { min-width: 0; overflow: hidden; }
.writing-head h1 { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.writing-actions { flex: 0 0 auto; min-width: max-content; }
```

保持现有工具按钮、下载逻辑和工作区列宽不变。

- [ ] **Step 4: 运行创作台标题和按钮高度回归**

Run: `npx playwright test tests/e2e/responsive.spec.ts --project=desktop --grep "studio (title|header action)"`

Expected: 两项 PASS，标题不遮挡且按钮仍为单行。

- [ ] **Step 5: 提交工作区局部修复**

```powershell
git add src/app/workspaces.css tests/e2e/responsive.spec.ts
git commit -m "fix: keep studio title clear of toolbar"
```

### Task 6: 完整验证与浏览器视觉复核

**Files:**
- Verify only; do not modify unrelated files.

- [ ] **Step 1: 运行所有相关组件测试**

Run:

```powershell
npm test -- --run tests/components/marketing-home.test.tsx tests/components/scroll-motion.test.tsx tests/components/app-shell.test.tsx
```

Expected: 全部 PASS，0 failures。

- [ ] **Step 2: 运行 lint 和 typecheck**

Run:

```powershell
npm run lint
npm run typecheck
```

Expected: 两个命令 exit code 0，无新增错误。

- [ ] **Step 3: 运行主页和创作台 Playwright 回归**

Run:

```powershell
npx playwright test tests/e2e/home-visual.spec.ts
npx playwright test tests/e2e/responsive.spec.ts --grep "home renders|studio title|studio header action"
```

Expected: desktop、tablet、mobile 全部 PASS。

- [ ] **Step 4: 运行生产构建**

Run: `npm run build`

Expected: Next.js production build exit code 0，主页和现有产品路由均成功生成。

- [ ] **Step 5: 启动开发服务器并使用浏览器逐屏检查**

Run: `npm run dev`

浏览器检查 `http://localhost:3000` 和 `http://localhost:3000/project/demo/studio`：

- Hero 完整显示新 Logo 的图形、中文名、英文名和底部标语。
- 桌面首屏下沿能看到下一章节提示，移动端无重叠和横向滚动。
- “作品”节点与线段实际相接。
- IP 路线图标题在浅色背景上清晰可读。
- 创作台标题不进入工具按钮区域。
- GSAP 动效运行，reduced-motion 模拟下内容仍可见。

- [ ] **Step 6: 检查最终差异只包含本次范围**

Run:

```powershell
git status --short
git diff -- src/components/marketing src/components/ui/scroll-motion.tsx src/app/marketing.css src/app/workspaces.css tests/components/marketing-home.test.tsx tests/components/scroll-motion.test.tsx tests/e2e/home-visual.spec.ts tests/e2e/responsive.spec.ts
```

Expected: 每一处改动都能对应设计规格，不包含 API、数据模型或无关工作区重构。

---

## 计划自检

- 规格覆盖：Logo 调性、完整主页、React + GSAP、五步流程、深色知识图谱、真实路由、四个截图问题和移动端降级均有对应任务。
- 占位扫描：计划不包含 TBD、TODO、待定或未定义的实现步骤。
- 类型一致性：三个新组件均为无参数 React 组件；GSAP 选择器与 JSX `data-motion-*` 属性一致；图谱测试 ID 与 `data-connects` 值一致。
- 范围控制：内部业务逻辑、AI、持久化和 API 均不修改；创作台仅调整标题布局。
