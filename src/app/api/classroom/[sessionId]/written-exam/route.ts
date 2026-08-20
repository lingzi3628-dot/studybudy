import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Fallback written exam when AI generation fails. */
function fallbackExam(topicName: string) {
  return [
    {
      id: "w1",
      type: "mcq",
      question: `Which best describes ${topicName}?`,
      options: ["A core concept", "An unrelated topic", "A type of equation", "A historical event"],
      correctIndex: 0,
      explanation: `${topicName} is a core concept in the subject.`,
    },
    {
      id: "w2",
      type: "mcq",
      question: `Why does ${topicName} matter?`,
      options: ["It doesn't", "It underpins advanced material", "It is rare", "No reason"],
      correctIndex: 1,
      explanation: `${topicName} underpins more advanced material.`,
    },
    {
      id: "w3",
      type: "mcq",
      question: `Which is the best study strategy for ${topicName}?`,
      options: ["Skip the lesson", "Practice with examples", "Memorize without context", "Avoid equations"],
      correctIndex: 1,
      explanation: "Practicing with worked examples reinforces understanding.",
    },
    {
      id: "w4",
      type: "short",
      question: `In 1-2 sentences, define ${topicName}.`,
      answer: `A clear, concise definition covering the main idea of ${topicName} and its context in the subject.`,
      explanation: `A good definition covers the main idea and its context.`,
    },
    {
      id: "w5",
      type: "short",
      question: `Give a real-world example where ${topicName} applies.`,
      answer: `A concrete, real-world scenario that demonstrates ${topicName}.`,
      explanation: `Real-world examples anchor the abstract concept.`,
    },
    {
      id: "w6",
      type: "math",
      question: `If a value doubles from x to 2x using the rule of ${topicName}, compute 2x when x=5.`,
      answer: `10`,
      explanation: `2x = 2 × 5 = 10.`,
    },
  ];
}

/**
 * POST /api/classroom/[sessionId]/written-exam
 *
 * Generates a 6-question written exam via AI:
 *   - 3 MCQ, 2 short-answer, 1 math calculation
 *  - Verifies the session belongs to the current user
 *  - Creates a ClassTest(testType='written') with score=null
 *
 * Returns: { test, questions }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getCurrentUser();
  const { sessionId } = await params;

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

  // 2. Load BYOK key
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // 3. Generate 6 written exam questions via AI (3 MCQ + 2 short + 1 math)
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a written exam generator. Generate 6 questions about the given topic:\n" +
        "- 3 MCQ (type='mcq', with options array + correctIndex + explanation)\n" +
        "- 2 short-answer (type='short', with answer string + explanation)\n" +
        "- 1 math calculation (type='math', with answer string + explanation)\n" +
        "Return ONLY JSON (no prose, no code fences) in this exact shape:\n" +
        JSON.stringify(
          {
            questions: [
              { id: "w1", type: "mcq", question: "...", options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "..." },
              { id: "w2", type: "short", question: "...", answer: "...", explanation: "..." },
              { id: "w3", type: "math", question: "...", answer: "...", explanation: "..." },
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
      route: "/api/classroom/written-exam",
    });
    const list = Array.isArray(raw?.questions) ? raw.questions : [];
    questions = list.slice(0, 8).map((q, i) => {
      const type = ["mcq", "short", "math"].includes(q.type) ? q.type : "mcq";
      return {
        id: typeof q.id === "string" ? q.id : `w${i + 1}`,
        type,
        question: String(q.question ?? ""),
        options: Array.isArray(q.options) ? q.options.map((o: any) => String(o ?? "")).slice(0, 6) : undefined,
        correctIndex: type === "mcq" && typeof q.correctIndex === "number" ? q.correctIndex : undefined,
        answer: type !== "mcq" && typeof q.answer === "string" ? q.answer : undefined,
        explanation: typeof q.explanation === "string" ? q.explanation : "",
      };
    }).filter((q) => q.question);
  } catch (e: any) {
    console.error("Written exam AI failed:", e?.message ?? e);
  }

  if (questions.length === 0) {
    questions = fallbackExam(session.topic.name);
  }

  // 4. Create ClassTest with testType='written'
  const test = await db.classTest.create({
    data: {
      sessionId: session.id,
      testType: "written",
      questions: questions as any,
      score: null,
    },
  });

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
