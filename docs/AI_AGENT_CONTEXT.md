# AI Social Media Studio
# Master AI Agent Context

> **Primary Operational Entry Point for AI Coding Agents & Engineering Teams**  
> *Target Audience:* Antigravity, Claude, Codex, Gemini, and human engineers working on this repository.  
> *Last Verified State:* 2026-09-23 (Branch: `master`)  
> *Rule:* Read this document FIRST before inspecting code or performing any task.

---

## 1. Purpose of This Document

This document is the **mandatory first document** an AI coding agent must read before analyzing, planning, or executing changes on the **AI Social Media Studio (ASM)** codebase.

It provides:
- **Project identity and core domain boundaries**
- **Monorepo architecture and package responsibilities**
- **Strict development, security, database, and git safety rules**
- **Current implementation status and roadmap phase**
- **Verified architectural findings and known issues**
- **Documentation index and reference map**
- **Standard safe change management workflow**

This document serves as an **index and operational guide**, NOT a replacement for the comprehensive technical details in `docs/ARCHITECTURE.md` or the deep historical audits in `docs/archive/`.

---

## SOURCE OF TRUTH RULE

> **CRITICAL DIRECTIVE:** When information in documentation conflicts with the codebase, **always verify the current source code first**.

Documentation can lag behind active development. The hierarchical priority for resolving discrepancies is:

1. **Current source code** (`apps/`, `packages/`, `scripts/`)
2. **Current database schema and migrations** (`packages/database/prisma/`)
3. **Tests** (`tests/`)
4. **`docs/AI_AGENT_CONTEXT.md`** (This document — operational rules & index)
5. **`docs/ARCHITECTURE.md`** (Comprehensive technical architecture specification)
6. **`docs/PROJECT_MEMORY.md`** (Verified repository memory & baseline reality)
7. **`docs/CHANGELOG.md`** (Chronological verified change records)
8. **Historical reports in `docs/archive/`** (Point-in-time audits & phase plans)

**AI agents must never blindly trust documentation when active source code demonstrates otherwise.**

---

## 2. Project Identity

* **Product Name:** AI Social Media Studio
* **Brand Acronym:** ASM
* **Repository & Branch:** `rkjrohitjaiswal/Social-Media-Studio` / `master`
* **Project Type:** Full-Stack Multi-Tenant SaaS Platform (Monorepo)
* **Core Purpose:** Multi-account, multi-platform AI content creation, management, review, governance, automated scheduling, publishing, and analytics platform. Transforms brand assets, product images, long-form content, and style guidelines into platform-optimized social content across major social networks with human-in-the-loop governance.
* **Strict Constraint:** Do not invent product features, endpoints, or capabilities that are not factually verified in the codebase.

---

## 3. Documentation Map

| Document | Path | Primary Purpose & Usage |
| :--- | :--- | :--- |
| **Master AI Agent Context** | `docs/AI_AGENT_CONTEXT.md` | **Primary entry point** for all AI agents. Operational rules, quick reference, safety boundaries. |
| **Project Memory** | `docs/PROJECT_MEMORY.md` | Long-term source of truth for verified codebase baseline, architecture, and maintenance rules. |
| **Technical Architecture** | `docs/ARCHITECTURE.md` | Detailed 25-section technical architecture specification (topology, routes, services, schemas). |
| **Changelog** | `docs/CHANGELOG.md` | Chronological record of confirmed, verified changes. Never record speculative changes. |
| **Deployment Guide** | `DEPLOYMENT.md` | Production deployment procedures, cloud configurations, and environment setups. |
| **Deployment / Monorepo Guide** | `docs/deployment.md` | Workspace structure, local dev commands, and service hosting overview. |
| **Repository README** | `README.md` | Public repository introduction, feature matrix, and developer quick start. |
| **Historical Phase Reports** | `docs/archive/` | Point-in-time audit reports, dependency maps, and implementation plans. |
| **Web Agent Instructions** | `apps/web/AGENTS.md` | Next.js-specific agent instructions. Must be respected when working inside `apps/web`. |
| **Web Claude Instructions** | `apps/web/CLAUDE.md` | Pointer to Next.js agent rules for Claude/agents in `apps/web`. |

---

## 4. Current Repository Structure

The project is structured as an **npm workspace monorepo**:

```text
AI-Social-Media-Studio/
├── .env.example
├── .gitignore
├── DEPLOYMENT.md              # Production deployment guide
├── eslint.config.mjs          # Root lint configuration
├── next-env.d.ts
├── package.json               # Monorepo root package definition
├── package-lock.json
├── postcss.config.mjs
├── prisma.config.ts
├── README.md                  # Public repository README
├── tsconfig.json              # Root TypeScript configuration
├── vitest.config.ts           # Vitest configuration
├── apps/
│   ├── api/                   # Express 4 REST API & Background Workers (@ai-social/api)
│   └── web/                   # Next.js 16 App Router Frontend (@ai-social/web)
├── packages/
│   ├── config/                # Shared TypeScript compiler config (@ai-social/config)
│   ├── database/              # Prisma ORM v7 client & PostgreSQL schema (@ai-social/database)
│   └── shared/                # Shared Zod schemas, TypeScript types, DTOs (@ai-social/shared)
├── scripts/                   # Utility & verification scripts (seed-test-user, etc.)
├── tests/                     # Consolidated Vitest test suite (unit, integration, security, E2E)
├── docs/                      # Central documentation hub
│   ├── AI_AGENT_CONTEXT.md    # This master entry point document
│   ├── ARCHITECTURE.md        # Detailed technical architecture specification
│   ├── CHANGELOG.md           # Chronological verified change log
│   ├── deployment.md          # Deployment & monorepo guide
│   ├── PROJECT_MEMORY.md      # Permanent architectural source of truth
│   └── archive/               # Historical phase reports and audit documents
└── scratch/                   # Untracked agent scratch workspace (never committed)
```

### Workspace Responsibilities

* **`apps/web` (Frontend):** Next.js 16 UI, React 19, Tailwind CSS v4. Houses marketing pages, authentication views, multi-stage Studio workspace routes, content command center, approval workflows, calendar scheduler, and analytics graphs. Consumes backend via `lib/api-client.ts`.
* **`apps/api` (Backend API):** Express 4 REST API server. Handles business logic, authentication/authorization middleware, BYOK credential resolution, AES-256-GCM encryption, multi-provider AI generation orchestration, social OAuth token management, and scheduled publication execution.
* **`packages/shared` (Contracts):** Single source of truth for isomorphic Zod validation schemas, TypeScript DTOs, interfaces, and workspace entitlement definitions.
* **`packages/database` (Database):** Exports the singleton Prisma client (`prisma`), owns `schema.prisma`, and maintains the immutable SQL migration history.
* **`packages/config` (Tooling):** Shared compiler configuration (`tsconfig.base.json`) extended across workspaces.
* **`tests` (Verification):** Centralized Vitest test suites executing unit, integration, security, and provider tests against the monorepo.
* **`docs` (Knowledge):** Unified documentation directory containing active specifications, guides, and historical audit reports.

---

## 5. Technology Stack

Only verified technologies present in the codebase are listed below:

| Layer | Verified Technology | Role & Notes |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16 (App Router) | React 19, Server & Client Components, Route Groups |
| **Styling** | Tailwind CSS v4 | Dark luxury aesthetic (`#0B0C0E`, `#F5F4F0`, `#C5A059`) |
| **Backend Framework** | Express 4 | Node.js REST API with 32 route modules, embedded worker ticker |
| **Language** | TypeScript (Strict Mode) | Full-stack type safety across all apps and packages |
| **Database** | PostgreSQL on Supabase | Relational multi-tenant transactional datastore |
| **ORM** | Prisma v7 | Schema definition, migrations, type-safe database queries |
| **Storage** | Supabase Storage | Private S3-compatible `campaign-assets` bucket with signed URLs |
| **Authentication** | Supabase Auth + Custom Admin | JWT session tokens for users; PBKDF2/HMAC for `adm_*` sessions |
| **Billing** | Razorpay | Subscription plans, credit metering, and webhook handlers |
| **Background Queues** | Redis + BullMQ | Infrastructure defined for distributed queues; embedded ticker active |
| **Automations** | n8n Webhooks | Inbound HMAC-signed webhook receiver & outbound event dispatcher |
| **Testing** | Vitest | Test runner for 64 test suites (688 tests passing 100%) |
| **Deployment Targets** | Vercel (Web), Container/Persistent (API) | Documented hosting topology in `DEPLOYMENT.md` |

> [!WARNING]
> **Provider Readiness Notice:** A provider class or adapter file existing in the repository does **NOT** mean it is live or production-ready. Always check the verified provider classification before assuming third-party capabilities.

---

## 6. High-Level Architecture

The end-to-end data flow operates through strictly decoupled architectural tiers:

```
┌────────────────────────────────────────────────────────┐
│                   Browser / Client                     │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / HTTPS
┌───────────────────────────▼────────────────────────────┐
│         apps/web — Next.js 16 (App Router)             │
│   (Studio UI, Client State, Supabase Client Auth)      │
└───────────────────────────┬────────────────────────────┘
                            │ REST (/api/*) + JWT / HMAC + Workspace ID
┌───────────────────────────▼────────────────────────────┐
│             apps/api — Express 4 API Server            │
│  ├── Middleware (Auth, Rate Limiter, Workspace Scope)   │
│  ├── Route Controllers (32 mounted endpoints)          │
│  ├── Domain Services (32+ business logic services)     │
│  └── Integrations (AI adapters, Social engines)        │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
┌─────────────▼─────────────┐ ┌───────────▼──────────────┐
│   PostgreSQL / Supabase   │ │  External Third Parties  │
│      (Prisma ORM v7)      │ │  - OpenAI / ElevenLabs   │
│   - Multi-tenant data     │ │  - Meta / Google / X     │
│   - Credit ledgers        │ │  - Razorpay / n8n        │
└───────────────────────────┘ └──────────────────────────┘
```

* **Frontend to Backend:** Frontend components never query the database directly. All interactions flow through `apps/web/lib/api-client.ts` to `apps/api`.
* **Backend Layering:** Route controllers are thin validation/dispatch boundaries that delegate 100% of business logic to domain services (`apps/api/src/services/`).
* **Background Work:** Embedded publishing worker (`publishing-worker.ts`) runs within the API process to poll scheduled publications; standalone BullMQ worker scripts exist for distributed execution.
* *For comprehensive architecture diagrams and sequence details, consult [docs/ARCHITECTURE.md](file:///c:/Project/AI%20Social%20Media%20Studio/docs/ARCHITECTURE.md).*

---

## 7. Frontend Architecture

* **Routing System:** Next.js App Router containing **45 verified `page.tsx` routes** structured into logical route groups:
  * `app/(auth)/`: Authentication pages (`/login`, `/signup`, `/forgot-password`, `/admin/login`).
  * `app/(marketing)/`: Public marketing pages (`/`, `/about`, `/pricing`).
  * `app/(studio)/`: Studio workspaces (`/dashboard`, `/create`, `/repurpose`, `/calendar`, `/published`, `/analytics`, `/brand`, `/settings/*`).
  * `app/approval/[token]/`: External tokenized approval inbox for human-in-the-loop content review.
* **Component Organization:**
  * `components/studios/`: Studio workspaces (Brand, Repurpose, Video, Generation, Calendar).
  * `components/layout/`: Global navigation, headers, workspace switchers (`StudioLayout.tsx`).
  * `components/ui/`: Shared UI primitives and icons.
* **Key Frontend Libraries (`apps/web/lib/`):**
  * `api-client.ts`: Canonical API client appending auth headers, workspace context, and error normalization.
  * `studio-context.tsx`: React Context managing active workspace, brand selection, and credit balances.
  * `supabase/`: Browser and SSR Supabase client wrappers.
  * `social-engine/`: Client-side preview renderer and platform formatting engine.
  * `mock-data.ts`: Development and offline fallback mock data.
  * `queue-types.ts`: Frontend typing for job queue states.
  * `razorpay-checkout.ts`: Client-side payment integration script loader and checkout handler.

> [!IMPORTANT]
> **Divergent Social Engines:** Both `apps/web/lib/social-engine` and `apps/api/src/integrations/social-engine` exist and have diverged. Both are actively consumed by their respective workspaces. Do not merge or delete either without an explicit, approved consolidation plan.

---

## 8. Backend Architecture

The Express API backend (`apps/api/src/`) is organized into dedicated functional directories:

* **`config/`:** Runtime configurations (`billing.ts`, `provider-config.ts`, `supabase.ts`).
* **`integrations/`:** External provider adapters:
  * `ai/`: Multi-modal AI generation orchestration (`ai-orchestrator.ts`).
  * `social-engine/`: Platform publishing adapters and credential resolution.
  * `instagram/`, `n8n/`, `publishing/`: Specialized integration handlers.
* **`middleware/`:** HTTP pipeline interceptors:
  * `auth.ts`: Authentication gateway validating Supabase JWTs, HMAC admin cookies, and auto-provisioning users.
  * `rate-limiter.ts`: Sliding-window in-memory and Redis rate limiters.
* **`queues/`:** BullMQ queue infrastructure (`generationQueue.ts`, `publishingQueue.ts`, `analyticsQueue.ts`).
* **`routes/`:** 32 Express router controllers mounted under `/api/*`. Route controllers validate payloads via Zod and delegate immediately to domain services.
* **`services/`:** 32+ domain services implementing all core business rules:
  * `content-service.ts`, `brand-service.ts`, `video-service.ts`, `approval-service.ts`.
  * `usage-service.ts`: Credit balance deduction, metering, and allowance resets.
  * `credential-resolver.ts`: BYOK encrypted user keys resolution with server-side fallbacks.
  * `repurposing-service.ts` & `content-repurposing-service.ts`: Distinct single-post vs full-campaign repurposing engines.
* **`utils/`:** `encryption.ts` (AES-256-GCM), `logger.ts`, `response.ts`.
* **`workers/`:** Embedded ticker (`publishing-worker.ts`) and worker modules.

---

## 9. Authentication & Security Rules

All authentication rules reflect the hardened, verified baseline established in **Phase 8A**:

### Production Mode (`NODE_ENV === "production"`)
1. **`x-user-id` Header Override Gated:** In production, unauthenticated requests passing an `x-user-id` header receive an immediate `401 Unauthorized`. Authenticated requests with a valid JWT have their identity established **strictly** from the cryptographic token (`data.user.id`). Header spoofing is completely impossible.
2. **Missing Token Rejection:** Any unauthenticated request to protected endpoints receives `401 Unauthorized: Authentication token required` with standard `{ success: false, error: ... }` schema. Demo workspace fallbacks are completely forbidden in production.
3. **Supabase Service-Role Requirement:** The API server throws an explicit fatal error (`SUPABASE_SERVICE_ROLE_KEY is required in production environment`) if the service-role key is missing or set to a placeholder.
4. **No Anon Key Elevation:** The public anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) must **never** be used as a backend service-role substitute in production.

### Development & Test Mode (`NODE_ENV !== "production"`)
* Graceful demo fallbacks (`demo-user-id`, `demo@maisonlumiere.com`, `demo-workspace-1`) and `x-user-id` header overrides remain operational strictly to enable offline development and automated test suites.

### Admin Authentication
* The `adm_*` cookie-based PBKDF2/HMAC stateless session authentication (`admin-auth-service.ts`) must be preserved for admin endpoints (`/api/admin/*`).

### Secret & Credential Safety
* **NEVER expose or hardcode:** API keys, service-role keys, JWT secrets, database passwords, OAuth client secrets, encryption keys (`USER_CREDENTIAL_ENCRYPTION_KEY`), or payment credentials.
* **NEVER log secrets:** Never log authorization headers, plain credentials, or raw token values to console or loggers.
* *Reference:* [docs/archive/PHASE_8A_AUTH_HARDENING_2026-09-18.md](file:///c:/Project/AI%20Social%20Media%20Studio/docs/archive/PHASE_8A_AUTH_HARDENING_2026-09-18.md).

---

## 10. Database Rules

* **Datastore:** Managed PostgreSQL hosted on Supabase.
* **ORM:** Prisma ORM v7 (`packages/database/prisma/schema.prisma`).

### Absolute Database Safety Rules
1. **NEVER run `prisma migrate reset`:** Under no circumstances should database reset commands be run.
2. **NEVER modify applied migration files:** Existing migrations in `packages/database/prisma/migrations/` are immutable history. Never edit them directly.
3. **Mandatory Pre-Change Inspection Workflow:**
   1. Inspect `schema.prisma`.
   2. Inspect all existing migration directories and SQL files.
   3. Check production schema compatibility.
   4. Trace all consumer services and routes that read/write the model.
   5. Write automated tests covering the changes.
   6. Review `git diff` before proposing.

### Prisma Schema / `UserUsage` Column Alignment — RESOLVED (Phase 8B)
* **Migration:** `1_add_permanent_and_monthly_free_credits/migration.sql` added 6 dual-ledger columns to `UserUsage`:
  * `permanentCreditsTotal`, `permanentCreditsUsed`
  * `monthlyCreditsAllowance`, `monthlyCreditsUsed`
  * `monthlyCycleStart`, `lastMonthlyReset`
* **Status:** **RESOLVED in Phase 8B (2026-09-23).** `schema.prisma` now declares all 6 columns with correct types, defaults, and nullability matching the migration SQL. Prisma Client regenerated. `??` fallback workarounds removed from `usage-service.ts`. `StoredUserUsage` interface updated to reflect the four `Int NOT NULL` fields as required.
* **Verification:** `npx prisma migrate status` → "Database schema is up to date!". 0 TypeScript errors. 688/688 tests pass.

---

## 11. Credit System

* **Subscription Tiers:** `FREE`, `PRO`, `ADVANCED`, `PREMIUM`, `BUSINESS` (defined in `packages/shared/src/types/billing.ts` and `apps/api/src/config/billing.ts`).
* **Dual Credit Ledgers:** The system is designed around two credit buckets:
  1. **Monthly Allowance Credits:** Replenished on each billing cycle reset.
  2. **Permanent / Admin-Granted Credits:** One-time or rollover credits that must not be wiped by monthly allowance resets.
* **Current Lifecycle Status:** A known bug exists in `usage-service.ts` where monthly cycle resets overwrite permanent rollover credits, leading to dashboard anomalies (e.g., "0/10 credits").
* **Roadmap:** Full credit lifecycle correction is scheduled for **Phase 8C (Planned)** following schema alignment. **Do NOT document an unverified final credit algorithm.**

---

## 12. AI Provider Status

Verified classification of AI providers in the codebase (from Phase 7 audit):

| Provider | Modality | Status | Details |
| :--- | :--- | :--- | :--- |
| **OpenAI** | Text Copywriting | **REAL** | Structured outputs for multi-platform social copy, hashtags, CTAs via GPT-4o. |
| **OpenAI** | Image Generation | **REAL** | Multi-aspect ratio image generation (`1:1`, `9:16`, `16:9`) via DALL-E 3. |
| **ElevenLabs** | Voice Synthesis | **REAL** | Text-to-speech audio synthesis with voice ID selection. |
| **Runway** | Video Generation | **STUB** | Stub implementation throwing `AUTHENTICATION` error without outbound HTTP calls. |
| **Luma** | Video Generation | **STUB** | Stub implementation throwing `AUTHENTICATION` error without outbound HTTP calls. |
| **Mock Providers** | Multi-modal | **MOCK / DEV** | In-memory fallbacks for offline testing and local evaluation. |

> [!CAUTION]
> Do not mark Runway or Luma as production-ready. They require live API credentials, webhook endpoints, and async polling implementations before live use.

---

## 13. Social Platform Status

Verified integration status across social networks:

| Platform | Provider Implementation | OAuth Callback Status | Live Readiness |
| :--- | :--- | :--- | :--- |
| **Instagram** | Live Meta Graph API adapter | Token exchange implemented | **SUBSTANTIALLY REAL** |
| **Facebook** | Page feed & photo publishing adapter | Mock / stub callback exchange | Adapter implemented; OAuth incomplete |
| **YouTube** | Data API v3 resumable video upload | Mock / stub callback exchange | Adapter implemented; OAuth incomplete |
| **LinkedIn** | REST API v2 post & image adapter | Mock / stub callback exchange | Adapter implemented; OAuth incomplete |
| **Threads** | 2-step container publishing adapter | Mock / stub callback exchange | Adapter implemented; OAuth incomplete |
| **Pinterest** | API v5 pin creation adapter | Mock / stub callback exchange | Adapter implemented; OAuth incomplete |
| **TikTok** | Content Posting API v2 adapter | Mock / stub callback exchange | Adapter implemented; requires client audit |
| **X (Twitter)** | API v2 tweet & v1.1 media adapter | PKCE flow partially wired | Adapter implemented; token exchange review needed |
| **Reddit, Bluesky, Telegram, Mastodon, Discord** | Stub account services | Mock engines | **MOCK / STUB ONLY** |

*Never describe all social integrations as live or production-ready.*

---

## 14. Worker Architecture

The repository contains both embedded background tickers and standalone CLI worker clusters. Understanding the exact role of each file is critical:

| File | Type | Execution Role |
| :--- | :--- | :--- |
| `apps/api/src/workers/generation-worker.ts` | **Worker Module** | In-process state-tracking generation queue and AI dispatch logic. |
| `apps/api/src/workers/generationWorker.ts` | **Standalone CLI Script** | Executable entry point for isolated generation workers (`npm run worker:generation`). |
| `apps/api/src/workers/publishing-worker.ts` | **Embedded Ticker** | Singleton interval ticker started in `server.ts`. Polls DB every 60s for due scheduled posts. Does not require Redis. |
| `apps/api/src/workers/publishingWorker.ts` | **Standalone CLI Script** | Executable entry point for distributed BullMQ publishing workers (`npm run worker:publishing`). |
| `apps/api/src/workers/analyticsWorker.ts` | **Standalone CLI Script** | Executable entry point for distributed analytics sync jobs (`npm run worker:analytics`). |
| `apps/api/src/queues/*.ts` | **Queue Infrastructure** | BullMQ queue definitions (`generationQueue`, `publishingQueue`, `analyticsQueue`) configured for Redis. |

> [!WARNING]
> **Do not delete similarly named files:** `generation-worker.ts` and `generationWorker.ts` serve completely different architectural purposes (module vs CLI script). The same applies to `publishing-worker.ts` and `publishingWorker.ts`.

---

## 15. Deployment Architecture

* **Frontend (`apps/web`):** Deployed to **Vercel** as a Next.js serverless application.
* **Backend API (`apps/api`):** Deployed to **Render / Railway / Container** as an Express Node.js process (or Vercel serverless where routes allow).
* **Database & Auth:** Managed PostgreSQL and Auth hosted on **Supabase**.
* **Storage:** Managed object storage bucket (`campaign-assets`) on **Supabase Storage**.
* **Persistent Background Work:** The embedded interval publishing ticker (`publishing-worker.ts`) requires a **persistent Node.js runtime**. In serverless environments (like Vercel), long-lived `setInterval` tickers will be paused between requests; production deployment of scheduled jobs must use standalone worker containers or external cron triggers.
* *References:* [DEPLOYMENT.md](file:///c:/Project/AI%20Social%20Media%20Studio/DEPLOYMENT.md), [docs/deployment.md](file:///c:/Project/AI%20Social%20Media%20Studio/docs/deployment.md).

---

## 16. Dependency & Cleanup Rules

Before modifying, renaming, or deleting ANY file, agents must execute the **10-Step Safe Dependency Check**:

1. **Search imports:** Grep for relative and package import statements.
2. **Search consumers:** Check which route controllers, services, or UI pages invoke the target.
3. **Search dynamic references:** Check string keys, reflection, or provider registries.
4. **Search package scripts:** Check `package.json` scripts across all workspaces.
5. **Search runtime strings:** Grep for template literals or config names.
6. **Search tests:** Check Vitest test suites importing the component.
7. **Check route registration:** Confirm whether Express or App Router registers the path.
8. **Check deployment usage:** Verify whether Docker, Vercel, or build configs invoke it.
9. **Run automated tests:** Execute the relevant test suites.
10. **Review git diff:** Inspect the exact blast radius.

### Verified Phase 6 Cleanup Candidates (CANDIDATES ONLY — DO NOT DELETE)
* `apps/web/components/ui/InstagramIcon.tsx` (Identical duplicate of `components/icons/InstagramIcon.tsx`)
* `packages/database/prisma/original-schema.prisma` (98 KB unreferenced legacy schema)
* `apps/api/src/utils/logger.ts` (Redundant logger wrapper)
* `apps/web/components/studio/BulkImageUploader.tsx` (Candidate for deprecation review)
* `apps/web/components/UsageWidget.tsx` (Candidate for deprecation review)

*These files are candidates only. Do NOT delete them without explicit user instruction and dedicated safety verification.*

---

## 17. Important Architectural Findings

Summary of verified findings from Phase 5 and Phase 6 audits:

1. **Frontend / Backend Social Engines:** Both engines are active and serve different roles (previews vs server publishing).
2. **Dual Repurposing Services:** `repurposing-service.ts` handles single-post transformations; `content-repurposing-service.ts` handles full multi-asset campaign packages.
3. **Worker Separation:** Kebab-case worker files are internal modules/tickers; camelCase worker files are standalone CLI entrypoints.
4. **Route Filename Divergence:** Route files do not always match URL mounts (`advisor.ts` → `/api/analytics/advisor`, `campaign-planner.ts` → `/api/campaigns/planner`, `n8n.ts` → `/api/integrations/n8n`).
5. **Schema Drift:** ~~Prisma schema must be reconciled with migration `1_add_permanent_and_monthly_free_credits`.~~ **RESOLVED in Phase 8B.**
6. **Hardened Auth:** Production auth fallbacks and header overrides are strictly gated behind `NODE_ENV !== "production"`.
7. **Stub Providers:** Runway and Luma are stubs; social OAuth callbacks require live token exchange wiring.

---

## 18. Current Development Phase

* **Current Phase:** **PHASE 8C — Credit Lifecycle Correction**
* **Status:** **PLANNED / NEXT**
* **Objective:** Correct the `usage-service.ts` monthly cycle reset behavior so it does not overwrite `permanentCreditsTotal`/`permanentCreditsUsed` when resetting monthly allowance. Phase 8B (schema alignment) is a prerequisite and is now complete.
* **Previous Phase:** **PHASE 8B — Prisma Schema Alignment** — COMPLETED 2026-09-23.

---

## 19. Completed Phases

| Phase | Title | Outcome & Verification Reference |
| :--- | :--- | :--- |
| **Phase 5** | Documentation Verification | Read-only verification of repository documentation against live codebase. Verified 45 frontend routes, schema drift, and provider status. Documented in `docs/PROJECT_MEMORY.md` §28. |
| **Phase 6** | Dependency & Reference Map | Complete file-by-file dependency graph across all 310 repository files. Mapped route-service-queue relationships. Reference: `docs/archive/PHASE_6_DEPENDENCY_MAP_2026-09-18.md`. |
| **Phase 7** | Safe Cleanup & Hardening Plan | Prioritized hardening roadmap covering auth vulnerabilities, schema drift, provider classifications, and dead code candidates. Reference: `docs/archive/PHASE_7_HARDENING_PLAN_2026-09-18.md`. |
| **Phase 8A** | Production Auth Hardening | Gated `x-user-id` header overrides and unauthenticated demo fallbacks behind `!isProduction`. Enforced `SUPABASE_SERVICE_ROLE_KEY` in production. 10/10 tests passed. Reference: `docs/archive/PHASE_8A_AUTH_HARDENING_2026-09-18.md`. |
| **Phase 8B** | Prisma Schema Alignment | Added 6 missing `UserUsage` columns to `schema.prisma` matching migration `1_add_permanent_and_monthly_free_credits`. Regenerated Prisma Client. Removed `??` fallbacks from `usage-service.ts`. 0 TypeScript errors, 688/688 tests pass. Reference: `docs/archive/PHASE_8B_PRISMA_SCHEMA_ALIGNMENT_2026-09-23.md`. |

---

## 20. Standard AI Agent Workflow

Every AI agent working on this codebase must follow this sequence:

```
READ (Context & Architecture)
  ↓
UNDERSTAND (Verify against active source code)
  ↓
SEARCH REFERENCES (Perform 10-step dependency check)
  ↓
PLAN (Formulate targeted, minimal implementation plan)
  ↓
IMPLEMENT (Make the smallest safe change)
  ↓
TEST (Run focused tests, then broader test suites)
  ↓
REVIEW DIFF (Check git diff --stat and git diff)
  ↓
UPDATE DOCUMENTATION (Update docs/PROJECT_MEMORY.md & CHANGELOG.md)
  ↓
REPORT (Provide factual verification summary)
  ↓
STOP (Commit or push ONLY when explicitly requested)
```

---

## 21. Forbidden Actions Without Explicit Approval

**NEVER perform any of the following actions without explicit user instruction:**

* ❌ Run `git push` or `git commit`.
* ❌ Run `prisma migrate reset` or `prisma db push --force-reset`.
* ❌ Modify or delete applied database migration files.
* ❌ Delete production database records or Supabase storage objects.
* ❌ Delete or rename source files merely because they appear duplicate.
* ❌ Undertake architecture-wide refactors.
* ❌ Install (`npm install <pkg>`) or remove packages.
* ❌ Redesign authentication or security middleware casually.
* ❌ Modify credit calculation or billing logic without full lifecycle tracing.
* ❌ Alter production environment configurations or `.env.example` blindly.
* ❌ Remove or rewrite existing working provider adapters.
* ❌ Weaken or remove assertions in existing test suites.

---

## 22. Documentation Maintenance

When completing any verified change:

1. **Update `docs/PROJECT_MEMORY.md`:** If architectural state, models, routes, or rules changed.
2. **Update `docs/CHANGELOG.md`:** Append a concise, verified entry at the top of the Change Log section. Never record unverified or speculative work.
3. **Update `docs/ARCHITECTURE.md`:** If system topology, route mappings, or domain services changed.
4. **Archive Major Phases:** When a major milestone, audit, or hardening phase concludes, create a dedicated report under `docs/archive/`.
5. **No Redundant Bloat:** Do not duplicate full files across documentation; cross-reference canonical locations.

---

## 23. Testing Rules

1. **Test Proximity:** Run the smallest, most relevant test suite first (e.g. `npx vitest run tests/production-auth-hardening.test.ts`).
2. **Broader Validation:** Run workspace tests (`npm test`) or typechecks (`npm run typecheck`) when altering shared types, middleware, or database contracts.
3. **Preserve Test Integrity:** Never weaken assertions, delete tests, or add artificial bypasses to make tests pass.
4. **No Code Fixes for Doc Tasks:** In documentation-only tasks, do not touch application code even if tests fail. Report the status factually.

---

## 24. Git Safety

Before completing any task, execute:
```bash
git status --short
git diff --stat
```

Report clearly:
* **Modified files**
* **New untracked files**
* **Deleted files** (if any)
* **Test execution results**
* **Any unexpected changes or anomalies**

**Strict Rule:** Do not commit. Do not push. Stop after verification.

---

## 25. Current Known Issues

### High Priority
* ~~**Prisma Schema Drift:**~~ **RESOLVED (Phase 8B)** — `schema.prisma` now includes all 6 credit columns from migration `1_add_permanent_and_monthly_free_credits`. Prisma Client regenerated. Workarounds removed.
* **Credit Lifecycle Bugs:** Monthly cycle reset in `usage-service.ts` can overwrite permanent rollover credits. Requires Phase 8C correction.

### Medium Priority
* **Incomplete Social OAuth Callbacks:** OAuth callback endpoints for Facebook, YouTube, LinkedIn, Threads, Pinterest, and TikTok lack live token exchange logic with provider APIs.
* **Stub Video Providers:** Runway and Luma video services are stubs throwing `AUTHENTICATION` errors without live network requests.
* **Environment Variable Documentation:** Several runtime environment variables are missing from `.env.example`.
* **Worker Execution Topology:** The embedded publishing worker ticker requires a persistent Node.js host rather than serverless runtime.

*Reference:* [docs/archive/PHASE_7_HARDENING_PLAN_2026-09-18.md](file:///c:/Project/AI%20Social%20Media%20Studio/docs/archive/PHASE_7_HARDENING_PLAN_2026-09-18.md).

---

## 26. Quick Reference

* **Entry Point:** `docs/AI_AGENT_CONTEXT.md` (This document)
* **Living State & Rules:** `docs/PROJECT_MEMORY.md`
* **Architecture Details:** `docs/ARCHITECTURE.md`
* **Change History:** `docs/CHANGELOG.md`
* **Historical Audits & Plans:** `docs/archive/`
* **Production Deployment:** `DEPLOYMENT.md` and `docs/deployment.md`
* **Web App Instructions:** `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`

---

## 27. Final Principle

> ### **DO NOT GUESS.**
> 
> 1. **Inspect** the current repository reality.
> 2. **Trace** dependencies through imports, routes, and tests.
> 3. **Respect** security and environment boundaries.
> 4. **Preserve** working functionality.
> 5. **Make** the smallest safe, targeted change.
> 6. **Test** thoroughly.
> 7. **Document** accurately.
> 8. **Only then** continue.
