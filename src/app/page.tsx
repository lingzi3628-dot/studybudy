"use client";

import { useEffect } from "react";
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

export default function Page() {
  const { screen, setScreen } = useApp();

  // Auth check on mount: redirect authed users to home/onboarding,
  // keep unauthed users on landing.
  useEffect(() => {
    let mounted = true;
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

  // Immersive study modes have their own full-screen layout (no top bar / bottom nav).
  const immersive = ["flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "onboarding", "auth"];

  if (screen === "onboarding") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <Onboarding />
        <CreateModal />
      </div>
    );
  }

  if (screen === "landing" || screen === "adminLogin" || screen === "auth") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        {screen === "landing" && <Landing />}
        {screen === "adminLogin" && <AdminLogin />}
        {screen === "auth" && <AuthScreen />}
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
