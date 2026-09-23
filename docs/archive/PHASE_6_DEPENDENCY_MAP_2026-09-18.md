# Phase 6 — File-by-File Dependency / Reference Map

> **Permanent Project Reference Document**  
> **Repository:** `rkjrohitjaiswal/Social-Media-Studio`  
> **Audit Date:** 2026-09-18  
> **Git Head:** `4e0aaa3a09e0cd5c85ce7973a36b122722069ead` (Branch: `master`)  
> **Audit Mode:** Strictly Read-Only Dependency & Reference Graph Analysis  
> **Notice:** This document is an analysis-only map. No source files, configurations, schemas, or dependencies were altered.

---

## 1. Audit Scope

| Dimension | Count / Detail |
| :--- | :--- |
| **Git Commit Audited** | `4e0aaa3a09e0cd5c85ce7973a36b122722069ead` |
| **Git Branch** | `master` |
| **Audit Date** | 2026-09-18 |
| **Monorepo Workspaces** | `apps/api`, `apps/web`, `packages/shared`, `packages/database`, `packages/config` |
| **Total Source Files Inspected** | **310 files** |
| `apps/api/src/` | 120 TypeScript source files across 8 architectural subdirectories |
| `apps/web/` | 78 source files (48 App Router files, 13 UI/studio components, 12 lib files, 5 configs) |
| `packages/shared/src/` | 28 schema and type definition files |
| `packages/database/` | 6 database schema, migration, and client initialization files |
| `packages/config/` | 2 shared configuration files |
| `scripts/` | 3 utility and QA runner scripts |
| `tests/` | 63 Vitest test suites (56 root tests + 7 provider integration tests) |

---

## 2. Executive Summary

Phase 6 established a complete, file-by-file dependency and reference map across all workspaces in the AI Social Media Studio monorepo. 

### Key Structural Discoveries:
1. **API Layer Decoupling:** The Express backend (`apps/api`) is cleanly structured into 32 route controllers, 32 domain services (+4 trend providers), 11 background workers, and 3 BullMQ queues. Route controllers cleanly delegate business logic to domain services, with zero business logic implemented directly in controllers.
2. **Dual Execution Worker Model:** There are two distinct worker execution paths:
   - **Embedded Interval Ticker:** `publishing-worker.ts` runs directly inside the API Express process, started by `server.ts`. It polls the database every interval for due publications and does not require Redis.
   - **Standalone Worker Clusters:** `generationWorker.ts`, `publishingWorker.ts`, and `analyticsWorker.ts` are standalone CLI executables invoked via package scripts (`npm run worker:*`).
3. **Queue Infrastructure Status:** The 3 queue definitions in `apps/api/src/queues/` (`analyticsQueue.ts`, `generationQueue.ts`, `publishingQueue.ts`) configure BullMQ on Redis. However, active job execution currently uses internal in-memory queues and DB state tracking in `generation-worker.ts`, `quality-worker.ts`, and `social-copy-worker.ts`. The BullMQ queue files represent prepared infrastructure for distributed deployments.
4. **Dual `social-engine` Implementations:** The two `social-engine` directories serve distinct layers:
   - `apps/web/lib/social-engine/` provides client-side schema validation and live preview generation in the browser for `apps/web/app/(studio)/create/page.tsx`.
   - `apps/api/src/integrations/social-engine/` provides backend social platform adapters, AES token decryption, publishing orchestration, and analytics polling.
5. **Frontend API Communication:** In `apps/web`, 37 client helper functions in `lib/api-client.ts` handle structured API requests with automatic `x-workspace-id` and Bearer token injection. Pages making ad-hoc fetch requests import `getAuthHeader()` from `api-client.ts`.
6. **Isolated Unused Files:** Strong static evidence of zero consumers was confirmed for:
   - `apps/web/components/ui/InstagramIcon.tsx` (identical to `components/icons/InstagramIcon.tsx`)
   - `packages/database/prisma/original-schema.prisma` (legacy backup snapshot)
   - `apps/api/src/utils/logger.ts` (application uses `console.log` directly)
   - `apps/web/components/studio/BulkImageUploader.tsx` (authored component not linked to a page)
   - `apps/web/components/UsageWidget.tsx` (authored widget; `StudioLayout.tsx` renders credits directly via `useStudio()`)

---

## 3. API Dependency Map (`apps/api/src/`)

### 3.1 Server Bootstrap & Configuration

| File | Role | Imports | Consumers / Callers | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `server.ts` | Server bootstrap & router mounting | Express, cors, dotenv, all 32 route routers, `publishing-worker.js`, `admin-auth-service.js` | Main entrypoint for `npm run dev:api`, `npm start` | **ACTIVE** | Registers health check `GET /health` and mounts 32 routers. Starts `publishing-worker.ts` on boot. |
| `config/billing.ts` | Razorpay plan & price constants | None | `services/usage-service.ts`, `routes/billing.ts` | **ACTIVE** | Defines `PRO_MONTHLY_PRICE_INR` (59), `ADVANCED` (99), `PREMIUM` (149), `BUSINESS` (299), and plan IDs. |
| `config/provider-config.ts` | AI and social provider env readiness | `integrations/ai/provider.js` | `routes/integrations.ts`, `services/credential-resolver.ts` | **ACTIVE** | Maps required env vars per provider and exposes `getProviderConfigStatus()`. |
| `config/supabase.ts` | Supabase Admin Service-Role client | `@supabase/supabase-js`, `dotenv` | `middleware/auth.ts`, `routes/upload.ts`, `integrations/ai/generation.ts` | **ACTIVE** | Singleton `getSupabaseAdminClient()` for service-role access. |

### 3.2 Middleware

| File | Role | Imports | Consumers / Callers | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `middleware/auth.ts` | JWT / HMAC authentication & user provisioning | `express`, `config/supabase.js`, `@ai-social/database`, `services/admin-auth-service.js` | All 32 route files via `requireAuth` and `requireAdmin` | **ACTIVE** | Validates Supabase JWTs, admin `adm_` tokens, handles `x-user-id` and demo workspace fallbacks. |
| `middleware/rate-limiter.ts` | Express IP/workspace rate limiter | `express` | `routes/integrations.ts`, `routes/content.ts` | **ACTIVE** | In-memory token bucket rate limiter. |

### 3.3 Route Controllers (`apps/api/src/routes/`)

All 32 route files reside in `apps/api/src/routes/` and are registered in `server.ts`.

| Route File | Registered Mount Prefix | Middleware | Imported Services | Covered in Tests |
| :--- | :--- | :--- | :--- | :--- |
| `admin.ts` | `/api/admin` | `requireAuth`, `requireAdmin` | `@ai-social/database`, `admin-auth-service.ts`, `usage-service.ts` | `admin-auth.test.ts`, `admin-dashboard.test.ts` |
| `advisor.ts` | `/api/analytics/advisor` | `requireAuth` | `advisor-service.ts` | `phase2e-analytics.test.ts`, `phase3-production-analytics.test.ts` |
| `analytics.ts` | `/api/analytics` | `requireAuth` | `analytics-service.ts`, `performance-service.ts`, `@ai-social/database` | `analytics.test.ts`, `phase2e-analytics.test.ts` |
| `approval-links.ts` | `/api/approval-links` | Public / Tokenized | `approval-service.ts` | `phase2d-approvals.test.ts` |
| `approvals.ts` | `/api/approvals` | `requireAuth` | `approval-service.ts`, `@ai-social/database` | `phase2d-approvals.test.ts` |
| `billing.ts` | `/api/billing` | `requireAuth` (webhooks bypass) | `subscription-service.ts`, `config/billing.ts` | `saas-platform.test.ts`, `tiered-saas.test.ts`, `razorpay-security.test.ts` |
| `brand.ts` | `/api/brand` | `requireAuth` | `brand-service.ts`, `@ai-social/database` | `brand.test.ts`, `phase1-features.test.ts` |
| `calendar.ts` | `/api/calendar` | `requireAuth` | `@ai-social/database`, `trends/trend-service.ts` | `scheduling.test.ts`, `phase2d-publishing.test.ts` |
| `campaign-planner.ts` | `/api/campaigns/planner` | `requireAuth` | `trends/trend-service.ts`, `@ai-social/database` | `phase1-features.test.ts`, `phase2c-trends.test.ts` |
| `campaigns.ts` | `/api/campaigns` | `requireAuth` | `@ai-social/database` | `campaign.test.ts`, `phase1-features.test.ts` |
| `content-projects.ts` | `/api/content-projects` | `requireAuth` | `content-project-service.ts`, `youtube-studio-service.ts`, `@ai-social/database` | `phase3-content-command-center.test.ts` |
| `content.ts` | `/api/content` | `requireAuth`, `rateLimiter` | `repurposing-service.ts`, `usage-service.ts` | `phase1-features.test.ts`, `major-features.test.ts` |
| `creatives.ts` | `/api/creatives` | `requireAuth` | `creative-generation-service.ts`, `usage-service.ts` | `phase3-multi-image-generation.test.ts`, `phase3-real-creative-engine.test.ts` |
| `goals.ts` | `/api/goals` | `requireAuth` | `@ai-social/database` | `phase2a-features.test.ts` |
| `integrations.ts` | `/api/integrations` | `requireAuth`, `rateLimiter` | `social-account-service.ts`, `config/provider-config.ts`, `utils/encryption.ts` | `phase2e-social-accounts.test.ts`, `multi-platform.test.ts` |
| `invitations.ts` | `/api/invitations` | `requireAuth` | `workspace-service.ts` | `phase2d-workspaces.test.ts` |
| `n8n.ts` | `/api/integrations/n8n` | `requireAuth` (HMAC for webhooks) | `n8n-inbound-service.ts`, `@ai-social/database` | `n8n.test.ts`, `phase2d-n8n-webhooks.test.ts`, `phase2f-n8n-inbound.test.ts` |
| `notifications.ts` | `/api/notifications` | `requireAuth` | `notification-service.ts` | `phase2d-approvals.test.ts` |
| `profile.ts` | `/api/profile` (+5 aliases) | `requireAuth` | `@ai-social/database`, `admin-auth-service.ts` | `auth.test.ts`, `admin-auth.test.ts` |
| `publishing.ts` | `/api/publishing` | `requireAuth` | `publishing-service.ts`, `workers/publishing-worker.ts` | `phase2d-publishing.test.ts`, `phase2e-publishing-execution.test.ts` |
| `repurpose.ts` | `/api/repurpose` | `requireAuth` | `content-repurposing-service.ts`, `usage-service.ts` | `phase3-content-repurposing.test.ts`, `phase3-production-readiness.test.ts` |
| `saved.ts` | `/api/saved` | `requireAuth` | `@ai-social/database` | `phase2a-features.test.ts` |
| `search.ts` | `/api/search` | `requireAuth` | `@ai-social/database` | `phase2a-features.test.ts` |
| `settings.ts` | `/api/settings` | `requireAuth` | `credential-resolver.ts`, `workspace-service.ts` | `byok-api-keys.test.ts`, `phase2d-workspaces.test.ts` |
| `strategy.ts` | `/api/strategy` | `requireAuth` | `@ai-social/database` | `phase2a-features.test.ts` |
| `templates.ts` | `/api/templates` | `requireAuth` | `@ai-social/database` | `phase2a-features.test.ts` |
| `tools.ts` | `/api/tools` | `requireAuth` | `smart-caption-service.ts`, `usage-service.ts` | `phase2a-features.test.ts` |
| `trends.ts` | `/api/trends` | `requireAuth` | `trends/trend-service.ts` | `phase2c-trends.test.ts` |
| `upload.ts` | `/api/upload` | `requireAuth` | `config/supabase.ts` | `phase1-features.test.ts` |
| `usage.ts` | `/api/usage` | `requireAuth` | `usage-service.ts`, `entitlement-service.ts` | `free-credit-system.test.ts`, `phase2f-usage-metering.test.ts` |
| `video.ts` | `/api/video` | `requireAuth` | `smart-video-orchestration-service.ts`, `real-video-generation-service.ts`, `video-script-service.ts` | `phase3-ai-video.test.ts`, `phase3-video-composition.test.ts` |
| `workspaces.ts` | `/api/workspaces` | `requireAuth` | `workspace-service.ts` | `phase2d-workspaces.test.ts` |

### 3.4 Domain Services (`apps/api/src/services/`)

| Service File | Primary Responsibility | Downstream Dependencies | Direct Consumers | Test Coverage |
| :--- | :--- | :--- | :--- | :--- |
| `admin-auth-service.ts` | PBKDF2 hashing & HMAC tokens | `crypto`, `@ai-social/database` | `server.ts`, `middleware/auth.ts`, `routes/admin.ts`, `routes/profile.ts` | `admin-auth.test.ts` |
| `advisor-service.ts` | AI Content Strategy Advisor | `@ai-social/database` | `routes/advisor.ts`, `scripts/verify-integration.ts` | `phase2e-analytics.test.ts` |
| `analytics-service.ts` | Analytics aggregation & metrics | `@ai-social/database` | `routes/analytics.ts` | `analytics.test.ts` |
| `approval-service.ts` | Approval workflow & tokens | `@ai-social/database`, `webhook-service.ts` | `routes/approvals.ts`, `routes/approval-links.ts`, `scripts/verify-integration.ts` | `phase2d-approvals.test.ts` |
| `brand-service.ts` | Brand kit guidelines & visual anchors | `@ai-social/database` | `routes/brand.ts`, `scripts/verify-integration.ts` | `brand.test.ts` |
| `content-project-service.ts` | Content project lifecycle | `content-repurposing-service.ts`, `@ai-social/database` | `routes/content-projects.ts` | `phase3-content-command-center.test.ts` |
| `content-repurposing-service.ts`| Full package repurposing | `@ai-social/database`, `@ai-social/shared` | `routes/repurpose.ts`, `content-project-service.ts`, `youtube-studio-service.ts` | 5 test suites (Phase 3) |
| `creative-generation-service.ts`| Multi-image batch orchestration | `integrations/ai/generation.ts`, `@ai-social/database` | `routes/creatives.ts` | `phase3-multi-image-generation.test.ts` |
| `credential-resolver.ts` | BYOK key resolution & encryption | `utils/encryption.ts`, `@ai-social/database` | `routes/settings.ts`, `integrations/ai/generation.ts`, `scripts/verify-integration.ts` | `byok-api-keys.test.ts` |
| `entitlement-service.ts` | Plan tier to feature mapping | `subscription-service.ts`, `@ai-social/shared` | `routes/usage.ts`, `services/usage-service.ts`, `routes/content.ts` | `tiered-saas.test.ts` |
| `long-form-content-service.ts` | Text chunking & blog extraction | `@ai-social/shared` | `content-project-service.ts` | `phase3-content-command-center.test.ts` |
| `long-form-video-service.ts` | Video scene detection & frames | `ffmpeg` | `video-composition-service.ts` | `phase3-video-composition.test.ts` |
| `music-service.ts` | Background audio track catalog | None | `video-composition-service.ts` | `phase3-video-composition.test.ts` |
| `n8n-inbound-service.ts` | Webhook verification & processing | `@ai-social/database`, `n8n/security.ts` | `routes/n8n.ts` | `phase2f-n8n-inbound.test.ts` |
| `notification-service.ts` | In-app workspace notifications | `@ai-social/database` | `routes/notifications.ts`, `publishing-service.ts` | `phase2d-approvals.test.ts` |
| `payment-provider.ts` | Payment provider abstraction | None | `subscription-service.ts` | `saas-platform.test.ts` |
| `performance-service.ts` | Performance score calculations | `@ai-social/database` | `routes/analytics.ts` | `phase2b-performance.test.ts` |
| `publishing-service.ts` | Scheduled post executor & dispatch | `social-account-service.ts`, `integrations/social-engine/publishing-service.ts`, `@ai-social/database` | `workers/publishing-worker.ts`, `routes/publishing.ts` | `phase2d-publishing.test.ts`, `phase2e-publishing-execution.test.ts` |
| `razorpay-adapter.ts` | Low-level Razorpay API calls | `crypto`, `config/billing.ts` | `subscription-service.ts` | `razorpay-security.test.ts` |
| `real-video-generation-service.ts`| Video generation job dispatch | `integrations/ai/video-generation-provider.ts` | `routes/video.ts` | `phase3-real-video-generation.test.ts` |
| `repurposing-service.ts` | Single-post format adaptation | None (Pure algorithms) | `routes/content.ts`, `scripts/verify-integration.ts` | `major-features.test.ts` |
| `smart-caption-service.ts` | AI caption and hashtag suggestions | `integrations/ai/text-provider.ts` | `routes/tools.ts` | `social-copy.test.ts` |
| `smart-video-orchestration-service.ts`| Video pipeline orchestration | `video-composition-service.ts`, `voiceover-service.ts` | `routes/video.ts` | `phase3-ai-video.test.ts` |
| `social-account-service.ts` | Social account OAuth token storage | `utils/encryption.ts`, `@ai-social/database` | `routes/integrations.ts`, `publishing-service.ts` | `phase2e-social-accounts.test.ts` |
| `subscription-service.ts` | Razorpay subscription lifecycle | `razorpay-adapter.ts`, `config/billing.ts`, `@ai-social/database` | `routes/billing.ts`, `entitlement-service.ts`, `scripts/verify-integration.ts` | `saas-platform.test.ts`, `tiered-saas.test.ts` |
| `usage-service.ts` | **Credit metering & concurrency lock** | `entitlement-service.ts`, `@ai-social/database` | `routes/usage.ts`, `middleware/auth.ts`, `routes/content.ts`, `routes/creatives.ts`, `routes/repurpose.ts`, `routes/tools.ts`, `scripts/verify-integration.ts` | `free-credit-system.test.ts`, `phase2f-usage-metering.test.ts` |
| `video-composition-service.ts` | Video rendering with FFmpeg | `fluent-ffmpeg`, `ffmpeg-static` | `smart-video-orchestration-service.ts` | `phase3-video-composition.test.ts` |
| `video-script-service.ts` | AI video storyboard generator | `integrations/ai/text-provider.ts` | `routes/video.ts` | `phase3-ai-video.test.ts` |
| `voiceover-service.ts` | ElevenLabs TTS synthesis | `fetch` to ElevenLabs API | `smart-video-orchestration-service.ts` | `phase3-audio-captions-text.test.ts` |
| `webhook-service.ts` | Outbound HTTP webhook delivery | `fetch`, `crypto` | `publishing-service.ts`, `approval-service.ts` | `phase2d-n8n-webhooks.test.ts` |
| `workspace-service.ts` | Workspace multi-tenant operations | `@ai-social/database` | `routes/workspaces.ts`, `routes/invitations.ts`, `routes/settings.ts`, `scripts/verify-integration.ts` | `phase2d-workspaces.test.ts` |
| `youtube-studio-service.ts` | YouTube video upload orchestration | `content-repurposing-service.ts`, `integrations/social-engine/providers/youtube-provider.ts` | `routes/content-projects.ts` | `phase3-youtube-publishing.test.ts`, `phase4-first-real-youtube-publish.test.ts` |
| `trends/trend-service.ts` | Aggregated trend provider | `google-trends-provider.ts`, `null-trend-provider.ts`, `@ai-social/database` | `routes/trends.ts`, `routes/calendar.ts`, `routes/campaign-planner.ts` | `phase2c-trends.test.ts` |
| `trends/google-trends-provider.ts`| Google Trends data provider | `@google-cloud/bigquery` | `trends/trend-service.ts` | `phase2c-trends.test.ts` |
| `trends/null-trend-provider.ts` | Fallback simulated trend data | None | `trends/trend-service.ts` | `phase2c-trends.test.ts` |
| `trends/trend-source-interface.ts`| Interface for trend providers | None | `trends/trend-service.ts`, `trends/*-provider.ts` | `phase2c-trends.test.ts` |

### 3.5 Utilities (`apps/api/src/utils/`)

| File | Role | Exports | Consumers | Status |
| :--- | :--- | :--- | :--- | :--- |
| `utils/encryption.ts` | AES-256-GCM encryption & HMAC | `encryptSecret`, `decryptSecret`, `generateSignedOAuthState`, `verifyOAuthState` | `services/credential-resolver.ts`, `services/social-account-service.ts`, `routes/integrations.ts`, `social-engine/account-service.ts` | **ACTIVE (CRITICAL)** |
| `utils/logger.ts` | Structured JSON application logger | `Logger` class | None | **POSSIBLY UNUSED** (codebase uses `console.log`) |
| `utils/rate-limiter.ts` | Rate limiting helper | Rate limit classes | `middleware/rate-limiter.ts` | **ACTIVE** |

---

## 4. Frontend Dependency Map (`apps/web/`)

### 4.1 Complete 45-Page App Router Route Inventory

Every `page.tsx` under `apps/web/app/` is mapped below:

| # | Page File Path | Route Path | Direct Components / Imports | API Endpoints Called | Auth Requirement | Linked In Nav |
| :- | :--- | :--- | :--- | :--- | :--- | :-: |
| 1 | `app/page.tsx` | `/` | Root entry router | Redirects to `/dashboard` or `/login` | Public | N/A |
| 2 | `app/(auth)/admin/login/page.tsx` | `/admin/login` | Form inputs, buttons, `apiClient.adminLogin` | `POST /api/admin/login` | Public | No |
| 3 | `app/(auth)/forgot-password/page.tsx` | `/forgot-password` | Supabase auth client | Supabase Auth API | Public | Via Login |
| 4 | `app/(auth)/login/page.tsx` | `/login` | Supabase auth client | Supabase Auth API | Public | Landing / Layout |
| 5 | `app/(auth)/signup/page.tsx` | `/signup` | Supabase auth client | Supabase Auth API | Public | Landing / Login |
| 6 | `app/(marketing)/page.tsx` | `/` | Marketing landing UI | None (Static presentation) | Public | Root |
| 7 | `app/(marketing)/about/page.tsx` | `/about` | Marketing UI | None | Public | Footer |
| 8 | `app/(marketing)/pricing/page.tsx` | `/pricing` | Pricing cards, Razorpay checkout | None (Static pricing) | Public | Header / Footer |
| 9 | `app/(studio)/admin/page.tsx` | `/admin` | Admin dashboard, users table, audit logs | `/api/admin/stats`, `/api/admin/users`, `/api/admin/users/:id/credits`, `/api/admin/audit-logs` | Admin HMAC Session | User Menu (Admin) |
| 10 | `app/(studio)/analytics/page.tsx` | `/analytics` | Overview cards, time series, patterns | `/api/analytics/overview`, `/api/analytics/media`, `/api/analytics/timeseries`, `/api/analytics/best-posting-time` | Protected (Studio) | Sidebar (`INSIGHTS`) |
| 11 | `app/(studio)/analytics/advisor/page.tsx` | `/analytics/advisor` | Advisor advice cards | `getPerformanceAdvisorReport()` -> `/api/analytics/advisor` | Protected (Studio) | Analytics Page |
| 12 | `app/(studio)/analytics/campaigns/[campaignId]/page.tsx` | `/analytics/campaigns/:campaignId` | Campaign performance metrics | `/api/analytics/campaigns/:campaignId` | Protected (Studio) | Analytics Page |
| 13 | `app/(studio)/analytics/media/[mediaId]/page.tsx` | `/analytics/media/:mediaId` | Media asset performance, `InstagramIcon` | `/api/analytics/media/:mediaId` | Protected (Studio) | Analytics Page |
| 14 | `app/(studio)/approvals/page.tsx` | `/approvals` | Approval cards, `InstagramIcon`, `queue-types` | `/api/approvals`, `/api/approvals/:id/approve` | Protected (Studio) | Studio Home |
| 15 | `app/(studio)/brand/page.tsx` | `/brand` | Brand kit editor, guideline anchors | `getBrandProfile()`, `saveBrandProfile()` | Protected (Studio) | Studio Home |
| 16 | `app/(studio)/calendar/page.tsx` | `/calendar` | Scheduled post calendar view | `/api/calendar` | Protected (Studio) | Redirects to `/calendar/ai` |
| 17 | `app/(studio)/calendar/ai/page.tsx` | `/calendar/ai` | AI calendar planner, post composer | `/api/calendar/plan`, `/api/calendar/scheduled`, `/api/calendar/schedule`, `/api/publishing/execute-due` | Protected (Studio) | Sidebar (`PUBLISH`) |
| 18 | `app/(studio)/campaigns/page.tsx` | `/campaigns` | Campaigns grid | `useStudio()` context | Protected (Studio) | Studio Home |
| 19 | `app/(studio)/campaigns/planner/page.tsx` | `/campaigns/planner` | 30-day AI campaign generator | `/api/campaigns/planner/generate` | Protected (Studio) | Campaigns Page |
| 20 | `app/(studio)/campaigns/[id]/page.tsx` | `/campaigns/:id` | Campaign detail, `queue-types` | `useStudio()` context | Protected (Studio) | Campaigns Grid |
| 21 | `app/(studio)/content-review/page.tsx` | `/content-review` | Asset review and approval workflow | `useStudio()` context | Protected (Studio) | Studio Home |
| 22 | `app/(studio)/content-studio/page.tsx` | `/content-studio` | Content project dashboard | `/api/content-projects` | Protected (Studio) | Sidebar (`WORKSPACE`) |
| 23 | `app/(studio)/content-studio/[projectId]/editor/page.tsx` | `/content-studio/:projectId/editor` | Multi-format content editor | `/api/content-projects/:projectId` | Protected (Studio) | Content Studio |
| 24 | `app/(studio)/create/page.tsx` | `/create` | `MultiImageCreativeStudio`, `platform-content-generator` | `getApiKeys()`, `/api/creatives/generate` | Protected (Studio) | Sidebar (`CREATE`) |
| 25 | `app/(studio)/create/repurpose/page.tsx` | `/create/repurpose` | Repurposing wizard | `repurposeContent()` -> `/api/content/repurpose` | Protected (Studio) | Create Page |
| 26 | `app/(studio)/dashboard/page.tsx` | `/dashboard` | Metrics overview, quick actions, `queue-types` | `useStudio()` context | Protected (Studio) | Sidebar (`WORKSPACE`) |
| 27 | `app/(studio)/goals/page.tsx` | `/goals` | Milestone target tracker | `/api/goals/run` | Protected (Studio) | Studio Home |
| 28 | `app/(studio)/published/page.tsx` | `/published` | Published post list & retry trigger | `/api/calendar/scheduled`, `/api/publishing/execute-due` | Protected (Studio) | Sidebar (`PUBLISH`) |
| 29 | `app/(studio)/repurpose/page.tsx` | `/repurpose` | Full package repurposing studio | `/api/repurpose` | Protected (Studio) | Sidebar (`CREATE`) |
| 30 | `app/(studio)/saved/page.tsx` | `/saved` | Saved assets and inspiration items | `/api/saved` | Protected (Studio) | Studio Home |
| 31 | `app/(studio)/settings/page.tsx` | `/settings` | General settings overview | `useStudio()` context | Protected (Studio) | User Menu |
| 32 | `app/(studio)/settings/billing/page.tsx` | `/settings/billing` | Razorpay plan manager | `getBillingStatus()`, `cancelSubscription()` | Protected (Studio) | User Menu / Nav |
| 33 | `app/(studio)/settings/integrations/page.tsx`| `/settings/integrations` | Instagram connection, `InstagramIcon` | `/api/integrations/instagram`, `/api/integrations/instagram/connect` | Protected (Studio) | Settings Menu |
| 34 | `app/(studio)/settings/integrations/n8n/page.tsx` | `/settings/integrations/n8n` | n8n automation webhook config | `/api/integrations/n8n/webhook-url` | Protected (Studio) | Integrations Page |
| 35 | `app/(studio)/settings/profile/page.tsx` | `/settings/profile` | User avatar, name, password | `/api/settings/profile`, `/api/settings/change-password` | Protected (Studio) | User Menu |
| 36 | `app/(studio)/settings/social-accounts/page.tsx` | `/settings/social-accounts` | Multi-platform connections & BYOK | `/api/integrations/accounts`, `/api/integrations/connect`, `/api/settings/api-keys` | Protected (Studio) | Sidebar (`CONNECT`) |
| 37 | `app/(studio)/settings/workspace/page.tsx` | `/settings/workspace` | Workspace team members & switching | `/api/workspaces`, `/api/workspaces/switch` | Protected (Studio) | Workspace Dropdown |
| 38 | `app/(studio)/strategy/page.tsx` | `/strategy` | Content strategy generator | `/api/strategy`, `/api/strategy/generate` | Protected (Studio) | Studio Home |
| 39 | `app/(studio)/strategy/pillars/page.tsx` | `/strategy/pillars` | Content pillar manager | `/api/strategy/pillars` | Protected (Studio) | Strategy Page |
| 40 | `app/(studio)/templates/page.tsx` | `/templates` | Reusable post template library | `/api/saved` | Protected (Studio) | Studio Home |
| 41 | `app/(studio)/tools/page.tsx` | `/tools` | Tools catalog | `useStudio()` context | Protected (Studio) | Studio Home |
| 42 | `app/(studio)/tools/[toolId]/page.tsx` | `/tools/:toolId` | Standalone tool executor (Hashtag, etc.) | `/api/tools/:toolId/execute` | Protected (Studio) | Tools Catalog |
| 43 | `app/(studio)/trends/page.tsx` | `/trends` | Trend explorer | `/api/trends`, `/api/trends/:id/generate` | Protected (Studio) | Studio Home |
| 44 | `app/(studio)/trends/[id]/page.tsx` | `/trends/:id` | Trend angle recommendation & scheduling | `/api/trends/:id`, `/api/calendar/add-trend` | Protected (Studio) | Trends Page |
| 45 | `app/approval/[token]/page.tsx` | `/approval/:token` | Client feedback & review portal | `getPublicApprovalLink()`, `reviewPublicApproval()` | **Public (Tokenized)** | External link |

### 4.2 Web Components Inventory (`apps/web/components/`)

| Component | Directory | Direct Consumers | Role & Responsibility | Status |
| :--- | :--- | :--- | :--- | :--- |
| `StudioLayout.tsx` | `components/layout/` | `app/(studio)/layout.tsx` | Shared sidebar navigation, topbar, workspace selector, notification center, profile menu | **ACTIVE (CORE)** |
| `Sidebar.tsx` | `components/layout/` | Optional legacy sidebar | Alternative desktop navigation sidebar | **ACTIVE** |
| `Navbar.tsx` | `components/layout/` | Marketing layouts | Marketing header navigation with links to login/pricing | **ACTIVE** |
| `GlobalSearchModal.tsx` | `components/studio/` | `StudioLayout.tsx` | Global search modal querying `GET /api/search` (triggered via Cmd+K) | **ACTIVE** |
| `ReferenceImageInput.tsx` | `components/studio/` | `MultiImageCreativeStudio.tsx` | Image upload with preview calling `uploadReferenceImage()` | **ACTIVE** |
| `BulkImageUploader.tsx` | `components/studio/` | None | Standalone batch image uploader component with drag-and-drop | **POSSIBLY UNUSED** |
| `MultiImageCreativeStudio.tsx`| `components/` | `app/(studio)/create/page.tsx` | Multi-image creative studio for batch generations | **ACTIVE** |
| `ShortVideoStudio.tsx` | `components/` | Dynamic studio feature | Short video generation studio interface | **ACTIVE** |
| `UsageWidget.tsx` | `components/` | None | Standalone credit progress widget (`StudioLayout` renders credits inline) | **POSSIBLY UNUSED** |
| `InstagramIcon.tsx` | `components/icons/` | `analytics/media/[mediaId]/page.tsx`, `approvals/page.tsx`, `settings/integrations/page.tsx` | Canonical SVG icon for Instagram platform | **ACTIVE** |
| `InstagramIcon.tsx` | `components/ui/` | None (0 consumers) | Byte-for-byte duplicate of `components/icons/InstagramIcon.tsx` | **LEGACY DUPLICATE** |
| `button.tsx`, `card.tsx`, etc. | `components/ui/` | Various studio pages | Design system primitive UI components | **ACTIVE** |

### 4.3 Web Libraries (`apps/web/lib/`)

| Library File | Runtime | Key Exports | Consumers | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| `api-client.ts` | Browser & SSR | 37 typed API helper functions, `getAuthHeader()` | `StudioLayout.tsx`, `studio-context.tsx`, 16+ studio pages | Attaches active `x-workspace-id` and Bearer JWT / admin session tokens to all backend HTTP requests |
| `studio-context.tsx` | Browser (`"use client"`) | `StudioProvider`, `useStudio()` | `app/(studio)/layout.tsx`, 20+ studio pages | Global React context managing active workspace, brand kit, notifications, usage credits, and mock state |
| `razorpay-checkout.ts` | Browser | `openRazorpayCheckout()` | `app/(studio)/settings/billing/page.tsx` | Injects Razorpay script, opens checkout modal, calls `verifyPayment()` |
| `mock-data.ts` | Browser | `INITIAL_BRANDS`, `MOCK_CAMPAIGNS`, `MOCK_SCHEDULED_POSTS` | `studio-context.tsx` | Baseline demo state for newly initialized workspaces |
| `queue-types.ts` | Browser | `QueueJobState`, `QueueRunState`, `GenerationAsset` | `approvals/page.tsx`, `campaigns/[id]/page.tsx`, `dashboard/page.tsx`, `settings/integrations/page.tsx` | Frontend type definitions for queue tracking |
| `supabase/client.ts` | Browser | `createClient()` | `StudioLayout.tsx`, `studio-context.tsx`, `api-client.ts`, auth pages | Browser-side Supabase client using anon key |
| `supabase/server.ts` | Server | `createClient()` | Server Actions, RSCs | Server-side Supabase client with cookie storage |
| `supabase/middleware.ts`| Server (Edge) | `updateSession()` | `apps/web/middleware.ts` | Refreshes auth session cookies, enforces route protection, handles `dev_bypass` |
| `social-engine/account-service.ts` | Browser | `SocialAccountService` | Client-side social state | Sanitizes social account data for browser display |
| `social-engine/capability-registry.ts` | Browser | `getPlatformCapabilities` | `content-validator.ts` | Client-side platform capability lookup |
| `social-engine/content-validator.ts` | Browser | `validatePlatformContent` | `platform-content-generator.ts` | Validates character lengths, image ratios, and hashtags |
| `social-engine/platform-content-generator.ts`| Browser | `generatePlatformContent` | `app/(studio)/create/page.tsx` | Generates formatted post drafts in client UI |

---

## 5. Shared Packages & Database Map

### 5.1 `packages/shared`

Single source of truth for schemas, types, and DTO contracts.

```
packages/shared/src/
├── index.ts                     Re-exports all schemas and types
├── types/
│   ├── index.ts                 Shared TypeScript types
│   └── notification.ts          Notification DTO contracts
└── schemas/
    ├── ai-providers.ts          AI generation parameters & responses
    ├── api-keys.ts              BYOK API credential schemas
    ├── approval.ts              Approval request & review schemas
    ├── auth.ts                  Login, signup, user session schemas
    ├── billing.ts               Subscription & checkout schemas
    ├── brand.ts                 Brand kit schema
    ├── brand-profile.ts         Brand voice & visual anchor schemas
    ├── campaign.ts              Campaign creation & asset schemas
    ├── campaign-planner.ts      30-day campaign plan schemas
    ├── content-project.ts       Content package & project schemas
    ├── creative-generation.ts   Batch creative generation schemas
    ├── goals.ts                 Social target milestone schemas
    ├── performance.ts           Performance score schemas
    ├── plans.ts                 SAAS_PLANS_REGISTRY & plan definitions
    ├── repurposing.ts           Single-post repurposing schemas
    ├── repurposing-package.ts   Multi-platform package schemas
    ├── saved.ts                 Saved item schemas
    ├── strategy.ts              Strategy & content pillar schemas
    ├── templates.ts             Post template schemas
    ├── tools.ts                 Utility tool execution schemas
    ├── trends.ts                Trend & opportunity schemas
    ├── video-composition.ts     Video rendering schemas
    ├── video-generation.ts      Video generation job schemas
    ├── video-script.ts          Video script & storyboard schemas
    └── workspace.ts             Workspace CRUD & invitation schemas
```

- **Consumers:** Heavily imported by both `apps/api` (route validations, service inputs) and `apps/web` (form schemas, API client types).

### 5.2 `packages/database`

- **Authoritative Schema:** `packages/database/prisma/schema.prisma`
  - Defines 50 database models.
  - Multi-tenant root: `Workspace` (scoped by `x-workspace-id`).
  - Active migrations:
    1. `0_baseline`: Initial multi-tenant schema.
    2. `1_add_permanent_and_monthly_free_credits`: Adds 6 columns to `UserUsage` in PostgreSQL.
- **Prisma Client Factory (`packages/database/src/index.ts`):**
  - Creates pooled connection via `@prisma/adapter-pg` and `pg.Pool`.
  - Implements a resilient Proxy fallback: if the database is offline or unconfigured, gracefully returns resolved empty promises instead of crashing the Node.js process.
- **Legacy Snapshot:** `packages/database/prisma/original-schema.prisma`
  - 98 KB historical snapshot.
  - Confirmed 0 references across source code, build scripts, migrations, or Prisma configuration.

---

## 6. Worker Dependency Map

Background worker files in `apps/api/src/workers/` follow distinct execution roles:

```
apps/api/src/workers/
├── Embedded In-Process Worker:
│   └── publishing-worker.ts      Started by server.ts on boot (setInterval database polling ticker)
├── Standalone CLI Cluster Entrypoints:
│   ├── generationWorker.ts       CLI script (npm run worker:generation) -> triggers generation cluster
│   ├── publishingWorker.ts       CLI script (npm run worker:publishing) -> triggers publishing cluster
│   └── analyticsWorker.ts        CLI script (npm run worker:analytics) -> triggers analytics cluster
└── Underlying Domain Job Modules:
    ├── generation-worker.ts      Image generation run orchestration & job state management
    ├── instagram-worker.ts       Direct Meta container publishing & post status polling
    ├── instagram-scheduler-worker.ts Checks due scheduled posts for Instagram accounts
    ├── instagram-analytics-worker.ts Polls Meta Graph API for media insights & audience metrics
    ├── n8n-webhook-worker.ts     Dispatches asynchronous outbound webhooks to n8n workflows
    ├── quality-worker.ts         AI visual & copy quality assessment worker
    └── social-copy-worker.ts     AI caption & hashtag generation worker
```

### Detailed Worker Breakdown:

| Worker File | Execution Role | Invoked By | Downstream Calls | Test Coverage |
| :--- | :--- | :--- | :--- | :--- |
| `publishing-worker.ts` | **Embedded Ticker** | `apps/api/src/server.ts` line 155 | `services/publishing-service.ts` (`executeDueScheduledPosts`) | `phase2f-cron-worker.test.ts`, `phase3-production-launch.test.ts` |
| `publishingWorker.ts` | **Standalone CLI** | `package.json` (`npm run worker:publishing`) | `instagram-worker.ts`, `instagram-scheduler-worker.ts` | None (CLI wrapper) |
| `generationWorker.ts` | **Standalone CLI** | `package.json` (`npm run worker:generation`) | `generation-worker.ts`, `social-copy-worker.ts`, `quality-worker.ts` | None (CLI wrapper) |
| `analyticsWorker.ts` | **Standalone CLI** | `package.json` (`npm run worker:analytics`) | `instagram-analytics-worker.ts` | None (CLI wrapper) |
| `generation-worker.ts` | **Domain Module** | `generationWorker.ts`, tests | `@ai-social/database`, `integrations/ai/generation.ts` | `generation.test.ts`, `byok-api-keys.test.ts`, `e2e-workflow.test.ts` |
| `instagram-worker.ts` | **Domain Module** | `publishingWorker.ts`, `services/publishing-service.ts` | `integrations/instagram/provider.ts`, `@ai-social/database` | `instagram.test.ts`, `phase2d-publishing.test.ts` |
| `instagram-scheduler-worker.ts`| **Domain Module** | `publishingWorker.ts` | `@ai-social/database`, `instagram-worker.ts` | `scheduling.test.ts` |
| `instagram-analytics-worker.ts`| **Domain Module** | `analyticsWorker.ts` | `integrations/instagram/analytics-provider.ts`, `@ai-social/database` | `analytics.test.ts` |
| `n8n-webhook-worker.ts` | **Domain Module** | `services/publishing-service.ts`, `services/approval-service.ts` | `integrations/n8n/security.ts`, `fetch` | `n8n.test.ts`, `phase2d-n8n-webhooks.test.ts` |
| `quality-worker.ts` | **Domain Module** | `generationWorker.ts` | `integrations/ai/quality-provider.ts`, `@ai-social/database` | `quality.test.ts` |
| `social-copy-worker.ts` | **Domain Module** | `generationWorker.ts` | `integrations/ai/text-provider.ts`, `@ai-social/database` | `social-copy.test.ts` |

---

## 7. Provider & Integration Dependency Map

### 7.1 AI Providers (`apps/api/src/integrations/ai/`)

| Provider File | Implementation | Real API Client? | Fallback Behavior | Consumers |
| :--- | :--- | :--- | :--- | :--- |
| `provider.ts` | `OpenAIImageProvider` | **YES** (`fetch` to `api.openai.com/v1/images/edits`) | Simulated binary buffer if key is missing/placeholder | `generation.ts` |
| `text-provider.ts` | `OpenAITextProvider` | **YES** (`fetch` to `api.openai.com/v1/chat/completions`) | Simulated structured JSON copy if key is missing | `social-copy-worker.ts`, `video-script-service.ts`, `smart-caption-service.ts` |
| `video-generation-provider.ts` | `RunwayVideoGenerationProvider` | **NO (STUB)** (Throws `AUTHENTICATION` ProviderError) | Handled by `MockVideoGenerationProvider` | `real-video-generation-service.ts` |
| `video-generation-provider.ts` | `LumaVideoGenerationProvider` | **NO (STUB)** (Throws `AUTHENTICATION` ProviderError) | Handled by `MockVideoGenerationProvider` | `real-video-generation-service.ts` |
| `video-generation-provider.ts` | `MockVideoGenerationProvider` | **YES (SIMULATED)** | Returns completed video metadata with simulated MP4 URL | `real-video-generation-service.ts` |
| `quality-provider.ts` | `AIQualityProvider` | **YES (HEURISTIC)** | Image composition & rule-based scoring | `quality-worker.ts` |

### 7.2 Social Platform Adapters (`apps/api/src/integrations/social-engine/providers/`)

All adapters implement `SocialPlatformProvider` and register with `providerRegistry`:

```
providerRegistry
├── InstagramAdapter      ──> MetaInstagramProvider (apps/api/src/integrations/instagram/provider.ts)
├── FacebookAdapter       ──> Meta Graph API v25.0 (live fetch / mock fallback)
├── YouTubeAdapter        ──> Google YouTube Data API v3 (live upload / mock fallback)
├── LinkedInAdapter       ──> LinkedIn REST API v202604 (live post / mock fallback)
├── ThreadsAdapter        ──> Meta Threads API (live container / mock fallback)
├── PinterestAdapter      ──> Pinterest API v5 (live pin create / mock fallback)
├── TikTokAdapter         ──> TikTok Content Posting API v2 (live upload / mock fallback)
├── XAdapter              ──> X (Twitter) API v2 + v1.1 Media Upload (live tweet / mock fallback)
└── MultiProviders        ──> Stubs for Reddit, Bluesky, Telegram, Mastodon, Discord
```

- **Consumer:** `services/publishing-service.ts` resolves providers via `providerRegistry.getProvider(platform)` during publication execution.

---

## 8. Route → Service → Integration Flow

### Flow 1: Multi-Image AI Generation
```
Browser: User clicks "Generate" on apps/web/app/(studio)/create/page.tsx
  ↓ HTTP POST /api/creatives/generate
API: apps/api/src/routes/creatives.ts
  ↓ checkUsageAccess(userId, "CONTENT_GENERATION")
API: apps/api/src/services/usage-service.ts (Validates balance via withLock)
  ↓ createCreativeBatchJob()
API: apps/api/src/services/creative-generation-service.ts
  ↓ executeSingleJob()
API: apps/api/src/integrations/ai/generation.ts
  ↓ getUserOpenAIApiKey(userId) (Resolves encrypted BYOK key or fallback)
API: apps/api/src/services/credential-resolver.ts
  ↓ generateFromReferenceAndInput()
API: apps/api/src/integrations/ai/provider.ts (OpenAIImageProvider)
  ↓ Live fetch -> api.openai.com/v1/images/edits (or Simulated fallback)
  ↓ consumeUsageCredits(userId, 1)
Database: Prisma UserUsage record updated
  ↓ HTTP 201 Response with generated image URLs
Browser: Renders generated image in Studio preview grid
```

### Flow 2: Scheduled Post Publication
```
API Boot: apps/api/src/server.ts calls startPublishingWorker()
  ↓ setInterval tick every 10s (PUBLISHING_WORKER_INTERVAL_MS)
Worker: apps/api/src/workers/publishing-worker.ts calls executeDueScheduledPosts()
  ↓ Database Query: findMany ScheduledPublication where status = "SCHEDULED" and scheduledTime <= now
API: apps/api/src/services/publishing-service.ts
  ↓ resolveSocialAccount() -> decrypts access token via utils/encryption.ts
  ↓ providerRegistry.getProvider(platform)
API: apps/api/src/integrations/social-engine/providers/provider-registry.ts
  ↓ adapter.publish(params) (e.g. InstagramAdapter, LinkedInAdapter, YouTubeAdapter)
External: Meta Graph API / LinkedIn API / YouTube API
  ↓ Update ScheduledPublication status = "PUBLISHED", record externalPostId
  ↓ createNotification(workspaceId, "Post Published Successfully")
Database: Prisma ScheduledPublication & Notification records updated
```

### Flow 3: Content Repurposing (Single-Post vs Full-Package)
```
[Single-Post Path]:
Browser: /create/repurpose
  ↓ HTTP POST /api/content/repurpose
Route: routes/content.ts -> repurposing-service.ts (pure text format adaptation)
  ↓ Formats caption/hashtags for target platform
  ↓ Returns adapted post string

[Full-Package Path]:
Browser: /repurpose
  ↓ HTTP POST /api/repurpose
Route: routes/repurpose.ts -> content-repurposing-service.ts
  ↓ Checks credit balance via usage-service.ts
  ↓ Generates multi-platform bundle (Instagram, LinkedIn, X, YouTube, TikTok)
  ↓ Persists package in DB via content-project-service.ts
  ↓ Returns full content package DTO
```

---

## 9. Duplicate / Divergent / Legacy Candidates

| Item | Locations | Classification | Current Consumer Evidence | Assessment & Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **Social Engine** | `apps/web/lib/social-engine/` & `apps/api/src/integrations/social-engine/` | **DIVERGENT BUT INTENTIONAL** | Web: `(studio)/create/page.tsx`<br>API: Provider test suites & adapters | Web version is browser-safe UI generator. API version contains server encryption, n8n dispatch, and live providers. **DO NOT DELETE.** Later extraction to `@ai-social/shared` recommended. |
| **Repurposing Services** | `repurposing-service.ts` & `content-repurposing-service.ts` | **ACTIVE** | `repurposing-service.ts`: `routes/content.ts`, scripts, 2 tests<br>`content-repurposing-service.ts`: `routes/repurpose.ts`, 2 services, 5 tests | Different scopes (single-post formatting vs full multi-platform packages). Both actively consumed. **DO NOT CONSOLIDATE PREMATURELY.** |
| **Generation Workers** | `generation-worker.ts` & `generationWorker.ts` | **ACTIVE** | `generationWorker.ts`: `package.json` CLI entrypoint<br>`generation-worker.ts`: Domain module imported by CLI and tests | Complementary roles: CLI entrypoint vs underlying domain logic. **DO NOT DELETE.** |
| **Publishing Workers** | `publishing-worker.ts` & `publishingWorker.ts` | **ACTIVE** | `publishing-worker.ts`: `server.ts` embedded interval ticker<br>`publishingWorker.ts`: `package.json` CLI entrypoint | Distinct execution topologies (in-process timer vs standalone cluster). **DO NOT DELETE.** |
| **Instagram Icon** | `apps/web/components/ui/InstagramIcon.tsx` & `apps/web/components/icons/InstagramIcon.tsx` | **LEGACY CANDIDATE** | `components/icons/`: 3 studio pages<br>`components/ui/`: 0 consumers | Both are 100% byte-for-byte identical. `components/ui/InstagramIcon.tsx` has zero consumers. Safe to remove in future cleanup. |
| **Prisma Legacy Schema** | `packages/database/prisma/original-schema.prisma` | **LEGACY CANDIDATE** | 0 consumers in code, scripts, or package configs | 98 KB historical backup snapshot. Unreferenced by any tooling. Safe to archive or remove in future cleanup. |
| **Logger Utility** | `apps/api/src/utils/logger.ts` | **POSSIBLY UNUSED** | 0 consumers across API routes and services | Authored logger utility with sanitization; codebase currently uses `console.log` / `console.error` directly. Preserve or adopt across services. |
| **Bulk Image Uploader** | `apps/web/components/studio/BulkImageUploader.tsx` | **POSSIBLY UNUSED** | 0 consumers across studio pages | Fully implemented batch uploader component not currently wired into an active page. |
| **Usage Widget** | `apps/web/components/UsageWidget.tsx` | **POSSIBLY UNUSED** | 0 consumers across studio pages | Standalone usage widget; `StudioLayout.tsx` renders usage credits directly via `useStudio()`. |
| **BullMQ Queues** | `apps/api/src/queues/` (`analyticsQueue.ts`, `generationQueue.ts`, `publishingQueue.ts`) | **POSSIBLY UNUSED / PREPARED INFRASTRUCTURE** | 0 imports from active routes or workers | BullMQ queues configured for Redis; current runtime uses in-memory async dispatch and embedded tickers. Keep for Redis cluster scaling. |

---

## 10. Unused File Candidates

Files with confirmed **zero consumers** across all source files, scripts, and package configurations:

1. `apps/web/components/ui/InstagramIcon.tsx` (Duplicate of `components/icons/InstagramIcon.tsx` which is actively used)
2. `packages/database/prisma/original-schema.prisma` (Legacy snapshot; active schema is `schema.prisma`)
3. `apps/api/src/utils/logger.ts` (0 imports; services use `console.log`)
4. `apps/web/components/studio/BulkImageUploader.tsx` (0 imports across pages)
5. `apps/web/components/UsageWidget.tsx` (0 imports across pages)

---

## 11. Dynamic, Runtime, and String References

The following references cannot be detected via standard static ESM `import` statements and must be handled carefully:

1. **Next.js Filesystem Dynamic Routes:**
   - `apps/web/app/(studio)/campaigns/[id]/page.tsx`
   - `apps/web/app/(studio)/analytics/campaigns/[campaignId]/page.tsx`
   - `apps/web/app/(studio)/analytics/media/[mediaId]/page.tsx`
   - `apps/web/app/(studio)/content-studio/[projectId]/editor/page.tsx`
   - `apps/web/app/(studio)/tools/[toolId]/page.tsx`
   - `apps/web/app/(studio)/trends/[id]/page.tsx`
   - `apps/web/app/approval/[token]/page.tsx`
   - *Targeted dynamically via template string URLs, e.g. ``router.push(`/campaigns/${campaign.id}`)``.*
2. **Express Dynamic Route Parameters:**
   - Routes bind parameters such as `:id`, `:toolId`, `:trendId`, `:approvalId` at runtime via `req.params`.
3. **Dynamic Provider Resolution:**
   - `resolveVideoGenerationProvider(providerName)` dynamically instantiates `RunwayVideoGenerationProvider`, `LumaVideoGenerationProvider`, or `MockVideoGenerationProvider` based on runtime string input.
   - `providerRegistry.getProvider(platform)` dynamically resolves social platform adapters by string enum key.
4. **Supabase Storage Paths:**
   - Paths constructed dynamically via template strings: ``reference-images/${userId}/${timestamp}_${sanitizedName}``.
5. **Package Workspaces:**
   - Workspaces resolved dynamically via npm workspaces configuration in root `package.json`.

---

## 12. Risk Assessment

| Risk Level | Components / Areas | Rationale |
| :--- | :--- | :--- |
| **HIGH** | `usage-service.ts`, `schema.prisma`, `auth.ts`, `encryption.ts` | Any modification directly impacts billing credit deduction, database transaction isolation, user authentication, or data decryption. High risk of introducing double-spend bugs or security bypasses. |
| **HIGH** | `publishing-service.ts`, `publishing-worker.ts`, `social-account-service.ts` | Manages live social media publishing, OAuth refresh tokens, and scheduled publication dispatch. |
| **MEDIUM** | `content-repurposing-service.ts`, `repurposing-service.ts`, `social-engine/` | Interdependent between web draft previews and backend package generation. Consolidation requires synchronizing frontend and backend interfaces. |
| **MEDIUM** | `api-client.ts`, `StudioLayout.tsx`, `studio-context.tsx` | Core frontend state management. Changes affect all studio routes. |
| **LOW** | `components/ui/InstagramIcon.tsx`, `original-schema.prisma` | Zero consumers. Strongly isolated legacy/duplicate candidates with zero runtime impact if removed. |
| **LOW** | `BulkImageUploader.tsx`, `UsageWidget.tsx`, `logger.ts` | Isolated authored components/utilities with zero active consumers. |

---

## 13. Recommended Phase 7 Work

*(Ordered by dependency risk — for future planning only; not executed in this phase)*:

1. **Phase 7.1 — Zero-Risk Legacy Cleanup (LOW RISK):**
   - Safely remove `apps/web/components/ui/InstagramIcon.tsx` (confirmed 0 consumers; `components/icons/` is authoritative).
   - Archive or remove `packages/database/prisma/original-schema.prisma` (confirmed 0 references).
2. **Phase 7.2 — Schema / Migration Synchronization (HIGH RISK — REQUIRES ISOLATED PLAN):**
   - Align `packages/database/prisma/schema.prisma` with migration `1_add_permanent_and_monthly_free_credits` to formally declare the 6 credit columns on `UserUsage`.
   - Run `npx prisma generate` in an isolated validation branch to regenerate Prisma types without affecting production data.
3. **Phase 7.3 — Backend Authentication Hardening (HIGH RISK — REQUIRES ISOLATED PLAN):**
   - Add explicit `process.env.NODE_ENV !== "production"` guards around the `x-user-id` header override and the `!token` demo workspace fallback in `apps/api/src/middleware/auth.ts`.
4. **Phase 7.4 — Social Engine Shared Extraction (MEDIUM RISK):**
   - Extract shared types and validation schemas from `apps/web/lib/social-engine/` and `apps/api/src/integrations/social-engine/` into `packages/shared`.
5. **Phase 7.5 — Environment Configuration Completeness (LOW RISK):**
   - Update `.env.example` to document the 25+ currently unlisted operational environment variables.

---

## 14. Verification Limitations

1. **Runtime Network Calls:** Third-party OAuth token exchanges and live social publishing could not be tested against production social platforms (Meta, LinkedIn, YouTube, TikTok, X) because live API keys and OAuth client secrets are not configured in this local verification environment.
2. **Redis Execution:** BullMQ workers were evaluated via code and package scripts; live Redis clustering was not started as no active Redis server was running locally.
3. **Browser E2E Execution:** Playwright browser QA scripts (`scripts/run-browser-qa.ts`) were mapped via static analysis and not executed against a running web server during this read-only audit.
