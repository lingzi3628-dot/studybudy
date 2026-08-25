import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";

export const runtime = "nodejs";

/**
 * GET /api/admin/notifications?status=pending&channel=whatsapp
 *
 * Returns notification log entries (newest first). Supports filtering by
 * status ('pending' | 'sent' | 'failed') and channel ('whatsapp' | 'sms' | 'email').
 *
 * Used by the admin Notifications tab to see who would be notified when
 * subjects are unlocked.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const channel = url.searchParams.get("channel") || undefined;

  try {
    const where: any = {};
    if (status) where.status = status;
    if (channel) where.channel = channel;

    const [notifications, stats] = await Promise.all([
      db.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      db.notificationLog.groupBy({
        by: ["status", "channel"],
        _count: true,
      }),
    ]);

    // Fetch user info separately (to avoid type issues with include + AdminSession)
    const userIds = [...new Set(notifications.map((n) => n.userId))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, phoneNumber: true, grade: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Build stats summary
    const summary: Record<string, number> = {
      pending_total: 0,
      sent_total: 0,
      failed_total: 0,
      whatsapp_total: 0,
      sms_total: 0,
      email_total: 0,
    };
    for (const s of stats) {
      summary[`${s.status}_total`] += s._count;
      summary[`${s.channel}_total`] += s._count;
    }

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        ...n,
        user: userMap.get(n.userId) ?? null,
      })),
      summary,
    });
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({ notifications: [], summary: {} });
    }
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}
