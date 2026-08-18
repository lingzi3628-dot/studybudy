"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Check,
  Sparkles,
  Lock,
  Copy,
  PartyPopper,
  Coins,
  Crown,
} from "lucide-react";
import { useApp } from "../store";

type Plan = {
  id: string; name: string; slug: string; price: number; currency: string;
  tokenLimit: number; dailyQuizLimit: number; dailyFlashcardGenLimit: number;
  features: any;
};
type PaymentMethod = { method: string; label: string; instructions: string; details: any; enabled: boolean };

export function PremiumScreen() {
  const { setScreen } = useApp();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [txId, setTxId] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [transactionRef, setTransactionRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Activation key flow
  const [activationKey, setActivationKey] = useState("");
  const [activationResult, setActivationResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [plansRes, psRes] = await Promise.all([
          fetch("/api/plans"),
          fetch("/api/admin/payment-settings"),
        ]);
        if (plansRes.ok) {
          const d = await plansRes.json();
          setPlans(d.plans);
        }
        if (psRes.ok) {
          const d = await psRes.json();
          setPaymentMethods(d.settings.filter((s: PaymentMethod) => s.enabled));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const initiatePayment = async () => {
    if (!selectedPlan || !selectedMethod) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/user/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan.id, paymentMethod: selectedMethod }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setTxId(d.transactionId);
      setPaymentDetails(d);
    } catch (e: any) {
      setError(e?.message ?? "Failed to initiate payment");
    } finally {
      setBusy(false);
    }
  };

  const confirmPayment = async () => {
    if (!txId || !transactionRef.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/user/payment/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txId, transactionRef: transactionRef.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSuccess(d.message);
      setTxId(null);
      setPaymentDetails(null);
      setTransactionRef("");
      setSelectedPlan(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to confirm payment");
    } finally {
      setBusy(false);
    }
  };

  const activateKey = async () => {
    if (!activationKey.trim()) return;
    setBusy(true);
    setError(null);
    setActivationResult(null);
    try {
      const r = await fetch("/api/user/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activationKey: activationKey.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setActivationResult(d);
      setActivationKey("");
      setTimeout(() => setScreen("home"), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Activation failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 max-w-3xl mx-auto flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-3xl mx-auto">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center gap-2">
          <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Crown className="w-5 h-5 text-amber-500" />
          <h1 className="text-base font-bold text-gray-900">Premium</h1>
        </div>
      </header>

      <div className="px-4 py-4 pb-24 space-y-6">
        {/* Plan cards */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Choose your Study Buddy</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plans.map((p) => {
              const emoji = p.features?.emoji ?? "🤖";
              const isFree = p.price === 0;
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlan(p); setTxId(null); setPaymentDetails(null); }}
                  className={`text-left rounded-2xl border-2 p-4 transition ${
                    selectedPlan?.id === p.id ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{emoji}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isFree ? "bg-gray-100 text-gray-600" : "bg-indigo-100 text-indigo-700"}`}>
                      {isFree ? "FREE" : `$${p.price}`}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-gray-900">{p.name}</h3>
                  <p className="text-xs text-gray-500">{p.tokenLimit.toLocaleString()} tokens/month</p>
                  <p className="text-[10px] text-gray-400 mt-1">{p.dailyQuizLimit} quizzes/day · {p.dailyFlashcardGenLimit} flashcard gens/day</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Payment section */}
        {selectedPlan && selectedPlan.price > 0 && !txId && (
          <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Method</h3>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((pm) => (
                <button
                  key={pm.method}
                  onClick={() => setSelectedMethod(pm.method)}
                  className={`p-3 rounded-xl border-2 text-xs font-medium transition ${
                    selectedMethod === pm.method ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
            {selectedMethod && (
              <button
                onClick={initiatePayment}
                disabled={busy}
                className="mt-3 w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? "Processing…" : `Pay $${selectedPlan.price} via ${paymentMethods.find(m => m.method === selectedMethod)?.label}`}
              </button>
            )}
          </section>
        )}

        {/* Payment instructions */}
        {txId && paymentDetails && (
          <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Payment Instructions</h3>
            <p className="text-xs text-gray-600">{paymentDetails.instructions}</p>
            {paymentDetails.details && (
              <div className="rounded-xl bg-gray-50 p-3 space-y-1 text-xs">
                {Object.entries(paymentDetails.details).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-gray-500 capitalize">{k}:</span>
                    <span className="font-mono font-semibold text-gray-900">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Transaction Reference</label>
              <input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="Enter your transaction reference"
                className="mt-1 w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <button
              onClick={confirmPayment}
              disabled={busy || !transactionRef.trim()}
              className="w-full h-11 rounded-full bg-emerald-500 text-white font-semibold text-sm shadow-md hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit Payment Confirmation"}
            </button>
          </section>
        )}

        {/* Activation key entry */}
        <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" /> Have an activation key?
          </h3>
          <div className="flex gap-2">
            <input
              value={activationKey}
              onChange={(e) => setActivationKey(e.target.value)}
              placeholder="SB-XXXX-XXXX-XXXX-XXXX"
              className="flex-1 p-2.5 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:border-indigo-400"
            />
            <button
              onClick={activateKey}
              disabled={busy || !activationKey.trim()}
              className="px-4 h-11 rounded-xl bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "…" : "Activate"}
            </button>
          </div>
          {activationResult && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
              <PartyPopper className="w-6 h-6 mx-auto text-emerald-500" />
              <p className="mt-1 text-sm font-bold text-emerald-700">{activationResult.celebration}</p>
              <p className="text-xs text-emerald-600 mt-1">{activationResult.plan.name} · {activationResult.tokenBalance.toLocaleString()} tokens</p>
            </div>
          )}
        </section>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2">
            <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <div className="text-center text-[11px] text-gray-400">
          <Coins className="w-3 h-3 inline mr-1" />
          After payment, an admin reviews and sends your activation key.
          Enter it above to unlock your plan instantly.
        </div>
      </div>
    </div>
  );
}
