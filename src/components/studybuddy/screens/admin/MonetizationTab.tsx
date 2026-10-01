"use client";

import { useEffect, useState, useCallback } from "react";
import { Spinner } from "./shared";

export function MonetizationTab() {
  const [subtab, setSubtab] = useState<"plans" | "keys" | "payments">("plans");
  const [plans, setPlans] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [genPlanId, setGenPlanId] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, k, t] = await Promise.all([
        fetch("/api/admin/plans").then(r => r.json()).catch(() => ({ plans: [] })),
        fetch("/api/admin/activation-keys").then(r => r.json()).catch(() => ({ keys: [] })),
        fetch("/api/admin/payments").then(r => r.json()).catch(() => ({ transactions: [] })),
      ]);
      setPlans(p.plans || []);
      setKeys(k.keys || []);
      setTxs(t.transactions || []);
      setGenPlanId((cur) => cur || p.plans?.[0]?.id || "");
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await load();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, [load]);

  const generateKey = async (planId: string) => {
    try {
      const r = await fetch("/api/admin/activation-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const d = await r.json();
      if (d.key) {
        alert(`New activation key: ${d.key.key}\nGive this to the user.`);
        await load();
      }
    } catch {}
  };

  const approvePayment = async (txId: string) => {
    try {
      const r = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", transactionId: txId }),
      });
      const d = await r.json();
      if (d.ok) {
        alert(`Payment approved! Key: ${d.key}`);
        await load();
      }
    } catch {}
  };

  const rejectPayment = async (txId: string) => {
    try {
      await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", transactionId: txId }),
      });
      await load();
    } catch {}
  };

  if (loading) return <Spinner label="Loading monetization…" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium">
        {[
          { key: "plans" as const, label: "Plans" },
          { key: "keys" as const, label: "Activation Keys" },
          { key: "payments" as const, label: "Payments" },
        ].map((t) => (
          <button key={t.key} onClick={() => setSubtab(t.key)}
            className={`py-1.5 rounded-lg transition ${subtab === t.key ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Plans subtab */}
      {subtab === "plans" && (
        <div className="space-y-2">
          {plans.map((p) => (
            <div key={p.id} className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-[11px] text-gray-500">
                  ${p.price} · {p.tokenLimit?.toLocaleString()} tokens · {p.dailyQuizLimit} quizzes/day
                </p>
              </div>
              <button onClick={() => generateKey(p.id)}
                className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100">
                + Generate Key
              </button>
            </div>
          ))}
          {plans.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No plans. Run scripts/seed-plans.ts</p>}
        </div>
      )}

      {/* Activation Keys subtab */}
      {subtab === "keys" && (
        <div className="space-y-2">
          {/* Quick generate */}
          <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm">
            <div className="flex gap-2">
              <select value={genPlanId} onChange={(e) => setGenPlanId(e.target.value)} className="flex-1 p-2 rounded-xl border border-gray-200 text-xs bg-white">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => generateKey(genPlanId)} className="px-4 h-9 rounded-xl bg-indigo-600 text-white text-xs font-semibold">
                Generate Key
              </button>
            </div>
          </div>

          {keys.map((k) => (
            <div key={k.id} className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono font-bold text-gray-900">{k.key}</p>
                  <p className="text-[10px] text-gray-500">
                    {k.plan?.name ?? "—"} · {k.user?.email ?? "unassigned"} · expires {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  k.status === "active" ? "bg-emerald-50 text-emerald-700" :
                  k.status === "used" ? "bg-gray-100 text-gray-500" :
                  "bg-rose-50 text-rose-700"
                }`}>
                  {k.status}
                </span>
              </div>
            </div>
          ))}
          {keys.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No activation keys yet.</p>}
        </div>
      )}

      {/* Payments subtab */}
      {subtab === "payments" && (
        <div className="space-y-2">
          {txs.map((t) => (
            <div key={t.id} className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-900">
                    {t.user?.email ?? "—"} · ${t.amount} · {t.paymentMethod}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Ref: {t.transactionRef ?? "—"} · {t.plan?.name ?? "—"} · {new Date(t.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {t.status === "pending" && (
                    <>
                      <button onClick={() => approvePayment(t.id)}
                        className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold hover:bg-emerald-100">
                        Approve & Gen Key
                      </button>
                      <button onClick={() => rejectPayment(t.id)}
                        className="px-2 py-1 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold hover:bg-rose-100">
                        Reject
                      </button>
                    </>
                  )}
                  {t.status !== "pending" && (
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      t.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}>{t.status}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {txs.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No payment transactions yet.</p>}
        </div>
      )}
    </div>
  );
}


