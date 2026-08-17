/**
 * SM-2 spaced repetition algorithm (simplified).
 *
 * Reference: https://www.supermemo.com/en/blog/application-of-a-computer-algorithm-to-learn-business-management
 *
 * quality: 0 (incorrect) or 5 (correct) for our flashcard / MCQ use-case.
 * Ease factor is updated per the SM-2 formula but bounded to [1.3, 2.5].
 */

export type CardReviewState = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  lastReviewDate: Date | null;
  dueDate: Date;
};

export type ReviewUpdate = CardReviewState;

/**
 * Apply SM-2 update for a given quality (0..5).
 * Returns the new state — caller persists to card_reviews.
 */
export function sm2Update(
  prev: CardReviewState,
  quality: number
): ReviewUpdate {
  // Clamp quality to [0,5]
  const q = Math.max(0, Math.min(5, quality));
  const now = new Date();

  let { easeFactor, intervalDays, repetitions, lapses } = prev;
  const lastReviewDate = now;

  if (q >= 3) {
    // Correct response
    repetitions += 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor * 10) / 10;
      if (intervalDays < 1) intervalDays = 1;
    }
  } else {
    // Incorrect — reset
    repetitions = 0;
    intervalDays = 0;
    lapses += 1;
  }

  // SM-2 ease factor update
  const newEF =
    easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  easeFactor = Math.max(1.3, Math.min(2.5, Math.round(newEF * 100) / 100));

  const dueDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    lastReviewDate,
    dueDate,
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
  };
}
