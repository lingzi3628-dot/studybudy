"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";

/**
 * FractionManipulative — Phase F10 (Pilot B activity)
 *
 * A drag-and-drop math manipulative for lower-primary learners (Grade 1-5 CBC).
 * The AI sets a task like "Put 12 mangoes into 3 equal baskets" — the learner
 * drags mangoes from the source pile into the baskets, and the component
 * checks the answer deterministically (no AI needed for grading).
 *
 * SAFETY: This is a pure frontend component. No AI code execution, no network
 * calls, no arbitrary input. The AI only chooses the task parameters — the
 * checking logic is in this file (deterministic + testable).
 *
 * TOUCH-FIRST: Designed for low-end Android phones — large touch targets,
 * simple drag-and-drop (touch + mouse), no complex animations.
 *
 * Artifact spec format (emitted by the AI as ```mathgraph with type "manipulative"):
 * {
 *   "type": "manipulative",
 *   "subtype": "fractions_divide",
 *   "title": "Divide mangoes equally",
 *   "instruction": "Put 12 mangoes into 3 equal baskets",
 *   "totalCount": 12,
 *   "basketCount": 3,
 *   "itemEmoji": "🥭",
 *   "basketEmoji": "🧺",
 * }
 *
 * The component checks: did the learner put exactly totalCount/basketCount
 * items in each basket? If so, success. If not, shows how many are in each
 * basket and hints at the correct distribution.
 */

// ============================================================
// Types
// ============================================================

export type FractionManipulativeSpec = {
  type: "manipulative";
  subtype: "fractions_divide";
  title: string;
  instruction: string;
  totalCount: number;
  basketCount: number;
  itemEmoji?: string;
  basketEmoji?: string;
};

type Props = {
  spec: FractionManipulativeSpec;
  onComplete?: (correct: boolean, distribution: number[]) => void;
};

// ============================================================
// Component
// ============================================================

export function FractionManipulative({ spec, onComplete }: Props) {
  const {
    totalCount = 12,
    basketCount = 3,
    itemEmoji = "🥭",
    basketEmoji = "🧺",
    instruction,
    title,
  } = spec;

  // State: how many items are in each basket
  const [baskets, setBaskets] = useState<number[]>(() =>
    Array.from({ length: basketCount }, () => 0)
  );
  // State: how many items are still in the source pile
  const [sourcePile, setSourcePile] = useState(totalCount);
  const [checked, setChecked] = useState(false);
  const [draggedCount, setDraggedCount] = useState(0); // items being dragged

  // Expected per basket
  const expectedPerBasket = Math.floor(totalCount / basketCount);
  const allPlaced = sourcePile === 0;

  // ---- Drag-and-drop (HTML5 + touch fallback) ----
  // Strategy: tap an item in the source pile to pick it up (increments draggedCount),
  // then tap a basket to drop it. This is simpler + more reliable on touch screens
  // than HTML5 drag-and-drop (which doesn't work well on mobile).
  const [pickedUp, setPickedUp] = useState(0);

  const pickUpItem = useCallback(() => {
    if (sourcePile <= 0) return;
    setSourcePile((n) => n - 1);
    setPickedUp((n) => n + 1);
  }, [sourcePile]);

  const dropIntoBasket = useCallback((basketIdx: number) => {
    if (pickedUp <= 0) return;
    setPickedUp(0);
    setBaskets((prev) => {
      const next = [...prev];
      next[basketIdx] += 1;
      return next;
    });
  }, [pickedUp]);

  const takeFromBasket = useCallback((basketIdx: number) => {
    if (baskets[basketIdx] <= 0) return;
    setBaskets((prev) => {
      const next = [...prev];
      next[basketIdx] -= 1;
      return next;
    });
    setSourcePile((n) => n + 1);
  }, [baskets]);

  // ---- Check answer ----
  const checkAnswer = useCallback(() => {
    setChecked(true);
    const correct = baskets.every((count) => count === expectedPerBasket);
    onComplete?.(correct, baskets);
  }, [baskets, expectedPerBasket, onComplete]);

  const reset = useCallback(() => {
    setBaskets(Array.from({ length: basketCount }, () => 0));
    setSourcePile(totalCount);
    setChecked(false);
    setPickedUp(0);
  }, [basketCount, totalCount]);

  const isCorrect = checked && baskets.every((c) => c === expectedPerBasket);

  // ---- Render ----
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-4">
      {/* Title */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">🥭</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900">{title || "Fraction Activity"}</h3>
          <p className="text-xs text-gray-600">{instruction || `Put ${totalCount} items into ${basketCount} equal baskets`}</p>
        </div>
      </div>

      {/* Source pile — tap to pick up items */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase text-gray-500 mb-1.5">
          Available ({sourcePile} left)
        </p>
        <div className="flex flex-wrap gap-1 p-3 bg-white rounded-xl border border-amber-100 min-h-[60px]">
          {sourcePile > 0 ? (
            Array.from({ length: Math.min(sourcePile, 24) }).map((_, i) => (
              <button
                key={i}
                onClick={pickUpItem}
                className="text-2xl select-none hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                title="Tap to pick up"
              >
                {itemEmoji}
              </button>
            ))
          ) : (
            <span className="text-xs text-gray-400 italic self-center">
              All items placed — check your answer below
            </span>
          )}
          {sourcePile > 24 && (
            <span className="text-xs text-gray-500 self-center ml-2">
              +{sourcePile - 24} more…
            </span>
          )}
        </div>
      </div>

      {/* Picked-up indicator */}
      {pickedUp > 0 && (
        <div className="mb-3 flex items-center gap-2 p-2 bg-indigo-100 rounded-xl animate-pulse">
          <span className="text-lg">{itemEmoji}</span>
          <span className="text-xs font-semibold text-indigo-700">
            {pickedUp} item{pickedUp !== 1 ? "s" : ""} picked up — tap a basket to drop
          </span>
        </div>
      )}

      {/* Baskets — tap to drop items (or tap when empty to take back) */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase text-gray-500 mb-1.5">
          Baskets (put {expectedPerBasket} in each)
        </p>
        <div className={`grid gap-3 ${basketCount <= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {baskets.map((count, idx) => {
            const isCorrectBasket = checked && count === expectedPerBasket;
            const isWrongBasket = checked && count !== expectedPerBasket;
            return (
              <button
                key={idx}
                onClick={() => pickedUp > 0 ? dropIntoBasket(idx) : takeFromBasket(idx)}
                className={`relative p-3 rounded-xl border-2 min-h-[80px] flex flex-col items-center justify-center gap-1 transition ${
                  isCorrectBasket
                    ? "border-emerald-400 bg-emerald-50"
                    : isWrongBasket
                    ? "border-rose-300 bg-rose-50"
                    : "border-gray-200 bg-white hover:border-amber-300"
                }`}
              >
                <span className="text-2xl opacity-80">{basketEmoji}</span>
                <div className="flex flex-wrap justify-center gap-0.5 max-w-full">
                  {Array.from({ length: Math.min(count, 12) }).map((_, i) => (
                    <span key={i} className="text-base select-none">{itemEmoji}</span>
                  ))}
                  {count > 12 && (
                    <span className="text-[10px] text-gray-500 self-center">+{count - 12}</span>
                  )}
                </div>
                <span className={`text-[10px] font-bold ${
                  isCorrectBasket ? "text-emerald-600"
                  : isWrongBasket ? "text-rose-500"
                  : "text-gray-400"
                }`}>
                  {count} / {expectedPerBasket}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Result */}
      {checked && (
        <div className={`rounded-xl p-3 mb-3 ${
          isCorrect ? "bg-emerald-100 border border-emerald-300" : "bg-rose-100 border border-rose-300"
        }`}>
          {isCorrect ? (
            <div className="flex items-center gap-2">
              <span className="text-xl">🎉</span>
              <div>
                <p className="text-sm font-bold text-emerald-700">Correct! Well done!</p>
                <p className="text-xs text-emerald-600">
                  You put {expectedPerBasket} in each of {basketCount} baskets. {totalCount} ÷ {basketCount} = {expectedPerBasket}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <span className="text-xl">🤔</span>
              <div>
                <p className="text-sm font-bold text-rose-700">Not quite — let's check</p>
                <p className="text-xs text-rose-600 mt-0.5">
                  You need {expectedPerBasket} in each basket. Right now you have: {baskets.join(", ")}
                </p>
                <p className="text-xs text-rose-500 mt-1">
                  💡 Tip: {expectedPerBasket} × {basketCount} = {expectedPerBasket * basketCount} items total.
                  Try moving items between baskets to make them equal.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!checked ? (
          <button
            onClick={checkAnswer}
            disabled={!allPlaced}
            className="flex-1 h-10 rounded-full bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {allPlaced ? "Check Answer" : `Place all ${totalCount} items first`}
          </button>
        ) : (
          <button
            onClick={reset}
            className="flex-1 h-10 rounded-full bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
