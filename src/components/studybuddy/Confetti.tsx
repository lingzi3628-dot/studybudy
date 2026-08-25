"use client";

import { useEffect, useState } from "react";

const COLORS = ["#4F46E5", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

/**
 * Confetti — Phase 24
 *
 * Shows a burst of colorful confetti pieces that fall from the top of the screen.
 * Call <Confetti trigger={someKey} /> and change `trigger` to fire it.
 */
export function Confetti({ trigger }: { trigger: any }) {
  const [pieces, setPieces] = useState<Array<{ id: number; left: number; color: string; delay: number; rotation: number }>>([]);

  useEffect(() => {
    if (!trigger) return;
    const newPieces = Array.from({ length: 30 }, (_, i) => ({
      id: Date.now() + i,
      left: Math.random() * 100,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.5,
      rotation: Math.random() * 360,
    }));
    setPieces(newPieces);
    const t = setTimeout(() => setPieces([]), 3500);
    return () => clearTimeout(t);
  }, [trigger]);

  if (pieces.length === 0) return null;

  return (
    <>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </>
  );
}
