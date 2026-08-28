"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Users,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  LogOut,
  Flame,
  Trophy,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Send,
  X,
  Bot,
  Zap,
  Coins,
  CheckCircle2,
  BookOpen,
  Lock,
  Crown,
} from "lucide-react";
import { useApp } from "../store";

type Child = {
  id: string;
  username: string;
  displayName: string;
  gradeLevel: string | null;
  avatarEmoji: string | null;
  lastLogin: string | null;
};

type FamilyInfo = {
  id: string;
  displayName: string | null;
  parentEmail: string;
};

type Dashboard = {
  isFamilyMember: boolean;
  isFamilyParent?: boolean;
  family?: FamilyInfo;
  children?: Child[];
};

type ChildInsights = {
  child: {
    id: string;
    username: string;
    displayName: string;
    gradeLevel: string | null;
    avatarEmoji: string | null;
    lastLogin: string | null;
  };
  xp: number;
  level: number;
  streak: number;
  lastActivityDate: string | null;
  tokenBalance: number;
  coinBalance: number;
  masteryBySubject: Array<{ subject: string; mastery: number; attempts: number; correct: number; accuracy: number | null }>;
  weakAreas: Array<{ topic: string; mastery: number; attempts: number; subject?: string | null }>;
  accuracyTrend: number | null;
  recentAttempts: number;
  recentCorrect: number;
  totalTimeSpentSec: number;
  completedPathItems: number;
  avgPathScore: number | null;
  readiness: number;
  recentActivity: Array<{
    type: string;
    description: string;
    createdAt: string;
    subject?: string | null;
    score?: number | null;
  }>;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

/**
 * ParentDashboard — Phase 20c
 *
 * Parental insights panel. Shows per-child:
 *   - XP, level, streak
 *   - Subject mastery (with visual bar)
 *   - Recent accuracy + study time
 *   - Recent activity feed
 *   - Weak areas to focus on
 *
 * Has a floating AI Teacher bubble that the parent can ask questions about
 * their children's progress (uses /api/family/ai-teacher).
 */
export function ParentDashboard() {
  const { setScreen } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState<FamilyInfo | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [insights, setInsights] = useState<Record<string, ChildInsights>>({});
  const [activeChildId, setActiveChildId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/family/dashboard");
      const d: Dashboard = await r.json();
      if (!d.isFamilyParent) {
        setScreen("landing");
        return;
      }
      setFamily(d.family ?? null);
      setChildren(d.children ?? []);

      // Fetch insights for each child in parallel
      const kids = d.children ?? [];
      const entries = await Promise.all(
        kids.map(async (c) => {
          try {
            const ir = await fetch(`/api/family/insights?childId=${c.id}`);
            if (!ir.ok) return [c.id, null] as const;
            const data = await ir.json();
            return [c.id, data] as const;
          } catch {
            return [c.id, null] as const;
          }
        })
      );
      const map: Record<string, ChildInsights> = {};
      for (const [id, data] of entries) {
        if (data) map[id] = data;
      }
      setInsights(map);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [setScreen]);

  useEffect(() => {
    load();
  }, [load]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setScreen("landing");
  };

  // Build a context string for the AI teacher, summarizing all children
  const buildAIContext = (): string => {
    if (children.length === 0) return "";
    return children
      .map((c) => {
        const i = insights[c.id];
        if (!i) {
          return `• ${c.displayName} (grade ${c.gradeLevel ?? "unknown"}): no activity yet.`;
        }
        const subjectLine =
          i.masteryBySubject.length > 0
            ? i.masteryBySubject
                .map((m) => `${m.subject}: ${Math.round(m.mastery * 100)}% mastery (${m.attempts} attempts, ${m.accuracy !== null ? Math.round(m.accuracy * 100) + "%" : "n/a"} accuracy)`)
                .join("; ")
            : "no subjects started yet";
        const weakLine =
          i.weakAreas.length > 0
            ? `Weak areas: ${i.weakAreas.map((w) => w.topic).join(", ")}.`
            : "";
        return [
          `• ${c.displayName} (grade ${c.gradeLevel ?? "unknown"}):`,
          `  XP: ${i.xp}, Level ${i.level}, Streak: ${i.streak} days`,
          `  Total study time: ${Math.round(i.totalTimeSpentSec / 60)} min`,
          `  Recent accuracy: ${i.accuracyTrend !== null ? Math.round(i.accuracyTrend * 100) + "%" : "n/a"} (${i.recentAttempts} recent answers, ${i.recentCorrect} correct)`,
          `  Readiness score: ${i.readiness}/100`,
          `  ${subjectLine}.`,
          weakLine,
          `  Completed ${i.completedPathItems} learning path items.`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 max-w-sm w-full text-center">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="mt-2 text-sm text-rose-700">{error}</p>
          <button
            onClick={() => setScreen("home")}
            className="mt-3 text-xs font-bold text-rose-700 hover:underline"
          >
            Go to home →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => setScreen("home")}
            className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Home
          </button>
          <h1 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-indigo-600" /> Parent Dashboard
          </h1>
          <button
            onClick={logout}
            className="text-xs font-semibold text-gray-500 hover:text-rose-600 flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Family summary banner */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-bold">{family?.displayName ?? "Your Family"}</p>
              <p className="text-xs opacity-90">
                {children.length} {children.length === 1 ? "child" : "children"} · {family?.parentEmail}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setScreen("familyDashboard")}
              className="px-3 h-9 rounded-full bg-white/15 hover:bg-white/25 transition text-xs font-semibold flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" /> Open portals
            </button>
          </div>
        </div>

        {/* Phase 46 — Alerts banner + sibling comparison */}
        {children.length > 0 && Object.keys(insights).length > 0 && (
          <AlertsAndComparison children={children} insights={insights} />
        )}

        {/* Per-child insights cards */}
        {children.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
            <Users className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="mt-2 text-sm text-gray-600">No children yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {children.map((c) => (
              <ChildInsightsCard
                key={c.id}
                child={c}
                insights={insights[c.id]}
                onOpenPortals={() => setScreen("familyDashboard")}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating AI Teacher bubble */}
      <FloatingAITeacher
        contextBuilder={buildAIContext}
        hasChildren={children.length > 0}
      />
    </div>
  );
}

function ChildInsightsCard({
  child,
  insights,
  onOpenPortals,
}: {
  child: Child;
  insights?: ChildInsights;
  onOpenPortals: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!insights) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{child.avatarEmoji ?? "🧒"}</span>
          <div className="flex-1">
            <p className="text-base font-bold text-gray-900">{child.displayName}</p>
            <p className="text-[11px] text-gray-500">
              {child.gradeLevel ?? "No grade set"} · @{child.username}
            </p>
          </div>
          <span className="text-[10px] text-gray-400">No activity yet</span>
        </div>
      </div>
    );
  }

  const studyMin = Math.round(insights.totalTimeSpentSec / 60);
  const lastLogin = insights.child.lastLogin
    ? new Date(insights.child.lastLogin).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "—";

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition"
      >
        <span className="text-3xl">{child.avatarEmoji ?? "🧒"}</span>
        <div className="flex-1 text-left">
          <p className="text-base font-bold text-gray-900">{child.displayName}</p>
          <p className="text-[11px] text-gray-500">
            {child.gradeLevel ?? "No grade set"} · Last login {lastLogin}
          </p>
        </div>
        {/* Mini stats row */}
        <div className="flex items-center gap-2">
          <MiniStat icon={Trophy} value={`L${insights.level}`} color="violet" />
          <MiniStat icon={Flame} value={`${insights.streak}d`} color="amber" />
          <MiniStat icon={Coins} value={`${insights.coinBalance}`} color="yellow" />
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">
          {/* Top metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard
              icon={Zap}
              label="XP"
              value={insights.xp}
              color="indigo"
            />
            <MetricCard
              icon={Target}
              label="Readiness"
              value={`${insights.readiness}%`}
              color={insights.readiness >= 70 ? "emerald" : insights.readiness >= 40 ? "amber" : "rose"}
            />
            <MetricCard
              icon={Clock}
              label="Study time"
              value={`${studyMin}m`}
              color="blue"
            />
            <MetricCard
              icon={CheckCircle2}
              label="Path items"
              value={insights.completedPathItems}
              color="emerald"
            />
          </div>

          {/* Subject mastery bars */}
          {insights.masteryBySubject.length > 0 ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                Subject mastery
              </p>
              <div className="space-y-2">
                {insights.masteryBySubject.slice(0, 5).map((m) => (
                  <div key={m.subject}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">{m.subject}</span>
                      <span className="text-gray-500">
                        {Math.round(m.mastery * 100)}% · {m.attempts} attempts
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          m.mastery >= 0.7
                            ? "bg-emerald-500"
                            : m.mastery >= 0.4
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.round(m.mastery * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">
              No subject data yet — start a quiz to see mastery here.
            </p>
          )}

          {/* Weak areas */}
          {insights.weakAreas.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Needs work
              </p>
              <div className="flex flex-wrap gap-1.5">
                {insights.weakAreas.map((w, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-semibold border border-rose-200"
                  >
                    {w.topic} ({Math.round(w.mastery * 100)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent activity feed */}
          {insights.recentActivity.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Recent activity
              </p>
              <ul className="space-y-1">
                {insights.recentActivity.slice(0, 5).map((a, i) => (
                  <li key={i} className="text-[11px] text-gray-600 flex items-center gap-2">
                    <span className="text-gray-400">
                      {new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <span className="flex-1">{a.description}</span>
                    {a.subject && (
                      <span className="text-gray-400">· {a.subject}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action button */}
          <button
            onClick={onOpenPortals}
            className="w-full h-9 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-xs hover:bg-indigo-100 transition flex items-center justify-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" /> Open portals to start their session
          </button>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  color: "violet" | "amber" | "yellow" | "indigo" | "emerald";
}) {
  const colorMap = {
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    yellow: "bg-yellow-50 text-yellow-700",
    indigo: "bg-indigo-50 text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${colorMap[color]}`}>
      <Icon className="w-3 h-3" />
      {value}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: "indigo" | "emerald" | "amber" | "rose" | "blue";
}) {
  const colorMap = {
    indigo: "text-indigo-600 bg-indigo-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    rose: "text-rose-600 bg-rose-50",
    blue: "text-blue-600 bg-blue-50",
  };
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-2.5">
      <div className={`w-7 h-7 rounded-lg ${colorMap[color]} flex items-center justify-center mb-1`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-base font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

/**
 * Floating AI Teacher — a chat bubble that floats in the bottom-right corner.
 * The parent can ask questions like "How is Mike doing?" or "What should
 * I focus on with John this week?"
 */
function FloatingAITeacher({
  contextBuilder,
  hasChildren,
}: {
  contextBuilder: () => string;
  hasChildren: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Hi! I'm your AI Teacher Assistant. I can see how each of your children is doing. Ask me anything — like 'How is Mike doing?' or 'What should John focus on this week?'",
        },
      ]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setError(null);

    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages(next);

    try {
      const r = await fetch("/api/family/ai-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          messages: next.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          childrenContext: contextBuilder(),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      setMessages((m) => [...m, { role: "assistant", content: d.reply }]);
    } catch (e: any) {
      setError(e?.message ?? "AI Teacher call failed");
    } finally {
      setBusy(false);
    }
  };

  if (!hasChildren) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl hover:scale-105 transition flex items-center justify-center"
          aria-label="Ask AI Teacher"
          title="Ask the AI Teacher about your children"
        >
          <Bot className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full ring-2 ring-white animate-pulse" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-96 max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-3 text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">AI Teacher</p>
              <p className="text-[10px] opacity-90">Ask about your children</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50"
            style={{ minHeight: "200px", maxHeight: "50vh" }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                    m.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {m.role === "assistant" && (
                    <div className="flex items-center gap-1 mb-1 text-[10px] text-indigo-600 font-bold uppercase">
                      <Sparkles className="w-3 h-3" /> AI Teacher
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                </div>
              </div>
            )}
            {error && (
              <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2">
                {error}
              </div>
            )}
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && (
            <div className="px-3 py-2 border-t border-gray-100 flex flex-wrap gap-1">
              {["How are my kids doing overall?", "Who needs the most help?", "Suggest a study plan for this week"].map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={busy}
                  className="text-[11px] px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-2 border-t border-gray-100 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your children…"
              className="flex-1 px-3 py-2 rounded-full bg-gray-100 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:bg-white"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50 hover:bg-indigo-700 transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/**
 * Phase 46 — AlertsAndComparison
 *
 * Surfaces:
 *   1. Alerts when a child's mastery drops below 0.4 or their streak broke.
 *   2. A side-by-side comparison of children's XP / mastery / streak to spot
 *      the struggler at a glance.
 *
 * Renders only when the parent has 1+ children with insights loaded.
 */
function AlertsAndComparison({
  children,
  insights,
}: {
  children: Array<{ id: string; displayName: string; username: string; avatarEmoji?: string | null }>;
  insights: Record<string, ChildInsights>;
}) {
  type Alert = { childId: string; childName: string; severity: "high" | "medium"; message: string };
  const alerts: Alert[] = [];

  for (const c of children) {
    const i = insights[c.id];
    if (!i) continue;
    // High-severity: avg mastery < 0.4 across all subjects
    const avgMastery =
      i.masteryBySubject.length > 0
        ? i.masteryBySubject.reduce((s, m) => s + m.mastery, 0) / i.masteryBySubject.length
        : null;
    if (avgMastery !== null && avgMastery < 0.4) {
      alerts.push({
        childId: c.id,
        childName: c.displayName,
        severity: "high",
        message: `Mastery dropped below 40% — needs focused support (avg ${Math.round(avgMastery * 100)}%).`,
      });
    }
    // Medium-severity: streak broke (no activity in 2+ days)
    if (i.lastActivityDate) {
      const daysSince = (Date.now() - new Date(i.lastActivityDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince >= 2) {
        alerts.push({
          childId: c.id,
          childName: c.displayName,
          severity: "medium",
          message: `No activity for ${Math.round(daysSince)} days — streak likely broken.`,
        });
      }
    }
  }

  // Sibling comparison — sort by readiness desc, show as a compact leaderboard
  const ranking = children
    .map((c) => ({ child: c, insights: insights[c.id] }))
    .filter((x) => x.insights)
    .sort((a, b) => (b.insights.readiness ?? 0) - (a.insights.readiness ?? 0));

  return (
    <div className="space-y-3">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className={`rounded-2xl border p-4 ${alerts.some(a => a.severity === "high") ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"}`}>
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-2">
            <AlertTriangle className={`w-4 h-4 ${alerts.some(a => a.severity === "high") ? "text-rose-600" : "text-amber-600"}`} />
            Attention needed
          </p>
          <ul className="space-y-1.5">
            {alerts.map((a, i) => (
              <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.severity === "high" ? "bg-rose-500" : "bg-amber-500"}`} />
                <span><b>{a.childName}:</b> {a.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sibling comparison */}
      {ranking.length >= 2 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
            <Crown className="w-4 h-4 text-amber-500" /> Sibling Comparison
            <span className="text-[10px] font-normal text-gray-500 ml-1">By readiness score</span>
          </p>
          <div className="space-y-2">
            {ranking.map((r, i) => (
              <div key={r.child.id} className="flex items-center gap-3">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-gray-400 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-lg flex-shrink-0">{r.child.avatarEmoji ?? "🧒"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">{r.child.displayName}</p>
                  <p className="text-[10px] text-gray-500">
                    {r.insights.xp.toLocaleString()} XP · Lvl {r.insights.level} · {r.insights.streak}d streak
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{r.insights.readiness ?? 0}</p>
                  <p className="text-[9px] text-gray-500">readiness</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
