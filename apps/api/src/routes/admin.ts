import { Router, Response } from "express";
import prisma from "@ai-social/database";
import { SAAS_PLANS_REGISTRY, SubscriptionPlan } from "@ai-social/shared";
import { AuthenticatedRequest, requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  authenticateAdminCredentials,
  ensureInitialAdminAccount,
} from "../services/admin-auth-service.js";
import { invalidateUserUsageCache } from "../services/usage-service.js";

export const adminRouter = Router();

/**
 * POST /api/admin/auth/login
 * Public admin login endpoint. Accepts admin credentials, authenticates securely,
 * sets a HTTP-only admin session cookie, and returns a stateless admin session token.
 */
adminRouter.post("/auth/login", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const authResult = await authenticateAdminCredentials(email, password);

    if (!authResult.success || !authResult.session) {
      return res.status(401).json({
        success: false,
        error: authResult.error || "Invalid admin credentials",
      });
    }

    // Set secure HTTP-only cookie for web clients
    res.cookie("admin-access-token", authResult.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return res.json({
      success: true,
      token: authResult.session.token,
      user: {
        id: authResult.session.userId,
        email: authResult.session.email,
        isAdmin: true,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      error: `Admin login failed: ${msg}`,
    });
  }
});

/**
 * GET /api/admin/auth/me
 * Verifies current active admin session token.
 */
adminRouter.get("/auth/me", requireAuth as any, requireAdmin as any, (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    success: true,
    user: req.user,
  });
});

// Enforce both session auth and application admin checks across all remaining endpoints in this router
adminRouter.use(requireAuth as any);
adminRouter.use(requireAdmin as any);

/**
 * GET /api/admin/stats
 * Overview analytics for the admin dashboard.
 */
adminRouter.get("/stats", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [totalUsersRaw, activeSubscriptionsRaw, paidUsersRaw] = await Promise.all([
      prisma.user.count().catch(() => 0),
      prisma.subscription.count({ where: { status: "ACTIVE" } }).catch(() => 0),
      prisma.subscription.count({
        where: {
          status: "ACTIVE",
          plan: { in: ["PRO", "ADVANCED", "PREMIUM", "BUSINESS"] },
        },
      }).catch(() => 0),
    ]);

    const totalUsers = typeof totalUsersRaw === "number" ? totalUsersRaw : 0;
    const activeSubscriptions = typeof activeSubscriptionsRaw === "number" ? activeSubscriptionsRaw : 0;
    const paidUsers = typeof paidUsersRaw === "number" ? paidUsersRaw : 0;
    const freeUsers = Math.max(0, totalUsers - paidUsers);

    return res.json({
      success: true,
      stats: {
        totalUsers,
        paidUsers,
        freeUsers,
        activeSubscriptions,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: `Failed to fetch stats: ${msg}` });
  }
});

/**
 * GET /api/admin/users
 * Paginated list of users with subscription & credit details, plus optional plan/source filters.
 */
adminRouter.get("/users", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const search = String(req.query.search || "").trim();
    const planFilter = String(req.query.plan || "").trim().toUpperCase();
    const sourceFilter = String(req.query.source || "").trim().toUpperCase();

    const whereConditions: any[] = [];

    if (search) {
      whereConditions.push({
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { fullName: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    if (planFilter) {
      if (planFilter === "FREE") {
        whereConditions.push({
          OR: [
            { subscription: null },
            { subscription: { status: { not: "ACTIVE" } } },
            { subscription: { plan: "FREE" } },
          ],
        });
      } else {
        whereConditions.push({
          subscription: {
            status: "ACTIVE",
            plan: planFilter,
          },
        });
      }
    }

    if (sourceFilter) {
      whereConditions.push({
        subscription: {
          subscriptionSource: sourceFilter,
        },
      });
    }

    const whereClause = whereConditions.length > 0 ? { AND: whereConditions } : {};

    const [totalRaw, usersRaw] = await Promise.all([
      prisma.user.count({ where: whereClause }).catch(() => 0),
      prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          fullName: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          isAdmin: true,
          createdAt: true,
          subscription: true,
          usage: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }).catch(() => []),
    ]);

    const total = typeof totalRaw === "number" ? totalRaw : 0;
    const users = Array.isArray(usersRaw) ? usersRaw : [];

    const formattedUsers = users.map((u: any) => {
      const sub = u.subscription;
      const usage = u.usage;
      const plan = sub && sub.status === "ACTIVE" ? sub.plan : "FREE";
      const totalCredits = usage ? (usage.freeCreditsTotal ?? ((usage.monthlyCreditsAllowance ?? 10) + (usage.permanentCreditsTotal ?? 0))) : 10;
      const usedCredits = usage ? (usage.freeCreditsUsed ?? ((usage.monthlyCreditsUsed ?? 0) + (usage.permanentCreditsUsed ?? 0))) : 0;
      const remainingCredits = Math.max(0, totalCredits - usedCredits);

      const createdAtStr = u.createdAt
        ? typeof u.createdAt === "string"
          ? u.createdAt
          : new Date(u.createdAt).toISOString()
        : new Date().toISOString();

      const currentPeriodEndStr = sub?.currentPeriodEnd
        ? typeof sub.currentPeriodEnd === "string"
          ? sub.currentPeriodEnd
          : new Date(sub.currentPeriodEnd).toISOString()
        : null;

      return {
        id: u.id,
        email: u.email,
        name: u.fullName || u.firstName || u.email.split("@")[0],
        avatarUrl: u.avatarUrl,
        isAdmin: !!u.isAdmin,
        createdAt: createdAtStr,
        currentPlan: plan,
        subscriptionStatus: sub?.status || "EXPIRED",
        subscriptionSource: sub?.subscriptionSource || "RAZORPAY",
        currentPeriodEnd: currentPeriodEndStr,
        creditsTotal: totalCredits,
        creditsUsed: usedCredits,
        creditsRemaining: remainingCredits,
      };
    });

    return res.json({
      success: true,
      users: formattedUsers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: `Failed to fetch users: ${msg}` });
  }
});

/**
 * POST /api/admin/users/:id/grant-subscription
 * Manually grant or extend a user's subscription (PRO, ADVANCED, PREMIUM, BUSINESS).
 */
adminRouter.post("/users/:id/grant-subscription", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: userId } = req.params;
    const { plan = "PRO", durationDays = 30, notes } = req.body || {};

    const validPlans = ["FREE", "PRO", "ADVANCED", "PREMIUM", "BUSINESS"];
    if (!validPlans.includes(plan.toUpperCase())) {
      return res.status(400).json({ success: false, error: "Invalid subscription plan" });
    }

    const duration = Math.max(1, parseInt(String(durationDays), 10) || 30);
    const selectedPlan = plan.toUpperCase();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, subscription: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const previousPlan = user.subscription?.plan || "FREE";
    const now = new Date();
    const isFreePlan = selectedPlan === "FREE";
    const periodEnd = isFreePlan ? now : new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    const subscription = await prisma.subscription.upsert({
      where: { userId },
      update: {
        plan: selectedPlan,
        status: isFreePlan ? "CANCELLED" : "ACTIVE",
        subscriptionSource: "ADMIN_GRANT",
        currentPeriodStart: now,
        grantedAt: now,
        grantedByUserId: req.user?.id || null,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      create: {
        userId,
        plan: selectedPlan,
        status: isFreePlan ? "CANCELLED" : "ACTIVE",
        subscriptionSource: "ADMIN_GRANT",
        currentPeriodStart: now,
        grantedAt: now,
        grantedByUserId: req.user?.id || null,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    // Credit allowances by canonical plan registry
    const planDef = SAAS_PLANS_REGISTRY[selectedPlan as SubscriptionPlan] || SAAS_PLANS_REGISTRY.PRO;
    const newAllowance = isFreePlan ? 3 : planDef.monthlyWorkflows;

    const existingUsage = user.usage || (await prisma.userUsage.findUnique({ where: { userId } }));
    const permTotal = existingUsage?.permanentCreditsTotal ?? 0;
    const permUsed = existingUsage?.permanentCreditsUsed ?? 0;
    const newFreeTotal = newAllowance + permTotal;
    const newFreeUsed = permUsed;

    await prisma.userUsage.upsert({
      where: { userId },
      update: {
        monthlyCreditsAllowance: newAllowance,
        monthlyCreditsUsed: 0,
        freeCreditsTotal: newFreeTotal,
        freeCreditsUsed: newFreeUsed,
        lastMonthlyReset: now,
        updatedAt: now,
      },
      create: {
        userId,
        freeCreditsTotal: newFreeTotal,
        freeCreditsUsed: newFreeUsed,
        permanentCreditsTotal: permTotal,
        permanentCreditsUsed: permUsed,
        monthlyCreditsAllowance: newAllowance,
        monthlyCreditsUsed: 0,
        monthlyCycleStart: now,
        lastMonthlyReset: now,
      },
    });

    invalidateUserUsageCache(userId);

    // Record admin audit log
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: req.user?.id || "system",
          targetUserId: userId,
          action: "GRANT_SUBSCRIPTION",
          previousPlan,
          newPlan: selectedPlan,
          subscriptionSource: "ADMIN_GRANT",
          metadataJson: { durationDays: duration, notes: notes || "Granted by admin" },
        },
      });
    } catch {
      // Non-fatal audit log catch
    }

    return res.json({
      success: true,
      message: `Successfully granted ${selectedPlan} subscription for ${duration} days`,
      subscription,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: `Failed to grant subscription: ${msg}` });
  }
});

/**
 * POST /api/admin/users/:id/revoke-subscription
 * Revoke or cancel an active manual subscription, resetting the user to FREE plan.
 */
adminRouter.post("/users/:id/revoke-subscription", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: userId } = req.params;
    const { notes } = req.body || {};

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, subscription: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const previousPlan = user.subscription?.plan || "FREE";

    const subscription = await prisma.subscription.upsert({
      where: { userId },
      update: {
        plan: "FREE",
        status: "CANCELLED",
        subscriptionSource: "ADMIN_GRANT",
        currentPeriodEnd: new Date(),
      },
      create: {
        userId,
        plan: "FREE",
        status: "CANCELLED",
        subscriptionSource: "ADMIN_GRANT",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      },
    });

    const existingUsage = user.usage || (await prisma.userUsage.findUnique({ where: { userId } }));
    const permTotal = existingUsage?.permanentCreditsTotal ?? 0;
    const permUsed = existingUsage?.permanentCreditsUsed ?? 0;
    const freeAllowance = 3;
    const freeUsed = Math.min(existingUsage?.monthlyCreditsUsed ?? 0, freeAllowance);
    const newFreeTotal = freeAllowance + permTotal;
    const newFreeUsed = freeUsed + permUsed;

    await prisma.userUsage.upsert({
      where: { userId },
      update: {
        monthlyCreditsAllowance: freeAllowance,
        monthlyCreditsUsed: freeUsed,
        freeCreditsTotal: newFreeTotal,
        freeCreditsUsed: newFreeUsed,
        updatedAt: new Date(),
      },
      create: {
        userId,
        freeCreditsTotal: newFreeTotal,
        freeCreditsUsed: newFreeUsed,
        permanentCreditsTotal: permTotal,
        permanentCreditsUsed: permUsed,
        monthlyCreditsAllowance: freeAllowance,
        monthlyCreditsUsed: freeUsed,
        monthlyCycleStart: new Date(),
        lastMonthlyReset: new Date(),
      },
    });

    invalidateUserUsageCache(userId);

    // Record admin audit log
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: req.user?.id || "system",
          targetUserId: userId,
          action: "REVOKE_SUBSCRIPTION",
          previousPlan,
          newPlan: "FREE",
          subscriptionSource: "ADMIN_GRANT",
          metadataJson: { notes: notes || "Revoked by admin" },
        },
      });
    } catch {
      // Non-fatal audit log catch
    }

    return res.json({
      success: true,
      message: `Successfully revoked subscription for user ${user.email}`,
      subscription,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: `Failed to revoke subscription: ${msg}` });
  }
});

/**
 * POST /api/admin/users/:id/credits
 * Top-up bonus credits or reset used credits for a specific user.
 */
adminRouter.post("/users/:id/credits", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: userId } = req.params;
    const { bonusCredits = 0, resetUsage = false, notes } = req.body || {};

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, usage: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const currentUsage = user.usage || (await prisma.userUsage.findUnique({ where: { userId } }));
    const currentPermTotal = currentUsage?.permanentCreditsTotal ?? 0;
    const currentPermUsed = currentUsage?.permanentCreditsUsed ?? 0;
    const currentMonthlyAllowance = currentUsage?.monthlyCreditsAllowance ?? 3;
    const currentMonthlyUsed = currentUsage?.monthlyCreditsUsed ?? 0;

    const additional = Math.max(0, parseInt(String(bonusCredits), 10) || 0);
    const newPermTotal = currentPermTotal + additional;
    const newMonthlyUsed = resetUsage === true ? 0 : currentMonthlyUsed;
    const newPermUsed = resetUsage === true ? 0 : currentPermUsed;

    const newFreeTotal = currentMonthlyAllowance + newPermTotal;
    const newFreeUsed = newMonthlyUsed + newPermUsed;
    const now = new Date();

    const usage = await prisma.userUsage.upsert({
      where: { userId },
      update: {
        permanentCreditsTotal: newPermTotal,
        permanentCreditsUsed: newPermUsed,
        monthlyCreditsUsed: newMonthlyUsed,
        freeCreditsTotal: newFreeTotal,
        freeCreditsUsed: newFreeUsed,
        updatedAt: now,
      },
      create: {
        userId,
        freeCreditsTotal: newFreeTotal,
        freeCreditsUsed: newFreeUsed,
        permanentCreditsTotal: newPermTotal,
        permanentCreditsUsed: newPermUsed,
        monthlyCreditsAllowance: currentMonthlyAllowance,
        monthlyCreditsUsed: newMonthlyUsed,
        monthlyCycleStart: now,
        lastMonthlyReset: now,
      },
    });

    invalidateUserUsageCache(userId);

    // Record admin audit log
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: req.user?.id || "system",
          targetUserId: userId,
          action: "ADJUST_CREDITS",
          metadataJson: {
            bonusCredits: additional,
            resetUsage,
            permanentCreditsTotal: newPermTotal,
            notes: notes || "Credit adjustment by admin",
          },
        },
      });
    } catch {
      // Non-fatal audit log catch
    }

    return res.json({
      success: true,
      message: `Successfully added ${additional} permanent credits for ${user.email}`,
      usage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: `Failed to adjust credits: ${msg}` });
  }
});

/**
 * GET /api/admin/audit-logs
 * Paginated list of administrative audit log actions.
 */
adminRouter.get("/audit-logs", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));

    const [totalRaw, logsRaw] = await Promise.all([
      prisma.adminAuditLog.count().catch(() => 0),
      prisma.adminAuditLog.findMany({
        select: {
          id: true,
          adminUserId: true,
          targetUserId: true,
          action: true,
          previousPlan: true,
          newPlan: true,
          subscriptionSource: true,
          metadataJson: true,
          createdAt: true,
          adminUser: {
            select: { email: true, fullName: true },
          },
          targetUser: {
            select: { email: true, fullName: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }).catch(() => []),
    ]);

    const total = typeof totalRaw === "number" ? totalRaw : 0;
    const logs = Array.isArray(logsRaw) ? logsRaw : [];

    const formattedLogs = logs.map((l: any) => ({
      id: l.id,
      adminUserId: l.adminUserId,
      adminEmail: l.adminUser?.email || l.adminUserId,
      targetUserId: l.targetUserId,
      targetEmail: l.targetUser?.email || l.targetUserId,
      action: l.action,
      previousPlan: l.previousPlan,
      newPlan: l.newPlan,
      subscriptionSource: l.subscriptionSource,
      metadata: l.metadataJson,
      createdAt: l.createdAt
        ? typeof l.createdAt === "string"
          ? l.createdAt
          : new Date(l.createdAt).toISOString()
        : new Date().toISOString(),
    }));

    return res.json({
      success: true,
      logs: formattedLogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: `Failed to fetch audit logs: ${msg}` });
  }
});
