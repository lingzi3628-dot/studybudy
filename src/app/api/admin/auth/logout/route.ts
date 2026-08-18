import { NextResponse } from "next/server";
import { getAdminCookieName } from "@/lib/admin-jwt";

export const runtime = "nodejs";

/** POST /api/admin/auth/logout — clears the admin JWT cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getAdminCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
