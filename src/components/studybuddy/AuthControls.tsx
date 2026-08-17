"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";
import { useApp } from "./store";

/**
 * ClerkAuthControls — renders Clerk's SignInButton/SignUpButton/UserButton
 * when Clerk is configured, or custom fallback buttons when not.
 *
 * When Clerk is configured (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY starts with pk_):
 *   - Shows <SignInButton> + <SignUpButton> when signed out
 *   - Shows <UserButton> when signed in
 *
 * When not configured (dev/sandbox):
 *   - Shows custom "Log in" + "Get Started" buttons that route to the auth screen
 */

const ClerkControls = dynamic(
  () => import("./clerk-controls").then((m) => m.ClerkControls),
  { ssr: false }
);

export function AuthControls() {
  const { setScreen } = useApp();
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkConfigured = Boolean(pk && pk.startsWith("pk_"));

  if (clerkConfigured) {
    return <ClerkControls />;
  }

  // Dev fallback
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setScreen("auth")}
        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
      >
        Log in
      </button>
      <button
        onClick={() => setScreen("auth")}
        className="px-4 py-1.5 text-sm rounded-full bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700"
      >
        Get Started
      </button>
    </div>
  );
}
