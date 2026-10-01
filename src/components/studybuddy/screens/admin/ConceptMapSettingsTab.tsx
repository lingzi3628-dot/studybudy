"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Trash2, Check, Sparkles, Zap, Map as MapIcon, Settings } from "lucide-react";
import { Field, Spinner } from "./shared";

export function ConceptMapSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // settings form
  const [enabled, setEnabled] = useState(true);
  const [tokenCost, setTokenCost] = useState(300);
  const [freeDailyLimit, setFreeDailyLimit] = useState(1);

  // maps list
  const [maps, setMaps] = useState<any[]>([]);
  const [topicsToGenerate, setTopicsToGenerate] = useState("photosynthesis, world war 2, fractions, cell biology, noun phrases");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        fetch("/api/admin/concept-map-settings").then(r => r.json()).catch(() => ({})),
        fetch("/api/admin/concept-maps").then(r => r.json()).catch(() => ({ maps: [] })),
      ]);
      setEnabled(s.enabled ?? true);
      setTokenCost(s.tokenCost ?? 300);
      setFreeDailyLimit(s.freeDailyLimit ?? 1);
      setMaps(m.maps ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch("/api/admin/concept-map-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, tokenCost: Number(tokenCost), freeDailyLimit: Number(freeDailyLimit) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Save failed");
      setSuccess("Settings saved ✓");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const preGenerate = async () => {
    const topics = topicsToGenerate
      .split(/[\n,]+/)
      .map(t => t.trim())
      .filter(Boolean);
    if (topics.length === 0) {
      setError("Enter at least one topic");
      return;
    }
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch("/api/admin/concept-maps/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Generate failed");
      const ok = (d.results || []).filter((x: any) => x.status === "ok").length;
      const skipped = (d.results || []).filter((x: any) => x.status === "skipped").length;
      const failed = (d.results || []).filter((x: any) => x.status === "error").length;
      setSuccess(`Generated ${ok}, skipped ${skipped}, failed ${failed}`);
      setTimeout(() => setSuccess(null), 4000);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

  const deleteMap = async (id: string) => {
    if (!confirm("Delete this concept map?")) return;
    try {
      await fetch(`/api/admin/concept-maps/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  };

  if (loading) return <Spinner label="Loading concept map settings…" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-fuchsia-50 to-violet-50 border border-fuchsia-200 p-4">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-fuchsia-600" />
          <h2 className="text-sm font-bold text-gray-900">Concept Map Settings</h2>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Manage AI-powered concept map generation. Maps cost tokens to generate;
          public maps (admin pre-generated) are free for any user to view.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}

      {/* Toggles + costs */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-500" /> Generation Settings
        </h3>
        <label className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-gray-900">Enable concept map generation</p>
            <p className="text-[10px] text-gray-500">When disabled, users see "concept maps are disabled" message</p>
          </div>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 rounded text-fuchsia-600 focus:ring-fuchsia-500" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Token cost per map">
            <input type="number" min={0} value={tokenCost} onChange={(e) => setTokenCost(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100" />
          </Field>
          <Field label="Free daily limit">
            <input type="number" min={0} value={freeDailyLimit} onChange={(e) => setFreeDailyLimit(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100" />
          </Field>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full h-11 rounded-full bg-fuchsia-600 text-white font-semibold text-sm shadow-md hover:bg-fuchsia-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      {/* Pre-generate public maps */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-fuchsia-500" /> Pre-generate public maps
        </h3>
        <p className="text-[11px] text-gray-500">
          Pre-generate concept maps for common topics. These are stored as public, user_id=null,
          and any logged-in user can view them for free. Existing public maps with the same title are skipped.
        </p>
        <Field label="Topics (comma or newline separated, max 20 per batch)">
          <textarea
            value={topicsToGenerate}
            onChange={(e) => setTopicsToGenerate(e.target.value)}
            rows={3}
            placeholder="photosynthesis, world war 2, fractions…"
            className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100 resize-none"
          />
        </Field>
        <button
          onClick={preGenerate}
          disabled={generating}
          className="w-full h-11 rounded-full bg-violet-600 text-white font-semibold text-sm shadow-md hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "Generating…" : "Pre-generate Maps"}
        </button>
      </div>

      {/* Maps list */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <MapIcon className="w-4 h-4 text-fuchsia-500" /> All Concept Maps ({maps.length})
        </h3>
        {maps.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No concept maps yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {maps.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 p-2.5 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{m.title}</p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {m.isPublic ? "🌐 Public" : `👤 ${m.user?.email ?? "Private"}`}
                    {m.topic?.name ? ` · ${m.topic.name}` : ""}
                    {" · " + new Date(m.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={`/api/concept-maps/${m.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-indigo-600 hover:underline px-2"
                  >
                    View
                  </a>
                  <button
                    onClick={() => deleteMap(m.id)}
                    className="w-7 h-7 rounded-full hover:bg-rose-50 flex items-center justify-center text-rose-600"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


