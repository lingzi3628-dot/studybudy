import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";

/**
 * POST /api/tutor
 * Body accepts BOTH { message, chatHistory } (from AITutor.tsx) AND
 *                 { messages, question } (legacy).
 *
 * - The system prompt is added automatically.
 * - AI responds with a step-by-step conversational answer.
 * - On AI failure, tokens already deducted are REFUNDED.
 *
 * Chat history lives in client state; nothing is persisted server-side.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));

  // Accept both new (message/chatHistory) and legacy (messages/question) shapes
  const incomingMessages: ChatMessage[] = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.chatHistory)
      ? body.chatHistory.map((m: any) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? ""),
        }) as ChatMessage)
      : [];
  const question: string | undefined =
    typeof body.question === "string" ? body.question :
    typeof body.message === "string" ? body.message : undefined;

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

  // 1) Check & deduct tokens BEFORE the AI call
  const deduct = await checkAndDeductTokens(user.id, "tutor");
  if (!deduct.ok) {
    return NextResponse.json(
      { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance },
      { status: 402 }
    );
  }

  // 2) Make the AI call
  try {
    const reply = await callAI(messagesForAI, apiKey, { userId: user.id, route: "/api/tutor" });
    return NextResponse.json({
      reply,
      role: "assistant" as const,
      remaining: deduct.remaining,
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    // Refund rate-limit + tokens on failure
    refundRateLimit(user.id);
    await refundTokens(user.id, "tutor", deduct.costTokens);

    // Inspect the error message — if it's a permission/upgrade message,
    // return 402 so the client can show the upgrade card.
    const msg = e?.message ?? String(e);
    const isUpgrade = /upgrade|premium|subscription|tokens?|plan/i.test(msg);
    if (isUpgrade) {
      return NextResponse.json(
        { error: msg, code: "AI_PERMISSION", tokenBalance: user.tokenBalance },
        { status: 402 }
      );
    }

    return NextResponse.json(
      { error: "Tutor call failed", detail: msg, tokenBalance: deduct.newBalance },
      { status: 500 }
    );
  }
}
