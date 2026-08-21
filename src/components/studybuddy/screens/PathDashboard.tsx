"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X, Loader2, AlertCircle, Flame, Coins, Zap, Trophy,
  ChevronRight, Lock, Check, Play, Plus, Route,
  Sparkles, Bot,
} from "lucide-react";
import { useApp } from "../store";

type PathNode = {
  id: string;
  title: string;
  status: "completed" | "current" | "locked" | "unlocked";
  itemCount: number;
  completedItems: number;
};

/**
 * PathDashboard — Phase 17: Duolingo-style vertical path map.
 *
 * Replaces the Home screen. Shows the active Learning Path as a
 * scrollable node map with connectors, status indicators, and a
 * "Start" button on the current node.
 */
export function PathDashboard() {
  const { setScreen, setActiveTopicId, setActiveConceptMapId, setActiveStudySetId } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [tokens, setTokens] = useState<number | null>(null);
  const [coins, setCoins] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [showCreatePath, setShowCreatePath] = useState(false);
  const [pathForm, setPathForm] = useState({ skill: "", level: "beginner", goal: "" });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pathRes, xpRes, balRes] = await Promise.all([
        fetch("/api/dashboard/path"),
        fetch("/api/user/xp"),
        fetch("/api/user/balances"),
      ]);
      if (pathRes.ok) {
        const d = await pathRes.json();
        setData(d);
      }
      if (xpRes.ok) {
        const d = await xpRes.json();
        setStreak(d.streak ?? 0);
        setLevel(d.level ?? 1);
      }
      if (balRes.ok) {
        const d = await balRes.json();
        setTokens(d.tokens ?? 0);
        setCoins(d.coins ?? 0);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refetch on window focus (when user returns from Study Room/Classroom)
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const createPath = async () => {
    if (!pathForm.skill.trim()) {
      setError("Enter a skill/topic");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/paths/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill: pathForm.skill.trim(),
          level: pathForm.level,
          goal: pathForm.goal.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsUpgrade) {
          setError(d.error);
          return;
        }
        throw new Error(d.error ?? "Failed");
      }
      setToast("Learning path created! 🚀");
      setTimeout(() => setToast(null), 2500);
      setShowCreatePath(false);
      setPathForm({ skill: "", level: "beginner", goal: "" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    }
    setBusy(false);
  };

  const [startingNode, setStartingNode] = useState<string | null>(null);

  const startNode = async (node: PathNode) => {
    if (node.status === "locked" || startingNode) return;
    setStartingNode(node.id);
    try {
      const topicId = data?.path?.topicId;
      const skill = data?.path?.skill;
      if (topicId) {
        // Have topicId — go to Study Room
        (useApp.getState() as any).setActiveTopicId(topicId);
        setScreen("study");
      } else if (skill) {
        // No topicId — find or create a topic from the skill name
        // Use the /api/classroom/start endpoint which now accepts { skill }
        // and will find/create a topic, but we still go to Study Room (not classroom)
        const r = await fetch("/api/classroom/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill }),
        });
        const d = await r.json();
        if (r.ok && d.session) {
          const sessionTopicId = d.session?.topicId;
          if (sessionTopicId) {
            // Set topicId and go to Study Room (NOT classroom)
            // The user can start the classroom from the Study Room's Tools Workbench
            (useApp.getState() as any).setActiveTopicId(sessionTopicId);
            setScreen("study");
          } else {
            setToast("Could not find topic. Try refreshing.");
            setTimeout(() => setToast(null), 3000);
          }
        } else if (r.status === 402 && d.needsUpgrade) {
          setToast(d.error ?? "Need more tokens");
          setTimeout(() => setToast(null), 4000);
        } else {
          setToast(d.error ?? "Failed to start. Please try again.");
          setTimeout(() => setToast(null), 3000);
        }
      } else {
        setToast("No topic found. Create a path first.");
        setTimeout(() => setToast(null), 3000);
      }
    } catch (e: any) {
      setToast("Failed to start. Please try again.");
      setTimeout(() => setToast(null), 3000);
    }
    setStartingNode(null);
  };

  // Continue Learning card (for classroom sessions)
  const [classroomSession, setClassroomSession] = useState<any>(null);
  useEffect(() => {
    // Check for active classroom sessions
    fetch("/api/user/rental-status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { /* not relevant */ })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-violet-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const hasPath = data?.hasPath ?? false;
  const path = data?.path;
  const nodes: PathNode[] = data?.nodes ?? [];
  // Handle progress being a number OR an object {total, completed, percent}
  const progressPct = typeof path?.progress === "number"
    ? path.progress
    : path?.progress?.percent ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-violet-50">
      {/* No custom top bar — layout provides TopBar with avatar/streak/tokens/coins/level */}

      <div className="max-w-md mx-auto px-4 py-4 pb-24">
        {/* Small greeting */}
        <p className="text-sm font-semibold text-gray-700 mb-3">
          {(() => {
            const h = new Date().getHours();
            const name = data?.userName?.split(" ")[0] ?? "there";
            if (h < 12) return `Good morning, ${name}! ☀️`;
            if (h < 18) return `Good afternoon, ${name}! 🌤️`;
            return `Good evening, ${name}! 🌙`;
          })()}
        </p>

        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span>{error}</span>
              {/upgrade|premium/i.test(error) && (
                <button onClick={() => setScreen("premium")} className="ml-1 text-indigo-600 font-semibold underline">Upgrade →</button>
              )}
            </div>
          </div>
        )}

        {!hasPath ? (
          // No path — show "Create Your Learning Path"
          <div className="mt-8 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Route className="w-10 h-10 text-white" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900">Create Your Learning Path</h1>
            <p className="mt-1 text-sm text-gray-500">Your personalized study journey starts here. Pick a topic and we'll build a 4-week path for you.</p>
            <button
              onClick={() => setShowCreatePath(true)}
              className="mt-6 px-6 h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
            >
              Get Started →
            </button>
          </div>
        ) : (
          // Has path — show Duolingo-style node map
          <>
            {/* Due reviews node (if any) */}
            {(data?.dueReviewsCount ?? 0) > 0 && (
              <button
                onClick={() => setScreen("flashcards")}
                className="w-full mb-3 flex items-center gap-3 p-3 rounded-2xl bg-amber-50 border-2 border-amber-300 hover:border-amber-400 transition"
              >
                <span className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center text-xl flex-shrink-0 animate-pulse">
                  🔄
                </span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-amber-900">Review Due Now</p>
                  <p className="text-[10px] text-amber-700">{data.dueReviewsCount} cards ready for review</p>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-600" />
              </button>
            )}

            {/* Today's challenge banner */}
            {data?.todayChallenge?.tasks && Array.isArray(data.todayChallenge.tasks) && (data.todayChallenge.tasks as any[]).length > 0 && (
              <div className="mb-3 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 p-3 text-white shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide opacity-80">Today's Challenge</p>
                    <p className="text-sm font-bold">{(data.todayChallenge.tasks as any[]).filter((t: any) => !t.completed).length} tasks remaining</p>
                  </div>
                  <button onClick={() => setScreen("study")} className="px-3 h-7 rounded-full bg-white/20 text-white text-[10px] font-bold hover:bg-white/30">
                    Start →
                  </button>
                </div>
              </div>
            )}

            {/* Path header */}
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-gray-900">{path?.skill}</h1>
                  <p className="text-xs text-gray-500">{path?.subject ?? "General"} · {progressPct}% complete</p>
                </div>
                <button
                  onClick={() => setShowCreatePath(true)}
                  className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:border-indigo-300"
                  title="Create new path"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Smart Continue card — shows the current node */}
            {(() => {
              const currentNode = nodes.find(n => n.status === "current");
              if (!currentNode) return null;
              return (
                <button
                  onClick={() => startNode(currentNode)}
                  disabled={!!startingNode}
                  className="w-full mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white shadow-md hover:shadow-lg transition text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        {startingNode ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                      </span>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide opacity-80">Continue Learning</p>
                        <p className="text-sm font-bold">{currentNode.title}</p>
                        <p className="text-[11px] opacity-70">{currentNode.completedItems}/{currentNode.itemCount} items done</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </button>
              );
            })()}

            {/* Node map — vertical Duolingo-style */}
            <div className="relative">
              {nodes.map((node, i) => (
                <div key={node.id}>
                  {/* Connector line */}
                  {i > 0 && (
                    <div className={`w-1 h-8 mx-auto ${nodes[i - 1].status === "completed" ? "bg-emerald-400" : "bg-gray-200"} rounded-full`} />
                  )}
                  {/* Node */}
                  <button
                    onClick={() => startNode(node)}
                    disabled={node.status === "locked"}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition ${
                      node.status === "completed" ? "bg-emerald-50 border-emerald-300" :
                      node.status === "current" ? "bg-indigo-50 border-indigo-400 shadow-md ring-2 ring-indigo-200" :
                      node.status === "unlocked" ? "bg-white border-gray-200" :
                      "bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    {/* Node icon */}
                    <span className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${
                      node.status === "completed" ? "bg-emerald-500 text-white" :
                      node.status === "current" ? "bg-indigo-600 text-white animate-pulse" :
                      node.status === "unlocked" ? "bg-gray-200 text-gray-500" :
                      "bg-gray-200 text-gray-400"
                    }`}>
                      {node.status === "completed" ? <Check className="w-6 h-6" /> :
                       node.status === "locked" ? <Lock className="w-5 h-5" /> :
                       <span className="text-base font-bold">{i + 1}</span>}
                    </span>
                    {/* Node info */}
                    <div className="flex-1 text-left min-w-0">
                      <p className={`text-sm font-semibold truncate ${node.status === "locked" ? "text-gray-400" : "text-gray-900"}`}>
                        {node.title}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {node.completedItems}/{node.itemCount} items
                        {node.status === "current" && node.completedItems === 0 ? " · Tap START to begin!" : ""}
                        {node.status === "current" && node.completedItems > 0 ? " · Continue!" : ""}
                      </p>
                      {/* Mini progress bar inside node */}
                      {node.itemCount > 0 && (
                        <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              node.status === "completed" ? "bg-emerald-500" :
                              node.status === "current" ? "bg-indigo-500" : "bg-gray-300"
                            }`}
                            style={{ width: `${node.itemCount > 0 ? (node.completedItems / node.itemCount) * 100 : 0}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {/* Status indicator */}
                    {node.status === "current" && (
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center gap-1">
                        {startingNode === node.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                        {startingNode === node.id ? "…" : "START"}
                      </span>
                    )}
                    {node.status === "completed" && (
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Create new path button at bottom */}
            <button
              onClick={() => setShowCreatePath(true)}
              className="mt-6 w-full p-3 rounded-2xl border-2 border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create New Path
            </button>
          </>
        )}
      </div>

      {/* Create Path Modal */}
      {showCreatePath && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowCreatePath(false)}>
          <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Route className="w-4 h-4 text-indigo-600" /> Create Learning Path
              </h3>
              <button onClick={() => setShowCreatePath(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500">What do you want to learn?</label>
                <input
                  value={pathForm.skill}
                  onChange={(e) => setPathForm({ ...pathForm, skill: e.target.value })}
                  placeholder="e.g. Biology, Spanish, Algebra"
                  className="mt-1 w-full p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Current level</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {["beginner", "intermediate", "advanced"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setPathForm({ ...pathForm, level: l })}
                      className={`p-2 rounded-xl text-xs font-semibold capitalize ${pathForm.level === l ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Goal (optional)</label>
                <input
                  value={pathForm.goal}
                  onChange={(e) => setPathForm({ ...pathForm, goal: e.target.value })}
                  placeholder="e.g. Pass my exam"
                  className="mt-1 w-full p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <button
                onClick={createPath}
                disabled={busy || !pathForm.skill.trim()}
                className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Sparkles className="w-4 h-4" /> Create My Path</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
