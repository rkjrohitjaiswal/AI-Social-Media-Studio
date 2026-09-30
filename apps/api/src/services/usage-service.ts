import prisma from "@ai-social/database";

// Helper to determine if a user is an admin (has unlimited credits)
async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    return !!dbUser?.isAdmin;
  } catch {
    // If DB lookup fails, treat as non-admin (fails safe)
    return false;
  }
}

import { getUserPlan, getPlanEntitlements } from "./entitlement-service.js";

export interface StoredUserUsage {
  userId: string;
  workspaceId?: string;
  freeCreditsTotal: number;
  freeCreditsUsed: number;
  permanentCreditsTotal: number;
  permanentCreditsUsed: number;
  monthlyCreditsAllowance: number;
  monthlyCreditsUsed: number;
  monthlyCycleStart?: Date;
  lastMonthlyReset?: Date;
  userCreatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DetailedUserUsage {
  // Legacy compatibility fields
  freeCreditsTotal: number;
  freeCreditsUsed: number;
  freeCreditsRemaining: number;
  monthlyLimit: number;
  usedCredits: number;
  remainingCredits: number;

  // Dual-pool fields
  totalRemainingCredits: number;
  permanentCreditsTotal: number;
  permanentCreditsUsed: number;
  permanentCreditsRemaining: number;
  monthlyCreditsAllowance: number;
  monthlyCreditsUsed: number;
  monthlyCreditsRemaining: number;

  nextMonthlyResetDate: string;
  isInitialMonth: boolean;
  cycleIndex: number;
}

// In-Memory Stores for Test / Fallback & Authoritative Locks
const usageMemoryStore = new Map<string, StoredUserUsage>();
const userCreatedAtMemoryStore = new Map<string, Date>();
const consumedScheduledPosts = new Set<string>();
const userLocks = new Map<string, Promise<void>>();

export function clearInMemoryUsage(): void {
  usageMemoryStore.clear();
  userCreatedAtMemoryStore.clear();
  consumedScheduledPosts.clear();
  userLocks.clear();
}

/**
 * Invalidates the in-memory usage cache for a user so subsequent calls reload from DB.
 */
export function invalidateUserUsageCache(userId: string): void {
  usageMemoryStore.delete(userId);
}

/**
 * Sets simulated user creation date for in-memory / unit testing scenarios.
 */
export function setInMemoryUserCreatedAt(userId: string, createdAt: Date): void {
  userCreatedAtMemoryStore.set(userId, createdAt);
  const existing = usageMemoryStore.get(userId);
  if (existing) {
    existing.userCreatedAt = createdAt;
    existing.monthlyCycleStart = undefined;
    existing.lastMonthlyReset = undefined;
  }
}

/**
 * Helper to add N full months to a Date cleanly, preserving day boundaries.
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

/**
 * Determines the current monthly cycle start date, next reset date, and cycle index based on user signup date.
 * Cycle 0 (Month 1): userCreatedAt -> userCreatedAt + 1 Month (Allowance: 10 credits)
 * Cycle 1+ (Month 2+): userCreatedAt + k Months -> userCreatedAt + (k+1) Months (Allowance: 3 credits)
 */
export function getMonthlyCycleInfo(userCreatedAt: Date, now: Date): {
  isInitialMonth: boolean;
  cycleIndex: number;
  cycleStart: Date;
  nextResetDate: Date;
} {
  const created = new Date(userCreatedAt.getTime());
  const monthOneEnd = addMonths(created, 1);

  if (now < monthOneEnd) {
    return {
      isInitialMonth: true,
      cycleIndex: 0,
      cycleStart: created,
      nextResetDate: monthOneEnd,
    };
  }

  let k = 1;
  while (now >= addMonths(created, k + 1)) {
    k++;
  }

  const cycleStart = addMonths(created, k);
  const nextResetDate = addMonths(created, k + 1);

  return {
    isInitialMonth: false,
    cycleIndex: k,
    cycleStart,
    nextResetDate,
  };
}

/**
 * Ensures mutual exclusion for a specific identifier (canonical userId)
 * to prevent concurrent race conditions during credit consumption.
 */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = userLocks.get(key) || Promise.resolve();
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  userLocks.set(key, currentLock.then(() => nextLock));

  try {
    await currentLock;
    return await fn();
  } finally {
    release!();
    if (userLocks.get(key) === currentLock.then(() => nextLock)) {
      userLocks.delete(key);
    }
  }
}

/**
 * Resolves a given identifier (userId or workspaceId) to the canonical user ID.
 */
export async function resolveCanonicalUserId(userIdOrWorkspaceId: string): Promise<string> {
  if (!userIdOrWorkspaceId) return "demo-user-1";

  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: userIdOrWorkspaceId },
      select: { ownerId: true },
    });
    if (ws?.ownerId) return ws.ownerId;
  } catch {
    // Non-fatal
  }

  return userIdOrWorkspaceId;
}

/**
 * Resolves the primary userId for a given workspaceId or returns the provided userId.
 */
export async function resolveUserIdForWorkspace(userId?: string, workspaceId?: string): Promise<string> {
  if (userId) return userId;

  if (workspaceId) {
    return resolveCanonicalUserId(workspaceId);
  }

  return "demo-user-1";
}

/**
 * Server-side helper to check if a user can consume `amount` credits.
 */
export async function canUseCredits(userId: string, amount: number = 1): Promise<boolean> {
  const usage = await getUserUsage(userId);
  return usage.totalRemainingCredits >= amount;
}

/**
 * Retrieves the current usage summary, enforcing the dual-pool credit ledger:
 * - Monthly Pool: resets every cycle; unused monthly credits expire;
 * - Permanent Pool: never resets; survives monthly transitions and plan changes;
 * - Total Remaining = monthlyRemaining + permanentRemaining.
 */
export async function getUserUsage(userIdOrWorkspaceId: string): Promise<DetailedUserUsage> {
  if (!userIdOrWorkspaceId) {
    throw new Error("User ID or Workspace ID is required to fetch usage");
  }

  const userId = await resolveCanonicalUserId(userIdOrWorkspaceId);
  const plan = await getUserPlan(userId);
  const entitlements = getPlanEntitlements(plan);
  const now = new Date();

  let record = usageMemoryStore.get(userId);

  if (!record) {
    try {
      const dbRecord = await prisma.userUsage.findUnique({
        where: { userId },
        include: { user: { select: { createdAt: true } } },
      });
      if (dbRecord) {
        record = {
          userId: dbRecord.userId,
          freeCreditsTotal: dbRecord.freeCreditsTotal,
          freeCreditsUsed: dbRecord.freeCreditsUsed,
          permanentCreditsTotal: dbRecord.permanentCreditsTotal,
          permanentCreditsUsed: dbRecord.permanentCreditsUsed,
          monthlyCreditsAllowance: dbRecord.monthlyCreditsAllowance,
          monthlyCreditsUsed: dbRecord.monthlyCreditsUsed,
          monthlyCycleStart: dbRecord.monthlyCycleStart ?? undefined,
          lastMonthlyReset: dbRecord.lastMonthlyReset ?? undefined,
          userCreatedAt: dbRecord.user?.createdAt || dbRecord.createdAt,
          createdAt: dbRecord.createdAt,
          updatedAt: dbRecord.updatedAt,
        };
        usageMemoryStore.set(userId, record);
      }
    } catch {
      // DB offline fallback
    }
  }

  // Determine user account creation date
  let userCreatedAt = record?.userCreatedAt || userCreatedAtMemoryStore.get(userId);

  if (!userCreatedAt) {
    try {
      const userDb = await prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });
      if (userDb?.createdAt) {
        userCreatedAt = userDb.createdAt;
      }
    } catch {
      // Fallback
    }
  }

  if (!userCreatedAt) {
    userCreatedAt = record?.createdAt || now;
  }

  const cycleInfo = getMonthlyCycleInfo(userCreatedAt, now);

  // Determine canonical monthly allowance for the current cycle
  let canonicalMonthlyAllowance = 10;
  if (plan === "FREE") {
    canonicalMonthlyAllowance = cycleInfo.isInitialMonth ? 10 : 3;
  } else {
    canonicalMonthlyAllowance = entitlements.monthlyWorkflows;
  }

  if (!record) {
    // New User: 10 Monthly (Month 1) or 3 (Month 2+), 0 Permanent
    const initialMonthly = canonicalMonthlyAllowance;
    const initialPermanent = 0;
    const initialTotal = initialMonthly + initialPermanent;

    record = {
      userId,
      freeCreditsTotal: initialTotal,
      freeCreditsUsed: 0,
      permanentCreditsTotal: initialPermanent,
      permanentCreditsUsed: 0,
      monthlyCreditsAllowance: initialMonthly,
      monthlyCreditsUsed: 0,
      monthlyCycleStart: cycleInfo.cycleStart,
      lastMonthlyReset: now,
      userCreatedAt,
      createdAt: now,
      updatedAt: now,
    };
    usageMemoryStore.set(userId, record);

    try {
      await prisma.userUsage.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          freeCreditsTotal: initialTotal,
          freeCreditsUsed: 0,
          permanentCreditsTotal: initialPermanent,
          permanentCreditsUsed: 0,
          monthlyCreditsAllowance: initialMonthly,
          monthlyCreditsUsed: 0,
          monthlyCycleStart: cycleInfo.cycleStart,
          lastMonthlyReset: now,
        },
      });
    } catch {
      // Non-fatal
    }
  }

  // ── MONTHLY CYCLE RESET & PLAN SYNC ─────────────────────────────────────────
  // Trigger reset ONLY if:
  // 1. A new monthly cycle has started (cycleStart advanced past record's cycle), OR
  // 2. monthlyCycleStart or lastMonthlyReset is missing, OR
  // 3. The plan tier changed mid-cycle (monthlyCreditsAllowance !== canonicalMonthlyAllowance)
  const isNewCycle =
    !record.monthlyCycleStart ||
    record.monthlyCycleStart < cycleInfo.cycleStart ||
    !record.lastMonthlyReset ||
    record.lastMonthlyReset < cycleInfo.cycleStart;

  const planChanged = record.monthlyCreditsAllowance !== canonicalMonthlyAllowance;
  const needsReset = isNewCycle || planChanged;

  if (needsReset) {
    if (isNewCycle) {
      // New monthly cycle: reset monthly used, update monthly allowance
      // CRITICAL: permanentCreditsTotal and permanentCreditsUsed are NEVER modified on reset
      record.monthlyCreditsAllowance = canonicalMonthlyAllowance;
      record.monthlyCreditsUsed = 0;
      record.monthlyCycleStart = cycleInfo.cycleStart;
      record.lastMonthlyReset = now;
    } else if (planChanged) {
      // Mid-cycle plan change: update monthly allowance, clamp used if exceeding new allowance
      record.monthlyCreditsAllowance = canonicalMonthlyAllowance;
      record.monthlyCreditsUsed = Math.min(record.monthlyCreditsUsed, canonicalMonthlyAllowance);
    }

    // Maintain legacy mirrors
    record.freeCreditsTotal = record.monthlyCreditsAllowance + record.permanentCreditsTotal;
    record.freeCreditsUsed = record.monthlyCreditsUsed + record.permanentCreditsUsed;
    record.updatedAt = now;

    usageMemoryStore.set(userId, record);

    try {
      await prisma.userUsage.update({
        where: { userId },
        data: {
          monthlyCreditsAllowance: record.monthlyCreditsAllowance,
          monthlyCreditsUsed: record.monthlyCreditsUsed,
          freeCreditsTotal: record.freeCreditsTotal,
          freeCreditsUsed: record.freeCreditsUsed,
          monthlyCycleStart: record.monthlyCycleStart,
          lastMonthlyReset: record.lastMonthlyReset,
          updatedAt: now,
        },
      });
    } catch {
      // Non-fatal
    }
  }

  const monthlyRemaining = Math.max(0, record.monthlyCreditsAllowance - record.monthlyCreditsUsed);
  const permanentRemaining = Math.max(0, record.permanentCreditsTotal - record.permanentCreditsUsed);
  const totalRemaining = monthlyRemaining + permanentRemaining;
  const totalUsed = record.monthlyCreditsUsed + record.permanentCreditsUsed;
  const totalAllowance = record.monthlyCreditsAllowance + record.permanentCreditsTotal;

  return {
    // Legacy compatibility fields
    freeCreditsTotal: totalAllowance,
    freeCreditsUsed: totalUsed,
    freeCreditsRemaining: totalRemaining,
    monthlyLimit: record.monthlyCreditsAllowance,
    usedCredits: totalUsed,
    remainingCredits: totalRemaining,
    totalRemainingCredits: totalRemaining,

    // Dual-pool fields
    permanentCreditsTotal: record.permanentCreditsTotal,
    permanentCreditsUsed: record.permanentCreditsUsed,
    permanentCreditsRemaining: permanentRemaining,

    monthlyCreditsAllowance: record.monthlyCreditsAllowance,
    monthlyCreditsUsed: record.monthlyCreditsUsed,
    monthlyCreditsRemaining: monthlyRemaining,

    nextMonthlyResetDate: cycleInfo.nextResetDate.toISOString(),
    isInitialMonth: cycleInfo.isInitialMonth,
    cycleIndex: cycleInfo.cycleIndex,
  };
}

/**
 * Checks whether a user/workspace has sufficient available credits (Monthly + Permanent).
 */
export async function checkUsageAccess(
  userIdOrWorkspaceId: string,
  action: "CONTENT_GENERATION" | "PUBLISHING" = "CONTENT_GENERATION"
): Promise<{
  allowed: boolean;
  code?: string;
  message?: string;
  freeCreditsRemaining: number;
  isPro: boolean;
}> {
  const userId = await resolveCanonicalUserId(userIdOrWorkspaceId);
  // Admin users have unlimited credits; bypass all checks
  if (await isAdminUser(userId)) {
    return {
      allowed: true,
      freeCreditsRemaining: Number.MAX_SAFE_INTEGER,
      isPro: true,
    };
  }
  const plan = await getUserPlan(userId);
  const usage = await getUserUsage(userId);
  const isPaid = plan !== "FREE";

  if (usage.totalRemainingCredits > 0) {
    return {
      allowed: true,
      freeCreditsRemaining: usage.totalRemainingCredits,
      isPro: isPaid,
    };
  }

  if (plan === "FREE") {
    return {
      allowed: false,
      code: "PLAN_LIMIT_REACHED",
      message: "Your monthly credits are exhausted. Please upgrade your plan to continue.",
      freeCreditsRemaining: 0,
      isPro: false,
    };
  }

  return {
    allowed: false,
    code: "USAGE_LIMIT_REACHED",
    message: `You have reached your monthly limit of ${usage.monthlyLimit} credits for the ${plan} plan. Upgrade to a higher tier to continue.`,
    freeCreditsRemaining: 0,
    isPro: true,
  };
}

/**
 * Consumes credits with deterministic MONTHLY-FIRST ordering and concurrency protection.
 * - Monthly pool is consumed first until exhausted.
 * - Remaining cost spills over into the permanent pool.
 * - Operation is rejected (402) if total remaining < cost.
 */
export async function consumeUsage(
  userIdOrWorkspaceId: string,
  action: "CONTENT_GENERATION" | "PUBLISHING" = "CONTENT_GENERATION",
  cost: number = 1
): Promise<{ freeCreditsTotal: number; freeCreditsUsed: number; freeCreditsRemaining: number }> {
  const canonicalUserId = await resolveCanonicalUserId(userIdOrWorkspaceId);

  // Admin users have unlimited credits; bypass consumption logic
  if (await isAdminUser(canonicalUserId)) {
    const usage = await getUserUsage(canonicalUserId);
    return {
      freeCreditsTotal: usage.freeCreditsTotal,
      freeCreditsUsed: usage.freeCreditsUsed,
      freeCreditsRemaining: usage.freeCreditsRemaining,
    };
  }

  return withLock(canonicalUserId, async () => {
    const userId = canonicalUserId;
    const plan = await getUserPlan(userId);
    const access = await checkUsageAccess(userId, action);

    if (!access.allowed) {
      const err = new Error(
        access.code === "PLAN_LIMIT_REACHED"
          ? "PLAN_LIMIT_REACHED: Your monthly credits are exhausted. Please upgrade your plan to continue."
          : `USAGE_LIMIT_REACHED: You have reached your monthly credit limit for the ${plan} plan.`
      );
      (err as any).statusCode = 402;
      throw err;
    }

    const currentUsage = await getUserUsage(userId);
    const monthlyRemaining = currentUsage.monthlyCreditsRemaining;
    const permanentRemaining = currentUsage.permanentCreditsRemaining;
    const totalRemaining = monthlyRemaining + permanentRemaining;

    if (totalRemaining < cost) {
      const err = new Error("PLAN_LIMIT_REACHED: Your monthly credits are exhausted. Please upgrade your plan to continue.");
      (err as any).statusCode = 402;
      throw err;
    }

    // Monthly-First Consumption Math
    const consumeFromMonthly = Math.min(monthlyRemaining, cost);
    const consumeFromPermanent = cost - consumeFromMonthly;

    const now = new Date();
    let record = usageMemoryStore.get(userId)!;

    const newMonthlyUsed = record.monthlyCreditsUsed + consumeFromMonthly;
    const newPermanentUsed = record.permanentCreditsUsed + consumeFromPermanent;
    const newFreeUsed = newMonthlyUsed + newPermanentUsed;
    const newFreeTotal = record.monthlyCreditsAllowance + record.permanentCreditsTotal;

    record.monthlyCreditsUsed = newMonthlyUsed;
    record.permanentCreditsUsed = newPermanentUsed;
    record.freeCreditsUsed = newFreeUsed;
    record.freeCreditsTotal = newFreeTotal;
    record.updatedAt = now;

    usageMemoryStore.set(userId, record);

    try {
      if (typeof (prisma as any).$transaction === "function") {
        await (prisma as any).$transaction(async (tx: any) => {
          await tx.userUsage.upsert({
            where: { userId },
            update: {
              monthlyCreditsUsed: { increment: consumeFromMonthly },
              permanentCreditsUsed: { increment: consumeFromPermanent },
              freeCreditsUsed: { increment: cost },
              freeCreditsTotal: newFreeTotal,
              updatedAt: now,
            },
            create: {
              userId,
              freeCreditsTotal: newFreeTotal,
              freeCreditsUsed: newFreeUsed,
              permanentCreditsTotal: record.permanentCreditsTotal,
              permanentCreditsUsed: newPermanentUsed,
              monthlyCreditsAllowance: record.monthlyCreditsAllowance,
              monthlyCreditsUsed: newMonthlyUsed,
              monthlyCycleStart: record.monthlyCycleStart,
              lastMonthlyReset: record.lastMonthlyReset,
            },
          });
        });
      } else {
        await prisma.userUsage.upsert({
          where: { userId },
          update: {
            monthlyCreditsUsed: newMonthlyUsed,
            permanentCreditsUsed: newPermanentUsed,
            freeCreditsUsed: newFreeUsed,
            freeCreditsTotal: newFreeTotal,
            updatedAt: now,
          },
          create: {
            userId,
            freeCreditsTotal: newFreeTotal,
            freeCreditsUsed: newFreeUsed,
            permanentCreditsTotal: record.permanentCreditsTotal,
            permanentCreditsUsed: newPermanentUsed,
            monthlyCreditsAllowance: record.monthlyCreditsAllowance,
            monthlyCreditsUsed: newMonthlyUsed,
            monthlyCycleStart: record.monthlyCycleStart,
            lastMonthlyReset: record.lastMonthlyReset,
          },
        });
      }
    } catch {
      // DB offline fallback
    }

    const updatedUsage = await getUserUsage(userId);

    return {
      freeCreditsTotal: updatedUsage.freeCreditsTotal,
      freeCreditsUsed: updatedUsage.freeCreditsUsed,
      freeCreditsRemaining: updatedUsage.freeCreditsRemaining,
    };
  });
}

/**
 * Consumes 1 credit specifically for successful publishing execution.
 * Idempotent per scheduledPostId: guarantees a post is never charged twice on retries.
 */
export async function consumePublishingCredit(params: {
  userId?: string;
  workspaceId?: string;
  scheduledPostId?: string;
}): Promise<{ consumed: boolean; freeCreditsRemaining?: number }> {
  const { userId, workspaceId, scheduledPostId } = params;

  if (scheduledPostId && consumedScheduledPosts.has(scheduledPostId)) {
    return { consumed: false };
  }

  const targetId = await resolveUserIdForWorkspace(userId, workspaceId);
  const result = await consumeUsage(targetId, "PUBLISHING", 1);

  if (scheduledPostId) {
    consumedScheduledPosts.add(scheduledPostId);
  }

  return { consumed: true, freeCreditsRemaining: result.freeCreditsRemaining };
}

export async function consumeWorkflowCredit(userId: string) {
  return consumeUsage(userId, "CONTENT_GENERATION");
}

/**
 * Grants permanent credits to a user. Permanent credits survive monthly resets and plan changes.
 */
export async function grantPermanentCredits(userId: string, amount: number): Promise<DetailedUserUsage> {
  const canonicalUserId = await resolveCanonicalUserId(userId);

  return withLock(canonicalUserId, async () => {
    await getUserUsage(canonicalUserId);
    const additional = Math.max(0, amount);
    const now = new Date();
    let record = usageMemoryStore.get(canonicalUserId)!;

    record.permanentCreditsTotal += additional;
    record.freeCreditsTotal = record.monthlyCreditsAllowance + record.permanentCreditsTotal;
    record.updatedAt = now;

    usageMemoryStore.set(canonicalUserId, record);

    try {
      await prisma.userUsage.update({
        where: { userId: canonicalUserId },
        data: {
          permanentCreditsTotal: record.permanentCreditsTotal,
          freeCreditsTotal: record.freeCreditsTotal,
          updatedAt: now,
        },
      });
    } catch {
      // Mock / fallback
    }

    return getUserUsage(canonicalUserId);
  });
}
