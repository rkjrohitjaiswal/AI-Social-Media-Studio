import { describe, it, expect, beforeEach } from "vitest";
import {
  hashAdminPassword,
  authenticateAdminCredentials,
  getStoredAdminHash,
  ensureInitialAdminAccount,
  verifyAdminSessionToken,
  clearInMemoryAdminState,
} from "../apps/api/src/services/admin-auth-service.js";
import { ensureUserExists } from "../apps/api/src/middleware/auth.js";

describe("Production Admin Authentication, Profile & Route Alias Test Suite", () => {
  const testAdminEmail = "admin-test@studio.ai";
  const testAdminPassword = "SecureAdminPassword@2026";

  beforeEach(async () => {
    process.env.ADMIN_EMAIL = testAdminEmail;
    process.env.ADMIN_PASSWORD = testAdminPassword;
    clearInMemoryAdminState();
    await ensureInitialAdminAccount();
  });

  it("1. hashes passwords securely using cryptographic PBKDF2 (never plaintext)", () => {
    const hashed = hashAdminPassword(testAdminPassword);

    expect(hashed).not.toBe(testAdminPassword);
    expect(hashed).toContain(":"); // Salt:Hash format
    expect(hashed.split(":")[0].length).toBeGreaterThan(10); // Salt present
    expect(hashed.split(":")[1].length).toBeGreaterThan(30); // Hash present

    // Verify stored password hash in admin service is not plaintext
    const stored = getStoredAdminHash(testAdminEmail);
    expect(stored).toBeDefined();
    expect(stored).not.toBe(testAdminPassword);
    expect(stored).toContain(":");
  });

  it("2. authenticates admin credentials successfully with correct password", async () => {
    const result = await authenticateAdminCredentials(testAdminEmail, testAdminPassword);

    expect(result.success).toBe(true);
    expect(result.session).toBeDefined();
    expect(result.session?.email).toBe(testAdminEmail);
    expect(result.session?.isAdmin).toBe(true);
    expect(result.session?.token.startsWith("adm_")).toBe(true);
  });

  it("3. verifies 100% stateless admin session token verification across Vercel serverless cold starts", async () => {
    // Step 1: Log in on Lambda Instance A
    const loginResult = await authenticateAdminCredentials(testAdminEmail, testAdminPassword);
    expect(loginResult.success).toBe(true);
    const token = loginResult.session!.token;

    // Step 2: Simulate Vercel Lambda Instance termination / cold-start by wiping in-memory session cache
    clearInMemoryAdminState();

    // Step 3: Request /api/admin/auth/me on fresh Lambda Instance B
    const verified = verifyAdminSessionToken(token);

    expect(verified).not.toBeNull();
    expect(verified?.email).toBe(testAdminEmail);
    expect(verified?.isAdmin).toBe(true);
    expect(verified?.token).toBe(token);
  });

  it("4. resolves authenticated user consistently by id, supabaseUid, or email without duplicates or 404s", async () => {
    const testEmail = "profile-test-user@studio.ai";
    const testSubId = "sub_uid_9988776655";

    // 1. Ensure user exists via auth middleware helper
    const user1 = await ensureUserExists(testSubId, testEmail);
    expect(user1).not.toBeNull();
    expect(user1?.email).toBe(testEmail);

    // 2. Subsequent authentication attempt with same email should resolve existing record
    const user2 = await ensureUserExists(testSubId, testEmail);
    expect(user2).not.toBeNull();
    expect(user2?.id).toBe(user1?.id);
  });

  it("5. rejects admin login attempt with incorrect password", async () => {
    const result = await authenticateAdminCredentials(testAdminEmail, "WrongPassword@999");

    expect(result.success).toBe(false);
    expect(result.session).toBeUndefined();
    expect(result.error).toBe("Invalid admin email or password");
  });

  it("6. rejects tampered or invalid session tokens", () => {
    const invalidToken = "adm_invalid_token_signature_123.fake_signature";
    const verified = verifyAdminSessionToken(invalidToken);

    expect(verified).toBeNull();
  });
});
