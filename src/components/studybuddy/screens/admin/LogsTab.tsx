"use client";

import { useEffect, useState } from "react";
import { Spinner, AiLog, AdminActionLog } from "./shared";

export function LogsTab() {
  const [subtab, setSubtab] = useState<"ai" | "actions">("ai");
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [actionLogs, setActionLogs] = useState<AdminActionLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/admin/logs/ai?limit=50").then((r) => r.json()),
        fetch("/api/admin/logs/actions?limit=50").then((r) => r.json()),
      ]);
      setAiLogs(a.logs);
      setActionLogs(b.logs);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <Spinner label="Loading logs…" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium">
        {[
          { key: "ai" as const, label: "AI Calls" },
          { key: "actions" as const, label: "Admin Actions" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setSubtab(t.key)}
            className={`py-1.5 rounded-lg transition ${subtab === t.key ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subtab === "ai" && (
        <div className="space-y-1.5">
          {aiLogs.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No AI calls logged yet.</p>}
          {aiLogs.map((l) => (
            <div key={l.id} className={`rounded-xl p-2.5 text-xs border ${l.status === "success" ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  {l.providerType ?? "—"} · {l.model ?? "—"}
                </span>
                <span className={`text-[10px] font-bold uppercase ${l.status === "success" ? "text-emerald-700" : "text-rose-700"}`}>
                  {l.status}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {l.user?.email ?? "system"} · {l.totalTokens ?? 0} tokens · ${l.cost.toFixed(4)} · {l.route ?? ""}
              </p>
              {l.errorMessage && <p className="text-[10px] text-rose-600 mt-0.5 truncate">{l.errorMessage}</p>}
              <p className="text-[10px] text-gray-400 mt-0.5">{new Date(l.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {subtab === "actions" && (
        <div className="space-y-1.5">
          {actionLogs.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No admin actions logged yet.</p>}
          {actionLogs.map((l) => (
            <div key={l.id} className="rounded-xl bg-white border border-gray-200 p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{l.action}</span>
                <span className="text-[10px] text-gray-400">{new Date(l.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                by {l.adminUser?.email ?? "—"}
              </p>
              {l.details && (
                <pre className="text-[10px] text-gray-400 mt-1 bg-gray-50 p-1 rounded overflow-x-auto">
                  {JSON.stringify(l.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


