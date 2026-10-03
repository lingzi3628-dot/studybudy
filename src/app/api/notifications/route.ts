import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/notifications — list user notifications (unread first) */
export async function GET() {
  const user = await getCurrentUser();

  // Auto-create system notifications (best-effort, non-blocking)
  await createSystemNotifications(user.id).catch(() => {});

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ read: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: { id: true, type: true, message: true, read: true, createdAt: true },
  }).catch(() => []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}

/**
 * Phase 5 — Auto-create system notifications:
 *   - Unfinished tasks (due cards, incomplete quizzes, pending daily goals)
 *   - Streak at risk (last activity > 1 day ago, streak >= 3)
 *   - Low token balance (below 10 tokens for free users)
 *   - Badge earned (checked by gamify.ts)
 *
 * Each notification type is created at most once per day to avoid spam.
 */
async function createSystemNotifications(userId: string): Promise<void> {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // 1. Due review cards
  const existingDue = await db.notification.findFirst({
    where: { userId, type: "due_review", createdAt: { gte: today } },
    select: { id: true },
  }).catch(() => null);

  if (!existingDue) {
    const dueCount = await db.cardReview.count({
      where: { userId, dueDate: { lte: new Date() } },
    }).catch(() => 0);

    if (dueCount > 0) {
      await db.notification.create({
        data: {
          userId,
          type: "due_review",
          message: `📚 You have ${dueCount} card${dueCount > 1 ? "s" : ""} due for review. Keep your streak going!`,
        },
      }).catch(() => null);
    }
  }

  // 2. Streak at risk
  const existingStreak = await db.notification.findFirst({
    where: { userId, type: "streak_risk", createdAt: { gte: today } },
    select: { id: true },
  }).catch(() => null);

  if (!existingStreak) {
    const xp = await db.userXp.findUnique({ where: { userId } }).catch(() => null);
    if (xp && xp.streakDays >= 3) {
      const lastActivity = xp.lastActivityDate ? new Date(xp.lastActivityDate) : null;
      const now = new Date();
      const hoursSinceActivity = lastActivity
        ? (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)
        : 999;

      // If it's been > 20 hours since last activity and streak is >= 3, warn
      if (hoursSinceActivity > 20) {
        await db.notification.create({
          data: {
            userId,
            type: "streak_risk",
            message: `🔥 Your ${xp.streakDays}-day streak is at risk! Study today to keep it alive.`,
          },
        }).catch(() => null);
      }
    }
  }

  // 3. Low token balance (free users only)
  const existingLowTokens = await db.notification.findFirst({
    where: { userId, type: "low_tokens", createdAt: { gte: today } },
    select: { id: true },
  }).catch(() => null);

  if (!existingLowTokens) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true, planId: true },
    }).catch(() => null);

    if (user && !user.planId && user.tokenBalance < 10) {
      await db.notification.create({
        data: {
          userId,
          type: "low_tokens",
          message: `🪙 You have ${user.tokenBalance} tokens left. Your tokens refill tomorrow, or earn more in the Earn Center!`,
        },
      }).catch(() => null);
    }
  }

  // 4. Pending daily goals
  const existingGoal = await db.notification.findFirst({
    where: { userId, type: "daily_goal", createdAt: { gte: today } },
    select: { id: true },
  }).catch(() => null);

  if (!existingGoal) {
    // DailyGoal has a tasks JSON array — check for incomplete tasks
    const goals = await db.dailyGoal.findMany({
      where: { userId, date: { gte: today } },
    }).catch(() => []);

    const incompleteCount = goals.reduce((sum, g) => {
      const tasks = Array.isArray(g.tasks) ? g.tasks : [];
      return sum + tasks.filter((t: any) => !t.completed).length;
    }, 0);

    if (incompleteCount > 0) {
      await db.notification.create({
        data: {
          userId,
          type: "daily_goal",
          message: `🎯 You have ${incompleteCount} daily goal task${incompleteCount > 1 ? "s" : ""} to complete today.`,
        },
      }).catch(() => null);
    }
  }
}
