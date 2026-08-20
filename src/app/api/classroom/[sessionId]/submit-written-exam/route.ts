import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/classroom/[sessionId]/submit-written-exam
 * Body: { testId, answers: [{questionId, answer?, selectedIndex?}] }
 *
 * Grades a written exam:
 *  - MCQ: compare selectedIndex to correctIndex
 *  - short-answer / math: ask AI to grade on a 0..1 scale, comparing
 *    the user's answer to the expected `answer` field
 *  - Update ClassTest.score (average across all questions, 0..1)
 *
 * Returns: { score, perQuestion: [{questionId, correct, expected, userAnswer, explanation}], passed }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({})) as {
    testId?: string;
    answers?: { questionId: string; answer?: string; selectedIndex?: number }[];
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
  if (test.testType !== "written") {
    return NextResponse.json(
      { error: "Use the matching submit endpoint for this test type (mini / oral)." },
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

  // 3. Build answer lookup
  const questions = Array.isArray(test.questions as any) ? (test.questions as any[]) : [];
  const answerMap = new Map<string, { answer?: string; selectedIndex?: number }>();
  for (const a of body.answers) {
    if (a && typeof a.questionId === "string") {
      answerMap.set(a.questionId, {
        answer: a.answer != null ? String(a.answer) : undefined,
        selectedIndex: typeof a.selectedIndex === "number" ? a.selectedIndex : undefined,
      });
    }
  }

  // 4. Load BYOK key for AI grading of short/math
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // 5. Grade each question
  const perQuestion: any[] = [];
  let totalScore = 0;
  for (const q of questions) {
    const userAns = answerMap.get(q.id) ?? {};
    let correct = false;
    let scoreForQ = 0;

    if (q.type === "mcq") {
      const correctIdx = typeof q.correctIndex === "number" ? q.correctIndex : null;
      correct = correctIdx !== null && userAns.selectedIndex === correctIdx;
      scoreForQ = correct ? 1 : 0;
    } else {
      // short / math → AI grading
      const userText = (userAns.answer ?? "").trim();
      const expected = (q.answer ?? "").trim();
      if (userText.length === 0) {
        scoreForQ = 0;
        correct = false;
      } else {
        const messages: ChatMessage[] = [
          {
            role: "system",
            content:
              "You are a written-exam grader. Compare the student's answer to the expected answer. " +
              "Return ONLY a single decimal number between 0.0 (wrong) and 1.0 (perfect). " +
              "No prose, no code fences, no JSON. Just the number.",
          },
          {
            role: "user",
            content:
              `Question type: ${q.type}\n` +
              `Question: ${q.question}\n` +
              `Expected answer: ${expected}\n` +
              `Student answer: ${userText.slice(0, 1000)}`,
          },
        ];
        try {
          const raw = await callAI(messages, apiKey, {
            userId: user.id,
            route: "/api/classroom/submit-written-exam",
          });
          const parsed = parseFloat(String(raw ?? "").trim());
          if (!isNaN(parsed)) {
            scoreForQ = Math.max(0, Math.min(1, parsed));
          } else {
            // Fallback: string-match heuristic
            const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
            scoreForQ = norm(userText) === norm(expected) ? 1 : 0;
          }
        } catch (e: any) {
          console.error("AI grading failed for question", q.id, e?.message ?? e);
          // Fallback: simple normalize match
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
          scoreForQ = norm(userText) === norm(expected) ? 1 : 0;
        }
        // Treat as correct if score >= 0.7 (partial credit accepted as correct)
        correct = scoreForQ >= 0.7;
      }
    }
    totalScore += scoreForQ;
    perQuestion.push({
      questionId: q.id,
      type: q.type,
      question: q.question,
      correct,
      score: Math.round(scoreForQ * 100) / 100,
      expected: q.type === "mcq" ? q.options?.[q.correctIndex] ?? q.correctIndex : q.answer,
      userAnswer: q.type === "mcq" ? (userAns.selectedIndex != null ? q.options?.[userAns.selectedIndex] ?? userAns.selectedIndex : null) : (userAns.answer ?? null),
      selectedIndex: q.type === "mcq" ? userAns.selectedIndex : undefined,
      correctIndex: q.type === "mcq" ? q.correctIndex : undefined,
      explanation: q.explanation ?? "",
    });
  }

  const totalQuestions = Math.max(1, questions.length);
  const score = totalScore / totalQuestions; // 0..1
  const passed = score >= passThreshold;

  // 6. Update ClassTest.score
  await db.classTest.update({
    where: { id: test.id },
    data: { score },
  }).catch(() => {});

  return NextResponse.json({
    score,
    totalQuestions,
    passed,
    passThreshold,
    perQuestion,
  });
}
