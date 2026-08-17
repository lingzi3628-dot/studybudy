"use client";

import { useState } from "react";
import {
  Shield,
  Loader2,
  AlertCircle,
  Lock,
  Mail,
  ChevronLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import { useApp } from "../store";

export function AdminLogin() {
  const { setScreen } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      // Login successful → navigate to the admin panel
      setScreen("admin");
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back button */}
        <button
          onClick={() => setScreen("home")}
          className="text-slate-300 hover:text-white text-sm flex items-center gap-1 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Back to app
        </button>

        <div className="rounded-3xl bg-white shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-900 p-6 text-center text-white">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center">
              <Shield className="w-7 h-7" />
            </div>
            <h1 className="mt-3 text-lg font-bold">Admin Login</h1>
            <p className="text-xs text-slate-300 mt-1">
              Restricted area — authorized admins only
            </p>
          </div>

          {/* Form */}
          <form onSubmit={submit} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Email
              </label>
              <div className="mt-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-3 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Password
              </label>
              <div className="mt-1 relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold text-sm shadow-md hover:from-indigo-700 hover:to-violet-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
              ) : (
                <><Shield className="w-4 h-4" /> Sign in to Admin</>
              )}
            </button>

            <p className="text-center text-[11px] text-gray-400">
              No signup — admin accounts are seeded in the database.
            </p>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          StudyBuddy AI · Admin · v0.7.0
        </p>
      </div>
    </div>
  );
}
