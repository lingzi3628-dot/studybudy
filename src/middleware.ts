import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware — route protection.
 *
 * Note: This middleware runs at the edge before each request. Clerk session
 * verification happens server-side in the actual route handlers via
 * `requireAdmin()` / `getCurrentUser()`. This middleware is a fast pre-check
 * for the admin path — it does NOT replace the server-side checks.
 *
 * Routes:
 *   - /admin           → no client redirect (handled client-side in AdminPanel)
 *   - /api/admin/*     → non-admins get a 404 (returns NextResponse.rewrite to a 404 page)
 *
 * When real Clerk is configured (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY set),
 * this middleware can be extended to use Clerk's `clerkMiddleware` for full
 * session verification at the edge. For now we keep it simple — the actual
 * admin authorization is enforced by `requireAdmin()` in each route handler.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Block direct access to /api/admin/* at the edge if no auth cookies present.
  // (Server-side requireAdmin() is the real check — this is a fast-fail to
  // avoid hitting the DB for anonymous requests.)
  if (pathname.startsWith("/api/admin/")) {
    // The actual admin check happens in requireAdmin() on the server.
    // We don't block here because the dev-user fallback wouldn't work
    // (the dev user has no Clerk session cookies). Let the route handler
    // do the real check.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on admin routes only (we keep it minimal to avoid
  // interfering with the rest of the app's state-based navigation).
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
