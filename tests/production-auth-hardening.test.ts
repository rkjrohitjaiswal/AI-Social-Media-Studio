import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requireAuth, AuthenticatedRequest } from "../apps/api/src/middleware/auth.js";
import { getSupabaseAdminClient } from "../apps/api/src/config/supabase.js";
import {
  authenticateAdminCredentials,
  ensureInitialAdminAccount,
  clearInMemoryAdminState,
} from "../apps/api/src/services/admin-auth-service.js";
import * as supabaseConfig from "../apps/api/src/config/supabase.js";

function createMockExpressContext(headers: Record<string, string> = {}) {
  const req = {
    headers: { ...headers },
    cookies: {},
    user: undefined,
    workspaceId: undefined,
  } as unknown as AuthenticatedRequest;

  let statusCode = 200;
  let jsonResponse: any = null;

  const res = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((data: any) => {
      jsonResponse = data;
      return res;
    }),
  } as any;

  let nextCalled = false;
  const next = vi.fn(() => {
    nextCalled = true;
  });

  return {
    req,
    res,
    next,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
    wasNextCalled: () => nextCalled,
  };
}

describe("Phase 8A — Production Authentication Hardening Test Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // Requirement 1: Development + x-user-id
  it("1. allows x-user-id header override in development environment", async () => {
    process.env.NODE_ENV = "development";
    const { req, res, next, wasNextCalled } = createMockExpressContext({
      "x-user-id": "dev-engineer-101",
    });

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user?.id).toBe("dev-engineer-101");
    expect(req.user?.email).toBe("dev-engineer-101@studio.ai");
  });

  // Requirement 2: Test + x-user-id
  it("2. allows x-user-id header override in test environment", async () => {
    process.env.NODE_ENV = "test";
    const { req, res, next, wasNextCalled } = createMockExpressContext({
      "x-user-id": "test-runner-202",
    });

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user?.id).toBe("test-runner-202");
    expect(req.user?.email).toBe("test-runner-202@studio.ai");
  });

  // Requirement 3: Production + x-user-id without valid auth -> 401
  it("3. rejects x-user-id header override with 401 in production environment when unauthenticated", async () => {
    process.env.NODE_ENV = "production";
    const { req, res, next, wasNextCalled, getStatusCode, getJsonResponse } =
      createMockExpressContext({
        "x-user-id": "target-victim-id",
      });

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(false);
    expect(getStatusCode()).toBe(401);
    expect(getJsonResponse().error).toContain("Unauthorized");
    expect(req.user).toBeUndefined();
  });

  // Requirement 3b: Production + x-user-id with valid auth does NOT override token identity
  it("3b. ignores x-user-id in production and strictly enforces verified token identity", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-production-service-role-key-12345";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://legit-project.supabase.co";

    // Mock Supabase getUser to return legit token user
    vi.spyOn(supabaseConfig, "getSupabaseAdminClient").mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "real-token-authenticated-id",
              email: "real-user@studio.ai",
            },
          },
          error: null,
        }),
      },
    } as any);

    const { req, res, next, wasNextCalled } = createMockExpressContext({
      authorization: "Bearer valid-signed-jwt-token",
      "x-user-id": "attempted-spoofed-victim-id",
    });

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(true);
    expect(req.user).toBeDefined();
    // Identity must come from verified token, NOT the spoofed x-user-id header
    expect(req.user?.id).toBe("real-token-authenticated-id");
    expect(req.user?.email).toBe("real-user@studio.ai");
  });

  // Requirement 4: Development/test missing token behavior
  it("4. retains demo-user-id fallback in development/test environment when token is missing", async () => {
    process.env.NODE_ENV = "development";
    const { req, res, next, wasNextCalled } = createMockExpressContext({});

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user?.id).toBe("demo-user-id");
    expect(req.user?.email).toBe("demo@maisonlumiere.com");
  });

  // Requirement 5: Production missing token -> 401
  it("5. rejects unauthenticated requests with 401 in production environment", async () => {
    process.env.NODE_ENV = "production";
    const { req, res, next, wasNextCalled, getStatusCode, getJsonResponse } =
      createMockExpressContext({});

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(false);
    expect(getStatusCode()).toBe(401);
    expect(getJsonResponse().error).toContain("Unauthorized: Authentication token required");
    expect(req.user).toBeUndefined();
  });

  // Requirement 6: Production invalid token -> 401
  it("6. rejects invalid Supabase token with 401 in production environment", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-production-service-role-key-12345";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://legit-project.supabase.co";

    vi.spyOn(supabaseConfig, "getSupabaseAdminClient").mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Invalid JWT token" },
        }),
      },
    } as any);

    const { req, res, next, wasNextCalled, getStatusCode, getJsonResponse } =
      createMockExpressContext({
        authorization: "Bearer invalid-tampered-token",
      });

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(false);
    expect(getStatusCode()).toBe(401);
    expect(getJsonResponse().error).toContain("Unauthorized: Invalid or expired token");
    expect(req.user).toBeUndefined();
  });

  // Requirement 7: Valid Supabase-authenticated request still works
  it("7. accepts valid Supabase JWT in production and establishes user identity", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-production-service-role-key-12345";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://legit-project.supabase.co";

    vi.spyOn(supabaseConfig, "getSupabaseAdminClient").mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "supabase-valid-user-id",
              email: "director@maisonlumiere.com",
            },
          },
          error: null,
        }),
      },
    } as any);

    const { req, res, next, wasNextCalled } = createMockExpressContext({
      authorization: "Bearer valid-supabase-token",
    });

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user?.id).toBe("supabase-valid-user-id");
    expect(req.user?.email).toBe("director@maisonlumiere.com");
  });

  // Requirement 8: Valid admin adm_ authentication still works
  it("8. preserves stateless admin adm_ session token verification", async () => {
    process.env.ADMIN_EMAIL = "admin@studio.ai";
    process.env.ADMIN_PASSWORD = "StrongAdminPassword@2026";
    clearInMemoryAdminState();
    await ensureInitialAdminAccount();

    const authResult = await authenticateAdminCredentials(
      "admin@studio.ai",
      "StrongAdminPassword@2026"
    );
    expect(authResult.success).toBe(true);
    const adminToken = authResult.session!.token;

    // Test valid admin token
    const { req, res, next, wasNextCalled } = createMockExpressContext({
      authorization: `Bearer ${adminToken}`,
    });

    await requireAuth(req, res, next);

    expect(wasNextCalled()).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user?.isAdmin).toBe(true);
    expect(req.user?.email).toBe("admin@studio.ai");

    // Test invalid adm_ token
    const invalidContext = createMockExpressContext({
      authorization: "Bearer adm_tampered_invalid_token.signature",
    });

    await requireAuth(invalidContext.req, invalidContext.res, invalidContext.next);

    expect(invalidContext.wasNextCalled()).toBe(false);
    expect(invalidContext.getStatusCode()).toBe(401);
    expect(invalidContext.getJsonResponse().error).toContain("admin session token");
  });

  // Requirement 9: Production cannot use NEXT_PUBLIC_SUPABASE_ANON_KEY as service role
  it("9. fails clearly in production when SUPABASE_SERVICE_ROLE_KEY is absent, and rejects anon key fallback", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-that-must-not-be-used-as-service-role";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real-project.supabase.co";

    expect(() => getSupabaseAdminClient()).toThrowError(
      /SUPABASE_SERVICE_ROLE_KEY is required in production environment/
    );

    // Also verify missing URL throws in production
    process.env.SUPABASE_SERVICE_ROLE_KEY = "valid-secret-role-key-999";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(() => getSupabaseAdminClient()).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL is required in production environment/
    );

    // Verify development/test allows fallback without throwing
    process.env.NODE_ENV = "test";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    expect(() => getSupabaseAdminClient()).not.toThrow();
  });
});
