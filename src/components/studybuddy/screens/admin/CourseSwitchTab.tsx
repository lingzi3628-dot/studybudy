"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2, AlertCircle, Check, X, Clock, User, GraduationCap, RefreshCw,
} from "lucide-react";

type SwitchRequest = {
  id: string;
  userId: string;
  fromTrack: string;
  fromCourse: string | null;
  toTrack: string;
  toCourse: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    track: string | null;
    grade: string | null;
    course: string | null;
    phoneNumber: string | null;
  };
};

export function CourseSwitchTab() {
  const [requests, setRequests] = useState<SwitchRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [note, setNote] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/course-switch?status=${filter}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setRequests(d.requests || []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t); } }, [success]);

  const act = async (id: string, action: "approve" | "reject") => {
    setActioningId(id);
    setError(null);
    try {
      const r = await fetch(`/api/admin/course-switch/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Failed to ${action}`);
      setSuccess(`✓ Request ${action}d — user's course has been ${action === "approve" ? "updated" : "kept the same"}.`);
      setNote("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? `Failed to ${action}`);
    } finally {
      setActioningId(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-600" /> Course Switch Requests
        </h2>
        <button onClick={load} className="px-3 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-start gap-2">
          <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> {success}
        </div>
      )}

      <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-700">
        <p className="font-semibold mb-1">How course switching works</p>
        <p>University / college / TVET users can request a course change from their Profile settings. The request appears here for admin review. On approval, the user&apos;s course is updated automatically — they will see Explore projects for the new course on their next sign-in.</p>
        <p className="mt-1 text-indigo-600">K-12 and secondary students don&apos;t need approval — they can switch grades freely.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(["pending", "approved", "rejected", "all"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === s ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}
          >
            {s === "pending" ? `⏳ Pending${pendingCount > 0 && s === filter ? ` (${pendingCount})` : ""}` : s === "approved" ? "✓ Approved" : s === "rejected" ? "✗ Rejected" : "All"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>
      )}

      {!loading && requests.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No {filter === "all" ? "" : filter} requests.</p>
        </div>
      )}

      {!loading && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{r.user.name || r.user.email || "Unknown"}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      r.status === "pending" ? "bg-amber-100 text-amber-700" :
                      r.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                      "bg-rose-100 text-rose-700"
                    }`}>{r.status.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-gray-500">{r.user.email || "—"} · {r.user.phoneNumber || "no phone"}</p>
                  <div className="mt-2 text-xs space-y-1">
                    <p><span className="text-gray-500">From:</span> <span className="font-medium text-gray-700">{r.fromCourse || "—"}</span></p>
                    <p><span className="text-gray-500">To:</span> <span className="font-medium text-indigo-700">{r.toCourse}</span></p>
                    <p><span className="text-gray-500">Submitted:</span> {new Date(r.createdAt).toLocaleString()}</p>
                    {r.reviewedAt && <p><span className="text-gray-500">Reviewed:</span> {new Date(r.reviewedAt).toLocaleString()}</p>}
                    {r.adminNote && <p><span className="text-gray-500">Admin note:</span> {r.adminNote}</p>}
                  </div>
                </div>
              </div>

              {r.status === "pending" && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <input
                    type="text"
                    placeholder="Optional note (visible in audit log)…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full h-9 rounded-lg border border-gray-200 px-3 text-xs outline-none focus:border-indigo-400 mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(r.id, "approve")}
                      disabled={actioningId === r.id}
                      className="flex-1 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve &amp; Switch
                    </button>
                    <button
                      onClick={() => act(r.id, "reject")}
                      disabled={actioningId === r.id}
                      className="flex-1 h-9 rounded-lg bg-rose-100 hover:bg-rose-200 disabled:opacity-50 text-rose-700 text-xs font-semibold flex items-center justify-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
