import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";
import { requireFamilyParent } from "@/lib/family-auth";

export const runtime = "nodejs";

/**
 * POST /api/family/ai-teacher
 *
 * A parent-facing AI teacher that summarizes how each child is doing.
 *
 * Body:
 *   {
 *     childrenContext: string,   // pre-formatted summary of all children's progress
 *                               // (built client-side from /api/family/insights data)
 *     question: string,          // parent's question
 *     messages?: ChatMessage[]   // chat history
 *   }
 *
 * Auth: caller must be a Family Parent.
 *
 * The system prompt is built from the children context, so the AI can answer
 * questions like "How is Mike doing?" or "What should I focus on with John?"
 */
export async function POST(req: NextRequest) {
  // Verify parent auth
  let parentCtx;
  try {
    parentCtx = await requireFamilyParent();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));

  const incomingMessages: ChatMessage[] = Array.isArray(body.messages)
    ? body.messages.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      }) as ChatMessage)
    : [];
  const question: string =
    typeof body.question === "string" ? body.question :
    typeof body.message === "string" ? body.message : "";
  const childrenContext: string =
    typeof body.childrenContext === "string" ? body.childrenContext : "";

  if (!question.trim()) {
    return NextResponse.json(
      { error: "Question is required" },
      { status: 400 }
    );
  }

  // Build the system prompt with parent context
  const systemPrompt = [
    "You are StudyBuddy's AI Teacher Assistant, talking to a PARENT about their children's learning progress.",
    "Be warm, encouraging, and concrete. Use specific numbers (XP, streak, accuracy %) when relevant.",
    "Suggest specific actions the parent can take (e.g. 'spend 15 min on Multiplication with John this evening').",
    "Keep replies under 200 words unless asked for detail.",
    "Reply in the same language the parent used.",
    "",
    "PARENT CONTEXT — the parent has these children with the following progress:",
    childrenContext || "(no progress data yet — the children may be new to StudyBuddy)",
  ].join("\n");

  const messagesForAI: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...incomingMessages,
  ];
  if (!incomingMessages.some((m) => m.role === "user" && m.content === question)) {
    messagesForAI.push({ role: "user", content: question });
  }

  // Fetch the parent's User row (for API key + plan)
  const parentUser = await db.user.findUnique({
    where: { id: parentCtx.userId },
    select: { encryptedApiKey: true, plan: true, tokenBalance: true },
  }).catch(() => null);

  const apiKey = parentUser?.encryptedApiKey ? decryptApiKey(parentUser.encryptedApiKey) : null;
  const plan = (parentUser?.plan === "pro" ? "pro" : "free") as "free" | "pro";

  // Rate-limit
  const rl = checkRateLimit(parentCtx.userId, plan);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "You've reached your daily AI limit. Come back tomorrow or upgrade to Premium for more!",
        limit: rl.limit,
        resetAt: rl.resetAt,
        code: "DAILY_LIMIT",
      },
      { status: 429 }
    );
  }

  // Deduct tokens
  const deduct = await checkAndDeductTokens(parentCtx.userId, "tutor");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        {
          error: deduct.error,
          code: deduct.code,
          tokenBalance: parentUser?.tokenBalance ?? 0,
          needsUpgrade: true,
        },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "We couldn't process your request right now.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  // Make the AI call
  try {
    const reply = await callAI(messagesForAI, apiKey, {
      userId: parentCtx.userId,
      route: "/api/family/ai-teacher",
    });
    return NextResponse.json({
      reply,
      role: "assistant" as const,
      remaining: deduct.remaining,
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    refundRateLimit(parentCtx.userId);
    await refundTokens(parentCtx.userId, "tutor", deduct.costTokens);

    const msg = e?.message ?? String(e);
    return NextResponse.json(
      {
        error: "The AI Teacher couldn't respond right now. Please try again in a moment.",
        detail: msg,
        tokenBalance: parentUser?.tokenBalance ?? 0,
      },
      { status: 500 }
    );
  }
}
