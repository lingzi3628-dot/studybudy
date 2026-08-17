import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signAdminToken, getAdminCookieName, getAdminCookieMaxAge } from "@/lib/admin-jwt";
import { logAdminActionViaJwt } from "@/lib/admin-session";

export const runtime = "nodejs";

/**
 * POST /api/admin/auth/login
 * Body: { email, password }
 *
 * Verifies credentials against admin_users table (bcrypt compare).
 * On success, signs a JWT and sets it as HTTP-only cookie.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const admin = await db.adminUser.findUnique({ where: { email } });
  if (!admin) {
    // Use the same message for "wrong email" and "wrong password" to avoid
    // leaking which emails exist in the admin table.
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const passwordMatches = bcrypt.compareSync(password, admin.passwordHash);
  if (!passwordMatches) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Sign JWT + set cookie
  const token = signAdminToken(admin.id, admin.email);
  const cookieName = getAdminCookieName();
  const maxAge = getAdminCookieMaxAge();

  // Log the login (best-effort)
  await logAdminActionViaJwt(
    { adminId: admin.id, adminEmail: admin.email, name: admin.name },
    "admin.login",
    { email: admin.email }
  );

  const res = NextResponse.json({
    ok: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
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
