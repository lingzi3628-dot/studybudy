import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/auth/reset
 * Body: { email, secret }
 *
 * Emergency password reset — resets any admin's password back to the
 * default "StudyBuddy2026!". Requires a secret key to prevent abuse.
 *
 * The secret is the same as the default password (simple bootstrap).
 * After reset, login with the default password, then change it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      email?: string;
      secret?: string;
    };

    const email = (body.email ?? "").toString().trim().toLowerCase();
    const secret = (body.secret ?? "").toString();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // The secret must match the default password (simple bootstrap protection)
    if (secret !== "StudyBuddy2026!") {
      return NextResponse.json({ error: "Invalid secret key" }, { status: 403 });
    }

    // Find the admin
    const admin = await db.adminUser.findUnique({ where: { email } });
    if (!admin) {
      return NextResponse.json({ error: "Admin not found with that email" }, { status: 404 });
    }

    // Reset password to default
    const newPasswordHash = bcrypt.hashSync("StudyBuddy2026!", 10);
    await db.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: newPasswordHash },
    });

    return NextResponse.json({
      ok: true,
      message: `Password reset for ${email}. Login with password: StudyBuddy2026!`,
    });
  } catch (e: any) {
    console.error("Admin reset error:", e?.message ?? e);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
