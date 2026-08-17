"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

/**
 * Wraps the app with ClerkProvider when Clerk env keys are configured,
 * otherwise renders children directly (dev fallback).
 *
 * ClerkProvider is loaded via next/dynamic with ssr:false, so it only
 * mounts on the client — no need for a mounted state.
 */
const ClerkProvider = dynamic(
  () => import("@clerk/nextjs").then((m) => m.ClerkProvider),
  { ssr: false }
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!pk || !pk.startsWith("pk_")) {
    return <>{children}</>;
  }
  return <ClerkProvider>{children}</ClerkProvider>;
}
