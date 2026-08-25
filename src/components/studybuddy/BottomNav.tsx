"use client";

import { useEffect, useState } from "react";
import { Home, Search, Plus, BarChart3, User, Users, Lock, Calendar } from "lucide-react";
import { useApp, type Screen } from "./store";

type Tab = {
  key: Screen;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * BottomNav / Sidebar — main navigation.
 *
 * Phase 21b — three roles:
 *   - Family parent: extra "My Children" tab (routes to Parent Dashboard)
 *   - Family child: NO "My Children" tab, NO "Profile" tab — instead a
 *     "Lock Room" tab that ends their session and returns to the portals
 *   - Regular user: standard 5-tab layout
 *
 * Children never see the "Children" tab because they're already inside
 * their own learning room — that tab is for parents to manage all kids.
 */
export function BottomNav() {
  const { screen, setScreen, openCreate, createOpen } = useApp();
  const [isFamilyParent, setIsFamilyParent] = useState(false);
  const [isFamilyChild, setIsFamilyChild] = useState(false);
  const [childName, setChildName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!mounted || !d?.authed) return;
        if (d.isFamilyParent) setIsFamilyParent(true);
        if (d.isFamilyChild) {
          setIsFamilyChild(true);
          setChildName(d.child?.displayName ?? null);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const lockRoom = async () => {
    try {
      const r = await fetch("/api/family/lock-room", { method: "POST" });
      if (r.ok) setScreen("familyDashboard");
    } catch {}
  };

  const hidden: Screen[] = ["onboarding", "flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "auth", "premium", "familyRegister", "familyChildLogin", "familyDashboard", "schoolRegister"];
  if (hidden.includes(screen)) return null;
  if (createOpen) return null;

  // Three layouts:
  //  - Family child: Home, Search, Create, Progress, Lock Room  (no Profile, no Children)
  //  - Family parent: Home, Search, Create, Children, Progress  (no Profile — accessible via avatar)
  //  - Regular:       Home, Search, Create, Progress, Profile
  const tabs: Tab[] = isFamilyChild
    ? [
        { key: "home", label: "Home", icon: Home },
        { key: "search", label: "Search", icon: Search },
        { key: "home", label: "Create", icon: Plus },
        { key: "progress", label: "Progress", icon: BarChart3 },
        // The 5th tab for children is a "Lock Room" action button (not a screen)
        // We use key "home" so the active-state logic doesn't highlight it.
        { key: "home", label: childName ?? "Lock", icon: Lock },
      ]
    : isFamilyParent
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
          // For family children, the 5th tab (idx 4) is the Lock button
          const isLockButton = isFamilyChild && idx === 4;

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
          if (isLockButton) {
            return (
              <button
                key="lock"
                aria-label="Lock my room"
                onClick={lockRoom}
                className="flex flex-col items-center justify-center gap-0.5"
              >
                <Icon className="w-5 h-5 text-violet-600" />
                <span className="text-[10px] text-violet-600 font-semibold">Lock Room</span>
              </button>
            );
          }
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
 * Desktop sidebar (md+).
 * - Family parent: extra "My Children" item
 * - Family child: no "My Children" item, no "Profile" item — instead a
 *   "Lock My Room" button at the bottom
 * - Regular user: standard layout
 */
export function Sidebar() {
  const { screen, setScreen, openCreate, createOpen } = useApp();
  const [isFamilyParent, setIsFamilyParent] = useState(false);
  const [isFamilyChild, setIsFamilyChild] = useState(false);
  const [childName, setChildName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!mounted || !d?.authed) return;
        if (d.isFamilyParent) setIsFamilyParent(true);
        if (d.isFamilyChild) {
          setIsFamilyChild(true);
          setChildName(d.child?.displayName ?? null);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const lockRoom = async () => {
    try {
      const r = await fetch("/api/family/lock-room", { method: "POST" });
      if (r.ok) setScreen("familyDashboard");
    } catch {}
  };

  const hidden: Screen[] = ["onboarding", "flashcards", "quiz", "graph", "language", "tutor", "path", "study", "admin", "adminLogin", "landing", "auth", "premium", "familyRegister", "familyChildLogin", "familyDashboard", "schoolRegister"];
  if (hidden.includes(screen)) return null;
  if (createOpen) return null;

  // Children: no "My Children" item, no "Profile" item
  // Parents: extra "My Children" item
  // Regular: standard layout
  const items: { key: Screen; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "home", label: "Home", icon: Home },
    { key: "search", label: "Search", icon: Search },
    { key: "progress", label: "Progress", icon: BarChart3 },
    { key: "calendar", label: "Calendar", icon: Calendar },
    // Parents get "My Children" — children and regular users skip this
    ...(isFamilyParent && !isFamilyChild
      ? [{ key: "parent" as Screen, label: "My Children", icon: Users }]
      : []),
    // Children don't get a "Profile" link (parent manages their account)
    ...(!isFamilyChild
      ? [{ key: "profile" as Screen, label: "Profile", icon: User }]
      : []),
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

      {/* Child badge — show child's name at the top so they know whose room they're in */}
      {isFamilyChild && childName && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-center">
          <p className="text-xs font-bold text-violet-700">{childName}&apos;s room</p>
        </div>
      )}

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

      {/* Bottom button — different per role:
          - Family child: "Lock My Room" (violet — ends their session)
          - Everyone else: "Create New" (indigo) */}
      {isFamilyChild ? (
        <button
          onClick={lockRoom}
          className="w-full h-11 rounded-full bg-violet-600 text-white font-semibold text-sm shadow-md hover:bg-violet-700 transition flex items-center justify-center gap-1.5"
        >
          <Lock className="w-4 h-4" /> Lock My Room
        </button>
      ) : (
        <button
          onClick={() => openCreate()}
          className="w-full h-11 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Create New
        </button>
      )}
    </aside>
  );
}
