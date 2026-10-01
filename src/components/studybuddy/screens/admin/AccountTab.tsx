"use client";

import { useState } from "react";
import { Loader2, AlertCircle, Check, Shield, KeyRound, LogOut } from "lucide-react";
import { Field } from "./shared";

export function AccountTab({ adminEmail, onLogout }: { adminEmail: string | null; onLogout: () => Promise<void> }) {
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


