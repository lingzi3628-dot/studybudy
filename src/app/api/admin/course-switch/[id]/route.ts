import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/course-switch/[id] — approve or reject a request
 * Body: { action: "approve" | "reject", note?: string }
 *
 * On approve:
 *   1. Updates the user's `course` field to the requested course
 *   2. Sets the request status to 'approved', timestamp
 * On reject:
 *   1. Sets status to 'rejected', timestamp
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try { admin = await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string; note?: string };

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const request = await db.courseSwitchRequest.findUnique({ where: { id } }).catch(() => null);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: `Request already ${request.status}` }, { status: 400 });
  }

  const newStatus = body.action === "approve" ? "approved" : "rejected";

  // Update the request record
  // NOTE: reviewedById is a User FK; admin is in AdminUser table, not User.
  // So we set reviewedById = null and store admin email in adminNote.
  await db.courseSwitchRequest.update({
    where: { id },
    data: {
      status: newStatus,
      reviewedAt: new Date(),
      adminNote: body.note ? `[by ${admin.adminEmail}] ${body.note}` : `[by ${admin.adminEmail}]`,
    },
  });

  // If approved, also update the user's course field
  if (body.action === "approve") {
    await db.user.update({
      where: { id: request.userId },
      data: { course: request.toCourse },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
