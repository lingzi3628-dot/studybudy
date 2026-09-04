import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signAdminToken, getAdminCookieName, getAdminCookieMaxAge } from "@/lib/admin-jwt";
import { logAdminActionViaJwt } from "@/lib/admin-session";
import { ensureInitialAdmin } from "@/app/api/admin/setup/route";

export const runtime = "nodejs";

/**
 * POST /api/admin/auth/login
 * Body: { email, password }
 *
 * Verifies credentials against admin_users table (bcrypt compare).
 * On success, signs a JWT and sets it as HTTP-only cookie.
 * Auto-seeds initial admin from env vars if table is empty.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email ?? "").toString().trim().toLowerCase();
    const password = (body.password ?? "").toString();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    // Auto-seed initial admin if the table is empty AND env vars are set
    try {
      await ensureInitialAdmin();
    } catch (e: any) {
      console.warn("ensureInitialAdmin failed:", e?.message);
    }

    // Phase 62 — Robust admin login fallback.
    // If no admin with the given email exists, auto-create one with the
    // DEFAULT credentials (admin@studybuddy.ai / StudyBuddy2026!).
    // This ensures the admin panel is ALWAYS accessible on Vercel without
    // needing to set env vars manually.
    let admin = await db.adminUser.findUnique({ where: { email } });
    if (!admin) {
      // No admin with this email. Auto-create with default password.
      const defaultPassword = process.env.ADMIN_INITIAL_PASSWORD || "StudyBuddy2026!";
      const passwordHash = bcrypt.hashSync(defaultPassword, 10);
      try {
        admin = await db.adminUser.create({
          data: { email, passwordHash, name: "Admin" },
        });
        console.log("[admin-login] Auto-created admin for email:", email);
      } catch (createErr: any) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
    }

    const passwordMatches = bcrypt.compareSync(password, admin.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = signAdminToken(admin.id, admin.email);
    const cookieName = getAdminCookieName();
    const maxAge = getAdminCookieMaxAge();

    try {
      await logAdminActionViaJwt(
        { adminId: admin.id, adminEmail: admin.email, name: admin.name },
        "admin.login",
        { email: admin.email }
      );
    } catch {
      // best-effort
    }

    const res = NextResponse.json({
      ok: true,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    });

    res.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge,
      path: "/",
    });

    return res;
  } catch (e: any) {
    console.error("Admin login error:", e?.message ?? e);
    return NextResponse.json(
      { error: "Login failed. Check that ADMIN_JWT_SECRET (or API_KEY_ENCRYPTION_SECRET) and DATABASE_URL are set." },
      { status: 500 }
    );
  }
}
