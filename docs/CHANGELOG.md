# AI Social Media Studio — Changelog

> **Branch:** `master`
> **Repository:** `rkjrohitjaiswal/Social-Media-Studio`
> **Strict Notice:** Every meaningful change to this project must be appended here after verification. Do NOT invent, speculate, or back-fill entries. Only record changes that have been confirmed.

---

## Purpose

This file is the chronological record of all significant changes made to the **AI Social Media Studio** project. It is intended for use by:

- Engineering teams tracking what changed, why, and when.
- Future AI coding agents that must understand the project's evolution before making further changes.
- Reviewers auditing the integrity of the codebase over time.

**This changelog supplements `docs/PROJECT_MEMORY.md`.** `docs/PROJECT_MEMORY.md` describes *what the project currently is*. This file records *what changed and when*.

**Change Recording Policy:**
- Entries are added in reverse-chronological order within each section (newest first).
- Only confirmed, verified changes are recorded.
- No speculative, planned, or unverified changes are recorded here.
- Future planned work belongs in `docs/PROJECT_MEMORY.md` §25 (Future Cleanup) and implementation plans, not here.

---

## Change Log

### 2026-09-23 — Phase 8B: Prisma Schema Alignment

| Field | Detail |
| :--- | :--- |
| **Change** | Synchronized `packages/database/prisma/schema.prisma` with the 6 columns already present in the live database via migration `1_add_permanent_and_monthly_free_credits`. Added `permanentCreditsTotal`, `permanentCreditsUsed`, `monthlyCreditsAllowance`, `monthlyCreditsUsed`, `monthlyCycleStart`, and `lastMonthlyReset` to the `UserUsage` model, matching exact SQL types, defaults, and nullability. Ran `prisma generate` to regenerate Prisma Client. Removed the `?? fallback` type workarounds in `usage-service.ts` that existed only because Prisma previously did not recognize those columns. Updated `StoredUserUsage` interface to reflect the four `Int NOT NULL` fields as required `number` (not optional). |
| **Reason** | Migration `1_add_permanent_and_monthly_free_credits` had been applied to the live database but the schema model was never updated to include the new columns. This forced `usage-service.ts` to use runtime `?? fallback` patterns (`dbRecord.permanentCreditsTotal ?? dbRecord.freeCreditsTotal` etc.) which were type-unsafe and masked missing Prisma Client typing. The schema alignment eliminates those workarounds and ensures full Prisma Client type safety. |
| **Affected Files** | `packages/database/prisma/schema.prisma` (modified — added 6 fields to `UserUsage` model)<br>`apps/api/src/services/usage-service.ts` (modified — removed `??` fallbacks, updated `StoredUserUsage` interface) |
| **Behavior Impact** | None. The database columns already existed. This is a schema model alignment only. No database migrations created or executed. No application logic changed. Credit calculation, cycle resets, and consumption remain identical. |
| **Verification** | `npx prisma migrate status`: **"Database schema is up to date!"** (2 migrations, both applied).<br>`npx prisma generate`: **exit code 0**, Prisma Client v7.9.1 regenerated.<br>`npm run typecheck --workspace=@ai-social/api`: **exit code 0, 0 TypeScript errors**.<br>`npm run typecheck --workspace=@ai-social/web`: **exit code 0, 0 TypeScript errors**.<br>`npx vitest run`: **64 test files, 688 passed (100%)**. |
| **Commit / Reference** | Not yet committed. See `docs/archive/PHASE_8B_PRISMA_SCHEMA_ALIGNMENT_2026-09-23.md` for detailed report. |
| **Result** | Prisma schema fully aligned with live database. `UserUsage` Prisma Client now returns all 8 credit fields with correct types. All TypeScript workarounds removed. Full test suite green. |

---

### 2026-09-23 — Evidence-Based Documentation Audit & Alignment

| Field | Detail |
| :--- | :--- |
| **Change** | Performed a full fresh evidence-based audit of the entire repository source code, schema, migrations, routes, integrations, and configurations. Synchronized all active documentation (`docs/PROJECT_MEMORY.md`, `docs/ARCHITECTURE.md`, `docs/AI_AGENT_CONTEXT.md`, `DEPLOYMENT.md`, `docs/deployment.md`) with actual verified codebase reality. Generated full audit report at `docs/archive/DOCUMENTATION_AUDIT_2026-09-23.md`. |
| **Reason** | Ensure documentation reflects ground truth: verified 45 Next.js App Router routes (correcting outdated 31-route list), mapped 32 Express route controllers with mounted paths, recorded Prisma schema model count (50 models) and documented migration 1 column discrepancy, updated test counts (64 files, 688 passing tests), verified Phase 8A auth hardening, and confirmed provider implementation statuses. |
| **Affected Files** | `docs/PROJECT_MEMORY.md` (updated routes, schema, test counts, finding statuses)<br>`docs/ARCHITECTURE.md` (updated route tree, controller paths, migration columns, test counts)<br>`docs/AI_AGENT_CONTEXT.md` (corrected marketing routes, test counts)<br>`DEPLOYMENT.md` (added mandatory Supabase production variables)<br>`docs/deployment.md` (added unified encryption key)<br>`docs/CHANGELOG.md` (added audit entry)<br>`docs/archive/DOCUMENTATION_AUDIT_2026-09-23.md` (new — comprehensive audit report) |
| **Behavior Impact** | None. Documentation audit and updates only. No application source code, Prisma schemas, migrations, or dependencies modified. |
| **Verification** | `npx vitest run`: **64 test files, 688 passed (100%)**.<br>`npm run typecheck --workspace=@ai-social/api`: **exit code 0**.<br>`npm run typecheck --workspace=@ai-social/web`: **exit code 0**. |
| **Result** | Documentation 100% synchronized with source code reality. Comprehensive audit report published. |

---

### 2026-09-23 — Phase 8A: Production Authentication Hardening

| Field | Detail |
| :--- | :--- |
| **Change** | Hardened production authentication boundaries in two backend files. Environment-gated the `x-user-id` header bypass and no-token demo workspace fallback in `middleware/auth.ts` so they are disabled in `NODE_ENV=production`. Enforced strict `SUPABASE_SERVICE_ROLE_KEY` requirement in `apps/api/src/config/supabase.ts` so production cannot silently use the public anon key. Added a 10-test dedicated authentication verification suite. |
| **Reason** | The 2026-09-18 audit (Phase 5 Documentation Verification / Phase 7 Hardening Plan) identified that `x-user-id` header and no-token fallbacks in `auth.ts` could be exploited in production to impersonate users or access protected routes without valid credentials. `supabase.ts` could silently fall back to the anon key as a service credential in production, granting degraded Supabase Admin API access. Phase 8A addresses both HIGH-priority security exposures. |
| **Affected Files** | `apps/api/src/middleware/auth.ts` (modified — added `isProduction` guard, environment-gated `x-user-id` and no-token paths, hardened 401 error schemas)<br>`apps/api/src/config/supabase.ts` (modified — added production enforcement with explicit throw on missing/placeholder `SUPABASE_SERVICE_ROLE_KEY`)<br>`tests/production-auth-hardening.test.ts` (new — 10-test Phase 8A verification suite)<br>`docs/archive/PHASE_8A_AUTH_HARDENING_2026-09-18.md` (new — complete change report)<br>`docs/ARCHITECTURE.md` (updated — Development/Test Bypasses table updated to reflect Phase 8A guard status)<br>`docs/PROJECT_MEMORY.md` (updated — auth bypass section updated to reflect hardening completion) |
| **Behavior Impact** | **Production:** `x-user-id` header is completely ignored. Unauthenticated requests without a Bearer token or admin session cookie receive `401 Unauthorized: Authentication token required`. `SUPABASE_SERVICE_ROLE_KEY` absence causes an immediate startup error. **Development/Test:** All existing bypass mechanisms preserved. Dev test fallbacks (`demo-user-id`, `x-user-id`) continue to work in `NODE_ENV=development` and `NODE_ENV=test`. |
| **Verification** | `npx vitest run tests/production-auth-hardening.test.ts`: **10/10 passed**.<br>`npx vitest run` (full suite): **64 test files, 688 tests, 0 failures**.<br>`npm run typecheck --workspace=@ai-social/api`: **exit code 0, zero TypeScript errors**. |
| **Commit / Reference** | Not yet committed. See `docs/archive/PHASE_8A_AUTH_HARDENING_2026-09-18.md` for detailed verification report. |
| **Result** | Production authentication hardening complete. Both server-side auth bypass vulnerabilities closed. Public anon key elevation in production eliminated. Full test suite green. |

---

### 2026-09-23 — Documentation Reorganization into docs/

| Field | Detail |
| :--- | :--- |
| **Change** | Reorganized repository Markdown documentation into the central `docs/` directory. Moved `PROJECT_MEMORY.md`, `ARCHITECTURE.md`, and `CHANGELOG.md` to `docs/`. Retained `README.md` at repository root. Retained historical phase reports under `docs/archive/`. Updated internal documentation references. |
| **Reason** | Consolidate core project documentation into a standardized, organized directory structure under `docs/`. |
| **Files Moved** | `PROJECT_MEMORY.md` → `docs/PROJECT_MEMORY.md`<br>`ARCHITECTURE.md` → `docs/ARCHITECTURE.md`<br>`CHANGELOG.md` → `docs/CHANGELOG.md` |
| **Files Retained** | `README.md` (repository root)<br>`DEPLOYMENT.md` (repository root)<br>`docs/deployment.md`<br>`docs/archive/*` |
| **Files Updated** | `docs/PROJECT_MEMORY.md` (updated path references)<br>`docs/ARCHITECTURE.md` (updated path references & directory layout)<br>`docs/CHANGELOG.md` (updated path references & added reorganization entry) |
| **Behavior Impact** | None. Documentation reorganization only. No application source code, tests, or configurations modified. |
| **Verification** | Verified file inventory, lack of duplicate files, updated references, and test suite execution (`tests/production-auth-hardening.test.ts` 10/10 passed). |
| **Commit / Reference** | Not yet committed (stopped after verification per instructions). |
| **Result** | Documentation centralized under `docs/`. No duplicate copies exist. |

---

### 2026-09-18 — Phase 5 Documentation Verification

| Field | Detail |
| :--- | :--- |
| **Change** | Performed comprehensive read-only verification of `PROJECT_MEMORY.md`, `CHANGELOG.md`, and `ARCHITECTURE.md` against actual repository code, configurations, schemas, and tests. Updated project documentation to record verified ground-truth findings. |
| **Reason** | Ensure permanent project documentation accurately describes the real codebase, avoiding dangerous assumptions by future AI coding agents and engineering teams. |
| **Audit Scope & Mode** | Strictly read-only audit across all 18 verification areas. No source code was modified, created, moved, renamed, or deleted. No dependencies were changed. No migrations were executed. No production behavior was altered. |
| **Major Discrepancies Discovered** | **HIGH PRIORITY:**<br>1. *Frontend Routes:* Actual App Router page count is 45 (`page.tsx` files). Inferred lists in earlier docs contained nonexistent paths (`/creatives`, `/landing`, etc.) and omitted real studio pages (`/create`, `/published`, etc.).<br>2. *Prisma Schema/Migration Mismatch:* Migration `1_add_permanent_and_monthly_free_credits` added 6 columns (`permanentCreditsTotal`, `permanentCreditsUsed`, `monthlyCreditsAllowance`, `monthlyCreditsUsed`, `monthlyCycleStart`, `lastMonthlyReset`) to `UserUsage`. Active `schema.prisma` was never updated to declare them.<br>3. *Backend Auth Fallbacks:* `x-user-id` header override and `!token` demo workspace fallbacks in `apps/api/src/middleware/auth.ts` lack `NODE_ENV !== "production"` guards.<br><br>**MEDIUM PRIORITY:**<br>4. Runway and Luma video providers are currently stubs throwing `AUTHENTICATION` errors without external HTTP calls.<br>5. Social OAuth callbacks in `routes/integrations.ts` do not perform authorization-code exchange with provider APIs.<br>6. Over 25 environment variables referenced in code are missing from `.env.example`.<br>7. Route controller filenames do not always match registered prefixes (`advisor.ts` mounted at `/api/analytics/advisor`, `campaign-planner.ts` at `/api/campaigns/planner`, `n8n.ts` at `/api/integrations/n8n`).<br><br>**VERIFIED DUPLICATION / LEGACY:**<br>8. API and Web `social-engine` implementations have diverged and are both actively consumed.<br>9. `repurposing-service.ts` (single-post) and `content-repurposing-service.ts` (full-package) have distinct responsibilities and are both consumed.<br>10. `generation-worker.ts` (module) and `generationWorker.ts` (CLI script) serve different execution roles.<br>11. `publishing-worker.ts` (embedded ticker) and `publishingWorker.ts` (standalone script) serve different execution topologies.<br>12. `ui/InstagramIcon.tsx` is byte-for-byte identical to `icons/InstagramIcon.tsx` and has 0 consumers.<br>13. `original-schema.prisma` (98 KB) is completely unreferenced by source code or tooling. |
| **Behavior Impact** | None. Documentation updated only. No code or configuration was changed. No cleanup was performed. |
| **Verification** | `git status --short` confirmed zero tracked source files were modified. |
| **Commit / Reference** | Not yet committed. |
| **Result** | Documentation updated with Section 28 in `PROJECT_MEMORY.md` and Section 26 in `ARCHITECTURE.md`. Discrepancies logged as `STATUS: DOCUMENTED — NOT YET FIXED`. |

---

### 2026-09-18 — Technical Architecture Document Created

| Field | Detail |
| :--- | :--- |
| **Change** | Created `ARCHITECTURE.md` at the repository root. |
| **Reason** | Establish a dedicated, comprehensive technical architecture specification detailing system topology, routing, service layers, schemas, security, and execution models. |
| **File Created** | `ARCHITECTURE.md` (root-level, 916 lines, ~46 KB) |
| **Contents** | 25 sections covering: system overview, high-level architecture, directory layout, frontend architecture, backend architecture, API route organization, domain service layer, database architecture, authentication & authorization, storage architecture, AI provider integration, social platform integrations, content generation workflow, background workers & queues, billing & credit metering, n8n automation, analytics & performance monitoring, environment configuration, testing architecture, branding & design system, security architecture, change management, known legacy items, future target architecture, and current snapshot. |
| **Behavior Impact** | None. Documentation only. No application source code or configuration modified. |
| **Verification** | `git status --short` confirmed zero tracked source files modified. |
| **Commit / Reference** | Not yet committed. |
| **Result** | Permanent technical architecture document established for engineers and AI agents. |

---

### 2026-09-18 — Project Memory Created

| Field | Detail |
| :--- | :--- |
| **Change** | Created `PROJECT_MEMORY.md` at the repository root. |
| **Reason** | The project lacked a permanent, authoritative source of truth for future engineers and AI coding agents. Without it, every new agent or engineer must re-audit the entire codebase from scratch, risking incorrect assumptions about architecture, authentication, billing, and database schemas. |
| **File Created** | `PROJECT_MEMORY.md` (root-level, 484 lines, ~31 KB) |
| **Contents** | 27 sections covering: project identity, architecture diagram, folder structure, frontend routes, backend API layers, Prisma/database schema, authentication tiers, storage pipeline, AI provider matrix, social platform integrations, content generation workflow, billing/credit metering, n8n automation, background workers, deployment architecture, environment variable categories, testing suite, known duplications, critical file registry, branding rules, development rules for AI agents, change management workflow, Firebase migration history, future audit items, and project memory maintenance policy. |
| **Behavior Impact** | None. No source code was modified. No configuration was altered. No packages were installed or removed. |
| **Verification** | `git status --short` confirmed only `PROJECT_MEMORY.md` (untracked) and `scratch/` (untracked) are new. No tracked files were modified. |
| **Commit / Reference** | Not yet committed. |
| **Result** | Permanent project memory document established. Future agents and engineers must read `PROJECT_MEMORY.md` before modifying any code. |

---

### 2026-09-18 — Project Architecture Audit

| Field | Detail |
| :--- | :--- |
| **Change** | Performed a complete read-only architectural and codebase audit of the AI Social Media Studio monorepo. |
| **Reason** | A clean, verified understanding of the existing system was required before any further development, refactoring, or infrastructure changes could be safely planned. |
| **Scope** | Entire repository: root configuration files, `apps/web` (Next.js 16, 60+ route files), `apps/api/src` (server, 32 routes, 30+ services, middleware, workers, queues, integrations), `packages/database` (Prisma schema, 2 migrations), `packages/shared` (Zod schemas, DTOs), `packages/config` (tsconfig), `scripts/`, `tests/` (63 test files), `docs/`. |
| **Audit Mode** | Strictly read-only. No source files were created, modified, moved, renamed, or deleted during the audit. |
| **Behavior Impact** | None. The running system was not affected. No packages were installed or uninstalled. No database was touched. No environment configuration was altered. |
| **Verification** | `git status --short` confirmed the working tree had no modifications to any tracked file. Only `package-lock.json` had a pre-existing leftover unstaged change from a prior Firebase investigation session; this was restored to `HEAD` via `git restore package-lock.json` before the audit was finalized. |
| **Commit / Reference** | No commit. Read-only operation. |
| **Result** | Complete, accurate baseline understanding of the system established. Findings were persisted in `PROJECT_MEMORY.md`. |

---

### 2026-09-18 — `package-lock.json` Restored to HEAD

| Field | Detail |
| :--- | :--- |
| **Change** | Restored `package-lock.json` to the current Git `HEAD` state. |
| **Reason** | A prior Firebase Phase 1 investigation had temporarily installed Firebase packages during prototyping. Although all Firebase source code, routes, tests, environment variables, and `package.json` dependency entries were cleanly reverted, `package-lock.json` retained leftover lockfile entries from the temporary `npm install`. This restore completed the rollback. |
| **Command Run** | `git restore package-lock.json` |
| **Behavior Impact** | None. `package-lock.json` was restored to match the committed `HEAD`. No source code, dependency, or configuration was affected. |
| **Verification** | `git status --short` after restore confirmed only `scratch/` (untracked, not part of the source tree) remained. No tracked file modifications. |
| **Commit / Reference** | Not committed (restore made the file identical to `HEAD`). |
| **Result** | Working tree returned to 100% clean state against `HEAD`. |

---

## Historical Changes

> The following historical changes are documented based on evidence found during the 2026-09-18 read-only audit. Commit SHAs are referenced where known. Precise original dates are not available from the audit alone and have not been invented.

---

### Historical — Firebase Migration Investigation (Abandoned)

| Field | Detail |
| :--- | :--- |
| **Change** | A Firebase Phase 1 migration was prototyped and subsequently fully reverted and abandoned. |
| **What Was Prototyped** | Firebase Admin SDK and Firebase client packages were temporarily installed. Route files (`apps/api/src/routes/firebase-health.ts`), client configuration files (`apps/web/lib/firebase/client.ts`, `apps/web/lib/firebase/index.ts`), server config files (`apps/api/src/config/firebase.ts`), and test files (`tests/firebase-foundation.test.ts`) were temporarily created. Firebase environment variable templates were temporarily added to `.env.example`. |
| **Reversion Status** | FULLY REVERTED. All Firebase source files, routes, packages, and environment templates were removed. `package.json` at root, `apps/api`, and `apps/web` contain no Firebase dependencies. `.env.example` contains no Firebase variables. `apps/api/src/server.ts` contains no Firebase route registration. |
| **Current Architecture** | Supabase (Auth, Storage, PostgreSQL via Prisma) is the sole active backend infrastructure. |
| **Strict Rule** | Firebase must NOT be reintroduced unless explicitly requested by the user and covered by an approved implementation plan. No Firebase migration is pending. |
| **Verification** | Confirmed by `git status --short`, grep across all `package.json` files, and inspection of `apps/api/src/server.ts` and `.env.example` during the 2026-09-18 audit. |

---

### Historical — Credit Metering System

| Field | Detail |
| :--- | :--- |
| **Change** | A two-tier credit system was implemented: permanent signup credits and monthly recurring credits. |
| **Evidence** | Migration `packages/database/prisma/migrations/1_add_permanent_and_monthly_free_credits/migration.sql` exists alongside the baseline migration. |
| **Affected Files** | `packages/database/prisma/migrations/1_add_permanent_and_monthly_free_credits/`, `apps/api/src/services/usage-service.ts`, `packages/database/prisma/schema.prisma`. |
| **Behavior Impact** | Free users receive 10 permanent credits on signup and 3 monthly recurring credits. PRO/ADVANCED/PREMIUM/BUSINESS plans receive tiered monthly credit allocations. The `withLock` concurrency pattern in `usage-service.ts` prevents double-spend exploits. |

---

### Historical — Social Platform Provider Registry

| Field | Detail |
| :--- | :--- |
| **Change** | A full social platform adapter registry was implemented covering 8 major platforms and 5 stub platforms. |
| **Platforms Implemented** | Instagram (Meta Graph API), Facebook (Meta Graph v25.0), YouTube (Google Data API v3), LinkedIn (REST API v202604), Threads (Meta Threads API), Pinterest (API v5), TikTok (API v2), X/Twitter (API v2 + v1.1 Media). |
| **Platforms Stubbed** | Reddit, Bluesky, Telegram, Mastodon, Discord. |
| **Affected Files** | `apps/api/src/integrations/social-engine/providers/`, `apps/web/lib/social-engine/`. |

---

### Historical — Baseline Database Schema

| Field | Detail |
| :--- | :--- |
| **Change** | Full multi-tenant PostgreSQL schema was established as migration `0_baseline`. |
| **Key Models** | `User`, `Workspace`, `WorkspaceMember`, `Brand`, `Campaign`, `MediaAsset`, `GenerationRun`, `GenerationJob`, `SocialCopy`, `SocialAccount`, `ScheduledPublication`, `Subscription`, `UserUsage`, `UserApiCredential`, `Notification`, `N8nIntegration`, `ContentPlan`, `Template`, `SavedItem`, `Trend`. |
| **Affected Files** | `packages/database/prisma/migrations/0_baseline/migration.sql`, `packages/database/prisma/schema.prisma`. |

---

## Future Changes

> **Rule:** All future meaningful changes must be appended to the **Change Log** section above after the change has been verified. Do NOT add entries speculatively, from plans, or before implementation is confirmed.

When recording a future change, include:

| Field | What to Record |
| :--- | :--- |
| **Date** | `YYYY-MM-DD` of verified completion |
| **Change** | What was changed (files, features, behavior) |
| **Reason** | Why it was changed |
| **Affected Files** | List all modified, created, or deleted files |
| **Behavior Impact** | Describe observable behavior change (or `None` if documentation-only) |
| **Verification** | Tests run, typecheck result, manual verification steps |
| **Commit / Reference** | Git commit SHA or PR reference when applicable |
| **Result** | Summary and outcome |

---

## Change Recording Rules

1. **Record only verified changes.** Do not record plans, intentions, or unconfirmed work.
2. **Include the date** in `YYYY-MM-DD` format.
3. **Identify all affected files** precisely.
4. **Describe behavior impact** — even if the impact is "None" (e.g., documentation-only).
5. **Reference tests and verification steps** — what was run and what it confirmed.
6. **Reference a commit SHA or PR** when the change is committed.
7. **Never include secrets, credentials, or raw environment values** in any entry.
8. **Do not retroactively invent historical entries** without direct evidence (git log, migration files, code inspection).
9. **Update `docs/PROJECT_MEMORY.md`** if a change alters the architectural state of the project.
10. **Append new entries at the top** of the Change Log section (newest first within year/date groups).
