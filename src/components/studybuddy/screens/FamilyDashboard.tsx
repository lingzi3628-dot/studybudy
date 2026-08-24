"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Loader2,
  AlertCircle,
  ChevronLeft,
  LogOut,
  Plus,
  User,
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
  child?: {
    id: string;
    username: string;
    displayName: string;
    gradeLevel: string | null;
    avatarEmoji: string | null;
  };
};

/**
 * FamilyDashboard — Phase 20
 *
 * Shows different content depending on whether the logged-in user is a
 * Family Parent or a Family Child.
 *
 * - Parent: list of children with last-login times, link to add more
 * - Child: their profile + "Continue learning" button → home
 */
export function FamilyDashboard() {
  const { setScreen } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    fetch("/api/family/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (!d.isFamilyMember) {
          // Not a family member — back to landing
          setScreen("landing");
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

  // --- Parent view ---
  if (data.isFamilyParent) {
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
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {data.family?.displayName ?? "Your Family"}
              </h1>
              <p className="text-xs text-gray-500">{data.family?.parentEmail}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">
                Children ({data.children?.length ?? 0})
              </h2>
              <button
                onClick={() => setScreen("home")}
                className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Manage in app
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {data.children?.map((c) => (
                <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-2xl">{c.avatarEmoji ?? "🧒"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{c.displayName}</p>
                    <p className="text-[11px] text-gray-500 font-mono">
                      @{c.username}
                      {c.gradeLevel ? ` · ${c.gradeLevel}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase">Last login</p>
                    <p className="text-[11px] text-gray-600">
                      {c.lastLogin ? new Date(c.lastLogin).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 rounded-2xl bg-indigo-50 border border-indigo-200 p-4">
            <p className="text-sm font-semibold text-indigo-700">
              📱 How your children log in
            </p>
            <ol className="mt-2 text-xs text-indigo-700/90 list-decimal list-inside space-y-0.5">
              <li>Each child opens StudyBuddy AI on their device.</li>
              <li>They tap &quot;Family Mode&quot; → &quot;Child Login&quot;.</li>
              <li>They type their <strong>username</strong> and <strong>passcode</strong>.</li>
            </ol>
          </div>

          <button
            onClick={() => setScreen("home")}
            className="mt-5 w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition"
          >
            Go to StudyBuddy AI →
          </button>
        </main>
      </div>
    );
  }

  // --- Child view ---
  if (data.isFamilyChild && data.child) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-3xl bg-white border border-gray-200 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-6 text-center text-white">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-white/10 flex items-center justify-center text-4xl">
                {data.child.avatarEmoji ?? "🧒"}
              </div>
              <h1 className="mt-3 text-lg font-bold">Hi, {data.child.displayName}!</h1>
              <p className="text-xs opacity-90 mt-1">
                {data.child.gradeLevel ?? "Family Mode"}
              </p>
            </div>

            <div className="p-5 space-y-3">
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
                <p className="text-xs font-semibold text-violet-700">Your account</p>
                <p className="text-[11px] text-violet-700/80 mt-0.5">
                  Username: <span className="font-mono font-bold">@{data.child.username}</span>
                </p>
                <p className="text-[11px] text-violet-700/80">
                  Family: {data.family?.displayName ?? data.family?.parentEmail}
                </p>
              </div>

              <button
                onClick={() => setScreen("home")}
                className="w-full h-12 rounded-full bg-violet-600 text-white font-semibold text-sm shadow-md hover:bg-violet-700 transition"
              >
                Start learning →
              </button>

              <button
                onClick={logout}
                className="w-full h-9 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback — not a family member (shouldn't happen because we redirect in useEffect)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <button
        onClick={() => setScreen("home")}
        className="text-indigo-600 font-semibold text-sm"
      >
        Go to home →
      </button>
    </div>
  );
}
