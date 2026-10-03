"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useApp } from "@/components/studybuddy/store";
import { TopBar, DesktopTopBar } from "@/components/studybuddy/TopBar";
import { BottomNav, Sidebar } from "@/components/studybuddy/BottomNav";
import { CreateModal } from "@/components/studybuddy/screens/CreateModal";
import { PostOnboardingPopup } from "@/components/studybuddy/screens/PostOnboardingPopup";
import { SentryErrorBoundary } from "@/components/SentryErrorBoundary";
import { OfflineBanner } from "@/components/studybuddy/OfflineBanner";
import { MaintenanceBanner } from "@/components/studybuddy/MaintenanceBanner";
import { FamilyChildGuard } from "@/components/studybuddy/FamilyChildGuard";
import { PathDashboard } from "@/components/studybuddy/screens/PathDashboard";

// Phase 90.1 — Lazy-load all screen components with next/dynamic.
// This cuts the initial JS bundle by ~70% — only the currently-rendered
// screen's code is loaded, not all 73 screens at once.
// Loading fallback shows a simple spinner while the chunk downloads.
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
  </div>
);

// Phase F0 — New dashboard (feature-flagged). Lazy-loaded so it doesn't
// bloat the initial bundle when the flag is off.
const NewHome = dynamic(() => import("@/components/studybuddy/screens/NewHome").then(m => ({ default: m.NewHome })), { loading: () => <LoadingFallback /> });
// Phase F2 — New dashboards for higher-ed + dev tracks (same feature flag)
const NewHigherEdHome = dynamic(() => import("@/components/studybuddy/screens/NewHigherEdHome").then(m => ({ default: m.NewHigherEdHome })), { loading: () => <LoadingFallback /> });
const NewTrackHome = dynamic(() => import("@/components/studybuddy/screens/NewTrackHome").then(m => ({ default: m.NewTrackHome })), { loading: () => <LoadingFallback /> });
// Feature flag: NEXT_PUBLIC_NEW_DASHBOARD="true" enables the new clear-starting-point
// dashboard for ALL tracks. Default: off (old dashboards render).
const USE_NEW_DASHBOARD = process.env.NEXT_PUBLIC_NEW_DASHBOARD === "true";

const Onboarding = dynamic(() => import("@/components/studybuddy/screens/Onboarding").then(m => ({ default: m.Onboarding })), { loading: () => <LoadingFallback /> });
const Search = dynamic(() => import("@/components/studybuddy/screens/Search").then(m => ({ default: m.Search })), { loading: () => <LoadingFallback /> });
const Progress = dynamic(() => import("@/components/studybuddy/screens/Progress").then(m => ({ default: m.Progress })), { loading: () => <LoadingFallback /> });
const Profile = dynamic(() => import("@/components/studybuddy/screens/Profile").then(m => ({ default: m.Profile })), { loading: () => <LoadingFallback /> });
const Flashcards = dynamic(() => import("@/components/studybuddy/screens/Flashcards").then(m => ({ default: m.Flashcards })), { loading: () => <LoadingFallback /> });
const Quiz = dynamic(() => import("@/components/studybuddy/screens/Quiz").then(m => ({ default: m.Quiz })), { loading: () => <LoadingFallback /> });
const GraphExplorer = dynamic(() => import("@/components/studybuddy/screens/GraphExplorer").then(m => ({ default: m.GraphExplorer })), { loading: () => <LoadingFallback /> });
const LanguagePractice = dynamic(() => import("@/components/studybuddy/screens/LanguagePractice").then(m => ({ default: m.LanguagePractice })), { loading: () => <LoadingFallback /> });
const AITutorChat = dynamic(() => import("@/components/studybuddy/screens/AITutorChat").then(m => ({ default: m.AITutorChat })), { loading: () => <LoadingFallback /> });
const LearningPathScreen = dynamic(() => import("@/components/studybuddy/screens/LearningPath").then(m => ({ default: m.LearningPathScreen })), { loading: () => <LoadingFallback /> });
const StudyRoom = dynamic(() => import("@/components/studybuddy/screens/StudyRoom").then(m => ({ default: m.StudyRoom })), { loading: () => <LoadingFallback /> });
const AdminPanel = dynamic(() => import("@/components/studybuddy/screens/AdminPanel").then(m => ({ default: m.AdminPanel })), { loading: () => <LoadingFallback /> });
const AdminLogin = dynamic(() => import("@/components/studybuddy/screens/AdminLogin").then(m => ({ default: m.AdminLogin })), { loading: () => <LoadingFallback /> });
const GameHub = dynamic(() => import("@/components/studybuddy/screens/GameHub").then(m => ({ default: m.GameHub })), { loading: () => <LoadingFallback /> });
const Landing = dynamic(() => import("@/components/studybuddy/screens/Landing").then(m => ({ default: m.Landing })), { loading: () => <LoadingFallback /> });
const AuthScreen = dynamic(() => import("@/components/studybuddy/screens/AuthScreen").then(m => ({ default: m.AuthScreen })), { loading: () => <LoadingFallback /> });
const PremiumScreen = dynamic(() => import("@/components/studybuddy/screens/PremiumScreen").then(m => ({ default: m.PremiumScreen })), { loading: () => <LoadingFallback /> });
const BillingScreen = dynamic(() => import("@/components/studybuddy/screens/BillingScreen").then(m => ({ default: m.BillingScreen })), { loading: () => <LoadingFallback /> });
const ConceptMapScreen = dynamic(() => import("@/components/studybuddy/screens/ConceptMapScreen").then(m => ({ default: m.ConceptMapScreen })), { loading: () => <LoadingFallback /> });
const EarnCenterScreen = dynamic(() => import("@/components/studybuddy/screens/EarnCenterScreen").then(m => ({ default: m.EarnCenterScreen })), { loading: () => <LoadingFallback /> });
const ClassroomScreen = dynamic(() => import("@/components/studybuddy/screens/ClassroomScreen").then(m => ({ default: m.ClassroomScreen })), { loading: () => <LoadingFallback /> });
const SchoolRegister = dynamic(() => import("@/components/studybuddy/screens/SchoolRegister").then(m => ({ default: m.SchoolRegister })), { loading: () => <LoadingFallback /> });
const SchoolDashboard = dynamic(() => import("@/components/studybuddy/screens/SchoolDashboard").then(m => ({ default: m.SchoolDashboard })), { loading: () => <LoadingFallback /> });
const SchoolSubjectPath = dynamic(() => import("@/components/studybuddy/screens/SchoolSubjectPath").then(m => ({ default: m.SchoolSubjectPath })), { loading: () => <LoadingFallback /> });
const SchoolTimedTest = dynamic(() => import("@/components/studybuddy/screens/SchoolTimedTest").then(m => ({ default: m.SchoolTimedTest })), { loading: () => <LoadingFallback /> });
const FamilyRegister = dynamic(() => import("@/components/studybuddy/screens/FamilyRegister").then(m => ({ default: m.FamilyRegister })), { loading: () => <LoadingFallback /> });
const FamilyChildLogin = dynamic(() => import("@/components/studybuddy/screens/FamilyChildLogin").then(m => ({ default: m.FamilyChildLogin })), { loading: () => <LoadingFallback /> });
const FamilyDashboard = dynamic(() => import("@/components/studybuddy/screens/FamilyDashboard").then(m => ({ default: m.FamilyDashboard })), { loading: () => <LoadingFallback /> });
const ParentDashboard = dynamic(() => import("@/components/studybuddy/screens/ParentDashboard").then(m => ({ default: m.ParentDashboard })), { loading: () => <LoadingFallback /> });
const CurriculumSubjectView = dynamic(() => import("@/components/studybuddy/screens/CurriculumSubjectView").then(m => ({ default: m.CurriculumSubjectView })), { loading: () => <LoadingFallback /> });
const CurriculumTopicView = dynamic(() => import("@/components/studybuddy/screens/CurriculumTopicView").then(m => ({ default: m.CurriculumTopicView })), { loading: () => <LoadingFallback /> });
const CurriculumExamScreen = dynamic(() => import("@/components/studybuddy/screens/CurriculumExamScreen").then(m => ({ default: m.CurriculumExamScreen })), { loading: () => <LoadingFallback /> });
const CalendarScreen = dynamic(() => import("@/components/studybuddy/screens/CalendarTimetable").then(m => ({ default: m.CalendarScreen })), { loading: () => <LoadingFallback /> });
const TimetableScreen = dynamic(() => import("@/components/studybuddy/screens/CalendarTimetable").then(m => ({ default: m.TimetableScreen })), { loading: () => <LoadingFallback /> });
const StudyBuddySelector = dynamic(() => import("@/components/studybuddy/screens/StudyBuddySelector").then(m => ({ default: m.StudyBuddySelector })), { loading: () => <LoadingFallback /> });
const BookshelfScreen = dynamic(() => import("@/components/studybuddy/screens/BookshelfScreen").then(m => ({ default: m.BookshelfScreen })), { loading: () => <LoadingFallback /> });
const PrintableExamScreen = dynamic(() => import("@/components/studybuddy/screens/PrintableExamScreen").then(m => ({ default: m.PrintableExamScreen })), { loading: () => <LoadingFallback /> });
const ExamHubScreen = dynamic(() => import("@/components/studybuddy/screens/ExamHubScreen").then(m => ({ default: m.ExamHubScreen })), { loading: () => <LoadingFallback /> });
const StudyGroupScreen = dynamic(() => import("@/components/studybuddy/screens/StudyGroupScreen").then(m => ({ default: m.StudyGroupScreen })), { loading: () => <LoadingFallback /> });
const CodeRunner = dynamic(() => import("@/components/studybuddy/screens/CodeRunner").then(m => ({ default: m.CodeRunner })), { loading: () => <LoadingFallback /> });
const LabScreen = dynamic(() => import("@/components/studybuddy/screens/LabScreen").then(m => ({ default: m.LabScreen })), { loading: () => <LoadingFallback /> });
const CalculatorScreen = dynamic(() => import("@/components/studybuddy/screens/CalculatorScreen").then(m => ({ default: m.CalculatorScreen })), { loading: () => <LoadingFallback /> });
const ProjectsScreen = dynamic(() => import("@/components/studybuddy/screens/ProjectsScreen").then(m => ({ default: m.ProjectsScreen })), { loading: () => <LoadingFallback /> });
const DevBuddyScreen = dynamic(() => import("@/components/studybuddy/screens/DevBuddyScreen").then(m => ({ default: m.DevBuddyScreen })), { loading: () => <LoadingFallback /> });
const NotebookScreen = dynamic(() => import("@/components/studybuddy/screens/NotebookScreen").then(m => ({ default: m.NotebookScreen })), { loading: () => <LoadingFallback /> });
const MLPlaygroundScreen = dynamic(() => import("@/components/studybuddy/screens/MLPlaygroundScreen").then(m => ({ default: m.MLPlaygroundScreen })), { loading: () => <LoadingFallback /> });
const WebBuilderScreen = dynamic(() => import("@/components/studybuddy/screens/WebBuilderScreen").then(m => ({ default: m.WebBuilderScreen })), { loading: () => <LoadingFallback /> });
const BackendBuddyScreen = dynamic(() => import("@/components/studybuddy/screens/BackendBuddyScreen").then(m => ({ default: m.BackendBuddyScreen })), { loading: () => <LoadingFallback /> });
const PromptPlaygroundScreen = dynamic(() => import("@/components/studybuddy/screens/PromptPlaygroundScreen").then(m => ({ default: m.PromptPlaygroundScreen })), { loading: () => <LoadingFallback /> });
const ServerBuddyScreen = dynamic(() => import("@/components/studybuddy/screens/ServerBuddyScreen").then(m => ({ default: m.ServerBuddyScreen })), { loading: () => <LoadingFallback /> });
const TVETBuddyScreen = dynamic(() => import("@/components/studybuddy/screens/TVETBuddyScreen").then(m => ({ default: m.TVETBuddyScreen })), { loading: () => <LoadingFallback /> });
const HigherEdHome = dynamic(() => import("@/components/studybuddy/screens/HigherEdHome").then(m => ({ default: m.HigherEdHome })), { loading: () => <LoadingFallback /> });
const TrackHome = dynamic(() => import("@/components/studybuddy/screens/TrackHome").then(m => ({ default: m.TrackHome })), { loading: () => <LoadingFallback /> });
const ExploreScreen = dynamic(() => import("@/components/studybuddy/screens/ExploreScreen").then(m => ({ default: m.ExploreScreen })), { loading: () => <LoadingFallback /> });
const ChatbotPlayground = dynamic(() => import("@/components/studybuddy/screens/ChatbotPlayground").then(m => ({ default: m.ChatbotPlayground })), { loading: () => <LoadingFallback /> });
const AITemplatesScreen = dynamic(() => import("@/components/studybuddy/screens/AITemplatesScreen").then(m => ({ default: m.AITemplatesScreen })), { loading: () => <LoadingFallback /> });
const DataLabScreen = dynamic(() => import("@/components/studybuddy/screens/DataLabScreen").then(m => ({ default: m.DataLabScreen })), { loading: () => <LoadingFallback /> });

// Secret admin access code — type this word on the keyboard anywhere
// in the app to unlock the admin login screen.
// Also accessible via URL param: ?adminorg
const ADMIN_SECRET = "adminorg";

export default function Page() {
  const { screen, setScreen, darkMode, setActiveTopicId } = useApp();
  const keyBuffer = useRef("");
  // Phase 61 — user's education track (k12 | dev | data | ml | aiapp | tvet | server | backend | web | mixed)
  // Drives which Home screen we render.
  // Initialize from localStorage FIRST (synchronous) so the routing is correct
  // immediately on page load — no flash of the wrong dashboard while the
  // /api/auth/me fetch is in flight. The fetch then verifies/syncs with the
  // server in case the user logged in on a different device.
  const [userTrack, setUserTrack] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("studybuddy_user_track");
      if (stored && stored !== "k12") return stored;
    }
    return "k12";
  });
  // Phase 85.3 — also load the user's course from localStorage for routing
  const [userCourse, setUserCourse] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("studybuddy_user_course");
    }
    return null;
  });

  // Phase 61 — fetch the user's track from /api/auth/me on mount to verify
  // the localStorage value matches the server (in case they switched tracks
  // on another device). Also updates localStorage when the server says
  // something different.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.track) {
          const serverTrack = d.user.track;
          // Update localStorage so the next page load is instant
          try { localStorage.setItem("studybuddy_user_track", serverTrack); } catch { /* ignore */ }
          // Only update state if it changed (avoids unnecessary re-renders)
          setUserTrack((prev) => (prev !== serverTrack ? serverTrack : prev));
        }
        if (d?.user?.course) {
          try { localStorage.setItem("studybuddy_user_course", d.user.course); } catch { /* ignore */ }
          setUserCourse(d.user.course);
        }
      })
      .catch(() => {});
  }, []);

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
        const continueParams = new URLSearchParams(window.location.search);
        const continueTopic = continueParams.get("continueTopic");
        if (continueTopic) {
          setActiveTopicId(continueTopic);
          setScreen("study");
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        if (continueParams.has("continueTutor")) {
          setScreen("tutor");
          window.history.replaceState({}, "", window.location.pathname);
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
  }, [setScreen, setActiveTopicId]);

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
  const immersive = ["flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "onboarding", "auth", "premium", "conceptMap", "earnCenter", "classroom", "schoolRegister", "schoolDashboard", "schoolSubject", "schoolTimedTest", "familyRegister", "familyChildLogin", "familyDashboard", "curriculumSubject", "curriculumTopic", "exam", "calendar", "timetable", "studyBuddy", "bookshelf", "printableExam", "examHub", "studyGroup", "codeRunner", "lab", "calculator", "projects", "devBuddy", "notebook", "mlPlayground", "webBuilder", "backendBuddy", "promptPlayground", "serverBuddy", "tvetBuddy", "explore", "chatbotPlayground", "aiTemplates", "dataLab", "gameHub"];

  if (screen === "onboarding") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <OfflineBanner />
        <MaintenanceBanner />
        <Onboarding />
        <CreateModal />
      </div>
    );
  }

  if (screen === "landing" || screen === "adminLogin" || screen === "auth" || screen === "premium" || screen === "billing" || screen === "schoolRegister" || screen === "familyRegister" || screen === "familyChildLogin") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <OfflineBanner />
        <MaintenanceBanner />
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
      <SentryErrorBoundary>
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
        {screen === "notebook" && <NotebookScreen />}
        {screen === "mlPlayground" && <MLPlaygroundScreen />}
        {screen === "webBuilder" && <WebBuilderScreen />}
        {screen === "backendBuddy" && <BackendBuddyScreen />}
        {screen === "promptPlayground" && <PromptPlaygroundScreen />}
        {screen === "serverBuddy" && <ServerBuddyScreen />}
        {screen === "tvetBuddy" && <TVETBuddyScreen />}
        {screen === "explore" && <ExploreScreen />}
        {screen === "chatbotPlayground" && <ChatbotPlayground />}
        {screen === "aiTemplates" && <AITemplatesScreen />}
        {screen === "dataLab" && <DataLabScreen />}
        {screen === "gameHub" && <GameHub />}
        <CreateModal />
        <PostOnboardingPopup />
      </div>
      </SentryErrorBoundary>
    );
  }

  // Tabbed screens — sidebar on desktop, top bar + bottom nav on mobile
  return (
    <SentryErrorBoundary>
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <OfflineBanner />
      <Sidebar />
      <div className="md:pl-60">
        <TopBar />
        <DesktopTopBar />
        <main>
          {/* Phase 85.3 — Home screen routes based on the user's education track + course.
              - K-12 + Secondary → PathDashboard (curriculum-focused)
              - University / College / TVET → HigherEdHome (course-aware dashboard)
              - Legacy "mixed" with a course set → HigherEdHome (treat as university)
              - Dev tracks (dev/data/ml/web/backend/server) + legacy "mixed" without course → TrackHome */}
          {screen === "home" && (userTrack === "k12" || userTrack === "secondary") && (USE_NEW_DASHBOARD ? <NewHome /> : <PathDashboard />)}
          {screen === "home" && (userTrack === "university" || userTrack === "college" || userTrack === "tvet" || (userTrack === "mixed" && userCourse)) && (USE_NEW_DASHBOARD ? <NewHigherEdHome /> : <HigherEdHome />)}
          {screen === "home" && userTrack !== "k12" && userTrack !== "secondary" && userTrack !== "university" && userTrack !== "college" && userTrack !== "tvet" && !(userTrack === "mixed" && userCourse) && (USE_NEW_DASHBOARD ? <NewTrackHome track={userTrack} /> : <TrackHome track={userTrack} />)}
          {screen === "search" && <Search />}
          {screen === "progress" && <Progress />}
          {screen === "profile" && <Profile />}
          {screen === "parent" && <ParentDashboard />}
          {screen === "explore" && <ExploreScreen />}
        </main>
      </div>
      <BottomNav />
      <CreateModal />
      <PostOnboardingPopup />
    </div>
    </SentryErrorBoundary>
  );
}
