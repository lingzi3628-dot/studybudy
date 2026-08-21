"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X, Loader2, AlertCircle, ChevronRight, Lock, Check, Play,
  Trophy, Clock,
} from "lucide-react";
import { useApp } from "../store";

export function SchoolSubjectPath() {
  const { setScreen } = useApp();
  const subjectId = (useApp() as any).activeSchoolSubjectId;
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!subjectId) { setError("No subject"); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/school/subjects/${subjectId}/topics`);
      const d = await r.json();
      if (r.ok) setTopics(d.topics ?? []);
      else setError(d.error ?? "Failed");
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    setLoading(false);
  }, [subjectId]);

  useEffect(() => { load(); }, [load]);

  const startTest = (topicId: string) => {
    (useApp.getState() as any).setActiveSchoolTopicId(topicId);
    setScreen("schoolTimedTest");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-violet-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-violet-50">
      <header className="bg-white/80 backdrop-blur sticky top-0 z-30 border-b border-gray-200 px-4 py-2">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <button onClick={() => setScreen("schoolDashboard")} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Topic Path</h1>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-4 pb-24">
        {error && <p className="text-xs text-rose-500 text-center py-4">{error}</p>}

        {/* Vertical topic nodes */}
        <div className="relative">
          {topics.map((topic, i) => (
            <div key={topic.id}>
              {/* Connector */}
              {i > 0 && (
                <div className={`w-1 h-6 mx-auto rounded-full ${topics[i - 1].status === "completed" ? "bg-emerald-400" : "bg-gray-200"}`} />
              )}
              {/* Node */}
              <button
                onClick={() => topic.status === "available" ? startTest(topic.id) : null}
                disabled={topic.status === "locked"}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition ${
                  topic.status === "completed" ? "bg-emerald-50 border-emerald-300" :
                  topic.status === "available" ? "bg-indigo-50 border-indigo-400 shadow-md ring-2 ring-indigo-200" :
                  "bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed"
                }`}
              >
                <span className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
                  topic.status === "completed" ? "bg-emerald-500 text-white" :
                  topic.status === "available" ? "bg-indigo-600 text-white animate-pulse" :
                  "bg-gray-200 text-gray-400"
                }`}>
                  {topic.status === "completed" ? <Check className="w-6 h-6" /> :
                   topic.status === "locked" ? <Lock className="w-5 h-5" /> :
                   <span className="text-base font-bold">{i + 1}</span>}
                </span>
                <div className="flex-1 text-left min-w-0">
                  <p className={`text-sm font-semibold truncate ${topic.status === "locked" ? "text-gray-400" : "text-gray-900"}`}>
                    {topic.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-[10px] text-gray-500">{topic.timeLimitMinutes} min · {topic.questionCount} Q</span>
                    {topic.status === "completed" && topic.score !== null && (
                      <span className="text-[10px] text-emerald-600 font-semibold">· {Math.round(topic.score * 100)}%</span>
                    )}
                  </div>
                </div>
                {topic.status === "completed" && <span className="text-2xl">{topic.badgeIcon}</span>}
                {topic.status === "available" && (
                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                    START
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
