"use client";

import { useApp } from "./store";

/**
 * AuthControls — always uses custom buttons that route to the auth screen.
 * We switched to direct email/password auth — no Clerk components needed.
 * Clerk SignedIn/SignedOut components are not available in Core 3.
 */
export function AuthControls() {
  const { setScreen } = useApp();
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
