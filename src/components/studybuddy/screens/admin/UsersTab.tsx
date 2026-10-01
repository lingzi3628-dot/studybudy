"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Trash2, Pencil, Ban, Shield, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { Stats, AdminUser, ErrorBox, Spinner } from "./shared";

export function UsersTab() {
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

  const manageUser = async (id: string, action: "ban" | "unban" | "delete" | "verifyEmail") => {
    const reason = prompt(
      action === "delete"
        ? `DELETE this user permanently?\n\nEnter a reason (will be emailed to admin):`
        : action === "ban"
        ? `BAN this user?\n\nEnter a reason (will be emailed to admin):`
        : action === "verifyEmail"
        ? `Manually verify this user's email?\n\nEnter a reason:`
        : `UNBAN this user?\n\nEnter a reason:`
    );
    if (reason === null) return; // cancelled

    if (action === "delete") {
      if (!confirm("⚠️ This will PERMANENTLY DELETE the user and ALL their data. Continue?")) return;
    }

    try {
      const r = await fetch(`/api/admin/users/${id}/manage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Action failed");
    }
  };

  const deleteUser = async (id: string) => {
    manageUser(id, "delete");
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
              <th className="text-left p-2.5 hidden sm:table-cell">Phone</th>
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
                <td className="p-2.5 hidden sm:table-cell text-gray-700">
                  {u.phoneNumber ? (
                    <span className="text-[11px] font-mono">{u.phoneNumber}</span>
                  ) : (
                    <span className="text-[10px] text-gray-400">—</span>
                  )}
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
                      onClick={() => manageUser(u.id, u.banned ? "unban" : "ban")}
                      aria-label={u.banned ? "Unban" : "Ban"}
                      className={`w-7 h-7 rounded-full hover:bg-amber-50 flex items-center justify-center ${u.banned ? "text-emerald-600" : "text-amber-600"}`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => manageUser(u.id, "verifyEmail")}
                      aria-label="Verify email"
                      className="w-7 h-7 rounded-full hover:bg-emerald-50 text-emerald-600 flex items-center justify-center"
                      title="Manually verify email"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
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



function EditUserModal(props: any): any { return null; }
