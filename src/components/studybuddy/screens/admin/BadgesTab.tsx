"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Loader2, AlertCircle, Trash2, Plus, Check, Trophy, Users as UsersIcon } from "lucide-react";
import { Field, Spinner } from "./shared";

export function BadgesTab() {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🏅");
  const [criteriaType, setCriteriaType] = useState("xp");
  const [criteriaAmount, setCriteriaAmount] = useState("100");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/badges");
      const d = await r.json();
      if (r.ok) setBadges(d.badges ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim() || !slug.trim()) { setError("Name and slug required"); return; }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const criteria: any = { type: criteriaType };
      if (criteriaType === "xp" || criteriaType === "ai_chat") criteria.amount = Number(criteriaAmount) || 0;
      if (criteriaType === "streak") criteria.days = Number(criteriaAmount) || 0;

      const r = await fetch("/api/admin/badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), description: description.trim() || null, icon: icon.trim(), criteria }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Create failed");
      setSuccess(`Badge "${name}" created ✓`);
      setName(""); setSlug(""); setDescription(""); setIcon("🏅"); setCriteriaAmount("100");
      setTimeout(() => setSuccess(null), 3000);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this badge? Users who earned it will lose it.")) return;
    try {
      await fetch(`/api/admin/badges/${id}`, { method: "DELETE" });
      await load();
    } catch {}
  };

  if (loading) return <Spinner label="Loading badges…" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-600" />
          <h2 className="text-sm font-bold text-gray-900">Badges</h2>
        </div>
        <p className="mt-1 text-xs text-gray-600">Badges auto-award when users hit criteria (XP, streak, first action). 15 default badges were seeded on Phase 12 install.</p>
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

      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-amber-500" /> New Badge
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Quiz Master" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-amber-400" />
          </Field>
          <Field label="Slug (unique)">
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="quiz_master" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:border-amber-400" />
          </Field>
          <Field label="Icon (emoji)">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="w-full p-2.5 rounded-xl border border-gray-200 text-2xl text-center outline-none focus:border-amber-400" />
          </Field>
          <Field label="Criteria type">
            <select value={criteriaType} onChange={(e) => setCriteriaType(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white">
              <option value="xp">XP threshold</option>
              <option value="streak">Streak days</option>
              <option value="first_item">First item completed</option>
              <option value="first_quiz">First quiz</option>
              <option value="first_flashcards">First flashcards</option>
              <option value="first_concept_map">First concept map</option>
              <option value="first_lesson">First lesson</option>
              <option value="first_path">First full path</option>
              <option value="perfect_quiz">Perfect quiz (100%)</option>
              <option value="first_daily_review">First daily review</option>
              <option value="ai_chat">AI chat count</option>
            </select>
          </Field>
        </div>
        {(criteriaType === "xp" || criteriaType === "streak" || criteriaType === "ai_chat") && (
          <Field label={criteriaType === "streak" ? "Days required" : criteriaType === "ai_chat" ? "Chat count" : "XP amount"}>
            <input type="number" value={criteriaAmount} onChange={(e) => setCriteriaAmount(e.target.value)} min={1} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-amber-400" />
          </Field>
        )}
        <Field label="Description (optional)">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Awarded when…" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-amber-400" />
        </Field>
        <button onClick={create} disabled={busy || !name.trim() || !slug.trim()} className="w-full h-11 rounded-full bg-amber-600 text-white font-semibold text-sm shadow-md hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {busy ? "Creating…" : "Create Badge"}
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">All Badges ({badges.length})</h3>
        {badges.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No badges yet. Run scripts/seed-badges.ts.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {badges.map((b) => (
              <div key={b.id} className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{b.icon}</span>
                  <button onClick={() => remove(b.id)} className="w-7 h-7 rounded-full hover:bg-rose-50 flex items-center justify-center text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="mt-1 font-semibold text-gray-900">{b.name}</p>
                <p className="text-[10px] text-gray-500 truncate">{b.description ?? "—"}</p>
                <p className="text-[9px] text-gray-400 mt-1">Earned by {b._count?.userBadges ?? 0} users</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


