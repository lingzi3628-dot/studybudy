"use client";

import { useState, useEffect } from "react";
import { Wrench, Clock, Mail, Loader2, CheckCircle2 } from "lucide-react";

/**
 * MaintenanceScreen — full-screen maintenance mode
 *
 * Blocks ALL app access. Users see only this screen with a countdown
 * timer + email notification signup. No navigation, no app features.
 *
 * Feature flag: NEXT_PUBLIC_MAINTENANCE_MODE=true (default: false)
 * Set in Vercel → Settings → Environment Variables
 *
 * To disable: set NEXT_PUBLIC_MAINTENANCE_MODE=false (or delete the env var)
 */

const MAINTENANCE_END = new Date("2026-10-04T12:00:00Z").getTime(); // 24h from now

function useCountdown(target: number) {
  const [timeLeft, setTimeLeft] = useState(target - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(target - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);

  if (timeLeft <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, done: true };
  }

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  return { hours, minutes, seconds, done: false };
}

export function MaintenanceScreen() {
  const { hours, minutes, seconds, done } = useCountdown(MAINTENANCE_END);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number; duration: number }>>([]);

  // Generate floating particles
  useEffect(() => {
    const p = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 3 + Math.random() * 4,
    }));
    setParticles(p);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    // Best-effort: store email for notification when maintenance ends
    try {
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), type: "maintenance_alert" }),
      }).catch(() => {});
    } catch {}
    setSubmitting(false);
    setSubmitted(true);
  };

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 flex items-center justify-center overflow-hidden">
      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute w-1 h-1 bg-white/20 rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
          }}
        />
      ))}

      <style>{`
        @keyframes float {
          0% { transform: translateY(0px) translateX(0px); opacity: 0.2; }
          100% { transform: translateY(-30px) translateX(10px); opacity: 0.6; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); }
          50% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.6); }
        }
      `}</style>

      <div className="relative z-10 max-w-lg w-full mx-4">
        {/* Logo + Wrench */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4"
            style={{ animation: "pulse-glow 3s ease-in-out infinite" }}
          >
            <Wrench className="w-10 h-10 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-white text-center">
            StudyBuddy is getting an upgrade
          </h1>
          <p className="text-sm text-indigo-200 mt-2 text-center max-w-sm">
            We&apos;re improving our AI to give you a better learning experience.
            We&apos;ll be back soon!
          </p>
        </div>

        {/* Countdown timer */}
        {!done ? (
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
                <span className="text-3xl font-bold text-white font-mono">{pad(hours)}</span>
              </div>
              <span className="text-[10px] text-indigo-300 mt-1.5 uppercase tracking-wide">Hours</span>
            </div>
            <span className="text-2xl text-white/30 font-bold">:</span>
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
                <span className="text-3xl font-bold text-white font-mono">{pad(minutes)}</span>
              </div>
              <span className="text-[10px] text-indigo-300 mt-1.5 uppercase tracking-wide">Minutes</span>
            </div>
            <span className="text-2xl text-white/30 font-bold">:</span>
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
                <span className="text-3xl font-bold text-white font-mono">{pad(seconds)}</span>
              </div>
              <span className="text-[10px] text-indigo-300 mt-1.5 uppercase tracking-wide">Seconds</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-8 text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
            <span className="text-lg font-semibold">We&apos;re back! Refresh the page.</span>
          </div>
        )}

        {/* Email notification signup */}
        {!submitted ? (
          <form onSubmit={handleSubmit} className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-indigo-200 text-sm">
              <Mail className="w-4 h-4" />
              <span>Get notified when we&apos;re back</span>
            </div>
            <div className="flex gap-2 w-full max-w-sm">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white text-sm placeholder:text-white/40 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold flex items-center gap-1.5 hover:from-indigo-600 hover:to-purple-700 transition disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Notify me
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">Thanks! We&apos;ll email you when StudyBuddy is back.</span>
            </div>
          </div>
        )}

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-2 mt-8 text-xs text-white/40">
          <Clock className="w-3 h-3" />
          <span>Maintenance started at {new Date(MAINTENANCE_END - 24 * 60 * 60 * 1000).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Check if maintenance mode is enabled.
 * Only checks the build-time env var (NEXT_PUBLIC_MAINTENANCE_MODE).
 * The runtime check is done via /api/maintenance-status in page.tsx.
 * localStorage is NOT checked here — it was causing the maintenance screen
 * to persist after the env var was removed.
 */
export function isMaintenanceMode(): boolean {
  const flag = (process.env.NEXT_PUBLIC_MAINTENANCE_MODE ?? "false").toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "on";
}
