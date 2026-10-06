"use client";
import { useState, useMemo } from "react";

export function FinancialCalculator({ spec }: { spec: any }) {
  const [calcType, setCalcType] = useState<string>(spec?.calcType || "compound");
  const [principal, setPrincipal] = useState(spec?.principal?.toString() || "10000");
  const [rate, setRate] = useState(spec?.rate?.toString() || "12");
  const [periods, setPeriods] = useState(spec?.periods?.toString() || "5");
  const [cashFlows, setCashFlows] = useState(spec?.cashFlows?.join(", ") || "-10000, 3000, 4000, 4000, 5000");

  const result = useMemo(() => {
    const P = parseFloat(principal) || 0;
    const r = (parseFloat(rate) || 0) / 100;
    const n = parseFloat(periods) || 0;

    switch (calcType) {
      case "compound": {
        const amount = P * Math.pow(1 + r, n);
        const interest = amount - P;
        return { label: "Compound Interest", rows: [
          ["Principal", `KSh ${P.toLocaleString()}`],
          ["Rate", `${rate}% p.a.`],
          ["Periods", `${n} years`],
          ["Final Amount", `KSh ${amount.toFixed(2)}`],
          ["Interest Earned", `KSh ${interest.toFixed(2)}`],
        ]};
      }
      case "simple": {
        const interest = P * r * n;
        return { label: "Simple Interest", rows: [
          ["Principal", `KSh ${P.toLocaleString()}`],
          ["Rate", `${rate}% p.a.`],
          ["Periods", `${n} years`],
          ["Interest", `KSh ${interest.toFixed(2)}`],
          ["Total", `KSh ${(P + interest).toFixed(2)}`],
        ]};
      }
      case "npv": {
        const flows = cashFlows.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
        if (flows.length === 0) return null;
        const discountRate = r;
        let npv = 0;
        flows.forEach((cf, i) => {
          npv += cf / Math.pow(1 + discountRate, i);
        });
        return { label: "Net Present Value (NPV)", rows: [
          ["Discount Rate", `${rate}%`],
          ["Cash Flows", flows.map((f) => `KSh ${f.toLocaleString()}`).join(" → ")],
          ["NPV", `KSh ${npv.toFixed(2)}`],
          ["Decision", npv > 0 ? "✅ Accept (NPV > 0)" : "❌ Reject (NPV < 0)"],
        ]};
      }
      case "breakeven": {
        const fixedCost = P;
        const variableCost = parseFloat(spec?.variableCost || "5") || 5;
        const price = parseFloat(spec?.price || "15") || 15;
        const contribution = price - variableCost;
        const breakeven = contribution > 0 ? fixedCost / contribution : Infinity;
        return { label: "Break-even Analysis", rows: [
          ["Fixed Costs", `KSh ${fixedCost.toLocaleString()}`],
          ["Variable Cost/Unit", `KSh ${variableCost}`],
          ["Price/Unit", `KSh ${price}`],
          ["Contribution Margin", `KSh ${contribution.toFixed(2)}`],
          ["Break-even Units", `${Math.ceil(breakeven)} units`],
          ["Break-even Revenue", `KSh ${(breakeven * price).toFixed(2)}`],
        ]};
      }
      default:
        return null;
    }
  }, [calcType, principal, rate, periods, cashFlows, spec]);

  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-2 flex-wrap">
        {["compound", "simple", "npv", "breakeven"].map((t) => (
          <button
            key={t}
            onClick={() => setCalcType(t)}
            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${calcType === t ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}
          >
            {t === "npv" ? "NPV" : t === "breakeven" ? "Break-even" : t === "compound" ? "Compound" : "Simple"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(calcType === "compound" || calcType === "simple") && (
          <>
            <div>
              <label className="text-[9px] text-gray-400 uppercase">Principal (KSh)</label>
              <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="w-full p-2 rounded-lg border border-gray-200 text-xs" />
            </div>
            <div>
              <label className="text-[9px] text-gray-400 uppercase">Rate (%)</label>
              <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full p-2 rounded-lg border border-gray-200 text-xs" />
            </div>
            <div>
              <label className="text-[9px] text-gray-400 uppercase">Years</label>
              <input type="number" value={periods} onChange={(e) => setPeriods(e.target.value)} className="w-full p-2 rounded-lg border border-gray-200 text-xs" />
            </div>
          </>
        )}
        {calcType === "npv" && (
          <>
            <div className="col-span-1">
              <label className="text-[9px] text-gray-400 uppercase">Discount Rate (%)</label>
              <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full p-2 rounded-lg border border-gray-200 text-xs" />
            </div>
            <div className="col-span-2">
              <label className="text-[9px] text-gray-400 uppercase">Cash Flows (comma-separated, Year 0 first)</label>
              <input type="text" value={cashFlows} onChange={(e) => setCashFlows(e.target.value)} className="w-full p-2 rounded-lg border border-gray-200 text-xs font-mono" />
            </div>
          </>
        )}
      </div>

      {result && (
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-3">
          <p className="text-xs font-bold text-indigo-700 mb-2">{result.label}</p>
          <div className="space-y-1">
            {result.rows.map(([label, value]: any, i: number) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-gray-500">{label}:</span>
                <span className="font-semibold text-gray-800">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
