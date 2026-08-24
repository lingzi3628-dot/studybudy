"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Loader2,
  AlertCircle,
  ChevronLeft,
  LogOut,
  X,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Check,
} from "lucide-react";
import { useApp } from "../store";

type Child = {
  id: string;
  username: string;
  displayName: string;
  gradeLevel: string | null;
  avatarEmoji: string | null;
  lastLogin: string | null;
};

type FamilyInfo = {
  id: string;
  displayName: string | null;
  parentEmail: string;
};

type Dashboard = {
  isFamilyMember: boolean;
  isFamilyParent?: boolean;
  isFamilyChild?: boolean;
  family?: FamilyInfo;
  children?: Child[];
};

/**
 * FamilyDashboard — Phase 20
 *
 * Parent view: shows each child as a clickable "portal" card. Click → enter
 * the child's passcode → swap session to that child → go to their learning
 * dashboard. The child later clicks "Lock My Room" to come back here so
 * another child can take a turn on the same device.
 *
 * Child view: only shown if a child lands here directly (rare). Sends them
 * to home instead.
 */
export function FamilyDashboard() {
  const { setScreen } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [activeChild, setActiveChild] = useState<Child | null>(null);

  useEffect(() => {
    fetch("/api/family/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (!d.isFamilyMember) {
          setScreen("landing");
          return;
        }
        if (d.isFamilyChild) {
          // A child landed on the family dashboard — send them to their
          // learning dashboard instead.
          setScreen("home");
          return;
        }
        setData(d);
      })
      .catch((e) => setError(e?.message ?? "Failed to load family dashboard"))
      .finally(() => setLoading(false));
  }, [setScreen]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setScreen("landing");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 max-w-sm w-full text-center">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="mt-2 text-sm text-rose-700">{error ?? "Could not load family dashboard"}</p>
          <button
            onClick={() => setScreen("home")}
            className="mt-3 text-xs font-bold text-rose-700 hover:underline"
          >
            Go to home →
          </button>
        </div>
      </div>
    );
  }

  // Parent view — children portals
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => setScreen("home")}
            className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Back to app
          </button>
          <button
            onClick={logout}
            className="text-xs font-semibold text-gray-500 hover:text-rose-600 flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg">
            <Users className="w-7 h-7" />
          </div>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">
            {data.family?.displayName ?? "Your Family"}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Tap your portal to start learning
          </p>
        </div>

        {/* Children portals */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {data.children?.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveChild(c)}
              className="group rounded-3xl bg-white border border-gray-200 shadow-sm hover:shadow-xl hover:border-indigo-300 hover:-translate-y-0.5 transition-all p-5 flex flex-col items-center gap-2"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">
                {c.avatarEmoji ?? "🧒"}
              </span>
              <span className="text-base font-bold text-gray-900">
                {c.displayName}
              </span>
              {c.gradeLevel && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {c.gradeLevel}
                </span>
              )}
              <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 group-hover:text-indigo-600">
                <Lock className="w-3 h-3" /> Tap to enter
              </span>
            </button>
          ))}
        </div>

        {/* Help footer */}
        <div className="mt-8 rounded-2xl bg-indigo-50 border border-indigo-200 p-4">
          <p className="text-sm font-semibold text-indigo-700">
            📱 How it works
          </p>
          <ol className="mt-2 text-xs text-indigo-700/90 list-decimal list-inside space-y-0.5">
            <li>Each child taps their portal and enters their passcode.</li>
            <li>They study, take quizzes, and earn coins in their own private room.</li>
            <li>When done, they tap &quot;Lock My Room&quot; to come back here.</li>
            <li>The next child can then take a turn on the same device.</li>
          </ol>
        </div>
      </main>

      {/* Passcode modal */}
      {activeChild && (
        <PasscodeModal
          child={activeChild}
          onClose={() => setActiveChild(null)}
          onSuccess={() => {
            // Cookie has been swapped to the child — go to learning dashboard
            setActiveChild(null);
            setScreen("home");
          }}
        />
      )}
    </div>
  );
}

function PasscodeModal({
  child,
  onClose,
  onSuccess,
}: {
  child: Child;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) {
      setError("Please enter your passcode.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/family/switch-to-child", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: child.id, passcode }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      onSuccess();
    } catch (e: any) {
      setError(e?.message ?? "Failed to unlock");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-center text-white relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="text-5xl">{child.avatarEmoji ?? "🧒"}</div>
          <h2 className="mt-2 text-lg font-bold">Hi, {child.displayName}!</h2>
          <p className="text-xs opacity-90 mt-1">Enter your passcode to start</p>
        </div>

        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Passcode
            </label>
            <div className="mt-1 relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showCode ? "text" : "password"}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="••••"
                autoFocus
                autoComplete="off"
                className="w-full pl-10 pr-10 p-3 rounded-xl border border-gray-200 text-base font-mono text-center tracking-widest outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={() => setShowCode((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Unlocking…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Enter my room</>
            )}
          </button>

          <p className="text-center text-[10px] text-gray-400">
            Wrong passcode? Ask your parent for help.
          </p>
        </form>
      </div>
    </div>
  );
}
