"use client";
import dynamic from "next/dynamic";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Search,
  Shield,
  Users as UsersIcon,
  Bot,
  BookOpen,
  Activity,
  FileText,
  Check,
  Trash2,
  Pencil,
  Plus,
  Zap,
  DollarSign,
  Sparkles,
  Send,
  KeyRound,
  LogOut,
  Crown,
  Image as ImageIcon,
  Video,
  Youtube,
  TestTube,
  Map as MapIcon,
  Route,
  Trophy,
  Award,
  CheckCircle2,
  Gamepad2,
  UploadCloud,
  Compass,
  GraduationCap,
  Server,
  ShieldAlert,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../api";
// Phase 90.3 — CurriculumTab lazy-loaded below
// Phase 90.3 — GamesTab lazy-loaded below
// Phase 90.3 — ExploreTab lazy-loaded below
// Phase 90.3 — CourseSwitchTab lazy-loaded below
// Phase 90.3 — MigrateUsersTab lazy-loaded below
import { VisualApiEditor } from "./VisualApiEditor";

// Phase 90.3 — Lazy-load extracted tab components
const MigrateUsersTab = dynamic(() => import("./admin/MigrateUsersTab").then(m => ({ default: m.MigrateUsersTab })), { loading: () => <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /> });
const CourseSwitchTab = dynamic(() => import("./admin/CourseSwitchTab").then(m => ({ default: m.CourseSwitchTab })), { loading: () => <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /> });
const ExploreTab = dynamic(() => import("./admin/ExploreTab").then(m => ({ default: m.ExploreTab })), { loading: () => <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /> });
const GamesTab = dynamic(() => import("./admin/GamesTab").then(m => ({ default: m.GamesTab })), { loading: () => <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /> });
const CurriculumTab = dynamic(() => import("./admin/CurriculumTab").then(m => ({ default: m.CurriculumTab })), { loading: () => <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /> });
const BadgesTab = dynamic(() => import("./admin/BadgesTab").then(m => ({ default: m.BadgesTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const PathTemplatesTab = dynamic(() => import("./admin/PathTemplatesTab").then(m => ({ default: m.PathTemplatesTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const ConceptMapSettingsTab = dynamic(() => import("./admin/ConceptMapSettingsTab").then(m => ({ default: m.ConceptMapSettingsTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const SearchSettingsTab = dynamic(() => import("./admin/SearchSettingsTab").then(m => ({ default: m.SearchSettingsTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const ToolhubSettingsTab = dynamic(() => import("./admin/ToolhubSettingsTab").then(m => ({ default: m.ToolhubSettingsTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const GeoBlockTab = dynamic(() => import("./admin/GeoBlockTab").then(m => ({ default: m.GeoBlockTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const MonetizationTab = dynamic(() => import("./admin/MonetizationTab").then(m => ({ default: m.MonetizationTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const AccountTab = dynamic(() => import("./admin/AccountTab").then(m => ({ default: m.AccountTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const LogsTab = dynamic(() => import("./admin/LogsTab").then(m => ({ default: m.LogsTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const ContentTab = dynamic(() => import("./admin/ContentTab").then(m => ({ default: m.ContentTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const ProvidersTab = dynamic(() => import("./admin/ProvidersTab").then(m => ({ default: m.ProvidersTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const UsersTab = dynamic(() => import("./admin/UsersTab").then(m => ({ default: m.UsersTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const DashboardTab = dynamic(() => import("./admin/DashboardTab").then(m => ({ default: m.DashboardTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });
const AiDiagnosticsTab = dynamic(() => import("./admin/AiDiagnosticsTab").then(m => ({ default: m.AiDiagnosticsTab })), { loading: () => <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div> });

type Tab = "dashboard" | "users" | "providers" | "aiDiagnostics" | "content" | "logs" | "account" | "monetization" | "search" | "toolhub" | "geoBlock" | "conceptMap" | "pathTemplates" | "badges" | "curriculum" | "games" | "explore" | "courseSwitch" | "migrateUsers";

type Stats = {
  totalUsers: number;
  totalStudySets: number;
  totalCards: number;
  totalTopics: number;
  totalBooks: number;
  bannedUsers: number;
  proUsers: number;
  activeUsers: number;
  aiCallsToday: number;
  aiCallsSuccess: number;
  aiCallsError: number;
  totalCostToday: number;
};
type AdminUser = {
  id: string; email: string | null; name: string | null; phoneNumber: string | null;
  plan: string; role: string;
  banned: boolean; createdAt: string; lastActive: string | null; grade: string | null;
  hasApiKey: boolean; _count: { studySets: number; attempts: number; aiCallLogs: number };
};
type Provider = {
  id: string; name: string; providerType: string; enabled: boolean;
  baseUrl: string | null; model: string | null; maxTokens: number; costPer1kTokens: number;
  isDefault: boolean; priority: number; apiKeyMasked: string | null;
};
type Book = { id: string; title: string; description: string | null; published: boolean; createdAt: string; _count?: { chapters: number } };
type Chapter = { id: string; title: string | null; orderIndex: number; bookId: string; _count?: { topics: number }; book?: { title: string } };
type AdminTopic = {
  id: string; subject: string; name: string; description: string | null;
  published: boolean; createdAt: string; _count?: { cards: number; lessons: number };
  chapter?: { id: string; title: string | null; book?: { title: string } } | null;
};
type AiLog = {
  id: string; createdAt: string; status: string; providerType: string | null;
  model: string | null; totalTokens: number | null; cost: number;
  errorMessage: string | null; route: string | null;
  user?: { email: string | null; name: string | null } | null;
};
type AdminActionLog = {
  id: string; createdAt: string; action: string; details: any;
  adminUser?: { email: string | null; name: string | null } | null;
};

export function AdminPanel() {
  const { setScreen } = useApp();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/check");
        if (r.ok) {
          const d = await r.json();
          setIsAdmin(true);
          setAdminEmail(d.admin?.email ?? null);
        } else {
          setIsAdmin(false);
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen max-w-5xl mx-auto flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2 text-sm">Checking admin access…</span>
      </div>
    );
  }

  if (!isAdmin) {
    // Not authed → kick to admin login
    return (
      <div className="min-h-screen max-w-md mx-auto flex flex-col items-center justify-center text-center px-4">
        <Shield className="w-12 h-12 text-rose-500" />
        <h1 className="mt-3 text-xl font-bold text-gray-900">Admin login required</h1>
        <p className="mt-1 text-sm text-gray-500">
          You need to sign in with admin credentials to access this area.
        </p>
        <button
          onClick={() => setScreen("adminLogin")}
          className="mt-6 px-6 h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
        >
          Go to admin login
        </button>
        <button
          onClick={() => setScreen("home")}
          className="mt-2 text-xs text-gray-500 hover:underline"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-6xl mx-auto">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreen("home")}
              aria-label="Back"
              className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <Shield className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-900">Admin Panel</h1>
          </div>
          
        </div>
        {/* Tab bar */}
        <div className="px-4 pb-2 flex gap-1 overflow-x-auto no-scrollbar">
          {[
            { key: "dashboard" as const, label: "Dashboard", icon: Activity },
            { key: "users" as const, label: "Users", icon: UsersIcon },
            { key: "providers" as const, label: "AI Providers", icon: Bot },
            { key: "aiDiagnostics" as const, label: "🔍 AI Diagnostics", icon: Activity },
            { key: "content" as const, label: "Content", icon: BookOpen },
            { key: "curriculum" as const, label: "📚 Curriculum", icon: BookOpen },
            { key: "logs" as const, label: "Logs", icon: FileText },
            { key: "monetization" as const, label: "💰 Plans", icon: Crown },
            { key: "search" as const, label: "🔍 Search", icon: Search },
            { key: "toolhub" as const, label: "🧰 Tools Hub", icon: Server },
            { key: "geoBlock" as const, label: "🛡️ Geo-Block", icon: ShieldAlert },
            { key: "conceptMap" as const, label: "🗺️ Concept Maps", icon: MapIcon },
            { key: "pathTemplates" as const, label: "🛤️ Path Templates", icon: Route },
            { key: "badges" as const, label: "🏆 Badges", icon: Trophy },
            { key: "games" as const, label: "🎮 Games", icon: Gamepad2 },
            { key: "explore" as const, label: "🧭 Explore", icon: Compass },
            { key: "courseSwitch" as const, label: "🔄 Course Switch", icon: GraduationCap },
            { key: "migrateUsers" as const, label: "🔧 Migrate Users", icon: UsersIcon },
            { key: "account" as const, label: "Account", icon: Shield },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition flex-shrink-0 ${
                  active ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-4 py-4 pb-24">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "users" && <UsersTab />}
        {tab === "providers" && <ProvidersTab />}
        {tab === "aiDiagnostics" && <AiDiagnosticsTab />}
        {tab === "content" && <ContentTab />}
        {tab === "curriculum" && <CurriculumTab />}
        {tab === "logs" && <LogsTab />}
        {tab === "monetization" && <MonetizationTab />}
        {tab === "search" && <SearchSettingsTab />}
        {tab === "toolhub" && <ToolhubSettingsTab />}
        {tab === "geoBlock" && <GeoBlockTab />}
        {tab === "conceptMap" && <ConceptMapSettingsTab />}
        {tab === "pathTemplates" && <PathTemplatesTab />}
        {tab === "badges" && <BadgesTab />}
        {tab === "games" && <GamesTab />}
        {tab === "explore" && <ExploreTab />}
        {tab === "courseSwitch" && <CourseSwitchTab />}
        {tab === "migrateUsers" && <MigrateUsersTab />}
        {tab === "account" && <AccountTab adminEmail={adminEmail} onLogout={async () => {
          await fetch("/api/admin/auth/logout", { method: "POST" });
          setScreen("home");
        }} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Dashboard tab
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — DashboardTab extracted to admin/DashboardTab.tsx + lazy-loaded below

// ════════════════════════════════════════════════════════════════
// Users tab
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — UsersTab extracted to admin/UsersTab.tsx + lazy-loaded below

function EditUserModal({ user, onClose, onSave }: { user: AdminUser; onClose: () => void; onSave: (body: { plan?: string; role?: string; banned?: boolean }) => Promise<void> }) {
  const [plan, setPlan] = useState(user.plan);
  const [role, setRole] = useState(user.role);
  const [banned, setBanned] = useState(user.banned);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">Edit user</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 mb-3">
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center font-bold">
            {(user.email ?? "U").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user.email}</p>
            <p className="text-[11px] text-gray-500">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Plan</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {["free", "pro"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={`h-10 rounded-xl border-2 text-sm font-medium capitalize ${plan === p ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-700"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {["user", "admin"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`h-10 rounded-xl border-2 text-sm font-medium capitalize ${role === r ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-700"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setBanned(!banned)}
            className={`w-full p-3 rounded-xl border-2 text-sm font-medium flex items-center justify-between ${banned ? "border-rose-500 bg-rose-50 text-rose-700" : "border-gray-200 text-gray-700"}`}
          >
            <span>{banned ? "Banned" : "Active"}</span>
            <span className={`w-10 h-5 rounded-full relative ${banned ? "bg-rose-500" : "bg-emerald-500"}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition ${banned ? "left-0.5" : "translate-x-5 left-0.5"}`} />
            </span>
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              await onSave({ plan, role, banned });
              setSaving(false);
            }}
            disabled={saving}
            className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// AI Providers tab
// ════════════════════════════════════════════════════════════════
const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "glm", label: "GLM (Z.ai)" },
  { value: "gemini", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "pollinations", label: "Pollinations" },
];

// Provider presets — auto-fills baseUrl + model dropdown + shows "Get Key" link
const PROVIDER_PRESETS: Record<string, {
  dashboardUrl: string;
  dashboardLabel: string;
  baseUrl: string;
  models: string[];
  note?: string;
}> = {
  openai: {
    dashboardUrl: "https://platform.openai.com/api-keys",
    dashboardLabel: "Get OpenAI API Key →",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "o1-mini", "o1-preview"],
    note: "Pay-as-you-go. gpt-4o-mini is cheapest (~$0.15/1M tokens).",
  },
  glm: {
    dashboardUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    dashboardLabel: "Get GLM API Key →",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4", "glm-4-flash", "glm-4-long"],
    note: "Zhipu AI — Chinese provider. glm-4-flash is free tier.",
  },
  gemini: {
    dashboardUrl: "https://aistudio.google.com/app/apikey",
    dashboardLabel: "Get Gemini API Key →",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b"],
    note: "Google AI Studio — free tier available (15 RPM, 1500/day).",
  },
  openrouter: {
    dashboardUrl: "https://openrouter.ai/keys",
    dashboardLabel: "Get OpenRouter API Key →",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "meta-llama/llama-3.1-8b-instruct",
      "meta-llama/llama-3.1-70b-instruct",
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "google/gemini-flash-1.5",
      "Qwen/Qwen2.5-7B-Instruct",
      "mistralai/mistral-7b-instruct",
      "deepseek/deepseek-chat",
      "anthropic/claude-3.5-sonnet",
    ],
    note: "Aggregator — access 100+ models with one key. Some models are free.",
  },
  huggingface: {
    dashboardUrl: "https://huggingface.co/settings/tokens",
    dashboardLabel: "Get Hugging Face Token →",
    baseUrl: "https://router.huggingface.co/v1",
    models: [
      "Qwen/Qwen2.5-7B-Instruct",
      "meta-llama/Meta-Llama-3-8B-Instruct",
      "meta-llama/Llama-3.2-3B-Instruct",
      "mistralai/Mistral-7B-Instruct-v0.3",
      "microsoft/Phi-3-mini-4k-instruct",
      "google/gemma-2-2b-it",
      "HuggingFaceH4/zephyr-7b-beta",
    ],
    note: "Free inference router. Enable providers at huggingface.co/settings/inference-providers",
  },
  pollinations: {
    dashboardUrl: "https://pollinations.ai",
    dashboardLabel: "Pollinations (free, no key needed) →",
    baseUrl: "https://text.pollinations.ai/openai",
    models: ["openai", "mistral", "llama", "deepseek"],
    note: "Completely free, no API key required. Rate-limited.",
  },
};

// Sensible defaults per provider — used to auto-fill baseUrl + model when
// admin selects a type and those fields are empty (prevents the "openrouter
// with OpenAI baseUrl" bug where the test call goes to the wrong endpoint).
const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai:       { baseUrl: "https://api.openai.com/v1",                                  model: "gpt-4o-mini" },
  glm:          { baseUrl: "https://api.openai.com/v1",                                  model: "glm-4" },
  gemini:       { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",   model: "gemini-1.5-flash" },
  openrouter:   { baseUrl: "https://openrouter.ai/api/v1",                               model: "openai/gpt-4o-mini" },
  huggingface:  { baseUrl: "https://router.huggingface.co",                                  model: "meta-llama/Llama-3.1-8B-Instruct" },
  pollinations: { baseUrl: "https://text.pollinations.ai/openai",                       model: "openai" },
};

// Phase 90.3 — ProvidersTab extracted to admin/ProvidersTab.tsx + lazy-loaded below

function ProviderFormModal({ provider, onClose, onSaved }: { provider: Provider | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(provider?.name ?? "");
  const [providerType, setProviderType] = useState(provider?.providerType ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [model, setModel] = useState(provider?.model ?? "");
  const [maxTokens, setMaxTokens] = useState(provider?.maxTokens ?? 2048);
  const [costPer1kTokens, setCostPer1kTokens] = useState(provider?.costPer1kTokens ?? 0);
  const [priority, setPriority] = useState(provider?.priority ?? 100);
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [isDefault, setIsDefault] = useState(provider?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = PROVIDER_PRESETS[providerType];

  // Auto-fill baseUrl + model when provider type changes
  useEffect(() => {
    if (!preset) return;
    setBaseUrl((cur) => (cur.trim() ? cur : preset.baseUrl));
    setModel((cur) => (cur.trim() ? cur : preset.models[0]));
  }, [providerType, preset]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        name,
        providerType,
        baseUrl: baseUrl || null,
        model: model || null,
        maxTokens,
        costPer1kTokens,
        priority,
        enabled,
        isDefault,
      };
      if (apiKey) body.apiKey = apiKey;
      const url = provider ? `/api/admin/providers/${provider.id}` : "/api/admin/providers";
      const method = provider ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      await onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{provider ? "Edit provider" : "Add AI provider"}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My OpenAI key" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </Field>
          <Field label="Provider type">
            <select value={providerType} onChange={(e) => setProviderType(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white">
              {PROVIDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          {/* Get API Key link */}
          {preset && (
            <a
              href={preset.dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline"
            >
              {preset.dashboardLabel}
            </a>
          )}

          {/* Provider note */}
          {preset?.note && (
            <p className="text-[11px] text-gray-400 italic">{preset.note}</p>
          )}

          <Field label={provider ? "API key (leave blank to keep current)" : "API key"}>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            <p className="text-[10px] text-gray-400 mt-1">Encrypted with AES-256-CBC before storage.</p>
          </Field>
          <Field label="Base URL">
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={preset?.baseUrl ?? "https://api.openai.com/v1"} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </Field>

          {/* Model — dropdown with known models + custom input option */}
          <Field label="Model">
            <select
              value={preset?.models.includes(model) ? model : "__custom__"}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  // keep current model value
                } else {
                  setModel(e.target.value);
                }
              }}
              className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white outline-none focus:border-indigo-400"
            >
              {preset?.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value="__custom__">{!model || preset?.models.includes(model) ? "Custom model..." : `Custom: ${model}`}</option>
            </select>
            {/* If custom is selected, show text input */}
            {(!preset?.models.includes(model) || model === "") && (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Enter custom model name"
                className="mt-1.5 w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
              />
            )}
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Max tokens">
              <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </Field>
            <Field label="Cost/1k">
              <input type="number" step="0.0001" value={costPer1kTokens} onChange={(e) => setCostPer1kTokens(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </Field>
            <Field label="Priority">
              <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </Field>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-indigo-600" />
              Enabled
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-indigo-600" />
              Default
            </label>
          </div>
          {error && <ErrorBox message={error} />}
          <button
            onClick={save}
            disabled={saving || !name}
            className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : provider ? "Save changes" : "Add provider"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Content tab — Books / Chapters / Topics + Generate
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — ContentTab extracted to admin/ContentTab.tsx + lazy-loaded below

function BooksSubtab() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/books");
      const d = await r.json();
      setBooks(d.books);
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newTitle.trim()) return;
    await fetch("/api/admin/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, description: newDesc || undefined }),
    });
    setNewTitle(""); setNewDesc(""); setAdding(false);
    await load();
  };

  const togglePublish = async (b: Book) => {
    await fetch(`/api/admin/books/${b.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !b.published }),
    });
    await load();
  };

  const del = async (b: Book) => {
    if (!confirm(`Delete "${b.title}"?`)) return;
    await fetch(`/api/admin/books/${b.id}`, { method: "DELETE" });
    await load();
  };

  if (loading) return <Spinner label="Loading books…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-2">
      {!adding && (
        <button onClick={() => setAdding(true)} className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-1 hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Add Book
        </button>
      )}
      {adding && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 space-y-2">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Book title" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" rows={2} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold">Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {books.map((b) => (
        <div key={b.id} className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{b.title}</p>
            <p className="text-[11px] text-gray-500">
              {b._count?.chapters ?? 0} chapters · {b.published ? "Published" : "Draft"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => togglePublish(b)}
              className={`px-2 py-1 rounded-full text-[10px] font-semibold ${b.published ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
            >
              {b.published ? "Published" : "Publish"}
            </button>
            <button onClick={() => del(b)} className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {books.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No books yet.</p>}
    </div>
  );
}

function ChaptersSubtab() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newBookId, setNewBookId] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([
        fetch("/api/admin/chapters").then((r) => r.json()),
        fetch("/api/admin/books").then((r) => r.json()),
      ]);
      setChapters(c.chapters);
      setBooks(b.books);
      if (!newBookId && b.books[0]) setNewBookId(b.books[0].id);
    } catch (e: any) {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newBookId || !newTitle.trim()) return;
    await fetch("/api/admin/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: newBookId, title: newTitle }),
    });
    setNewTitle(""); setAdding(false);
    await load();
  };

  const del = async (c: Chapter) => {
    if (!confirm(`Delete chapter "${c.title ?? "(untitled)"}"?`)) return;
    await fetch(`/api/admin/chapters/${c.id}`, { method: "DELETE" });
    await load();
  };

  if (loading) return <Spinner label="Loading chapters…" />;

  return (
    <div className="space-y-2">
      {!adding && (
        <button onClick={() => setAdding(true)} className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-1">
          <Plus className="w-4 h-4" /> Add Chapter
        </button>
      )}
      {adding && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 space-y-2">
          <select value={newBookId} onChange={(e) => setNewBookId(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm bg-white">
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Chapter title" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold">Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {chapters.map((c) => (
        <div key={c.id} className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{c.title ?? "(untitled)"}</p>
            <p className="text-[11px] text-gray-500">
              {c.book?.title ?? "—"} · {c._count?.topics ?? 0} topics
            </p>
          </div>
          <button onClick={() => del(c)} className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {chapters.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No chapters yet.</p>}
    </div>
  );
}

function TopicsSubtab() {
  const [topics, setTopics] = useState<AdminTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newName, setNewName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/topics");
      const d = await r.json();
      setTopics(d.topics);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newName.trim()) return;
    await fetch("/api/admin/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: newSubject || "General", name: newName }),
    });
    setNewSubject(""); setNewName(""); setAdding(false);
    await load();
  };

  const togglePublish = async (t: AdminTopic) => {
    await fetch(`/api/admin/topics/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !t.published }),
    });
    await load();
  };

  const del = async (t: AdminTopic) => {
    if (!confirm(`Delete topic "${t.name}"?`)) return;
    await fetch(`/api/admin/topics/${t.id}`, { method: "DELETE" });
    await load();
  };

  if (loading) return <Spinner label="Loading topics…" />;

  return (
    <div className="space-y-2">
      {!adding && (
        <button onClick={() => setAdding(true)} className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-1">
          <Plus className="w-4 h-4" /> Add Topic
        </button>
      )}
      {adding && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 space-y-2">
          <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Subject (e.g. Mathematics)" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Topic name (e.g. Quadratic Equations)" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold">Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {topics.map((t) => (
        <div key={t.id} className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
            <p className="text-[11px] text-gray-500">
              {t.subject} · {t._count?.cards ?? 0} cards · {t._count?.lessons ?? 0} lessons
              {t.chapter?.book?.title && ` · ${t.chapter.book.title}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => togglePublish(t)}
              className={`px-2 py-1 rounded-full text-[10px] font-semibold ${t.published ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
            >
              {t.published ? "Published" : "Draft"}
            </button>
            <button onClick={() => del(t)} className="w-7 h-7 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {topics.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No topics yet.</p>}
    </div>
  );
}

function GenerateSubtab() {
  const [mode, setMode] = useState<"book" | "topic">("book");
  const [text, setText] = useState("");
  const [topicName, setTopicName] = useState("");
  const [subject, setSubject] = useState("");
  const [numFlashcards, setNumFlashcards] = useState(5);
  const [numMCQs, setNumMCQs] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const url = mode === "book" ? "/api/admin/generate/book" : "/api/admin/generate/topic";
      const body = mode === "book"
        ? { text }
        : { topicName, subject: subject || "General", numFlashcards, numMCQs, text: text || undefined };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setResult(d);
    } catch (e: any) {
      setError(e?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium">
        {[
          { key: "book" as const, label: "From material → Book outline" },
          { key: "topic" as const, label: "Topic lesson + cards" },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`py-1.5 rounded-lg transition ${mode === m.key ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "topic" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Topic name">
            <input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="e.g. Photosynthesis" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          </Field>
          <Field label="Subject">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Science" className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          </Field>
          <Field label="Flashcards">
            <input type="number" min={0} max={12} value={numFlashcards} onChange={(e) => setNumFlashcards(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          </Field>
          <Field label="MCQs">
            <input type="number" min={0} max={12} value={numMCQs} onChange={(e) => setNumMCQs(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
          </Field>
        </div>
      )}

      <Field label="Source text (optional for topic, required for book)">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste notes, PDF text, or any study material…"
          className="w-full p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 resize-none"
        />
      </Field>

      {error && <ErrorBox message={error} />}

      <button
        onClick={generate}
        disabled={generating || (mode === "book" && !text.trim()) || (mode === "topic" && !topicName.trim())}
        className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {generating ? "Generating…" : `Generate ${mode}`}
      </button>

      {result && mode === "book" && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm space-y-2">
          <p className="text-sm font-bold text-gray-900">{result.title}</p>
          <p className="text-xs text-gray-600">{result.description}</p>
          {result.chapters?.map((c: any, i: number) => (
            <div key={i} className="rounded-xl bg-gray-50 p-2">
              <p className="text-xs font-semibold text-gray-900">{i + 1}. {c.title}</p>
              <ul className="mt-1 ml-3 list-disc text-[11px] text-gray-600">
                {c.topics?.map((t: any, j: number) => <li key={j}>{t.name} ({t.subject})</li>)}
              </ul>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 italic">Preview only — save via Books tab.</p>
        </div>
      )}

      {result && mode === "topic" && (
        <div className="rounded-2xl bg-white border border-gray-200 p-3 shadow-sm space-y-2">
          <p className="text-sm font-bold text-gray-900">{result.topicName}</p>
          {result.lesson?.introduction && (
            <p className="text-xs text-gray-700">{result.lesson.introduction}</p>
          )}
          {result.lesson?.keyConcepts && (
            <p className="text-[11px] text-gray-500">{result.lesson.keyConcepts.length} key concepts generated</p>
          )}
          <p className="text-[11px] text-gray-500">
            {result.flashcards?.length ?? 0} flashcards · {result.mcqs?.length ?? 0} MCQs
          </p>
          <p className="text-[10px] text-gray-400 italic">Preview only — save via Topics tab + /api/study-sets.</p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Logs tab
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — LogsTab extracted to admin/LogsTab.tsx + lazy-loaded below

// ════════════════════════════════════════════════════════════════
// Shared helpers
// ════════════════════════════════════════════════════════════════
function Spinner({ label }: { label: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin" />
      <span className="mt-2 text-xs">{label}</span>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Account tab (admin profile + change password + logout)
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — AccountTab extracted to admin/AccountTab.tsx + lazy-loaded below

// ════════════════════════════════════════════════════════════════
// Monetization tab — Plans, Payments, Activation Keys
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — MonetizationTab extracted to admin/MonetizationTab.tsx + lazy-loaded below

// ════════════════════════════════════════════════════════════════
// Search Settings tab — YouTube API key, Pollinations URL, image/video toggles
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — SearchSettingsTab extracted to admin/SearchSettingsTab.tsx + lazy-loaded below

// ════════════════════════════════════════════════════════════════
// Concept Map Settings tab — manage concept map generation + view all maps
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — ConceptMapSettingsTab extracted to admin/ConceptMapSettingsTab.tsx + lazy-loaded below

// ════════════════════════════════════════════════════════════════
// Path Templates tab — manage admin-created learning path templates
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — PathTemplatesTab extracted to admin/PathTemplatesTab.tsx + lazy-loaded below

// ════════════════════════════════════════════════════════════════
// Badges tab — manage gamification badges
// ════════════════════════════════════════════════════════════════
// Phase 90.3 — BadgesTab extracted to admin/BadgesTab.tsx + lazy-loaded below
