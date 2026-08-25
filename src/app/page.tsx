"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Eye, EyeOff, Check, AlertCircle, Loader2 } from "lucide-react";
import { useApp } from "@/components/studybuddy/store";
import { TopBar, DesktopTopBar } from "@/components/studybuddy/TopBar";
import { BottomNav, Sidebar } from "@/components/studybuddy/BottomNav";
import { CreateModal } from "@/components/studybuddy/screens/CreateModal";
import { Onboarding } from "@/components/studybuddy/screens/Onboarding";
import { Search } from "@/components/studybuddy/screens/Search";
import { Progress } from "@/components/studybuddy/screens/Progress";
import { Profile } from "@/components/studybuddy/screens/Profile";
import { Flashcards } from "@/components/studybuddy/screens/Flashcards";
import { Quiz } from "@/components/studybuddy/screens/Quiz";
import { GraphExplorer } from "@/components/studybuddy/screens/GraphExplorer";
import { LanguagePractice } from "@/components/studybuddy/screens/LanguagePractice";
import { AITutor } from "@/components/studybuddy/screens/AITutor";
import { LearningPathScreen } from "@/components/studybuddy/screens/LearningPath";
import { StudyRoom } from "@/components/studybuddy/screens/StudyRoom";
import { AdminPanel } from "@/components/studybuddy/screens/AdminPanel";
import { AdminLogin } from "@/components/studybuddy/screens/AdminLogin";
import { Landing } from "@/components/studybuddy/screens/Landing";
import { AuthScreen } from "@/components/studybuddy/screens/AuthScreen";
import { PremiumScreen } from "@/components/studybuddy/screens/PremiumScreen";
import { BillingScreen } from "@/components/studybuddy/screens/BillingScreen";
import { ConceptMapScreen } from "@/components/studybuddy/screens/ConceptMapScreen";
import { EarnCenterScreen } from "@/components/studybuddy/screens/EarnCenterScreen";
import { ClassroomScreen } from "@/components/studybuddy/screens/ClassroomScreen";
import { PathDashboard } from "@/components/studybuddy/screens/PathDashboard";
import { SchoolRegister } from "@/components/studybuddy/screens/SchoolRegister";
import { SchoolDashboard } from "@/components/studybuddy/screens/SchoolDashboard";
import { SchoolSubjectPath } from "@/components/studybuddy/screens/SchoolSubjectPath";
import { SchoolTimedTest } from "@/components/studybuddy/screens/SchoolTimedTest";
import { FamilyRegister } from "@/components/studybuddy/screens/FamilyRegister";
import { FamilyChildLogin } from "@/components/studybuddy/screens/FamilyChildLogin";
import { FamilyDashboard } from "@/components/studybuddy/screens/FamilyDashboard";
import { ParentDashboard } from "@/components/studybuddy/screens/ParentDashboard";
import { FamilyChildGuard } from "@/components/studybuddy/FamilyChildGuard";
import { CurriculumSubjectView } from "@/components/studybuddy/screens/CurriculumSubjectView";
import { CurriculumTopicView } from "@/components/studybuddy/screens/CurriculumTopicView";
import { CurriculumExamScreen } from "@/components/studybuddy/screens/CurriculumExamScreen";
import { CalendarScreen, TimetableScreen } from "@/components/studybuddy/screens/CalendarTimetable";
import { StudyBuddySelector } from "@/components/studybuddy/screens/StudyBuddySelector";

// Secret admin access code — type this word on the keyboard anywhere
// in the app to unlock the admin login screen.
// Also accessible via URL param: ?adminorg
const ADMIN_SECRET = "adminorg";

export default function Page() {
  const { screen, setScreen } = useApp();
  const keyBuffer = useRef("");
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Auth check on mount + URL param check for hidden admin access + reset password
  useEffect(() => {
    let mounted = true;

    // Check for URL parameters
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has(ADMIN_SECRET)) {
        setScreen("adminLogin");
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
      // Phase 23 — Reset password link from email
      if (params.has("reset")) {
        setResetToken(params.get("reset"));
        // Clear the user_token cookie if they're logged in (so the reset
        // screen shows on top of the landing, not the dashboard)
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    // Normal auth check
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then(async (d) => {
        if (!mounted || !d?.authed) return;
        if (d.user?.onboardingCompleted) {
          // Phase 20 — Family Mode has priority over School Mode for routing.
          // A family CHILD goes straight to their learning dashboard (home)
          // — the "Lock My Room" button in the TopBar lets them switch back.
          // A family PARENT goes to the family dashboard (children portals).
          if (d.isFamilyChild) {
            setScreen("home");
            return;
          }
          if (d.isFamilyParent) {
            setScreen("familyDashboard");
            return;
          }
          // Check if school student → redirect to school dashboard
          try {
            const sr = await fetch("/api/school/dashboard");
            const sd = await sr.json();
            if (sr.ok && sd.isSchoolStudent) {
              setScreen("schoolDashboard");
              return;
            }
          } catch {}
          setScreen("home");
        } else {
          setScreen("onboarding");
        }
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, [setScreen]);

  // Hidden admin keyboard code — type "adminorg" anywhere to unlock
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Only track letter keys
      if (e.key.length !== 1) return;

      keyBuffer.current = (keyBuffer.current + e.key.toLowerCase()).slice(-ADMIN_SECRET.length);

      if (keyBuffer.current === ADMIN_SECRET) {
        keyBuffer.current = "";
        setScreen("adminLogin");
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [setScreen]);

  // Immersive study modes have their own full-screen layout (no top bar / bottom nav).
  const immersive = ["flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "onboarding", "auth", "premium", "conceptMap", "earnCenter", "classroom", "schoolRegister", "schoolDashboard", "schoolSubject", "schoolTimedTest", "familyRegister", "familyChildLogin", "familyDashboard", "curriculumSubject", "curriculumTopic", "exam", "calendar", "timetable", "studyBuddy"];

  if (screen === "onboarding") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <Onboarding />
        <CreateModal />
      </div>
    );
  }

  if (screen === "landing" || screen === "adminLogin" || screen === "auth" || screen === "premium" || screen === "billing" || screen === "schoolRegister" || screen === "familyRegister" || screen === "familyChildLogin") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        {screen === "landing" && <Landing />}
        {screen === "adminLogin" && <AdminLogin />}
        {screen === "auth" && <AuthScreen />}
        {screen === "premium" && (
          <FamilyChildGuard>
            <PremiumScreen />
          </FamilyChildGuard>
        )}
        {screen === "billing" && (
          <FamilyChildGuard>
            <BillingScreen />
          </FamilyChildGuard>
        )}
        {screen === "schoolRegister" && <SchoolRegister />}
        {screen === "familyRegister" && <FamilyRegister />}
        {screen === "familyChildLogin" && <FamilyChildLogin />}
        <CreateModal />
      </div>
    );
  }

  if (immersive.includes(screen)) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        {screen === "flashcards" && <Flashcards />}
        {screen === "quiz" && <Quiz />}
        {screen === "graph" && <GraphExplorer />}
        {screen === "language" && <LanguagePractice />}
        {screen === "tutor" && <AITutor />}
        {screen === "path" && <LearningPathScreen />}
        {screen === "study" && <StudyRoom />}
        {screen === "admin" && <AdminPanel />}
        {screen === "conceptMap" && <ConceptMapScreen />}
        {screen === "earnCenter" && (
          <FamilyChildGuard>
            <EarnCenterScreen />
          </FamilyChildGuard>
        )}
        {screen === "classroom" && <ClassroomScreen />}
        {screen === "schoolDashboard" && <SchoolDashboard />}
        {screen === "schoolSubject" && <SchoolSubjectPath />}
        {screen === "schoolTimedTest" && <SchoolTimedTest />}
        {screen === "familyDashboard" && <FamilyDashboard />}
        {screen === "curriculumSubject" && <CurriculumSubjectView />}
        {screen === "curriculumTopic" && <CurriculumTopicView />}
        {screen === "exam" && <CurriculumExamScreen />}
        {screen === "calendar" && <CalendarScreen />}
        {screen === "timetable" && <TimetableScreen />}
        {screen === "studyBuddy" && <StudyBuddySelector />}
        <CreateModal />
      </div>
    );
  }

  // Tabbed screens — sidebar on desktop, top bar + bottom nav on mobile
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Sidebar />
      <div className="md:pl-60">
        <TopBar />
        <DesktopTopBar />
        <main>
          {screen === "home" && <PathDashboard />}
          {screen === "search" && <Search />}
          {screen === "progress" && <Progress />}
          {screen === "profile" && <Profile />}
          {screen === "parent" && <ParentDashboard />}
        </main>
      </div>
      <BottomNav />
      <CreateModal />
      {resetToken && (
        <ResetPasswordModal
          token={resetToken}
          onClose={() => setResetToken(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Phase 23 — Reset Password Modal (shown when user clicks email link)
// ---------------------------------------------------------------------

function ResetPasswordModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white">
          <h2 className="text-base font-bold">🔐 Set New Password</h2>
          <p className="text-[11px] opacity-90 mt-0.5">
            Enter your new password below
          </p>
        </div>
        <div className="p-5">
          {!done ? (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  New password
                </label>
                <div className="mt-1 relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    autoFocus
                    className="w-full pl-10 pr-10 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Confirm new password
                </label>
                <div className="mt-1 relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPw ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {busy ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</>
                ) : (
                  <>Reset password</>
                )}
              </button>
            </form>
          ) : (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <Check className="w-7 h-7 text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-gray-900">Password reset! ✅</p>
              <p className="text-xs text-gray-500 mt-1">
                Your password has been changed. You can now sign in with your new password.
              </p>
              <button
                onClick={onClose}
                className="mt-4 w-full h-10 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
              >
                Sign in →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
