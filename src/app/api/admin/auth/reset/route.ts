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

    // The secret must match a known default password (simple bootstrap protection)
    const codeDefault = "StudyBuddy2026!";
    const envDefault = process.env.ADMIN_INITIAL_PASSWORD ?? "";
    const validSecrets = new Set([codeDefault, envDefault].filter(Boolean));

    if (!validSecrets.has(secret)) {
      return NextResponse.json({ error: "Invalid secret key" }, { status: 403 });
    }

    // Find the admin — if not found, auto-create with the default password
    let admin = await db.adminUser.findUnique({ where: { email } });
    if (!admin) {
      const passwordHash = bcrypt.hashSync(codeDefault, 10);
      admin = await db.adminUser.create({
        data: { email, passwordHash, name: "Admin" },
      });
      return NextResponse.json({
        ok: true,
        message: `Admin account created for ${email}. Login with password: ${codeDefault}`,
      });
    }

    // Reset password to default
    const newPasswordHash = bcrypt.hashSync(codeDefault, 10);
    await db.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: newPasswordHash },
    });

    return NextResponse.json({
      ok: true,
      message: `Password reset for ${email}. Login with password: ${codeDefault}`,
    });
  } catch (e: any) {
    console.error("Admin reset error:", e?.message ?? e);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
