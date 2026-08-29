"use client";

/**
 * BuddySwitcher — Phase 47
 *
 * Dropdown component shown in the AI Tutor header. Lets the user pick
 * which buddy handles their conversation. Shows all 8 buddies with their
 * emoji, name, tagline, and a "free"/"premium" badge.
 *
 * Selecting a buddy:
 *   1. Persists the choice to localStorage so the next session remembers it
 *   2. Updates the parent component via onBuddyChange(buddyId)
 *   3. The parent passes the buddyId to /api/tutor/chat in the request body
 *
 * The buddy's system prompt is NEVER loaded on the client — the server
 * looks it up via getBuddy(id).
 */

import { useEffect, useState, useRef } from "react";
import { ChevronDown, Check, Lock, Sparkles } from "lucide-react";
import { useApp } from "../store";
import type { BuddyMetadata, BuddyId } from "@/lib/buddies/types";

const BUDDY_STORAGE_KEY = "studybuddy_active_buddy";

/**
 * Read the user's persisted buddy preference. Defaults to "study".
 * Used by AITutorChat on mount so the user's last choice is remembered.
 */
export function getStoredBuddyId(): BuddyId {
  if (typeof window === "undefined") return "study";
  const stored = localStorage.getItem(BUDDY_STORAGE_KEY);
  return (stored as BuddyId) ?? "study";
}

/**
 * Persist the user's buddy choice.
 */
export function setStoredBuddyId(id: BuddyId): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BUDDY_STORAGE_KEY, id);
}

export function BuddySwitcher({
  activeBuddyId,
  onBuddyChange,
  compact = false,
}: {
  activeBuddyId: BuddyId;
  onBuddyChange: (id: BuddyId) => void;
  /** When true, renders as a compact pill (for the AI Tutor header). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [buddies, setBuddies] = useState<BuddyMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Load buddies from /api/buddies on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/buddies");
        if (r.ok) {
          const d = await r.json();
          setBuddies(d.buddies ?? []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeBuddy = buddies.find((b) => b.id === activeBuddyId);

  const handleSelect = (b: BuddyMetadata) => {
    // Phase 47: free vs premium gating is enforced server-side (the chat route
    // will reject premium buddies for free users). For UX, we show a lock icon
    // on premium buddies but still let the user try — if rejected, the chat
    // shows the "needs upgrade" message that already exists.
    onBuddyChange(b.id);
    setStoredBuddyId(b.id);
    setOpen(false);
  };

  if (loading || !activeBuddy) {
    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gray-100 ${compact ? "text-xs" : "text-sm"}`}>
        <span className="opacity-50">…</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Switch buddy (current: ${activeBuddy.displayName})`}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gradient-to-br ${activeBuddy.accentGradient} text-white font-semibold hover:brightness-95 transition ${compact ? "text-xs" : "text-sm"}`}
      >
        <span className="text-base">{activeBuddy.emoji}</span>
        <span>{activeBuddy.displayName}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" /> Choose your buddy
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Each buddy is a specialized AI persona with its own tools + knowledge.
            </p>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {buddies.map((b) => {
              const isActive = b.id === activeBuddyId;
              return (
                <li key={b.id}>
                  <button
                    onClick={() => handleSelect(b)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition ${
                      isActive ? "bg-indigo-50/50" : ""
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${b.accentGradient} text-white flex items-center justify-center text-xl flex-shrink-0`}>
                      {b.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-gray-900">{b.displayName}</p>
                        {b.plan === "premium" && (
                          <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" /> Pro
                          </span>
                        )}
                        {isActive && (
                          <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5">{b.tagline}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {b.capabilities.slice(0, 3).map((cap) => (
                          <span
                            key={cap}
                            className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium"
                          >
                            {cap.replace(/_/g, " ")}
                          </span>
                        ))}
                        {b.capabilities.length > 3 && (
                          <span className="text-[9px] text-gray-400">+{b.capabilities.length - 3}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-[10px] text-gray-500 text-center">
              Your choice is remembered next time you visit.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
