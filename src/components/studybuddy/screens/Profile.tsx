"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  Moon,
  Bell,
  HelpCircle,
  LogOut,
  Sparkles,
  KeyRound,
  Languages,
  Check,
  Loader2,
  AlertCircle,
  Shield,
  Trash2,
  KeyRound as KeyIcon,
  Clock,
} from "lucide-react";
import { useApp, resetOnboarding } from "../store";
import { api } from "../api";

const languages = ["English", "Kiswahili", "Chinese", "French", "Spanish", "Arabic"];

export function Profile() {
  const {
    darkMode,
    notifications,
    toggleDarkMode,
    toggleNotifications,
    apiKey,
    setApiKey,
    hasStoredApiKey,
    setHasStoredApiKey,
    languageOfInstruction,
    setLanguageOfInstruction,
    setScreen,
  } = useApp();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { user } = await api.getUser();
        if (!mounted) return;
        setName(user.name ?? "");
        setEmail(user.email ?? "");
        setPlan(user.plan);
        if (user.languageOfInstruction) setLanguageOfInstruction(user.languageOfInstruction);
        const keyStatus = await api.hasApiKey();
        if (!mounted) return;
        setHasStoredApiKey(keyStatus.hasKey);

        // check if user is admin
        try {
          const r = await fetch("/api/admin/check");
          if (mounted) setIsAdmin(r.ok);
        } catch {
          // not admin
        }
      } catch (e) {
        // best-effort
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.setApiKey(apiKey.trim());
      setHasStoredApiKey(true);
      setApiKey("");
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? "Failed to save key");
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    setSaving(true);
    try {
      await api.clearApiKey();
      setHasStoredApiKey(false);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? "Failed to clear key");
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = async (v: string) => {
    setLanguageOfInstruction(v);
    try {
      await api.updateUser({ learningLanguage: v });
    } catch (e) {
      // best-effort
    }
  };

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-3xl md:px-0 md:pb-8">
        {/* profile header */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xl font-bold ring-4 ring-white shadow-md">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{name}</h1>
            <p className="text-sm text-gray-500">{email}</p>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" /> {plan === "pro" ? "Pro plan" : "Free plan"}
            </span>
          </div>
        </div>

        {/* upgrade banner */}
        {plan === "free" && (
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-4 text-white shadow-md">
            <p className="text-sm font-semibold">Upgrade to Pro</p>
            <p className="text-xs opacity-90 mt-1">Unlock unlimited AI tutor sessions, advanced analytics and more.</p>
            <button className="mt-3 inline-flex items-center gap-1 bg-white text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full">
              <Sparkles className="w-3 h-3" /> Upgrade
            </button>
          </div>
        )}

        {/* admin entry (separate auth; anyone can click, then must log in with admin creds) */}
        <button
          onClick={() => setScreen("adminLogin")}
          className="mt-4 w-full p-4 flex items-center justify-between rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-md hover:from-slate-800 hover:to-slate-600 transition"
        >
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </span>
            <div className="text-left">
              <p className="text-sm font-semibold">Admin Panel</p>
              <p className="text-[11px] opacity-80">Separate admin login (email + password)</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 opacity-60" />
        </button>

        {/* API key (BYOK) */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">AI Provider Key</h2>
          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <p className="text-sm font-medium text-gray-900">Bring your own key</p>
              {hasStoredApiKey && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" /> Active
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Paste your own AI key to unlock pro features for less. Key is encrypted with AES-256-CBC and stored.
              We make a test call to validate before saving.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            {error && (
              <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-rose-50 text-rose-700 text-xs">
                <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {savedAt && !error && (
              <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Saved successfully.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || saving}
                className="flex-1 h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Validating…" : "Save & validate"}
              </button>
              {hasStoredApiKey && (
                <button
                  onClick={handleClearKey}
                  disabled={saving}
                  className="px-4 h-10 rounded-full bg-rose-50 text-rose-700 font-semibold text-sm hover:bg-rose-100 transition disabled:opacity-40"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        {/* preferences */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Preferences</h2>
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm divide-y divide-gray-100">
            <div className="p-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Languages className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Language of instruction</p>
                <p className="text-xs text-gray-500">For lessons and explanations</p>
              </div>
              <select
                value={languageOfInstruction}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="text-sm font-medium text-gray-900 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400"
              >
                {languages.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <button onClick={toggleDarkMode} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50">
              <span className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center">
                <Moon className="w-4 h-4" />
              </span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">Dark mode</p>
                <p className="text-xs text-gray-500">Easier on the eyes at night</p>
              </div>
              <span className={`w-11 h-6 rounded-full transition-colors relative ${darkMode ? "bg-indigo-600" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${darkMode ? "translate-x-5" : ""}`} />
              </span>
            </button>

            <button onClick={toggleNotifications} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50">
              <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">Notifications</p>
                <p className="text-xs text-gray-500">Daily reminders and streak alerts</p>
              </div>
              <span className={`w-11 h-6 rounded-full transition-colors relative ${notifications ? "bg-indigo-600" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${notifications ? "translate-x-5" : ""}`} />
              </span>
            </button>

            <button className="w-full p-4 flex items-center gap-3 hover:bg-gray-50">
              <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">Help &amp; Support</p>
                <p className="text-xs text-gray-500">FAQ, contact us</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </section>

        {/* logout */}
        <section className="mt-6 space-y-2">
          <button
            onClick={async () => {
              try {
                await fetch("/api/auth/logout", { method: "POST" });
              } catch {}
              if (typeof window !== "undefined") {
                localStorage.removeItem("studybuddy_onboarded");
              }
              setScreen("landing");
            }}
            className="w-full p-4 flex items-center gap-3 rounded-2xl bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 shadow-sm"
          >
            <span className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium">Log out</span>
          </button>

          <button
            onClick={() => {
              resetOnboarding();
              setScreen("onboarding");
            }}
            className="w-full p-4 flex items-center gap-3 rounded-2xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 shadow-sm"
          >
            <span className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium">Reset onboarding (dev)</span>
          </button>
        </section>

        {/* account security section */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Account & Security</h2>
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm divide-y divide-gray-100">
            {/* Sessions */}
            <button
              onClick={async () => {
                try {
                  const r = await fetch("/api/user/sessions");
                  const d = await r.json();
                  alert(
                    "Recent sessions:\n" +
                      (d.sessions?.slice(0, 5).map((s: any) =>
                        `${s.sessionType} · ${new Date(s.createdAt).toLocaleString()}`
                      ).join("\n") || "No sessions logged yet.")
                  );
                } catch (e: any) {
                  alert("Failed to load sessions: " + e?.message);
                }
              }}
              className="w-full p-4 flex items-center gap-3 hover:bg-gray-50"
            >
              <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">Login history</p>
                <p className="text-xs text-gray-500">View your recent login/logout events</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            {/* Change password (Clerk-managed) */}
            <a
              href="https://your-clerk-app.clerk.accounts.dev/user"
              target="_blank"
              rel="noreferrer"
              className="w-full p-4 flex items-center gap-3 hover:bg-gray-50"
            >
              <span className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center">
                <KeyIcon className="w-4 h-4" />
              </span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">Change password</p>
                <p className="text-xs text-gray-500">Opens Clerk's account portal (configure NEXT_PUBLIC_CLERK_MANAGEMENT_URL)</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </a>

            {/* Delete account */}
            <DeleteAccountButton />
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] text-gray-400">
          StudyBuddy AI · v1.0.0
        </p>
      </div>
    </div>
  );
}

function DeleteAccountButton() {
  const { setScreen } = useApp();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doDelete = async () => {
    if (confirmText !== "DELETE") {
      setError('Type "DELETE" exactly to confirm.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/user/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      // Best-effort: also delete Clerk user via client SDK if available
      // (Clerk's useUser().delete() — would need to be wired from a Clerk
      // provider context. For now, just clear local state.)
      resetOnboarding();
      setScreen("onboarding");
      alert("Your StudyBuddy data has been deleted. To also delete your Clerk account, sign in to the Clerk account portal.");
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full p-4 flex items-center gap-3 hover:bg-rose-50 text-rose-600"
      >
        <span className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
          <Trash2 className="w-4 h-4" />
        </span>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium">Delete account</p>
          <p className="text-xs text-gray-500">Permanently delete all your data</p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-rose-700">Delete account?</h2>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <LogOut className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed mb-3">
              This will permanently delete all your study sets, cards, attempts, review history,
              mastery data, AI call logs, and sessions from our database. This action{" "}
              <strong>cannot be undone</strong>.
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Type <code className="bg-gray-100 px-1 rounded font-mono">DELETE</code> to confirm:
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
            {error && (
              <div className="mt-2 p-2 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <button
              onClick={doDelete}
              disabled={busy || confirmText !== "DELETE"}
              className="mt-3 w-full h-11 rounded-full bg-rose-600 text-white font-semibold text-sm shadow-md hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Delete my account</>
              )}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="mt-2 w-full h-10 rounded-full text-gray-500 text-sm hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
