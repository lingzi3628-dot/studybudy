"use client";

import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

/**
 * OfflineBanner — Phase 80
 *
 * Detects when the user loses internet connection and shows a banner.
 * When the user tries to send a message while offline, instead of seeing
 * "Failed to fetch" (a raw browser error), they see a friendly message.
 *
 * Also provides a global helper: `isOnline()` and a custom event
 * `studybuddy-offline` that other components can listen for.
 */

let _online = true;
let _listeners: Array<(online: boolean) => void> = [];

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function onConnectionChange(cb: (online: boolean) => void): () => void {
  _listeners.push(cb);
  return () => { _listeners = _listeners.filter((l) => l !== cb); };
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    _online = true;
    _listeners.forEach((l) => l(true));
  });
  window.addEventListener("offline", () => {
    _online = false;
    _listeners.forEach((l) => l(false));
  });
}

/**
 * Wraps a fetch call with offline detection.
 * If offline, throws a friendly error instead of "Failed to fetch".
 */
export async function safeFetch(url: string, opts?: RequestInit): Promise<Response> {
  if (!isOnline()) {
    throw new Error("You're offline. Please check your internet connection and try again.");
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
    const response = await fetch(url, { ...opts, signal: opts?.signal || controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    if (!isOnline() || /failed to fetch|networkerror|load failed/i.test(e?.message ?? "")) {
      throw new Error("You're offline. Please check your internet connection and try again.");
    }
    throw e;
  }
}

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const unsub = onConnectionChange((isOnline) => {
      setOnline(isOnline);
      setShowBanner(!isOnline);
    });
    return unsub;
  }, []);

  if (online && !showBanner) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-lg animate-in slide-in-from-top duration-300">
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span>You're offline. Check your internet connection.</span>
      <button
        onClick={() => { window.location.reload(); }}
        className="ml-2 px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 flex items-center gap-1 text-xs"
      >
        <RefreshCw className="w-3 h-3" /> Retry
      </button>
      {online && (
        <button
          onClick={() => setShowBanner(false)}
          className="ml-1 text-xs opacity-70 hover:opacity-100"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
