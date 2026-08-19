# Story Forge Workspace v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, responsive HTML v0 that lets the user compare the confirmed information-architecture-led project dashboard and studio without changing the production app.

**Architecture:** The prototype lives under `docs/prototypes/` and is deliberately isolated from Next.js routes, providers, and persistence. Semantic HTML carries real Story Forge demo content, a dedicated CSS file implements the confirmed design system, and a tiny JavaScript file switches between the two screens and two density modes without framework dependencies.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript, Vitest, JSDOM.

---

## File Map

- Create `tests/unit/workspace-v0.test.ts`: executable contract for the prototype structure, tokens, responsive behavior, and controls.
- Create `docs/prototypes/story-forge-workspace-v0.html`: semantic project-dashboard and studio views using the existing Story Forge brand asset and demo content.
- Create `docs/prototypes/story-forge-workspace-v0.css`: confirmed paper/ink/forest/gold/indigo design system, desktop grid, and mobile layout.
- Create `docs/prototypes/story-forge-workspace-v0.js`: view and density toggles; no application state or persistence.

The prototype must not modify `src/`, add a Next.js route, call an API, or introduce a new package.

### Task 1: Add the prototype structure contract

**Files:**
- Create: `tests/unit/workspace-v0.test.ts`
- Test: `tests/unit/workspace-v0.test.ts`

- [ ] **Step 1: Write the failing structural test**

```ts
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const prototypeRoot = "docs/prototypes";

describe("Story Forge workspace v0", () => {
  it("contains the two approved workspace views and real brand asset", async () => {
    const html = await readFile(`${prototypeRoot}/story-forge-workspace-v0.html`, "utf8");
    const document = new JSDOM(html).window.document;

    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.querySelector('img[src="../../public/brand/story-forge-logo.png"]')).not.toBeNull();
    expect(document.querySelector('[data-view="projects"]')).not.toBeNull();
    expect(document.querySelector('[data-view="studio"]')).not.toBeNull();
    expect(document.querySelectorAll("[data-view-target]")).toHaveLength(2);
    expect(document.body.textContent).toContain("回响的草场");
    expect(document.body.textContent).toContain("AI 候选区");
  });
});
```

- [ ] **Step 2: Run the test and verify the prototype is missing**

Run: `npm test -- --run tests/unit/workspace-v0.test.ts`

Expected: FAIL with `ENOENT` for `docs/prototypes/story-forge-workspace-v0.html`.

- [ ] **Step 3: Commit the failing test**

```powershell
git add tests/unit/workspace-v0.test.ts
git commit -m "test: define workspace v0 contract"
```

### Task 2: Create the semantic v0 structure

**Files:**
- Create: `docs/prototypes/story-forge-workspace-v0.html`
- Test: `tests/unit/workspace-v0.test.ts`

- [ ] **Step 1: Create the complete HTML structure**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Story Forge 工作区 v0</title>
    <link rel="stylesheet" href="story-forge-workspace-v0.css" />
  </head>
  <body>
    <header class="prototype-toolbar">
      <div class="prototype-brand">
        <img src="../../public/brand/story-forge-logo.png" alt="Story Forge" />
        <div><strong>工作区 v0</strong><small>信息架构主导方案</small></div>
      </div>
      <div class="segmented" aria-label="预览页面">
        <button type="button" class="active" data-view-target="projects" aria-pressed="true">项目桌面</button>
        <button type="button" data-view-target="studio" aria-pressed="false">创作台</button>
      </div>
      <button type="button" class="density-toggle" data-density-toggle aria-pressed="false">紧凑密度</button>
    </header>

    <main class="prototype-frame">
      <section class="workspace-view" data-view="projects">
        <aside class="product-rail">
          <div class="rail-brand"><img src="../../public/brand/story-forge-logo.png" alt="" /><span>Story Forge<small>故事锻造</small></span></div>
          <nav aria-label="产品导航">
            <a class="active" href="#projects">项目桌面</a><a href="#studio">创作台</a><a href="#analysis">文学诊断</a><a href="#knowledge">知识图谱</a><a href="#training">写作训练</a>
          </nav>
          <p><strong>本地优先</strong><span>所有正文均可继续编辑</span></p>
        </aside>

        <div class="projects-main">
          <header class="context-bar"><span>项目桌面</span><strong>回响的草场</strong><span class="sync-state">已保存</span></header>
          <section class="continue-band">
            <div class="continue-copy">
              <span class="section-label">继续创作 / 01</span>
              <h1>回响的草场</h1>
              <p>声场的入侵与重返</p>
              <dl><div><dt>当前章节</dt><dd>第一章</dd></div><div><dt>正文</dt><dd>257 字</dd></div><div><dt>最近编辑</dt><dd>刚刚</dd></div></dl>
              <div class="primary-actions"><button type="button">继续创作</button><button type="button" class="secondary">文学诊断</button></div>
            </div>
            <aside class="relation-note">
              <span class="section-label">关系边注</span><h2>故事正在形成哪些联系</h2>
              <ul><li><b>03</b><span>人物</span></li><li><b>02</b><span>主题</span></li><li><b>03</b><span>证据</span></li></ul>
              <p>当前焦点：工业记忆、声音采集与精神返乡。</p>
            </aside>
          </section>

          <section class="project-index" id="projects">
            <header><div><span class="section-label">作品索引</span><h2>你的书架</h2></div><button type="button">新建作品</button></header>
            <label class="search"><span>搜索</span><input type="search" placeholder="作品或体裁" /></label>
            <div class="project-table" role="table" aria-label="作品列表">
              <div class="project-row table-head" role="row"><span>序号</span><span>作品</span><span>状态</span><span>进度</span><span>操作</span></div>
              <article class="project-row" role="row"><b>01</b><div><h3>回响的草场</h3><p>现实主义生态书写 · 已导入答辩案例</p></div><span>创作中</span><span>257 字</span><button type="button">打开</button></article>
              <article class="project-row" role="row"><b>02</b><div><h3>雾港来信</h3><p>悬疑书信叙事 · 回归案例</p></div><span>草稿</span><span>124 字</span><button type="button">打开</button></article>
            </div>
          </section>
        </div>
      </section>

      <section class="workspace-view" data-view="studio" hidden>
        <aside class="product-rail studio-rail">
          <div class="rail-brand"><img src="../../public/brand/story-forge-logo.png" alt="" /><span>Story Forge<small>故事锻造</small></span></div>
          <nav aria-label="创作索引"><span>章节 / 01</span><a class="active" href="#chapter">声场的入侵与重返</a><span>人物 / 03</span><a href="#character">杭盖</a><a href="#character">巴特尔</a><a href="#character">诺敏</a><span>蓝图 / 05</span><a href="#blueprint">开端：重返草场</a><a href="#blueprint">冲突：标本与拒绝</a></nav>
        </aside>

        <div class="studio-main">
          <header class="context-bar"><div><span>第一章</span><strong>声场的入侵与重返</strong></div><div class="tool-group"><span>已保存</span><button type="button">导出</button><button type="button">版本 1</button></div></header>
          <details class="setup-context"><summary><span><small>创作设定</small><strong>一句话灵感、人物、世界观与蓝图</strong></span><b>展开上下文</b></summary><p>青年声音采集师返回即将拆迁的北方老工业矿区与退化草场，寻找被机械轰鸣覆盖的精神根基。</p></details>
          <article class="editor-page" id="chapter">
            <header><div><button type="button" aria-label="粗体">B</button><button type="button" aria-label="斜体">I</button><button type="button" aria-label="撤销">↶</button></div><span>正文 · 中文衬线阅读模式</span></header>
            <h1>声场的入侵与重返</h1>
            <p>杭盖背着专业枪型麦克风与声学分析仪回到白音淖尔。巨型露天矿坑的风从铁丝网缝隙里穿过，卷起一层细薄的黑尘。</p>
            <p>他在废弃工棚前停下，把耳机扣紧。机械停摆多年之后，草场仍保留着低沉的回响，像一段没有被任何档案记录的证词。</p>
            <footer>257 字 · 预计阅读 3 分钟</footer>
          </article>
        </div>

        <aside class="candidate-zone">
          <header><span class="section-label">AI 候选区</span><h2>接下来怎么写</h2><p>结果只进入候选区，确认后才改变正文。</p></header>
          <div class="candidate-actions"><button type="button" class="active">续写</button><button type="button">改写</button><button type="button">清空</button></div>
          <article class="candidate"><span>候选 01 · 环境推进</span><p>远处的输电塔在暮色里发出细小的震颤，杭盖忽然意识到，那并不是风。</p><small>保持低饱和声景，推进人物警觉。</small><div><button type="button">编辑</button><button type="button">确认采用</button></div></article>
          <article class="candidate"><span>候选 02 · 人物推进</span><p>巴特尔从旧检修间走出来，没有招呼，只把一盘落满铁屑的磁带放在门槛上。</p><small>引入关键人物，并保留叙事悬念。</small><div><button type="button">编辑</button><button type="button">确认采用</button></div></article>
        </aside>
      </section>
    </main>

    <script src="story-forge-workspace-v0.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Run the structural test**

Run: `npm test -- --run tests/unit/workspace-v0.test.ts`

Expected: PASS for the two approved views, brand asset, and required content.

- [ ] **Step 3: Commit the semantic structure**

```powershell
git add docs/prototypes/story-forge-workspace-v0.html
git commit -m "feat: add workspace v0 structure"
```

### Task 3: Add the confirmed visual system and responsive layout

**Files:**
- Modify: `tests/unit/workspace-v0.test.ts`
- Create: `docs/prototypes/story-forge-workspace-v0.css`

- [ ] **Step 1: Extend the test with visual-system constraints**

Add this test inside the existing `describe` block:

```ts
  it("uses the confirmed tokens and responsive constraints without gradients", async () => {
    const css = await readFile(`${prototypeRoot}/story-forge-workspace-v0.css`, "utf8");

    expect(css).toContain("--paper: #f6f3ec");
    expect(css).toContain("--ink: #1d1d1b");
    expect(css).toContain("--forest: #315947");
    expect(css).toContain("--gold: #a77a2b");
    expect(css).toContain("--indigo: #536a8a");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("min-height: 44px");
    expect(css).not.toMatch(/(?:linear|radial|conic)-gradient/i);
  });
```

- [ ] **Step 2: Run the test and verify the stylesheet is missing**

Run: `npm test -- --run tests/unit/workspace-v0.test.ts`

Expected: one PASS and one FAIL with `ENOENT` for `story-forge-workspace-v0.css`.

- [ ] **Step 3: Create the complete stylesheet**

```css
:root {
  --paper: #f6f3ec; --paper-deep: #eee9df; --surface: #fffdf8; --surface-translucent: rgb(255 253 248 / 88%);
  --ink: #1d1d1b; --brand-ink: #101512; --muted: #706c64; --line: #d8d2c7;
  --forest: #315947; --forest-deep: #173c34; --forest-active: #243f35; --forest-line: #48665b;
  --forest-text: #eff2ed; --forest-text-soft: #c5d0ca; --forest-muted: #aebbb5;
  --gold: #a77a2b; --gold-soft: #f4ecd9; --gold-bright: #f0c66e; --gold-line: #d7c6a1;
  --indigo: #536a8a; --oxide: #a54f3f;
  --serif: "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif;
  --sans: "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
}
* { box-sizing: border-box; letter-spacing: 0; }
html, body { min-height: 100%; }
body { margin: 0; background: var(--paper-deep); color: var(--ink); font: 14px/1.5 var(--sans); }
button, input { font: inherit; }
button { min-height: 44px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); color: var(--ink); padding: 0 14px; cursor: pointer; }
button:hover, button:focus-visible { border-color: var(--gold); }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
h1, h2, h3, p { margin: 0; text-wrap: pretty; }
.prototype-toolbar { min-height: 64px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; border-bottom: 1px solid var(--line); background: var(--surface); padding: 8px 20px; }
.prototype-brand, .rail-brand { display: flex; align-items: center; gap: 10px; }
.prototype-brand img { width: 38px; height: 38px; object-fit: contain; background: var(--brand-ink); }
.prototype-brand strong, .prototype-brand small, .rail-brand span, .rail-brand small { display: block; }
.prototype-brand small, .rail-brand small { color: var(--muted); font-size: 11px; }
.segmented { display: flex; border: 1px solid var(--line); padding: 3px; }
.segmented button { min-height: 34px; border: 0; background: transparent; }
.segmented button.active { background: var(--forest); color: var(--forest-text); }
.density-toggle { justify-self: end; min-height: 36px; }
.prototype-frame { min-height: calc(100vh - 64px); padding: 16px; }
.workspace-view { min-height: calc(100vh - 96px); display: grid; grid-template-columns: 216px minmax(0, 1fr); border: 1px solid var(--line); background: var(--paper); }
.workspace-view[hidden] { display: none; }
.product-rail { min-height: 100%; display: flex; flex-direction: column; border-right: 1px solid var(--forest-line); background: var(--forest-deep); color: var(--forest-text); padding: 18px 12px; }
.rail-brand { padding: 0 8px 18px; border-bottom: 1px solid var(--forest-line); font-family: var(--serif); font-size: 16px; }
.rail-brand img { width: 34px; height: 34px; object-fit: contain; }
.rail-brand small { color: var(--forest-muted); font: 10px var(--sans); }
.product-rail nav { display: grid; gap: 4px; margin-top: 18px; }
.product-rail nav a, .product-rail nav > span { color: var(--forest-text-soft); text-decoration: none; padding: 10px 12px; }
.product-rail nav > span { padding-bottom: 3px; color: var(--forest-muted); font-size: 10px; text-transform: uppercase; }
.product-rail nav a.active { background: var(--forest-active); color: var(--gold-bright); box-shadow: inset 2px 0 var(--gold); }
.product-rail > p { margin-top: auto; border-top: 1px solid var(--forest-line); padding: 16px 10px 0; color: var(--forest-text-soft); }
.product-rail > p strong, .product-rail > p span { display: block; }
.product-rail > p strong { color: var(--gold-bright); font-size: 12px; }
.product-rail > p span { margin-top: 5px; font-size: 11px; }
.projects-main, .studio-main { min-width: 0; }
.context-bar { min-height: 60px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid var(--line); padding: 0 24px; background: var(--surface-translucent); }
.context-bar strong { font-family: var(--serif); }
.context-bar .sync-state { margin-left: auto; color: var(--forest); }
.continue-band { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, .7fr); border-bottom: 1px solid var(--line); }
.continue-copy { padding: 36px 40px; }
.section-label { color: var(--gold); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.continue-copy h1 { margin-top: 10px; font: 400 42px/1.2 var(--serif); }
.continue-copy > p { margin-top: 6px; color: var(--muted); }
.continue-copy dl { display: flex; gap: 32px; margin: 28px 0 24px; }
.continue-copy dl div { border-left: 1px solid var(--line); padding-left: 12px; }
.continue-copy dt { color: var(--muted); font-size: 11px; }
.continue-copy dd { margin: 4px 0 0; font-variant-numeric: tabular-nums; }
.primary-actions { display: flex; gap: 8px; }
.primary-actions button:first-child, .project-index header button, .candidate-actions .active, .candidate div button:last-child { border-color: var(--forest); background: var(--forest); color: var(--forest-text); }
.primary-actions .secondary { background: transparent; color: var(--ink); }
.relation-note { border-left: 1px solid var(--line); padding: 32px 28px; background: var(--gold-soft); }
.relation-note h2 { margin-top: 8px; font: 400 22px/1.45 var(--serif); }
.relation-note ul { display: grid; grid-template-columns: repeat(3, 1fr); list-style: none; margin: 28px 0 18px; padding: 0; }
.relation-note li { border-left: 1px solid var(--gold-line); padding-left: 10px; }
.relation-note b, .relation-note span { display: block; }
.relation-note b { font: 400 22px var(--serif); color: var(--forest); }
.relation-note span, .relation-note p { color: var(--muted); font-size: 11px; }
.project-index { padding: 30px 40px 44px; }
.project-index > header { display: flex; align-items: end; justify-content: space-between; }
.project-index h2 { margin-top: 4px; font: 400 28px var(--serif); }
.search { width: min(100%, 420px); display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 10px; margin: 20px 0 14px; border-bottom: 1px solid var(--ink); padding: 0 0 7px; }
.search span { color: var(--muted); font-size: 11px; }
.search input { min-width: 0; border: 0; outline: 0; background: transparent; }
.project-table { border-top: 1px solid var(--ink); }
.project-row { min-height: 82px; display: grid; grid-template-columns: 60px minmax(260px, 1fr) 100px 90px 70px; align-items: center; gap: 16px; border-bottom: 1px solid var(--line); }
.project-row > b { font: 400 18px var(--serif); color: var(--forest); }
.project-row h3 { font: 400 18px var(--serif); }
.project-row p, .project-row > span { color: var(--muted); font-size: 11px; }
.table-head { min-height: 36px; color: var(--muted); font-size: 10px; text-transform: uppercase; }
.workspace-view[data-view="studio"] { grid-template-columns: 230px minmax(430px, 1fr) 340px; }
.studio-rail nav { overflow: auto; }
.studio-main { background: var(--surface); }
.studio-main .context-bar { justify-content: space-between; }
.context-bar > div span, .context-bar > div strong { display: block; }
.context-bar > div span { color: var(--muted); font-size: 10px; }
.tool-group { display: flex; align-items: center; gap: 8px; }
.tool-group span { margin-right: 6px; color: var(--forest); }
.setup-context { margin: 18px auto 0; width: min(calc(100% - 48px), 760px); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 12px 0; }
.setup-context summary { display: flex; align-items: center; justify-content: space-between; cursor: pointer; list-style: none; }
.setup-context small, .setup-context strong { display: block; }
.setup-context small { color: var(--gold); }
.setup-context b { color: var(--forest); font-size: 11px; }
.setup-context p { margin-top: 12px; color: var(--muted); line-height: 1.7; }
.editor-page { width: min(calc(100% - 48px), 760px); margin: 0 auto; padding: 22px 0 48px; }
.editor-page > header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
.editor-page > header button { min-height: 34px; border: 0; padding: 0 9px; }
.editor-page > header span { color: var(--muted); font-size: 10px; }
.editor-page h1 { margin: 36px 0 22px; font: 400 26px var(--serif); }
.editor-page > p { margin-bottom: 1.3em; font: 400 18px/2 var(--serif); }
.editor-page footer { border-top: 1px solid var(--line); padding-top: 12px; color: var(--muted); font-size: 11px; text-align: right; }
.candidate-zone { border-left: 1px solid var(--line); background: var(--paper); padding: 26px 18px; }
.candidate-zone h2 { margin: 6px 0; font: 400 24px var(--serif); }
.candidate-zone header p, .candidate small { color: var(--muted); font-size: 11px; }
.candidate-actions { display: flex; gap: 6px; margin: 20px 0; border-bottom: 1px solid var(--line); padding-bottom: 14px; }
.candidate-actions button { min-height: 36px; }
.candidate { border-top: 1px solid var(--line); padding: 16px 0; }
.candidate > span { color: var(--gold); font-size: 10px; }
.candidate > p { margin: 10px 0; font: 400 15px/1.8 var(--serif); }
.candidate small { display: block; }
.candidate div { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
.compact .continue-copy { padding-block: 24px; }
.compact .project-row { min-height: 64px; }
.compact .editor-page > p { line-height: 1.75; }
@media (max-width: 1000px) {
  .workspace-view[data-view="studio"] { grid-template-columns: 190px minmax(0, 1fr); }
  .candidate-zone { grid-column: 2; border-top: 1px solid var(--line); border-left: 0; }
}
@media (max-width: 760px) {
  .prototype-toolbar { grid-template-columns: 1fr auto; padding: 8px 12px; }
  .prototype-brand small, .density-toggle { display: none; }
  .segmented { justify-self: end; }
  .prototype-frame { padding: 0; }
  .workspace-view, .workspace-view[data-view="studio"] { grid-template-columns: 1fr; border: 0; }
  .product-rail { min-height: auto; border-right: 0; padding: 10px 12px; }
  .product-rail nav, .product-rail > p { display: none; }
  .rail-brand { border: 0; padding: 0; }
  .context-bar { min-height: 56px; padding: 0 16px; }
  .continue-band { grid-template-columns: 1fr; }
  .continue-copy, .project-index { padding: 24px 16px; }
  .continue-copy h1 { font-size: 32px; }
  .continue-copy dl { gap: 16px; }
  .relation-note { border-top: 1px solid var(--line); border-left: 0; padding: 22px 16px; }
  .project-index > header { align-items: center; }
  .project-row { grid-template-columns: 38px minmax(0, 1fr) 64px; gap: 10px; padding: 12px 0; }
  .project-row > span:first-of-type, .project-row > span:last-of-type, .table-head { display: none; }
  .workspace-view[data-view="studio"] .context-bar { align-items: center; }
  .tool-group button:first-of-type { display: none; }
  .setup-context, .editor-page { width: calc(100% - 32px); }
  .editor-page > p { font-size: 17px; line-height: 1.9; }
  .candidate-zone { grid-column: 1; padding: 22px 16px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
```

- [ ] **Step 4: Run the visual-system test**

Run: `npm test -- --run tests/unit/workspace-v0.test.ts`

Expected: both tests PASS.

- [ ] **Step 5: Commit the design system**

```powershell
git add tests/unit/workspace-v0.test.ts docs/prototypes/story-forge-workspace-v0.css
git commit -m "feat: style workspace v0"
```

### Task 4: Add view and density interactions

**Files:**
- Modify: `tests/unit/workspace-v0.test.ts`
- Create: `docs/prototypes/story-forge-workspace-v0.js`

- [ ] **Step 1: Extend the test with interaction-source constraints**

Add this test inside the existing `describe` block:

```ts
  it("switches views and density without iframe-hostile scrolling", async () => {
    const script = await readFile(`${prototypeRoot}/story-forge-workspace-v0.js`, "utf8");

    expect(script).toContain("data-view-target");
    expect(script).toContain("data-density-toggle");
    expect(script).toContain("document.body.classList.toggle(\"compact\"");
    expect(script).not.toContain("scrollIntoView");
  });
```

- [ ] **Step 2: Run the test and verify the script is missing**

Run: `npm test -- --run tests/unit/workspace-v0.test.ts`

Expected: two PASS and one FAIL with `ENOENT` for `story-forge-workspace-v0.js`.

- [ ] **Step 3: Create the interaction script**

```js
const viewButtons = document.querySelectorAll("[data-view-target]");
const views = document.querySelectorAll("[data-view]");
const densityToggle = document.querySelector("[data-density-toggle]");

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.getAttribute("data-view-target");
    views.forEach((view) => { view.hidden = view.getAttribute("data-view") !== target; });
    viewButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
  });
});

densityToggle.addEventListener("click", () => {
  const compact = document.body.classList.toggle("compact");
  densityToggle.setAttribute("aria-pressed", String(compact));
  densityToggle.textContent = compact ? "舒展密度" : "紧凑密度";
});
```

- [ ] **Step 4: Run targeted and project verification**

Run: `npm test -- --run tests/unit/workspace-v0.test.ts`

Expected: three tests PASS.

Run: `npm run typecheck`

Expected: exit code 0 with no TypeScript errors.

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 5: Run the web-design pre-delivery inspection**

Inspect the completed files and confirm:

- Both views use only the declared color tokens.
- The prototype contains no gradient, nested decorative cards, fake metrics, or unrelated content.
- All buttons have visible focus states and mobile touch targets are at least 44px.
- The logo path resolves from the HTML file.
- The studio preserves the explicit “confirm before changing prose” message.
- The project dashboard does not expose the prior `加载 / 失败 / 空状态` developer switcher.

- [ ] **Step 6: Commit the completed v0**

```powershell
git add tests/unit/workspace-v0.test.ts docs/prototypes/story-forge-workspace-v0.js
git commit -m "feat: complete workspace v0 controls"
```

### Task 5: Deliver the v0 checkpoint

**Files:**
- Verify: `docs/prototypes/story-forge-workspace-v0.html`

- [ ] **Step 1: Confirm the final diff is limited to the v0**

Run: `git diff HEAD~3 --stat`

Expected: only the three prototype files and `tests/unit/workspace-v0.test.ts` are listed.

- [ ] **Step 2: Provide the local artifact link**

Deliver the absolute path `C:\Users\babaerz\Downloads\story forge\story-forge-mvp\docs\prototypes\story-forge-workspace-v0.html` and ask the user to review page hierarchy, density, and visual temperature before any production component migration.
