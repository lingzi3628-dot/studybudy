import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, callAIJson, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Fallback oral exam questions when AI generation fails. */
function fallbackOralQuestions(topicName: string) {
  return [
    {
      id: "o1",
      question: `Explain in your own words what ${topicName} means and why it matters.`,
      expectedKeyPoints: ["definition", "importance", "context in subject"],
    },
    {
      id: "o2",
      question: `Give an example of ${topicName} and walk through how you would apply it.`,
      expectedKeyPoints: ["concrete example", "step-by-step application", "rationale"],
    },
    {
      id: "o3",
      question: `What is the most common mistake students make with ${topicName}, and how can it be avoided?`,
      expectedKeyPoints: ["identifies a pitfall", "explains the cause", "offers a strategy to avoid it"],
    },
  ];
}

/**
 * POST /api/classroom/[sessionId]/oral-exam
 * Body: { answer?: string }
 *
 * If `answer` is omitted → START the oral exam:
 *   - Generate 3 open-ended questions via AI
 *   - Create a ClassTest(testType='oral') with the questions
 *   - Return the FIRST question, the question index (0), total questions (3),
 *     and isLast=false
 *
 * If `answer` is provided → GRADE the current question against expected key points:
 *   - Look up the active oral ClassTest for this session
 *   - Determine which question we're on based on OralAnswer count
 *   - Use AI to grade the answer (0..1 score) against expectedKeyPoints
 *   - Create an OralAnswer record (userAnswerText, aiFeedback, score)
 *   - Return the NEXT question (or isLast=true if final question answered)
 *
 * Returns:
 *   - Starting: { question, questionIndex, totalQuestions, isLast }
 *   - Answering: { question, questionIndex, totalQuestions, feedback, score, isLast }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({})) as { answer?: string };

  // 1. Fetch session + verify ownership
  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      topic: { select: { id: true, name: true, subject: true, description: true } },
    },
  }).catch(() => null);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.userId !== user.id) {
    return NextResponse.json({ error: "You don't have access to this session." }, { status: 403 });
  }
  if (session.status !== "in_progress") {
    return NextResponse.json({ error: "This class is no longer in progress." }, { status: 400 });
  }

  // Load BYOK key
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // ── Branch 1: START oral exam (no answer provided) ───────────────────────
  const answerText = body.answer != null ? String(body.answer).trim() : "";
  if (answerText.length === 0) {
    // Generate 3 open-ended questions via AI
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are an oral exam generator. Generate 3 open-ended questions about the given topic that test deep understanding. " +
          "Return ONLY JSON (no prose, no code fences) in this exact shape: " +
          JSON.stringify(
            {
              questions: [
                {
                  id: "o1",
                  question: "Open-ended question text",
                  expectedKeyPoints: ["point 1", "point 2", "point 3"],
                },
              ],
            },
            null,
            2
          ),
      },
      {
        role: "user",
        content:
          `Topic: ${session.topic.name}\nSubject: ${session.topic.subject}\n` +
          `Description: ${session.topic.description ?? "general"}`,
      },
    ];

    let questions: any[] = [];
    try {
      const raw = await callAIJson<{ questions: any[] }>(messages, apiKey, {
        userId: user.id,
        route: "/api/classroom/oral-exam",
      });
      const list = Array.isArray(raw?.questions) ? raw.questions : [];
      questions = list.slice(0, 3).map((q, i) => ({
        id: typeof q.id === "string" ? q.id : `o${i + 1}`,
        question: String(q.question ?? ""),
        expectedKeyPoints: Array.isArray(q.expectedKeyPoints)
          ? q.expectedKeyPoints.map((k: any) => String(k ?? "")).slice(0, 8)
          : [],
      })).filter((q) => q.question);
    } catch (e: any) {
      console.error("Oral exam AI failed:", e?.message ?? e);
    }

    if (questions.length === 0) {
      questions = fallbackOralQuestions(session.topic.name);
    }

    // Create ClassTest with testType='oral'
    const test = await db.classTest.create({
      data: {
        sessionId: session.id,
        testType: "oral",
        questions: questions as any,
        score: null,
      },
    });

    return NextResponse.json({
      test: { id: test.id, testType: test.testType },
      question: { id: questions[0].id, question: questions[0].question },
      questionIndex: 0,
      totalQuestions: questions.length,
      isLast: questions.length <= 1,
    });
  }

  // ── Branch 2: GRADE the answer ───────────────────────────────────────────
  // Find the active oral test for this session (most recent, score null)
  const test = await db.classTest.findFirst({
    where: { sessionId: session.id, testType: "oral" },
    orderBy: { createdAt: "desc" },
    include: { oralAnswers: { select: { questionId: true } } },
  }).catch(() => null);

  if (!test) {
    return NextResponse.json(
      { error: "No active oral exam found. Start one first (omit the answer field)." },
      { status: 400 }
    );
  }

  const questions = Array.isArray(test.questions as any) ? (test.questions as any[]) : [];
  if (questions.length === 0) {
    return NextResponse.json({ error: "Oral exam has no questions." }, { status: 500 });
  }

  // Determine the current question index based on the number of OralAnswer records
  const answeredCount = test.oralAnswers.length;
  if (answeredCount >= questions.length) {
    return NextResponse.json(
      { error: "All oral questions already answered.", isLast: true },
      { status: 400 }
    );
  }

  const currentQ = questions[answeredCount];
  const currentQuestionIndex = answeredCount;

  // Grade the answer via AI against expectedKeyPoints
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an oral exam grader. Compare the student's answer to the expected key points. " +
        "Respond with ONLY two sections, separated by a single newline:\n" +
        "Line 1: A score from 0.0 to 1.0 (1 decimal place).\n" +
        "Line 2 onwards: A short, encouraging feedback (2-3 sentences) that references which key points were covered and which were missed.\n" +
        "Do NOT include any JSON, code fences, or other formatting.",
    },
    {
      role: "user",
      content:
        `Question: ${currentQ.question}\n` +
        `Expected key points: ${JSON.stringify(currentQ.expectedKeyPoints ?? [])}\n` +
        `Student answer: ${answerText.slice(0, 2000)}`,
    },
  ];

  let score = 0.5;
  let feedback = "Thanks for your answer! Try to cover all the expected key points next time.";
  try {
    const raw = await callAI(messages, apiKey, {
      userId: user.id,
      route: "/api/classroom/oral-exam",
    });
    if (raw && typeof raw === "string") {
      const lines = raw.trim().split(/\r?\n/);
      const firstNum = parseFloat(lines[0]);
      if (!isNaN(firstNum)) {
        score = Math.max(0, Math.min(1, firstNum));
      }
      if (lines.length > 1) {
        feedback = lines.slice(1).join(" ").trim().slice(0, 1500);
      }
    }
  } catch (e: any) {
    console.error("Oral grading AI failed:", e?.message ?? e);
  }

  // Create OralAnswer record
  await db.oralAnswer.create({
    data: {
      testId: test.id,
      questionId: currentQ.id,
      userAnswerText: answerText.slice(0, 2000),
      aiFeedback: feedback,
      score,
    },
  }).catch(() => {});

  // Compute next question / isLast
  const nextIndex = currentQuestionIndex + 1;
  const isLast = nextIndex >= questions.length;

  // If all questions answered, compute the overall test score (average)
  if (isLast) {
    // Fetch all oral answers for this test to compute the average
    const allAnswers = await db.oralAnswer.findMany({
      where: { testId: test.id },
      select: { score: true },
    }).catch(() => []);
    const validScores = allAnswers
      .map((a) => a.score)
      .filter((s): s is number => typeof s === "number" && !isNaN(s));
    const avg = validScores.length > 0
      ? validScores.reduce((sum, s) => sum + s, 0) / validScores.length
      : score;
    await db.classTest.update({
      where: { id: test.id },
      data: { score: avg },
    }).catch(() => {});
  }

  // If there is a next question, return it
  let nextQuestion: any = null;
  if (!isLast) {
    nextQuestion = { id: questions[nextIndex].id, question: questions[nextIndex].question };
  }

  return NextResponse.json({
    question: nextQuestion,
    questionIndex: nextIndex,
    totalQuestions: questions.length,
    feedback,
    score,
    isLast,
  });
}
