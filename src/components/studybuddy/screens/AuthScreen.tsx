"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  User,
} from "lucide-react";
import { useApp } from "../store";

type Mode = "signin" | "signup";

export function AuthScreen() {
  const { setScreen } = useApp();
  const [mode, setMode] = useState<Mode>("signup");

  // Check if already authed → redirect to home
  useEffect(() => {
    fetch("/api/auth/me").then((r) => {
      if (r.ok) {
        r.json().then((d) => {
          if (d.authed) {
            if (d.user?.onboardingCompleted) {
              setScreen("home");
            } else {
              setScreen("onboarding");
            }
          }
        });
      }
    }).catch(() => {});
  }, [setScreen]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={() => setScreen("landing")} className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1 mb-4">
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>

        <div className="rounded-3xl bg-white border border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-center text-white">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="mt-3 text-lg font-bold">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-xs opacity-90 mt-1">StudyBuddy AI</p>
          </div>

          <div className="p-5 space-y-3">
            <AuthForm mode={mode} setMode={setMode} setScreen={setScreen} />
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          StudyBuddy AI · v1.0.0
        </p>
      </div>
    </div>
  );
}

function AuthForm({ mode, setMode, setScreen }: { mode: Mode; setMode: (m: Mode) => void; setScreen: (s: any) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const endpoint = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const body: any = { email: email.trim().toLowerCase(), password };
      if (mode === "signup" && name.trim()) body.name = name.trim();

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }

      if (d.user?.onboardingCompleted) {
        setScreen("home");
      } else {
        setScreen("onboarding");
      }
    } catch (e: any) {
      setError(e?.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "signup" && (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Name (optional)</label>
          <div className="mt-1 relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
        <div className="mt-1 relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Password</label>
        <div className="mt-1 relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
            required
            className="w-full pl-10 pr-10 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
        className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        {busy ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {mode === "signup" ? "Creating account…" : "Signing in…"}</>
        ) : (
          <>{mode === "signup" ? "Create account" : "Sign in"}</>
        )}
      </button>

      <p className="text-center text-xs text-gray-500">
        {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
        <button
          type="button"
          onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }}
          className="text-indigo-600 font-semibold hover:underline"
        >
          {mode === "signup" ? "Sign in" : "Sign up"}
        </button>
      </p>
    </form>
  );
}
