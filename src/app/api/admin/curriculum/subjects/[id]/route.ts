import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { createNotificationsForSubjectUnlock } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/curriculum/subjects/[id]
 *
 * Update a subject's design + status:
 *   {
 *     name?: string,
 *     icon?: string,
 *     imageUrl?: string | null,
 *     color?: string,
 *     description?: string | null,
 *     status?: 'locked' | 'unlocked',
 *     orderIndex?: number
 *   }
 *
 * When status changes from 'locked' to 'unlocked', notifications are
 * created for all users who have this subject's grade set as their grade.
 * (Notifications are stored in NotificationLog — actual WhatsApp/SMS
 * sending is deferred until we wire up a gateway.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  if (typeof body?.name === "string") patch.name = body.name.trim();
  if (typeof body?.icon === "string") patch.icon = body.icon.trim();
  if (body?.imageUrl !== undefined) patch.imageUrl = body.imageUrl?.toString().trim() || null;
  if (typeof body?.color === "string") patch.color = body.color.trim();
  if (body?.description !== undefined) patch.description = body.description?.toString().trim() || null;
  if (typeof body?.orderIndex === "number") patch.orderIndex = body.orderIndex;
  if (body?.status === "locked" || body?.status === "unlocked") patch.status = body.status;

  try {
    // Check if status is changing from locked → unlocked (trigger notifications)
    const existing = await db.curriculumSubject.findUnique({
      where: { id },
      include: { grade: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    const wasLocked = existing.status === "locked";
    const willUnlock = patch.status === "unlocked";

    const updated = await db.curriculumSubject.update({
      where: { id },
      data: patch,
    });

    // If unlocking, create notifications for all users with this grade
    if (wasLocked && willUnlock) {
      try {
        const notifCount = await createNotificationsForSubjectUnlock(id);
        return NextResponse.json({
          subject: updated,
          notificationsCreated: notifCount,
          message: notifCount > 0
            ? `✓ Subject unlocked. ${notifCount} notification(s) queued for users with grade ${existing.grade.name}.`
            : "✓ Subject unlocked. No users have this grade yet.",
        });
      } catch (e: any) {
        console.error("Notification creation failed:", e?.message);
        return NextResponse.json({
          subject: updated,
          notificationsCreated: 0,
          message: "✓ Subject unlocked, but notification creation failed.",
        });
      }
    }

    return NextResponse.json({ subject: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to update subject", detail: e?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/curriculum/subjects/[id]
 * Deletes a subject and all its topics/flashcards/quiz questions (cascade).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const { id } = await params;

  try {
    await db.curriculumSubject.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to delete subject" }, { status: 500 });
  }
}
