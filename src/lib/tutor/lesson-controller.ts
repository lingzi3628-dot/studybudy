/**
 * Tutor Lesson Controller — Phase 95
 *
 * A small state machine that tracks where the learner is in a structured
 * lesson. Replaces the "improvise a lesson each turn" approach.
 *
 * STAGES:
 *   introduce → explain → check → advance
 *
 *   introduce: AI introduces the topic (hook + relevance)
 *   explain:   AI teaches the concept (2-3 short paragraphs + visual)
 *   check:     AI quizzes the learner (in-chat quiz block)
 *   advance:   Learner answered correctly — AI moves to next topic
 *
 * PIPELINE POSITION:
 *   In context-builder.ts → called AFTER learner-state + RAG, BEFORE the
 *   proactive-teaching rules block. Output is appended as a LESSON STATE:
 *   section in the system prompt.
 *
 * STATE TRANSITIONS (driven by postProcessReply in tutor-chat-engine.ts):
 *   - When the AI emits a quiz block AND the user answers correctly → advance
 *   - When the AI emits a quiz block AND the user answers wrong → stay on 'check'
 *   - When the AI starts teaching a new topic → create a new TutorLessonState
 *   - When the user explicitly says "I'm done" / "next topic" → advance
 *
 * SAFETY:
 *   - Strictly additive: if no TutorLessonState exists for a conversation,
 *     behavior is identical to Phase 94 (free-form chat).
 *   - Feature-flagged via TUTOR_LESSON_CONTROLLER_ENABLED (default: enabled).
 *   - All DB calls are try/catch — failures are silent (no regression).
 *   - advanceLessonState() is idempotent (safe to call multiple times).
 */

import { db } from "@/lib/db";

// ============================================================
// Types
// ============================================================

export type LessonStage = "introduce" | "explain" | "check" | "advance";

export interface LessonState {
  id: string;
  conversationId: string;
  userId: string;
  currentTopic: string;
  currentStage: LessonStage;
  stageUpdatedAt: Date;
  createdAt: Date;
}

export interface LessonStatePromptBlock {
  text: string;
  state: LessonState | null;
}

// ============================================================
// Stage metadata — what each stage means + guidance for the AI
// ============================================================

const STAGE_GUIDANCE: Record<LessonStage, { label: string; guidance: string }> = {
  introduce: {
    label: "INTRODUCE",
    guidance: "You are introducing a new topic. Start with a HOOK (why it matters, a real-world example). Don't dive into details yet — get the learner curious. End by previewing what they'll learn.",
  },
  explain: {
    label: "EXPLAIN",
    guidance: "Teach the concept in 2-3 short paragraphs. Include a visual (mathgraph drawing) when relevant. Define unfamiliar terms. Keep it focused — one concept at a time.",
  },
  check: {
    label: "CHECK",
    guidance: "Quiz the learner to check understanding. Use a ```quiz block with 1-2 questions about what you just taught. Wait for their answer before moving on.",
  },
  advance: {
    label: "ADVANCE",
    guidance: "The learner has demonstrated understanding. Celebrate briefly, then either: (1) Suggest the next related topic, OR (2) Ask what they'd like to learn next. Don't introduce new material until they respond.",
  },
};

// ============================================================
// Feature flag
// ============================================================

export function isLessonControllerEnabled(): boolean {
  const flag = (process.env.TUTOR_LESSON_CONTROLLER_ENABLED ?? "true").toLowerCase().trim();
  return flag !== "false" && flag !== "0" && flag !== "off";
}

// ============================================================
// Main: getLessonState
// ============================================================

/**
 * Get the active lesson state for a conversation.
 *
 * Returns null if:
 *   - Feature flag is off
 *   - No TutorLessonState row exists for this conversation (free-form chat)
 *   - DB query fails (silent failure)
 */
export async function getLessonState(
  conversationId: string | null,
  userId: string,
): Promise<LessonState | null> {
  if (!isLessonControllerEnabled()) return null;
  if (!conversationId || !userId) return null;

  try {
    const row = await db.tutorLessonState.findUnique({
      where: { conversationId },
    });
    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      currentTopic: row.currentTopic,
      currentStage: row.currentStage as LessonStage,
      stageUpdatedAt: row.stageUpdatedAt,
      createdAt: row.createdAt,
    };
  } catch (err: any) {
    console.error("[lesson-controller] getLessonState failed:", err?.message ?? String(err));
    return null;
  }
}

// ============================================================
// State transitions
// ============================================================

/**
 * Create a new lesson state for a conversation.
 *
 * Called when the AI starts teaching a new topic. If a lesson already
 * exists for this conversation, it's updated (topic reset to 'introduce').
 *
 * @returns The created/updated LessonState, or null on failure
 */
export async function startLesson(
  conversationId: string,
  userId: string,
  topic: string,
): Promise<LessonState | null> {
  if (!isLessonControllerEnabled()) return null;
  if (!topic || topic.trim().length === 0) return null;

  try {
    // Upsert — if a lesson already exists for this conversation, update it.
    // This handles the case where the AI starts a new topic mid-conversation.
    const row = await db.tutorLessonState.upsert({
      where: { conversationId },
      create: {
        conversationId,
        userId,
        currentTopic: topic.trim().slice(0, 200),
        currentStage: "introduce",
        stageUpdatedAt: new Date(),
      },
      update: {
        currentTopic: topic.trim().slice(0, 200),
        currentStage: "introduce",
        stageUpdatedAt: new Date(),
      },
    });
    return {
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      currentTopic: row.currentTopic,
      currentStage: row.currentStage as LessonStage,
      stageUpdatedAt: row.stageUpdatedAt,
      createdAt: row.createdAt,
    };
  } catch (err: any) {
    console.error("[lesson-controller] startLesson failed:", err?.message ?? String(err));
    return null;
  }
}

/**
 * Advance the lesson to the next stage.
 *
 * Stage flow: introduce → explain → check → advance
 * If already on 'advance', the lesson is complete (row is deleted).
 *
 * Called from postProcessReply() in tutor-chat-engine.ts when:
 *   - A quiz block is answered correctly
 *   - The user explicitly asks to move on
 *
 * Idempotent: safe to call multiple times. No-op if no lesson is active.
 *
 * @returns The updated LessonState, or null if no lesson exists / failed
 */
export async function advanceLessonState(
  conversationId: string,
  userId: string,
): Promise<LessonState | null> {
  if (!isLessonControllerEnabled()) return null;

  try {
    const current = await db.tutorLessonState.findUnique({
      where: { conversationId },
    });
    if (!current) return null;

    const currentStage = current.currentStage as LessonStage;
    const nextStage: LessonStage | null = {
      introduce: "explain" as LessonStage,
      explain: "check" as LessonStage,
      check: "advance" as LessonStage,
      advance: null,  // lesson complete
    }[currentStage] ?? null;

    if (nextStage === null) {
      // Lesson complete — delete the row (free-form chat resumes)
      await db.tutorLessonState.delete({
        where: { conversationId },
      });
      console.log(`[lesson-controller] lesson complete for conversation ${conversationId}`);
      return null;
    }

    const updated = await db.tutorLessonState.update({
      where: { conversationId },
      data: {
        currentStage: nextStage,
        stageUpdatedAt: new Date(),
      },
    });
    console.log(`[lesson-controller] advanced ${conversationId}: ${currentStage} → ${nextStage}`);
    return {
      id: updated.id,
      conversationId: updated.conversationId,
      userId: updated.userId,
      currentTopic: updated.currentTopic,
      currentStage: updated.currentStage as LessonStage,
      stageUpdatedAt: updated.stageUpdatedAt,
      createdAt: updated.createdAt,
    };
  } catch (err: any) {
    console.error("[lesson-controller] advanceLessonState failed:", err?.message ?? String(err));
    return null;
  }
}

/**
 * End the current lesson (delete the state row).
 *
 * Called when:
 *   - The user says "stop" / "I'm done" / "let's talk about something else"
 *   - The conversation is deleted (cascade)
 *   - The lesson reaches 'advance' and the user moves on
 */
export async function endLesson(conversationId: string): Promise<void> {
  if (!isLessonControllerEnabled()) return;
  try {
    await db.tutorLessonState.delete({
      where: { conversationId },
    });
  } catch (err: any) {
    // Silent — row may not exist (idempotent)
  }
}

// ============================================================
// Prompt-block formatter
// ============================================================

/**
 * Format the lesson state as a system-prompt section.
 *
 * Returns an empty string if state is null (no lesson active).
 *
 * Block format:
 *
 *   === LESSON STATE ===
 *   Active lesson: "Fractions" (stage: EXPLAIN)
 *
 *   STAGE GUIDANCE — EXPLAIN:
 *   Teach the concept in 2-3 short paragraphs. Include a visual (mathgraph
 *   drawing) when relevant. Define unfamiliar terms. Keep it focused — one
 *   concept at a time.
 *
 *   The learner is mid-lesson. Continue teaching the current topic. Do NOT
 *   switch to a new topic unless the learner explicitly asks.
 *   === END LESSON STATE ===
 */
export function formatLessonStateBlock(state: LessonState | null): string {
  if (!state) return "";

  const guidance = STAGE_GUIDANCE[state.currentStage];
  if (!guidance) return "";

  const lines: string[] = ["\n\n=== LESSON STATE ==="];
  lines.push(`Active lesson: "${state.currentTopic}" (stage: ${guidance.label})`);
  lines.push("");
  lines.push(`STAGE GUIDANCE — ${guidance.label}:`);
  lines.push(guidance.guidance);
  lines.push("");
  lines.push("The learner is mid-lesson. Continue teaching the current topic.");
  lines.push("Do NOT switch to a new topic unless the learner explicitly asks.");
  lines.push("If the learner demonstrates understanding (e.g. answers a quiz correctly), advance to the next stage.");
  lines.push("=== END LESSON STATE ===\n");
  return lines.join("\n");
}

// ============================================================
// Convenience: combined helper (used by context-builder)
// ============================================================

/**
 * Get the lesson state and format it as a prompt block in one call.
 *
 * This is the function context-builder.ts calls. It returns an empty
 * string on any failure or when no lesson is active — so callers can
 * blindly append it.
 */
export async function getLessonStatePromptBlock(
  conversationId: string | null,
  userId: string,
): Promise<LessonStatePromptBlock> {
  const state = await getLessonState(conversationId, userId);
  return {
    text: formatLessonStateBlock(state),
    state,
  };
}
