import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/topics/[id]/tutor
 * Body: { message, chatHistory?: ChatMessage[] }
 *
 * Topic-specific AI tutor chat. The system prompt includes the topic name,
 * subject, and the latest lesson summary (if cached) so the AI answers with
 * full topic context.
 *
 * Chat history is sent by the client per Phase 3 spec — no DB persistence.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const message: string = (body.message ?? "").toString().trim();
  const incomingHistory: ChatMessage[] = Array.isArray(body.chatHistory) ? body.chatHistory : [];

  if (!message) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const topic = await db.topic.findUnique({ where: { id } });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // Pull cached lesson summary if available
  const lesson = await db.topicLesson.findUnique({
    where: { topicId_level: { topicId: id, level: "beginner" } },
    select: { content: true },
  });
  const lessonSummary =
    (lesson?.content as any)?.summary ??
    (lesson?.content as any)?.introduction ??
    null;

  const rl = checkRateLimit(user.id, user.plan);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily AI limit reached", limit: rl.limit, resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const systemPrompt =
    `You are StudyBuddy, an AI tutor helping a student learn "${topic.name}" in ${topic.subject}. ` +
    (topic.description ? `Topic context: ${topic.description}. ` : "") +
    (lessonSummary ? `Lesson summary so far: ${lessonSummary}. ` : "") +
    `Answer questions specifically about ${topic.name} using examples and step-by-step explanations. ` +
    `If the student asks something unrelated, gently steer back to ${topic.name}. ` +
    `Keep answers under 250 words unless asked for more depth. Reply in the student's language.`;

  const messagesForAI: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...incomingHistory.slice(-10), // keep last 10 messages for context window
    { role: "user", content: message },
  ];

  try {
    const reply = await callAI(messagesForAI, apiKey);
    return NextResponse.json({
      reply,
      role: "assistant" as const,
      remaining: rl.remaining,
    });
  } catch (e: any) {
    refundRateLimit(user.id);
    return NextResponse.json(
      { error: "Tutor call failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
