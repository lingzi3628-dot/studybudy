"use client";

import { Bell, Flame } from "lucide-react";
import { useApp } from "./store";

/**
 * Mobile-only top app bar. Hidden on desktop where the sidebar takes over.
 */
export function TopBar() {
  const { screen, setScreen } = useApp();
  if (screen === "onboarding") return null;

  return (
    <header className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
        <button
          aria-label="Profile"
          className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white shadow-sm"
          onClick={() => setScreen("profile")}
        >
          A
        </button>

        <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-sm font-semibold">
          <Flame className="w-4 h-4 text-amber-500" />
          <span>5</span>
          <span className="text-amber-600/80 font-medium hidden xs:inline">streak</span>
        </div>

        <button
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
        </button>
      </div>
    </header>
  );
}

/**
 * Desktop top bar inside the main content area. Slimmer, with brand context.
 */
export function DesktopTopBar() {
  const { screen } = useApp();
  if (screen === "onboarding") return null;

  return (
    <header className="hidden md:flex sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200 h-14 items-center justify-between px-6">
      <h1 className="text-sm font-semibold text-gray-900">
        {screen === "home" && "Dashboard"}
        {screen === "search" && "Search"}
        {screen === "progress" && "Your Progress"}
        {screen === "profile" && "Profile & Settings"}
      </h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-sm font-semibold">
          <Flame className="w-4 h-4 text-amber-500" />
          <span>5</span>
          <span className="text-amber-600/80 font-medium">streak</span>
        </div>
        <button
          aria-label="Profile"
          onClick={() => useApp.getState().setScreen("profile")}
          className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white shadow-sm"
        >
          A
        </button>
      </div>
    </header>
  );
}
