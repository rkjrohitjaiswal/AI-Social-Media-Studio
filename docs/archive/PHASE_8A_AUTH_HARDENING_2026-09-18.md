# Phase 8A — Production Authentication Hardening

**Project:** AI Social Media Studio (ASM)  
**Date:** 2026-09-18  
**Repository Branch:** `master`  
**Status:** Completed & Fully Verified (Read-Only Planning Phase 7 to Execution Phase 8A)

---

## 1. Changes Made

Two core backend authentication files and one dedicated test suite were updated/added to enforce production-grade security boundaries:

1. **`apps/api/src/middleware/auth.ts` (`requireAuth`):**
   - **`x-user-id` Header Override Gated:** Added `const isProduction = process.env.NODE_ENV === "production";`. The `x-user-id` header override is now executed **only** when `!isProduction`. In production, the header is completely ignored for authentication and identity assignment.
   - **No-Token Demo Workspace Fallback Gated:** If `!token`, in production the request immediately receives `401 Unauthorized: Authentication token required` (`{ success: false, error: "Unauthorized: Authentication token required" }`). The demo fallback (`demo-user-id`, `demo@maisonlumiere.com`, `demo-workspace-1`) is preserved exclusively for development and test environments (`!isProduction`).
   - **Consistent Error Schemas:** Updated all 401 error payloads to include `{ success: false, error: ... }` for client consistency.

2. **`apps/api/src/config/supabase.ts` (`getSupabaseAdminClient`):**
   - **Enforced Production Service-Role Key Requirement:** In production (`NODE_ENV === "production"`), `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` must be explicitly defined, non-empty, and cannot contain placeholder values.
   - **Eliminated Public Anon Key Elevation:** In production, the function will throw an explicit error (`SUPABASE_SERVICE_ROLE_KEY is required in production environment`) if the service-role key is missing, completely preventing the server from elevating the public anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) or using `"placeholder-key"`.
   - **Preserved Dev/Test Compatibility:** In development and test modes (`NODE_ENV !== "production"`), the client retains graceful fallback to `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `"placeholder-key"` to ensure offline test suite compatibility.

3. **`tests/production-auth-hardening.test.ts`:**
   - Added a dedicated 10-test suite verifying all 9 specified requirements across development, test, and production environments.

---

## 2. Production Security Behavior

- **`x-user-id`:**
  - In production, unauthenticated requests passing `x-user-id: <any-id>` receive an immediate `401 Unauthorized` because no valid bearer token is provided.
  - In production, authenticated requests providing both a valid Supabase JWT and an `x-user-id` header will have their identity established **strictly and exclusively** from the cryptographic Supabase token (`data.user.id`), completely ignoring the `x-user-id` header. Spoofing user identities via HTTP headers in production is impossible.
- **No-Token Fallback:**
  - Any request reaching protected endpoints without an `Authorization: Bearer <token>` header or admin session cookie receives `401 Unauthorized: Authentication token required`.
  - No default demo context or demo workspace is ever assigned to an unauthenticated caller in production.
- **Supabase Service-Role Key:**
  - Server-side admin operations (e.g. user lookup via Supabase Admin API) require a verified `SUPABASE_SERVICE_ROLE_KEY` in production.
  - The public anonymous client key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) cannot be used as a backend service credential in production. If the service key is absent, the system fails cleanly and loudly with a descriptive error.

---

## 3. Development/Test Behavior

- **Development (`NODE_ENV=development`):**
  - Developers can continue using `x-user-id: <dev-user-id>` to test endpoints without logging into Supabase.
  - Quick prototyping without any auth headers continues to fall back to `{ id: "demo-user-id", email: "demo@maisonlumiere.com" }` and `workspaceId = "demo-workspace-1"`.
- **Test (`NODE_ENV=test`):**
  - Unit and integration tests that simulate user sessions using `x-user-id` or demo fallbacks run without modification.
  - Offline tests without active Supabase credentials continue to function via the fallback client without throwing initialization errors.

---

## 4. Admin Authentication

- **Preserved Stateless `adm_` Token Flow:**
  - Admin session authentication in `apps/api/src/services/admin-auth-service.ts` and `apps/api/src/routes/admin.ts` was preserved without any breaking changes.
  - Valid `adm_` tokens signed with the PBKDF2/HMAC secret are verified first in `requireAuth`, setting `req.user.isAdmin = true`.
  - Tampered or invalid `adm_` tokens continue to be immediately rejected with `401 Unauthorized: Invalid or expired admin session token`.
  - All existing admin tests in `tests/admin-auth.test.ts` (6/6 tests) continue to pass.

---

## 5. Tests

### Targeted Production Auth Hardening Suite
Executed: `npm test tests/production-auth-hardening.test.ts`
- ✓ `1. allows x-user-id header override in development environment` (PASS)
- ✓ `2. allows x-user-id header override in test environment` (PASS)
- ✓ `3. rejects x-user-id header override with 401 in production environment when unauthenticated` (PASS)
- ✓ `3b. ignores x-user-id in production and strictly enforces verified token identity` (PASS)
- ✓ `4. retains demo-user-id fallback in development/test environment when token is missing` (PASS)
- ✓ `5. rejects unauthenticated requests with 401 in production environment` (PASS)
- ✓ `6. rejects invalid Supabase token with 401 in production environment` (PASS)
- ✓ `7. accepts valid Supabase JWT in production and establishes user identity` (PASS)
- ✓ `8. preserves stateless admin adm_ session token verification` (PASS)
- ✓ `9. fails clearly in production when SUPABASE_SERVICE_ROLE_KEY is absent, and rejects anon key fallback` (PASS)

**Result:** 10 passed (10 total, 100% pass rate).

### Auth Test Suites Combined
Executed: `npm test tests/production-auth-hardening.test.ts tests/admin-auth.test.ts tests/auth.test.ts`
- `tests/production-auth-hardening.test.ts`: 10 passed
- `tests/auth.test.ts`: 6 passed
- `tests/admin-auth.test.ts`: 6 passed

**Result:** 3 test files passed, 22 passed (22 total).

### Full Project Test Suite
Executed: `npm test`
- **Total Test Files:** 64 passed (64 total)
- **Total Tests:** 688 passed (688 total, 0 failed, 0 skipped)
- **Duration:** ~19.7s

---

## 6. Typecheck / Build

Executed: `npm run typecheck --workspace=@ai-social/api`
- Command: `tsc --noEmit`
- **Result:** Exit Code 0, zero TypeScript errors across all API source files.

---

## 7. Security Verification

- **No Secrets Logged:** No tokens, JWTs, service-role keys, passwords, or hashes are logged in standard or error outputs.
- **No Secrets Exposed in Responses:** 401 and 500 error responses return generic, safe messages (`"Unauthorized: Authentication token required"`, `"Unauthorized: Invalid or expired token"`).
- **Environment Isolation:** Key requirements are evaluated at runtime using `process.env.NODE_ENV`, preventing test or dev settings from leaking into production.

---

## 8. Files Changed

### Modified Files (Source Code)
1. `apps/api/src/config/supabase.ts` — Hardened `getSupabaseAdminClient` to strictly require `SUPABASE_SERVICE_ROLE_KEY` in production and prohibit anon key fallback.
2. `apps/api/src/middleware/auth.ts` — Environment-gated `x-user-id` and demo workspace fallbacks behind `!isProduction`.

### New Test File
3. `tests/production-auth-hardening.test.ts` — 10 unit and integration tests verifying production, development, and test authentication matrix.

### New Documentation File
4. `docs/archive/PHASE_8A_AUTH_HARDENING_2026-09-18.md` — This verification report.

---

## 9. Remaining Phase 8 Work

As scheduled in the Phase 7 implementation plan:
- **Phase 8B:** Prisma Schema Alignment (reconcile the 6 `UserUsage` credit columns from Migration 1 into `packages/database/prisma/schema.prisma` and regenerate `@prisma/client`).
- **Phase 8C:** Credit Lifecycle Logic Correction (decouple permanent rollover credits from monthly allowances in `usage-service.ts` and fix reset/overwrite bugs).
- **Phase 8D:** Environment Configuration & Secret Hardening (reconcile missing variables in `.env.example`).
- **Phase 8E:** Safe Removal/Archival of Dead Code.
- **Phase 8F:** Route & Service Decoupling.

*Phase 8A is complete. No commits or pushes have been made.*
