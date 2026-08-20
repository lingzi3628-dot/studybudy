import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Fallback questions when AI generation fails. */
function fallbackQuestions(topicName: string) {
  return [
    {
      id: "q1",
      question: `Which of the following best describes ${topicName}?`,
      options: ["A core concept in the subject", "An unrelated topic", "A type of equation", "A historical event"],
      correctIndex: 0,
      explanation: `${topicName} is a core concept covered in today's lesson.`,
    },
    {
      id: "q2",
      question: `Which statement about ${topicName} is TRUE?`,
      options: ["It has no practical use", "It builds on simpler ideas", "It cannot be tested", "It is unrelated to the subject"],
      correctIndex: 1,
      explanation: `${topicName} builds on simpler foundational ideas from the subject.`,
    },
    {
      id: "q3",
      question: `What is the best way to study ${topicName}?`,
      options: ["Skip the lesson", "Practice with examples", "Memorize without context", "Avoid equations"],
      correctIndex: 1,
      explanation: "Practicing with worked examples helps reinforce understanding.",
    },
    {
      id: "q4",
      question: `Why is ${topicName} important?`,
      options: ["It isn't", "It underpins more advanced material", "It only matters in exams", "No reason"],
      correctIndex: 1,
      explanation: `${topicName} underpins more advanced material you'll see later.`,
    },
  ];
}

/**
 * POST /api/classroom/[sessionId]/test
 * Body: { testType: 'mini' }
 *
 * Generates a 3-5 MCQ mini-test via AI based on the session topic.
 *  - Verifies the session belongs to the current user
 *  - Creates a ClassTest(testType='mini') with score=null
 *  - Returns the test + sanitized questions (correctIndex/explanation included
 *    for client-side review AFTER submission — see submit-test).
 *
 * Returns: { test, questions }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({})) as { testType?: string };

  const testType = (body.testType ?? "mini").toString();
  if (testType !== "mini") {
    return NextResponse.json(
      { error: "This endpoint only supports testType='mini'. Use /oral-exam or /written-exam for other test types." },
      { status: 400 }
    );
  }

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

  // 2. Load BYOK key (if any)
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // 3. Generate 4 MCQ questions via AI
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a quiz generator. Generate 4 multiple-choice questions about the given topic. " +
        "Return ONLY JSON (no prose, no code fences) in this exact shape: " +
        JSON.stringify(
          {
            questions: [
              {
                id: "q1",
                question: "Question text",
                options: ["A", "B", "C", "D"],
                correctIndex: 0,
                explanation: "Short explanation",
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
      route: "/api/classroom/test",
    });
    const list = Array.isArray(raw?.questions) ? raw.questions : [];
    questions = list.slice(0, 5).map((q, i) => ({
      id: typeof q.id === "string" ? q.id : `q${i + 1}`,
      question: String(q.question ?? ""),
      options: Array.isArray(q.options) ? q.options.map((o: any) => String(o ?? "")).slice(0, 6) : [],
      correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
      explanation: typeof q.explanation === "string" ? q.explanation : "",
    })).filter((q) => q.question && q.options.length >= 2);
  } catch (e: any) {
    console.error("Mini-test AI failed:", e?.message ?? e);
  }

  if (questions.length === 0) {
    questions = fallbackQuestions(session.topic.name);
  }

  // 4. Create ClassTest with score=null
  const test = await db.classTest.create({
    data: {
      sessionId: session.id,
      testType: "mini",
      questions: questions as any,
      score: null,
    },
  });

  // 5. Bump currentTestIndex (new test taken)
  const newIndex = (session.currentTestIndex ?? 0) + 1;
  await db.classSession.update({
    where: { id: session.id },
    data: { currentTestIndex: newIndex },
  }).catch(() => {});

  // Return questions (including correctIndex for client-side immediate feedback;
  // the client may hide it until the user submits).
  return NextResponse.json({
    test: {
      id: test.id,
      sessionId: test.sessionId,
      testType: test.testType,
      createdAt: test.createdAt,
      score: test.score,
    },
    questions,
  });
}
