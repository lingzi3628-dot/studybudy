"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X, Loader2, AlertCircle, Check, Coins, Zap, Trophy, Flame,
  Sparkles, ChevronRight, ArrowRight, ArrowLeftRight, Gift,
  Calendar, Target, Bot, Crown,
} from "lucide-react";
import { useApp } from "../store";

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  login: { label: "Daily Login", icon: "📅" },
  complete_lesson: { label: "Complete Lesson", icon: "📚" },
  complete_quiz: { label: "Complete Quiz", icon: "❓" },
  complete_flashcards: { label: "Review Flashcards", icon: "🎴" },
  complete_concept_map: { label: "Create Concept Map", icon: "🗺️" },
  complete_daily_review: { label: "Daily Review", icon: "☀️" },
  focus_25min: { label: "25-min Focus Session", icon: "⏱️" },
  note_created: { label: "Create a Note", icon: "📝" },
  streak_3: { label: "3-Day Streak Milestone", icon: "🔥" },
  streak_7: { label: "7-Day Streak Milestone", icon: "⚡" },
  streak_30: { label: "30-Day Streak Milestone", icon: "👑" },
  badge_earned: { label: "Earn a Badge", icon: "🏅" },
  path_completed: { label: "Complete Learning Path", icon: "🛤️" },
  ai_teacher_chat: { label: "Chat with AI Teacher", icon: "🤖" },
  group_joined: { label: "Join a Study Group", icon: "👥" },
};

export function EarnCenterScreen() {
  const { setScreen } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [exchangeAmount, setExchangeAmount] = useState("10");
  const [exchangeDir, setExchangeDir] = useState<"coins_to_tokens" | "tokens_to_coins">("coins_to_tokens");
  const [exchangeResult, setExchangeResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/user/earn-center");
      const d = await r.json();
      if (r.ok) setData(d);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const claimLogin = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/user/claim-daily-login", { method: "POST" });
      const d = await r.json();
      if (r.ok && d.ok) {
        setToast(d.message ?? "Login bonus claimed!");
        setTimeout(() => setToast(null), 3000);
        await load();
      } else if (d.alreadyClaimed) {
        setToast("Already claimed today — come back tomorrow!");
        setTimeout(() => setToast(null), 3000);
      } else {
        setToast(d.error ?? "Claim failed");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {}
    setBusy(false);
  };

  const doExchange = async () => {
    setBusy(true);
    setExchangeResult(null);
    try {
      const r = await fetch("/api/user/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: exchangeDir === "coins_to_tokens" ? "coins" : "tokens",
          to: exchangeDir === "coins_to_tokens" ? "tokens" : "coins",
          amount: Number(exchangeAmount),
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setExchangeResult(d);
        setToast(`Exchanged ${d.amount} ${d.from} → ${d.received} ${d.to} ✓`);
        setTimeout(() => setToast(null), 3000);
        await load();
      } else {
        setToast(d.error ?? "Exchange failed");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {}
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 max-w-3xl mx-auto flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const balances = data?.balances ?? {};
  const actions = data?.actions ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center gap-2">
          <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
          <Coins className="w-4 h-4 text-amber-500" />
          <h1 className="text-base font-bold text-gray-900">Earn Center</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24">
        {/* Balance card */}
        <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-md">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="flex items-center justify-center gap-1">
                <Coins className="w-4 h-4" />
                <span className="text-2xl font-bold">{balances.coins ?? 0}</span>
              </div>
              <p className="text-[10px] opacity-80">Coins</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1">
                <Zap className="w-4 h-4" />
                <span className="text-2xl font-bold">{balances.tokens ?? 0}</span>
              </div>
              <p className="text-[10px] opacity-80">Tokens</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1">
                <Trophy className="w-4 h-4" />
                <span className="text-2xl font-bold">L{data?.balances ? 1 : 1}</span>
              </div>
              <p className="text-[10px] opacity-80">Level</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3" /> {data?.balances?.isPremium ? "Premium" : "Free Plan"}
            </span>
            <span>Active: {balances.activeModel ?? "study_buddy_free"}</span>
          </div>
        </div>

        {/* Daily login bonus */}
        <div className={`rounded-2xl border-2 p-4 ${data?.dailyLoginClaimed ? "bg-gray-50 border-gray-200" : "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-3xl">📅</span>
              <div>
                <p className="text-sm font-bold text-gray-900">Daily Login Bonus</p>
                <p className="text-[11px] text-gray-500">+5 coins · +5 XP · every day</p>
              </div>
            </div>
            {data?.dailyLoginClaimed ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                <Check className="w-4 h-4" /> Claimed
              </span>
            ) : (
              <button
                onClick={claimLogin}
                disabled={busy}
                className="px-4 h-9 rounded-full bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50"
              >
                Claim →
              </button>
            )}
          </div>
        </div>

        {/* Resting status */}
        {balances.freeModelRestingUntil && new Date() < new Date(balances.freeModelRestingUntil) && (
          <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🥱</span>
              <div>
                <p className="text-sm font-bold text-gray-900">Free Model is Resting</p>
                <p className="text-[11px] text-gray-500">
                  Wakes up at {new Date(balances.freeModelRestingUntil).toLocaleTimeString()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setBusy(true);
                  const r = await fetch("/api/user/wake-free-model", { method: "POST" });
                  const d = await r.json();
                  if (r.ok) {
                    setToast(d.message ?? "Model woken up!");
                    setTimeout(() => setToast(null), 2500);
                    await load();
                  } else {
                    setToast(d.error ?? "Failed to wake");
                    setTimeout(() => setToast(null), 3000);
                  }
                  setBusy(false);
                }}
                disabled={busy}
                className="flex-1 h-9 rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <Coins className="w-3 h-3" /> Wake (5 coins)
              </button>
              <button
                onClick={() => setScreen("premium")}
                className="flex-1 h-9 rounded-full bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
              >
                Rent Premium →
              </button>
            </div>
          </div>
        )}

        {/* Today's earnings */}
        <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" /> Today's Earnings
          </h3>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-amber-50 p-2">
              <p className="text-[10px] text-gray-500">Coins Earned</p>
              <p className="text-lg font-bold text-amber-600">{data?.todayCoinsEarned ?? 0}</p>
            </div>
            <div className="rounded-lg bg-indigo-50 p-2">
              <p className="text-[10px] text-gray-500">Tokens Earned</p>
              <p className="text-lg font-bold text-indigo-600">{data?.todayTokensEarned ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Earn activities */}
        <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-indigo-500" /> Earn by Studying
          </h3>
          <div className="space-y-1.5">
            {actions.filter((a: any) => a.coinReward > 0 || a.tokenReward > 0 || a.xpReward > 0).map((a: any) => {
              const label = ACTION_LABELS[a.action]?.label ?? a.action;
              const icon = ACTION_LABELS[a.action]?.icon ?? "✨";
              return (
                <div key={a.action} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50">
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900">{label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {a.coinReward > 0 && (
                        <span className="text-[10px] text-amber-600 font-semibold">+{a.coinReward}c</span>
                      )}
                      {a.xpReward > 0 && (
                        <span className="text-[10px] text-violet-600 font-semibold">+{a.xpReward}xp</span>
                      )}
                      {a.tokenReward > 0 && (
                        <span className="text-[10px] text-indigo-600 font-semibold">+{a.tokenReward}t</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {a.dailyLimit > 0 ? (
                      <span className={`text-[10px] font-semibold ${a.remaining === 0 ? "text-gray-400" : "text-emerald-600"}`}>
                        {a.usedToday}/{a.dailyLimit}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400">∞</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Exchange */}
        <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
            <ArrowLeftRight className="w-4 h-4 text-indigo-500" /> Exchange
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExchangeDir("coins_to_tokens")}
                className={`flex-1 p-2 rounded-xl text-xs font-semibold ${exchangeDir === "coins_to_tokens" ? "bg-amber-100 text-amber-700" : "bg-gray-50 text-gray-500"}`}
              >
                Coins → Tokens
              </button>
              <button
                onClick={() => setExchangeDir("tokens_to_coins")}
                className={`flex-1 p-2 rounded-xl text-xs font-semibold ${exchangeDir === "tokens_to_coins" ? "bg-indigo-100 text-indigo-700" : "bg-gray-50 text-gray-500"}`}
              >
                Tokens → Coins
              </button>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">
                Amount ({exchangeDir === "coins_to_tokens" ? "coins" : "tokens"})
              </label>
              <input
                type="number"
                value={exchangeAmount}
                onChange={(e) => setExchangeAmount(e.target.value)}
                min={1}
                className="mt-1 w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <p className="text-[10px] text-gray-400">
              {exchangeDir === "coins_to_tokens" ? "1 coin = 10 tokens" : "100 tokens = 8 coins (20% fee)"}
            </p>
            <button
              onClick={doExchange}
              disabled={busy || !exchangeAmount}
              className="w-full h-10 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
              Exchange
            </button>
            {exchangeResult && (
              <p className="text-[10px] text-emerald-600 text-center">
                ✓ Got {exchangeResult.received} {exchangeResult.to}
              </p>
            )}
          </div>
        </div>

        {/* Active rentals */}
        {data?.activeRentals?.length > 0 && (
          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-violet-500" /> Active Rentals
            </h3>
            <div className="space-y-1.5">
              {data.activeRentals.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-violet-50">
                  <span className="text-xs font-semibold text-gray-900">{r.modelName}</span>
                  <span className="text-[10px] text-violet-600">
                    Expires {new Date(r.expiresAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Premium upsell */}
        {!balances.isPremium && (
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 p-4 text-center">
            <Crown className="w-8 h-8 mx-auto text-indigo-500" />
            <p className="mt-2 text-sm font-bold text-gray-900">Go Premium</p>
            <p className="text-xs text-gray-500 mt-1">Unlimited models, monthly tokens, no daily limits, no resting.</p>
            <button
              onClick={() => setScreen("premium")}
              className="mt-3 px-6 h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
            >
              View Plans →
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
