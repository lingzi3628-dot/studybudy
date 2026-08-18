"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Check,
  Sparkles,
  Lock,
  PartyPopper,
  Crown,
  Zap,
} from "lucide-react";
import { useApp } from "../store";

type Plan = {
  id: string; name: string; slug: string; price: number; currency: string;
  tokenLimit: number; dailyQuizLimit: number; dailyFlashcardGenLimit: number;
  features: any;
};

const EMOJIS: Record<string, string> = {
  free: "🌱", plus: "⚡", pro: "🚀", king: "👑", ultra: "💎", teddy: "🧸", photo: "📸",
};

const COLORS: Record<string, string> = {
  free: "from-gray-500 to-gray-600",
  plus: "from-blue-500 to-indigo-600",
  pro: "from-indigo-500 to-violet-600",
  king: "from-amber-500 to-orange-600",
  ultra: "from-violet-500 to-purple-700",
  teddy: "from-rose-400 to-pink-600",
  photo: "from-emerald-500 to-teal-600",
};

export function PremiumScreen() {
  const { setScreen } = useApp();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [step, setStep] = useState<"plans" | "payment" | "activate">("plans");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [txId, setTxId] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [transactionRef, setTransactionRef] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [activationResult, setActivationResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const plansRes = await fetch("/api/plans");
        if (plansRes.ok) {
          const d = await plansRes.json();
          setPlans(d.plans);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const startPayment = async (plan: Plan) => {
    if (plan.price === 0) return;
    setSelectedPlan(plan);
    setStep("payment");
    setError(null);
    // Fetch payment settings — use public endpoint (no admin auth needed)
    try {
      const r = await fetch("/api/payment-settings");
      if (r.ok) {
        const d = await r.json();
        setPaymentMethods(d.settings.filter((s: any) => s.enabled));
      } else {
        setPaymentMethods([
          { method: "mpesa", label: "M-Pesa", instructions: "Send to paybill 4040404", details: { paybill: "4040404", account: "StudyBuddy" }, enabled: true },
          { method: "paypal", label: "PayPal", instructions: "Send to payments@studybuddy.ai", details: { email: "payments@studybuddy.ai" }, enabled: true },
          { method: "bank", label: "Bank Transfer", instructions: "Transfer to bank", details: { bank: "Equity Bank", account: "0123456789" }, enabled: true },
        ]);
      }
    } catch {
      setPaymentMethods([
        { method: "mpesa", label: "M-Pesa", enabled: true, instructions: "Send to paybill", details: {} },
        { method: "paypal", label: "PayPal", enabled: true, instructions: "Send to PayPal", details: {} },
      ]);
    }
  };

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
      setError(e?.message ?? "Failed");
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
      setStep("activate");
      setTxId(null);
      setPaymentDetails(null);
      setTransactionRef("");
    } catch (e: any) {
      setError(e?.message ?? "Failed");
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
      setTimeout(() => setScreen("home"), 4000);
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
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center gap-2">
          <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Crown className="w-5 h-5 text-amber-500" />
          <h1 className="text-base font-bold">Study Buddy Plans</h1>
          <div className="ml-auto flex gap-1">
            <button onClick={() => setScreen("billing")} className="px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 hover:bg-gray-200">📊 Usage</button>
            <button onClick={() => setStep("plans")} className={`px-2 py-1 rounded-full text-[10px] font-medium ${step === "plans" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}>Plans</button>
            <button onClick={() => setStep("activate")} className={`px-2 py-1 rounded-full text-[10px] font-medium ${step === "activate" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}>Activate Key</button>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 pb-24">
        {error && <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span></div>}
        {success && <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2"><Check className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{success}</span></div>}

        {/* STEP 1: Plan cards */}
        {step === "plans" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Choose your Study Buddy 🤖</h2>
            <p className="text-xs text-gray-500">Pick a buddy that matches your study goals. Free buddies are unlocked — premium buddies need an activation key.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plans.map((p) => {
                const emoji = EMOJIS[p.slug] ?? "🤖";
                const isFree = p.price === 0;
                const isSelected = selectedPlan?.id === p.id;
                return (
                  <div key={p.id} className={`rounded-2xl border-2 overflow-hidden transition ${isSelected ? "border-indigo-600 shadow-lg" : "border-gray-200"}`}>
                    {/* Colored header */}
                    <div className={`bg-gradient-to-br ${COLORS[p.slug] ?? COLORS.free} p-3 text-white`}>
                      <div className="flex items-center justify-between">
                        <span className="text-3xl">{emoji}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isFree ? "bg-white/20" : "bg-white text-gray-900"}`}>
                          {isFree ? "FREE" : `$${p.price}`}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-bold">{p.name}</h3>
                    </div>
                    {/* Body */}
                    <div className="p-3 bg-white">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between"><span className="text-gray-500">Tokens/month</span><span className="font-semibold text-gray-900">{p.tokenLimit.toLocaleString()}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-500">Quizzes/day</span><span className="font-semibold text-gray-900">{p.dailyQuizLimit}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-500">Flashcard gens/day</span><span className="font-semibold text-gray-900">{p.dailyFlashcardGenLimit}</span></div>
                      </div>
                      <button
                        onClick={() => isFree ? setScreen("home") : startPayment(p)}
                        className={`mt-3 w-full h-9 rounded-full text-xs font-semibold transition ${
                          isFree
                            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {isFree ? "Current Plan" : `Get ${p.name.split(" ").slice(-1)[0]} →`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Payment */}
        {step === "payment" && selectedPlan && (
          <div className="space-y-4">
            <button onClick={() => setStep("plans")} className="text-xs text-gray-500 flex items-center gap-1">← Back to plans</button>

            <div className={`rounded-2xl bg-gradient-to-br ${COLORS[selectedPlan.slug] ?? COLORS.free} p-4 text-white text-center`}>
              <span className="text-4xl">{EMOJIS[selectedPlan.slug]}</span>
              <h2 className="mt-1 text-lg font-bold">{selectedPlan.name}</h2>
              <p className="text-sm opacity-90">${selectedPlan.price} · {selectedPlan.tokenLimit.toLocaleString()} tokens/month</p>
            </div>

            {!txId && (
              <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                <h3 className="text-sm font-semibold mb-3">Select Payment Method</h3>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.length === 0 && <p className="text-xs text-gray-400 col-span-2">Loading payment methods…</p>}
                  {paymentMethods.map((pm) => (
                    <button key={pm.method} onClick={() => setSelectedMethod(pm.method)}
                      className={`p-3 rounded-xl border-2 text-xs font-medium transition ${selectedMethod === pm.method ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"}`}>
                      {pm.label}
                    </button>
                  ))}
                </div>
                {selectedMethod && (
                  <button onClick={initiatePayment} disabled={busy}
                    className="mt-3 w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50">
                    {busy ? "Processing…" : `Pay $${selectedPlan.price} →`}
                  </button>
                )}
              </div>
            )}

            {txId && paymentDetails && (
              <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold">Payment Instructions</h3>
                <p className="text-xs text-gray-600">{paymentDetails.instructions}</p>
                {paymentDetails.details && (
                  <div className="rounded-xl bg-gray-50 p-3 space-y-1 text-xs">
                    {Object.entries(paymentDetails.details).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-gray-500 capitalize">{k}:</span><span className="font-mono font-semibold">{String(v)}</span></div>
                    ))}
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500 block mb-1">Transaction Reference</label>
                  <input value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="Enter your payment reference" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                </div>
                <button onClick={confirmPayment} disabled={busy || !transactionRef.trim()} className="w-full h-11 rounded-full bg-emerald-500 text-white font-semibold text-sm shadow-md hover:bg-emerald-600 disabled:opacity-50">
                  {busy ? "Submitting…" : "Submit Payment →"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Activate Key */}
        {step === "activate" && (
          <div className="space-y-4">
            <div className="text-center py-6">
              <PartyPopper className="w-10 h-10 mx-auto text-amber-400" />
              <h2 className="mt-2 text-lg font-bold text-gray-900">Activate Your Study Buddy</h2>
              <p className="text-xs text-gray-500 mt-1">Enter your activation key to unlock premium features instantly.</p>
            </div>

            {activationResult ? (
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 p-6 text-center">
                <span className="text-5xl">{EMOJIS[activationResult.plan?.slug] ?? "🎉"}</span>
                <p className="mt-2 text-base font-bold text-emerald-700">{activationResult.celebration}</p>
                <p className="text-sm text-emerald-600 mt-1">{activationResult.plan?.name} · {activationResult.tokenBalance?.toLocaleString()} tokens</p>
                <p className="text-xs text-gray-400 mt-2">Redirecting to home…</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                <input value={activationKey} onChange={(e) => setActivationKey(e.target.value)} placeholder="SB-XXXX-XXXX-XXXX-XXXX" className="w-full p-3 rounded-xl border border-gray-200 text-sm font-mono text-center outline-none focus:border-indigo-400" />
                <button onClick={activateKey} disabled={busy || !activationKey.trim()} className="mt-3 w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50">
                  {busy ? "Activating…" : "Activate Key 🎉"}
                </button>
              </div>
            )}

            <p className="text-center text-[11px] text-gray-400">
              Don't have a key? Choose a plan above and make a payment.
              An admin will review and send your activation key.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
