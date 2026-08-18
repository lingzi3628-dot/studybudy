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
 *
 * On the FIRST EVER call when admin_users is empty AND
 * ADMIN_INITIAL_EMAIL + ADMIN_INITIAL_PASSWORD env vars are set,
 * auto-seeds the initial admin user from env vars.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // Auto-seed initial admin if the table is empty AND env vars are set
  await ensureInitialAdmin();

  const admin = await db.adminUser.findUnique({ where: { email } });
  if (!admin) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const passwordMatches = bcrypt.compareSync(password, admin.passwordHash);
  if (!passwordMatches) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = signAdminToken(admin.id, admin.email);
  const cookieName = getAdminCookieName();
  const maxAge = getAdminCookieMaxAge();

  await logAdminActionViaJwt(
    { adminId: admin.id, adminEmail: admin.email, name: admin.name },
    "admin.login",
    { email: admin.email }
  );

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
}

