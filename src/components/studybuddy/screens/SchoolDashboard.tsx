"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X, Loader2, AlertCircle, ChevronRight, Trophy, Flame,
  GraduationCap, Building2, Sparkles, Play,
} from "lucide-react";
import { useApp } from "../store";

/**
 * SchoolDashboard — Phase 18: subject grid with progress + badges.
 */
export function SchoolDashboard() {
  const { setScreen } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/school/dashboard");
      const d = await r.json();
      if (r.ok) setData(d);
      else setError(d.error ?? "Failed");
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-violet-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !data?.isSchoolStudent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-violet-50 px-4 text-center">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <p className="mt-3 text-sm text-gray-600">{error ?? "Not registered as a school student."}</p>
        <button onClick={() => setScreen("landing")} className="mt-4 px-4 h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold">
          Back to Home
        </button>
      </div>
    );
  }

  const student = data.student;
  const subjects = data.subjects ?? [];
  const firstTopic = data.firstAvailableTopic;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-violet-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur sticky top-0 z-30 border-b border-gray-200 px-4 py-2">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">{student?.fullName}</p>
            <p className="text-[10px] text-gray-500">{student?.gradeLevel} {student?.school?.name ? `· ${student.school.name}` : ""}</p>
          </div>
          <button onClick={() => setScreen("profile")} className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
            {student?.fullName?.charAt(0).toUpperCase() ?? "?"}
          </button>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Start here card */}
        {firstTopic && (
          <button onClick={() => {
            (useApp.getState() as any).setActiveSchoolSubjectId(firstTopic.subjectId);
            (useApp.getState() as any).setActiveSchoolTopicId(firstTopic.topicId);
            setScreen("schoolTimedTest");
          }}
            className="w-full rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white shadow-md hover:shadow-lg transition text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                  <Play className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-wide opacity-80">Start Here!</p>
                  <p className="text-sm font-bold">{firstTopic.topicName}</p>
                  <p className="text-[11px] opacity-70">{firstTopic.subjectName}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5" />
            </div>
          </button>
        )}

        {/* My Badges */}
        {(() => {
          const totalBadges = subjects.reduce((sum: number, s: any) => sum + (s.badgeCount ?? 0), 0);
          if (totalBadges > 0) {
            return (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <p className="text-sm font-bold text-amber-800">{totalBadges} badge{totalBadges > 1 ? "s" : ""} earned! 🎉</p>
              </div>
            );
          }
          return null;
        })()}

        {/* Subject grid */}
        <div>
          <h2 className="text-sm font-bold text-gray-900 mb-3">My Subjects</h2>
          {subjects.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No subjects enrolled yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {subjects.map((s: any) => (
                <button key={s.id} onClick={() => {
                  (useApp.getState() as any).setActiveSchoolSubjectId(s.id);
                  setScreen("schoolSubject");
                }}
                  className="rounded-2xl border-2 border-gray-200 p-3 bg-white hover:border-indigo-300 hover:shadow-md transition text-left"
                  style={{ borderColor: s.color + "40" }}>
                  <span className="text-3xl">{s.icon}</span>
                  <p className="mt-1 text-sm font-bold text-gray-900 truncate">{s.name}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden mr-2">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${s.totalTopics > 0 ? (s.completedTopics / s.totalTopics) * 100 : 0}%`, backgroundColor: s.color }} />
                    </div>
                    <span className="text-[9px] text-gray-500 font-semibold">{s.completedTopics}/{s.totalTopics}</span>
                  </div>
                  {s.badgeCount > 0 && (
                    <span className="mt-1 text-[9px] text-amber-600 font-semibold flex items-center gap-0.5">
                      <Trophy className="w-2.5 h-2.5" /> {s.badgeCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
