"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Chrome,
  Send,
  Shield,
} from "lucide-react";
import { useApp } from "../store";

// Lazy-load Clerk components only when configured
const ClerkSignIn = dynamic(() => import("@clerk/nextjs").then((m) => m.SignIn), { ssr: false });
const ClerkSignUp = dynamic(() => import("@clerk/nextjs").then((m) => m.SignUp), { ssr: false });

type Method = "password" | "google" | "magic";
type Mode = "signin" | "signup";

export function AuthScreen() {
  const { setScreen } = useApp();
  const [mode, setMode] = useState<Mode>("signin");
  const [method, setMethod] = useState<Method>("password");
  const [pk] = useState(() => process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const clerkConfigured = Boolean(pk && pk.startsWith("pk_"));

  // If Clerk is configured, render Clerk's actual SignIn/SignUp component.
  // The Clerk component handles email/password, Google OAuth, and magic link
  // via its built-in UI — we don't reimplement it.
  if (clerkConfigured) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button
            onClick={() => setScreen("landing")}
            className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1 mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> Back to home
          </button>
          {mode === "signin" ? <ClerkSignIn /> : <ClerkSignUp />}
        </div>
      </div>
    );
  }

  // Dev fallback — Clerk not configured, show a friendly notice + dev mode bypass.
  // User can still explore the app by clicking "Continue in dev mode" which
  // falls back to the demo user (alex@studybuddy.ai).
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => setScreen("landing")}
          className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>

        <div className="rounded-3xl bg-white border border-gray-200 shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-center text-white">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="mt-3 text-lg font-bold">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-xs opacity-90 mt-1">StudyBuddy AI</p>
          </div>

          {/* Method tabs */}
          <div className="px-5 pt-4">
            <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium">
              {[
                { key: "password" as const, label: "Email", icon: Mail },
                { key: "google" as const, label: "Google", icon: Chrome },
                { key: "magic" as const, label: "Magic Link", icon: Send },
              ].map((t) => {
                const Icon = t.icon;
                const active = method === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setMethod(t.key)}
                    className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${
                      active ? "bg-white shadow text-indigo-600" : "text-gray-500"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Method body — demo only (real auth via Clerk when configured) */}
          <div className="p-5 space-y-3">
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Dev mode — Clerk not configured</p>
                <p className="mt-0.5 opacity-90">
                  Set <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> +{" "}
                  <code className="bg-amber-100 px-1 rounded">CLERK_SECRET_KEY</code> in <code>.env</code> to
                  enable real email/password, Google OAuth, and magic link sign-in.
                </p>
              </div>
            </div>

            {method === "password" && <PasswordFormDemo mode={mode} />}
            {method === "google" && <GoogleButtonDemo mode={mode} />}
            {method === "magic" && <MagicLinkFormDemo />}

            {/* Toggle signin/signup */}
            <p className="text-center text-xs text-gray-500">
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
                className="text-indigo-600 font-semibold hover:underline"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>

            {/* Dev bypass */}
            <button
              onClick={() => setScreen("onboarding")}
              className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 mt-2"
            >
              Continue in dev mode →
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          StudyBuddy AI · v1.0.0
        </p>
      </div>
    </div>
  );
}

function PasswordFormDemo({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
        <div className="mt-1 relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
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
            placeholder="••••••••"
            className="w-full pl-10 pr-10 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
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
      <button
        disabled
        className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md disabled:opacity-50"
      >
        {mode === "signin" ? "Sign in" : "Sign up"} (configure Clerk to enable)
      </button>
    </div>
  );
}

function GoogleButtonDemo({ mode }: { mode: Mode }) {
  return (
    <button
      disabled
      className="w-full h-11 rounded-full bg-white border border-gray-200 text-gray-700 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
    >
      <Chrome className="w-4 h-4" />
      {mode === "signin" ? "Continue with Google" : "Sign up with Google"}
    </button>
  );
}

function MagicLinkFormDemo() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="space-y-3">
      {sent ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 text-xs flex items-start gap-2">
          <Send className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Magic link sent!</p>
            <p className="mt-0.5 opacity-90">Check your inbox — in production, Clerk sends the actual email.</p>
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
            <div className="mt-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
              />
            </div>
          </div>
          <button
            onClick={() => setSent(true)}
            disabled={!email.trim()}
            className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50"
          >
            Send magic link
          </button>
        </>
      )}
    </div>
  );
}
