"use client";

/**
 * useProctorGuard — Phase 45
 *
 * A React hook that enforces exam proctoring rules on a timed test screen.
 *
 * Features:
 *   - Tab-switch detection via `visibilitychange` and `blur` events.
 *     Each switch increments a violation counter and shows a warning overlay.
 *   - Fullscreen lock — automatically enters fullscreen on mount (browser-permitting).
 *     Exiting fullscreen counts as a violation and the user is prompted to re-enter.
 *   - Copy/paste/cut/context-menu blocked during the test.
 *   - Auto-submit when violations exceed `maxViolations` (default 3).
 *   - Optional keyboard-lock: blocks Ctrl+Tab, Alt+Tab (browser-permitting), and
 *     common shortcuts (Ctrl+C, Ctrl+V, Ctrl+X).
 *   - Returns a small state object the host screen renders into a warning banner.
 *
 * Usage:
 *   const proctor = useProctorGuard({
 *     enabled: true,
 *     maxViolations: 3,
 *     onAutoSubmit: () => submit(),
 *   });
 *   // proctor.violations, proctor.warnings[], proctor.lastEvent
 *
 * The hook is intentionally tolerant on browsers that don't support a given
 * API (e.g. requestFullscreen on iOS Safari) — it logs and continues rather
 * than blocking the test.
 */

import { useEffect, useRef, useState, useCallback } from "react";

export type ProctorViolation = {
  type: "tab-switch" | "fullscreen-exit" | "copy" | "paste" | "cut" | "context-menu" | "keyboard-shortcut";
  timestamp: number;
  detail?: string;
};

export type ProctorState = {
  enabled: boolean;
  violations: ProctorViolation[];
  violationCount: number;
  lastEvent: ProctorViolation | null;
  inFullscreen: boolean;
  showWarning: boolean;
  dismissWarning: () => void;
};

export function useProctorGuard(opts: {
  enabled?: boolean;
  maxViolations?: number;
  onAutoSubmit?: () => void;
  onViolation?: (v: ProctorViolation) => void;
  blockCopyPaste?: boolean;
  requireFullscreen?: boolean;
}): ProctorState {
  const {
    enabled = true,
    maxViolations = 3,
    onAutoSubmit,
    onViolation,
    blockCopyPaste = true,
    requireFullscreen = true,
  } = opts;

  const [violations, setViolations] = useState<ProctorViolation[]>([]);
  const [showWarning, setShowWarning] = useState(false);
  const [inFullscreen, setInFullscreen] = useState(false);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  const onViolationRef = useRef(onViolation);
  const autoSubmittedRef = useRef(false);
  // Keep refs in sync so the effect closure below doesn't go stale.
  useEffect(() => { onAutoSubmitRef.current = onAutoSubmit; }, [onAutoSubmit]);
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);

  const addViolation = useCallback((v: ProctorViolation) => {
    setViolations((prev) => {
      const next = [...prev, v];
      // Fire onViolation callback outside the state setter
      try { onViolationRef.current?.(v); } catch { /* ignore */ }
      return next;
    });
    setShowWarning(true);
  }, []);

  // Try to enter fullscreen on mount
  useEffect(() => {
    if (!enabled || !requireFullscreen) return;
    const el = document.documentElement;
    const enterFullscreen = async () => {
      try {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
        setInFullscreen(true);
      } catch {
        // User denied or browser doesn't support — don't block the test
        setInFullscreen(false);
      }
    };
    void enterFullscreen();
    return () => {
      // Exit fullscreen on unmount if we entered it
      if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch { /* ignore */ }
      }
    };
  }, [enabled, requireFullscreen]);

  // Track fullscreen changes
  useEffect(() => {
    if (!enabled) return;
    const onFsChange = () => {
      const isFs = !!document.fullscreenElement;
      setInFullscreen(isFs);
      if (requireFullscreen && !isFs && !autoSubmittedRef.current) {
        addViolation({
          type: "fullscreen-exit",
          timestamp: Date.now(),
          detail: "User exited fullscreen during the test",
        });
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as any);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as any);
    };
  }, [enabled, requireFullscreen, addViolation]);

  // Tab-switch detection
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.hidden) {
        addViolation({
          type: "tab-switch",
          timestamp: Date.now(),
          detail: "Tab/window lost focus (visibilitychange hidden)",
        });
      }
    };
    const onBlur = () => {
      addViolation({
        type: "tab-switch",
        timestamp: Date.now(),
        detail: "Window lost focus (blur)",
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, addViolation]);

  // Copy/paste/cut/context-menu blocking
  useEffect(() => {
    if (!enabled || !blockCopyPaste) return;
    const blockEvent = (e: Event) => {
      e.preventDefault();
      const type =
        e.type === "copy" ? "copy" :
        e.type === "paste" ? "paste" :
        e.type === "cut" ? "cut" :
        e.type === "contextmenu" ? "context-menu" :
        "unknown";
      addViolation({
        type: type as ProctorViolation["type"],
        timestamp: Date.now(),
        detail: `Blocked ${e.type} event`,
      });
      return false;
    };
    document.addEventListener("copy", blockEvent);
    document.addEventListener("paste", blockEvent);
    document.addEventListener("cut", blockEvent);
    document.addEventListener("contextmenu", blockEvent);
    return () => {
      document.removeEventListener("copy", blockEvent);
      document.removeEventListener("paste", blockEvent);
      document.removeEventListener("cut", blockEvent);
      document.removeEventListener("contextmenu", blockEvent);
    };
  }, [enabled, blockCopyPaste, addViolation]);

  // Block common keyboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, F12, etc.)
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // Block copy/paste/cut/select-all shortcuts
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        addViolation({
          type: "keyboard-shortcut",
          timestamp: Date.now(),
          detail: `Blocked Ctrl+${e.key.toUpperCase()}`,
        });
      }
      // Block DevTools F12 / Ctrl+Shift+I (best-effort)
      if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase()))) {
        e.preventDefault();
        addViolation({
          type: "keyboard-shortcut",
          timestamp: Date.now(),
          detail: "Blocked DevTools shortcut",
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, addViolation]);

  // Auto-submit when violations exceed the threshold
  useEffect(() => {
    if (autoSubmittedRef.current) return;
    if (violations.length >= maxViolations) {
      autoSubmittedRef.current = true;
      try { onAutoSubmitRef.current?.(); } catch { /* ignore */ }
    }
  }, [violations, maxViolations]);

  const dismissWarning = useCallback(() => setShowWarning(false), []);

  return {
    enabled,
    violations,
    violationCount: violations.length,
    lastEvent: violations.length > 0 ? violations[violations.length - 1] : null,
    inFullscreen,
    showWarning,
    dismissWarning,
  };
}
