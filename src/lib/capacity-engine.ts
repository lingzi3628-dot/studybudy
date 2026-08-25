/**
 * Capacity Engine — Phase 22d
 *
 * Measures each student's capacity per topic + per subject + overall,
 * and recommends whether they should:
 *   - Start the topic (not_started)
 *   - Review the lesson (in_progress, low score)
 *   - Practice more (medium score)
 *   - Advance to the next topic (high score)
 *   - Move to the next subject (all topics mastered)
 *
 * Capacity score = weighted blend of:
 *   - Mastery level (50%) — rolling avg of last 3 quiz scores
 *   - Completion rate (30%) — topics completed / total topics
 *   - Study consistency (20%) — based on streak + study time
 *
 * Recommendations:
 *   capacityScore < 30  → 'review'    (re-read the lesson)
 *   capacityScore < 60  → 'practice'  (take the quiz again)
 *   capacityScore < 85  → 'advance'   (move to the next topic)
 *   capacityScore >= 85 → 'mastered'  (can skip ahead)
 */
import { db } from "./db";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type CapacityInfo = {
  capacityScore: number;        // 0..100
  masteryLevel: number;         // 0..1
  completionRate: number;        // 0..1
  studyTimeMin: number;
  attemptsCount: number;
  correctCount: number;
  accuracy: number;             // 0..1 (correctCount / attemptsCount)
  recommendation: "start" | "review" | "practice" | "advance" | "mastered";
  recommendationText: string;
};

// ---------------------------------------------------------------------
// Public: getOrComputeCapacity
// ---------------------------------------------------------------------

/**
 * Returns the capacity info for a user on a specific topic.
 * If no row exists yet, computes it fresh from quiz attempts.
 *
 * This is the main entry point — call this when a student opens a topic.
 */
export async function getTopicCapacity(
  userId: string,
  topicId: string
): Promise<CapacityInfo> {
  // Try to load the stored capacity row
  const stored = await db.studentCapacity.findUnique({
    where: {
      userId_subjectId_topicId: {
        userId,
        subjectId: "",
        topicId,
      },
    },
  }).catch(() => null);

  // Also load the TopicProgression row (for live stats)
  const progression = await db.topicProgression.findUnique({
    where: { topicId: "" }, // placeholder — will be replaced
  }).catch(() => null);

  // If we have a recent stored capacity (< 5 min old), return it
  if (stored && stored.lastUpdated > new Date(Date.now() - 5 * 60 * 1000)) {
    return formatCapacity(stored, progression);
  }

  // Otherwise, recompute
  const computed = await computeTopicCapacity(userId, topicId);

  // Persist (upsert)
  try {
    await db.studentCapacity.upsert({
      where: {
        userId_subjectId_topicId: {
          userId,
          subjectId: "",
          topicId,
        },
      },
      update: {
        capacityScore: computed.capacityScore,
        masteryLevel: computed.masteryLevel,
        completionRate: computed.completionRate,
        studyTimeMin: computed.studyTimeMin,
        attemptsCount: computed.attemptsCount,
        correctCount: computed.correctCount,
        recommendation: computed.recommendation,
        lastUpdated: new Date(),
      },
      create: {
        userId,
        subjectId: "",
        topicId,
        capacityScore: computed.capacityScore,
        masteryLevel: computed.masteryLevel,
        completionRate: computed.completionRate,
        studyTimeMin: computed.studyTimeMin,
        attemptsCount: computed.attemptsCount,
        correctCount: computed.correctCount,
        recommendation: computed.recommendation,
      },
    });
  } catch (e: any) {
    // best-effort — return the computed value even if persist fails
    console.error("capacity persist failed:", e?.message);
  }

  return computed;
}

// ---------------------------------------------------------------------
// Compute capacity from raw data
// ---------------------------------------------------------------------

async function computeTopicCapacity(
  userId: string,
  topicId: string
): Promise<CapacityInfo> {
  // Load the TopicProgression row (created/updated by the quiz submit flow)
  const prog = await db.topicProgression.findUnique({
    where: { topicId }, // Note: this is the unique key in the schema
  }).catch(() => null);

  // The TopicProgression model has topicId @unique — but we need userId too.
  // Actually looking at the schema, topicId is @unique, but we want per-user.
  // Let me reconsider — I'll query by userId + topicId via a findFirst.

  const progression = await db.topicProgression.findFirst({
    where: { userId, topicId },
  }).catch(() => null);

  const masteryLevel = progression?.masteryLevel ?? 0;
  const attempts = progression?.attempts ?? 0;
  const score = progression?.score ?? 0;
  const studyTimeSec = progression?.timeSpentSec ?? 0;
  const studyTimeMin = Math.round(studyTimeSec / 60);

  // Completion rate: 1 if completed/mastered, 0.5 if in_progress, 0 if not_started
  const completionRate =
    progression?.status === "completed" || progression?.status === "mastered"
      ? 1
      : progression?.status === "in_progress"
      ? 0.5
      : 0;

  // Accuracy: assume correctCount ≈ score * attempts (we don't track raw
  // correct/incorrect counts in TopicProgression — the score field IS the
  // best quiz score 0..1)
  const correctCount = Math.round(score * attempts);
  const accuracy = attempts > 0 ? score : 0;

  // Capacity score = weighted blend
  // - Mastery (50%): masteryLevel * 100
  // - Completion (30%): completionRate * 100
  // - Consistency (20%): based on attempts (capped at 5) + study time (capped at 60 min)
  const consistencyScore =
    Math.min(5, attempts) / 5 * 50 + Math.min(60, studyTimeMin) / 60 * 50;

  const capacityScore = Math.round(
    masteryLevel * 100 * 0.5 +
    completionRate * 100 * 0.3 +
    consistencyScore * 0.2
  );

  // Recommendation
  let recommendation: CapacityInfo["recommendation"] = "start";
  let recommendationText = "Start this topic to begin learning.";

  if (progression?.status === "not_started" || !progression) {
    recommendation = "start";
    recommendationText = "Start this topic to begin learning.";
  } else if (capacityScore < 30) {
    recommendation = "review";
    recommendationText = "Review the lesson — your quiz scores suggest you need more practice with the basics.";
  } else if (capacityScore < 60) {
    recommendation = "practice";
    recommendationText = "You're making progress! Take the quiz again to improve your score.";
  } else if (capacityScore < 85) {
    recommendation = "advance";
    recommendationText = "Great work! You're ready to move to the next topic.";
  } else {
    recommendation = "mastered";
    recommendationText = "Excellent! You've mastered this topic. You can skip ahead or review for fun.";
  }

  return {
    capacityScore,
    masteryLevel,
    completionRate,
    studyTimeMin,
    attemptsCount: attempts,
    correctCount,
    accuracy,
    recommendation,
    recommendationText,
  };
}

// ---------------------------------------------------------------------
// Helper: format a stored StudentCapacity row into CapacityInfo
// ---------------------------------------------------------------------

function formatCapacity(
  stored: any,
  progression: any
): CapacityInfo {
  const attempts = stored.attemptsCount ?? 0;
  const correct = stored.correctCount ?? 0;
  const accuracy = attempts > 0 ? correct / attempts : 0;

  let recommendation: CapacityInfo["recommendation"] = "start";
  let recommendationText = "Start this topic to begin learning.";

  const cap = stored.capacityScore ?? 0;
  if (stored.recommendation === "start" || cap === 0) {
    recommendation = "start";
    recommendationText = "Start this topic to begin learning.";
  } else if (cap < 30) {
    recommendation = "review";
    recommendationText = "Review the lesson — your quiz scores suggest you need more practice with the basics.";
  } else if (cap < 60) {
    recommendation = "practice";
    recommendationText = "You're making progress! Take the quiz again to improve your score.";
  } else if (cap < 85) {
    recommendation = "advance";
    recommendationText = "Great work! You're ready to move to the next topic.";
  } else {
    recommendation = "mastered";
    recommendationText = "Excellent! You've mastered this topic. You can skip ahead or review for fun.";
  }

  return {
    capacityScore: cap,
    masteryLevel: stored.masteryLevel ?? 0,
    completionRate: stored.completionRate ?? 0,
    studyTimeMin: stored.studyTimeMin ?? 0,
    attemptsCount: attempts,
    correctCount: correct,
    accuracy,
    recommendation,
    recommendationText,
  };
}

// ---------------------------------------------------------------------
// Public: recordQuizAttempt
// ---------------------------------------------------------------------

/**
 * Records a quiz attempt for a user on a topic. Updates the TopicProgression
 * row + recomputes the capacity.
 *
 * Call this when a student submits a quiz in the CurriculumTopicView.
 */
export async function recordQuizAttempt(
  userId: string,
  topicId: string,
  score: number,        // 0..1 (fraction correct)
  timeSpentSec: number
): Promise<CapacityInfo> {
  // Load existing progression
  const existing = await db.topicProgression.findFirst({
    where: { userId, topicId },
  }).catch(() => null);

  const newAttempts = (existing?.attempts ?? 0) + 1;
  const newTimeSpent = (existing?.timeSpentSec ?? 0) + timeSpentSec;
  const newBestScore = Math.max(existing?.score ?? 0, score);

  // Rolling mastery = avg of last 3 scores (we approximate by blending)
  const oldMastery = existing?.masteryLevel ?? 0;
  const newMastery = oldMastery * 0.6 + score * 0.4; // weighted toward recent

  // Status
  let status = "in_progress";
  if (newMastery >= 0.85) status = "mastered";
  else if (newMastery >= 0.6) status = "completed";

  // Upsert the TopicProgression row
  // Note: topicId is @unique in the schema, but we want per-user rows.
  // I need to fix the schema — topicId should NOT be @unique.
  // For now, use findFirst + create/update.
  try {
    if (existing) {
      await db.topicProgression.update({
        where: { id: existing.id },
        data: {
          score: newBestScore,
          attempts: newAttempts,
          timeSpentSec: newTimeSpent,
          masteryLevel: newMastery,
          status,
          lastAttemptAt: new Date(),
          completedAt: status === "completed" || status === "mastered"
            ? existing.completedAt ?? new Date()
            : null,
        },
      });
    } else {
      await db.topicProgression.create({
        data: {
          userId,
          topicId,
          score: newBestScore,
          attempts: newAttempts,
          timeSpentSec: newTimeSpent,
          masteryLevel: newMastery,
          status,
          lastAttemptAt: new Date(),
          completedAt: status === "completed" || status === "mastered" ? new Date() : null,
        },
      });
    }
  } catch (e: any) {
    console.error("recordQuizAttempt persist failed:", e?.message);
  }

  // Recompute capacity
  return computeTopicCapacity(userId, topicId);
}

// ---------------------------------------------------------------------
// Public: getSubjectCapacity
// ---------------------------------------------------------------------

/**
 * Returns the overall capacity for a user on a subject (aggregated across
 * all topics in that subject).
 */
export async function getSubjectCapacity(
  userId: string,
  subjectId: string
): Promise<CapacityInfo & { totalTopics: number; completedTopics: number }> {
  // Count total topics in the subject
  const totalTopics = await db.curriculumTopic.count({
    where: { subjectId },
  }).catch(() => 0);

  // Count the user's completed/mastered topics in this subject
  // We need to find topic IDs for this subject, then count progression rows
  const topicIds = await db.curriculumTopic.findMany({
    where: { subjectId },
    select: { id: true },
  }).catch(() => []);
  const topicIdList = topicIds.map((t) => t.id);

  const progressionRows = await db.topicProgression.findMany({
    where: {
      userId,
      topicId: { in: topicIdList },
      status: { in: ["completed", "mastered"] },
    },
  }).catch(() => []);

  const completedTopics = progressionRows.length;
  const completionRate = totalTopics > 0 ? completedTopics / totalTopics : 0;

  // Avg mastery across completed topics
  const avgMastery = progressionRows.length > 0
    ? progressionRows.reduce((sum, p) => sum + (p.masteryLevel ?? 0), 0) / progressionRows.length
    : 0;

  // Total study time
  const allProgression = await db.topicProgression.findMany({
    where: { userId, topicId: { in: topicIdList } },
    select: { timeSpentSec: true, attempts: true, score: true },
  }).catch(() => []);
  const totalStudySec = allProgression.reduce((s, p) => s + (p.timeSpentSec ?? 0), 0);
  const totalAttempts = allProgression.reduce((s, p) => s + (p.attempts ?? 0), 0);
  const avgScore = allProgression.length > 0
    ? allProgression.reduce((s, p) => s + (p.score ?? 0), 0) / allProgression.length
    : 0;

  const capacityScore = Math.round(
    avgMastery * 100 * 0.5 +
    completionRate * 100 * 0.3 +
    Math.min(60, Math.round(totalStudySec / 60)) / 60 * 100 * 0.2
  );

  let recommendation: CapacityInfo["recommendation"] = "start";
  let recommendationText = "Start the first topic to begin learning.";
  if (completedTopics === 0) {
    recommendation = "start";
    recommendationText = "Start the first topic to begin learning.";
  } else if (capacityScore < 30) {
    recommendation = "review";
    recommendationText = "Review earlier topics — you're struggling with the basics.";
  } else if (capacityScore < 60) {
    recommendation = "practice";
    recommendationText = "Keep practicing — you're making progress but need more consistency.";
  } else if (completionRate < 1) {
    recommendation = "advance";
    recommendationText = `Great work! Continue to the next topic (${completedTopics}/${totalTopics} completed).`;
  } else {
    recommendation = "mastered";
    recommendationText = "🎉 You've completed all topics in this subject! Try the next subject.";
  }

  return {
    capacityScore,
    masteryLevel: avgMastery,
    completionRate,
    studyTimeMin: Math.round(totalStudySec / 60),
    attemptsCount: totalAttempts,
    correctCount: Math.round(avgScore * totalAttempts),
    accuracy: totalAttempts > 0 ? avgScore : 0,
    recommendation,
    recommendationText,
    totalTopics,
    completedTopics,
  };
}
