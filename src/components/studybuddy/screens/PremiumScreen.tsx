"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft, Loader2, AlertCircle, Check, Sparkles, Lock, PartyPopper,
  Crown, Zap, Shield, Infinity as InfinityIcon, Key, Copy, CheckCircle2,
  Smartphone, Bitcoin, Building2, Wallet, Gift, Star, Brain, Bot, Rocket,
} from "lucide-react";
import { useApp } from "../store";

type Plan = {
  id: string; name: string; slug: string; price: number; currency: string;
  tokenLimit: number; dailyQuizLimit: number; dailyFlashcardGenLimit: number;
  features: any;
};

type PaymentMethod = {
  method: string; label: string; icon: string;
  instructions: string; details: Record<string, string>;
};

const DEFAULT_PAYMENTS: PaymentMethod[] = [
  {
    method: "mpesa", label: "M-Pesa", icon: "📱",
    instructions: "Send money via M-Pesa to the paybill below. Use your phone number as the account number.",
    details: { Paybill: "4040404", Account: "Your Phone Number", Amount: "As per plan" },
  },
  {
    method: "binance", label: "Crypto / Binance", icon: "₿",
    instructions: "Send USDT (BEP20) to the address below. Include your email in the memo.",
    details: { Network: "BEP20 (BSC)", Address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEe1", Memo: "Your email" },
  },
  {
    method: "bank", label: "Bank Transfer", icon: "🏦",
    instructions: "Transfer to the bank account below. Reference: StudyBuddy + your email.",
    details: { Bank: "Equity Bank Kenya", Account: "0123456789", Name: "StudyBuddy AI Ltd", Branch: "Westlands" },
  },
  {
    method: "paypal", label: "PayPal", icon: "💙",
    instructions: "Send payment via PayPal to the email below. Add your StudyBuddy email in notes.",
    details: { Email: "payments@studybuddy.ai", Note: "Your StudyBuddy email" },
  },
];

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "🌱 1,000 tokens / month",
    "5 quizzes per day",
    "3 flashcard generations per day",
    "Basic AI tutor access",
    "Community support",
  ],
  plus: [
    "⚡ 10,000 tokens / month",
    "50 quizzes per day",
    "20 flashcard generations per day",
    "All AI Study Buddies",
    "Priority response speed",
    "Graph & drawing tools",
    "Email support",
  ],
  pro: [
    "🚀 50,000 tokens / month",
    "Unlimited quizzes",
    "50 flashcard generations per day",
    "All Study Buddies + premium models",
    "Code execution (Python + JS)",
    "Advanced graphing & simulations",
    "Exam generation + printables",
    "Priority email support",
  ],
  king: [
    "👑 200,000 tokens / month",
    "Everything in Pro",
    "Unlimited flashcard generations",
    "AI image generation",
    "Voice mode (TTS + ASR)",
    "Concept maps & learning paths",
    "Study group creation",
    "1-on-1 priority support",
  ],
  ultra: [
    "💎 1,000,000 tokens / month",
    "Everything in King",
    "Custom AI model training",
    "White-label classroom",
    "API access for integrations",
    "Dedicated AI instance",
    "Custom curriculum design",
    "Phone + WhatsApp support",
  ],
};

const PLAN_GRADIENTS: Record<string, string> = {
  free: "from-gray-600 to-gray-800",
  plus: "from-blue-500 to-indigo-600",
  pro: "from-indigo-500 via-violet-500 to-purple-600",
  king: "from-amber-400 via-orange-500 to-red-500",
  ultra: "from-violet-500 via-purple-500 to-fuchsia-600",
};

const PLAN_ICONS: Record<string, any> = {
  free: Sparkles, plus: Zap, pro: Rocket, king: Crown, ultra: Brain,
};

function generatePlanIcon(slug: string, name: string): string {
  const prompts: Record<string, string> = {
    free: "free%20seedling%20plant%20growing%20icon%20flat%20design%20gradient%20green",
    plus: "lightning%20bolt%20energy%20power%20icon%20flat%20design%20gradient%20blue",
    pro: "rocket%20launch%20space%20icon%20flat%20design%20gradient%20purple",
    king: "golden%20crown%20royal%20icon%20flat%20design%20gradient%20orange",
    ultra: "diamond%20gem%20crystal%20icon%20flat%20design%20gradient%20violet",
  };
  const prompt = prompts[slug] ?? `${name}%20icon%20flat%20design%20gradient`;
  return `https://image.pollinations.ai/prompt/${prompt}?width=64&height=64&nologo=true&seed=${slug}`;
}

export function PremiumScreen() {
  const { setScreen } = useApp();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [step, setStep] = useState<"plans" | "payment" | "activate">("plans");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENTS);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [txId, setTxId] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [transactionRef, setTransactionRef] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [activationResult, setActivationResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [plansRes, payRes] = await Promise.all([
          fetch("/api/plans"),
          fetch("/api/payment-settings").catch(() => null),
        ]);
        if (plansRes.ok) {
          const d = await plansRes.json();
          setPlans(d.plans);
        }
        if (payRes && payRes.ok) {
          const d = await payRes.json();
          const methods = (d.settings || []).filter((s: any) => s.enabled);
          if (methods.length > 0) {
            setPaymentMethods(methods.map((s: any) => ({
              method: s.method, label: s.label,
              icon: s.method === "mpesa" ? "📱" : s.method === "binance" || s.method === "crypto" ? "₿" : s.method === "bank" ? "🏦" : "💳",
              instructions: s.instructions || "Send payment via " + s.label,
              details: (s.details as Record<string, string>) || {},
            })));
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const startPayment = (plan: Plan) => {
    if (plan.price === 0) return;
    setSelectedPlan(plan);
    setStep("payment");
    setError(null);
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
      setSuccess("Payment submitted! An admin will review and send your activation key.");
      setStep("activate");
      setTxId(null);
      setPaymentDetails(null);
      setTransactionRef("");
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
      setTimeout(() => setScreen("home"), 4000);
    } catch (e: any) {
      setError(e?.message ?? "Activation failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-2">
          <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Crown className="w-5 h-5 text-amber-400" />
          <h1 className="text-base font-bold text-white">Plans & Premium</h1>
          <div className="ml-auto flex gap-1">
            <button onClick={() => setStep("plans")} className={`px-3 py-1 rounded-full text-[10px] font-semibold transition ${step === "plans" ? "bg-indigo-600 text-white" : "bg-white/5 text-white/50"}`}>Plans</button>
            <button onClick={() => setStep("activate")} className={`px-3 py-1 rounded-full text-[10px] font-semibold transition flex items-center gap-1 ${step === "activate" ? "bg-indigo-600 text-white" : "bg-white/5 text-white/50"}`}>
              <Key className="w-3 h-3" /> Activate
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
            <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* PLANS */}
        {step === "plans" && (
          <div>
            {/* Hero */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-white/70">Unlock your full learning potential</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Choose your plan</h2>
              <p className="text-sm text-white/50 mt-1">Pay via M-Pesa, Crypto, Bank, or PayPal. Get instant access with activation keys.</p>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((p) => {
                const isFree = p.price === 0;
                const features = PLAN_FEATURES[p.slug] ?? [];
                const gradient = PLAN_GRADIENTS[p.slug] ?? PLAN_GRADIENTS.free;
                const Icon = PLAN_ICONS[p.slug] ?? Bot;
                const iconUrl = generatePlanIcon(p.slug, p.name);
                const isPopular = p.slug === "pro";

                return (
                  <div
                    key={p.id}
                    className={`relative rounded-3xl overflow-hidden border transition ${
                      isPopular ? "border-indigo-500/50 shadow-2xl shadow-indigo-500/20" : "border-white/10"
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute top-0 right-0 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[9px] font-bold px-3 py-1 rounded-bl-2xl uppercase tracking-wide">
                        ⭐ Most Popular
                      </div>
                    )}

                    {/* Gradient header */}
                    <div className={`bg-gradient-to-br ${gradient} p-5`}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center overflow-hidden">
                          <img src={iconUrl} alt={p.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <Icon className="w-6 h-6 text-white absolute" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">{p.name}</h3>
                          <p className="text-xs text-white/70">{p.tokenLimit.toLocaleString()} tokens/month</p>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">${p.price}</span>
                        {p.price > 0 && <span className="text-xs text-white/60">/month</span>}
                      </div>
                    </div>

                    {/* Features list */}
                    <div className="p-5 bg-slate-900">
                      <ul className="space-y-2">
                        {features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                            <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => isFree ? setScreen("home") : startPayment(p)}
                        className={`mt-5 w-full h-11 rounded-full text-sm font-bold transition flex items-center justify-center gap-1.5 ${
                          isFree
                            ? "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                            : `bg-gradient-to-r ${gradient} text-white shadow-lg hover:scale-[1.02]`
                        }`}
                      >
                        {isFree ? (
                          <><Gift className="w-4 h-4" /> Current Plan</>
                        ) : (
                          <><Zap className="w-4 h-4" /> Get {p.name}</>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trust badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[10px] text-white/30">
              <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure payments</span>
              <span className="flex items-center gap-1"><Key className="w-3 h-3" /> Instant activation keys</span>
              <span className="flex items-center gap-1"><InfinityIcon className="w-3 h-3" /> Cancel anytime</span>
              <span className="flex items-center gap-1"><Star className="w-3 h-3" /> 7-day money-back guarantee</span>
            </div>
          </div>
        )}

        {/* PAYMENT */}
        {step === "payment" && selectedPlan && (
          <div className="max-w-md mx-auto">
            <button onClick={() => setStep("plans")} className="text-xs text-white/40 flex items-center gap-1 mb-4 hover:text-white/60">
              <ChevronLeft className="w-3 h-3" /> Back to plans
            </button>

            {/* Plan summary */}
            <div className={`rounded-3xl bg-gradient-to-br ${PLAN_GRADIENTS[selectedPlan.slug] ?? PLAN_GRADIENTS.free} p-5 text-white text-center mb-4`}>
              <span className="text-4xl mb-1">{PLAN_ICONS[selectedPlan.slug] ? (() => { const PIcon = PLAN_ICONS[selectedPlan.slug]; return <PIcon className="w-10 h-10 mx-auto" />; })() : "🤖"}</span>
              <h2 className="text-lg font-bold">{selectedPlan.name}</h2>
              <p className="text-sm opacity-80">${selectedPlan.price}/month · {selectedPlan.tokenLimit.toLocaleString()} tokens</p>
            </div>

            {/* Payment methods */}
            {!txId && (
              <div className="rounded-3xl bg-white/5 border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4" /> Select payment method
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((pm) => (
                    <button
                      key={pm.method}
                      onClick={() => setSelectedMethod(pm.method)}
                      className={`p-3 rounded-2xl border text-left transition ${
                        selectedMethod === pm.method
                          ? "border-indigo-500 bg-indigo-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="text-2xl mb-1">{pm.icon}</div>
                      <div className="text-xs font-semibold text-white">{pm.label}</div>
                    </button>
                  ))}
                </div>
                {selectedMethod && (
                  <button
                    onClick={initiatePayment}
                    disabled={busy}
                    className="mt-4 w-full h-12 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold text-sm shadow-lg hover:scale-[1.02] transition disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Continue to Payment →`}
                  </button>
                )}
              </div>
            )}

            {/* Payment instructions */}
            {txId && paymentDetails && (
              <div className="rounded-3xl bg-white/5 border border-white/10 p-5 space-y-4">
                <div className="text-center">
                  <div className="text-3xl mb-1">{paymentMethods.find(pm => pm.method === selectedMethod)?.icon}</div>
                  <h3 className="text-sm font-semibold text-white">{paymentMethods.find(pm => pm.method === selectedMethod)?.label}</h3>
                </div>

                <p className="text-xs text-white/60 text-center">{paymentMethods.find(pm => pm.method === selectedMethod)?.instructions || paymentDetails.instructions}</p>

                {/* Payment details */}
                <div className="rounded-2xl bg-black/20 p-4 space-y-2">
                  {Object.entries(paymentMethods.find(pm => pm.method === selectedMethod)?.details || paymentDetails.details || {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-white/40 capitalize">{k}:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-white">{String(v)}</span>
                        <button
                          onClick={() => copyToClipboard(String(v), k)}
                          className="text-white/30 hover:text-white"
                        >
                          {copied === k ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Transaction ref input */}
                <div>
                  <label className="text-xs font-semibold uppercase text-white/40 block mb-1.5">Payment reference (M-Pesa code / TX hash)</label>
                  <input
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="e.g. SBX9XK4LMP"
                    className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-mono outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  onClick={confirmPayment}
                  disabled={busy || !transactionRef.trim()}
                  className="w-full h-12 rounded-full bg-emerald-500 text-white font-bold text-sm shadow-lg hover:bg-emerald-600 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Submit Payment ✓"}
                </button>

                <p className="text-[10px] text-white/30 text-center">
                  Your payment will be reviewed by an admin. You'll receive an activation key once confirmed.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ACTIVATION KEY */}
        {step === "activate" && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-3 shadow-lg">
                <Key className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Activate Your Plan</h2>
              <p className="text-sm text-white/50 mt-1">Enter your activation key to unlock premium features instantly.</p>
            </div>

            {activationResult ? (
              <div className="rounded-3xl bg-gradient-to-br from-emerald-500/20 to-green-500/10 border-2 border-emerald-500/40 p-8 text-center">
                <PartyPopper className="w-12 h-12 mx-auto text-emerald-400" />
                <p className="mt-3 text-lg font-bold text-emerald-300">{activationResult.celebration}</p>
                <p className="text-sm text-emerald-200 mt-1">{activationResult.plan?.name}</p>
                <p className="text-xs text-white/40 mt-2">{activationResult.tokenBalance?.toLocaleString()} tokens added</p>
                <p className="text-[10px] text-white/30 mt-3">Redirecting to home…</p>
              </div>
            ) : (
              <div className="rounded-3xl bg-white/5 border border-white/10 p-6">
                <input
                  value={activationKey}
                  onChange={(e) => setActivationKey(e.target.value)}
                  placeholder="SB-XXXX-XXXX-XXXX-XXXX"
                  className="w-full p-4 rounded-2xl bg-black/20 border border-white/10 text-white text-sm font-mono text-center outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  onKeyDown={(e) => e.key === "Enter" && activateKey()}
                />
                <button
                  onClick={activateKey}
                  disabled={busy || !activationKey.trim()}
                  className="mt-4 w-full h-12 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold text-sm shadow-lg hover:scale-[1.02] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Activate Key</>}
                </button>
              </div>
            )}

            <div className="mt-6 p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
              <p className="text-xs text-white/40">
                Don't have a key? Choose a plan and make a payment above.
                An admin will review and send your activation key.
              </p>
              <button onClick={() => setStep("plans")} className="mt-2 text-xs text-indigo-400 font-semibold hover:text-indigo-300">
                View plans →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
