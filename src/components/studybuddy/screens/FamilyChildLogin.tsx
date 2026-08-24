"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Users,
  User,
  KeyRound,
} from "lucide-react";
import { useApp } from "../store";

/**
 * FamilyChildLogin — Phase 20
 *
 * Child login screen. Children log in with a username + passcode created by
 * their parent (no email needed).
 *
 * On success, sets the user_token cookie (server-side) and routes the child
 * to the home screen.
 */
export function FamilyChildLogin() {
  const { setScreen } = useApp();
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authed, redirect home
  useEffect(() => {
    fetch("/api/auth/me").then((r) => {
      if (r.ok) {
        r.json().then((d) => {
          if (d.authed && d.user?.onboardingCompleted) {
            setScreen("home");
          }
        });
      }
    }).catch(() => {});
  }, [setScreen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !passcode) {
      setError("Username and passcode are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/family/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          passcode,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      // Child logged in — route to home
      setScreen("home");
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => setScreen("landing")}
          className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>

        <div className="rounded-3xl bg-white border border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-6 text-center text-white">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="mt-3 text-lg font-bold">Child Login</h1>
            <p className="text-xs opacity-90 mt-1">
              Use the username + passcode your parent gave you
            </p>
          </div>

          <div className="p-5 space-y-3">
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Username
                </label>
                <div className="mt-1 relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alex_smith"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    required
                    className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Passcode
                </label>
                <div className="mt-1 relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showCode ? "text" : "password"}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="••••"
                    autoComplete="current-password"
                    required
                    className="w-full pl-10 pr-10 p-2.5 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCode((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                className="w-full h-12 rounded-full bg-violet-600 text-white font-semibold text-sm shadow-md hover:bg-violet-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>Sign in</>
                )}
              </button>
            </form>

            <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
              <p className="text-[11px] text-violet-700">
                <strong>Need an account?</strong> Ask a parent to sign up via
                &quot;Family Mode&quot; — they&apos;ll create a username and passcode for you.
              </p>
              <button
                type="button"
                onClick={() => setScreen("familyRegister")}
                className="mt-2 text-xs font-bold text-violet-700 hover:underline"
              >
                I&apos;m a parent — create a family →
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          StudyBuddy AI · Family Mode
        </p>
      </div>
    </div>
  );
}
