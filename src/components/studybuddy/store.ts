"use client";

import { create } from "zustand";

export type Screen =
  | "onboarding"
  | "home"
  | "search"
  | "progress"
  | "profile"
  | "flashcards"
  | "quiz"
  | "graph"
  | "language"
  | "tutor"
  | "path"
  | "study"
  | "admin"
  | "adminLogin"
  | "landing"
  | "auth"
  | "premium"
  | "billing"
  | "conceptMap"
  | "earnCenter"
  | "classroom"
  | "dashboard"
  | "schoolRegister"
  | "schoolDashboard"
  | "schoolSubject"
  | "schoolTimedTest"
  | "familyRegister"
  | "familyChildLogin"
  | "familyDashboard"
  | "parent"
  | "curriculumSubject"
  | "curriculumTopic"
  | "exam"
  | "calendar"
  | "timetable"
  | "studyBuddy"
  | "bookshelf"
  | "printableExam"
  | "examHub"
  | "studyGroup"
  | "codeRunner"
  | "lab"
  | "calculator"
  | "projects"
  | "devBuddy"
  | "notebook"
  | "mlPlayground"
  | "webBuilder"
  | "backendBuddy"
  | "promptPlayground"
  | "serverBuddy"
  | "tvetBuddy"
  | "higherEdHome";

export type CreateOption =
  | "upload"
  | "paste"
  | "flashcards"
  | "quiz"
  | "graph"
  | "tutor"
  | "conceptMap"
  | null;

interface AppState {
  // navigation
  screen: Screen;
  setScreen: (s: Screen) => void;

  // active study set (for quiz mode etc)
  activeStudySetId: string | null;
  setActiveStudySetId: (id: string | null) => void;

  // active topic for Study Room
  activeTopicId: string | null;
  setActiveTopicId: (id: string | null) => void;

  // active concept map for ConceptMapScreen
  activeConceptMapId: string | null;
  setActiveConceptMapId: (id: string | null) => void;

  // Phase 16 — active classroom session for guided flow
  activeClassroomSessionId: string | null;
  setActiveClassroomSessionId: (id: string | null) => void;

  // Phase 18 — school mode
  activeSchoolSubjectId: string | null;
  setActiveSchoolSubjectId: (id: string | null) => void;
  activeSchoolTopicId: string | null;
  setActiveSchoolTopicId: (id: string | null) => void;

  // Phase 22 — curriculum engine
  activeCurriculumSubjectId: string | null;
  setActiveCurriculumSubjectId: (id: string | null) => void;
  activeCurriculumTopicId: string | null;
  setActiveCurriculumTopicId: (id: string | null) => void;
  activeExamId: string | null;
  setActiveExamId: (id: string | null) => void;

  // Phase 46 — active study group (for StudyGroupScreen)
  activeStudyGroupId: string | null;
  setActiveStudyGroupId: (id: string | null) => void;

  // Phase 48 — active project id (for DevBuddy / Notebook / Web Builder screens)
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;

  // Phase 57 — Notebook ↔ ML Playground bridge
  // mlBridgeCsv: a CSV payload produced by a notebook table output, consumed
  // (and cleared) by MLPlaygroundScreen on mount.
  mlBridgeCsv: string | null;
  setMlBridgeCsv: (csv: string | null) => void;
  // notebookBridgeCell: Keras training code exported from MLPlayground,
  // consumed (and cleared) by NotebookScreen on mount.
  notebookBridgeCell: { code: string; label: string } | null;
  setNotebookBridgeCell: (cell: { code: string; label: string } | null) => void;

  // create modal
  createOpen: boolean;
  openCreate: (option?: CreateOption) => void;
  closeCreate: () => void;
  createOption: CreateOption;

  // onboarding completion (persists in localStorage)
  onboarded: boolean;
  completeOnboarding: () => void;

  // profile settings
  darkMode: boolean;
  notifications: boolean;
  toggleDarkMode: () => void;
  toggleNotifications: () => void;
  apiKey: string;
  hasStoredApiKey: boolean;
  setApiKey: (v: string) => void;
  setHasStoredApiKey: (v: boolean) => void;
  languageOfInstruction: string;
  setLanguageOfInstruction: (v: string) => void;
  // Phase 45 — low-bandwidth / data-saver mode
  dataSaver: boolean;
  toggleDataSaver: () => void;
  setDataSaver: (v: boolean) => void;
}

const LS_KEY = "studybuddy_onboarded";

// Always start on landing — auth check in page.tsx redirects authed users
// to home/onboarding after mount.
export const useApp = create<AppState>((set) => ({
  screen: "landing",
  setScreen: (s) => set({ screen: s }),

  activeStudySetId: null,
  setActiveStudySetId: (id) => set({ activeStudySetId: id }),

  activeTopicId: null,
  setActiveTopicId: (id) => set({ activeTopicId: id }),

  activeConceptMapId: null,
  setActiveConceptMapId: (id) => set({ activeConceptMapId: id }),

  activeClassroomSessionId: null,
  setActiveClassroomSessionId: (id) => set({ activeClassroomSessionId: id }),

  activeSchoolSubjectId: null,
  setActiveSchoolSubjectId: (id) => set({ activeSchoolSubjectId: id }),
  activeSchoolTopicId: null,
  setActiveSchoolTopicId: (id) => set({ activeSchoolTopicId: id }),

  // Phase 22 — curriculum engine
  activeCurriculumSubjectId: null,
  setActiveCurriculumSubjectId: (id) => set({ activeCurriculumSubjectId: id }),
  activeCurriculumTopicId: null,
  setActiveCurriculumTopicId: (id) => set({ activeCurriculumTopicId: id }),
  activeExamId: null,
  setActiveExamId: (id) => set({ activeExamId: id }),

  // Phase 46 — active study group
  activeStudyGroupId: null,
  setActiveStudyGroupId: (id) => set({ activeStudyGroupId: id }),

  // Phase 48 — active project id (for DevBuddy / future Notebook / Web Builder)
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),

  // Phase 57 — Notebook ↔ ML Playground bridge
  mlBridgeCsv: null,
  setMlBridgeCsv: (csv) => set({ mlBridgeCsv: csv }),
  notebookBridgeCell: null,
  setNotebookBridgeCell: (cell) => set({ notebookBridgeCell: cell }),

  createOpen: false,
  createOption: null,
  openCreate: (option = null) => set({ createOpen: true, createOption: option }),
  closeCreate: () => set({ createOpen: false, createOption: null }),

  onboarded: false,
  completeOnboarding: () => {
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, "1");
    set({ onboarded: true, screen: "home" });
  },

  darkMode: false,
  notifications: true,
  toggleDarkMode: () => {
    set((s) => {
      const newMode = !s.darkMode;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", newMode);
        localStorage.setItem("studybuddy_dark", newMode ? "1" : "0");
      }
      return { darkMode: newMode };
    });
  },
  toggleNotifications: () => set((s) => ({ notifications: !s.notifications })),
  apiKey: "",
  hasStoredApiKey: false,
  setApiKey: (v) => set({ apiKey: v }),
  setHasStoredApiKey: (v) => set({ hasStoredApiKey: v }),
  languageOfInstruction: "English",
  setLanguageOfInstruction: (v) => set({ languageOfInstruction: v }),
  // Phase 45 — low-bandwidth / data-saver mode (persisted in localStorage).
  // When true, the app:
  //   - Skips Pollinations image generation in AI Tutor
  //   - Hides the model-comparison panel (it makes 2-5x API calls)
  //   - Limits AI Tutor response length via a system-prompt hint
  //   - Replaces heavy graph animations with static renderings
  dataSaver: typeof window !== "undefined" && localStorage.getItem("studybuddy_datasaver") === "1",
  toggleDataSaver: () => {
    set((s) => {
      const next = !s.dataSaver;
      if (typeof window !== "undefined") localStorage.setItem("studybuddy_datasaver", next ? "1" : "0");
      return { dataSaver: next };
    });
  },
  setDataSaver: (v) => {
    if (typeof window !== "undefined") localStorage.setItem("studybuddy_datasaver", v ? "1" : "0");
    set({ dataSaver: v });
  },
}));

export function resetOnboarding() {
  if (typeof window !== "undefined") localStorage.removeItem(LS_KEY);
  useApp.setState({ onboarded: false, screen: "onboarding" });
}
