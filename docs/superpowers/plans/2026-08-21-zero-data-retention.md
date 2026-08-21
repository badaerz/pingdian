# Zero Data Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce browser-only user data storage, provide an explicit local-data purge action, and document/test the boundary without weakening public knowledge retrieval or the defense demo.

**Architecture:** Remove the browser user-sync lifecycle from `StoryProvider`; keep local StoryStore/training persistence and add an IndexedDB deletion helper. Make the browser Supabase boundary return `null` permanently, while server-side public RAG remains unchanged. Add no-store response headers to user-content API routes and update product documentation/UI.

**Tech Stack:** Next.js App Router, React, TypeScript, localStorage, IndexedDB, Vitest, Testing Library.

---

### Task 1: Lock the policy with failing tests

**Files:**
- Create: `tests/unit/zero-retention.test.ts`
- Modify: `tests/components/story-provider.test.tsx`
- Modify: `tests/components/training-settings.test.tsx`

- [ ] Add tests asserting `createSupabaseBrowserClient()` is `null` even when environment values exist, API response helpers expose `no-store`, and the settings surface exposes local-only copy and a purge control.
- [ ] Add a provider test that creates a user project and training attempt, invokes `clearLocalUserData`, and verifies app localStorage keys are removed/reset.
- [ ] Run the focused tests and confirm they fail for the missing policy/purge behavior.

### Task 2: Remove browser cloud retention

**Files:**
- Modify: `src/lib/supabase/browser.ts`
- Modify: `src/providers/story-provider.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/knowledge/knowledge-workspace.tsx`

- [ ] Make the browser Supabase factory return `null` unconditionally and remove its browser client dependency.
- [ ] Delete anonymous auth, project sync, AI-run sync, remote training hydration/backfill, pending-clear retry state, and related refs from `StoryProvider`; preserve local project/training behavior and expose `syncStatus: "disabled"`.
- [ ] Add `clearLocalUserData(): Promise<void>` to the Story context; clear app localStorage keys, delete the asset IndexedDB database, reset in-memory state, and keep built-in demo cases.
- [ ] Change shell/knowledge wording so “本地保存/公开知识检索” is explicit and no path suggests user cloud synchronization.
- [ ] Run focused provider and component tests until green.

### Task 3: Make generated assets and APIs transient

**Files:**
- Modify: `src/lib/assets/indexed-db.ts`
- Modify: `src/app/api/ai/route.ts`
- Modify: `src/app/api/generate/route.ts`
- Modify: `src/app/api/assets/generate/route.ts`
- Modify: `src/app/api/assets/download/route.ts`
- Modify: `src/app/api/assets/capabilities/route.ts`
- Modify: `src/app/api/knowledge/search/route.ts`

- [ ] Add an idempotent `clearAssetBlobs()` helper that deletes `story-forge-assets` and resolves safely when IndexedDB is unavailable.
- [ ] Return `Cache-Control: no-store` on successful and error JSON responses for these routes without logging request bodies.
- [ ] Run API route and asset tests, adding header assertions where the route contract is already covered.

### Task 4: Update user-facing policy and current PRD

**Files:**
- Modify: `src/components/settings/settings-workspace.tsx`
- Modify: `docs/supabase-setup.md`
- Modify: `docs/PRD_v1.1_current.md`
- Modify: `README.md`

- [ ] Add local-only privacy copy, site-data clearing explanation, and a confirmation dialog for “清除本地创作数据”.
- [ ] Rewrite Supabase setup as public knowledge/RAG-only; remove anonymous auth and user table synchronization instructions.
- [ ] Update PRD data flow, privacy NFR, acceptance matrix, test counts, demo script and known limits to reflect zero retention.
- [ ] Update README environment/setup guidance and explicitly distinguish site-data clearing from cache clearing.

### Task 5: Full verification

- [ ] Run `npm.cmd test -- --run` and confirm all tests pass.
- [ ] Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
- [ ] Run locked-mode core E2E and inspect the settings page in a fresh browser context for local-only copy and purge behavior.
- [ ] Regenerate the PRD DOCX if the repository script exists, then run its structural check; report LibreOffice/render limitations honestly.
