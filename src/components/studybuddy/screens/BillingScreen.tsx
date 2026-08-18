"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Coins,
  Calendar,
  TrendingDown,
  TrendingUp,
  Receipt,
  Crown,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useApp } from "../store";

type UsageEntry = {
  id: string;
  feature: string;
  model: string;
  tokensUsed: number;
  costTokens: number;
  createdAt: string;
};

type Tx = {
  id: string;
  status: string;
  paymentMethod: string;
  amount: number;
  currency: string | null;
  transactionRef: string | null;
  createdAt: string;
  plan?: { name: string; slug: string } | null;
};

const FEATURE_LABELS: Record<string, string> = {
  search: "🔍 Search",
  cards: "🎴 Flashcards",
  quiz: "❓ Quiz",
  tutor: "🤖 AI Tutor",
  graph: "📈 Graph",
  translate: "🌐 Translate",
  learning_path: "🛤️ Learning Path",
  image_search: "🖼️ Image Search",
  video_search: "📺 Video Search",
};

export function BillingScreen() {
  const { setScreen } = useApp();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [totalMonth, setTotalMonth] = useState(0);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tokenResetDate, setTokenResetDate] = useState<string | null>(null);
  const [hasActivePlan, setHasActivePlan] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [byFeature, setByFeature] = useState<Record<string, { count: number; cost: number }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [usageRes, payRes] = await Promise.all([
          fetch("/api/user/usage"),
          fetch("/api/user/payment/status"),
        ]);
        if (!mounted) return;
        if (usageRes.ok) {
          const d = await usageRes.json();
          setEntries(d.entries ?? []);
          setTotalToday(d.totalUsedToday ?? 0);
          setTotalMonth(d.totalUsedThisMonth ?? 0);
          setTokenBalance(d.tokenBalance ?? 0);
          setTokenResetDate(d.tokenResetDate ?? null);
          setByFeature(d.byFeature ?? {});
        }
        if (payRes.ok) {
          const d = await payRes.json();
          setTxs(d.transactions ?? []);
          setHasActivePlan(d.hasActivePlan ?? false);
          setCurrentPlan(d.currentPlanId);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 max-w-3xl mx-auto flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-3xl mx-auto">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center gap-2">
          <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Receipt className="w-5 h-5 text-indigo-600" />
          <h1 className="text-base font-bold">Billing & Usage</h1>
        </div>
      </header>

      <div className="px-4 py-4 pb-24 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Balance card */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-4 text-white shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Token Balance</p>
              <p className="mt-1 text-3xl font-bold flex items-center gap-1.5">
                <Coins className="w-6 h-6" />
                {(tokenBalance ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              {hasActivePlan ? (
                <span className="inline-flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded-full">
                  <Crown className="w-3 h-3" /> Premium
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded-full">
                  <Zap className="w-3 h-3" /> Free Plan
                </span>
              )}
              {tokenResetDate && (
                <p className="mt-1 text-[10px] opacity-80 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Resets {new Date(tokenResetDate).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Usage stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
              <span>Used Today</span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900">{totalToday.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400">tokens</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
              <span>This Month</span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900">{totalMonth.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400">tokens</p>
          </div>
        </div>

        {/* By feature today */}
        {Object.keys(byFeature).length > 0 && (
          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Today by Feature</h2>
            <div className="space-y-2">
              {Object.entries(byFeature).map(([key, v]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">
                    {FEATURE_LABELS[key] ?? key}
                    <span className="ml-1.5 text-[10px] text-gray-400">×{v.count}</span>
                  </span>
                  <span className="text-xs font-semibold text-gray-900">{v.cost} tokens</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent usage log */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Recent Token Activity</h2>
          {entries.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center text-xs text-gray-400">
              No usage yet. Start by searching, asking the AI tutor, or generating flashcards.
            </div>
          ) : (
            <div className="space-y-1.5">
              {entries.slice(0, 30).map((e) => {
                const isRefund = e.costTokens < 0 || e.feature.endsWith("_refund");
                const feature = e.feature.replace(/_refund$/, "");
                return (
                  <div key={e.id} className="flex items-center justify-between rounded-xl bg-white border border-gray-200 p-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base flex-shrink-0">
                        {FEATURE_LABELS[feature]?.split(" ")[0] ?? "•"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {FEATURE_LABELS[feature]?.replace(/^[^\s]+\s/, "") ?? feature}
                          {isRefund && <span className="ml-1 text-emerald-600">↩ refunded</span>}
                        </p>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {new Date(e.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <span className={`font-semibold flex-shrink-0 ${isRefund ? "text-emerald-600" : "text-gray-900"}`}>
                      {isRefund ? "+" : "-"}{Math.abs(e.costTokens)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment transactions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Payment History</h2>
          {txs.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center text-xs text-gray-400">
              No payments yet.
              <div className="mt-2">
                <button onClick={() => setScreen("premium")} className="text-indigo-600 font-semibold underline">
                  Browse plans →
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {txs.map((t) => (
                <div key={t.id} className="rounded-xl bg-white border border-gray-200 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {t.plan?.name ?? "—"} · ${t.amount} {t.currency ?? ""}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {t.paymentMethod} · {new Date(t.createdAt).toLocaleDateString()}
                        {t.transactionRef && ` · ref ${t.transactionRef}`}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      t.status === "confirmed" ? "bg-emerald-50 text-emerald-700" :
                      t.status === "pending" ? "bg-amber-50 text-amber-700" :
                      "bg-rose-50 text-rose-700"
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        {!hasActivePlan && (
          <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 p-4 text-center">
            <Crown className="w-8 h-8 mx-auto text-amber-500" />
            <p className="mt-2 text-sm font-semibold text-gray-900">Upgrade for unlimited usage</p>
            <p className="text-xs text-gray-500 mt-1">Get more tokens, premium AI models, and no daily limits.</p>
            <button onClick={() => setScreen("premium")} className="mt-3 px-6 h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700">
              View Plans →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
