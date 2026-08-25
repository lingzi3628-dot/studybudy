import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * DELETE /api/user/delete-account
 * Body: { confirmEmail: string }
 * Permanently deletes the user's account + all data (cascade).
 */
export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const confirmEmail = (body?.confirmEmail ?? "").toString().trim().toLowerCase();

  if (!confirmEmail) {
    return NextResponse.json({ error: "Please confirm by entering your email" }, { status: 400 });
  }

  if (confirmEmail !== (user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Email doesn't match your account" }, { status: 400 });
  }

  try {
    await db.user.delete({ where: { id: user.id } });
    return NextResponse.json({
      ok: true,
      message: "Your account has been permanently deleted.",
    });
  } catch (e: any) {
    console.error("delete account error:", e?.message);
    return NextResponse.json(
      { error: "We couldn't delete your account right now." },
      { status: 500 }
    );
  }
}
