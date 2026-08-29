"use client";

import { useEffect, useRef } from "react";
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
import { AITutorChat } from "@/components/studybuddy/screens/AITutorChat";
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
import { BookshelfScreen } from "@/components/studybuddy/screens/BookshelfScreen";
import { PrintableExamScreen } from "@/components/studybuddy/screens/PrintableExamScreen";
import { ExamHubScreen } from "@/components/studybuddy/screens/ExamHubScreen";
import { StudyGroupScreen } from "@/components/studybuddy/screens/StudyGroupScreen";
import { CodeRunner } from "@/components/studybuddy/screens/CodeRunner";
import { LabScreen } from "@/components/studybuddy/screens/LabScreen";
import { CalculatorScreen } from "@/components/studybuddy/screens/CalculatorScreen";
import { ProjectsScreen } from "@/components/studybuddy/screens/ProjectsScreen";
import { DevBuddyScreen } from "@/components/studybuddy/screens/DevBuddyScreen";

// Secret admin access code — type this word on the keyboard anywhere
// in the app to unlock the admin login screen.
// Also accessible via URL param: ?adminorg
const ADMIN_SECRET = "adminorg";

export default function Page() {
  const { screen, setScreen, darkMode } = useApp();
  const keyBuffer = useRef("");

  // Phase 24 — Initialize dark mode from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("studybuddy_dark");
      if (stored === "1") {
        document.documentElement.classList.add("dark");
        // Sync store state
        if (!darkMode) useApp.setState({ darkMode: true });
      }
    }
  }, []); // eslint-disable-line

  // Apply dark mode class when toggled
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", darkMode);
    }
  }, [darkMode]);

  // Auth check on mount + URL param check for hidden admin access
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
    }

    // Normal auth check
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then(async (d) => {
        if (!mounted || !d?.authed) return;
        // Phase 23b — If email not verified, go to auth screen
        if (!d.user?.emailVerified) {
          setScreen("auth");
          return;
        }
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
  const immersive = ["flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "onboarding", "auth", "premium", "conceptMap", "earnCenter", "classroom", "schoolRegister", "schoolDashboard", "schoolSubject", "schoolTimedTest", "familyRegister", "familyChildLogin", "familyDashboard", "curriculumSubject", "curriculumTopic", "exam", "calendar", "timetable", "studyBuddy", "bookshelf", "printableExam", "examHub", "studyGroup", "codeRunner", "lab", "calculator", "projects", "devBuddy"];

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
        {screen === "tutor" && <AITutorChat />}
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
        {screen === "bookshelf" && <BookshelfScreen />}
        {screen === "printableExam" && <PrintableExamScreen />}
        {screen === "examHub" && <ExamHubScreen />}
        {screen === "studyGroup" && <StudyGroupScreen />}
        {screen === "codeRunner" && <CodeRunner />}
        {screen === "lab" && <LabScreen />}
        {screen === "calculator" && <CalculatorScreen />}
        {screen === "projects" && <ProjectsScreen />}
        {screen === "devBuddy" && <DevBuddyScreen />}
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
    </div>
  );
}
