"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2, AlertCircle, CheckCircle2, Users, RefreshCw, Search,
} from "lucide-react";

type MigrateUser = {
  id: string;
  email: string | null;
  name: string | null;
  track: string | null;
  course: string | null;
  grade: string | null;
  createdAt: string;
  lastActive: string | null;
};

const TRACK_OPTIONS = [
  { value: "k12", label: "K-12 (CBC)" },
  { value: "secondary", label: "Secondary (8-4-4)" },
  { value: "university", label: "University" },
  { value: "college", label: "College / Tertiary" },
  { value: "tvet", label: "TVET (CDACC)" },
];

export function MigrateUsersTab() {
  const [users, setUsers] = useState<MigrateUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Record<string, { track: string; course: string; grade: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [availableCourses, setAvailableCourses] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/migrate-users");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setUsers(d.users || []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // Load courses from catalog for the most common track (university)
  useEffect(() => {
    import("@/lib/education/catalog").then(({ ALL_COURSES }) => {
      setAvailableCourses(ALL_COURSES.map(c => c.name));
    }).catch(() => {});
  }, []);

  const getEdit = (u: MigrateUser) => editing[u.id] || {
    track: u.track === "mixed" || ["dev","data","ml","aiapp","web","backend","server"].includes(u.track || "")
      ? "university" : (u.track || "university"),
    course: u.course || "",
    grade: u.grade || "",
  };

  const setEdit = (userId: string, field: string, value: string) => {
    setEditing(prev => ({ ...prev, [userId]: { ...getEdit(users.find(u => u.id === userId)!), [field]: value } }));
  };

  const saveOne = async (u: MigrateUser) => {
    const edit = getEdit(u);
    const isHigherEd = ["university", "college", "tvet"].includes(edit.track);
    if (isHigherEd && !edit.course) {
      setError(`Pick a course for ${u.email || u.id}`);
      return;
    }
    if (!isHigherEd && !edit.grade) {
      setError(`Pick a grade for ${u.email || u.id}`);
      return;
    }
    setSaving(u.id);
    setError(null);
    try {
      const r = await fetch("/api/admin/migrate-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{
            userId: u.id,
            track: edit.track,
            course: isHigherEd ? edit.course : undefined,
            grade: !isHigherEd ? edit.grade : undefined,
          }],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setSuccess(`✓ Updated ${u.email || u.id} → ${edit.track}${edit.course ? " / " + edit.course : edit.grade ? " / " + edit.grade : ""}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(null);
    }
  };

  const filtered = search.trim()
    ? users.filter(u => (u.email || "").toLowerCase().includes(search.toLowerCase()) || (u.name || "").toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" /> User Migration
        </h2>
        <button onClick={load} className="px-3 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
        <p className="font-semibold mb-1">Why this exists</p>
        <p>Users who registered before Phase 85.3 have legacy tracks (mixed/dev/data/ml) that show the wrong dashboard. This tool lets you fix their track + course so they get the right experience.</p>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> {success}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>
      )}

      {!loading && users.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
          <p className="text-sm">All users are up to date! No migration needed.</p>
        </div>
      )}

      {!loading && users.length > 0 && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email or name…"
              className="w-full h-10 rounded-full bg-white border border-gray-200 pl-10 pr-3 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          <div className="text-xs text-gray-500">
            Showing {filtered.length} of {users.length} users needing migration
          </div>

          <div className="space-y-3">
            {filtered.slice(0, 50).map((u) => {
              const edit = getEdit(u);
              const isHigherEd = ["university", "college", "tvet"].includes(edit.track);
              const isLegacyDev = ["dev", "data", "ml", "aiapp", "web", "backend", "server", "mixed"].includes(u.track || "");
              return (
                <div key={u.id} className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{u.name || u.email || "Unknown"}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          isLegacyDev ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          Current: {u.track || "—"}{u.course ? " / " + u.course : u.grade ? " / " + u.grade : ""}
                        </span>
                        {u.lastActive && <span className="text-[10px] text-gray-400">Last active: {new Date(u.lastActive).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">New track</label>
                      <select
                        value={edit.track}
                        onChange={(e) => setEdit(u.id, "track", e.target.value)}
                        className="w-full h-9 rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-indigo-400"
                      >
                        {TRACK_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {isHigherEd ? (
                      <div className="col-span-2">
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Course</label>
                        <select
                          value={edit.course}
                          onChange={(e) => setEdit(u.id, "course", e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-indigo-400"
                        >
                          <option value="">— Pick a course —</option>
                          {availableCourses.filter(c => c.toLowerCase().includes(edit.track === "tvet" ? " " : "")).slice(0, 100).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="col-span-2">
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Grade</label>
                        <select
                          value={edit.grade}
                          onChange={(e) => setEdit(u.id, "grade", e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-indigo-400"
                        >
                          <option value="">— Pick a grade —</option>
                          {(edit.track === "k12"
                            ? ["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"]
                            : ["Form 1","Form 2","Form 3","Form 4"]
                          ).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => saveOne(u)}
                    disabled={saving === u.id}
                    className="mt-2 w-full h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold"
                  >
                    {saving === u.id ? "Saving…" : "Update user"}
                  </button>
                </div>
              );
            })}
            {filtered.length > 50 && (
              <p className="text-xs text-gray-400 text-center">Showing first 50. Use search to find specific users.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
