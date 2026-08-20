import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A simple practice hint used when AI hint generation fails. */
function fallbackHint(topicName: string, missedQuestions: number) {
  return `You missed ${missedQuestions} question${missedQuestions === 1 ? "" : "s"}. ` +
    `Re-read the lesson on ${topicName}, focusing on the areas you got wrong, then try again.`;
}

/**
 * POST /api/classroom/[sessionId]/submit-test
 * Body: { testId, answers: [{questionId, selectedIndex}] }
 *
 * Grades a mini-test by comparing selectedIndex to correctIndex.
 *  - Updates ClassTest.score
 *  - Increments ClassSession.progress (by 1/3 per test, capped at 1.0)
 *  - Updates ClassSession.currentTestIndex
 *  - If score < 70% pass threshold, generates an extra practice hint via AI
 *
 * Returns: { score, correctAnswers, explanations, passed, nextAction }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({})) as {
    testId?: string;
    answers?: { questionId: string; selectedIndex: number }[];
  };

  const testId = (body.testId ?? "").toString().trim();
  if (!testId) {
    return NextResponse.json({ error: "testId is required." }, { status: 400 });
  }
  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers must be an array." }, { status: 400 });
  }

  // 1. Fetch session + verify ownership
  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      topic: { select: { id: true, name: true, subject: true, description: true } },
      tests: { where: { id: testId }, take: 1 },
    },
  }).catch(() => null);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.userId !== user.id) {
    return NextResponse.json({ error: "You don't have access to this session." }, { status: 403 });
  }
  const test = session.tests[0];
  if (!test) {
    return NextResponse.json({ error: "Test not found in this session." }, { status: 404 });
  }
  if (test.testType !== "mini") {
    return NextResponse.json(
      { error: "Use the matching submit endpoint for this test type (oral / written)." },
      { status: 400 }
    );
  }

  // 2. Load classroom settings (for passThreshold)
  let settings: any = null;
  try {
    settings = await db.classroomSettings.findFirst();
  } catch (e: any) {
    console.error("ClassroomSettings fetch failed:", e?.message);
  }
  const passThreshold = typeof settings?.passThreshold === "number" ? settings.passThreshold : 0.7;

  // 3. Grade answers
  const questions = Array.isArray(test.questions as any) ? (test.questions as any[]) : [];
  const answerMap = new Map<string, number>();
  for (const a of body.answers) {
    if (a && typeof a.questionId === "string" && typeof a.selectedIndex === "number") {
      answerMap.set(a.questionId, a.selectedIndex);
    }
  }

  let correctCount = 0;
  const perQuestion: any[] = [];
  for (const q of questions) {
    const userIdx = answerMap.get(q.id);
    const correctIdx = typeof q.correctIndex === "number" ? q.correctIndex : null;
    const correct = correctIdx !== null && userIdx === correctIdx;
    if (correct) correctCount += 1;
    perQuestion.push({
      questionId: q.id,
      question: q.question ?? "",
      selectedIndex: userIdx ?? null,
      correctIndex: correctIdx,
      correct,
      explanation: q.explanation ?? "",
    });
  }
  const totalQuestions = Math.max(1, questions.length);
  const score = correctCount / totalQuestions; // 0..1
  const passed = score >= passThreshold;

  // 4. Update ClassTest.score
  await db.classTest.update({
    where: { id: test.id },
    data: { score },
  }).catch(() => {});

  // 5. Update session progress (1/3 per test, capped at 1.0)
  const increment = 1 / 3;
  const newProgress = Math.min(1, (session.progress ?? 0) + increment);
  await db.classSession.update({
    where: { id: session.id },
    data: {
      progress: newProgress,
      currentTestIndex: (session.currentTestIndex ?? 0) + 1,
    },
  }).catch(() => {});

  // 6. If failed, generate an extra practice hint via AI
  let practiceHint: string | null = null;
  if (!passed) {
    const missed = perQuestion.filter((p) => !p.correct);
    const userRec = await db.user.findUnique({
      where: { id: user.id },
      select: { encryptedApiKey: true },
    }).catch(() => null);
    const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are Professor Bloom. The student just took a mini-test and missed some questions. " +
          "Write a short, encouraging practice hint (2-3 sentences) explaining how to study the missed points. " +
          "Return only the hint text, no JSON, no code fences.",
      },
      {
        role: "user",
        content:
          `Topic: ${session.topic.name}\n` +
          `Missed questions: ${JSON.stringify(missed.map((m) => ({ question: m.question, correctIndex: m.correctIndex, explanation: m.explanation })))}`,
      },
    ];

    try {
      const hint = await callAI(messages, apiKey, {
        userId: user.id,
        route: "/api/classroom/submit-test",
      });
      practiceHint = hint?.trim() ? hint.trim().slice(0, 1000) : fallbackHint(session.topic.name, missed.length);
    } catch (e: any) {
      console.error("Practice hint AI failed:", e?.message ?? e);
      practiceHint = fallbackHint(session.topic.name, missed.length);
    }
  }

  // 7. Determine next action
  let nextAction: string;
  if (passed) {
    nextAction = "Continue the lesson — next mini-test will appear soon.";
  } else {
    nextAction = "Review the practice hint, then take the next mini-test when ready.";
  }

  return NextResponse.json({
    score,
    correctAnswers: correctCount,
    totalQuestions,
    passed,
    passThreshold,
    perQuestion,
    explanations: perQuestion.map((p) => ({
      questionId: p.questionId,
      explanation: p.explanation,
      correct: p.correct,
    })),
    progress: newProgress,
    practiceHint,
    nextAction,
  });
}
