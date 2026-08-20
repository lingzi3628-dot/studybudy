"use client";

import { useCallback } from "react";
import confetti from "canvas-confetti";

/**
 * useCelebration — Phase 15 micro-interactions & celebrations.
 *
 * Returns functions to trigger various celebration effects:
 * - sparkles: small golden particles on correct answer
 * - success: confetti burst on lesson/test complete
 * - levelUp: full-screen burst on level up
 * - badgeEarned: large celebration for new badge
 * - shake: gentle screen shake on wrong answer (via CSS class toggle)
 */
export function useCelebration() {
  const sparkles = useCallback((x?: number, y?: number) => {
    const origin = {
      x: x ?? 0.5,
      y: y ?? 0.5,
    };
    confetti({
      particleCount: 20,
      spread: 50,
      origin,
      colors: ["#fbbf24", "#f59e0b", "#fde68a", "#fef3c7"],
      scalar: 0.6,
      gravity: 0.8,
      ticks: 100,
    });
  }, []);

  const success = useCallback(() => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"],
    });
  }, []);

  const levelUp = useCallback(() => {
    const duration = 2000;
    const end = Date.now() + duration;
    const colors = ["#a855f7", "#6366f1", "#ec4899", "#fbbf24"];
    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, []);

  const badgeEarned = useCallback((badgeIcon?: string) => {
    // Full-screen celebration
    confetti({
      particleCount: 150,
      spread: 360,
      origin: { y: 0.5 },
      startVelocity: 30,
      colors: ["#fbbf24", "#f59e0b", "#fde68a", "#a855f7", "#6366f1", "#ec4899"],
      scalar: 1.2,
      ticks: 200,
    });
    // Second wave
    setTimeout(() => {
      confetti({
        particleCount: 50,
        spread: 100,
        origin: { y: 0.7 },
        colors: ["#10b981", "#34d399", "#6ee7b7"],
        scalar: 0.8,
      });
    }, 500);
  }, []);

  const shake = useCallback(() => {
    if (typeof document !== "undefined") {
      document.body.classList.add("screen-shake");
      setTimeout(() => document.body.classList.remove("screen-shake"), 500);
    }
  }, []);

  return { sparkles, success, levelUp, badgeEarned, shake };
}
