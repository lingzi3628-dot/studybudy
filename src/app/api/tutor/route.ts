import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/tutor
 * Body: { messages: ChatMessage[], question?: string }
 *
 * - If `question` is provided, it's appended to `messages` as a user message.
 * - The system prompt is added automatically.
 * - AI responds with a step-by-step conversational answer.
 *
 * Chat history lives in client state; nothing is persisted server-side.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const incomingMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const question: string | undefined = body.question;

  const messagesForAI: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are StudyBuddy, an encouraging AI tutor. Break down complex topics into clear, simple, step-by-step explanations. " +
        "Use short paragraphs, numbered steps where helpful, and one concrete example. " +
        "If the user asks something off-topic from study/learning, gently steer back to learning. " +
        "Reply in the same language the user used. Keep answers under 250 words unless asked to go deep.",
    },
    ...incomingMessages,
  ];
  if (question && !incomingMessages.some((m) => m.role === "user" && m.content === question)) {
    messagesForAI.push({ role: "user", content: question });
  }

  // Rate-limit: free 20/day, pro 100/day
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
