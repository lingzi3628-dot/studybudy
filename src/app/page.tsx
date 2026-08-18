"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/studybuddy/store";
import { TopBar, DesktopTopBar } from "@/components/studybuddy/TopBar";
import { BottomNav, Sidebar } from "@/components/studybuddy/BottomNav";
import { CreateModal } from "@/components/studybuddy/screens/CreateModal";
import { Onboarding } from "@/components/studybuddy/screens/Onboarding";
import { Home } from "@/components/studybuddy/screens/Home";
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

// Secret admin access code — type this word on the keyboard anywhere
// in the app to unlock the admin login screen.
// Also accessible via URL param: ?adminorg
const ADMIN_SECRET = "adminorg";

export default function Page() {
  const { screen, setScreen } = useApp();
  const keyBuffer = useRef("");

  // Auth check on mount + URL param check for hidden admin access
  useEffect(() => {
    let mounted = true;

    // Check for hidden admin URL parameter
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has(ADMIN_SECRET)) {
        setScreen("adminLogin");
        // Clean the URL so the param doesn't persist
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
    }

    // Normal auth check
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!mounted || !d?.authed) return;
        if (d.user?.onboardingCompleted) {
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
  const immersive = ["flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "onboarding", "auth", "premium"];

  if (screen === "onboarding") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <Onboarding />
        <CreateModal />
      </div>
    );
  }

  if (screen === "landing" || screen === "adminLogin" || screen === "auth" || screen === "premium") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        {screen === "landing" && <Landing />}
        {screen === "adminLogin" && <AdminLogin />}
        {screen === "auth" && <AuthScreen />}
        {screen === "premium" && <PremiumScreen />}
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
          {screen === "home" && <Home />}
          {screen === "search" && <Search />}
          {screen === "progress" && <Progress />}
          {screen === "profile" && <Profile />}
        </main>
      </div>
      <BottomNav />
      <CreateModal />
    </div>
  );
}
