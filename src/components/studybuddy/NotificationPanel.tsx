"use client";

/**
 * NotificationPanel — Phase 46
 *
 * The dropdown panel shown when the user taps the Bell icon in the TopBar.
 * Lists the user's recent in-app notifications (Notification model), shows
 * an unread badge, and lets the user mark all as read.
 *
 * Also surfaces "would be sent" email/SMS notifications from the
 * NotificationLog table (admin-side) — these are NOT shown to the user
 * but are visible in the admin panel.
 */

import { useEffect, useState, useRef } from "react";
import { Bell, Check, Loader2, BellOff } from "lucide-react";

type Notif = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
};

const TYPE_EMOJI: Record<string, string> = {
  due_review: "📚",
  daily_goal: "🎯",
  badge: "🏆",
  group_invite: "👥",
  system: "🔔",
};

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch notifications on mount + when panel is opened
  const loadNotifs = async () => {
    setLoading(true);
    try {
      // Also auto-create the "due review" notification (best-effort)
      await fetch("/api/notifications", { method: "POST" }).catch(() => {});
      const r = await fetch("/api/notifications");
      const d = await r.json();
      setNotifs(d.notifications ?? []);
      setUnread(d.unreadCount ?? 0);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifs();
  }, []);

  useEffect(() => {
    if (open) loadNotifs();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-rose-500 rounded-full ring-2 ring-white flex items-center justify-center">
            <span className="text-[10px] font-bold text-white leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                disabled={marking}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                {marking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 flex items-center justify-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="ml-2 text-xs">Loading…</span>
              </div>
            ) : notifs.length === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center text-gray-400 text-center">
                <BellOff className="w-6 h-6 mb-2" />
                <p className="text-xs">You&apos;re all caught up!</p>
                <p className="text-[10px] text-gray-400 mt-1">No notifications right now.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifs.slice(0, 20).map((n) => (
                  <li
                    key={n.id}
                    className={`px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition ${n.read ? "opacity-70" : ""}`}
                  >
                    <span className="text-lg flex-shrink-0">
                      {TYPE_EMOJI[n.type] ?? "🔔"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs ${n.read ? "text-gray-600 font-normal" : "text-gray-900 font-medium"}`}>
                        {n.message}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 bg-rose-500 rounded-full mt-1.5 flex-shrink-0" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
