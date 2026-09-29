/**
 * Dual-Pool Monthly + Permanent Credit System Test Suite
 *
 * Requirements tested:
 *   1. New FREE user receives 10 monthly credits, 0 permanent credits, total 10.
 *   2. Consume 1 monthly credit.
 *   3. Consume all 10 Month-1 monthly credits.
 *   4. 11th request blocked when no permanent credits exist.
 *   5. Month-2 reset: monthly allowance = 3, monthly used = 0.
 *   6. Month-2 reset preserves permanent credits.
 *   7. Admin grants 25 permanent credits.
 *   8. Admin grant survives another API usage read.
 *   9. Admin grant survives monthly reset.
 *  10. Monthly-first consumption.
 *  11. Monthly exhaustion spills into permanent pool.
 *  12. Permanent-only consumption after monthly exhaustion.
 *  13. Insufficient combined balance rejects the operation.
 *  14. Usage API reports distinct monthly/permanent/total values.
 *  15. Plan allowance comes from canonical registry.
 *  16. Upgrade preserves permanent credits.
 *  17. Downgrade/expiry preserves permanent credits.
 *  18. Concurrent consumption cannot double-spend the same credit.
 *  19. Admin credit cache invalidation works.
 *  20. No monthly rollover.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getUserUsage,
  consumeUsage,
  clearInMemoryUsage,
  setInMemoryUserCreatedAt,
  addMonths,
  grantPermanentCredits,
  invalidateUserUsageCache,
} from "../apps/api/src/services/usage-service";
import {
  getUserSubscription,
  updateUserSubscriptionState,
  clearInMemorySubscriptions,
} from "../apps/api/src/services/subscription-service";
import { getUserPlan } from "../apps/api/src/services/entitlement-service";
import { SAAS_PLANS_REGISTRY } from "@ai-social/shared";

const { mockPrisma } = vi.hoisted(() => {
  const mock: any = {
    userUsage: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    workspace: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    adminAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (cb: any) => cb(mock)),
  };
  return { mockPrisma: mock };
});

vi.mock("@ai-social/database", () => {
  return {
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

describe("Dual-Pool Monthly + Permanent Credit System", () => {
  beforeEach(() => {
    clearInMemoryUsage();
    clearInMemorySubscriptions();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearInMemoryUsage();
    clearInMemorySubscriptions();
  });

  it("1. New FREE user receives 10 monthly credits, 0 permanent credits, total 10", async () => {
    const userId = "test-user-1";
    const usage = await getUserUsage(userId);
    expect(usage.isInitialMonth).toBe(true);
    expect(usage.monthlyCreditsAllowance).toBe(10);
    expect(usage.monthlyCreditsUsed).toBe(0);
    expect(usage.monthlyCreditsRemaining).toBe(10);
    expect(usage.permanentCreditsTotal).toBe(0);
    expect(usage.permanentCreditsUsed).toBe(0);
    expect(usage.permanentCreditsRemaining).toBe(0);
    expect(usage.totalRemainingCredits).toBe(10);
    expect(usage.freeCreditsTotal).toBe(10);
    expect(usage.freeCreditsRemaining).toBe(10);
  });

  it("2. Consume 1 monthly credit", async () => {
    const userId = "test-user-2";
    await consumeUsage(userId, "CONTENT_GENERATION", 1);
    const usage = await getUserUsage(userId);
    expect(usage.monthlyCreditsUsed).toBe(1);
    expect(usage.monthlyCreditsRemaining).toBe(9);
    expect(usage.permanentCreditsUsed).toBe(0);
    expect(usage.totalRemainingCredits).toBe(9);
  });

  it("3. Consume all 10 Month-1 monthly credits", async () => {
    const userId = "test-user-3";
    for (let i = 0; i < 10; i++) {
      await consumeUsage(userId, "CONTENT_GENERATION", 1);
    }
    const usage = await getUserUsage(userId);
    expect(usage.monthlyCreditsUsed).toBe(10);
    expect(usage.monthlyCreditsRemaining).toBe(0);
    expect(usage.totalRemainingCredits).toBe(0);
  });

  it("4. 11th request blocked when no permanent credits exist", async () => {
    const userId = "test-user-4";
    for (let i = 0; i < 10; i++) {
      await consumeUsage(userId, "CONTENT_GENERATION", 1);
    }
    await expect(consumeUsage(userId, "CONTENT_GENERATION", 1)).rejects.toThrow(/PLAN_LIMIT_REACHED|exhausted/);
  });

  it("5. Month-2 reset: monthly allowance = 3, monthly used = 0", async () => {
    const userId = "test-user-5";
    const now = new Date();
    setInMemoryUserCreatedAt(userId, addMonths(now, -1)); // Month 2

    const usage = await getUserUsage(userId);
    expect(usage.isInitialMonth).toBe(false);
    expect(usage.monthlyCreditsAllowance).toBe(3);
    expect(usage.monthlyCreditsUsed).toBe(0);
    expect(usage.monthlyCreditsRemaining).toBe(3);
    expect(usage.totalRemainingCredits).toBe(3);
  });

  it("6. Month-2 reset preserves permanent credits", async () => {
    const userId = "test-user-6";
    const now = new Date();
    setInMemoryUserCreatedAt(userId, now); // Month 1

    await grantPermanentCredits(userId, 20);
    const m1Usage = await getUserUsage(userId);
    expect(m1Usage.permanentCreditsTotal).toBe(20);
    expect(m1Usage.totalRemainingCredits).toBe(30); // 10 monthly + 20 perm

    // Advance to Month 2
    setInMemoryUserCreatedAt(userId, addMonths(now, -1));
    const m2Usage = await getUserUsage(userId);
    expect(m2Usage.monthlyCreditsAllowance).toBe(3);
    expect(m2Usage.monthlyCreditsUsed).toBe(0);
    expect(m2Usage.permanentCreditsTotal).toBe(20); // Preserved!
    expect(m2Usage.permanentCreditsRemaining).toBe(20);
    expect(m2Usage.totalRemainingCredits).toBe(23); // 3 + 20 = 23
  });

  it("7. Admin grants 25 permanent credits", async () => {
    const userId = "test-user-7";
    await grantPermanentCredits(userId, 25);
    const usage = await getUserUsage(userId);
    expect(usage.permanentCreditsTotal).toBe(25);
    expect(usage.permanentCreditsRemaining).toBe(25);
    expect(usage.monthlyCreditsAllowance).toBe(10); // Month 1 remains 10
    expect(usage.totalRemainingCredits).toBe(35); // 10 + 25
  });

  it("8. Admin grant survives another API usage read", async () => {
    const userId = "test-user-8";
    await grantPermanentCredits(userId, 25);
    const u1 = await getUserUsage(userId);
    const u2 = await getUserUsage(userId);
    const u3 = await getUserUsage(userId);
    expect(u3.permanentCreditsTotal).toBe(25);
    expect(u3.totalRemainingCredits).toBe(35);
  });

  it("9. Admin grant survives monthly reset", async () => {
    const userId = "test-user-9";
    const now = new Date();
    setInMemoryUserCreatedAt(userId, now); // Month 1
    await grantPermanentCredits(userId, 25);

    // Advance to Month 2
    setInMemoryUserCreatedAt(userId, addMonths(now, -1));
    const m2Usage = await getUserUsage(userId);
    expect(m2Usage.monthlyCreditsAllowance).toBe(3);
    expect(m2Usage.permanentCreditsTotal).toBe(25); // Survives!
    expect(m2Usage.totalRemainingCredits).toBe(28); // 3 + 25
  });

  it("10. Monthly-first consumption", async () => {
    const userId = "test-user-10";
    await grantPermanentCredits(userId, 10); // 10 monthly + 10 perm = 20 total
    await consumeUsage(userId, "CONTENT_GENERATION", 3);

    const usage = await getUserUsage(userId);
    expect(usage.monthlyCreditsUsed).toBe(3); // Deducted from monthly
    expect(usage.monthlyCreditsRemaining).toBe(7);
    expect(usage.permanentCreditsUsed).toBe(0); // Permanent untouched
    expect(usage.permanentCreditsRemaining).toBe(10);
    expect(usage.totalRemainingCredits).toBe(17);
  });

  it("11. Monthly exhaustion spills into permanent pool", async () => {
    const userId = "test-user-11";
    await grantPermanentCredits(userId, 10); // 10 monthly + 10 perm = 20 total
    // Consume 12 credits (10 monthly + 2 permanent)
    await consumeUsage(userId, "CONTENT_GENERATION", 12);

    const usage = await getUserUsage(userId);
    expect(usage.monthlyCreditsUsed).toBe(10);
    expect(usage.monthlyCreditsRemaining).toBe(0);
    expect(usage.permanentCreditsUsed).toBe(2);
    expect(usage.permanentCreditsRemaining).toBe(8);
    expect(usage.totalRemainingCredits).toBe(8);
  });

  it("12. Permanent-only consumption after monthly exhaustion", async () => {
    const userId = "test-user-12";
    await grantPermanentCredits(userId, 10); // 10 monthly + 10 perm
    await consumeUsage(userId, "CONTENT_GENERATION", 10); // Exhaust monthly pool

    await consumeUsage(userId, "CONTENT_GENERATION", 4); // Consumes from permanent pool
    const usage = await getUserUsage(userId);
    expect(usage.monthlyCreditsUsed).toBe(10);
    expect(usage.monthlyCreditsRemaining).toBe(0);
    expect(usage.permanentCreditsUsed).toBe(4);
    expect(usage.permanentCreditsRemaining).toBe(6);
    expect(usage.totalRemainingCredits).toBe(6);
  });

  it("13. Insufficient combined balance rejects the operation", async () => {
    const userId = "test-user-13";
    await grantPermanentCredits(userId, 5); // 10 monthly + 5 perm = 15 total
    await expect(consumeUsage(userId, "CONTENT_GENERATION", 16)).rejects.toThrow(/PLAN_LIMIT_REACHED|exhausted/);

    // Ensure no partial consumption took place
    const usage = await getUserUsage(userId);
    expect(usage.totalRemainingCredits).toBe(15);
  });

  it("14. Usage API reports distinct monthly/permanent/total values", async () => {
    const userId = "test-user-14";
    await grantPermanentCredits(userId, 5);
    await consumeUsage(userId, "CONTENT_GENERATION", 2);

    const usage = await getUserUsage(userId);
    expect(usage.monthlyCreditsAllowance).toBe(10);
    expect(usage.monthlyCreditsUsed).toBe(2);
    expect(usage.monthlyCreditsRemaining).toBe(8);
    expect(usage.permanentCreditsTotal).toBe(5);
    expect(usage.permanentCreditsUsed).toBe(0);
    expect(usage.permanentCreditsRemaining).toBe(5);
    expect(usage.totalRemainingCredits).toBe(13);
  });

  it("15. Plan allowance comes from canonical registry", () => {
    expect(SAAS_PLANS_REGISTRY.PRO.monthlyWorkflows).toBe(50);
    expect(SAAS_PLANS_REGISTRY.ADVANCED.monthlyWorkflows).toBe(150);
    expect(SAAS_PLANS_REGISTRY.PREMIUM.monthlyWorkflows).toBe(300);
    expect(SAAS_PLANS_REGISTRY.BUSINESS.monthlyWorkflows).toBe(500);
  });

  it("16. Upgrade preserves permanent credits", async () => {
    const userId = "test-user-16";
    await grantPermanentCredits(userId, 15);
    await updateUserSubscriptionState(userId, { plan: "PRO", status: "ACTIVE" });

    const usage = await getUserUsage(userId);
    expect(usage.monthlyCreditsAllowance).toBe(50);
    expect(usage.permanentCreditsTotal).toBe(15); // Preserved!
    expect(usage.totalRemainingCredits).toBe(65); // 50 + 15
  });

  it("17. Downgrade/expiry preserves permanent credits", async () => {
    const userId = "test-user-17";
    await grantPermanentCredits(userId, 15);
    await updateUserSubscriptionState(userId, { plan: "PRO", status: "ACTIVE" });

    // Downgrade to FREE
    await updateUserSubscriptionState(userId, { plan: "FREE", status: "EXPIRED" });
    setInMemoryUserCreatedAt(userId, addMonths(new Date(), -1)); // Month 2+

    const usage = await getUserUsage(userId);
    expect(usage.monthlyCreditsAllowance).toBe(3);
    expect(usage.permanentCreditsTotal).toBe(15); // Preserved!
    expect(usage.totalRemainingCredits).toBe(18); // 3 + 15
  });

  it("18. Concurrent consumption cannot double-spend the same credit", async () => {
    const userId = "test-user-18";
    const now = new Date();
    setInMemoryUserCreatedAt(userId, addMonths(now, -1)); // Month 2 (3 credits)

    const results = await Promise.allSettled([
      consumeUsage(userId, "CONTENT_GENERATION", 1),
      consumeUsage(userId, "CONTENT_GENERATION", 1),
      consumeUsage(userId, "CONTENT_GENERATION", 1),
      consumeUsage(userId, "CONTENT_GENERATION", 1),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(1);

    const finalUsage = await getUserUsage(userId);
    expect(finalUsage.totalRemainingCredits).toBe(0);
  });

  it("19. Admin credit cache invalidation works", async () => {
    const userId = "test-user-19";
    await getUserUsage(userId);
    invalidateUserUsageCache(userId);

    const fresh = await getUserUsage(userId);
    expect(fresh.monthlyCreditsAllowance).toBe(10);
    expect(fresh.totalRemainingCredits).toBe(10);
  });

  it("20. No monthly rollover of unused monthly credits", async () => {
    const userId = "test-user-20";
    const now = new Date();
    setInMemoryUserCreatedAt(userId, now);

    // 0 credits used in Month 1 (10 remaining)
    const m1Usage = await getUserUsage(userId);
    expect(m1Usage.monthlyCreditsRemaining).toBe(10);

    // Move to Month 2
    setInMemoryUserCreatedAt(userId, addMonths(now, -1));

    const m2Usage = await getUserUsage(userId);
    expect(m2Usage.monthlyCreditsAllowance).toBe(3);
    expect(m2Usage.monthlyCreditsRemaining).toBe(3); // Exactly 3 (does NOT become 13)
    expect(m2Usage.totalRemainingCredits).toBe(3);
  });
});
