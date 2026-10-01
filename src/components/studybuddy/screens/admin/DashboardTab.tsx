"use client";

import { useEffect, useState } from "react";
import { X, UsersIcon, Shield, Bot, BookOpen, FileText, DollarSign, Sparkles, Zap } from "lucide-react";
import { Stats, AdminUser, Book, ErrorBox, Spinner } from "./shared";

export function DashboardTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/stats");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        setStats(d.stats);
        setRecent(d.recentSignups);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load stats");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner label="Loading stats…" />;
  if (error || !stats) return <ErrorBox message={error ?? "No data"} />;

  const cards: { label: string; value: string | number; icon: any; color: string }[] = [
    { label: "Total users", value: stats.totalUsers, icon: UsersIcon, color: "bg-indigo-50 text-indigo-600" },
    { label: "Active (24h)", value: stats.activeUsers, icon: Zap, color: "bg-emerald-50 text-emerald-600" },
    { label: "Pro users", value: stats.proUsers, icon: Shield, color: "bg-amber-50 text-amber-600" },
    { label: "Banned", value: stats.bannedUsers, icon: X, color: "bg-rose-50 text-rose-600" },
    { label: "Study sets", value: stats.totalStudySets, icon: BookOpen, color: "bg-violet-50 text-violet-600" },
    { label: "Cards", value: stats.totalCards, icon: FileText, color: "bg-sky-50 text-sky-600" },
    { label: "Topics", value: stats.totalTopics, icon: Sparkles, color: "bg-teal-50 text-teal-600" },
    { label: "Books", value: stats.totalBooks, icon: BookOpen, color: "bg-fuchsia-50 text-fuchsia-600" },
  ];

  return (
    <div className="space-y-4">
      {/* stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center ${c.color}`}>
                <Icon className="w-4 h-4" />
              </span>
              <p className="mt-2 text-xl font-bold text-gray-900">{c.value}</p>
              <p className="text-[11px] text-gray-500">{c.label}</p>
            </div>
          );
        })}
      </div>

      {/* AI usage today */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <Bot className="w-4 h-4 text-indigo-600" /> AI usage today
        </h2>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 rounded-xl bg-emerald-50">
            <p className="text-gray-500">Success</p>
            <p className="text-lg font-bold text-emerald-700">{stats.aiCallsSuccess}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50">
            <p className="text-gray-500">Errors</p>
            <p className="text-lg font-bold text-rose-700">{stats.aiCallsError}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50">
            <p className="text-gray-500">Est. cost</p>
            <p className="text-lg font-bold text-indigo-700 flex items-center">
              <DollarSign className="w-3 h-3" />
              {stats.totalCostToday.toFixed(4)}
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${stats.aiCallsToday > 0 ? (stats.aiCallsSuccess / stats.aiCallsToday) * 100 : 0}%` }}
          />
          <div
            className="h-full bg-rose-500"
            style={{ width: `${stats.aiCallsToday > 0 ? (stats.aiCallsError / stats.aiCallsToday) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-gray-500 text-right">
          {stats.aiCallsToday} total calls today
        </p>
      </div>

      {/* Recent signups */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent signups</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No users yet.</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                    {(u.email ?? "U").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{u.email ?? "(no email)"}</p>
                    <p className="text-[10px] text-gray-400">{new Date(u.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {u.role === "admin" && (
                    <span className="text-[9px] font-bold uppercase bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full">Admin</span>
                  )}
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${u.plan === "pro" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {u.plan}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


