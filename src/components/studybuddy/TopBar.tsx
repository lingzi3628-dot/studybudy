"use client";

import { useEffect, useState } from "react";
import { Bell, Flame, Coins, Trophy, Zap, CircleDot, Lock } from "lucide-react";
import { useApp } from "./store";

function TopBarInner({ mobile }: { mobile: boolean }) {
  const { screen, setScreen } = useApp();
  const [initial, setInitial] = useState("?");
  const [streak, setStreak] = useState(0);
  const [tokens, setTokens] = useState<number | null>(null);
  const [coins, setCoins] = useState<number | null>(null);
  const [xp, setXp] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [isResting, setIsResting] = useState(false);
  const [isFamilyChild, setIsFamilyChild] = useState(false);
  const [childName, setChildName] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [meRes, progRes, xpRes, balRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/progress"),
          fetch("/api/user/xp"),
          fetch("/api/user/balances"),
        ]);
        if (meRes.ok) {
          const d = await meRes.json();
          if (mounted && d.authed) {
            const name = d.user?.name || d.user?.email || "?";
            setInitial(name.charAt(0).toUpperCase());
            if (typeof d.user?.tokenBalance === "number") setTokens(d.user.tokenBalance);
            // Phase 20 — detect family child to show "Lock My Room" button
            if (d.isFamilyChild) {
              setIsFamilyChild(true);
              setChildName(d.child?.displayName ?? name);
            } else {
              setIsFamilyChild(false);
              setChildName(null);
            }
          }
        }
        if (progRes.ok) {
          const d = await progRes.json();
          if (mounted) {
            setStreak(d.streak ?? 0);
            if (typeof d.user?.tokenBalance === "number") setTokens(d.user.tokenBalance);
          }
        }
        if (xpRes.ok) {
          const d = await xpRes.json();
          if (mounted) {
            if (typeof d.xp === "number") setXp(d.xp);
            if (typeof d.level === "number") setLevel(d.level);
            if (typeof d.streak === "number") setStreak(d.streak);
          }
        }
        if (balRes.ok) {
          const d = await balRes.json();
          if (mounted) {
            if (typeof d.coins === "number") setCoins(d.coins);
            if (typeof d.tokens === "number") setTokens(d.tokens);
            if (typeof d.isResting === "boolean") setIsResting(d.isResting);
          }
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const lockRoom = async () => {
    if (locking) return;
    setLocking(true);
    try {
      const r = await fetch("/api/family/lock-room", { method: "POST" });
      if (r.ok) {
        setScreen("familyDashboard");
      }
    } catch {
      // ignore — user can retry
    } finally {
      setLocking(false);
    }
  };

  if (screen === "onboarding" || screen === "landing" || screen === "auth" || screen === "adminLogin") return null;

  const header = mobile
    ? "md:hidden sticky top-0 z-30 bg-white border-b border-gray-200"
    : "hidden md:flex sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200 h-14 items-center justify-between px-6";

  return (
    <header className={header}>
      <div className={mobile ? "max-w-md mx-auto px-4 h-14 flex items-center justify-between" : "w-full flex items-center justify-between"}>
        {/* Family child: show child name + lock button instead of profile avatar */}
        {isFamilyChild ? (
          <button
            onClick={lockRoom}
            disabled={locking}
            className="flex items-center gap-2 px-3 h-9 rounded-full bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 transition disabled:opacity-50"
            title="End your turn and go back to the family portal"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">Lock My Room</span>
            {locking && <span className="text-[10px] opacity-70">…</span>}
          </button>
        ) : (
          <button
            aria-label="Profile"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white shadow-sm"
            onClick={() => setScreen("profile")}
          >
            {initial}
          </button>
        )}

        {mobile && (
          <div className="flex items-center gap-1.5">
            {isResting && (
              <button
                onClick={() => setScreen("earnCenter")}
                className="flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-xs font-semibold hover:bg-rose-100 animate-pulse"
                title="Free model is resting"
              >
                <CircleDot className="w-3 h-3" /> Resting
              </button>
            )}
            {coins !== null && (
              <button
                onClick={() => setScreen("earnCenter")}
                aria-label="Coin balance"
                className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-semibold hover:bg-amber-100 transition"
              >
                <Coins className="w-3 h-3" />
                <span>{coins}</span>
              </button>
            )}
            {level !== null && (
              <button
                onClick={() => setScreen("progress")}
                aria-label="XP and level"
                className="flex items-center gap-1 bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full text-xs font-semibold hover:bg-violet-100 transition"
              >
                <Trophy className="w-3 h-3" />
                <span>L{level}</span>
              </button>
            )}
            {tokens !== null && (
              <button
                onClick={() => setScreen("billing")}
                aria-label="Token balance"
                className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-semibold hover:bg-indigo-100 transition"
              >
                <Zap className="w-3 h-3" />
                <span>{tokens}</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-sm font-semibold">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>{streak}</span>
            </div>
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
          {isResting && (
            <button
              onClick={() => setScreen("earnCenter")}
              className="flex items-center gap-1 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-sm font-semibold hover:bg-rose-100 animate-pulse"
            >
              <CircleDot className="w-4 h-4" /> Model Resting
            </button>
          )}
          {coins !== null && (
            <button
              onClick={() => setScreen("earnCenter")}
              className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-sm font-semibold hover:bg-amber-100 transition"
            >
              <Coins className="w-4 h-4" />
              <span>{coins}</span>
              <span className="text-amber-600/80 font-medium text-xs">coins</span>
            </button>
          )}
          {level !== null && (
            <button
              onClick={() => setScreen("progress")}
              className="flex items-center gap-1.5 bg-violet-50 text-violet-700 px-3 py-1 rounded-full text-sm font-semibold hover:bg-violet-100 transition"
            >
              <Trophy className="w-4 h-4" />
              <span>L{level}</span>
            </button>
          )}
          {tokens !== null && (
            <button
              onClick={() => setScreen("billing")}
              className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-semibold hover:bg-indigo-100 transition"
            >
              <Zap className="w-4 h-4" />
              <span>{tokens}</span>
              <span className="text-indigo-600/80 font-medium text-xs">tokens</span>
            </button>
          )}
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

