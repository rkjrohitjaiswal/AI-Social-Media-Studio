import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth.js";
import { getUserUsage, resolveUserIdForWorkspace } from "../services/usage-service.js";
import { getUserPlan } from "../services/entitlement-service.js";

export const usageRouter = Router();

usageRouter.use(requireAuth as any);

usageRouter.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = (req.headers["x-workspace-id"] as string) || (req.query.workspaceId as string);
    const userId = req.user?.id || (await resolveUserIdForWorkspace(undefined, workspaceId));
    const targetId = workspaceId ? await resolveUserIdForWorkspace(userId, workspaceId) : userId;

    const plan = await getUserPlan(targetId);
    const usage = await getUserUsage(targetId);

    return res.json({
      success: true,
      data: {
        plan,
        // Monthly pool
        monthlyLimit: usage.monthlyCreditsAllowance,
        monthlyAllowance: usage.monthlyCreditsAllowance,
        monthlyUsedCredits: usage.monthlyCreditsUsed,
        monthlyRemainingCredits: usage.monthlyCreditsRemaining,

        // Permanent pool
        permanentTotalCredits: usage.permanentCreditsTotal,
        permanentUsedCredits: usage.permanentCreditsUsed,
        permanentRemainingCredits: usage.permanentCreditsRemaining,

        // Total aggregates
        totalRemainingCredits: usage.totalRemainingCredits,
        remainingCredits: usage.totalRemainingCredits,
        usedCredits: usage.usedCredits,

        // Legacy compatibility mirrors
        freeCreditsTotal: usage.freeCreditsTotal,
        freeCreditsUsed: usage.freeCreditsUsed,
        freeCreditsRemaining: usage.freeCreditsRemaining,

        // Cycle metadata
        resetPeriod: usage.nextMonthlyResetDate,
        nextMonthlyResetDate: usage.nextMonthlyResetDate,
        isInitialMonth: usage.isInitialMonth,
        cycleIndex: usage.cycleIndex,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: `Failed to fetch usage: ${msg}` });
  }
});
