import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/stats — dashboard overview. */
export async function GET() {
  const admin = await requireAdmin();

  const [
    totalUsers,
    totalStudySets,
    totalCards,
    totalTopics,
    totalBooks,
    bannedUsers,
    proUsers,
    aiCallsToday,
    aiCallsSuccess,
    aiCallsError,
    totalCostToday,
  ] = await Promise.all([
    db.user.count(),
    db.studySet.count(),
    db.card.count(),
    db.topic.count(),
    db.book.count(),
    db.user.count({ where: { banned: true } }),
    db.user.count({ where: { plan: "pro" } }),
    db.aiCallLog.count({ where: { createdAt: { gte: startOfDay() } } }),
    db.aiCallLog.count({ where: { createdAt: { gte: startOfDay() }, status: "success" } }),
    db.aiCallLog.count({ where: { createdAt: { gte: startOfDay() }, status: "error" } }),
    db.aiCallLog.aggregate({
      where: { createdAt: { gte: startOfDay() } },
      _sum: { cost: true },
    }),
  ]);

  // Recent signups (last 10)
  const recentSignups = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      role: true,
      banned: true,
      createdAt: true,
      lastActive: true,
    },
  });

  // Active users in last 24h (lastActive >= 24h ago)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activeUsers = await db.user.count({
    where: { lastActive: { gte: oneDayAgo } },
  });

  return NextResponse.json({
    stats: {
      totalUsers,
      totalStudySets,
      totalCards,
      totalTopics,
      totalBooks,
      bannedUsers,
      proUsers,
      activeUsers,
      aiCallsToday,
      aiCallsSuccess,
      aiCallsError,
      totalCostToday: totalCostToday._sum.cost ?? 0,
    },
    recentSignups,
    admin: { email: admin.email, name: admin.name },
  });
}

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
