"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Trash2, Pencil, Plus, Bot, Send } from "lucide-react";
import { Provider, ErrorBox, Spinner } from "./shared";
import { VisualApiEditor } from "../VisualApiEditor";

export function ProvidersTab() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ [id: string]: any }>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/providers");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setProviders(d.providers);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const testProvider = async (id: string) => {
    setTesting(id);
    setTestResult((r) => ({ ...r, [id]: null }));
    try {
      const r = await fetch(`/api/admin/providers/${id}/test`, { method: "POST" });
      const d = await r.json();
      setTestResult((r) => ({ ...r, [id]: d }));
    } catch (e: any) {
      setTestResult((r) => ({ ...r, [id]: { status: "error", error: e?.message } }));
    } finally {
      setTesting(null);
    }
  };

  const toggleEnabled = async (p: Provider) => {
    try {
      await fetch(`/api/admin/providers/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Toggle failed");
    }
  };

  const setDefault = async (p: Provider) => {
    try {
      await fetch(`/api/admin/providers/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    }
  };

  const deleteProvider = async (p: Provider) => {
    if (!confirm(`Delete provider "${p.name}"?`)) return;
    try {
      await fetch(`/api/admin/providers/${p.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  };

  if (loading) return <Spinner label="Loading providers…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-3">
      {/* NEW: Visual API editor (drag-and-drop Study Buddy ↔ API connections) */}
      <VisualApiEditor mode="admin" />

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          App AI calls use these in priority order. BYOK (user-set keys) always take precedence.
        </p>
        <button
          onClick={() => setAdding(true)}
          className="h-9 px-3 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> Add Provider
        </button>
      </div>

      {providers.length === 0 && (
        <div className="rounded-2xl bg-white border-2 border-dashed border-gray-200 p-6 text-center">
          <Bot className="w-8 h-8 mx-auto text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-900">No AI providers configured</p>
          <p className="mt-1 text-xs text-gray-500">
            The app currently falls back to the built-in GLM SDK (z-ai-web-dev-sdk).
            Add an OpenAI-compatible provider to route calls through it.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {providers.map((p) => {
          const result = testResult[p.id];
          return (
            <div key={p.id} className={`rounded-2xl bg-white border-2 p-3 shadow-sm ${p.isDefault ? "border-indigo-300" : "border-gray-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center ${p.enabled ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-400"}`}>
                    <Bot className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      {p.isDefault && (
                        <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Default</span>
                      )}
                      {!p.enabled && (
                        <span className="text-[9px] font-bold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">Disabled</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {p.providerType} · {p.model ?? "(no model)"} · priority {p.priority}
                    </p>
                    {p.apiKeyMasked && (
                      <p className="text-[10px] text-gray-400 font-mono">key: {p.apiKeyMasked}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditing(p)} className="w-7 h-7 rounded-full hover:bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => testProvider(p.id)}
                    disabled={testing === p.id}
                    className="h-7 px-2 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold flex items-center gap-1 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {testing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Test
                  </button>
                  <button onClick={() => deleteProvider(p)} className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => toggleEnabled(p)}
                  className={`px-2 py-1 rounded-full font-semibold ${p.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                >
                  {p.enabled ? "Enabled" : "Disabled"}
                </button>
                {!p.isDefault && (
                  <button
                    onClick={() => setDefault(p)}
                    className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold"
                  >
                    Set as default
                  </button>
                )}
              </div>
              {result && (
                <div className={`mt-2 p-2 rounded-xl text-xs ${result.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {result.status === "success" ? (
                    <span>✓ "{result.reply}" · {result.latencyMs}ms · model {result.model}</span>
                  ) : (
                    <div>
                      <div>✗ {result.error ?? "Failed"}</div>
                      {result.hint && (
                        <div className="mt-1 text-[10px] text-rose-600 bg-rose-100 rounded p-1.5">
                          💡 {result.hint}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(editing || adding) && (
        <ProviderFormModal
          provider={editing}
          onClose={() => { setEditing(null); setAdding(false); }}
          onSaved={async () => {
            setEditing(null);
            setAdding(false);
            await load();
          }}
        />
      )}
    </div>
  );
}



function ProviderFormModal(props: any): any { return null; }
