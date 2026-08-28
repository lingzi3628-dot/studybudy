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
  Trash2,
  Clock,
  Crown,
  Users,
  Bot,
  GraduationCap,
  Globe,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../api";
import { getUILang, setUILang, type Lang } from "@/lib/i18n";
import { useI18n } from "@/lib/useI18n";
import { setPreferredTTSLang } from "./voice-mode";
import { VisualApiEditor } from "./VisualApiEditor";

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
    dataSaver,
    toggleDataSaver,
    setScreen,
  } = useApp();
  const { t, lang: uiLang, setLang: setUiLangHook } = useI18n();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFamilyParent, setIsFamilyParent] = useState(false);
  const [isFamilyChild, setIsFamilyChild] = useState(false);
  const [childCount, setChildCount] = useState(0);
  const [userGrade, setUserGrade] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { user } = await api.getUser();
        if (!mounted) return;
        setName(user.name ?? "");
        setEmail(user.email ?? "");
        setPlan(user.plan);
        if (user.learningLanguage) setLanguageOfInstruction(user.learningLanguage);
        const keyStatus = await api.hasApiKey();
        if (!mounted) return;
        setHasStoredApiKey(keyStatus.hasKey);
        // Phase 20c — detect family parent (for parent-dashboard shortcut)
        const fr = await fetch("/api/family/dashboard");
        if (fr.ok) {
          const fd = await fr.json();
          if (mounted && fd.isFamilyParent) {
            setIsFamilyParent(true);
            setChildCount(fd.children?.length ?? 0);
          }
        }
        // Phase 21b — detect family child (to hide monetization sections)
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          if (mounted && me.isFamilyChild) {
            setIsFamilyChild(true);
          }
          if (mounted && me.user?.grade) {
            setUserGrade(me.user.grade);
          }
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
    // Phase 46 — push to voice-mode's window global so TTS uses this language
    setPreferredTTSLang(v);
    try {
      await api.updateUser({ learningLanguage: v });
    } catch (e) {
      // best-effort
    }
  };

  // Phase 46 — sync the languageOfInstruction to voice-mode on mount
  useEffect(() => {
    setPreferredTTSLang(languageOfInstruction);
  }, [languageOfInstruction]);

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

        {/* Admin access is hidden — use keyboard code or URL param */}

        {/* Premium entry — hidden for family children (parent manages billing) */}
        {!isFamilyChild && (
          <button
            onClick={() => setScreen("premium")}
            className="mt-4 w-full p-4 flex items-center justify-between rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md hover:from-amber-600 hover:to-orange-600 transition"
          >
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <Crown className="w-4 h-4 text-white" />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold">Premium Plans</p>
                <p className="text-[11px] opacity-80">Upgrade · Activate key · Payment</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 opacity-60" />
          </button>
        )}

        {/* Study Buddy selector — switch AI models inline in Profile */}
        <BuddySelectorInline />

        {/* API key (BYOK) — hidden for family children */}
        {!isFamilyChild && (
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
        )}

        {/* NEW: Visual API Editor — users can drop an API key into a node + connect a Study Buddy */}
        {!isFamilyChild && (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Visual API Studio (BYOK)</h2>
            <VisualApiEditor mode="user" />
          </section>
        )}

        {/* preferences */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Preferences</h2>
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm divide-y divide-gray-100">
            {/* Grade switcher — user can change grade anytime */}
            <GradeSwitcher currentGrade={userGrade} />
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

            {/* UI Language selector (Phase 24) */}
            <div className="p-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">App language</p>
                <p className="text-xs text-gray-500">Interface language</p>
              </div>
              <select
                value={uiLang}
                onChange={(e) => {
                  setUiLangHook(e.target.value as Lang);
                }}
                className="text-sm font-medium text-gray-900 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400"
              >
                <option value="en">🇬🇧 English</option>
                <option value="sw">🇰🇪 Kiswahili</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="es">🇪🇸 Español</option>
                <option value="ar">🇸🇦 العربية</option>
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

            {/* Phase 45 — Data Saver mode for low-bandwidth connections */}
            <button onClick={toggleDataSaver} className="w-full p-4 flex items-center gap-3 hover:bg-gray-50">
              <span className={`w-9 h-9 rounded-full flex items-center justify-center ${dataSaver ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                {dataSaver ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
              </span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">Data Saver</p>
                <p className="text-xs text-gray-500">
                  {dataSaver
                    ? "On — image generation, model compare, and long AI replies are disabled."
                    : "Save data on slow connections — disables image gen & long AI replies."}
                </p>
              </div>
              <span className={`w-11 h-6 rounded-full transition-colors relative ${dataSaver ? "bg-emerald-600" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${dataSaver ? "translate-x-5" : ""}`} />
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
          {/* Family / Parent section — only for family parents */}
          {isFamilyParent && (
            <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 p-4 space-y-2 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                  Family / Parent
                </h3>
              </div>
              <p className="text-[11px] text-indigo-700/80">
                You have {childCount} {childCount === 1 ? "child" : "children"} enrolled in Family Mode.
              </p>
              <button
                onClick={() => setScreen("parent")}
                className="w-full p-3 flex items-center gap-3 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-sm"
              >
                <span className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">Parent Dashboard</p>
                  <p className="text-xs text-gray-500">Insights, progress & AI Teacher</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={() => setScreen("familyDashboard")}
                className="w-full p-3 flex items-center gap-3 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-sm"
              >
                <span className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">Children Portals</p>
                  <p className="text-xs text-gray-500">Unlock a child&apos;s learning room</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          )}

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
        </section>

        {/* account security section — hidden for family children (parent manages account) */}
        {!isFamilyChild && (
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

            {/* Delete account */}
            <DeleteAccountButton />
          </div>
        </section>
        )}

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
  const [confirmEmail, setConfirmEmail] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.authed) setUserEmail(d.user?.email ?? "");
      })
      .catch(() => {});
  }, []);

  const doDelete = async () => {
    if (!confirmEmail.trim()) {
      setError("Please enter your email to confirm");
      return;
    }
    if (confirmEmail.trim().toLowerCase() !== userEmail.toLowerCase()) {
      setError("Email doesn't match your account");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/user/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmEmail.trim().toLowerCase() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      if (typeof window !== "undefined") {
        localStorage.removeItem("studybuddy_onboarded");
      }
      setScreen("landing");
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
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 mb-3">
              <p className="text-xs text-rose-700 leading-relaxed">
                ⚠️ This will <strong>permanently delete</strong> all your data — study sets,
                flashcards, quiz results, progress, tokens, coins, AI chat history, and account
                credentials. This action <strong>cannot be undone</strong>.
              </p>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Enter your email <strong>{userEmail}</strong> to confirm:
            </p>
            <input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={userEmail}
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
              disabled={busy || !confirmEmail.trim()}
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

// =====================================================================
// BuddySelectorInline — compact Study Buddy model switcher in Profile
//
// Lets the user switch between available Study Buddies (different AI
// models/providers) without leaving the Profile screen. When
// UNLOCK_ALL_MODELS=true env var is set, all models show as unlocked
// (for testing/comparison). Otherwise, premium models show a lock icon.
// =====================================================================
type StudyBuddyModel = {
  modelName: string;
  displayName: string;
  emoji: string;
  requiresPremium: boolean;
  tokenCostMultiplier: number;
  providerId: string | null;
  modelIdentifier: string | null;
  canUse?: boolean;
};

function BuddySelectorInline() {
  const [buddies, setBuddies] = useState<StudyBuddyModel[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load buddy list + current model on mount
  useEffect(() => {
    Promise.all([fetch("/api/user/models"), fetch("/api/auth/me")])
      .then(async ([modelsRes, meRes]) => {
        if (modelsRes.ok) {
          const d = await modelsRes.json();
          setBuddies(d.models ?? []);
        }
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.authed) setCurrentModel(me.user?.currentModel ?? "study_buddy_free");
        }
      })
      .catch(() => {});
  }, []);

  const switchBuddy = async (modelName: string, buddy: StudyBuddyModel) => {
    if (busy || modelName === currentModel) return;
    setBusy(true);
    try {
      const r = await fetch("/api/user/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName }),
      });
      const d = await r.json();
      if (!r.ok) {
        setToast(`✗ ${d.error ?? "Switch failed"}`);
        setTimeout(() => setToast(null), 3000);
      } else {
        setCurrentModel(modelName);
        setToast(`✓ ${d.celebration ?? `Switched to ${buddy.displayName}`}`);
        setTimeout(() => setToast(null), 2500);
      }
    } catch {
      setToast("✗ Network error");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const currentBuddy = buddies.find((b) => b.modelName === currentModel);
  const allUnlocked = buddies.some((b) => b.canUse === true && b.requiresPremium);

  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Study Buddy (AI Model)</h2>
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
        {/* Current buddy — always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition"
        >
          <span className="w-9 h-9 rounded-full bg-indigo-50 text-2xl flex items-center justify-center">
            {currentBuddy?.emoji ?? "🤖"}
          </span>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-gray-900">
              {currentBuddy?.displayName ?? "Study Buddy"}
            </p>
            <p className="text-xs text-gray-500">
              {currentBuddy?.modelIdentifier ?? "Default AI model"} · tap to switch
            </p>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>

        {/* Unlock banner when all are unlocked (testing phase) */}
        {allUnlocked && expanded && (
          <div className="mx-3 mt-2 mb-2 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-2 text-[10px] text-emerald-800">
            <div className="flex items-start gap-1.5">
              <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span><strong>All Study Buddies unlocked</strong> for testing. Switch freely — your chat history is preserved.</span>
            </div>
          </div>
        )}

        {/* Buddy list — shown when expanded */}
        {expanded && (
          <div className="border-t border-gray-100 max-h-80 overflow-y-auto">
            {buddies.length === 0 ? (
              <p className="p-4 text-xs text-gray-500 text-center">No Study Buddies configured.</p>
            ) : (
              buddies.map((buddy) => {
                const isActive = currentModel === buddy.modelName;
                const canUse = buddy.canUse ?? !buddy.requiresPremium;
                return (
                  <button
                    key={buddy.modelName}
                    onClick={() => canUse && switchBuddy(buddy.modelName, buddy)}
                    disabled={busy || isActive || !canUse}
                    className={`w-full p-3 flex items-center gap-3 transition text-left ${
                      isActive
                        ? "bg-indigo-50"
                        : canUse
                        ? "hover:bg-gray-50"
                        : "bg-gray-50 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full bg-gray-100 text-xl flex items-center justify-center flex-shrink-0">
                      {buddy.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isActive ? "text-indigo-700" : "text-gray-800"}`}>
                        {buddy.displayName}
                        {isActive && <span className="ml-1.5 text-[10px] uppercase text-indigo-600">● Active</span>}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">
                        {buddy.modelIdentifier ?? "—"} · {buddy.tokenCostMultiplier}x tokens
                      </p>
                    </div>
                    {buddy.requiresPremium && !canUse ? (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        Premium
                      </span>
                    ) : isActive ? (
                      <Check className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="px-3 py-2 bg-indigo-50 border-t border-indigo-100 text-xs text-indigo-700">
            {toast}
          </div>
        )}
      </div>
    </section>
  );
}

// =====================================================================
// GradeSwitcher — lets user change their grade level anytime
// When changed, the AI tutor + curriculum engine + exam generator all
// switch to the new grade level automatically.
// =====================================================================
function GradeSwitcher({ currentGrade }: { currentGrade: string }) {
  const [grade, setGrade] = useState(currentGrade);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const GRADE_OPTIONS = [
    { group: "Pre-Primary", grades: ["PP1", "PP2"] },
    { group: "Lower Primary", grades: ["Grade 1", "Grade 2", "Grade 3"] },
    { group: "Upper Primary", grades: ["Grade 4", "Grade 5", "Grade 6"] },
    { group: "Junior School (Grade 7-9)", grades: ["Grade 7", "Grade 8", "Grade 9"] },
    { group: "Senior School (CBE / 8-4-4)", grades: ["Grade 10", "Grade 11", "Grade 12", "Grade 13", "Form 1", "Form 2", "Form 3", "Form 4"] },
  ];

  const changeGrade = async (newGrade: string) => {
    if (newGrade === grade || busy) return;
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: newGrade }),
      });
      if (!r.ok) throw new Error("Failed to update grade");
      setGrade(newGrade);
      setToast(`✓ Switched to ${newGrade} — AI + curriculum updated!`);
      setTimeout(() => setToast(null), 3000);
      // Reload to pick up the new grade in all components
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setToast(`✗ ${e?.message ?? "Failed"}`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 flex items-center gap-3">
      <span className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center">
        <GraduationCap className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">Grade level</p>
        <p className="text-xs text-gray-500">
          Switch grade anytime — AI, curriculum & exams adapt instantly
        </p>
        {toast && <p className="text-[10px] mt-1 text-emerald-600 font-semibold">{toast}</p>}
      </div>
      <div className="relative">
        <select
          value={grade}
          onChange={(e) => changeGrade(e.target.value)}
          disabled={busy}
          className="text-sm font-medium text-gray-900 bg-transparent border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-violet-400 disabled:opacity-50"
        >
          {GRADE_OPTIONS.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
