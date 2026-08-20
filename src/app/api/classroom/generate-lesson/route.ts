import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Default lesson used when AI generation fails. */
function defaultLesson(topicName: string, subject: string) {
  return [
    { type: "heading", content: `${topicName} — Overview` },
    { type: "text", content: `Welcome to today's class on ${topicName}. In this lesson we will explore the core ideas, work through some examples, and end with a short check-up.` },
    { type: "heading", content: "Key Concepts" },
    { type: "bullet", content: `Definition and importance of ${topicName} in ${subject}.` },
    { type: "bullet", content: "Core principles that underpin this topic." },
    { type: "bullet", content: "Common pitfalls and how to avoid them." },
    { type: "heading", content: "Worked Example" },
    { type: "text", content: "Let's walk through a simple example step by step to anchor the theory." },
    { type: "equation", content: "result = input × factor + offset" },
    { type: "heading", content: "Summary" },
    { type: "text", content: "Great job! Take the upcoming mini-test to see how much you remember." },
  ];
}

/**
 * POST /api/classroom/generate-lesson
 * Body: { topicId }
 *
 * Generates a full whiteboard lesson via AI (15-20 blocks).
 *  - Caches the result in LessonContent (delete previous, insert new)
 *  - Useful for pre-generating lessons before a class starts
 *
 * Returns: { blocks }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { topicId?: string };

  const topicId = (body.topicId ?? "").toString().trim();
  if (!topicId) {
    return NextResponse.json({ error: "topicId is required." }, { status: 400 });
  }

  // 1. Verify topic
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true, description: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // 2. Deduct tokens (classroom = 50 by default — same as start)
  const deduct = await checkAndDeductTokens(user.id, "classroom");
  if (!deduct.ok) {
    if (
      deduct.code === "DAILY_LIMIT" ||
      deduct.code === "INSUFFICIENT_TOKENS" ||
      deduct.code === "MODEL_LOCKED" ||
      deduct.code === "MODEL_RESTING"
    ) {
      return NextResponse.json(
        {
          error: deduct.error,
          code: deduct.code,
          tokenBalance: user.tokenBalance,
          needsUpgrade: true,
        },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't generate the lesson right now. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  // 3. Load BYOK key
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // 4. Generate via AI
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are Professor Bloom teaching a class. Generate whiteboard content as a JSON array of blocks. " +
        "Each block has a 'type' (one of: 'heading', 'text', 'equation', 'bullet') and a 'content' string. " +
        "Return ONLY JSON — no prose, no code fences.",
    },
    {
      role: "user",
      content:
        `Topic: ${topic.name}\nSubject: ${topic.subject}\nDescription: ${topic.description ?? "general overview"}\n\n` +
        `Generate 15-20 blocks covering the topic thoroughly. Include 1-2 equations if applicable. ` +
        `Return ONLY JSON like: ` +
        JSON.stringify(
          [
            { type: "heading", content: "Introduction" },
            { type: "text", content: "..." },
            { type: "equation", content: "E = mc^2" },
            { type: "bullet", content: "..." },
          ],
          null,
          2
        ),
    },
  ];

  let blocks: any[] = [];
  try {
    const raw = await callAIJson<any[]>(messages, apiKey, {
      userId: user.id,
      route: "/api/classroom/generate-lesson",
    });
    if (Array.isArray(raw) && raw.length > 0) {
      blocks = raw
        .filter((b: any) => b && typeof b === "object" && typeof b.content === "string")
        .filter((b: any) => ["heading", "text", "equation", "bullet"].includes(b.type))
        .map((b: any) => ({ type: b.type, content: String(b.content).slice(0, 2000) }))
        .slice(0, 30);
    }
  } catch (e: any) {
    console.error("Lesson generation AI failed:", e?.message ?? e);
  }

  if (blocks.length === 0) {
    // Fallback to default — still cache it so subsequent calls find content
    blocks = defaultLesson(topic.name, topic.subject);
  }

  // 5. Cache in LessonContent (replace previous for this topic)
  try {
    await db.lessonContent.deleteMany({ where: { topicId: topic.id } }).catch(() => {});
    await db.lessonContent.create({
      data: { topicId: topic.id, contentJson: blocks as any },
    });
  } catch (e: any) {
    console.error("LessonContent cache write failed:", e?.message);
  }

  return NextResponse.json({
    blocks,
    tokenBalance: deduct.newBalance,
    costTokens: deduct.costTokens,
  });
}
