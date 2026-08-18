"use client";

import { useEffect, useState } from "react";
import { Bell, Flame } from "lucide-react";
import { useApp } from "./store";

function TopBarInner({ mobile }: { mobile: boolean }) {
  const { screen, setScreen } = useApp();
  const [initial, setInitial] = useState("?");
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [meRes, progRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/progress"),
        ]);
        if (meRes.ok) {
          const d = await meRes.json();
          if (mounted && d.authed) {
            const name = d.user?.name || d.user?.email || "?";
            setInitial(name.charAt(0).toUpperCase());
          }
        }
        if (progRes.ok) {
          const d = await progRes.json();
          if (mounted) setStreak(d.streak ?? 0);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  if (screen === "onboarding" || screen === "landing" || screen === "auth" || screen === "adminLogin") return null;

  const header = mobile
    ? "md:hidden sticky top-0 z-30 bg-white border-b border-gray-200"
    : "hidden md:flex sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200 h-14 items-center justify-between px-6";

  return (
    <header className={header}>
      <div className={mobile ? "max-w-md mx-auto px-4 h-14 flex items-center justify-between" : "w-full flex items-center justify-between"}>
        <button
          aria-label="Profile"
          className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white shadow-sm"
          onClick={() => setScreen("profile")}
        >
          {initial}
        </button>

        {mobile && (
          <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-sm font-semibold">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>{streak}</span>
            <span className="text-amber-600/80 font-medium hidden xs:inline">streak</span>
          </div>
        )}

        <button
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
        </button>
      </div>
      {!mobile && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-sm font-semibold">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>{streak}</span>
            <span className="text-amber-600/80 font-medium">streak</span>
          </div>
        </div>
      )}
    </header>
  );
}

export function TopBar() { return <TopBarInner mobile />; }
export function DesktopTopBar() { return <TopBarInner mobile={false} />; }
