# Phase 8C: Credit Lifecycle Dual-Pool Implementation Report

> **Date:** 2026-09-29  
> **Status:** Implementation Complete & Fully Verified  
> **Branch:** `master`  
> **Repository:** `rkjrohitjaiswal/Social-Media-Studio`  
> **Reference Audit:** `docs/archive/PHASE_8C_CREDIT_LIFECYCLE_AUDIT_2026-09-28.md` (Commit: `41f5989`)  

---

## 1. Problem

The Phase 8C Credit Lifecycle Audit revealed that while database migration `1_add_permanent_and_monthly_free_credits` introduced dual-pool columns (`permanentCreditsTotal`, `permanentCreditsUsed`, `monthlyCreditsAllowance`, `monthlyCreditsUsed`, `monthlyCycleStart`, `lastMonthlyReset`), the application logic in `usage-service.ts` still operated on a unified single balance (`freeCreditsTotal` and `freeCreditsUsed`).

Specifically:
- New users were provisioned with 10 permanent credits instead of 0 permanent and 10 monthly credits.
- Admin credit grants artificially boosted `monthlyCreditsAllowance` or overwrote monthly balances rather than adding permanent non-expiring credits.
- Admin grants and plan updates failed to invalidate in-memory cache entries, leading to stale reads.
- Monthly resets clobbered permanent credit balances and wiped out admin grants.
- Plan allowances were duplicated with conflicting numbers across `plans.ts`, `admin.ts`, and `admin/page.tsx`.
- Credit consumption had race conditions with unsynchronized reads/writes and inconsistent lock keys (workspace ID vs user ID).

---

## 2. Root Cause

1. **Incomplete Migration Adoption:** The columns were created in SQL migration 1 and exposed via Prisma in Phase 8B, but `usage-service.ts` had not been refactored to treat monthly allowances and permanent credits as separate ledger pools.
2. **Coupled Reset Trigger:** A defensive check `record.freeCreditsTotal !== currentAllowance` was triggering unintended resets whenever admin credits were granted, wiping usage records or corrupting allowances.
3. **Lock Key Mismatch:** `withLock(userIdOrWorkspaceId)` allowed one request to lock on `workspaceId` and another to lock on `userId` for the same user, bypassing mutual exclusion.
4. **Hardcoded Frontend Discrepancies:** Frontend admin tables and billing pages hardcoded outdated credit tiers rather than consuming canonical figures from `packages/shared/src/schemas/plans.ts`.

---

## 3. Corrected Model

A deterministic **Dual-Pool Ledger System** was implemented:

```
┌─────────────────────────────────────────────────────────────┐
│                       USER USAGE                            │
├──────────────────────────────┬──────────────────────────────┤
│         MONTHLY POOL         │        PERMANENT POOL        │
├──────────────────────────────┼──────────────────────────────┤
│ monthlyCreditsAllowance      │ permanentCreditsTotal        │
│ monthlyCreditsUsed           │ permanentCreditsUsed         │
├──────────────────────────────┼──────────────────────────────┤
│ monthlyRemaining =           │ permanentRemaining =         │
│   max(0, allowance - used)   │   max(0, total - used)       │
└──────────────────────────────┴──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ totalRemaining = monthlyRemaining + permanentRemaining      │
└─────────────────────────────────────────────────────────────┘
```

Backward compatibility is maintained by computing the legacy fields:
- `freeCreditsTotal = monthlyCreditsAllowance + permanentCreditsTotal`
- `freeCreditsUsed = monthlyCreditsUsed + permanentCreditsUsed`
- `freeCreditsRemaining = totalRemaining`

---

## 4. Monthly Pool Behavior

- **Initial State (FREE users):**
  - Month 1: `monthlyCreditsAllowance = 10`, `monthlyCreditsUsed = 0`
  - Month 2 onward: `monthlyCreditsAllowance = 3`, `monthlyCreditsUsed = 0`
- **Paid Plans:**
  - Monthly allowance is looked up directly from `SAAS_PLANS_REGISTRY` in `packages/shared/src/schemas/plans.ts` (e.g., PRO: 50, ADVANCED: 150, PREMIUM: 300, BUSINESS: 500).
- **Reset Logic:**
  - Triggers automatically when current time >= `addMonths(monthlyCycleStart, 1)`.
  - Sets `monthlyCreditsAllowance = canonicalPlanAllowance`.
  - Sets `monthlyCreditsUsed = 0`.
  - Updates `monthlyCycleStart` to current cycle boundary and records `lastMonthlyReset`.
  - **No rollover:** Unused monthly credits expire at cycle boundary.
  - **Permanent pool isolation:** Monthly reset **NEVER** modifies `permanentCreditsTotal` or `permanentCreditsUsed`.

---

## 5. Permanent Pool Behavior

- **Initial State:** Regular new users start with `permanentCreditsTotal = 0`, `permanentCreditsUsed = 0`.
- **Sources:** Admin grants (`POST /api/admin/users/:id/credits`) and future top-up packages.
- **Persistence:**
  - Never resets or expires at monthly cycle transitions.
  - Survives subscription upgrades, downgrades, cancellations, and renewals.
  - Only increases via admin grant or explicit top-up; usage only increases via consumption spillover.

---

## 6. Consumption Order (Monthly-First)

Credit consumption follows a deterministic monthly-first priority:

1. Calculate available balances:
   - `monthlyRemaining = max(0, monthlyCreditsAllowance - monthlyCreditsUsed)`
   - `permanentRemaining = max(0, permanentCreditsTotal - permanentCreditsUsed)`
   - `totalRemaining = monthlyRemaining + permanentRemaining`
2. If `totalRemaining < requestedCost`:
   - Reject request immediately with HTTP 402 `PLAN_LIMIT_REACHED`. No partial consumption.
3. If sufficient:
   - `consumeFromMonthly = min(cost, monthlyRemaining)`
   - `consumeFromPermanent = cost - consumeFromMonthly`
   - Increment `monthlyCreditsUsed += consumeFromMonthly`
   - Increment `permanentCreditsUsed += consumeFromPermanent`

---

## 7. Admin Grants

- Endpoint: `POST /api/admin/users/:id/credits`
- Action:
  - Validates positive integer grant.
  - Calls `grantPermanentCredits(userId, amount)`.
  - Increments `permanentCreditsTotal` in database and memory.
  - Does NOT alter `monthlyCreditsAllowance` or `monthlyCreditsUsed`.
  - Logs action to `AdminAuditLog`.
  - Immediately invalidates in-memory usage cache via `invalidateUserUsageCache(userId)`.

---

## 8. Concurrency & Atomicity Strategy

1. **Canonical Identity Resolution:**
   - Added `resolveCanonicalUserId(userIdOrWorkspaceId)`.
   - Before acquiring mutex lock, converts any `workspaceId` to the workspace owner's `userId`.
   - Ensures all concurrent requests for the same account lock on identical mutex keys.
2. **Database Transactions with Increment:**
   - In `consumeUsage`, updates are written inside `prisma.$transaction`.
   - Employs atomic `{ increment: consumeFromMonthly }` and `{ increment: consumeFromPermanent }` statements.
   - Database remains the ultimate authority across multi-instance server deployments.

---

## 9. API Changes

- **Route:** `GET /api/usage` and `GET /api/workspaces/:workspaceId/usage`
- Returns enriched, semantically explicit JSON:
  ```json
  {
    "success": true,
    "usage": {
      "monthlyAllowance": 10,
      "monthlyUsedCredits": 2,
      "monthlyRemainingCredits": 8,
      "permanentTotalCredits": 25,
      "permanentUsedCredits": 0,
      "permanentRemainingCredits": 25,
      "totalRemainingCredits": 33,
      "usedCredits": 2,
      "remainingCredits": 33,
      "freeCreditsTotal": 35,
      "freeCreditsUsed": 2,
      "freeCreditsRemaining": 33
    }
  }
  ```
- **Route:** `GET /api/admin/users`
  - Returns unified credits aggregated correctly across both pools: `credits: { total, used, remaining }`.

---

## 10. Frontend Changes

1. **Admin Page (`apps/web/app/(studio)/admin/page.tsx`):**
   - Corrected plan credit allowances in Plan Tier Badges to match `SAAS_PLANS_REGISTRY` (FREE: 10/3, PRO: 50, ADVANCED: 150, PREMIUM: 300, BUSINESS: 500).
   - Clarified admin credit adjustment modal: labeled "Permanent Bonus Credits to Add" with explicit guidance that credits never expire.
2. **Settings/Billing Page (`apps/web/app/(studio)/settings/billing/page.tsx`):**
   - Remaining Credits card displays `totalRemaining` and explicit pool breakdown (`X monthly + Y permanent`).
3. **Usage Widget & Studio Header (`UsageWidget.tsx`, `StudioLayout.tsx`):**
   - Displays `totalRemainingCredits` as primary balance.
   - Shows badge indicator `(+Y perm)` and tooltip breakdown when permanent credits exist.
   - Preserves all ASM branding and visual aesthetics.

---

## 11. Test Coverage

`tests/free-credit-system.test.ts` was expanded to 20 comprehensive scenarios covering all Section 13 requirements:
1. New FREE user receives 10 monthly credits, 0 permanent credits, total 10.
2. Consume 1 monthly credit.
3. Consume all 10 Month-1 monthly credits.
4. 11th request blocked when no permanent credits exist.
5. Month-2 reset: monthly allowance = 3, monthly used = 0.
6. Month-2 reset preserves permanent credits.
7. Admin grants 25 permanent credits.
8. Admin grant survives another API usage read.
9. Admin grant survives monthly reset.
10. Monthly-first consumption.
11. Monthly exhaustion spills into permanent pool.
12. Permanent-only consumption after monthly exhaustion.
13. Insufficient combined balance rejects the operation.
14. Usage API reports distinct monthly/permanent/total values.
15. Plan allowance comes from canonical registry.
16. Upgrade preserves permanent credits.
17. Downgrade/expiry preserves permanent credits.
18. Concurrent consumption cannot double-spend the same credit.
19. Admin credit cache invalidation works.
20. No monthly rollover.

---

## 12. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| **Credit Test Suite** | `npx vitest run tests/free-credit-system.test.ts` | **20/20 passed** (100%) |
| **Full Workspace Test Suite** | `npx vitest run` | **64 test files, 700 tests passed (100%)** |
| **API Typecheck** | `npm run typecheck --workspace=@ai-social/api` | **0 errors (Pass)** |
| **Web Typecheck** | `npm run typecheck --workspace=@ai-social/web` | **0 errors (Pass)** |
| **Root Typecheck** | `npm run typecheck` | **All 4 workspaces clean (Pass)** |
| **Prisma Schema Status** | `npx prisma migrate status` | **Up to date** (no migrations needed) |

---

## 13. Files Changed

1. `apps/api/src/services/usage-service.ts` — Dual-pool calculation, monthly reset preservation, monthly-first consumption, canonical identity resolution, cache invalidation, Prisma transaction.
2. `apps/api/src/routes/usage.ts` — Serializes distinct monthly, permanent, and aggregate credit metrics.
3. `apps/api/src/routes/admin.ts` — Admin grants target permanent pool; canonical plans integration; cache invalidation.
4. `apps/api/src/services/subscription-service.ts` — Dual-pool preservation on subscription changes.
5. `apps/api/src/middleware/auth.ts` — Initial provisioning assigns 10 monthly / 0 permanent.
6. `apps/web/app/(studio)/admin/page.tsx` — Aligned plan tiers with canonical registry; labeled permanent credits modal.
7. `apps/web/app/(studio)/settings/billing/page.tsx` — Dual-pool breakdown display.
8. `apps/web/components/UsageWidget.tsx` — Dual-pool breakdown in studio header widget.
9. `apps/web/components/layout/StudioLayout.tsx` — Dual-pool tooltip and badge in sidebar/header.
10. `tests/free-credit-system.test.ts` — 20 rigorous test scenarios.

---

## 14. Database / Migration Status

- **Status:** NO new migrations created or needed.
- **Safety:** Schema columns added in Migration 1 and aligned in Phase 8B (`permanentCreditsTotal`, `permanentCreditsUsed`, `monthlyCreditsAllowance`, `monthlyCreditsUsed`, `monthlyCycleStart`, `lastMonthlyReset`) were fully utilized without modifying existing tables or dropping legacy columns.
- Zero production data loss; backward compatibility preserved.

---

## 15. Remaining Known Limitations

- Multi-region horizontal scaling: Memory mutex operates within a single node process; database atomic increments protect data consistency at the SQL level across instances, but high-concurrency cross-instance mutual exclusion can optionally be supplemented with a distributed lock (e.g. Redis) if multi-node write contention becomes high.
