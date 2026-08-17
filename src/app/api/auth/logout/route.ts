import { NextResponse } from "next/server";
import { getUserCookieName } from "@/lib/user-jwt";

export const runtime = "nodejs";

/** POST /api/auth/logout — clears the user JWT cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getUserCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
