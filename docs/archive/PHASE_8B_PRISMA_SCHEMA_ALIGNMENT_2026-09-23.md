# Phase 8B — Prisma Schema Alignment
## Archive Report

> **Date:** 2026-09-23
> **Branch:** `master`
> **Phase:** 8B (follows Phase 8A — Production Auth Hardening)
> **Status:** COMPLETE
> **Author:** AI Agent (Antigravity)
> **Prerequisite Audit:** `docs/archive/DOCUMENTATION_AUDIT_2026-09-23.md`

---

## 1. Objective

Synchronize `packages/database/prisma/schema.prisma` with the 6 columns already present in the live
Supabase PostgreSQL database via migration `1_add_permanent_and_monthly_free_credits`.

This was NOT a migration rewrite, database reset, or credit system redesign.
It was a pure schema model alignment: adding the 6 column declarations that were missing from the Prisma model.

---

## 2. Root Cause

Migration `1_add_permanent_and_monthly_free_credits/migration.sql` was applied to the database at an
earlier time but the `schema.prisma` file was never updated to include the new columns.

This created a mismatch where:
- The live database table `UserUsage` had 8 credit columns.
- The Prisma model `UserUsage` only declared 2 (`freeCreditsTotal`, `freeCreditsUsed`).
- Prisma Client did not generate typed accessors for the 6 missing columns.
- `usage-service.ts` bridged the gap with unsafe `??` fallback operators at runtime.

---

## 3. Source Files Inspected

| File | Inspection Purpose |
| :--- | :--- |
| `packages/database/prisma/schema.prisma` | Confirmed missing columns in `UserUsage` model |
| `packages/database/prisma/migrations/1_add_permanent_and_monthly_free_credits/migration.sql` | Authoritative source for exact column types, defaults, nullability |
| `apps/api/src/services/usage-service.ts` | Identified `??` fallback workarounds to remove |
| `apps/api/src/routes/usage.ts` | Verified no direct column references requiring change |
| `apps/api/src/routes/admin.ts` | Verified `userUsage.upsert` calls already used all 6 columns |
| `packages/shared/src/schemas/plans.ts` | Verified plan entitlement definitions — no changes needed |

---

## 4. Migration SQL (Source of Truth)

```sql
ALTER TABLE "UserUsage"
ADD COLUMN "permanentCreditsTotal" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "permanentCreditsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "monthlyCreditsAllowance" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "monthlyCreditsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "monthlyCycleStart" TIMESTAMP(3),
ADD COLUMN "lastMonthlyReset" TIMESTAMP(3);
```

---

## 5. Changes Made

### 5.1 packages/database/prisma/schema.prisma

Added 6 fields to `UserUsage` model matching the migration SQL exactly:

| Column | SQL Type | Prisma Type | Default |
| :--- | :--- | :--- | :--- |
| `permanentCreditsTotal` | INTEGER NOT NULL DEFAULT 10 | `Int @default(10)` | 10 |
| `permanentCreditsUsed` | INTEGER NOT NULL DEFAULT 0 | `Int @default(0)` | 0 |
| `monthlyCreditsAllowance` | INTEGER NOT NULL DEFAULT 3 | `Int @default(3)` | 3 |
| `monthlyCreditsUsed` | INTEGER NOT NULL DEFAULT 0 | `Int @default(0)` | 0 |
| `monthlyCycleStart` | TIMESTAMP(3) nullable | `DateTime?` | null |
| `lastMonthlyReset` | TIMESTAMP(3) nullable | `DateTime?` | null |

### 5.2 apps/api/src/services/usage-service.ts

Two changes:

A. `StoredUserUsage` interface: promoted `permanentCreditsTotal`, `permanentCreditsUsed`,
   `monthlyCreditsAllowance`, `monthlyCreditsUsed` from optional (`number?`) to required (`number`)
   because the database columns are INT NOT NULL.

B. DB read block: removed `??` fallback operators for the 4 `Int NOT NULL` fields.
   Also updated `monthlyCycleStart` and `lastMonthlyReset` from `|| undefined` to `?? undefined`
   (more precise null-coalescing form for nullable DateTime columns).

---

## 6. Commands Executed

```
npx prisma generate --schema=packages/database/prisma/schema.prisma
  Exit code 0 — Generated Prisma Client (v7.9.1) in 948ms

npx prisma migrate status --schema=packages/database/prisma/schema.prisma
  Exit code 0 — "Database schema is up to date!"
  2 migrations found, both applied

npm run typecheck --workspace=@ai-social/api
  Exit code 0 — 0 TypeScript errors

npm run typecheck --workspace=@ai-social/web
  Exit code 0 — 0 TypeScript errors

npx vitest run
  Exit code 0 — 64 test files, 688 passed, 0 failures
```

---

## 7. Verification Results

| Check | Result |
| :--- | :--- |
| prisma generate | EXIT 0 — Prisma Client v7.9.1 regenerated |
| prisma migrate status | EXIT 0 — "Database schema is up to date!" |
| typecheck @ai-social/api | EXIT 0 — 0 errors |
| typecheck @ai-social/web | EXIT 0 — 0 errors |
| vitest run | EXIT 0 — 64 files, 688 passed, 0 failures |

---

## 8. Safety Rules Followed

- No prisma migrate reset: NOT executed
- No prisma db push --force-reset: NOT executed
- No new migration files created
- No existing migration files modified
- No database architecture changed
- No credit system redesigned
- No commit or push performed

---

## 9. Files Changed

Application/Schema:
- packages/database/prisma/schema.prisma (added 6 fields to UserUsage model)
- apps/api/src/services/usage-service.ts (removed ?? fallbacks; updated StoredUserUsage interface)

Documentation:
- docs/CHANGELOG.md (Phase 8B entry added)
- docs/AI_AGENT_CONTEXT.md (schema mismatch resolved; current phase updated to 8C; Phase 8B in completed table; Known Issues updated)
- docs/PROJECT_MEMORY.md (schema section updated; Phase 8B update added; Finding 2 resolved)
- docs/archive/PHASE_8B_PRISMA_SCHEMA_ALIGNMENT_2026-09-23.md (this file)

---

## 10. Git Status at Completion

Modified (not staged):
  DEPLOYMENT.md
  README.md
  apps/api/src/config/supabase.ts
  apps/api/src/middleware/auth.ts
  apps/api/src/services/usage-service.ts
  docs/deployment.md
  packages/database/prisma/schema.prisma

Untracked (new files):
  docs/AI_AGENT_CONTEXT.md
  docs/ARCHITECTURE.md
  docs/CHANGELOG.md
  docs/PROJECT_MEMORY.md
  docs/archive/DOCUMENTATION_AUDIT_2026-09-23.md
  docs/archive/PHASE_6_DEPENDENCY_MAP_2026-09-18.md
  docs/archive/PHASE_7_HARDENING_PLAN_2026-09-18.md
  docs/archive/PHASE_8A_AUTH_HARDENING_2026-09-18.md
  docs/archive/PHASE_8B_PRISMA_SCHEMA_ALIGNMENT_2026-09-23.md
  tests/production-auth-hardening.test.ts

Not committed per task instructions.

---

## 11. Next Phase

Phase 8C — Credit Lifecycle Correction (Planned)

The `usage-service.ts` monthly reset logic currently overwrites `permanentCreditsTotal` and
`permanentCreditsUsed` when cycling the monthly allowance, treating all credits as monthly.
Phase 8C will correct this separation — now safely possible because Phase 8B has given
Prisma Client first-class access to all 6 credit columns with correct types.

Phase 8C must NOT begin without explicit user approval.
