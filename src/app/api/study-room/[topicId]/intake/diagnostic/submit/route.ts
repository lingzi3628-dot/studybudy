import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";

type AnswerPayload = {
  questionId: string;
  selectedIndex: number;
  correctIndex: number;
};

/**
 * POST /api/study-room/[topicId]/intake/diagnostic/submit
 * Body: { answers: [{ questionId, selectedIndex, correctIndex }] }
 *
 * Phase 16 — computes the diagnostic score, saves a UserDiagnosticResult,
 * writes the score back to StudyRoomState.diagnosticScore, and creates /
 * updates the UserTopicFlow with a starting state based on the score:
 *
 *   score >= 0.7 → LEARNING (skip the assessment ramp-up)
 *   score >= 0.4 → LEARNING (still start at LEARNING, but flag extra practice)
 *   score <  0.4 → ASSESSMENT (full flow from the beginning)
 *
 * Returns: { score, message, nextState }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as {
    answers?: AnswerPayload[];
  };

  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (answers.length === 0) {
    return NextResponse.json(
      { error: "Answers are required." },
      { status: 400 }
    );
  }

  // Verify the topic
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Compute the score (correct / total answered)
  const total = answers.length;
  const correct = answers.filter(
    (a) =>
      a &&
      typeof a.selectedIndex === "number" &&
      typeof a.correctIndex === "number" &&
      a.selectedIndex === a.correctIndex
  ).length;
  const score = total > 0 ? correct / total : 0;

  // Persist the diagnostic result
  await db.userDiagnosticResult.create({
    data: {
      userId: user.id,
      topicId: topic.id,
      score,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedIndex: a.selectedIndex,
        correct: a.selectedIndex === a.correctIndex,
      })) as any,
    },
  }).catch((e: any) => {
    console.error("UserDiagnosticResult save failed:", e?.message);
  });

  // Determine the next flow state from the score
  let nextState: string;
  let needsExtraPractice = false;
  if (score >= 0.7) {
    nextState = "LEARNING";
  } else if (score >= 0.4) {
    nextState = "LEARNING";
    needsExtraPractice = true;
  } else {
    nextState = "ASSESSMENT";
  }

  // Write the score back to the room state, and upsert the UserTopicFlow
  await db.studyRoomState.update({
    where: { userId_topicId: { userId: user.id, topicId: topic.id } },
    data: { diagnosticScore: score, lastVisited: new Date() },
  }).catch((e: any) => {
    console.error("StudyRoomState diagnosticScore update failed:", e?.message);
  });

  await db.userTopicFlow.upsert({
    where: { userId_topicId: { userId: user.id, topicId: topic.id } },
    create: {
      userId: user.id,
      topicId: topic.id,
      currentState: nextState,
      progress: score,
      nextActionId: needsExtraPractice ? "extra_practice" : null,
      lastActivity: new Date(),
    },
    update: {
      currentState: nextState,
      progress: score,
      nextActionId: needsExtraPractice ? "extra_practice" : null,
      lastActivity: new Date(),
    },
  }).catch((e: any) => {
    console.error("UserTopicFlow upsert failed:", e?.message);
  });

  // Light-touch activity bump (no XP — diagnostic is just onboarding)
  await recordActivity(user.id, 0).catch(() => {});

  // Professor Bloomer's in-character message based on the score
  const message =
    score >= 0.7
      ? "Excellent! You already know a lot! Let's dive into the lesson."
      : score >= 0.4
      ? "Good start! Let's review the lesson — and I'll throw in some extra practice to be safe."
      : "Let's start from the beginning. Don't worry — we'll get there together!";

  return NextResponse.json({
    score,
    message,
    nextState,
    needsExtraPractice,
  });
}
