"use client";

import { useEffect, useState } from "react";
import {
  Flame,
  Zap,
  Trophy,
  Award,
  TrendingDown,
  Star,
  Medal,
  Target,
  Rocket,
  Globe,
  Loader2,
  AlertCircle,
  Crown,
} from "lucide-react";
import { api, type Progress as ProgressData } from "../api";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  star: Star,
  trophy: Trophy,
  flame: Flame,
  award: Award,
  medal: Medal,
  rocket: Rocket,
  globe: Globe,
  target: Target,
};

const subjectColors: Record<string, string> = {
  Mathematics: "bg-indigo-600",
  Math: "bg-indigo-600",
  Science: "bg-emerald-500",
  English: "bg-violet-500",
  Kiswahili: "bg-amber-500",
  Chinese: "bg-rose-500",
  default: "bg-gray-500",
};

export function Progress() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Phase 46 — leaderboard state
  const [leaderboard, setLeaderboard] = useState<{ top10: any[]; userRank: number | null; userEntry: any } | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const p = await api.getProgress();
        if (!mounted) return;
        setData(p);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load progress");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    // Phase 46 — fetch leaderboard in parallel (best-effort, doesn't block the screen)
    (async () => {
      setLeaderboardLoading(true);
      try {
        const r = await fetch("/api/user/leaderboard");
        if (r.ok) {
          const d = await r.json();
          if (mounted) setLeaderboard(d);
        }
      } catch {
        /* ignore — leaderboard is optional */
      } finally {
        if (mounted) setLeaderboardLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="md:px-8 md:py-6">
        <div className="max-w-md mx-auto px-4 pt-10 pb-28 md:max-w-5xl md:px-0 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="ml-2 text-sm">Loading your progress…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="md:px-8 md:py-6">
        <div className="max-w-md mx-auto px-4 pt-10 pb-28 md:max-w-5xl md:px-0 flex flex-col items-center text-center">
          <AlertCircle className="w-8 h-8 text-rose-500" />
          <p className="mt-3 text-sm text-rose-600">{error ?? "Failed to load"}</p>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "XP points", value: data.xp.toLocaleString(), icon: Zap, color: "bg-indigo-50 text-indigo-600" },
    { label: "Level", value: `Lv. ${data.level}`, icon: Trophy, color: "bg-amber-50 text-amber-600" },
    { label: "Streak", value: `${data.streak} day${data.streak === 1 ? "" : "s"}`, icon: Flame, color: "bg-rose-50 text-rose-600" },
    { label: "Badges", value: `${data.badges.filter((b) => b.earned).length}/${data.badges.length}`, icon: Award, color: "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        <h1 className="text-2xl font-bold text-gray-900">Your Progress</h1>
        <p className="text-sm text-gray-500 mt-1">Keep up the great work{data.user.name ? `, ${data.user.name.split(" ")[0]}` : ""}!</p>

        {/* stats cards */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center ${s.color}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <p className="mt-3 text-xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* subject bar chart */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Performance by subject</h2>
          <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm space-y-4">
            {data.mastery.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No mastery data yet. Answer some flashcards or quizzes to see your subject performance.
              </p>
            ) : (
              data.mastery.map((m) => {
                const color = subjectColors[m.subject] ?? subjectColors.default;
                return (
                  <div key={m.subject}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{m.subject}</span>
                      <span className="font-semibold text-gray-900">{Math.round(m.mastery * 100)}%</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all`}
                        style={{ width: `${m.mastery * 100}%` }}
                      />
                    </div>
                    {m.topics.length > 1 && (
                      <div className="mt-2 ml-2 space-y-1">
                        {m.topics.map((t) => (
                          <div key={t.topic} className="flex items-center justify-between text-[11px] text-gray-500">
                            <span>{t.topic}</span>
                            <span>{Math.round(t.mastery * 100)}% · {t.correctAttempts}/{t.totalAttempts}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* weak areas */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-amber-500" /> Weak areas
          </h2>
          {data.weakAreas.length === 0 ? (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
              No weak areas yet — answer more questions to surface areas to improve.
            </div>
          ) : (
            <div className="space-y-2">
              {data.weakAreas.map((w) => (
                <div
                  key={`${w.subject}-${w.topic}`}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-gray-200 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                      <TrendingDown className="w-4 h-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{w.topic}</p>
                      <p className="text-xs text-gray-500">{w.subject}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                      Needs practice
                    </span>
                    <p className="mt-1 text-xs text-gray-500">Score: {Math.round(w.mastery * 100)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* badges */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Achievements</h2>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {data.badges.map((b) => {
              const Icon = iconMap[b.icon] ?? Award;
              return (
                <div
                  key={b.label}
                  className={`flex flex-col items-center text-center p-2 rounded-2xl border ${
                    b.earned ? "bg-white border-gray-200 shadow-sm" : "bg-gray-50 border-dashed border-gray-200 opacity-60"
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      b.earned ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white" : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="mt-1 text-[10px] font-medium text-gray-700 leading-tight">{b.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Phase 46 — Leaderboard */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-500" /> Leaderboard
            <span className="text-[10px] font-normal text-gray-500 ml-1">Monthly XP</span>
          </h2>

          {/* User's rank hero card */}
          {leaderboard?.userRank && (
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 p-4 text-white shadow-md mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold flex-shrink-0">
                  #{leaderboard.userRank}
                </div>
                <div className="flex-1">
                  <p className="text-xs opacity-80">Your rank</p>
                  <p className="text-base font-bold">
                    {leaderboard.userEntry?.monthXp?.toLocaleString() ?? 0} XP this month
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    Total: {leaderboard.userEntry?.xpTotal?.toLocaleString() ?? 0} XP
                  </p>
                </div>
                <Trophy className="w-6 h-6 opacity-80 flex-shrink-0" />
              </div>
            </div>
          )}

          {/* Top 10 list */}
          {leaderboardLoading ? (
            <div className="flex items-center justify-center text-gray-400 py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="ml-2 text-xs">Loading leaderboard…</span>
            </div>
          ) : leaderboard?.top10 && leaderboard.top10.length > 0 ? (
            <ol className="space-y-1.5">
              {leaderboard.top10.map((entry: any) => (
                <li
                  key={entry.userId}
                  className={`flex items-center gap-3 p-2.5 rounded-xl ${
                    entry.isCurrentUser
                      ? "bg-indigo-50 border border-indigo-200"
                      : entry.rank <= 3
                      ? "bg-amber-50/50"
                      : "bg-white border border-gray-100"
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      entry.rank === 1 ? "bg-amber-500 text-white"
                      : entry.rank === 2 ? "bg-gray-400 text-white"
                      : entry.rank === 3 ? "bg-amber-700 text-white"
                      : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {entry.rank <= 3 ? <Crown className="w-3.5 h-3.5" /> : `#${entry.rank}`}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(entry.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {entry.name}{entry.isCurrentUser && <span className="ml-1 text-indigo-600">(you)</span>}
                    </p>
                    <p className="text-[10px] text-gray-500">{entry.monthXp?.toLocaleString() ?? 0} XP / month</p>
                  </div>
                  <div className="text-right text-[10px] text-gray-500">
                    <p className="font-bold text-gray-700">{entry.xpTotal?.toLocaleString() ?? 0}</p>
                    <p>total</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">
              No leaderboard data yet — start studying to climb the ranks!
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
