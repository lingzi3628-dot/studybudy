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
  Users,
  Phone,
  Check,
} from "lucide-react";
import { useApp } from "../store";

type Mode = "signin" | "signup";

export function AuthScreen() {
  const { setScreen } = useApp();
  const [mode, setMode] = useState<Mode>("signup");
  // Phase 23b — email verification state (lifted up so AuthScreen can switch views)
  const [showVerification, setShowVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");

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
              {showVerification ? <Mail className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
            </div>
            <h1 className="mt-3 text-lg font-bold">
              {showVerification
                ? "Verify your email"
                : mode === "signup"
                ? "Create your account"
                : "Welcome back"}
            </h1>
            <p className="text-xs opacity-90 mt-1">
              {showVerification ? "Enter the code we sent you" : "StudyBuddy AI"}
            </p>
          </div>

          <div className="p-5 space-y-3">
            {showVerification ? (
              <EmailVerificationScreen
                email={verificationEmail}
                mode={mode === "signup" ? "signup" : "login"}
                setScreen={setScreen}
                onBack={() => setShowVerification(false)}
              />
            ) : (
              <AuthForm
                mode={mode}
                setMode={setMode}
                setScreen={setScreen}
                onNeedVerification={(email: string) => {
                  setVerificationEmail(email);
                  setShowVerification(true);
                }}
              />
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          StudyBuddy AI · v1.0.0
        </p>
      </div>
    </div>
  );
}

function AuthForm({ mode, setMode, setScreen, onNeedVerification }: { mode: Mode; setMode: (m: Mode) => void; setScreen: (s: any) => void; onNeedVerification: (email: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
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
      if (mode === "signup" && phoneNumber.trim()) body.phoneNumber = phoneNumber.trim();

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }

      // Phase 23b — If signup or login requires email verification, show the code entry screen
      if (d.needsEmailVerification) {
        onNeedVerification(email.trim().toLowerCase());
        return;
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

      {mode === "signup" && (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Phone number <span className="text-gray-400 normal-case">(for WhatsApp updates)</span>
          </label>
          <div className="mt-1 relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+254712345678 or 0712345678"
              className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">
            We&apos;ll WhatsApp you when new subjects are unlocked for your grade.
          </p>
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

      {/* Phase 23 — Forgot password link (signin mode only) */}
      {mode === "signin" && (
        <div className="text-center">
          <ForgotPasswordLink />
        </div>
      )}

      {/* Family Mode toggle — Phase 20 */}
      <div className="pt-3 mt-3 border-t border-gray-100">
        <p className="text-center text-[11px] text-gray-500 mb-2">
          Multiple kids at home?
        </p>
        <button
          type="button"
          onClick={() => setScreen("familyRegister")}
          className="w-full h-10 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold text-xs hover:bg-violet-100 transition flex items-center justify-center gap-1.5"
        >
          <Users className="w-4 h-4" />
          Try Family Mode (1 email · 2+ kids)
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Phase 23b — Email verification screen (enter 6-digit code)
// ---------------------------------------------------------------------

function EmailVerificationScreen({
  email,
  mode,
  setScreen,
  onBack,
}: {
  email: string;
  mode: "signup" | "login";
  setScreen: (s: any) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Verification failed");
      // Success — go to onboarding or home
      setScreen("onboarding");
    } catch (e: any) {
      setError(e?.message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(30);
    setError(null);
    try {
      const r = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "signup" }),
      });
      const d = await r.json();
      if (r.ok) {
        setError(null);
      } else {
        setError(d.error ?? "Failed to resend");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to resend");
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center py-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4">
          <Mail className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Verify your email</h2>
        <p className="text-xs text-gray-500 mt-1">
          We sent a 6-digit code to <strong>{email}</strong>
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          Check your inbox (and spam folder)
        </p>
      </div>

      <form onSubmit={verify} className="space-y-3">
        <div>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            className="w-full text-center text-2xl font-bold tracking-[0.5em] p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {busy ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
          ) : (
            <>Verify email →</>
          )}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={resend}
            disabled={resendCooldown > 0}
            className="text-xs text-gray-500 hover:text-indigo-600 disabled:opacity-50"
          >
            {resendCooldown > 0
              ? `Resend code in ${resendCooldown}s`
              : "Didn't get a code? Resend →"}
          </button>
        </div>
      </form>
    </div>
  );
}
// ---------------------------------------------------------------------

function ForgotPasswordLink() {
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<"email" | "code" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setStep("code");
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    // Just move to the reset step — the code is verified when they submit the new password
    setStep("reset");
    setBusy(false);
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          newPassword,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setStep("done");
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setShowModal(false);
    setStep("email");
    setEmail("");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="text-[11px] text-gray-400 hover:text-indigo-600"
      >
        Forgot your password?
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white">
              <h2 className="text-base font-bold">
                {step === "email" ? "🔐 Reset Password" : step === "code" ? "📧 Enter Code" : step === "reset" ? "🔑 New Password" : "✅ Done!"}
              </h2>
              <p className="text-[11px] opacity-90 mt-0.5">
                {step === "email" ? "Enter your email to get a reset code" : step === "code" ? `We sent a 6-digit code to ${email}` : step === "reset" ? "Set your new password" : "Your password has been reset"}
              </p>
            </div>
            <div className="p-5 space-y-3">
              {step === "email" && (
                <form onSubmit={sendCode} className="space-y-3">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                      className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  {error && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "Send reset code"}
                  </button>
                </form>
              )}

              {step === "code" && (
                <form onSubmit={verifyCode} className="space-y-3">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full text-center text-2xl font-bold tracking-[0.5em] p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  {error && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={busy || code.length !== 6}
                    className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    Continue →
                  </button>
                </form>
              )}

              {step === "reset" && (
                <form onSubmit={resetPassword} className="space-y-3">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 6 chars)"
                      required
                      autoFocus
                      className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required
                      className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  {error && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full h-11 rounded-full bg-emerald-600 text-white font-semibold text-sm shadow-md hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</> : "Reset password"}
                  </button>
                </form>
              )}

              {step === "done" && (
                <div className="text-center py-4">
                  <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                    <Check className="w-7 h-7 text-emerald-600" />
                  </div>
                  <p className="text-sm font-bold text-gray-900">Password reset! ✅</p>
                  <p className="text-xs text-gray-500 mt-1">
                    You can now sign in with your new password.
                  </p>
                  <button
                    onClick={close}
                    className="mt-4 w-full h-10 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                  >
                    Sign in →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
