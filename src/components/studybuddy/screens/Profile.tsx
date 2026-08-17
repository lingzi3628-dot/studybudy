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

  const [name, setName] = useState("Alex Kim");
  const [email, setEmail] = useState("alex@studybuddy.ai");
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
        setName(user.name ?? "Alex Kim");
        setEmail(user.email ?? "alex@studybuddy.ai");
        setPlan(user.plan);
        if (user.languageOfInstruction) setLanguageOfInstruction(user.languageOfInstruction);
        const keyStatus = await api.hasApiKey();
        if (!mounted) return;
        setHasStoredApiKey(keyStatus.hasKey);

        // Phase 5 — check if user is admin
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

        {/* Phase 5 — admin entry */}
        {isAdmin && (
          <button
            onClick={() => setScreen("admin")}
            className="mt-4 w-full p-4 flex items-center justify-between rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-md hover:from-slate-800 hover:to-slate-600 transition"
          >
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold">Admin Panel</p>
                <p className="text-[11px] opacity-80">Manage users, AI providers, content & logs</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 opacity-60" />
          </button>
        )}

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
        <section className="mt-6">
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

        <p className="mt-6 text-center text-[11px] text-gray-400">
          StudyBuddy AI · v0.2.0 (Phase 2 backend)
        </p>
      </div>
    </div>
  );
}
