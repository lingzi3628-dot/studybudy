"use client";

import { useState, useEffect } from "react";
import { useApp } from "../store";
import { Sparkles, BookOpen, ChevronRight, Loader2, GraduationCap } from "lucide-react";

/**
 * PostOnboardingPopup — Phase 87
 *
 * After onboarding completes, shows a popup prompting the user to create
 * their first study set / learning path. After creating (or skipping),
 * redirects to the AI Tutor with an automated greeting message:
 * "Hello [name]! Where can we start today?"
 *
 * The AI Tutor picks up the pendingAutoGreeting from the store and
 * auto-sends it on first load.
 */
export function PostOnboardingPopup() {
  const { showPostOnboardingPopup, setShowPostOnboardingPopup, setScreen, setPendingAutoGreeting } = useApp();
  const [userName, setUserName] = useState("");
  const [studySetName, setStudySetName] = useState("");
  const [creating, setCreating] = useState(false);

  // Fetch user name for the greeting
  useEffect(() => {
    if (!showPostOnboardingPopup) return;
    (async () => {
      try {
        const r = await fetch("/api/auth/me");
        if (r.ok) {
          const d = await r.json();
          if (d.user?.name) setUserName(d.user.name.split(" ")[0]);
          else if (d.user?.email) setUserName(d.user.email.split("@")[0]);
        }
      } catch {}
    })();
  }, [showPostOnboardingPopup]);

  if (!showPostOnboardingPopup) return null;

  const handleCreate = async () => {
    setCreating(true);
    try {
      // Create a study set if a name was provided
      if (studySetName.trim()) {
        await fetch("/api/studysets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: studySetName.trim() }),
        }).catch(() => {});
      }
    } finally {
      setCreating(false);
      // Set the auto-greeting + redirect to AI Tutor
      // Phase 88.6 — Make the greeting PROACTIVE: the AI should propose a topic
      // instead of asking "where can we start?" (which makes the student decide)
      const greeting = userName
        ? `Hi ${userName}! 👋 Welcome to StudyBuddy. I'm your AI tutor and I'll be guiding your learning journey. Let's get started! Based on your course, I'd like to teach you about the first key concept. Ready?`
        : `Hi! 👋 Welcome to StudyBuddy. I'm your AI tutor and I'll be guiding your learning journey. Let's get started! I'll teach you the first key concept from your course. Ready?`;
      setPendingAutoGreeting(greeting);
      setShowPostOnboardingPopup(false);
      setScreen("tutor");
    }
  };

  const handleSkip = () => {
    const greeting = userName
      ? `Hi ${userName}! 👋 Welcome to StudyBuddy. I'm your AI tutor and I'll be guiding your learning journey. Let's get started! Based on your course, I'd like to teach you about the first key concept. Ready?`
      : `Hi! 👋 Welcome to StudyBuddy. I'm your AI tutor and I'll be guiding your learning journey. Let's get started! I'll teach you the first key concept from your course. Ready?`;
    setPendingAutoGreeting(greeting);
    setShowPostOnboardingPopup(false);
    setScreen("tutor");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4">
          <GraduationCap className="w-8 h-8 text-white" />
        </div>

        <h2 className="text-xl font-bold text-gray-900 text-center">Welcome to StudyBuddy! 🎉</h2>
        <p className="text-sm text-gray-500 text-center mt-2">
          Let's set up your first study set so the AI Tutor can personalize your learning.
        </p>

        {/* Study set input */}
        <div className="mt-5">
          <label className="text-xs font-semibold text-gray-700 mb-1 block">Study set name (optional)</label>
          <input
            type="text"
            value={studySetName}
            onChange={(e) => setStudySetName(e.target.value)}
            placeholder="e.g. Grade 5 Math, Form 4 Physics, Law Revision…"
            className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            autoFocus
          />
          <p className="text-[10px] text-gray-400 mt-1">
            This helps organize your notes, flashcards, and progress. You can create more later.
          </p>
        </div>

        {/* Buttons */}
        <div className="mt-5 space-y-2">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition"
          >
            {creating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
            ) : (
              <>Create & Start Learning <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
          <button
            onClick={handleSkip}
            disabled={creating}
            className="w-full h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold"
          >
            Skip for now — go straight to AI Tutor
          </button>
        </div>

        <p className="text-[10px] text-gray-400 text-center mt-3">
          Your AI Tutor will greet you by name and ask where you'd like to start.
        </p>
      </div>
    </div>
  );
}
