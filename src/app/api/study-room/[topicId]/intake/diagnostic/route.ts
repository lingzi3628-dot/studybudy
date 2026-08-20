import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type DiagnosticQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
};

/**
 * POST /api/study-room/[topicId]/intake/diagnostic
 *
 * Phase 16 — generates 5 multiple-choice diagnostic questions via AI
 * (callAIJson), spaced from easy to hard. The questions are returned
 * to the client *ephemerally* — they are NOT saved to the database
 * in this call. The /diagnostic/submit endpoint later records the
 * score against the answers the client sends back.
 *
 * On AI failure, a set of generic fallback questions is returned so
 * the intake flow never dead-ends.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;

  // Verify the topic
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true, description: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Look up the user's BYOK key (optional)
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey
    ? decryptApiKey(userRec.encryptedApiKey)
    : null;

  // Build the prompt — exactly the format required by Phase 16 spec
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a curriculum designer creating a diagnostic quiz. " +
        "Return ONLY valid JSON — no prose, no code fences, no markdown. " +
        "Schema: {\"questions\":[{\"id\":\"q1\",\"question\":\"\",\"options\":[\"\",\"\",\"\",\"\"],\"correctIndex\":0}]}. " +
        "Always produce exactly 5 questions. Each question has exactly 4 options. " +
        "Order them easy → hard.",
    },
    {
      role: "user",
      content:
        `Generate 5 multiple-choice diagnostic questions about ${topic.name} (${topic.subject}) ranging from easy to hard. ` +
        `Return ONLY JSON: {questions:[{id:'q1',question:'',options:['','','',''],correctIndex:0}]}`,
    },
  ];

  let questions: DiagnosticQuestion[] = [];
  try {
    const parsed = await callAIJson<{ questions?: DiagnosticQuestion[] }>(
      messages,
      apiKey,
      { userId: user.id, route: "/api/study-room/[topicId]/intake/diagnostic" }
    );

    if (parsed && Array.isArray(parsed.questions)) {
      questions = parsed.questions
        .filter(
          (q: any) =>
            q &&
            typeof q.question === "string" &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            typeof q.correctIndex === "number" &&
            q.correctIndex >= 0 &&
            q.correctIndex < 4
        )
        .map((q: any, i: number) => ({
          id: typeof q.id === "string" && q.id ? q.id : `q${i + 1}`,
          question: String(q.question).slice(0, 1000),
          options: q.options.map((o: any) => String(o).slice(0, 300)),
          correctIndex: q.correctIndex,
        }))
        .slice(0, 5);
    }
  } catch (e: any) {
    console.error("Diagnostic AI generation failed:", e?.message ?? e);
  }

  // Fallback if AI failed or returned junk
  if (questions.length === 0) {
    questions = fallbackQuestions(topic.name, topic.subject);
  }

  return NextResponse.json({
    questions,
    topicName: topic.name,
  });
}

/**
 * Generic fallback diagnostic questions used if the AI fails.
 * These are topic-agnostic so the intake flow can still complete.
 */
function fallbackQuestions(topicName: string, subject: string): DiagnosticQuestion[] {
  return [
    {
      id: "q1",
      question: `Which of the following best describes the main idea of ${topicName}?`,
      options: [
        "Its definition and core purpose",
        "A random historical fact",
        "An unrelated concept",
        "A personal opinion",
      ],
      correctIndex: 0,
    },
    {
      id: "q2",
      question: `In ${subject}, ${topicName} is primarily used to:`,
      options: [
        "Solve unrelated problems",
        "Apply a core principle or technique",
        "Memorize dates",
        "Translate languages",
      ],
      correctIndex: 1,
    },
    {
      id: "q3",
      question: `Which is a key concept that underlies ${topicName}?`,
      options: [
        "Random luck",
        "A foundational principle in the topic",
        "Guesswork",
        "Memorizing without understanding",
      ],
      correctIndex: 1,
    },
    {
      id: "q4",
      question: `Which of these is a common pitfall when learning ${topicName}?`,
      options: [
        "Practicing regularly",
        "Skipping the basics",
        "Asking questions",
        "Reviewing material",
      ],
      correctIndex: 1,
    },
    {
      id: "q5",
      question: `Which approach best helps you master ${topicName}?`,
      options: [
        "Ignore the fundamentals",
        "Worked examples + practice problems",
        "Read the answer key first",
        "Avoid making mistakes",
      ],
      correctIndex: 1,
    },
  ];
}
