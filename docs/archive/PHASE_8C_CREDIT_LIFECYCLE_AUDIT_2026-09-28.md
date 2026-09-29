# Phase 8C — Credit Lifecycle Audit Report
**Date:** 2026-09-28  
**Author:** AI Agent (Antigravity)  
**Status:** AUDIT COMPLETE — IMPLEMENTATION PENDING  
**Verified Checkpoint:** Git Commit `0ffb087`, Branch `master`  
**Prerequisites:** Phase 8A (Auth Hardening: COMPLETE), Phase 8B (Prisma Schema Alignment: COMPLETE)

---

## 1. Audit Scope

This audit evaluates the end-to-end credit lifecycle across the entire AI Social Media Studio codebase. It analyzes how user credits are initialized, accumulated, consumed, reset, granted via administrative tools, and synchronized between the database, in-memory caches, backend API routes, and the frontend web studio.

The audit was performed under strict non-destructive constraints:
- **No source code modified**
- **No Prisma schema modified**
- **No migrations created or executed**
- **No tests modified or executed**
- **No frontend components modified**
- **No database records altered**
- **No git commits or branch modifications performed**

The objective is to establish the exact delta between the conceptual credit architecture (First Month: 10 credits; Subsequent Months: 3 credits; Permanent/Admin Credits: non-expiring additive pool) and the actual source code implementation.

---

## 2. Files Inspected

| Category | File Path | Key Inspected Areas |
| :--- | :--- | :--- |
| **Database** | `packages/database/prisma/schema.prisma` | `UserUsage`, `Subscription`, `AdminAuditLog` models |
| **Database** | `packages/database/prisma/migrations/1_add_permanent_and_monthly_free_credits/migration.sql` | Original SQL schema alterations |
| **Backend Core** | `apps/api/src/services/usage-service.ts` | Credit stores, cycle math, reset logic, consumption lock |
| **Backend Core** | `apps/api/src/services/subscription-service.ts` | Subscription status, billing cache, plan lookups |
| **Backend Core** | `apps/api/src/services/entitlement-service.ts` | Tier hierarchy, feature gating, account limits |
| **Backend Routes**| `apps/api/src/routes/usage.ts` | `/api/usage` handler, field serialization |
| **Backend Routes**| `apps/api/src/routes/admin.ts` | Admin user listing, `/credits` adjustment, subscription grants |
| **Backend Routes**| `apps/api/src/routes/billing.ts` | Checkout, Razorpay webhook, payment verification |
| **Backend Auth**  | `apps/api/src/middleware/auth.ts` | User provisioning, usage initialization on signup |
| **Backend Auth**  | `apps/api/src/services/admin-auth-service.ts` | Initial admin account usage record creation |
| **Shared Schemas**| `packages/shared/src/schemas/plans.ts` | `SAAS_PLANS_REGISTRY`, tier allowances |
| **Shared Schemas**| `packages/shared/src/schemas/billing.ts` | `BillingStatusResponse`, checkout schemas |
| **Frontend Lib**  | `apps/web/lib/api-client.ts` | `fetchUserUsage`, `adjustUserCredits`, API client contracts |
| **Frontend Lib**  | `apps/web/lib/studio-context.tsx` | Studio context provider, usage polling/caching |
| **Frontend UI**   | `apps/web/components/UsageWidget.tsx` | Usage progress bar, credit exhaust alerts |
| **Frontend UI**   | `apps/web/components/layout/StudioLayout.tsx` | Header credit badge and modal triggers |
| **Frontend UI**   | `apps/web/app/(studio)/settings/billing/page.tsx`| Subscription management, credit allowance cards |
| **Frontend UI**   | `apps/web/app/(studio)/admin/page.tsx` | Admin user table, adjust credits modal |
| **Tests**         | `tests/free-credit-system.test.ts` | Single-balance monthly cycle tests |
| **Tests**         | `tests/tiered-saas.test.ts` | Tiered plan limits, sequential consumption |
| **Tests**         | `tests/phase2f-usage-metering.test.ts` | Metering, publishing execution deduction |
| **Tests**         | `tests/admin-dashboard.test.ts` | Mock calculation assertions for admin tools |

---

## 3. Credit Data Model

The database model declared in `packages/database/prisma/schema.prisma` contains 8 credit-tracking columns:

```prisma
model UserUsage {
  id                      String    @id @default(uuid())
  userId                  String    @unique
  freeCreditsTotal        Int       @default(10)
  freeCreditsUsed         Int       @default(0)
  permanentCreditsTotal   Int       @default(10)
  permanentCreditsUsed    Int       @default(0)
  monthlyCreditsAllowance Int       @default(3)
  monthlyCreditsUsed      Int       @default(0)
  monthlyCycleStart       DateTime?
  lastMonthlyReset        DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  user                    User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

### Reality of the Underlying Data Model
While the database schema has fields suggesting two distinct pools:
1. A **Permanent Pool** (`permanentCreditsTotal`, `permanentCreditsUsed`)
2. A **Monthly Cyclical Pool** (`monthlyCreditsAllowance`, `monthlyCreditsUsed`, `monthlyCycleStart`, `lastMonthlyReset`)

The actual business logic in `apps/api/src/services/usage-service.ts` **does not implement dual pools**. Instead, it operates on a **Single-Balance Model** centered around `freeCreditsTotal` and `freeCreditsUsed`.

The other 6 fields are treated as **phantom mirrors**:
- Whenever usage is fetched, `permanentCreditsTotal` and `monthlyCreditsAllowance` are forcibly overwritten with `freeCreditsTotal`.
- Whenever usage is consumed, `permanentCreditsUsed` and `monthlyCreditsUsed` are set to `freeCreditsUsed`.
- On monthly cycle resets, `permanentCreditsTotal` is overwritten with the monthly allowance (e.g. 3), wiping out any permanent credits previously recorded.

---

## 4. Credit Source Map (Read & Write Occurrences)

### 4.1 `freeCreditsTotal`
- **Writes:**
  - `packages/database/prisma/schema.prisma:755`: Model default `10`
  - `apps/api/src/middleware/auth.ts:76`: Default `10` on user creation
  - `apps/api/src/services/admin-auth-service.ts:105`: Default `1000` for admin
  - `apps/api/src/services/usage-service.ts:248, 268`: Initial creation set to `currentAllowance`
  - `apps/api/src/services/usage-service.ts:301, 317`: Reset overwrite set to `currentAllowance`
  - `apps/api/src/routes/admin.ts:309, 317`: Subscription grant set to `newAllowance`
  - `apps/api/src/routes/admin.ts:396, 403`: Subscription revoke set to `10`
  - `apps/api/src/routes/admin.ts:468, 473`: Credit adjust set to `currentTotal + additional`
- **Reads:**
  - `apps/api/src/services/usage-service.ts:195`: Loaded from DB
  - `apps/api/src/services/usage-service.ts:294`: `record.freeCreditsTotal !== currentAllowance` (triggers reset!)
  - `apps/api/src/services/usage-service.ts:333, 335`: Used for `freeCreditsRemaining = freeCreditsTotal - freeCreditsUsed`
  - `apps/api/src/routes/admin.ts:197, 458`: Read to compute available credits and top-up base
  - `apps/api/src/routes/usage.ts:26, 32, 35`: Serialized as `monthlyLimit`, `permanentTotalCredits`, `monthlyAllowance`
  - `apps/api/src/services/subscription-service.ts:160, 165, 168`: Mirrored in billing status response

### 4.2 `freeCreditsUsed`
- **Writes:**
  - `packages/database/prisma/schema.prisma:756`: Model default `0`
  - `apps/api/src/middleware/auth.ts:77`: Default `0`
  - `apps/api/src/services/admin-auth-service.ts:106`: Default `0`
  - `apps/api/src/services/usage-service.ts:249, 269`: Initial creation set to `0`
  - `apps/api/src/services/usage-service.ts:302, 318`: Reset set to `newUsed` (`0` on new cycle, or clamped)
  - `apps/api/src/services/usage-service.ts:434, 445, 453`: Incremented during `consumeUsage` (`newUsed = used + cost`)
  - `apps/api/src/routes/admin.ts:310, 318`: Subscription grant set to `0`
  - `apps/api/src/routes/admin.ts:397, 404`: Subscription revoke set to `0`
  - `apps/api/src/routes/admin.ts:469, 474`: Credit adjust set to `0` if `resetUsage=true` else `currentUsed`
- **Reads:**
  - `apps/api/src/services/usage-service.ts:196`: Loaded from DB
  - `apps/api/src/services/usage-service.ts:295`: `record.freeCreditsUsed > currentAllowance` (triggers reset!)
  - `apps/api/src/services/usage-service.ts:334`: Used to compute remaining credits
  - `apps/api/src/routes/admin.ts:198, 459`: Read in user table and adjust endpoint
  - `apps/api/src/routes/usage.ts:27, 33, 36`: Serialized as `usedCredits`, `permanentUsedCredits`, `monthlyUsedCredits`

### 4.3 `permanentCreditsTotal`
- **Writes:**
  - `packages/database/prisma/schema.prisma:757`: Model default `10`
  - `apps/api/src/middleware/auth.ts:78`: Initialized to `10`
  - `apps/api/src/services/admin-auth-service.ts:107`: Initialized to `1000`
  - `apps/api/src/services/usage-service.ts:250, 270`: Initialized to `currentAllowance` (10 or 3)
  - `apps/api/src/services/usage-service.ts:303, 319`: **Overwritten on reset to `currentAllowance`**
  - `apps/api/src/services/usage-service.ts:454`: Mirrored to `currentUsage.freeCreditsTotal` on upsert
  - `apps/api/src/routes/admin.ts:319`: Created in subscription grant fallback
  - `apps/api/src/routes/admin.ts:405`: Created in subscription revoke fallback
  - `apps/api/src/routes/admin.ts:475`: Created in adjust credits fallback
  - *(Crucially missing: never updated in `prisma.userUsage.update` inside `admin.ts`!)*
- **Reads:**
  - `apps/api/src/services/usage-service.ts:197`: Loaded from DB into memory record
  - *(Never used to determine remaining credits; immediately overwritten)*

### 4.4 `permanentCreditsUsed`
- **Writes:**
  - `packages/database/prisma/schema.prisma:758`: Model default `0`
  - `apps/api/src/middleware/auth.ts:79`: Default `0`
  - `apps/api/src/services/admin-auth-service.ts:108`: Default `0`
  - `apps/api/src/services/usage-service.ts:251, 271`: Initialized to `0`
  - `apps/api/src/services/usage-service.ts:304, 320`: Overwritten on reset to `newUsed`
  - `apps/api/src/services/usage-service.ts:435, 446, 455`: Overwritten on consume to `newUsed`
- **Reads:**
  - `apps/api/src/services/usage-service.ts:198`: Loaded from DB
  - *(Never used independently; always cloned from `freeCreditsUsed`)*

### 4.5 `monthlyCreditsAllowance`
- **Writes:**
  - `packages/database/prisma/schema.prisma:759`: Model default `3`
  - `apps/api/src/middleware/auth.ts:80`: Default `3`
  - `apps/api/src/services/admin-auth-service.ts:109`: Default `1000`
  - `apps/api/src/services/usage-service.ts:252, 272`: Initialized to `currentAllowance`
  - `apps/api/src/services/usage-service.ts:305, 321`: Overwritten on reset to `currentAllowance`
  - `apps/api/src/routes/admin.ts:311, 321`: Updated to `newAllowance`
  - `apps/api/src/routes/admin.ts:398, 407`: Reset to `3`
  - `apps/api/src/routes/admin.ts:477`: Created as `3`
- **Reads:**
  - `apps/api/src/services/usage-service.ts:199`: Loaded from DB
  - *(Never used to compute limits; `currentAllowance` is computed on the fly)*

### 4.6 `monthlyCreditsUsed`
- **Writes:**
  - `packages/database/prisma/schema.prisma:760`: Model default `0`
  - `apps/api/src/middleware/auth.ts:81`: Default `0`
  - `apps/api/src/services/admin-auth-service.ts:110`: Default `0`
  - `apps/api/src/services/usage-service.ts:253, 273`: Initialized to `0`
  - `apps/api/src/services/usage-service.ts:306, 322`: Reset to `newUsed`
  - `apps/api/src/services/usage-service.ts:436, 447, 457`: Overwritten on consume to `newUsed`
  - `apps/api/src/routes/admin.ts:312, 322`: Reset to `0`
  - `apps/api/src/routes/admin.ts:399, 408`: Reset to `0`
  - `apps/api/src/routes/admin.ts:478`: Created as `0`
- **Reads:**
  - `apps/api/src/services/usage-service.ts:200`: Loaded from DB
  - *(Never used independently; cloned from `freeCreditsUsed`)*

### 4.7 `monthlyCycleStart` & `lastMonthlyReset`
- **Writes:**
  - `packages/database/prisma/schema.prisma:761, 762`: Nullable DateTime
  - `apps/api/src/services/usage-service.ts:254, 255, 274, 275`: Set to `cycleInfo.cycleStart` and `now`
  - `apps/api/src/services/usage-service.ts:307, 308, 323, 324`: Updated on reset to `cycleInfo.cycleStart` and `now`
  - `apps/api/src/routes/admin.ts:313, 323`: Updated on admin subscription grant to `now`
- **Reads:**
  - `apps/api/src/services/usage-service.ts:201, 202`: Loaded from DB
  - `apps/api/src/services/usage-service.ts:290-293`: Evaluated to check if cycle boundary was crossed

---

## 5. Initial Credit Creation

Initial credit creation occurs in two distinct pathways:

### Pathway A: `apps/api/src/middleware/auth.ts` (lines 70-84)
Invoked when a user authenticates via Supabase JWT:
```ts
await prisma.userUsage.upsert({
  where: { userId: user.id },
  update: {},
  create: {
    userId: user.id,
    freeCreditsTotal: 10,
    freeCreditsUsed: 0,
    permanentCreditsTotal: 10,
    permanentCreditsUsed: 0,
    monthlyCreditsAllowance: 3,
    monthlyCreditsUsed: 0,
  },
});
```
- `monthlyCycleStart` and `lastMonthlyReset` are **omitted** (remain `null`).
- Notice the discrepancy: `permanentCreditsTotal` is initialized to 10, while `monthlyCreditsAllowance` is set to 3.

### Pathway B: `apps/api/src/services/usage-service.ts` (lines 245-281)
Invoked lazily when `getUserUsage(userId)` is called:
- Evaluates `plan` (defaults to `"FREE"`).
- Determines `cycleInfo = getMonthlyCycleInfo(userCreatedAt, now)`.
- If `cycleInfo.isInitialMonth` is true, sets `currentAllowance = 10`.
- Upserts the record:
  - `freeCreditsTotal = 10`
  - `freeCreditsUsed = 0`
  - `permanentCreditsTotal = 10`
  - `permanentCreditsUsed = 0`
  - `monthlyCreditsAllowance = 10` *(differs from Pathway A which writes 3!)*
  - `monthlyCreditsUsed = 0`
  - `monthlyCycleStart = cycleInfo.cycleStart`
  - `lastMonthlyReset = now`

### Verdict on Initial State
- The new user receives **10 credits**.
- In the database, both `freeCreditsTotal` and `permanentCreditsTotal` are set to 10.
- However, in execution logic, the 10 credits are treated as an **initial monthly allowance** that expires after 30 days, **NOT** as permanent credits.

---

## 6. First-Month Lifecycle

1. **Detection:**
   The function `getMonthlyCycleInfo(userCreatedAt, now)` adds 1 calendar month to the user's `createdAt` timestamp:
   ```ts
   if (now < monthOneEnd) {
     return { isInitialMonth: true, cycleIndex: 0, cycleStart: created, nextResetDate: monthOneEnd };
   }
   ```
2. **Allowance Assignment:**
   For `plan === "FREE"`:
   `currentAllowance = cycleInfo.isInitialMonth ? 10 : 3;` -> returns `10`.
3. **Consumption:**
   Each content generation or publishing operation calls `consumeUsage(userId, action, 1)`.
   - `record.freeCreditsUsed` increments by 1.
   - `freeCreditsRemaining` is evaluated as `10 - freeCreditsUsed`.
4. **Exhaustion:**
   When `freeCreditsUsed === 10`, `freeCreditsRemaining === 0`.
   - Subsequent calls fail `checkUsageAccess`.
   - `consumeUsage` throws an HTTP 402 error: `"PLAN_LIMIT_REACHED: Your monthly credits are exhausted. Please upgrade your plan to continue."`

---

## 7. Subsequent-Month Lifecycle (Monthly Reset)

1. **Cycle Boundary Crossing:**
   When `now >= monthOneEnd`, `getMonthlyCycleInfo` sets:
   - `isInitialMonth = false`
   - `cycleIndex = k` (where `k >= 1`)
   - `cycleStart = addMonths(created, k)`
   - `nextResetDate = addMonths(created, k + 1)`
2. **Reset Detection Trigger (`needsReset`):**
   In `getUserUsage(userId)`:
   ```ts
   const needsReset =
     !record.monthlyCycleStart ||
     record.monthlyCycleStart < cycleInfo.cycleStart ||
     !record.lastMonthlyReset ||
     record.lastMonthlyReset < cycleInfo.cycleStart ||
     record.freeCreditsTotal !== currentAllowance ||
     record.freeCreditsUsed > currentAllowance;
   ```
   Since `record.monthlyCycleStart < cycleInfo.cycleStart`, `needsReset` evaluates to `true`.
3. **State Mutation:**
   ```ts
   const isNewCycle = !record.monthlyCycleStart || record.monthlyCycleStart < cycleInfo.cycleStart;
   const newUsed = isNewCycle ? 0 : Math.min(record.freeCreditsUsed, currentAllowance);

   record.freeCreditsTotal = currentAllowance; // 3 for FREE
   record.freeCreditsUsed = newUsed;          // 0
   record.permanentCreditsTotal = currentAllowance; // OVERWRITTEN TO 3!
   record.permanentCreditsUsed = newUsed;     // OVERWRITTEN TO 0!
   record.monthlyCreditsAllowance = currentAllowance; // 3
   record.monthlyCreditsUsed = newUsed;       // 0
   record.monthlyCycleStart = cycleInfo.cycleStart;
   record.lastMonthlyReset = now;
   ```

### Explicit Before / After Reset Example

Suppose a user finished Month 1 with 4 unused credits, and earlier had 15 permanent credits:

```
BEFORE RESET (End of Month 1)
-----------------------------------------------
freeCreditsTotal            = 10
freeCreditsUsed             = 6
permanentCreditsTotal       = 15 (hypothetical grant)
permanentCreditsUsed        = 6
monthlyCreditsAllowance     = 10
monthlyCreditsUsed          = 6
monthlyCycleStart           = 2026-08-28T00:00:00Z
lastMonthlyReset            = 2026-08-28T00:00:00Z

AFTER RESET (Start of Month 2) — Current Actual Implementation
---------------------------------------------------------------
freeCreditsTotal            = 3
freeCreditsUsed             = 0
permanentCreditsTotal       = 3   <-- BUG: OVERWRITTEN TO currentAllowance!
permanentCreditsUsed        = 0   <-- BUG: OVERWRITTEN TO 0!
monthlyCreditsAllowance     = 3
monthlyCreditsUsed          = 0
monthlyCycleStart           = 2026-09-28T00:00:00Z
lastMonthlyReset            = 2026-09-28T22:31:00Z
```

**Observation:**
Any credits residing in `permanentCreditsTotal` are completely destroyed upon monthly reset. Unused Month 1 credits do not roll over (intended for monthly allowance), but permanent credits are also lost.

---

## 8. Credit Consumption Flow

All credit consumption throughout the backend flows into `consumeUsage` in `apps/api/src/services/usage-service.ts`:

```ts
export async function consumeUsage(
  userIdOrWorkspaceId: string,
  action: "CONTENT_GENERATION" | "PUBLISHING" = "CONTENT_GENERATION",
  cost: number = 1
): Promise<{ freeCreditsTotal: number; freeCreditsUsed: number; freeCreditsRemaining: number }>
```

### Trace of Consumption Execution:
1. **Concurrency Lock:** Acquires `withLock(userIdOrWorkspaceId)`.
2. **Access Check:** Calls `checkUsageAccess(userId, action)`. If `freeCreditsRemaining <= 0`, throws `402 PLAN_LIMIT_REACHED`.
3. **Deduction:**
   - Reads `record = usageMemoryStore.get(userId)`.
   - Calculates `newUsed = record.freeCreditsUsed + cost`.
   - Sets `record.freeCreditsUsed = newUsed`.
   - Sets `record.permanentCreditsUsed = newUsed`.
   - Sets `record.monthlyCreditsUsed = newUsed`.
4. **Database Persistence:**
   Executes `prisma.userUsage.upsert`:
   ```ts
   update: {
     freeCreditsUsed: newUsed,
     permanentCreditsUsed: newUsed,
     monthlyCreditsUsed: newUsed,
     updatedAt: now,
   }
   ```
5. **Return Value:**
   Calls `getUserUsage(userId)` and returns `{ freeCreditsTotal, freeCreditsUsed, freeCreditsRemaining }`.

### Specific Findings on Consumption:
- **Pool Order:** There is **NO** pool priority ordering. Credits are not deducted from "Monthly first" nor "Permanent first".
- **Pool Interaction:** Both pools increment simultaneously because they are identical mirrors of `freeCreditsUsed`.
- **Atomicity:** The operation does not use SQL transactions or atomic increments (`increment: cost`). It performs read-modify-write.

---

## 9. Admin Credit Grant Flow

The admin credit grant endpoint is located in `apps/api/src/routes/admin.ts`:
`POST /api/admin/users/:id/credits`

```ts
const currentTotal = user.usage?.freeCreditsTotal ?? 10;
const currentUsed = user.usage?.freeCreditsUsed ?? 0;
const additional = Math.max(0, parseInt(String(bonusCredits), 10) || 0);

const newTotal = currentTotal + additional;
const newUsed = resetUsage === true ? 0 : currentUsed;

const usage = await prisma.userUsage.upsert({
  where: { userId },
  update: {
    freeCreditsTotal: newTotal,
    freeCreditsUsed: newUsed,
  },
  create: {
    userId,
    freeCreditsTotal: newTotal,
    freeCreditsUsed: newUsed,
    permanentCreditsTotal: newTotal,
    permanentCreditsUsed: newUsed,
    monthlyCreditsAllowance: 3,
    monthlyCreditsUsed: 0,
  },
});
```

### Critical Findings on Admin Grants:
1. **Target Field:** The update only modifies `freeCreditsTotal` and `freeCreditsUsed`. It does **not** update `permanentCreditsTotal`.
2. **Immediate Destruction on Next Request:**
   In `usage-service.ts`:
   ```ts
   const needsReset = ... || record.freeCreditsTotal !== currentAllowance || ...;
   ```
   If a user is on the FREE plan (`currentAllowance = 3`), and the admin grants +25 bonus credits (`freeCreditsTotal = 28`):
   As soon as the user makes any API request or loads the studio dashboard, `getUserUsage` executes.
   `record.freeCreditsTotal !== currentAllowance` (28 !== 3) evaluates to **TRUE**!
   `needsReset` triggers immediately:
   ```ts
   record.freeCreditsTotal = currentAllowance; // Set back to 3!
   ```
   **The 25 bonus credits granted by the admin are instantly erased.**
3. **In-Memory Cache Desynchronization:**
   `adminRouter` writes to Prisma directly without invalidating or updating `usageMemoryStore.get(userId)`. Thus, even before DB reset, the API process serving the user may not see the admin change.
4. **Audit Logging:** An audit record is created in `prisma.adminAuditLog` with `action: "ADJUST_CREDITS"`.
5. **Input Validation:** Negative values are guarded against via `Math.max(0, ...)`.

---

## 10. Usage API Semantics (`/api/usage`)

Inspecting `apps/api/src/routes/usage.ts`:

```ts
return res.json({
  success: true,
  data: {
    plan,
    monthlyLimit: usage.freeCreditsTotal,
    usedCredits: usage.freeCreditsUsed,
    remainingCredits: usage.freeCreditsRemaining,
    resetPeriod: usage.nextMonthlyResetDate,
    totalRemainingCredits: usage.freeCreditsRemaining,
    permanentRemainingCredits: usage.freeCreditsRemaining,
    permanentTotalCredits: usage.freeCreditsTotal,
    permanentUsedCredits: usage.freeCreditsUsed,
    monthlyRemainingCredits: usage.freeCreditsRemaining,
    monthlyAllowance: usage.freeCreditsTotal,
    monthlyUsedCredits: usage.freeCreditsUsed,
    nextMonthlyResetDate: usage.nextMonthlyResetDate,
    isInitialMonth: usage.isInitialMonth,
    cycleIndex: usage.cycleIndex,
  },
});
```

### Analysis of Semantic Aliases:
- `remainingCredits`, `totalRemainingCredits`, `permanentRemainingCredits`, `monthlyRemainingCredits` **are all identical** (`usage.freeCreditsRemaining`).
- `monthlyLimit`, `permanentTotalCredits`, `monthlyAllowance` **are all identical** (`usage.freeCreditsTotal`).
- `usedCredits`, `permanentUsedCredits`, `monthlyUsedCredits` **are all identical** (`usage.freeCreditsUsed`).
- **Dead Code:** Line 20 defines `const nextResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();`, which is completely unused.
- **Client Impact:** Any frontend client attempting to sum `permanentRemainingCredits + monthlyRemainingCredits` to compute total balance will double-count the credits.

---

## 11. Frontend Display & Discrepancies

### 11.1 Studio Header & Navigation (`StudioLayout.tsx`)
- Displays: `${usage?.remainingCredits ?? 0} / ${usage?.monthlyLimit ?? 10}`
- Tooltip: `usage?.isInitialMonth ? "First Month: 10 Credits Total" : "Monthly Cycle: 3 Credits/Month"`
- Accurately conveys the current single-balance backend behavior.

### 11.2 Dashboard Widget (`UsageWidget.tsx`)
- Displays: `Workspace Credits (${usage.plan})`, `{remaining} / {limit} Available`.
- Subtitle: `Used: {used} | Remaining: {remaining}`.
- Bottom text: `"First month allowance"` or `"Monthly allowance"`.

### 11.3 Subscription & Billing Page (`settings/billing/page.tsx`)
- Lines 82-86 calculate:
  ```ts
  const totalRemaining = billingStatus?.totalRemainingCredits ?? ...;
  const permRemaining = billingStatus?.permanentRemainingCredits ?? ...;
  const permTotal = billingStatus?.permanentTotalCredits ?? ...;
  const monthlyRemaining = billingStatus?.monthlyRemainingCredits ?? ...;
  const monthlyAllowance = billingStatus?.monthlyAllowance ?? ...;
  ```
- **Discrepancy:** These variables are **never rendered** in the JSX.
- Instead, the UI displays:
  - "Current Cycle Allowance": `billingStatus?.monthlyWorkflowsLimit`
  - "Used Credits": `billingStatus?.workflowsUsed`
  - "Remaining Credits": `billingStatus?.workflowsRemaining`

### 11.4 Admin Panel (`apps/web/app/(studio)/admin/page.tsx`)
- Shows user credit stats: `{creditUser.creditsRemaining} / {creditUser.creditsTotal} available ({creditUser.creditsUsed} used)`.
- Modal offers: "Bonus Credits to Add" (+5, +10, +25, +50) and "Reset Used Credits".
- **Severe User Experience Discrepancy:** An admin who grants bonus credits sees a success toast, but the user never receives the persistent benefit because the backend wipes it on the next cycle check.

---

## 12. Billing & Subscription Plan Interaction

### 12.1 Plan Entitlement Registry (`plans.ts`)
| Plan | Price (INR) | Workflows/Month (`plans.ts`) | Admin Grant (`admin.ts`) | Admin Frontend UI |
| :--- | :--- | :--- | :--- | :--- |
| **FREE** | ₹0 | 10 (Month 1), 3 (Subsequent) | 10 (reset to 3) | 3 Workflows / mo |
| **PRO** | ₹59 | 50 | 100 *(Discrepancy)* | 50 Workflows / mo |
| **ADVANCED**| ₹99 | 150 | 250 *(Discrepancy)* | 150 Workflows / mo |
| **PREMIUM** | ₹149 | 300 | 500 *(Discrepancy)* | 400 Workflows / mo *(Discrepancy)* |
| **BUSINESS**| ₹299 | 500 | 1000 *(Discrepancy)*| 1000 Workflows / mo *(Discrepancy)* |

**Confirmed Discrepancy:**
The credit allowances hardcoded in `apps/api/src/routes/admin.ts` (lines 298-303) and `apps/web/app/(studio)/admin/page.tsx` (lines 833-840) deviate from the authoritative `SAAS_PLANS_REGISTRY` defined in `packages/shared/src/schemas/plans.ts`.

### 12.2 Upgrade & Downgrade Mechanics
- **Upgrade:** When an active subscription is activated (via Razorpay webhook or admin grant), `getUserPlan` begins returning the new tier. In `getUserUsage`, `currentAllowance` changes (e.g. from 3 to 50). `record.freeCreditsTotal !== currentAllowance` triggers `needsReset`. In mid-cycle, `isNewCycle` is false, so `record.freeCreditsUsed` is preserved up to the new allowance.
- **Downgrade / Expiry:** When a subscription expires (`currentPeriodEnd < now`), `getUserPlan` falls back to `"FREE"`. On the next usage request, `currentAllowance` drops to 3 (or 10 if initial month). `record.freeCreditsUsed` is clamped to 3, and `freeCreditsTotal` becomes 3. Any excess usage or paid credits vanish immediately.
- **Rollover:** Monthly credits never roll over across cycle boundaries.

---

## 13. Concurrency & Data Integrity Analysis

### 13.1 In-Process Mutex (`withLock`)
`apps/api/src/services/usage-service.ts` implements:
```ts
const userLocks = new Map<string, Promise<void>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T>
```
- **Limitation 1 (Multi-Instance / Serverless):** This lock is stored in Node.js process memory. In any multi-container, clustered, or serverless deployment (e.g. ECS with >1 task, AWS Lambda, Vercel), concurrent requests routed to different instances completely bypass each other's locks.
- **Limitation 2 (Key Mismatch):** In `consumeUsage(userIdOrWorkspaceId)`, the lock key is the raw argument. If caller A calls `consumeUsage("ws-1")` and caller B calls `consumeUsage("usr-1")` (where `usr-1` is the owner of `ws-1`), they lock on two different keys, running concurrently even inside the same process.

### 13.2 Database Concurrency Pattern
The database update is performed via:
```ts
await prisma.userUsage.upsert({
  where: { userId },
  update: {
    freeCreditsUsed: newUsed,
    ...
  }
})
```
- Uses **Read-Modify-Write** instead of atomic increments (`increment: cost`).
- Does **not** use Prisma interactive transactions (`prisma.$transaction`).
- Does **not** use PostgreSQL row locking (`SELECT ... FOR UPDATE`).
- **Race Condition:** Two concurrent requests can read `freeCreditsUsed = 5`, both compute `newUsed = 6`, and both commit `6`, allowing 2 operations while billing only 1 credit (overspend / double-spend vulnerability).

---

## 14. Existing Test Coverage

### 14.1 What IS Tested:
- Initial 10 credits for Month 1: Tested in `tests/free-credit-system.test.ts`, `tests/tiered-saas.test.ts`, `tests/saas-platform.test.ts`.
- Reset to 3 credits in Month 2 without rollover: Tested in `tests/free-credit-system.test.ts`.
- Reset to 3 credits in Month 3: Tested in `tests/free-credit-system.test.ts`.
- Single-process concurrent consumption thread safety: Tested in `tests/free-credit-system.test.ts` (using `Promise.all` on single in-memory store).
- Idempotent publishing execution: Tested in `tests/phase2f-usage-metering.test.ts`.
- Basic paid plan allowances: Tested in `tests/tiered-saas.test.ts`.

### 14.2 What is NOT Tested:
- **Dual-pool credit consumption** (permanent pool vs. monthly pool) is **0% tested** (does not exist in code).
- **Permanent credit preservation** across monthly cycle resets is **0% tested**.
- **Admin bonus credit retention** across subsequent API calls and monthly resets is **0% tested**.
- **Priority order of consumption** (whether monthly or permanent credits are consumed first) is **0% tested**.
- **Database-level atomic concurrency** under multi-instance conditions is **0% tested**.
- Integration tests between `POST /api/admin/users/:id/credits` and subsequent `/api/usage` calls are **0% tested** (only pure unit math `10 + 25 = 35` is tested in `admin-dashboard.test.ts`).

---

## 15. Classification of Findings

| ID | Finding Title | Severity | Impact Area |
| :--- | :--- | :--- | :--- |
| **F-01** | Admin Bonus Credits Erased on Next Usage Call | **CRITICAL** | `apps/api/src/services/usage-service.ts` |
| **F-02** | Permanent Credit Pool Destroyed on Monthly Reset | **CRITICAL** | `apps/api/src/services/usage-service.ts` |
| **F-03** | Dual Credit Pool Architecture Not Implemented | **CRITICAL** | `apps/api/src/services/usage-service.ts` |
| **F-04** | Read-Modify-Write Concurrency Vulnerability | **HIGH** | `apps/api/src/services/usage-service.ts` |
| **F-05** | In-Process Mutex Lock Key Mismatch | **HIGH** | `apps/api/src/services/usage-service.ts` |
| **F-06** | Plan Allowance Discrepancy Across Codebase | **HIGH** | `admin.ts`, `plans.ts`, `admin/page.tsx` |
| **F-07** | Admin Operations Desynchronize In-Memory Cache | **MEDIUM** | `apps/api/src/routes/admin.ts` |
| **F-08** | Misleading Semantic Aliases in `/api/usage` | **MEDIUM** | `apps/api/src/routes/usage.ts` |
| **F-09** | Unrendered Dual-Pool State in Billing Frontend | **LOW** | `apps/web/app/(studio)/settings/billing/page.tsx`|
| **F-10** | Dead Reset Date Computation Code | **LOW** | `apps/api/src/routes/usage.ts` |

---

## 16. Confirmed Bugs (Detailed Evidence)

### Bug 1: Admin Bonus Credits Wiped Out Immediately
- **Severity:** CRITICAL
- **File:** `apps/api/src/services/usage-service.ts` (lines 289-327)
- **Evidence:**
  `adminRouter.post("/users/:id/credits")` sets `freeCreditsTotal = currentTotal + additional`.
  In `usage-service.ts`, lines 294 & 301:
  `if (record.freeCreditsTotal !== currentAllowance) { record.freeCreditsTotal = currentAllowance; }`
- **Result:** The moment the user makes any request, the bonus credits are reverted to `currentAllowance`.

### Bug 2: Permanent Pool Overwritten by Monthly Allowance
- **Severity:** CRITICAL
- **File:** `apps/api/src/services/usage-service.ts` (lines 303, 319)
- **Evidence:**
  `record.permanentCreditsTotal = currentAllowance;`
  `record.permanentCreditsUsed = newUsed;`
- **Result:** The database column `permanentCreditsTotal` is forcibly overwritten with 3 (or 10) on every monthly cycle reset, eliminating any concept of permanent credits.

### Bug 3: Discrepancy in Plan Allowance Values
- **Severity:** HIGH
- **File:** `apps/api/src/routes/admin.ts` (lines 299-302) vs `packages/shared/src/schemas/plans.ts` (lines 68, 88, 110)
- **Evidence:**
  - `plans.ts`: PRO: 50, ADVANCED: 150, PREMIUM: 300, BUSINESS: 500
  - `admin.ts`: PRO: 100, ADVANCED: 250, PREMIUM: 500, BUSINESS: 1000
  - `admin/page.tsx`: PREMIUM: 400, BUSINESS: 1000
- **Result:** Manually granting a plan via admin allocates different credit limits than subscribing via Razorpay.

---

## 17. Unverified Behavior

- **UNVERIFIED — EXPECTED BEHAVIOR NOT ESTABLISHED BY CURRENT SOURCE:**  
  *Should monthly credits be consumed before permanent credits, or permanent credits before monthly credits?*  
  Industry standard is **Monthly First** (since monthly credits expire at cycle end while permanent credits do not). However, no specification or test in the existing repository establishes this ordering.
- **UNVERIFIED — EXPECTED BEHAVIOR NOT ESTABLISHED BY CURRENT SOURCE:**  
  *On paid plan upgrades mid-cycle, should the new tier's allowance be additive to existing consumed credits, or should previous cycle usage carry forward against the new higher cap?*  
  Current code does `Math.min(record.freeCreditsUsed, currentAllowance)`, but no formal spec exists.

---

## 18. Recommended Phase 8C Correction Strategy

To achieve the true intended model (10 first month, 3 subsequent months, PLUS persistent permanent credits):

1. **Establish Dual-Pool Ledger in `UserUsage`:**
   - **Pool A (Monthly):** `monthlyCreditsAllowance` (10 in Month 1, 3 in Month 2+ or tier allowance), `monthlyCreditsUsed`.
   - **Pool B (Permanent):** `permanentCreditsTotal` (bonus/admin grants), `permanentCreditsUsed`.
   - **Total Remaining:** `(monthlyCreditsAllowance - monthlyCreditsUsed) + (permanentCreditsTotal - permanentCreditsUsed)`.
2. **Implement Explicit Consumption Order:**
   - Consume **Monthly pool first** until `monthlyCreditsUsed === monthlyCreditsAllowance`.
   - Once monthly is exhausted, consume from **Permanent pool** (`permanentCreditsUsed += cost`).
   - If both are exhausted, throw `402 PLAN_LIMIT_REACHED`.
3. **Correct Monthly Reset Mechanics:**
   - On new cycle: Reset `monthlyCreditsUsed = 0`.
   - Set `monthlyCreditsAllowance = 3` (for FREE) or tier limit.
   - **DO NOT TOUCH** `permanentCreditsTotal` or `permanentCreditsUsed` during monthly reset!
4. **Fix Admin Credit Grants:**
   - Admin bonus credits must increment `permanentCreditsTotal` (e.g. `permanentCreditsTotal += additional`).
   - Admin reset usage must reset `monthlyCreditsUsed = 0` (and optionally `permanentCreditsUsed = 0`).
   - Invalidate in-memory cache on admin actions.
5. **Harmonize Plan Registries:**
   - Replace hardcoded credit maps in `admin.ts` and `admin/page.tsx` with direct imports from `SAAS_PLANS_REGISTRY`.
6. **Harden Concurrency:**
   - Normalize lock key to `userId`.
   - Use atomic Prisma increments or SQL transactions for credit deduction.

---

## 19. Files That Would Require Changes in Phase 8C

1. `apps/api/src/services/usage-service.ts` (core credit math, dual-pool tracking, reset logic, consumption order)
2. `apps/api/src/routes/usage.ts` (accurate multi-pool serialization)
3. `apps/api/src/routes/admin.ts` (admin bonus credits added to permanent pool, plan registry harmonization, cache invalidation)
4. `apps/api/src/services/subscription-service.ts` (billing response multi-pool fields)
5. `apps/web/app/(studio)/admin/page.tsx` (harmonize plan labels with `SAAS_PLANS_REGISTRY`)
6. `apps/web/app/(studio)/settings/billing/page.tsx` (optionally render distinct monthly vs. permanent credit breakdown)
7. `tests/free-credit-system.test.ts` (update test assertions to verify dual-pool preservation across monthly resets)
8. `tests/admin-dashboard.test.ts` (add real integration tests for admin credit grant preservation)

---

## 20. Explicitly Out-of-Scope Items for Phase 8C

- Changes to Razorpay payment gateway integration or webhook verification.
- Changes to user authentication, Supabase JWT verification, or session cookie policies.
- Changes to AI creative engine execution, video composition, or social publishing integrations.
- Adding third-party billing providers (e.g. Stripe).
- Modifying database schema or generating new database migrations (the 8 existing columns in `UserUsage` already provide all necessary fields).
