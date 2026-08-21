# Story Forge Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the user-document overwrite regression, align acceptance tests with immutable defense cases, and produce a secure, low-cost, rollback-ready deployment candidate.

**Architecture:** Keep user works browser-only. Deploy a standalone Next.js server behind Nginx, with server-side provider secrets, request budgets, deterministic fallbacks, and a separate defense-locked build profile. Do not add a user database or cloud synchronization.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Playwright, Docker, Nginx

---

### Task 1: Preserve user prose during hydration

**Files:**
- Modify: `tests/components/studio-save-race.test.tsx`
- Modify: `src/components/studio/prose-editor.tsx`

- [ ] Add a regression test that hydrates a routed user project after the editor first rendered a read-only defense case and asserts the old defense prose is never emitted through `onChange`.
- [ ] Run the focused test and confirm it fails by receiving the defense prose after the editable transition.
- [ ] Prevent programmatic editable/content synchronization from emitting a user edit while keeping real editor updates unchanged.
- [ ] Run the focused test and the browser reload reproduction until both retain the user marker after 700 ms.

### Task 2: Align acceptance fixtures with immutable defense cases

**Files:**
- Modify: `tests/components/studio-save-race.test.tsx`
- Modify: `tests/components/candidate-panel-chapter-scope.test.tsx`
- Modify: `tests/components/studio-flow.test.tsx`
- Modify: `tests/e2e/core-flow.spec.ts`
- Modify: `tests/e2e/responsive.spec.ts`

- [ ] Create user projects in tests that exercise editing, candidate adoption, chapter switching, and project switching.
- [ ] Keep dedicated assertions proving both built-in cases remain read-only.
- [ ] Open the collaboration drawer before mobile locked-mode candidate assertions.
- [ ] Run the previously failing component files and E2E cases and confirm they pass.

### Task 3: Add application security and budget boundaries

**Files:**
- Create: `src/lib/http/request-budget.ts`
- Create: `tests/unit/request-budget.test.ts`
- Create: `src/app/api/health/route.ts`
- Create: `tests/unit/health-route.test.ts`
- Modify: `src/app/api/ai/route.ts`
- Modify: `next.config.ts`

- [ ] Add failing tests for per-client minute limits, daily global limits, Retry-After metadata, and a non-secret health response.
- [ ] Implement the smallest in-memory single-instance request budget required by those tests and apply it to `/api/ai`.
- [ ] Add production-safe response headers, disable the framework signature, and enable standalone output.
- [ ] Verify API responses remain `no-store` and locked mode never calls an external provider.

### Task 4: Package the low-cost deployment

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `deploy/docker-compose.yml`
- Create: `deploy/nginx/story-forge.conf`
- Create: `.env.production.example`
- Create: `docs/deployment.md`
- Modify: `README.md`

- [ ] Build a non-root multi-stage image from Next.js standalone output.
- [ ] Add an Nginx reverse proxy with TLS placeholders, request limits, timeouts, security headers, and no request-body logging.
- [ ] Document Beijing-region hosting, ICP prerequisites, secret placement, smoke checks, immutable releases, and one-command rollback.
- [ ] Validate configuration syntax where local tooling exists and document any unavailable validation.

### Task 5: Verify and freeze the release candidate

**Files:**
- Modify: `.gitignore` only for generated caches or test artifacts created by this workflow.

- [ ] Run `npm.cmd run verify` from a clean production environment.
- [ ] Run the full Playwright suite in normal and defense-locked production modes.
- [ ] Run production dependency audit, secret-pattern scan, `git diff --check`, and HTTP header/health smoke checks.
- [ ] Review the release diff so generated caches, secrets, local test data, and unrelated input files are excluded.
- [ ] Commit the verified release scope and create an annotated release-candidate tag without pushing or deploying.
