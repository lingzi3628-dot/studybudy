"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Check,
  Bot,
  Lock,
  Zap,
  Sparkles,
  Crown,
} from "lucide-react";
import { useApp } from "../store";

type StudyBuddy = {
  modelName: string;
  displayName: string;
  emoji: string;
  requiresPremium: boolean;
  tokenCostMultiplier: number;
  providerId: string | null;
  modelIdentifier: string | null;
};

type ActiveRental = {
  id: string;
  modelName: string;
  expiresAt: string;
} | null;

/**
 * StudyBuddySelector — Phase 22g
 *
 * Lets the user choose which AI Study Buddy they want to use.
 * - Free buddies: available to everyone (uses tokens)
 * - Premium buddies: need an active subscription or coin rental
 * - Each buddy is linked to a specific AI provider + model in the admin panel
 *
 * The current buddy's emoji is shown as a live avatar in the TopBar.
 */
export function StudyBuddySelector() {
  const { setScreen } = useApp();
  const [buddies, setBuddies] = useState<StudyBuddy[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [activeRental, setActiveRental] = useState<ActiveRental>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [modelsRes, meRes] = await Promise.all([
        fetch("/api/user/models"),
        fetch("/api/auth/me"),
      ]);
      if (modelsRes.ok) {
        const d = await modelsRes.json();
        setBuddies(d.models ?? []);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.authed) {
          setCurrentModel(me.user?.currentModel ?? "study_buddy_free");
          setIsPremium(me.user?.planId ? true : false);
        }
      }

      // Check active rental
      try {
        const rentalRes = await fetch("/api/user/rental-status");
        if (rentalRes.ok) {
          const rentalData = await rentalRes.json();
          setActiveRental(rentalData.activeRental ?? null);
        }
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const switchBuddy = async (modelName: string, buddy: StudyBuddy) => {
    setBusy(true);
    setError(null);
    try {
      // Use /api/user/active-model which supports rental-based access
      const r = await fetch("/api/user/active-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 402) {
          setError(d.error ?? "You need to upgrade or rent this buddy");
          setToast(`🔒 ${buddy.displayName} is locked. Rent it with coins or upgrade to Premium.`);
          setTimeout(() => setToast(null), 3500);
        } else {
          throw new Error(d.error ?? "Failed");
        }
        return;
      }
      setCurrentModel(modelName);
      setToast(`✓ Switched to ${buddy.emoji} ${buddy.displayName}!`);
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setScreen("home")} className="text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Bot className="w-5 h-5 text-indigo-600" />
          <p className="text-sm font-bold text-gray-900">Choose Your Study Buddy</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        {toast && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-center gap-2">
            {toast}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <p className="text-xs text-gray-500">
          Each Study Buddy has different intelligence and personality. Switch anytime —
          your progress is saved automatically.
        </p>

        {/* Buddy cards */}
        <div className="space-y-2">
          {buddies.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
              <Bot className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="mt-2 text-sm text-gray-600">No Study Buddies configured yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Admin needs to add Model Mappings in the admin panel.
              </p>
            </div>
          ) : (
            buddies.map((buddy) => {
              const isActive = currentModel === buddy.modelName;
              const canUse = !buddy.requiresPremium || isPremium || (activeRental?.modelName === buddy.modelName);
              return (
                <button
                  key={buddy.modelName}
                  onClick={() => canUse && switchBuddy(buddy.modelName, buddy)}
                  disabled={busy || isActive}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                    isActive
                      ? "border-indigo-500 bg-indigo-50 shadow-md"
                      : canUse
                      ? "border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm"
                      : "border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Buddy avatar */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 ${
                      isActive ? "bg-indigo-100" : canUse ? "bg-gray-100" : "bg-gray-200"
                    }`}>
                      {buddy.emoji}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">{buddy.displayName}</p>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold uppercase">
                            Active
                          </span>
                        )}
                        {buddy.requiresPremium && !canUse && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-bold uppercase flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" /> Premium
                          </span>
                        )}
                        {buddy.requiresPremium && canUse && !isPremium && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase">
                            Rented
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {buddy.modelIdentifier ?? "Default model"}
                        {buddy.tokenCostMultiplier !== 1.0 && (
                          <span className="ml-1 text-amber-600">
                            · {buddy.tokenCostMultiplier}x token cost
                          </span>
                        )}
                      </p>
                      {activeRental?.modelName === buddy.modelName && (
                        <p className="text-[10px] text-emerald-600 mt-0.5">
                          ⏰ Rented until {new Date(activeRental.expiresAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Status icon */}
                    {isActive ? (
                      <Check className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                    ) : canUse ? (
                      <Sparkles className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <Lock className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </div>

                  {!canUse && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-[11px] text-gray-500">
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                      <span>Rent with coins for 30 min / 1 hour / 1 day, or upgrade to Premium for unlimited access.</span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Info card */}
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-3 text-[11px] text-indigo-700">
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">How Study Buddies work:</p>
              <ul className="mt-1 space-y-0.5 list-disc list-inside">
                <li>Each buddy uses a different AI model with different intelligence</li>
                <li>Free buddies use tokens (refill daily to 500)</li>
                <li>Premium buddies need a subscription or coin rental</li>
                <li>Switch anytime — your learning progress is always saved</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
