"use client";

import { ReactNode } from "react";

/**
 * AuthProvider — renders children directly.
 *
 * We use direct email/password auth (JWT cookies via /api/auth/*).
 * Clerk is NOT used — it was causing ERR_CONNECTION_CLOSED errors
 * on Vercel because the Clerk proxy subdomain wasn't responding.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
