"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

/**
 * Wraps the app with ClerkProvider when Clerk env keys are configured,
 * otherwise renders children directly (dev fallback).
 *
 * Uses the shadcn theme from @clerk/ui so Clerk components match the
 * app's design system (indigo primary, rounded-2xl cards, etc).
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

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#4F46E5",
          colorText: "#111827",
          colorBackground: "#ffffff",
          colorInputBackground: "#ffffff",
          colorInputBorder: "#E5E7EB",
          borderRadius: "0.75rem",
          fontFamily: "var(--font-inter)",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
