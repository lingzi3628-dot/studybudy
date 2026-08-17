import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware.
 *
 * When Clerk is configured (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY set), this
 * file will be replaced by Clerk's `clerkMiddleware` when you run
 * `clerk init`. The matcher below includes Clerk's auto-proxy path so the
 * handoff is smooth.
 *
 * In dev mode (no Clerk keys), this is a pass-through — server-side
 * `requireAdminJwt()` handles admin route protection.
 */

export function middleware(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Clerk's auto-proxy path (used by clerkMiddleware when configured)
    "/__clerk/:path*",
    // Admin routes (protected server-side by requireAdminJwt)
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
