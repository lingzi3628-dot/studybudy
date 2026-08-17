"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Search,
  Shield,
  Users as UsersIcon,
  Bot,
  BookOpen,
  Activity,
  FileText,
  Check,
  Trash2,
  Pencil,
  Plus,
  Zap,
  DollarSign,
  Sparkles,
  Send,
  KeyRound,
  LogOut,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../api";

type Tab = "dashboard" | "users" | "providers" | "content" | "logs" | "account";

type Stats = {
  totalUsers: number;
  totalStudySets: number;
  totalCards: number;
  totalTopics: number;
  totalBooks: number;
  bannedUsers: number;
  proUsers: number;
  activeUsers: number;
  aiCallsToday: number;
  aiCallsSuccess: number;
  aiCallsError: number;
  totalCostToday: number;
};
type AdminUser = {
  id: string; email: string | null; name: string | null; plan: string; role: string;
  banned: boolean; createdAt: string; lastActive: string | null; grade: string | null;
  hasApiKey: boolean; _count: { studySets: number; attempts: number; aiCallLogs: number };
};
type Provider = {
  id: string; name: string; providerType: string; enabled: boolean;
  baseUrl: string | null; model: string | null; maxTokens: number; costPer1kTokens: number;
  isDefault: boolean; priority: number; apiKeyMasked: string | null;
};
type Book = { id: string; title: string; description: string | null; published: boolean; createdAt: string; _count?: { chapters: number } };
type Chapter = { id: string; title: string | null; orderIndex: number; bookId: string; _count?: { topics: number }; book?: { title: string } };
type AdminTopic = {
  id: string; subject: string; name: string; description: string | null;
  published: boolean; createdAt: string; _count?: { cards: number; lessons: number };
  chapter?: { id: string; title: string | null; book?: { title: string } } | null;
};
type AiLog = {
  id: string; createdAt: string; status: string; providerType: string | null;
  model: string | null; totalTokens: number | null; cost: number;
  errorMessage: string | null; route: string | null;
  user?: { email: string | null; name: string | null } | null;
};
type AdminActionLog = {
  id: string; createdAt: string; action: string; details: any;
  adminUser?: { email: string | null; name: string | null } | null;
};

export function AdminPanel() {
  const { setScreen } = useApp();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/check");
        if (r.ok) {
          const d = await r.json();
          setIsAdmin(true);
          setAdminEmail(d.admin?.email ?? null);
        } else {
          setIsAdmin(false);
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen max-w-5xl mx-auto flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2 text-sm">Checking admin access…</span>
      </div>
    );
  }

  if (!isAdmin) {
    // Not authed → kick to admin login
    return (
      <div className="min-h-screen max-w-md mx-auto flex flex-col items-center justify-center text-center px-4">
        <Shield className="w-12 h-12 text-rose-500" />
        <h1 className="mt-3 text-xl font-bold text-gray-900">Admin login required</h1>
        <p className="mt-1 text-sm text-gray-500">
          You need to sign in with admin credentials to access this area.
        </p>
        <button
          onClick={() => setScreen("adminLogin")}
          className="mt-6 px-6 h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
        >
          Go to admin login
        </button>
        <button
          onClick={() => setScreen("home")}
          className="mt-2 text-xs text-gray-500 hover:underline"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-6xl mx-auto">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreen("home")}
              aria-label="Back"
              className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <Shield className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-900">Admin Panel</h1>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">Phase 5</span>
        </div>
        {/* Tab bar */}
        <div className="px-4 pb-2 flex gap-1 overflow-x-auto no-scrollbar">
          {[
            { key: "dashboard" as const, label: "Dashboard", icon: Activity },
            { key: "users" as const, label: "Users", icon: UsersIcon },
            { key: "providers" as const, label: "AI Providers", icon: Bot },
            { key: "content" as const, label: "Content", icon: BookOpen },
            { key: "logs" as const, label: "Logs", icon: FileText },
            { key: "account" as const, label: "Account", icon: Shield },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition flex-shrink-0 ${
                  active ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-4 py-4 pb-24">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "users" && <UsersTab />}
        {tab === "providers" && <ProvidersTab />}
        {tab === "content" && <ContentTab />}
        {tab === "logs" && <LogsTab />}
        {tab === "account" && <AccountTab adminEmail={adminEmail} onLogout={async () => {
          await fetch("/api/admin/auth/logout", { method: "POST" });
          setScreen("home");
        }} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Dashboard tab
// ════════════════════════════════════════════════════════════════
function DashboardTab() {
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

// ════════════════════════════════════════════════════════════════
// Users tab
// ════════════════════════════════════════════════════════════════
function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/admin/users", window.location.origin);
      url.searchParams.set("q", q);
      url.searchParams.set("plan", planFilter);
      url.searchParams.set("role", roleFilter);
      url.searchParams.set("page", String(page));
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setUsers(d.users);
      setTotalPages(d.totalPages);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [q, planFilter, roleFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const updateUser = async (id: string, body: { plan?: string; role?: string; banned?: boolean }) => {
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Update failed");
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Delete this user and all their data? This cannot be undone.")) return;
    try {
      const r = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  };

  if (loading) return <Spinner label="Loading users…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-3">
      {/* search + filters */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 h-10">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search by email, name, or ID…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }} className="bg-white border border-gray-200 rounded-full px-3 h-10 text-xs">
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="bg-white border border-gray-200 rounded-full px-3 h-10 text-xs">
          <option value="all">All roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* table */}
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide text-[10px]">
            <tr>
              <th className="text-left p-2.5">User</th>
              <th className="text-left p-2.5 hidden sm:table-cell">Plan</th>
              <th className="text-left p-2.5 hidden sm:table-cell">Role</th>
              <th className="text-left p-2.5 hidden md:table-cell">Stats</th>
              <th className="text-left p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="p-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                      {(u.email ?? "U").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{u.email ?? "(no email)"}</p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(u.createdAt).toLocaleDateString()}
                        {u.hasApiKey && " · BYOK ✓"}
                        {u.banned && " · BANNED"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-2.5 hidden sm:table-cell">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${u.plan === "pro" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {u.plan}
                  </span>
                </td>
                <td className="p-2.5 hidden sm:table-cell">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${u.role === "admin" ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="p-2.5 hidden md:table-cell text-[10px] text-gray-500">
                  {u._count.studySets} sets · {u._count.attempts} attempts · {u._count.aiCallLogs} AI
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(u)} aria-label="Edit" className="w-7 h-7 rounded-full hover:bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => updateUser(u.id, { banned: !u.banned })}
                      aria-label={u.banned ? "Unban" : "Ban"}
                      className={`w-7 h-7 rounded-full hover:bg-amber-50 flex items-center justify-center ${u.banned ? "text-emerald-600" : "text-amber-600"}`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteUser(u.id)} aria-label="Delete" className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* edit modal */}
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            await updateUser(editing.id, body);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditUserModal({ user, onClose, onSave }: { user: AdminUser; onClose: () => void; onSave: (body: { plan?: string; role?: string; banned?: boolean }) => Promise<void> }) {
  const [plan, setPlan] = useState(user.plan);
  const [role, setRole] = useState(user.role);
  const [banned, setBanned] = useState(user.banned);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">Edit user</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 mb-3">
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center font-bold">
            {(user.email ?? "U").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user.email}</p>
            <p className="text-[11px] text-gray-500">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Plan</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {["free", "pro"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={`h-10 rounded-xl border-2 text-sm font-medium capitalize ${plan === p ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-700"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {["user", "admin"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`h-10 rounded-xl border-2 text-sm font-medium capitalize ${role === r ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-700"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setBanned(!banned)}
            className={`w-full p-3 rounded-xl border-2 text-sm font-medium flex items-center justify-between ${banned ? "border-rose-500 bg-rose-50 text-rose-700" : "border-gray-200 text-gray-700"}`}
          >
            <span>{banned ? "Banned" : "Active"}</span>
            <span className={`w-10 h-5 rounded-full relative ${banned ? "bg-rose-500" : "bg-emerald-500"}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition ${banned ? "left-0.5" : "translate-x-5 left-0.5"}`} />
            </span>
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              await onSave({ plan, role, banned });
              setSaving(false);
            }}
            disabled={saving}
            className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// AI Providers tab
// ════════════════════════════════════════════════════════════════
const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "glm", label: "GLM (Z.ai)" },
  { value: "gemini", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "pollinations", label: "Pollinations" },
];

// Sensible defaults per provider — used to auto-fill baseUrl + model when
// admin selects a type and those fields are empty (prevents the "openrouter
// with OpenAI baseUrl" bug where the test call goes to the wrong endpoint).
const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai:       { baseUrl: "https://api.openai.com/v1",                                  model: "gpt-4o-mini" },
  glm:          { baseUrl: "https://api.openai.com/v1",                                  model: "glm-4" },
  gemini:       { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",   model: "gemini-1.5-flash" },
  openrouter:   { baseUrl: "https://openrouter.ai/api/v1",                               model: "openai/gpt-4o-mini" },
  huggingface:  { baseUrl: "https://api-inference.huggingface.co",                       model: "meta-llama/Meta-Llama-3-8B-Instruct" },
  pollinations: { baseUrl: "https://text.pollinations.ai/openai",                       model: "openai" },
};

function ProvidersTab() {
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
                    <span>✗ {result.error ?? "Failed"}</span>
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

function ProviderFormModal({ provider, onClose, onSaved }: { provider: Provider | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(provider?.name ?? "");
  const [providerType, setProviderType] = useState(provider?.providerType ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [model, setModel] = useState(provider?.model ?? "");
  const [maxTokens, setMaxTokens] = useState(provider?.maxTokens ?? 2048);
  const [costPer1kTokens, setCostPer1kTokens] = useState(provider?.costPer1kTokens ?? 0);
  const [priority, setPriority] = useState(provider?.priority ?? 100);
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [isDefault, setIsDefault] = useState(provider?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill baseUrl + model with sensible defaults when the admin picks a
  // provider type and those fields are empty. Only fills empty fields — never
  // overrides admin-edited values. This prevents the OpenRouter-with-OpenAI-
  // base-URL bug that was hitting "Country, region, or territory not supported".
  useEffect(() => {
    const defaults = PROVIDER_DEFAULTS[providerType];
    if (!defaults) return;
    setBaseUrl((cur) => (cur.trim() ? cur : defaults.baseUrl));
    setModel((cur) => (cur.trim() ? cur : defaults.model));
  }, [providerType]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        name,
        providerType,
        baseUrl: baseUrl || null,
        model: model || null,
        maxTokens,
        costPer1kTokens,
        priority,
        enabled,
        isDefault,
      };
      if (apiKey) body.apiKey = apiKey;
      const url = provider ? `/api/admin/providers/${provider.id}` : "/api/admin/providers";
      const method = provider ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      await onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{provider ? "Edit provider" : "Add AI provider"}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My OpenAI key" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </Field>
          <Field label="Provider type">
            <select value={providerType} onChange={(e) => setProviderType(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white">
              {PROVIDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label={provider ? "API key (leave blank to keep current)" : "API key"}>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            <p className="text-[10px] text-gray-400 mt-1">Encrypted with AES-256-CBC before storage.</p>
          </Field>
          <Field label="Base URL">
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </Field>
          <Field label="Model">
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Max tokens">
              <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </Field>
            <Field label="Cost/1k">
              <input type="number" step="0.0001" value={costPer1kTokens} onChange={(e) => setCostPer1kTokens(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </Field>
            <Field label="Priority">
              <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </Field>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-indigo-600" />
              Enabled
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-indigo-600" />
              Default
            </label>
          </div>
          {error && <ErrorBox message={error} />}
          <button
            onClick={save}
            disabled={saving || !name}
            className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : provider ? "Save changes" : "Add provider"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Content tab — Books / Chapters / Topics + Generate
// ════════════════════════════════════════════════════════════════
function ContentTab() {
  const [subtab, setSubtab] = useState<"books" | "chapters" | "topics" | "generate">("books");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium">
        {[
          { key: "books" as const, label: "Books" },
          { key: "chapters" as const, label: "Chapters" },
          { key: "topics" as const, label: "Topics" },
          { key: "generate" as const, label: "Generate" },
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
      {subtab === "books" && <BooksSubtab />}
      {subtab === "chapters" && <ChaptersSubtab />}
      {subtab === "topics" && <TopicsSubtab />}
      {subtab === "generate" && <GenerateSubtab />}
    </div>
  );
}

function BooksSubtab() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/books");
      const d = await r.json();
      setBooks(d.books);
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newTitle.trim()) return;
    await fetch("/api/admin/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, description: newDesc || undefined }),
    });
    setNewTitle(""); setNewDesc(""); setAdding(false);
    await load();
  };

  const togglePublish = async (b: Book) => {
    await fetch(`/api/admin/books/${b.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !b.published }),
    });
    await load();
  };

  const del = async (b: Book) => {
    if (!confirm(`Delete "${b.title}"?`)) return;
    await fetch(`/api/admin/books/${b.id}`, { method: "DELETE" });
    await load();
  };

  if (loading) return <Spinner label="Loading books…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-2">
      {!adding && (
        <button onClick={() => setAdding(true)} className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-1 hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Add Book
        </button>
      )}
      {adding && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 space-y-2">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Book title" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" rows={2} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold">Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {books.map((b) => (
        <div key={b.id} className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{b.title}</p>
            <p className="text-[11px] text-gray-500">
              {b._count?.chapters ?? 0} chapters · {b.published ? "Published" : "Draft"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => togglePublish(b)}
              className={`px-2 py-1 rounded-full text-[10px] font-semibold ${b.published ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
            >
              {b.published ? "Published" : "Publish"}
            </button>
            <button onClick={() => del(b)} className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {books.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No books yet.</p>}
    </div>
  );
}

function ChaptersSubtab() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newBookId, setNewBookId] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([
        fetch("/api/admin/chapters").then((r) => r.json()),
        fetch("/api/admin/books").then((r) => r.json()),
      ]);
      setChapters(c.chapters);
      setBooks(b.books);
      if (!newBookId && b.books[0]) setNewBookId(b.books[0].id);
    } catch (e: any) {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newBookId || !newTitle.trim()) return;
    await fetch("/api/admin/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: newBookId, title: newTitle }),
    });
    setNewTitle(""); setAdding(false);
    await load();
  };

  const del = async (c: Chapter) => {
    if (!confirm(`Delete chapter "${c.title ?? "(untitled)"}"?`)) return;
    await fetch(`/api/admin/chapters/${c.id}`, { method: "DELETE" });
    await load();
  };

  if (loading) return <Spinner label="Loading chapters…" />;

  return (
    <div className="space-y-2">
      {!adding && (
        <button onClick={() => setAdding(true)} className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-1">
          <Plus className="w-4 h-4" /> Add Chapter
        </button>
      )}
      {adding && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 space-y-2">
          <select value={newBookId} onChange={(e) => setNewBookId(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white">
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Chapter title" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold">Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {chapters.map((c) => (
        <div key={c.id} className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{c.title ?? "(untitled)"}</p>
            <p className="text-[11px] text-gray-500">
              {c.book?.title ?? "—"} · {c._count?.topics ?? 0} topics
            </p>
          </div>
          <button onClick={() => del(c)} className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {chapters.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No chapters yet.</p>}
    </div>
  );
}

function TopicsSubtab() {
  const [topics, setTopics] = useState<AdminTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newName, setNewName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/topics");
      const d = await r.json();
      setTopics(d.topics);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newName.trim()) return;
    await fetch("/api/admin/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: newSubject || "General", name: newName }),
    });
    setNewSubject(""); setNewName(""); setAdding(false);
    await load();
  };

  const togglePublish = async (t: AdminTopic) => {
    await fetch(`/api/admin/topics/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !t.published }),
    });
    await load();
  };

  const del = async (t: AdminTopic) => {
    if (!confirm(`Delete topic "${t.name}"?`)) return;
    await fetch(`/api/admin/topics/${t.id}`, { method: "DELETE" });
    await load();
  };

  if (loading) return <Spinner label="Loading topics…" />;

  return (
    <div className="space-y-2">
      {!adding && (
        <button onClick={() => setAdding(true)} className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-1">
          <Plus className="w-4 h-4" /> Add Topic
        </button>
      )}
      {adding && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 space-y-2">
          <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Subject (e.g. Mathematics)" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Topic name (e.g. Quadratic Equations)" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold">Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {topics.map((t) => (
        <div key={t.id} className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
            <p className="text-[11px] text-gray-500">
              {t.subject} · {t._count?.cards ?? 0} cards · {t._count?.lessons ?? 0} lessons
              {t.chapter?.book?.title && ` · ${t.chapter.book.title}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => togglePublish(t)}
              className={`px-2 py-1 rounded-full text-[10px] font-semibold ${t.published ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
            >
              {t.published ? "Published" : "Draft"}
            </button>
            <button onClick={() => del(t)} className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {topics.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No topics yet.</p>}
    </div>
  );
}

function GenerateSubtab() {
  const [mode, setMode] = useState<"book" | "topic">("book");
  const [text, setText] = useState("");
  const [topicName, setTopicName] = useState("");
  const [subject, setSubject] = useState("");
  const [numFlashcards, setNumFlashcards] = useState(5);
  const [numMCQs, setNumMCQs] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const url = mode === "book" ? "/api/admin/generate/book" : "/api/admin/generate/topic";
      const body = mode === "book"
        ? { text }
        : { topicName, subject: subject || "General", numFlashcards, numMCQs, text: text || undefined };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setResult(d);
    } catch (e: any) {
      setError(e?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium">
        {[
          { key: "book" as const, label: "From material → Book outline" },
          { key: "topic" as const, label: "Topic lesson + cards" },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`py-1.5 rounded-lg transition ${mode === m.key ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "topic" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Topic name">
            <input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="e.g. Photosynthesis" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          </Field>
          <Field label="Subject">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Science" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          </Field>
          <Field label="Flashcards">
            <input type="number" min={0} max={12} value={numFlashcards} onChange={(e) => setNumFlashcards(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          </Field>
          <Field label="MCQs">
            <input type="number" min={0} max={12} value={numMCQs} onChange={(e) => setNumMCQs(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          </Field>
        </div>
      )}

      <Field label="Source text (optional for topic, required for book)">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste notes, PDF text, or any study material…"
          className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 resize-none"
        />
      </Field>

      {error && <ErrorBox message={error} />}

      <button
        onClick={generate}
        disabled={generating || (mode === "book" && !text.trim()) || (mode === "topic" && !topicName.trim())}
        className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {generating ? "Generating…" : `Generate ${mode}`}
      </button>

      {result && mode === "book" && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm space-y-2">
          <p className="text-sm font-bold text-gray-900">{result.title}</p>
          <p className="text-xs text-gray-600">{result.description}</p>
          {result.chapters?.map((c: any, i: number) => (
            <div key={i} className="rounded-xl bg-gray-50 p-2">
              <p className="text-xs font-semibold text-gray-900">{i + 1}. {c.title}</p>
              <ul className="mt-1 ml-3 list-disc text-[11px] text-gray-600">
                {c.topics?.map((t: any, j: number) => <li key={j}>{t.name} ({t.subject})</li>)}
              </ul>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 italic">Preview only — save via Books tab.</p>
        </div>
      )}

      {result && mode === "topic" && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm space-y-2">
          <p className="text-sm font-bold text-gray-900">{result.topicName}</p>
          {result.lesson?.introduction && (
            <p className="text-xs text-gray-700">{result.lesson.introduction}</p>
          )}
          {result.lesson?.keyConcepts && (
            <p className="text-[11px] text-gray-500">{result.lesson.keyConcepts.length} key concepts generated</p>
          )}
          <p className="text-[11px] text-gray-500">
            {result.flashcards?.length ?? 0} flashcards · {result.mcqs?.length ?? 0} MCQs
          </p>
          <p className="text-[10px] text-gray-400 italic">Preview only — save via Topics tab + /api/study-sets.</p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Logs tab
// ════════════════════════════════════════════════════════════════
function LogsTab() {
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

// ════════════════════════════════════════════════════════════════
// Shared helpers
// ════════════════════════════════════════════════════════════════
function Spinner({ label }: { label: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin" />
      <span className="mt-2 text-xs">{label}</span>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Phase 6 — Account tab (admin profile + change password + logout)
// ════════════════════════════════════════════════════════════════
function AccountTab({ adminEmail, onLogout }: { adminEmail: string | null; onLogout: () => Promise<void> }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const changePassword = async () => {
    setError(null);
    setSuccess(false);
    if (!currentPw || !newPw || !confirmPw) {
      setError("All three fields are required.");
      return;
    }
    if (newPw !== confirmPw) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (newPw.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setSuccess(true);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e: any) {
      setError(e?.message ?? "Change failed");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Admin info */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 p-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide opacity-80">Signed in as</p>
            <p className="text-sm font-bold truncate">{adminEmail ?? "Admin"}</p>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-indigo-600" /> Change Password
        </h2>
        <Field label="Current password">
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="••••••••"
            className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="New password">
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 6 chars"
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </Field>
          <Field label="Confirm new">
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Re-type new"
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </Field>
        </div>
        {error && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" /> Password updated successfully.
          </div>
        )}
        <button
          onClick={changePassword}
          disabled={busy}
          className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {busy ? "Updating…" : "Update password"}
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        disabled={loggingOut}
        className="w-full p-4 flex items-center gap-3 rounded-2xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 shadow-sm disabled:opacity-50"
      >
        <span className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
          <LogOut className="w-4 h-4" />
        </span>
        <span className="text-sm font-medium">
          {loggingOut ? "Logging out…" : "Log out of admin"}
        </span>
      </button>

      <p className="text-center text-[11px] text-gray-400">
        Admin auth is separate from user (Clerk) auth.
      </p>
    </div>
  );
}
