# AI Social Media Studio — Project Memory

> **Permanent Source of Truth for Future AI Coding Agents & Engineering Teams**  
> *Last Verified State: 2026-09-18 (Branch: `master`)*  
> *Strict Notice: Read this document completely BEFORE making any architectural, feature, database, auth, or refactoring changes.*

---

## 1. PROJECT IDENTITY
* **Project Name:** AI Social Media Studio (ASM)
* **Current Repository & Branch:** `rkjrohitjaiswal/Social-Media-Studio` / `master`
* **Project Type:** Full-Stack Multi-Tenant SaaS Platform (Monorepo)
* **Main Purpose:** Multi-account, multi-platform AI content creation, review, scheduling, publishing, and analytics platform. Transforms single creative sources (brand assets, product images, long-form content, guidelines) into dedicated, platform-optimized social content across major global social networks with human-in-the-loop governance.
* **Monorepo Architecture:** npm workspaces:
  * `apps/web`: Next.js 16 (App Router, React 19, Tailwind CSS v4)
  * `apps/api`: Express 4 (Node.js, TypeScript, REST API, embedded publishing worker)
  * `packages/config`: Shared TypeScript base configuration (`tsconfig.base.json`)
  * `packages/database`: Prisma ORM v7 client & PostgreSQL schema
  * `packages/shared`: Shared Zod schemas, TypeScript types, DTOs, and notification interfaces

---

## 2. CURRENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Next.js 16 Web App                            │
│                 (App Router, React 19, Studio Layout)                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP / REST (/api/*) + JWT / HMAC
┌────────────────────────────────────▼────────────────────────────────────┐
│                          Express 4 API Server                           │
│  ├── Middleware (Auth, Rate Limiter, Workspace Scoping)                 │
│  ├── Domain Services (Brand, Content, Video, Repurposing, Billing)      │
│  ├── Social Engine Registry & Platform Adapters                         │
│  └── Embedded Publishing Worker (Background Ticker)                     │
└──────────┬─────────────────────────┬──────────────────────┬─────────────┘
           │                         │                      │
┌──────────▼──────────┐   ┌──────────▼─────────┐  ┌─────────▼─────────────┐
│ PostgreSQL/Supabase │   │  Supabase Storage  │  │ External Integrations │
│  (Prisma ORM v7)    │   │ (campaign-assets)  │  │  - OpenAI / Runway    │
│  - Multi-tenant DB  │   │ - Input & Gen Img  │  │  - Meta / Google / X  │
│  - Credit Metering  │   │ - Signed URLs      │  │  - Razorpay / n8n     │
└─────────────────────┘   └────────────────────┘  └───────────────────────┘
```

### Responsibility of Major Layers
* **`apps/web` (Frontend):** Renders marketing pages, authentication views, multi-stage Studio workspace routes, content command center, approval workflows, calendar schedules, analytics graphs, and settings. Consumes backend via `lib/api-client.ts`.
* **`apps/api` (Backend API):** Houses business logic, route handlers, BYOK credential resolution, AES-256-GCM encryption at rest, AI generation orchestration, social OAuth token exchanges, and scheduled publication execution.
* **`packages/database` (Database Layer):** Exports singleton Prisma client (`prisma`) connecting to Supabase PostgreSQL with pooled connection support.
* **`packages/shared` (Contracts):** Single source of truth for Zod validation schemas and DTO types across frontend and backend boundaries.
* **`packages/config` (Tooling):** Shared compiler and lint configurations.
* **PostgreSQL / Supabase:** Core multi-tenant transactional datastore.
* **Supabase Storage:** S3-compatible private object storage bucket (`campaign-assets`) accessed via backend service-role client.
* **AI Providers:** Multi-modal generation (OpenAI, Runway, Luma, ElevenLabs) with mock fallbacks.
* **Social Integrations:** Provider registry adapting Meta Graph API, Google YouTube Data API, LinkedIn REST API, TikTok Content Posting API, X API v2, Pinterest API v5.
* **n8n / Automations:** Inbound webhook receiver (HMAC signed) and outbound event dispatcher.
* **Razorpay:** Subscription billing, plan verification, and webhook event handling.
* **Queues & Workers:** Embedded background publishing ticker (`publishing-worker.ts`) and optional standalone BullMQ clusters.

---

## 3. FOLDER STRUCTURE (CURRENT REPOSITORY STATE)

```text
AI Social Media Studio/
├── .env.example
├── .gitignore
├── DEPLOYMENT.md
├── eslint.config.mjs
├── next-env.d.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── prisma.config.ts
├── README.md
├── tsconfig.json
├── vitest.config.ts
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── server.ts
│   │       ├── config/        (billing, provider-config, supabase)
│   │       ├── integrations/  (ai, instagram, n8n, publishing, social-engine)
│   │       ├── middleware/    (auth, rate-limiter)
│   │       ├── queues/        (analyticsQueue, generationQueue, publishingQueue)
│   │       ├── routes/        (32 Express route controllers)
│   │       ├── services/      (30+ domain services & trends providers)
│   │       ├── utils/         (encryption, logger, rate-limiter)
│   │       └── workers/       (background tickers & worker clusters)
│   └── web/
│       ├── AGENTS.md
│       ├── CLAUDE.md
│       ├── middleware.ts
│       ├── next.config.ts
│       ├── package.json
│       ├── app/               ((auth), (marketing), (studio), approval/[token])
│       ├── components/        (studios, layout, icons, ui)
│       ├── lib/               (api-client, studio-context, social-engine, supabase)
│       └── public/            (brand assets, SVGs, logos)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CHANGELOG.md
│   ├── deployment.md
│   ├── PROJECT_MEMORY.md
│   └── archive/               (historical phase reports)
├── packages/
│   ├── config/                (tsconfig.base.json)
│   ├── database/              (schema.prisma, original-schema.prisma, migrations)
│   └── shared/                (Zod schemas, TypeScript types, DTOs)
├── scripts/                   (seed-test-user, run-browser-qa, verify-integration)
└── tests/                     (63 unit, integration, and E2E test files)
```

---

## 4. FRONTEND (`apps/web`)

### Next.js App Router Structure (Verified: 45 Routes)
* **Root Route:**
  * `app/page.tsx` (`/`)
* **Authentication Routes `app/(auth)/` (4 routes):**
  * `/login` (`app/(auth)/login/page.tsx`)
  * `/signup` (`app/(auth)/signup/page.tsx`)
  * `/forgot-password` (`app/(auth)/forgot-password/page.tsx`)
  * `/admin/login` (`app/(auth)/admin/login/page.tsx`)
* **Marketing Routes `app/(marketing)/` (3 routes):**
  * `/` (`app/(marketing)/page.tsx`)
  * `/about` (`app/(marketing)/about/page.tsx`)
  * `/pricing` (`app/(marketing)/pricing/page.tsx`)
* **Studio Workspace Routes `app/(studio)/` (36 routes):**
  * `/dashboard` (`app/(studio)/dashboard/page.tsx`): Workspace overview & metrics
  * `/brand` (`app/(studio)/brand/page.tsx`): Brand kit guidelines & visual anchors
  * `/create` (`app/(studio)/create/page.tsx`): Creative generator workspace
  * `/create/repurpose` (`app/(studio)/create/repurpose/page.tsx`): Inline repurposing creation flow
  * `/content-studio` (`app/(studio)/content-studio/page.tsx`): Long-form to multi-format studio
  * `/content-studio/[projectId]/editor` (`app/(studio)/content-studio/[projectId]/editor/page.tsx`): Multi-scene video & package editor
  * `/content-review` (`app/(studio)/content-review/page.tsx`): Content review dashboard
  * `/repurpose` (`app/(studio)/repurpose/page.tsx`): Content repurposing engine
  * `/campaigns` (`app/(studio)/campaigns/page.tsx`): Campaign list
  * `/campaigns/[id]` (`app/(studio)/campaigns/[id]/page.tsx`): Campaign details
  * `/campaigns/planner` (`app/(studio)/campaigns/planner/page.tsx`): AI Campaign planner
  * `/calendar` (`app/(studio)/calendar/page.tsx`): Scheduled post timeline
  * `/calendar/ai` (`app/(studio)/calendar/ai/page.tsx`): AI schedule generator
  * `/approvals` (`app/(studio)/approvals/page.tsx`): Human governance inbox
  * `/published` (`app/(studio)/published/page.tsx`): Published post feed & history
  * `/analytics` (`app/(studio)/analytics/page.tsx`): Analytics dashboard
  * `/analytics/advisor` (`app/(studio)/analytics/advisor/page.tsx`): AI performance advisor
  * `/analytics/campaigns/[campaignId]` (`app/(studio)/analytics/campaigns/[campaignId]/page.tsx`): Campaign-level analytics
  * `/analytics/media/[mediaId]` (`app/(studio)/analytics/media/[mediaId]/page.tsx`): Asset-level analytics
  * `/goals` (`app/(studio)/goals/page.tsx`): Social milestone targets
  * `/strategy` (`app/(studio)/strategy/page.tsx`): Strategy planner
  * `/strategy/pillars` (`app/(studio)/strategy/pillars/page.tsx`): Content pillar manager
  * `/tools` (`app/(studio)/tools/page.tsx`): Standalone utility tools hub
  * `/tools/[toolId]` (`app/(studio)/tools/[toolId]/page.tsx`): Dedicated tool runner
  * `/trends` (`app/(studio)/trends/page.tsx`): Trend explorer & insights
  * `/trends/[id]` (`app/(studio)/trends/[id]/page.tsx`): Trend detail view
  * `/templates` (`app/(studio)/templates/page.tsx`): Post template library
  * `/saved` (`app/(studio)/saved/page.tsx`): Bookmarked inspiration
  * `/settings` (`app/(studio)/settings/page.tsx`): General workspace settings
  * `/settings/billing` (`app/(studio)/settings/billing/page.tsx`): Razorpay subscription & credits
  * `/settings/integrations` (`app/(studio)/settings/integrations/page.tsx`): Social platform connections
  * `/settings/integrations/n8n` (`app/(studio)/settings/integrations/n8n/page.tsx`): n8n automation settings
  * `/settings/profile` (`app/(studio)/settings/profile/page.tsx`): User profile settings
  * `/settings/social-accounts` (`app/(studio)/settings/social-accounts/page.tsx`): Social account connections
  * `/settings/workspace` (`app/(studio)/settings/workspace/page.tsx`): Multi-tenant workspace management
  * `/admin` (`app/(studio)/admin/page.tsx`): System admin dashboard
* **Public Client Review Route (1 route):**
  * `/approval/[token]` (`app/approval/[token]/page.tsx`): Tokenized public review inbox without requiring login.

### Key Libraries & Components
* [apps/web/lib/api-client.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/web/lib/api-client.ts): Unified API fetcher attaching active `x-workspace-id` and Supabase JWT / Admin HMAC bearer tokens.
* [apps/web/lib/studio-context.tsx](file:///c:/Project/AI%20Social%20Media%20Studio/apps/web/lib/studio-context.tsx): React context managing current workspace, user session, and active brand.
* [apps/web/components/layout/StudioLayout.tsx](file:///c:/Project/AI%20Social%20Media%20Studio/apps/web/components/layout/StudioLayout.tsx): Shared navigation sidebar, header, workspace switcher, and notification center.

---

## 5. BACKEND API (`apps/api`)

* **Entrypoint:** [apps/api/src/server.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/server.ts) — Configures CORS with wildcard regex support, 50MB JSON limits with raw body preservation for webhooks, registers 32 route modules, starts the embedded publishing worker ticker, and initializes the system admin account.
* **Authentication Middleware:** [apps/api/src/middleware/auth.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/middleware/auth.ts) — Validates Supabase JWTs, handles `adm_*` HMAC admin session tokens, supports `x-user-id` test headers, and automatically provisions new users via `ensureUserExists()`.
* **Domain Services (`apps/api/src/services/`):**
  * `brand-service.ts`, `content-project-service.ts`, `content-repurposing-service.ts`, `repurposing-service.ts`
  * `publishing-service.ts`, `social-account-service.ts`, `subscription-service.ts`, `usage-service.ts`
  * `real-video-generation-service.ts`, `video-composition-service.ts`, `video-script-service.ts`
  * `admin-auth-service.ts`, `credential-resolver.ts`, `razorpay-adapter.ts`, `notification-service.ts`
  * `trends/trend-service.ts`, `trends/google-trends-provider.ts`

---

## 6. DATABASE & PRISMA LAYER

### Active Production Schema
* **CRITICAL FILE:** [packages/database/prisma/schema.prisma](file:///c:/Project/AI%20Social%20Media%20Studio/packages/database/prisma/schema.prisma)
  * Represents the live Supabase PostgreSQL database schema (50 models defined).
  * **DO NOT MODIFY** this file or apply migrations without an explicit, approved migration plan.
* **Migrations:** Located in `packages/database/prisma/migrations/` (`0_baseline` and `1_add_permanent_and_monthly_free_credits`).
* **Schema Alignment (Phase 8B — COMPLETE):** Migration `1_add_permanent_and_monthly_free_credits/migration.sql` added 6 columns (`permanentCreditsTotal`, `permanentCreditsUsed`, `monthlyCreditsAllowance`, `monthlyCreditsUsed`, `monthlyCycleStart`, `lastMonthlyReset`) to table `"UserUsage"`. As of Phase 8B (2026-09-23), `packages/database/prisma/schema.prisma` now declares all 6 columns with exact types matching the migration SQL. Prisma Client regenerated. Runtime fallbacks in `usage-service.ts` removed.

### Legacy / Backup Schema
* **File:** [packages/database/prisma/original-schema.prisma](file:///c:/Project/AI%20Social%20Media%20Studio/packages/database/prisma/original-schema.prisma) (98KB)
* **Status:** Legacy historical backup. **DO NOT delete** until full repository history and reference verification are completed.

### Core Database Models (50 Models Total)
* `User`, `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`, `Brand`, `BrandProfile`
* `Campaign`, `MediaAsset`, `GenerationRun`, `GenerationJob`, `SocialCopy`, `SocialCopyVersion`, `QualityAssessment`, `ReviewEvent`
* `InstagramAccount`, `InstagramPublication`, `ScheduledPublication`, `SocialAccount`, `PlatformContent`, `InstagramMediaInsight`, `InstagramAccountInsight`
* `GeneratedAsset`, `GeneratedAssetVersion`, `Caption`, `HashtagSet`, `Approval`, `ScheduledPost`, `PublishedPost`, `AnalyticsSnapshot`
* `N8nIntegration`, `N8nWebhookDelivery`, `UserApiCredential`, `UserUsage`, `Subscription`, `AdminAuditLog`
* `ApprovalRequest`, `ApprovalAuditLog`, `BillingWebhookEvent`, `Template`, `SavedItem`, `ContentStrategy`, `ContentPillar`
* `ContentPlan`, `ContentPlanItem`, `AiCampaign`, `ContentPattern`, `PerformanceInsight`, `Trend`, `TrendOpportunity`, `Notification`

---

## 7. AUTHENTICATION & AUTHORIZATION

### Multi-Tier Auth Flow
1. **User Authentication:** Supabase Auth (Email/Password or OAuth) → Client retrieves JWT → Passed as `Authorization: Bearer <token>` → API verifies via `supabase.auth.getUser(token)` → Idempotently syncs user in Prisma DB.
2. **System Admin Authentication:** Dedicated stateless PBKDF2 / HMAC-SHA256 tokens (`adm_<base64>.<signature>`) generated by `admin-auth-service.ts`. Verified statelessly across serverless cold starts.
3. **Workspace Scoping:** All operations require `x-workspace-id` header (defaulting to user's active workspace). The backend strictly enforces workspace tenancy.

### Development / Demo Bypasses — Phase 8A Production Guards Implemented
* `x-user-id` header allows test runners to simulate authenticated sessions — **gated to `NODE_ENV !== "production"`**. In production, this header is completely ignored.
* No-token fallback sets `{ id: "demo-user-id", email: "demo@maisonlumiere.com" }` when running without auth — **gated to `NODE_ENV !== "production"`**. In production, unauthenticated requests receive `401 Unauthorized: Authentication token required`.
* `dev_bypass` cookie in frontend middleware bypasses client route guards in local dev.
* `getSupabaseAdminClient()` in production requires a valid, non-placeholder `SUPABASE_SERVICE_ROLE_KEY` and throws if absent — the public anon key cannot silently substitute.
* **Verification:** `tests/production-auth-hardening.test.ts` (10/10 tests passing) verifies production enforcement. See `docs/archive/PHASE_8A_AUTH_HARDENING_2026-09-18.md` for the full change report.

---

## 8. STORAGE & MEDIA PIPELINE

* **Storage Provider:** Supabase Storage bucket `campaign-assets`.
* **Access Mode:** Private bucket accessed via server-side service-role client. Public clients receive time-limited signed URLs (TTL 3600s).
* **Storage Path Convention:**
  `{workspaceId}/campaigns/{campaignId}/generated/{jobId}/generated.{ext}`
* **Validation & Limits:**
  * Images: Max 10MB (`image/png`, `image/jpeg`, `image/webp`).
  * Video / Long-form: Max 50MB (`video/mp4`, `video/quicktime`).

---

## 9. AI SYSTEM & PROVIDER ARCHITECTURE

### Provider Status Matrix

| Provider | Purpose | Status in Code | Fallback / Mock Behavior |
| :--- | :--- | :--- | :--- |
| **OpenAI** | Image Generation (`gpt-image-2`) | **IMPLEMENTED & CONFIGURED** | Returns simulated binary buffer if API key missing |
| **OpenAI** | Social Copy & Quality Assessment (`gpt-4o-mini`) | **IMPLEMENTED & CONFIGURED** | Returns structured JSON fixture if API key missing |
| **ElevenLabs** | Voiceover Audio Synthesis | **IMPLEMENTED** | Throws clear auth error if unconfigured |
| **Runway** | Video Generation (Gen-3 Alpha) | **IMPLEMENTED** (BYOK) | Throws clear auth error if unconfigured |
| **Luma** | Video Generation (Dream Machine) | **IMPLEMENTED** (BYOK) | Throws clear auth error if unconfigured |
| **Mock Engine** | Local Testing & CI | **IMPLEMENTED & ACTIVE** | In-memory job state simulating 100% progress |

### BYOK & Credential Resolver
* [apps/api/src/services/credential-resolver.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/services/credential-resolver.ts) resolves user-provided encrypted API keys (`UserApiCredential`) first, falling back to server environment variables (`OPENAI_API_KEY`, etc.) only if permitted.

---

## 10. SOCIAL MEDIA INTEGRATIONS

> **Caution:** Do not assume an integration is production-ready simply because adapter files exist. Production readiness requires active third-party developer app credentials and live token testing.

| Platform | Adapter File | OAuth Flow | Publishing Method | Analytics Adapter | Code Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Instagram** | `instagram-provider.ts` | Meta Graph OAuth 2.0 | 2-Step Container (`/media` + `/media_publish`) | Insights API | **LIVE ADAPTER** |
| **Facebook** | `facebook-provider.ts` | Meta Graph v25.0 OAuth | Page Photos & Feed API | Page Insights | **LIVE ADAPTER** |
| **YouTube** | `youtube-provider.ts` | Google OAuth 2.0 | Resumable Video Upload (Data API v3) | Video Statistics | **LIVE ADAPTER** |
| **LinkedIn** | `linkedin-provider.ts` | OAuth 2.0 Auth Code | REST API v202604 URN Post | Profile Metrics | **LIVE ADAPTER** |
| **Threads** | `threads-provider.ts` | Meta Threads OAuth | 2-Step Container API | Threads Insights | **LIVE ADAPTER** |
| **Pinterest** | `pinterest-provider.ts` | Pinterest API v5 OAuth | Direct Pin Creation (`/v5/pins`) | Pin Analytics | **LIVE ADAPTER** |
| **TikTok** | `tiktok-provider.ts` | TikTok API v2 OAuth | Direct Post (`/v2/post/publish/video/init/`) | Creator Query | **LIVE ADAPTER** |
| **X (Twitter)** | `x-provider.ts` | OAuth 2.0 PKCE (S256) | X API v2 Tweet & v1.1 Media Upload | Public Metrics | **LIVE ADAPTER** |
| **Reddit / Bluesky / Telegram / Mastodon / Discord** | `multi-providers.ts` | Stub Service | Generic Mock Engine | Stub | **MOCK / STUB** |

---

## 11. CONTENT GENERATION & REPURPOSING

### Generation Workflow
1. **Asset Upload:** Reference anchor and input product images uploaded to Supabase Storage.
2. **Batch Generation:** `generation-worker.ts` dispatches parallel jobs with prompt interpolation.
3. **Copy & Alt-Text:** `social-copy-worker.ts` generates structured captions, hashtags, and CTAs.
4. **Quality Assessment:** `quality-worker.ts` scores lighting, style, composition, and product fidelity.
5. **Human Governance:** Assets land in `ApprovalRequest` inbox with `PENDING` status.

### Repurposing Services Notice
* **CRITICAL FINDING:** Both [repurposing-service.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/services/repurposing-service.ts) (single-post repurposing used by `routes/content.ts`) and [content-repurposing-service.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/services/content-repurposing-service.ts) (full package repurposing used by `routes/repurpose.ts`, `content-projects.ts`, `youtube-studio-service.ts`) exist.
* **RULE:** **DO NOT declare either service obsolete yet.** The full dependency graph must be audited before any consolidation.

---

## 12. BILLING & CREDIT METERING

### Pricing & Entitlements (INR)
* **FREE:** ₹0/mo — 10 permanent signup credits, 3 monthly recurring credits.
* **PRO:** ₹59/mo — 50 monthly workflow credits.
* **ADVANCED:** ₹99/mo — 150 monthly workflow credits.
* **PREMIUM:** ₹149/mo — 300 monthly workflow credits.
* **BUSINESS:** ₹299/mo — Unlimited workflow credits.

### Credit Metering Implementation
* **CRITICAL FILE:** [apps/api/src/services/usage-service.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/services/usage-service.ts)
  * Uses `withLock` promise-chaining for strict concurrency protection (prevents double-spend exploits).
  * Automatically performs lazy monthly credit resets on the first request of a new billing cycle.
  * Consumes 1 credit ONLY after generation/publishing operations succeed. Zero credits charged on failure.
* **RULE:** Do not modify credit logic without tracing: `route → service → database → frontend usage display → tests`.

---

## 13. N8N & AUTOMATION ENGINE

* **Inbound Callback (`/api/integrations/n8n/webhook-callback`):** Authenticated via HMAC SHA-256 (`x-studio-signature` / `x-hub-signature-256`) against `N8N_WEBHOOK_SECRET`. Triggers internal status transitions and notifications.
* **Outbound Webhooks (`N8nIntegration` & `N8nWebhookDelivery`):** Dispatches signed event payloads (`CONTENT_GENERATED`, `POST_PUBLISHED`, `QUALITY_ALERT`) with retry queues managed by `n8n-webhook-worker.ts`.

---

## 14. QUEUES & BACKGROUND WORKERS

### Embedded vs Standalone Workers
* **Embedded Publishing Worker:** [apps/api/src/workers/publishing-worker.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/workers/publishing-worker.ts) — Started automatically in `server.ts`. Polls and dispatches due scheduled publications (default interval: 60s).
* **Worker File Naming Notice:**
  * `generation-worker.ts` (Core job execution logic) vs `generationWorker.ts` (Standalone cluster entrypoint)
  * `publishing-worker.ts` (Embedded ticker singleton) vs `publishingWorker.ts` (Standalone cluster entrypoint)
  * **RULE:** Do not delete or merge these files without checking their standalone vs embedded execution roles.

---

## 15. DEPLOYMENT ARCHITECTURE

* **Frontend:** Next.js 16 deployed to Vercel or Node.js server.
* **Backend:** Express 4 API deployed to Render, Railway, AWS App Runner, or Docker container.
* **Database:** Managed PostgreSQL instance on Supabase.
* **Documented Production Domains:**
  * Web: `https://app.aisocialstudio.com` / `https://social-media-studio-web.vercel.app`
  * API: `https://api.aisocialstudio.com`
* **Deploy Command Sequence:**
  ```bash
  npm install
  npx prisma generate --schema=packages/database/prisma/schema.prisma
  npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
  npm run build
  ```

---

## 16. ENVIRONMENT VARIABLES MATRIX (CATEGORICAL)

> **Security Rule:** NEVER commit or store actual raw secrets in documentation or source control.

| Category | Variables | Purpose |
| :--- | :--- | :--- |
| **Core & Network** | `NODE_ENV`, `PORT`, `WEB_URL`, `FRONTEND_URL`, `API_URL`, `NEXT_PUBLIC_API_URL` | Service discovery & URLs |
| **Database** | `DATABASE_URL`, `DIRECT_URL` | PostgreSQL connection strings |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Auth & Storage keys |
| **Security & Encryption** | `USER_CREDENTIAL_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | AES-256 & Admin auth |
| **AI Providers** | `OPENAI_API_KEY`, `RUNWAY_API_KEY`, `LUMA_API_KEY`, `ELEVENLABS_API_KEY` | AI generation fallback keys |
| **Billing (Razorpay)** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_*_PLAN_ID` | SaaS subscriptions |
| **Social OAuth** | `*_CLIENT_ID`, `*_CLIENT_SECRET`, `*_REDIRECT_URI`, `META_API_VERSION`, `FACEBOOK_API_VERSION` | 8 Social platform OAuth |
| **n8n & Workers** | `N8N_WEBHOOK_SECRET`, `PUBLISHING_WORKER_INTERVAL_MS`, `REDIS_URL` | Background automation |

---

## 17. TESTING SUITE

* **Test Framework:** Vitest (`vitest.config.ts`).
* **Test Count:** 64 dedicated test files covering all phases and domains (688 tests passing 100%).
* **Test Categories:**
  * Core Domain: `brand.test.ts`, `campaign.test.ts`, `generation.test.ts`, `social-copy.test.ts`, `quality.test.ts`, `scheduling.test.ts`, `analytics.test.ts`
  * Provider Tests: `tests/providers/*-provider.test.ts` (Facebook, LinkedIn, Pinterest, Threads, TikTok, X, YouTube, Instagram)
  * Security & Billing: `auth.test.ts`, `admin-auth.test.ts`, `byok-api-keys.test.ts`, `razorpay-security.test.ts`, `free-credit-system.test.ts`, `tiered-saas.test.ts`, `production-auth-hardening.test.ts` (Phase 8A)
  * Historical Phase Tests: `tests/phase*` (Document milestone capabilities; **DO NOT delete** merely because they contain "phase").

---

## 18. KNOWN DUPLICATION / LEGACY — DO NOT CLEAN UP BLINDLY

1. **`social-engine` Code Duplication:**
   * Locations: `apps/web/lib/social-engine/` and `apps/api/src/integrations/social-engine/`.
   * Note: Both contain `account-service.ts`, `capability-registry.ts`, `content-validator.ts`, `platform-content-generator.ts`.
   * Action: Audit consumers before migrating shared definitions to `packages/shared`.
2. **Repurposing Services Divergence:**
   * Locations: `apps/api/src/services/repurposing-service.ts` vs `content-repurposing-service.ts`.
   * Action: Audit route consumers (`content.ts` vs `repurpose.ts`) before merging.
3. **Duplicate Instagram Icons:**
   * Locations: `apps/web/components/icons/InstagramIcon.tsx` vs `apps/web/components/ui/InstagramIcon.tsx`.
4. **Legacy Prisma Schema Backup:**
   * Location: `packages/database/prisma/original-schema.prisma` (98KB).
   * Note: Historical schema snapshot. Do not delete until full history review is complete.
5. **Worker Cluster Entrypoints:**
   * Locations: `generation-worker.ts` vs `generationWorker.ts`, `publishing-worker.ts` vs `publishingWorker.ts`.

---

## 19. CRITICAL FILES (EXERCISE EXTRA CAUTION)

| File Path | Why It Is Sensitive |
| :--- | :--- |
| [packages/database/prisma/schema.prisma](file:///c:/Project/AI%20Social%20Media%20Studio/packages/database/prisma/schema.prisma) | Production database contract in active sync with Supabase |
| [packages/database/prisma/migrations/*](file:///c:/Project/AI%20Social%20Media%20Studio/packages/database/prisma/migrations) | Immutable database migration history |
| [apps/api/src/services/usage-service.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/services/usage-service.ts) | Credit balances, monthly resets, and concurrency lock protection |
| [apps/api/src/utils/encryption.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/utils/encryption.ts) | AES-256-GCM encryption for user BYOK keys and OAuth tokens |
| [apps/api/src/services/admin-auth-service.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/services/admin-auth-service.ts) | PBKDF2 password hashing and stateless HMAC admin auth |
| [apps/api/src/middleware/auth.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/middleware/auth.ts) | API authentication gateway and user auto-provisioning |
| [apps/api/src/config/supabase.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/config/supabase.ts) | Supabase Admin service-role client initialization |
| [apps/api/src/server.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/api/src/server.ts) | Core HTTP server, CORS policies, and worker initialization |
| [apps/web/lib/api-client.ts](file:///c:/Project/AI%20Social%20Media%20Studio/apps/web/lib/api-client.ts) | Unified frontend HTTP client & workspace scoping |
| [apps/web/components/layout/StudioLayout.tsx](file:///c:/Project/AI%20Social%20Media%20Studio/apps/web/components/layout/StudioLayout.tsx) | Studio UI shell, workspace switching, and global navigation |

---

## 20. CURRENT BRANDING RULES

* **Brand Name:** ASM / AI Social Media Studio.
* **Logo & Visual Identity:** The existing dark luxury / gold accent visual aesthetic (`#0B0C0E`, `#F5F4F0`, `#C5A059`) and approved ASM logo files in `apps/web/public/` must be preserved.
* **Logo Modification Rule:** Do NOT redesign, replace, or add text to the approved ASM logo unless explicitly instructed.

---

## 21. DEVELOPMENT RULES FOR FUTURE AI AGENTS

1. **RULE 1:** Read `docs/PROJECT_MEMORY.md` before modifying any code.
2. **RULE 2:** Inspect existing implementations before creating new services or components.
3. **RULE 3:** Do not rebuild an existing feature from scratch.
4. **RULE 4:** Do not delete files merely because they look duplicated.
5. **RULE 5:** Before modifying a critical file, trace its imports, consumers, database models, API routes, frontend usage, and tests.
6. **RULE 6:** Preserve existing working functionality unless explicitly instructed to alter it.
7. **RULE 7:** Never expose secrets or hardcode credentials in code or documentation.
8. **RULE 8:** Never modify production database schemas or migrations without an explicit approved plan.
9. **RULE 9:** Never change authentication or security behavior casually.
10. **RULE 10:** Never modify credit or billing logic without tracing the complete usage lifecycle.
11. **RULE 11:** Before deleting or merging code, prove mathematically and factually that it is unused.
12. **RULE 12:** After meaningful code changes, run relevant tests, typechecks, and update `docs/PROJECT_MEMORY.md` & `docs/CHANGELOG.md`.
13. **RULE 13:** Prefer small, targeted changes over broad refactors.
14. **RULE 14:** Do not migrate core infrastructure (database, auth, storage) without an approved migration plan.
15. **RULE 15:** Do not claim production readiness without actual third-party API verification.

---

## 22. CHANGE MANAGEMENT WORKFLOW

### Before Change
1. Read `docs/PROJECT_MEMORY.md`.
2. Understand the requested change.
3. Inspect relevant existing implementations.
4. Trace all dependencies.
5. Identify affected files.
6. Formulate a targeted implementation plan.

### During Change
7. Make the smallest safe change.
8. Preserve unrelated functionality.
9. Do not touch unrelated files.

### After Change
10. Run relevant tests (`npm test` / `npx vitest run <file>`).
11. Run typecheck (`npm run typecheck`).
12. Verify behavior locally.
13. Update `docs/PROJECT_MEMORY.md` if architectural state changed.
14. Update `docs/CHANGELOG.md`.
15. Review `git diff`.
16. Commit only intentional changes.

---

## 23. MIGRATION HISTORY & FIREBASE STATUS

* **Current Architecture:** Supabase (Auth, Storage, PostgreSQL) is the sole active backend infrastructure.
* **Firebase Prototyping History:** A temporary Firebase migration (Phase 1) was briefly prototyped and subsequently abandoned.
* **Reversion Status:** All temporary Firebase code, routes, packages, and environment templates were completely reverted.
* **Strict Rule:** Firebase must **NOT** be reintroduced unless explicitly requested by the user. No Firebase migration is pending.

---

## 24. CURRENT KNOWN ITEMS REQUIRING FUTURE AUDIT

1. **Provider-by-Provider Live Verification:** Verify third-party OAuth app credentials and live API responses for each social platform.
2. **`social-engine` Shared Extraction:** Review consumer dependencies between `apps/web/lib/social-engine` and `apps/api/src/integrations/social-engine`.
3. **Repurposing Consolidation:** Audit `repurposing-service.ts` vs `content-repurposing-service.ts` route usage.
4. **Worker Responsibility Clarification:** Standardize standalone BullMQ entrypoints vs embedded tickers.
5. **Icon Consolidation:** Standardize `apps/web/components/icons/` vs `apps/web/components/ui/`.
6. **Supabase Service-Role Fallback Review:** Review backend fallback when `SUPABASE_SERVICE_ROLE_KEY` is missing in staging.

---

## 25. CURRENT TODO / FUTURE CLEANUP (NOT APPROVED FOR EXECUTION)

> *Notice: These items are logged for future architectural planning only. Do NOT execute without explicit user approval.*

* [ ] Perform dependency analysis to consolidate `social-engine` into `@ai-social/shared`.
* [ ] Perform route analysis to consolidate `repurposing-service.ts` into `content-repurposing-service.ts`.
* [ ] Consolidate duplicate icon components in `apps/web`.
* [ ] Review historical `original-schema.prisma` before archival.
* [ ] Verify social provider OAuth apps against current Meta, Google, TikTok, and X developer portal policies.

---

## 26. PROJECT MEMORY MAINTENANCE

* `docs/PROJECT_MEMORY.md` describes the **current living state** of the repository.
* `docs/CHANGELOG.md` records chronological version changes.
* `docs/archive/` stores historical reports. Old reports must never override the source code reality in `docs/PROJECT_MEMORY.md`.
* When the codebase evolves, `docs/PROJECT_MEMORY.md` must be updated to reflect the new truth.

---

## 27. LAST VERIFIED STATE

* **Audit Date:** 2026-09-23
* **Git Branch:** `master`
* **Audit Mode:** Fresh Evidence-Based Repository Audit & Documentation Alignment
* **Audit Result:** Verified 100% clean baseline. Full test suite passing (64 test files, 688 tests, 0 failures). TypeScript typechecks passing across API and Web.
* **Documentation Maintained:** `docs/PROJECT_MEMORY.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`, `docs/AI_AGENT_CONTEXT.md`, `README.md`, `DEPLOYMENT.md`, `docs/deployment.md`.

### Phase 8B Update — 2026-09-23
* **Phase 8B: Prisma Schema Alignment** — COMPLETE.
* `packages/database/prisma/schema.prisma` `UserUsage` model aligned with migration `1_add_permanent_and_monthly_free_credits`. All 6 columns now declared.
* `apps/api/src/services/usage-service.ts` `??` fallback workarounds removed. `StoredUserUsage` interface fields promoted from optional to required for the 4 `Int NOT NULL` columns.
* `npx prisma migrate status` → "Database schema is up to date!" (2 migrations applied).
* Full test suite: **64 test files, 688 passed (0 failures)**. Both API and web typechecks: **0 errors**.

---

## 28. PHASE 5 & AUDIT VERIFICATION FINDINGS

> **CRITICAL NOTICE FOR FUTURE AGENTS & ENGINEERS:**  
> The findings below reflect verified repository reality as of 2026-09-23.  
> Each finding is formally logged below with its verified status.

---

### HIGH PRIORITY

#### 1. Frontend Route Documentation Is Outdated
* **Claim in Earlier Documentation (§4):** Documented an inferred list of ~31 routes including `/landing`, `/privacy`, `/creatives`, `/creatives/generator`, `/content-projects`, `/campaigns/new`, `/calendar/monthly`, `/analytics/overview`, `/analytics/performance`, `/tools/hashtag-generator`, `/trends/opportunities`, and settings subroutes (`account`, `api-keys`, `notifications`, `team`).
* **Actual Repository Evidence:** The Next.js App Router tree in `apps/web/app/` contains **45 `page.tsx` routes**.
  * None of `/landing`, `/privacy`, `/creatives`, `/creatives/generator`, `/content-projects`, `/calendar/monthly`, `/analytics/overview`, `/analytics/performance` exist.
  * Active studio routes that exist in code include: `/create`, `/create/repurpose`, `/published`, `/content-review`, `/strategy`, `/strategy/pillars`, `/content-studio/[projectId]/editor`, `/calendar/ai`, `/campaigns/[id]`, `/analytics/advisor`, `/analytics/campaigns/[campaignId]`, `/analytics/media/[mediaId]`, `/tools/[toolId]`, `/trends/[id]`.
  * Active settings routes are: `/settings`, `/settings/billing`, `/settings/integrations`, `/settings/integrations/n8n`, `/settings/profile`, `/settings/social-accounts`, `/settings/workspace`.
* **Directive:** Existing repository routes in `apps/web/app/` must be treated as the sole source of truth. Section 4 has been corrected to reflect the exact 45 routes.
* **STATUS:** `DOCUMENTATION FIXED — 2026-09-23`

#### 2. Prisma Schema / Migration Mismatch
* **Claim in Earlier Documentation (§6, §12):** Claimed migration `1_add_permanent_and_monthly_free_credits` added columns `permanentCredits`, `monthlyCredits`, and `monthlyCreditsLastReset` to the active `schema.prisma`.
* **Actual Repository Evidence:**
  * Migration SQL (`packages/database/prisma/migrations/1_add_permanent_and_monthly_free_credits/migration.sql`) actually added 6 columns:
    * `permanentCreditsTotal` (INTEGER NOT NULL DEFAULT 10)
    * `permanentCreditsUsed` (INTEGER NOT NULL DEFAULT 0)
    * `monthlyCreditsAllowance` (INTEGER NOT NULL DEFAULT 3)
    * `monthlyCreditsUsed` (INTEGER NOT NULL DEFAULT 0)
    * `monthlyCycleStart` (TIMESTAMP(3))
    * `lastMonthlyReset` (TIMESTAMP(3))
  * Active `packages/database/prisma/schema.prisma` was **never updated** with these columns. The `UserUsage` model in `schema.prisma` currently declares only `freeCreditsTotal` and `freeCreditsUsed`.
  * `usage-service.ts` used to work around this discrepancy at runtime via fallback properties and in-memory caches.
* **Resolution (Phase 8B — 2026-09-23):** `schema.prisma` now declares all 6 columns matching the migration SQL. Prisma Client regenerated (v7.9.1). `??` fallback operators removed from `usage-service.ts`. `StoredUserUsage` interface updated. `npx prisma migrate status` confirms "Database schema is up to date!".
* **STATUS:** `RESOLVED — PHASE 8B — 2026-09-23`

#### 3. Backend Authentication Fallback Security Concern
* **Claim in Earlier Documentation (§7):** Described auth middleware as enforcing authentication across API routes.
* **Actual Repository Evidence & Resolution:**
  * Previously, `apps/api/src/middleware/auth.ts` lacked production guards on `x-user-id` and no-token demo fallbacks.
  * **Resolved in Phase 8A Hardening:**
    * In `apps/api/src/middleware/auth.ts`, `isProduction` check ensures `x-user-id` header is completely ignored in production, and unauthenticated requests without tokens receive `401 Unauthorized: Authentication token required`.
    * In `apps/api/src/config/supabase.ts`, `getSupabaseAdminClient()` strictly enforces valid, non-placeholder `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` in production, throwing an error on startup if missing.
    * Development and test environments retain bypasses for local testing.
    * 10 dedicated tests in `tests/production-auth-hardening.test.ts` verify production enforcement.
* **STATUS:** `HARDENED & VERIFIED — PHASE 8A`

---

### MEDIUM PRIORITY

#### 4. Runway and Luma Video Providers Are Currently Stubs
* **Claim in Earlier Documentation (§9):** Stated that `real-video-generation-service.ts` provides real video generation via Runway and Luma providers.
* **Actual Repository Evidence:** In `apps/api/src/integrations/ai/video-generation-provider.ts`, `RunwayVideoGenerationProvider` and `LumaVideoGenerationProvider` are stub classes that throw `AUTHENTICATION` ProviderErrors without external HTTP network calls. Actual video execution resolves to `MockVideoGenerationProvider`.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

#### 5. Social OAuth Callbacks Do Not Perform Code Exchange
* **Claim in Earlier Documentation (§10):** Described full OAuth flow management in `routes/integrations.ts`.
* **Actual Repository Evidence:** In `apps/api/src/routes/integrations.ts`, Facebook, LinkedIn, and Pinterest endpoints use demo client IDs (e.g. `client_id=demo_fb`, `client_id=demo_linkedin`), and callback endpoints redirect to the frontend with query parameters (e.g., `?connected=facebook`) without exchanging authorization codes for access tokens with provider APIs. Only `POST /api/integrations/connect` directly persists caller-supplied tokens.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

#### 6. `.env.example` Does Not List Every Environment Variable Referenced by Code
* **Claim in Earlier Documentation (§16):** Implied `.env.example` is complete for production configuration.
* **Actual Repository Evidence:** Over 25 environment variables referenced in code are absent from `.env.example`, including: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `REDIS_URL`, `ALLOW_HTTP_WEBHOOKS`, `ALLOW_MOCK_PROVIDERS`, `STRICT_PRODUCTION_PROVIDERS`, `META_API_VERSION`, `META_CLIENT_ID`, `FACEBOOK_APP_ID`, `GOOGLE_CLOUD_*`, and `N8N_WEBHOOK_*`. Furthermore, `GEMINI_API_KEY` and `ENABLE_BACKGROUND_PUBLISHING_WORKER` appear in `.env.example` but are unreferenced by codebase logic.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

#### 7. API Route Controller Filenames Do Not Always Correspond to Mounted Prefixes
* **Claim in Earlier Documentation (§5):** Listed 32 route files in a table implying direct route paths.
* **Actual Repository Evidence:** In `apps/api/src/server.ts`, several routers are mounted under non-obvious sub-paths:
  * `advisor.ts` is mounted at `/api/analytics/advisor` (NOT `/api/advisor`)
  * `campaign-planner.ts` is mounted at `/api/campaigns/planner` (NOT `/api/campaign-planner`)
  * `n8n.ts` is mounted at `/api/integrations/n8n` (NOT `/api/n8n`)
  * `profile.ts` is mounted on 6 paths (`/api/profile`, `/profile`, `/api/me`, `/me`, `/api/user`, `/user`)
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

---

### VERIFIED DUPLICATION / LEGACY

#### 8. API and Web Social-Engine Implementations Diverge and Are Both Consumed
* **Evidence:** The 4 files present in both directories (`account-service.ts`, `capability-registry.ts`, `content-validator.ts`, `platform-content-generator.ts`) have diverged in imports and parameters.
* **Consumers:** Web implementation is imported by `apps/web/app/(studio)/create/page.tsx`; API implementation is imported by `tests/multi-platform-e2e.test.ts` and `tests/multi-platform.test.ts`.
* **Directive:** Unsafe to delete or consolidate without refactoring consumers into `@ai-social/shared`.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

#### 9. `repurposing-service.ts` and `content-repurposing-service.ts` Have Distinct Responsibilities
* **Evidence:**
  * `repurposing-service.ts`: Single-post format transformation, consumed by `routes/content.ts`, `scripts/verify-integration.ts`, and `tests/major-features.test.ts`.
  * `content-repurposing-service.ts`: Full-package multi-platform bundle creation, consumed by `routes/repurpose.ts`, `content-project-service.ts`, `youtube-studio-service.ts`, and 5 test suites.
* **Directive:** Both are actively used. Unsafe to consolidate without updating route contracts and test suites.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

#### 10. `generation-worker.ts` and `generationWorker.ts` Have Different Roles
* **Evidence:**
  * `generation-worker.ts`: Underlying domain worker module containing BullMQ job handling and image generation run logic.
  * `generationWorker.ts`: 14-line standalone CLI executable entrypoint invoked via `apps/api/package.json` script `npm run worker:generation`.
* **Directive:** Do not delete either file. They represent different architectural execution roles.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

#### 11. `publishing-worker.ts` and `publishingWorker.ts` Have Different Roles
* **Evidence:**
  * `publishing-worker.ts`: Embedded database-polling interval ticker started directly by `apps/api/src/server.ts` (`startPublishingWorker()`).
  * `publishingWorker.ts`: Standalone CLI executable entrypoint invoked via `apps/api/package.json` script `npm run worker:publishing`.
* **Directive:** Do not delete either file. They represent different architectural execution topologies.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

#### 12. `ui/InstagramIcon.tsx` Is Identical to `icons/InstagramIcon.tsx` with Zero Consumers
* **Evidence:** `apps/web/components/ui/InstagramIcon.tsx` and `apps/web/components/icons/InstagramIcon.tsx` are byte-for-byte identical. `components/icons/InstagramIcon.tsx` is imported by 3 studio pages; `components/ui/InstagramIcon.tsx` has 0 consumers across the codebase.
* **Directive:** Flagged for safe removal during future cleanup phase.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

#### 13. `original-schema.prisma` Is Currently Unreferenced
* **Evidence:** `packages/database/prisma/original-schema.prisma` (98 KB) is a legacy backup snapshot. It is completely unreferenced by package scripts, Prisma configs, migration scripts, or source code.
* **Directive:** Flagged for archival or removal after full repository cleanup planning.
* **STATUS:** `DOCUMENTED — NOT YET FIXED`

