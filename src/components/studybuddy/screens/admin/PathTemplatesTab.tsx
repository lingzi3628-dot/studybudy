"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Trash2, Plus, Check, Route } from "lucide-react";
import { Field, Spinner } from "./shared";

export function PathTemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState("beginner");
  const [goal, setGoal] = useState("");
  const [subject, setSubject] = useState("");
  const [isPublished, setIsPublished] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/learning-path-templates");
      const d = await r.json();
      if (r.ok) setTemplates(d.templates ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!skill.trim()) { setError("Skill required"); return; }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch("/api/admin/learning-path-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: skill.trim(), level, goal: goal.trim() || null, subject: subject.trim() || null, isPublished }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Create failed");
      setSuccess("Template created ✓");
      setSkill(""); setGoal(""); setSubject("");
      setTimeout(() => setSuccess(null), 4000);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (t: any) => {
    try {
      await fetch(`/api/admin/learning-path-templates/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !t.isPublished }),
      });
      await load();
    } catch {}
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      await fetch(`/api/admin/learning-path-templates/${id}`, { method: "DELETE" });
      await load();
    } catch {}
  };

  if (loading) return <Spinner label="Loading templates…" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 p-4">
        <div className="flex items-center gap-2">
          <Route className="w-5 h-5 text-indigo-600" />
          <h2 className="text-sm font-bold text-gray-900">Learning Path Templates</h2>
        </div>
        <p className="mt-1 text-xs text-gray-600">Templates are pre-built paths users can clone.</p>
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
          <Plus className="w-4 h-4 text-indigo-500" /> New Template
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Skill">
            <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="e.g. Calculus" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </Field>
          <Field label="Level">
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </Field>
          <Field label="Subject (optional)">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Math, Science…" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </Field>
          <Field label="Goal (optional)">
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Pass AP exam" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="w-4 h-4 rounded text-indigo-600" />
          <span>Published (visible to users in their Templates list)</span>
        </label>
        <button onClick={create} disabled={busy || !skill.trim()} className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {busy ? "Creating…" : "Create Template"}
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">All Templates ({templates.length})</h3>
        {templates.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No templates yet.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{t.skill}</p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {t.level} · {t._count?.modules ?? 0} modules
                      {t.subject ? ` · ${t.subject}` : ""}
                      {t.isPublished ? " · ✓ published" : " · unpublished"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => togglePublish(t)} className={`text-[10px] font-semibold px-2 py-1 rounded-full ${t.isPublished ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                      {t.isPublished ? "Unpublish" : "Publish"}
                    </button>
                    <button onClick={() => remove(t.id)} className="w-7 h-7 rounded-full hover:bg-rose-50 flex items-center justify-center text-rose-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


