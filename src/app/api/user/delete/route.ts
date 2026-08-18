import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * POST /api/user/delete
 * Body: { confirmation: "DELETE" }
 *
 * Cascades delete the user row (all FK relations are onDelete: Cascade, so
 * study_sets, cards, attempts, card_reviews, topic_mastery, ai_call_logs,
 * user_sessions, admin_logs all go with it).
 *
 * Note: this does NOT delete the Clerk user — that must be done client-side
 * via Clerk's useUser().delete() or via Clerk's Backend API with the secret
 * key (not available without real Clerk creds). The frontend should call
 * clerk.user.delete() after this endpoint succeeds.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const confirmation = (body.confirmation ?? "").toString();

  if (confirmation !== "DELETE") {
    return NextResponse.json(
      { error: 'Confirmation required — send { "confirmation": "DELETE" } in the request body.' },
      { status: 400 }
    );
  }

  // Log the self-deletion as an admin action (if the user was an admin) — best-effort
  try {
    await logAdminAction(user.id, "user.self_delete", { userId: user.id, email: user.email });
  } catch {
    // ignore
  }

  // Cascade delete — Prisma handles FKs
  await db.user.delete({ where: { id: user.id } });

  return NextResponse.json({
    ok: true,
    message: "User data deleted from our DB. Use Clerk's useUser().delete() to also delete the Clerk account.",
  });
}
