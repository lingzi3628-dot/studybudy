import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/notifications — list user notifications (unread first) */
export async function GET() {
  const user = await getCurrentUser();

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ read: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: { id: true, type: true, message: true, read: true, createdAt: true },
  }).catch(() => []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}

/** Auto-create a "due review" notification for users with due cards — best-effort */
export async function POST() {
  const user = await getCurrentUser();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Check if already notified today
  const existing = await db.notification.findFirst({
    where: {
      userId: user.id,
      type: "due_review",
      createdAt: { gte: today },
    },
    select: { id: true },
  }).catch(() => null);

  if (existing) {
    return NextResponse.json({ ok: true, alreadyNotified: true });
  }

  const dueCount = await db.cardReview.count({
    where: { userId: user.id, dueDate: { lte: new Date() } },
  }).catch(() => 0);

  if (dueCount === 0) {
    return NextResponse.json({ ok: true, noDueCards: true });
  }

  await db.notification.create({
    data: {
      userId: user.id,
      type: "due_review",
      message: `You have ${dueCount} card${dueCount > 1 ? "s" : ""} due for review. Keep your streak going!`,
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, created: true, dueCount });
}
