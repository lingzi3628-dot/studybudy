"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

/**
 * ClerkControls — renders Clerk's native auth controls.
 * Only loaded when Clerk is configured (via dynamic import with ssr:false).
 *
 * Shows sign-in/sign-up buttons when signed out, and a user button when signed in.
 */
export function ClerkControls() {
  return (
    <div className="flex items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal">
          <button className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium">
            Log in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="px-4 py-1.5 text-sm rounded-full bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700">
            Get Started
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8 rounded-full",
            },
          }}
        />
      </SignedIn>
    </div>
  );
}
