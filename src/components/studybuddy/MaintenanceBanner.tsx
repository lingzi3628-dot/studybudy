"use client";

import { useState, useEffect } from "react";
import { X, Wrench } from "lucide-react";

/**
 * MaintenanceBanner — dismissible smart banner
 *
 * Shows a maintenance notice to all users. Dismissible per-browser
 * (localStorage). Can be turned off by setting
 * NEXT_PUBLIC_MAINTENANCE_BANNER=false in Vercel env vars.
 *
 * To remove later: either set the env var to false, or delete this
 * component's usage in page.tsx.
 */
export function MaintenanceBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check localStorage — user dismissed it in this browser
    const d = localStorage.getItem("maintenance_dismissed");
    if (d === "true") setDismissed(true);
  }, []);

  // Feature flag — set NEXT_PUBLIC_MAINTENANCE_BANNER=false to hide
  const flag = (process.env.NEXT_PUBLIC_MAINTENANCE_BANNER ?? "true").toLowerCase().trim();
  if (flag === "false" || flag === "0" || flag === "off") return null;

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem("maintenance_dismissed", "true");
    setDismissed(true);
  };

  return (
    <div className="relative bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-2 relative">
        <Wrench className="w-4 h-4 flex-shrink-0 animate-pulse" />
        <p className="text-center font-medium leading-tight">
          🔧 StudyBuddy is undergoing maintenance to improve your AI experience.
          Some features may be temporarily limited. We&apos;ll notify you when everything is back.
        </p>
        <button
          onClick={dismiss}
          className="absolute right-0 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/20 transition"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
