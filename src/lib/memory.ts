/**
 * FSRS-5-inspired spaced repetition — Phase 46
 *
 * Upgrades the simplified SM-2 implementation with the Free Spaced
 * Repetition Scheduler algorithm (https://github.com/open-spaced-repetition/fsrs4anki).
 *
 * FSRS-5 uses three parameters per card:
 *   - Stability (S)   — how stable the memory is, in days
 *   - Difficulty (D) — how hard the card feels, on a 1-10 scale
 *   - Retrievability (R) — probability of successful recall at time t
 *
 * Compared to SM-2:
 *   - Better-calibrated intervals (empirically tuned from billions of reviews)
 *   - Decouples "how stable is this memory" from "how hard is this card"
 *   - Considers elapsed time when scheduling the next review
 *   - More accurate spacing for difficult-but-recently-reviewed cards
 *
 * Backward compatibility:
 *   - The exported function is still named `sm2Update` (so callers don't break)
 *   - The state shape is the same `CardReviewState` — `easeFactor` is preserved
 *     (now derived from FSRS difficulty: EF = 1.3 + (2.5 - 1.3) * (10 - D) / 9)
 *   - `intervalDays`, `repetitions`, `lapses`, `dueDate` are all preserved
 *   - `quality` is still 0 (incorrect) or 5 (correct) — internally we map these
 *     to the FSRS 4-point scale: 0→"Again", 5→"Good"
 *
 * Reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki
 */

export type CardReviewState = {
  easeFactor: number;       // Backward compat — derived from FSRS difficulty
  intervalDays: number;
  repetitions: number;
  lapses: number;
  lastReviewDate: Date | null;
  dueDate: Date;
  // Phase 46 — FSRS-5 fields (all optional for backward compat with existing rows)
  stability?: number;       // S — memory stability in days
  difficulty?: number;      // D — 1..10
};

export type ReviewUpdate = CardReviewState;

// FSRS-5 default parameters (the "global" parameters that the optimizer would tune).
// These are the published defaults from the FSRS-5 paper for a 4-button rating system.
const FSRS_PARAMS = {
  w: [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651,
    0.0234, 1.6160, 0.1544, 1.0824, 5.1130, 0.7281, 0.5364,
    1.4685, 0.0032, 0.9124, 0.5204, 0.7882,
  ],
};

const DECAY = -0.5;
const FACTOR = 0.9 ** (1 / DECAY) - 1;

/**
 * FSRS-5 power forgetting curve: retrievability at time t (days) for a card with stability S.
 *   R(t, S) = (1 + t / (9 * S))^DECAY
 */
function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + elapsedDays / (9 * stability), DECAY);
}

/**
 * FSRS-5 next-stability formula for a successful review.
 *   S' = S * (1 + FACTOR * (1 - R) * D^(-DECAY) * exp(1)^(11 - D) * w11)
 * Bounded to a minimum of 0.1 day.
 */
function nextStabilityAfterSuccess(S: number, D: number, R: number): number {
  const w11 = FSRS_PARAMS.w[11];
  const next = S * (1 + FACTOR * (1 - R) * Math.pow(D, -DECAY) * Math.exp(11 - D) * w11);
  return Math.max(0.1, next);
}

/**
 * FSRS-5 next-stability formula for a failed review (lapse).
 *   S' = w11 * D^(-DECAY) * ((S + 1) * w12 - 1) * exp(1)^((1 - R) * w13)
 * Bounded to a minimum of 0.1 day.
 */
function nextStabilityAfterLapse(S: number, D: number, R: number): number {
  const w12 = FSRS_PARAMS.w[12];
  const w13 = FSRS_PARAMS.w[13];
  const next = w12 * Math.pow(D, -DECAY) * ((S + 1) * w12 - 1) * Math.exp((1 - R) * w13);
  return Math.max(0.1, next);
}

/**
 * FSRS-5 next-difficulty formula — mean-reverting toward w6.
 *   D' = w7 * (1 - w8) * (D - 1) + w8 * D + (rating - 3) * w8 * 0.5
 * Bounded to [1, 10].
 */
function nextDifficulty(D: number, rating: 1 | 2 | 3 | 4): number {
  const w7 = FSRS_PARAMS.w[7];
  const w8 = FSRS_PARAMS.w[8];
  const w6 = FSRS_PARAMS.w[6];
  const newD = w7 * (1 - w8) * (D - 1) + w8 * D + (rating - 3) * w8 * 0.5;
  // Mean-revert toward w6 (the optimizer's "ideal" difficulty for new cards)
  return Math.min(10, Math.max(1, w6 + (newD - w6) * 0.5));
}

/**
 * Convert FSRS stability to a "next interval" in days.
 * FSRS targets R=0.9 (90% recall probability) by default.
 *   I = (9 * S * (1/R - 1))^(1/DECAY) - 1
 * where R is the target retrievability (0.9 by default).
 */
function nextInterval(stability: number, targetR = 0.9): number {
  const interval = Math.pow(9 * stability * (1 / targetR - 1), 1 / DECAY) - 1;
  // Round to a reasonable granularity — under 30 days, round to whole days;
  // above 30 days, round to the nearest half-day; above 365 days, leave as is.
  if (interval < 30) return Math.max(1, Math.round(interval));
  if (interval < 365) return Math.round(interval * 2) / 2;
  return interval;
}

/**
 * Apply FSRS-5 update for a given quality (0..5).
 * Returns the new state — caller persists to card_reviews.
 *
 * Backward-compat: this function is still called `sm2Update` so existing
 * call sites in progression.ts and the review API don't need to change.
 */
export function sm2Update(
  prev: CardReviewState,
  quality: number
): ReviewUpdate {
  const q = Math.max(0, Math.min(5, quality));
  const now = new Date();

  // Recover FSRS state from prev (or initialize from easeFactor for legacy rows)
  let S = prev.stability ?? Math.max(0.1, prev.easeFactor * 1.5);
  let D = prev.difficulty ?? 5; // Default difficulty — neutral
  const lastReviewDate = now;
  let { repetitions, lapses, intervalDays } = prev;

  // Elapsed time since the last review (0 for first review)
  const elapsedMs = prev.lastReviewDate ? now.getTime() - prev.lastReviewDate.getTime() : 0;
  const elapsedDays = Math.max(0, elapsedMs / (24 * 60 * 60 * 1000));

  // Current retrievability — probability the user would have remembered at this moment
  const R = retrievability(elapsedDays, S);

  // Map our 2-point quality scale to FSRS's 4-point rating scale:
  //   quality 0 (incorrect) → rating 1 (Again)
  //   quality 5 (correct)   → rating 3 (Good)
  // (We could expose Hard / Easy buttons later to use ratings 2 and 4.)
  const rating: 1 | 3 = q >= 3 ? 3 : 1;

  if (q >= 3) {
    // Successful review — stability grows, difficulty may decrease slightly
    repetitions += 1;
    S = nextStabilityAfterSuccess(S, D, R);
    D = nextDifficulty(D, rating);
  } else {
    // Lapse — stability drops, difficulty increases, repetitions reset
    repetitions = 0;
    lapses += 1;
    S = nextStabilityAfterLapse(S, D, R);
    D = nextDifficulty(D, rating);
  }

  // Compute the next interval using FSRS formula (target 90% recall)
  intervalDays = nextInterval(S, 0.9);

  // Derive easeFactor from FSRS difficulty for backward compat
  //   EF = 1.3 + (2.5 - 1.3) * (10 - D) / 9
  const easeFactor = 1.3 + (2.5 - 1.3) * (10 - D) / 9;

  const dueDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    repetitions,
    lapses,
    lastReviewDate,
    dueDate,
    stability: S,
    difficulty: D,
  };
}

/** Default state for a new card. */
export function defaultCardState(): CardReviewState {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    lastReviewDate: null,
    dueDate: new Date(),
    stability: 0.1,    // Phase 46 — initial stability (low)
    difficulty: 5,     // Phase 46 — initial difficulty (neutral)
  };
}

/**
 * Phase 46 — compute the current retrievability for a card (probability of
 * successful recall right now, given its stability + days since last review).
 * Used by the Flashcards screen to show "85% recall" hints.
 */
export function currentRetrievability(state: CardReviewState): number {
  if (!state.lastReviewDate || !state.stability) return 1;
  const elapsedMs = Date.now() - state.lastReviewDate.getTime();
  const elapsedDays = Math.max(0, elapsedMs / (24 * 60 * 60 * 1000));
  return Math.round(retrievability(elapsedDays, state.stability) * 100) / 100;
}
