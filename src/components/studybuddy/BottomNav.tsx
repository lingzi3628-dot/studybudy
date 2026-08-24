"use client";

import { useEffect, useState } from "react";
import { Home, Search, Plus, BarChart3, User, Users } from "lucide-react";
import { useApp, type Screen } from "./store";

type Tab = {
  key: Screen;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * BottomNav / Sidebar — main navigation.
 *
 * Family parents get an extra "Children" tab that routes to the parent
 * dashboard (children portals + parental insights + AI teacher).
 * The tab is fetched on mount via /api/auth/me (isFamilyParent flag).
 */
export function BottomNav() {
  const { screen, setScreen, openCreate, createOpen } = useApp();
  const [isFamilyParent, setIsFamilyParent] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (mounted && d?.authed && d.isFamilyParent) {
          setIsFamilyParent(true);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const hidden: Screen[] = ["onboarding", "flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "auth", "premium", "familyRegister", "familyChildLogin", "familyDashboard", "schoolRegister"];
  if (hidden.includes(screen)) return null;
  if (createOpen) return null;

  // Parents get an extra "Children" tab. We drop Profile off the mobile nav
  // for parents (they can still access it via Home → Profile avatar) to keep
  // the 5-tab layout.
  const tabs: Tab[] = isFamilyParent
    ? [
        { key: "home", label: "Home", icon: Home },
        { key: "search", label: "Search", icon: Search },
        { key: "home", label: "Create", icon: Plus },
        { key: "parent", label: "Children", icon: Users },
        { key: "progress", label: "Progress", icon: BarChart3 },
      ]
    : [
        { key: "home", label: "Home", icon: Home },
        { key: "search", label: "Search", icon: Search },
        { key: "home", label: "Create", icon: Plus },
        { key: "progress", label: "Progress", icon: BarChart3 },
        { key: "profile", label: "Profile", icon: User },
      ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 pb-safe">
      <div className="max-w-md mx-auto px-2 h-16 grid grid-cols-5 items-center">
        {tabs.map((tab, idx) => {
          const isCenter = idx === 2;
          const active = screen === tab.key && !isCenter;

          if (isCenter) {
            return (
              <button
                key="create"
                aria-label="Create"
                onClick={() => openCreate()}
                className="flex flex-col items-center justify-center"
              >
                <span className="w-12 h-12 -mt-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg ring-4 ring-white hover:bg-indigo-700 transition">
                  <tab.icon className="w-6 h-6" />
                </span>
                <span className="text-[10px] mt-0.5 text-indigo-600 font-semibold">Create</span>
              </button>
            );
          }

          const Icon = tab.icon;
          return (
            <button
              key={tab.label}
              aria-label={tab.label}
              onClick={() => setScreen(tab.key)}
              className="flex flex-col items-center justify-center gap-0.5"
            >
              <Icon className={`w-5 h-5 ${active ? "text-indigo-600" : "text-gray-400"}`} />
              <span className={`text-[10px] ${active ? "text-indigo-600 font-semibold" : "text-gray-400"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Desktop sidebar (md+). Parents get an extra "My Children" item.
 */
export function Sidebar() {
  const { screen, setScreen, openCreate, createOpen } = useApp();
  const [isFamilyParent, setIsFamilyParent] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (mounted && d?.authed && d.isFamilyParent) {
          setIsFamilyParent(true);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const hidden: Screen[] = ["onboarding", "flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "auth", "premium", "familyRegister", "familyChildLogin", "familyDashboard", "schoolRegister"];
  if (hidden.includes(screen)) return null;
  if (createOpen) return null;

  const items: { key: Screen; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "home", label: "Home", icon: Home },
    { key: "search", label: "Search", icon: Search },
    { key: "progress", label: "Progress", icon: BarChart3 },
    ...(isFamilyParent
      ? [{ key: "parent" as Screen, label: "My Children", icon: Users }]
      : []),
    { key: "profile", label: "Profile", icon: User },
  ];

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-white border-r border-gray-200 px-4 py-6 z-30">
      {/* brand */}
      <div className="flex items-center gap-2 px-2 mb-6">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold">
          S
        </span>
        <span className="text-base font-bold text-gray-900">StudyBuddy AI</span>
      </div>

      {/* nav items */}
      <nav className="flex-1 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = screen === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setScreen(it.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "text-indigo-600" : "text-gray-400"}`} />
              {it.label}
            </button>
          );
        })}
      </nav>

      {/* raised Create button */}
      <button
        onClick={() => openCreate()}
        className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> Create New
      </button>
    </aside>
  );
}
