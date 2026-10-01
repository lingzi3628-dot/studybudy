/**
 * Learner State — Phase 92
 *
 * Read-only enrichment module that surfaces what the learner already knows
 * (and what they don't) so the AI tutor can personalize its teaching.
 *
 * This is the highest-impact single change in the Phase 91–97 audit cycle:
 * previously the AI taught every turn as if the learner were starting from
 * scratch (the only signal it had was the chat history). With this module,
 * the AI sees:
 *
 *   - Top 3 weakest topics  (masteryLevel < 0.6, most recently attempted)
 *   - Top 3 strongest topics (masteryLevel >= 0.85, most recently attempted)
 *   - Current streak (days in a row)
 *   - Current level (from UserXp)
 *   - Active study-room topic (if any — so the AI knows what they're studying RIGHT NOW)
 *
 * PIPELINE POSITION:
 *   In context-builder.ts → called AFTER track/course context is built,
 *   BEFORE the proactive-teaching rules block. Output is appended as a
 *   `LEARNER STATE:` section in the system prompt.
 *
 * SCHEMA: ZERO migrations required. Reads only existing tables:
 *   - TopicMastery (Phase 12)
 *   - UserXp (Phase 12)
 *   - StudyRoomState (Phase 12) — best-effort, may be null
 *
 * SAFETY:
 *   - Strictly additive: if this module throws or returns empty, the prompt
 *     is byte-identical to Phase 91 (the LEARNER STATE block is omitted).
 *   - Feature-flagged via process.env.TUTOR_LEARNER_STATE_ENABLED for safe
 *     rollout (default: enabled — but can be turned off instantly if needed).
 *   - Time-boxed: every query has a hard `take` limit. A power user with
 *     thousands of TopicMastery rows still gets the same prompt size.
 */

import { db } from "@/lib/db";

// ============================================================
// Types
// ============================================================

export interface LearnerTopic {
  subject: string;
  topic: string;
  masteryLevel: number;  // 0..1
  totalAttempts: number;
  correctAttempts: number;
  lastUpdated: Date;
}

export interface LearnerState {
  weakestTopics: LearnerTopic[];   // top 3, mastery < 0.6, most recent first
  strongestTopics: LearnerTopic[]; // top 3, mastery >= 0.85, most recent first
  streakDays: number;
  level: number;
  xpAmount: number;
  activeStudyRoom: {
    subject: string;
    topicName: string;
  } | null;
  /** true if there were zero TopicMastery rows for this user (a brand-new learner) */
  isNewLearner: boolean;
}

export interface LearnerStatePromptBlock {
  /** The full text to append to the system prompt (empty string if no data) */
  text: string;
  /** The structured state (for debugging / future use) */
  state: LearnerState | null;
}

// ============================================================
// Module-level cache (in-process, per-request only)
// ============================================================

// NOTE: We deliberately do NOT cache across requests in this module.
// `getCurrentUser()` is already cached (Phase 90 — 90% fewer DB writes),
// and TopicMastery changes whenever the learner takes a quiz. A stale
// learner-state cache would defeat the purpose of personalization.
//
// If we later want to add a 30-second TTL cache to dedupe back-to-back
// messages in the same conversation, that belongs in the route layer,
// not here.

// ============================================================
// Feature flag
// ============================================================

/**
 * Returns true if learner-state injection is enabled.
 *
 * Default: enabled (TUTOR_LEARNER_STATE_ENABLED defaults to "true").
 * Set TUTOR_LEARNER_STATE_ENABLED="false" in env to disable.
 */
export function isLearnerStateEnabled(): boolean {
  const flag = (process.env.TUTOR_LEARNER_STATE_ENABLED ?? "true").toLowerCase().trim();
  return flag !== "false" && flag !== "0" && flag !== "off";
}

// ============================================================
// Main: getLearnerState
// ============================================================

/**
 * Build a snapshot of the learner's current state.
 *
 * All DB queries are wrapped in try/catch — any failure returns null,
 * which means the caller will simply omit the LEARNER STATE block
 * from the system prompt. The AI will then behave exactly as it did
 * in Phase 91 (no regression).
 *
 * @param userId The user's ID
 * @returns LearnerState, or null if any query failed or the flag is off
 */
export async function getLearnerState(userId: string): Promise<LearnerState | null> {
  if (!isLearnerStateEnabled()) return null;
  if (!userId) return null;

  try {
    // Run all three queries in parallel — they're independent.
    const [masteryRows, xpRow, activeRoom] = await Promise.all([
      fetchMasteryRows(userId),
      fetchXp(userId),
      fetchActiveStudyRoom(userId),
    ]);

    if (masteryRows.length === 0 && !xpRow && !activeRoom) {
      // Brand-new learner or DB unavailable — return null (omit the block)
      return null;
    }

    // Sort + slice into weakest + strongest
    const weakestTopics = masteryRows
      .filter((m) => m.masteryLevel < 0.6 && m.totalAttempts > 0)
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
      .slice(0, 3)
      .map(toLearnerTopic);

    const strongestTopics = masteryRows
      .filter((m) => m.masteryLevel >= 0.85 && m.totalAttempts > 0)
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
      .slice(0, 3)
      .map(toLearnerTopic);

    return {
      weakestTopics,
      strongestTopics,
      streakDays: xpRow?.streakDays ?? 0,
      level: xpRow?.level ?? 1,
      xpAmount: xpRow?.xpAmount ?? 0,
      activeStudyRoom: activeRoom,
      isNewLearner: masteryRows.length === 0,
    };
  } catch (err: any) {
    console.error("[learner-state] getLearnerState failed:", err?.message ?? String(err));
    return null;
  }
}

// ============================================================
// Prompt-block builder
// ============================================================

/**
 * Format the LearnerState as a system-prompt section.
 *
 * Returns an empty string if state is null or contains no useful data —
 * callers can blindly append this to the system prompt with no risk of
 * adding a noisy empty block.
 *
 * The block is structured with clear delimiters so the AI can scan it:
 *
 *   === LEARNER STATE ===
 *   Streak: 7 days | Level: 5 (240 XP)
 *   Active study room: Mathematics — Fractions
 *   Weakest topics (review soon):
 *     • Fractions — mastery 35% (2/5 attempts correct, last tried 2 days ago)
 *     • Photosynthesis — mastery 40% (3/8 attempts correct, last tried yesterday)
 *   Strongest topics (you can build on these):
 *     • Addition — mastery 95% (10/10 attempts correct)
 *   === END LEARNER STATE ===
 */
export function formatLearnerStateBlock(state: LearnerState | null): string {
  if (!state) return "";

  // Skip the block entirely if there's nothing to say
  const hasStreak = state.streakDays > 0;
  const hasLevel = state.level > 1;
  const hasXp = state.xpAmount > 0;
  const hasActiveRoom = !!state.activeStudyRoom;
  const hasWeakest = state.weakestTopics.length > 0;
  const hasStrongest = state.strongestTopics.length > 0;
  // isNewLearner counts as "something to say" — we want to emit the NEW LEARNER block
  const hasAnything = hasStreak || hasLevel || hasXp || hasActiveRoom || hasWeakest || hasStrongest || state.isNewLearner;

  if (!hasAnything) return "";
  if (state.isNewLearner && !hasActiveRoom) {
    // Brand-new learner with no study room — say so briefly.
    // This helps the AI greet them as a new student instead of diving into
    // a topic they haven't started.
    return `\n\n=== LEARNER STATE ===
This is a NEW LEARNER with no quiz history yet. Greet them warmly and suggest
a starting topic from their curriculum. Do NOT assume prior knowledge.
=== END LEARNER STATE ===\n`;
  }

  const lines: string[] = ["\n\n=== LEARNER STATE ==="];

  // Header line: streak | level | xp
  const headerParts: string[] = [];
  if (hasStreak) headerParts.push(`Streak: ${state.streakDays} day${state.streakDays === 1 ? "" : "s"}`);
  if (hasLevel) headerParts.push(`Level: ${state.level}`);
  if (hasXp) headerParts.push(`(${state.xpAmount} XP)`);
  if (headerParts.length > 0) {
    lines.push(headerParts.join(" | "));
  }

  // Active study room
  if (hasActiveRoom) {
    lines.push(`Active study room: ${state.activeStudyRoom!.subject} — ${state.activeStudyRoom!.topicName}`);
    lines.push("(Continue teaching in this context unless the student changes the subject.)");
  }

  // Weakest topics
  if (hasWeakest) {
    lines.push("Weakest topics (review soon — the student is struggling with these):");
    for (const t of state.weakestTopics) {
      lines.push(`  • ${t.subject} → ${t.topic} — mastery ${Math.round(t.masteryLevel * 100)}% (${t.correctAttempts}/${t.totalAttempts} attempts correct, last tried ${relativeTime(t.lastUpdated)})`);
    }
  }

  // Strongest topics
  if (hasStrongest) {
    lines.push("Strongest topics (you can build on these — connect new material to what they already know):");
    for (const t of state.strongestTopics) {
      lines.push(`  • ${t.subject} → ${t.topic} — mastery ${Math.round(t.masteryLevel * 100)}% (${t.correctAttempts}/${t.totalAttempts} attempts correct)`);
    }
  }

  // Pedagogical guidance (only if there are weak/strong topics to comment on)
  if (hasWeakest && hasStrongest) {
    lines.push("");
    lines.push("TEACHING GUIDANCE: Use the weakest topics above to decide what to review or re-explain.");
    lines.push("Use the strongest topics as analogies or bridges when introducing new material.");
    lines.push("If the student asks a general question, prefer to pivot toward a weak topic they haven't mastered yet.");
  } else if (hasWeakest) {
    lines.push("");
    lines.push("TEACHING GUIDANCE: The student has weak spots above — proactively offer to review or quiz them on these.");
  } else if (hasStrongest) {
    lines.push("");
    lines.push("TEACHING GUIDANCE: The student is doing well in the topics above — you can introduce new, related material.");
  }

  lines.push("=== END LEARNER STATE ===\n");
  return lines.join("\n");
}

// ============================================================
// Convenience: combined helper (used by context-builder)
// ============================================================

/**
 * Get the learner state and format it as a prompt block in one call.
 *
 * This is the function context-builder.ts calls. It returns an empty
 * string on any failure — so callers can blindly append it.
 */
export async function getLearnerStatePromptBlock(userId: string): Promise<LearnerStatePromptBlock> {
  const state = await getLearnerState(userId);
  return {
    text: formatLearnerStateBlock(state),
    state,
  };
}

// ============================================================
// Internal: DB queries
// ============================================================

async function fetchMasteryRows(userId: string): Promise<Array<{
  subject: string;
  topic: string;
  masteryLevel: number;
  totalAttempts: number;
  correctAttempts: number;
  lastUpdated: Date;
}>> {
  try {
    // Take 30 — we'll filter+sort+slice in memory. A typical learner has <30 topics.
    // Power users with hundreds of topics still only get the 30 most recent, which
    // is enough signal for personalization.
    const rows = await db.topicMastery.findMany({
      where: { userId },
      orderBy: { lastUpdated: "desc" },
      take: 30,
      select: {
        subject: true,
        topic: true,
        masteryLevel: true,
        totalAttempts: true,
        correctAttempts: true,
        lastUpdated: true,
      },
    });
    return rows;
  } catch (err: any) {
    console.error("[learner-state] fetchMasteryRows failed:", err?.message ?? String(err));
    return [];
  }
}

async function fetchXp(userId: string): Promise<{
  streakDays: number;
  level: number;
  xpAmount: number;
} | null> {
  try {
    const row = await db.userXp.findUnique({
      where: { userId },
      select: { streakDays: true, level: true, xpAmount: true },
    });
    return row ?? null;
  } catch (err: any) {
    console.error("[learner-state] fetchXp failed:", err?.message ?? String(err));
    return null;
  }
}

async function fetchActiveStudyRoom(userId: string): Promise<{
  subject: string;
  topicName: string;
} | null> {
  try {
    // Find the most recently updated StudyRoomState for this user.
    // We include the Topic relation to get subject + name.
    const room = await db.studyRoomState.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: {
        topic: {
          select: {
            name: true,
            subject: true,  // the Topic model has a `subject` field
          },
        },
      },
    });
    if (!room?.topic) return null;
    return {
      subject: String(room.topic.subject ?? "General"),
      topicName: String(room.topic.name ?? "Unknown topic"),
    };
  } catch (err: any) {
    // StudyRoomState may not exist for new users, or the Topic model shape
    // may differ — either way, fail soft.
    console.error("[learner-state] fetchActiveStudyRoom failed:", err?.message ?? String(err));
    return null;
  }
}

// ============================================================
// Internal: mappers + helpers
// ============================================================

function toLearnerTopic(row: {
  subject: string;
  topic: string;
  masteryLevel: number;
  totalAttempts: number;
  correctAttempts: number;
  lastUpdated: Date;
}): LearnerTopic {
  return {
    subject: row.subject,
    topic: row.topic,
    masteryLevel: row.masteryLevel,
    totalAttempts: row.totalAttempts,
    correctAttempts: row.correctAttempts,
    lastUpdated: row.lastUpdated,
  };
}

/**
 * Format a Date as a human-friendly relative time string.
 * Returns "today", "yesterday", "2 days ago", "3 weeks ago", etc.
 */
function relativeTime(date: Date): string {
  const now = Date.now();
  const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";  // clock skew — treat as now
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffDay === 0) return "today";
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  const months = Math.floor(diffDay / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}
