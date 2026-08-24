"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { useApp } from "./store";

/**
 * FamilyChildGuard — Phase 21b
 *
 * Wraps any screen that should NOT be accessible to family children
 * (Earn Center, Billing, Premium, etc.). If the current user is a family
 * child, redirect them to home with a friendly toast.
 *
 * Why: children don't have their own token balance (parent pays for
 * everything), so showing them token-earning or token-spending UI would
 * be confusing and misleading.
 */
export function FamilyChildGuard({ children }: { children: React.ReactNode }) {
  const { setScreen } = useApp();
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!mounted) return;
        if (d?.authed && d.isFamilyChild) {
          setBlocked(true);
          // Redirect to home after a brief delay so the user sees why
          setTimeout(() => setScreen("home"), 1500);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
    return () => {
      mounted = false;
    };
  }, [setScreen]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-white border border-gray-200 p-6 max-w-sm w-full text-center shadow-sm">
          <div className="w-12 h-12 mx-auto rounded-full bg-violet-50 text-violet-600 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-gray-900">
            This screen is for parents only
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Your parent manages tokens and billing. Sending you back to your
            learning room…
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
