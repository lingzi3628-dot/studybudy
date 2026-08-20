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
  | "dashboard";

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
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  toggleNotifications: () => set((s) => ({ notifications: !s.notifications })),
  apiKey: "",
  hasStoredApiKey: false,
  setApiKey: (v) => set({ apiKey: v }),
  setHasStoredApiKey: (v) => set({ hasStoredApiKey: v }),
  languageOfInstruction: "English",
  setLanguageOfInstruction: (v) => set({ languageOfInstruction: v }),
}));

export function resetOnboarding() {
  if (typeof window !== "undefined") localStorage.removeItem(LS_KEY);
  useApp.setState({ onboarded: false, screen: "onboarding" });
}
