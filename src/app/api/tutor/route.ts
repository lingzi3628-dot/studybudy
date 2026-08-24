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
 * 402 = upgrade/limit/insufficient tokens (friendly upgrade card in UI)
 * 500 = server-side error (DB error, AI failure, etc.)
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

  // -------------------------------------------------------------------
  // Phase 22 — pull curriculum context for this user
  // -------------------------------------------------------------------
  // If the user has a grade that matches a 'ready' curriculum grade, fetch
  // all topics for all their subjects and inject them into the system prompt.
  // This makes the AI answer based on the curated curriculum instead of
  // general knowledge — no more hallucination.
  // -------------------------------------------------------------------
  let curriculumContext = "";
  try {
    const userGrade = (user.grade ?? "").toString();
    if (userGrade) {
      const matchingGrade = await db.curriculumGrade.findFirst({
        where: {
          name: { equals: userGrade, mode: "insensitive" },
          status: "ready",
        },
        include: {
          subjects: {
            select: {
              id: true, name: true,
              topics: {
                orderBy: { orderIndex: "asc" },
                select: {
                  name: true,
                  summary: true,
                  contentMarkdown: true,
                },
              },
            },
          },
        },
      });

      if (matchingGrade && matchingGrade.subjects.length > 0) {
        const topicLines: string[] = [];
        for (const subj of matchingGrade.subjects) {
          if (subj.topics.length === 0) continue;
          topicLines.push(`\n## ${subj.name}`);
          for (const t of subj.topics) {
            // Truncate each topic's content to avoid blowing up the token budget
            const content = (t.contentMarkdown ?? "").slice(0, 500);
            topicLines.push(`### ${t.name}`);
            if (t.summary) topicLines.push(`Summary: ${t.summary}`);
            if (content) topicLines.push(content);
          }
        }
        if (topicLines.length > 0) {
          curriculumContext =
            `\n\nIMPORTANT: The student is in ${matchingGrade.name}. Below is the curated ` +
            `curriculum content for their grade. Base your answers on THIS content — do NOT ` +
            `invent facts that aren't here. If the student asks about something not covered ` +
            `in the curriculum, you may answer generally but make it clear it's outside ` +
            `their curriculum.\n\nCURRICULUM CONTENT:\n` +
            topicLines.join("\n").slice(0, 8000); // hard cap to avoid token overflow
        }
      }
    }
  } catch (e: any) {
    // Best-effort — if the curriculum tables don't exist or query fails,
    // just proceed without curriculum context.
    console.error("curriculum context fetch failed:", e?.message);
  }

  const systemContent =
    "You are StudyBuddy, an encouraging AI tutor. Break down complex topics into clear, simple, step-by-step explanations. " +
    "Use short paragraphs, numbered steps where helpful, and one concrete example. " +
    "If the user asks something off-topic from study/learning, gently steer back to learning. " +
    "Reply in the same language the user used. Keep answers under 250 words unless asked to go deep." +
    curriculumContext;

  const messagesForAI: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...incomingMessages,
  ];
  if (question && !incomingMessages.some((m) => m.role === "user" && m.content === question)) {
    messagesForAI.push({ role: "user", content: question });
  }

  // Rate-limit: free 20/day, pro 100/day
  const rl = checkRateLimit(user.id, user.plan);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "You've reached your daily AI limit. Come back tomorrow or upgrade to Premium for more!", limit: rl.limit, resetAt: rl.resetAt, code: "DAILY_LIMIT" },
      { status: 429 }
    );
  }

  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // 1) Check & deduct tokens BEFORE the AI call
  const deduct = await checkAndDeductTokens(user.id, "tutor");
  if (!deduct.ok) {
    // 402 ONLY for genuine upgrade/limit/insufficient-tokens scenarios
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
        { status: 402 }
      );
    }
    // For other errors (DB error, etc.), return 500 — UI shows a different message
    return NextResponse.json(
      { error: "We couldn't process your request right now. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
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

    const msg = e?.message ?? String(e);
    return NextResponse.json(
      { error: "The AI couldn't respond right now. Please try again in a moment.", detail: msg, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }
}
