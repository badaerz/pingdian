# Story Forge Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a competition-grade Story Forge marketing homepage and redesign every existing P0/P1 workspace without changing its business behavior.

**Architecture:** Keep the existing Next.js App Router, StoryProvider, workspace hooks, handlers, data models and routes. Add a presentation-only marketing homepage and a `/projects` entry for the existing dashboard, then evolve each workspace through semantic wrapper classes, scoped CSS and the supplied Logo asset. The knowledge graph receives a dedicated dark canvas theme and selected-node feedback while retaining Cytoscape and the mobile list alternative.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS, Next Image/Link, Lucide React, Cytoscape, Recharts, Vitest, Testing Library, Playwright.

---

## File map

- Create `src/components/marketing/marketing-home.tsx`: brand homepage with real links only.
- Create `src/app/projects/page.tsx`: route that renders the existing project dashboard.
- Create `src/app/marketing.css`: homepage-only visual system, imported by the root stylesheet.
- Create `src/app/workspaces.css`: cross-workspace overhaul rules, imported by the root stylesheet.
- Modify `src/app/page.tsx`: render the marketing homepage instead of the dashboard.
- Modify `src/app/layout.tsx`: update product metadata.
- Modify `src/components/layout/app-shell.tsx`: render marketing pages without the workspace chrome and move dashboard navigation to `/projects`.
- Modify `src/components/projects/project-dashboard.tsx`: presentation wrappers and copy only; preserve all state and event handlers.
- Modify `src/components/studio/*.tsx`: presentation wrappers/classes only; preserve editor, candidates, snapshots, export and rollback behavior.
- Modify `src/components/analysis/*.tsx`: presentation wrappers/classes and graph visual styles; preserve evidence and AI actions.
- Modify `src/components/knowledge/knowledge-workspace.tsx`: graph stage, legend and inspector layout; preserve filters, source links and selection.
- Modify `src/components/training/training-workspace.tsx`: workshop layout and feedback hierarchy; preserve submission and reevaluation.
- Modify `src/components/projects/new-project-form.tsx` and `src/components/settings/settings-workspace.tsx`: display copy/classes only.
- Modify `src/app/globals.css`: shared design tokens, resets, navigation, components and responsive primitives.
- Copy `C:\Users\babaerz\Downloads\logo.png` to `public/brand/story-forge-logo.png` and create cropped derivatives under `public/brand/` using lossless tooling.
- Modify component and E2E tests to cover marketing navigation and the relocated project dashboard.

### Task 1: Lock route and brand contracts with tests

**Files:**
- Create: `tests/components/marketing-home.test.tsx`
- Modify: `tests/components/app-shell.test.tsx`
- Modify: `tests/e2e/core-flow.spec.ts`
- Modify: `tests/e2e/responsive.spec.ts`

- [ ] **Step 1: Add failing marketing page tests**

Test that `MarketingHome` exposes `Story Forge（故事锻造）`, the English and Chinese slogans, `进入工作台` linking to `/projects`, `查看答辩案例` linking to `/project/demo/studio`, and links to analysis, knowledge and training.

- [ ] **Step 2: Update AppShell expectations**

Render the shell at a mocked `/projects` pathname and assert that `项目桌面` points to `/projects`, while the logo still links to `/` with accessible name `Story Forge 首页`.

- [ ] **Step 3: Update E2E route expectations**

Change the dashboard route from `/` to `/projects`, add `/` with heading `以叙事智能，淬炼文学匠心`, and update the dashboard state recovery flow to visit `/projects`.

- [ ] **Step 4: Run tests and verify the expected failure**

Run `npm.cmd test -- --run tests/components/marketing-home.test.tsx tests/components/app-shell.test.tsx`.

Expected: FAIL because `MarketingHome` and `/projects` behavior do not exist.

### Task 2: Prepare the supplied brand asset

**Files:**
- Create: `public/brand/story-forge-logo.png`
- Create: `public/brand/story-forge-emblem.png`
- Create: `public/brand/story-forge-wordmark.png`
- Modify: `brand-spec.md`

- [ ] **Step 1: Copy the original without recompression**

Copy the supplied PNG as `story-forge-logo.png`; record its checksum and dimensions.

- [ ] **Step 2: Derive transparent/cropped variants**

Use an image operation that preserves the original colors to crop the emblem and wordmark. Do not redraw the asset. Inspect each output at 1x and 2x sizes.

- [ ] **Step 3: Update brand documentation**

Record the final product name, slogans, source file and three public paths in `brand-spec.md`.

- [ ] **Step 4: Verify asset readability**

Open all three images and confirm the emblem is legible at 40px and the full logo remains sharp at desktop hero size.

### Task 3: Implement the marketing homepage and project route

**Files:**
- Create: `src/components/marketing/marketing-home.tsx`
- Create: `src/app/projects/page.tsx`
- Create: `src/app/marketing.css`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Implement the minimal route structure**

Render `<MarketingHome />` at `/` and `<ProjectDashboard />` at `/projects`; use Next `<Link>` for every route transition and `<Image>` for the local Logo.

- [ ] **Step 2: Build the dual-domain hero**

Add the brand header, slogan, the two primary actions, and a semantic knowledge graph visual built from real capability labels: `人物`, `世界`, `证据`, `技法`. The visual is decorative and must not fake metrics.

- [ ] **Step 3: Build the real capability sections**

Add sections for creation loop, digital humanities, training and two real demo projects. Every card links to an existing route; do not add pricing, testimonials, collaboration or unsupported features.

- [ ] **Step 4: Add responsive and reduced-motion styling**

Create desktop asymmetric hero, tablet stacked domains, mobile single-column flow, 44px touch targets and reduced-motion overrides.

- [ ] **Step 5: Run focused tests**

Run `npm.cmd test -- --run tests/components/marketing-home.test.tsx tests/components/app-shell.test.tsx`.

Expected: PASS.

### Task 4: Redesign the workspace shell and project dashboard

**Files:**
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/projects/project-dashboard.tsx`
- Create: `src/app/workspaces.css`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Preserve behavior with a shell test**

Add assertions for `/projects`, `/project/demo/studio`, `/project/demo/analysis`, `/knowledge`, `/training`, `/settings`, mobile menu button and sync label.

- [ ] **Step 2: Separate marketing and workspace chrome**

When `pathname === "/"`, return the marketing child without top bar, side navigation or mobile navigation. All other paths keep the existing handlers and status data.

- [ ] **Step 3: Upgrade navigation hierarchy**

Use the cropped emblem, bilingual wordmark, active rail and clearer project context. Keep href values, accessible labels and mobile close behavior unchanged except `/projects` becoming the project desktop link.

- [ ] **Step 4: Upgrade dashboard composition**

Retain query, demo-state switch, dialogs, delete/reset handlers and project links. Recompose the active project as `继续锻造`, expose real module shortcuts and preserve the searchable project rows.

- [ ] **Step 5: Run shell/dashboard tests**

Run `npm.cmd test -- --run tests/components/app-shell.test.tsx` and the relevant dashboard tests.

Expected: PASS.

### Task 5: Redesign the creation studio without touching editor behavior

**Files:**
- Modify: `src/components/studio/studio-workspace.tsx`
- Modify: `src/components/studio/story-navigator.tsx`
- Modify: `src/components/studio/setup-panel.tsx`
- Modify: `src/components/studio/prose-editor.tsx`
- Modify: `src/components/studio/candidate-panel.tsx`
- Modify: `src/components/studio/version-drawer.tsx`
- Modify: `src/app/workspaces.css`

- [ ] **Step 1: Add/retain the candidate boundary test**

Verify generate -> candidate -> confirmation dialog -> adopted prose remains the only mutation path.

- [ ] **Step 2: Add presentation classes without changing handlers**

Keep every state hook, callback, export action and prop signature. Introduce clear classes for narrative rail, manuscript sheet, floating tools, candidate atelier and version ledger.

- [ ] **Step 3: Style the paper manuscript and dark assistant domain**

Use the paper surface for setup/editor, ink-green rail for navigation, and a restrained dark assistant panel. Ensure editable text contrast and selection remain readable.

- [ ] **Step 4: Preserve mobile access**

Keep the existing `打开候选区` button and drawer state; ensure export and version controls wrap instead of overflowing.

- [ ] **Step 5: Run focused tests**

Run `npm.cmd test -- --run tests/components/setup-panel.test.tsx` and `npm.cmd run test:e2e -- tests/e2e/core-flow.spec.ts`.

Expected: candidate boundary and responsive editor paths pass.

### Task 6: Redesign literary diagnosis and evidence surfaces

**Files:**
- Modify: `src/components/analysis/analysis-workspace.tsx`
- Modify: `src/components/analysis/story-curves.tsx`
- Modify: `src/components/analysis/evidence-drawer.tsx`
- Modify: `src/app/workspaces.css`

- [ ] **Step 1: Lock evidence behavior**

Retain the existing test that clicking `证据 E1` opens `原文证据` with `用户文本`.

- [ ] **Step 2: Recompose diagnosis hierarchy**

Keep `runTask`, status/error recovery, dimensions, tabs and explain task unchanged. Add presentation wrappers for diagnosis score rail, evidence actions, visualization studio and mentor section.

- [ ] **Step 3: Style curves and evidence**

Use semantic copper/indigo/oxide colors for plot, knowledge and conflict. Do not fabricate scores or change chart data.

- [ ] **Step 4: Run analysis tests**

Run `npm.cmd test -- --run tests/components/analysis-flow.test.tsx`.

Expected: PASS.

### Task 7: Build the enhanced knowledge graph stage

**Files:**
- Modify: `src/components/analysis/character-graph.tsx`
- Modify: `src/components/knowledge/knowledge-workspace.tsx`
- Modify: `src/app/workspaces.css`
- Modify: `tests/components/knowledge-flow.test.tsx`
- Modify: `tests/e2e/responsive.spec.ts`

- [ ] **Step 1: Add failing visual-state tests**

Assert the knowledge page exposes a visible legend with `作品`, `作者`, `主题`, `技法`, keeps `图谱`/`列表`, and shows `经典文本解构` after selecting a work.

- [ ] **Step 2: Extend CharacterGraph with theme and active node props**

Add optional `variant?: "paper" | "dark"` and `selectedId?: string` props. Preserve the required `graph` and `onSelect` contract. Use props only to select CSS-derived Cytoscape colors and classes.

- [ ] **Step 3: Implement stable graph styling**

For dark knowledge graphs: use type-aware node colors from graph data, copper relations, readable label backplates and one-time selected-node border emphasis. Do not add continuous Cytoscape animations. Keep zoom, fit, graph/list and cleanup behavior.

- [ ] **Step 4: Recompose the knowledge workspace**

Place filters in a compact command rail, the graph on a dark knowledge stage, the legend as a fixed semantic key, and the work deconstruction in a paper inspector. Keep all Supabase/local fallback logic and source links unchanged.

- [ ] **Step 5: Add CSS-only motion**

Animate inspector entry and selected state for 240-320ms; use a single non-looping edge/outline reveal where supported. Disable these transforms under `prefers-reduced-motion`.

- [ ] **Step 6: Verify graph and mobile alternative**

Run `npm.cmd test -- --run tests/components/knowledge-flow.test.tsx` and `npm.cmd run test:e2e -- tests/e2e/responsive.spec.ts`.

Expected: desktop canvas contains visible pixels, mobile list alternative is visible, no horizontal overflow.

### Task 8: Redesign training, new-project and settings pages

**Files:**
- Modify: `src/components/training/training-workspace.tsx`
- Modify: `src/components/projects/new-project-form.tsx`
- Modify: `src/components/settings/settings-workspace.tsx`
- Modify: `src/app/workspaces.css`

- [ ] **Step 1: Lock training behavior**

Keep tests for malformed feedback normalization, submit, feedback, reevaluation and history recording.

- [ ] **Step 2: Recompose training as a three-stage workshop**

Keep every hook/handler and API payload. Add headings/classes for exercise library, practice manuscript and feedback ledger. Feedback remains conditional on a real result.

- [ ] **Step 3: Upgrade new-project and settings presentation**

Keep form fields/order/validation/router behavior and settings dialogs/actions. Improve headings, status surfaces and destructive-action contrast only.

- [ ] **Step 4: Run focused tests**

Run `npm.cmd test -- --run tests/components/training-flow.test.tsx tests/components/training-settings.test.tsx`.

Expected: PASS.

### Task 9: Responsive, accessibility and visual acceptance

**Files:**
- Modify: `src/app/marketing.css`
- Modify: `src/app/workspaces.css`
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/responsive.spec.ts`
- Update: `tests/e2e/screenshots/*.png`

- [ ] **Step 1: Audit interactive states**

Confirm hover, focus-visible, active, disabled, loading, empty and error states on all primary controls; keep native tab order and labels.

- [ ] **Step 2: Audit responsive layouts**

Verify desktop, tablet and mobile widths for marketing, projects, new project, studio, analysis, knowledge, training and settings. Fix overflow by reflowing; do not shrink essential text below the current readable scale.

- [ ] **Step 3: Audit reduced motion**

Verify `prefers-reduced-motion: reduce` disables entry translation, graph emphasis transitions and decorative motion.

- [ ] **Step 4: Run E2E and inspect screenshots**

Run `npm.cmd run test:e2e`. Inspect every generated desktop/mobile screenshot against the supplied reference assets and repair visual hierarchy, clipping or contrast regressions.

Expected: all configured scenarios pass.

### Task 10: Full regression and handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README brand and route descriptions**

Describe `/` as the Story Forge marketing homepage and `/projects` as the real project workspace. Preserve existing setup, Supabase and DeepSeek guidance.

- [ ] **Step 2: Run full verification**

Run, in order:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
npm.cmd run test
npm.cmd run test:e2e
```

Expected: all commands exit successfully; report exact test counts from fresh output.

- [ ] **Step 3: Review the diff boundary**

Confirm no API, provider, state, Supabase schema or persistence files changed except where pre-existing user work already exists. Confirm no secret values appear in output or tracked files.

- [ ] **Step 4: Report without committing or deploying**

Separate `已验证`, `尚未验证` and `需要用户参与`. Do not commit, push or deploy.
