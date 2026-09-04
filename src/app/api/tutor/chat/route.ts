import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type ChatMessage as AIMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";
import { getBuddy, isValidBuddyId, DEFAULT_BUDDY_ID } from "@/lib/buddies/registry";
import {
  detectIntents,
  runWebSearch,
  buildTutorSystemPrompt,
  splitThinking,
  postProcessReply,
} from "@/lib/tutor-chat-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/tutor/chat
 *
 * ChatGPT-style persistent AI Tutor (Phase 28+):
 * - Creates/uses a conversation (messages saved to DB, never lost)
 * - AI can fetch images, videos, graphs via web_search
 * - AI can generate concept maps inline (returned as Mermaid-style JSON for client render)
 * - Returns the AI reply + saves both messages to DB
 *
 * Phase 52: shared logic extracted to src/lib/tutor-chat-engine.ts so this
 * route and /api/tutor/chat/stream (SSE) stay in lockstep.
 *
 * Body: {
 *   conversationId?: string,  // null = create new conversation
 *   message: string,
 * }
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const conversationId = (body?.conversationId ?? "").toString().trim() || null;
  const userMessage = (body?.message ?? "").toString().trim();
  // Optional image attachment — base64 data URL (e.g. "data:image/jpeg;base64,...")
  // When present, the AI calls the vision model to analyze the image.
  const imageDataUrl = (body?.image ?? "").toString().trim() || null;
  // Phase 45: Data Saver mode
  const dataSaver = !!body?.dataSaver;
  // Phase 47/61: Buddy routing — if the client sends a buddyId, use it.
  // If not, fall back to the user's track to pick the right default buddy.
  // This ensures the AI Tutor persona matches the user's education track
  // even if the client doesn't explicitly send buddyId.
  const TRACK_TO_BUDDY: Record<string, string> = {
    k12: "study", dev: "dev", data: "data", ml: "ml",
    aiapp: "ai", tvet: "tvet", server: "server",
    backend: "backend", web: "web", mixed: "study",
  };
  const requestedBuddyId = (body?.buddyId ?? "").toString().trim();
  const trackDefaultBuddy = TRACK_TO_BUDDY[user.track ?? "k12"] ?? "study";
  const buddyId = isValidBuddyId(requestedBuddyId)
    ? requestedBuddyId
    : (isValidBuddyId(trackDefaultBuddy) ? trackDefaultBuddy : DEFAULT_BUDDY_ID);
  const buddy = getBuddy(buddyId);

  if (!userMessage && !imageDataUrl) {
    return NextResponse.json({ error: "Message or image is required" }, { status: 400 });
  }

  // Deduct tokens
  const deduct = await checkAndDeductTokens(user.id, "tutor");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, needsUpgrade: true },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: deduct.error, code: deduct.code }, { status: 500 });
  }

  try {
    // 1. Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await db.chatConversation.findFirst({
        where: { id: conversationId, userId: user.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }
    if (!conversation) {
      const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? "…" : "");
      conversation = await db.chatConversation.create({
        data: { userId: user.id, title },
        include: { messages: true },
      });
    }

    // 2. Save the user's message (with optional image attachment)
    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: userMessage || "(Image attached — please analyze)",
        attachments: imageDataUrl ? [{ type: "image", url: imageDataUrl, caption: "Uploaded image" }] as any : null,
      },
    });

    // 3. Build chat history from DB (last 20 for context window)
    const allMessages = await db.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // 4. Detect intent from user message (engine)
    const intents = detectIntents(userMessage);

    // 5. Web search for general queries (and videos, images) — engine
    const { searchContext, searchAttachments } = await runWebSearch({
      userMessage,
      intents,
      dataSaver,
    });
    const attachments: Array<{ type: string; url: string | null; caption: string }> = [...searchAttachments];

    // 6. Build the system prompt (engine) + assemble AI messages
    const { systemContent } = await buildTutorSystemPrompt({
      user,
      buddy,
      buddyId,
      userMessage,
      dataSaver,
      imageDataUrl,
      searchContext,
    });

    const aiMessages: AIMessage[] = [
      { role: "system", content: systemContent },
      ...allMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // 7. Call AI — if an image was attached, use the vision API; otherwise the standard chat.
    let reply = "";
    let thinkingSteps: string[] = [];
    try {
      if (imageDataUrl) {
        // Vision path — use the z-ai SDK's createVision endpoint directly.
        const ZAI = (await import("z-ai-web-dev-sdk")).default;
        const client = await ZAI.create();
        const visionMessages: any = [
          { role: "system", content: systemContent },
          {
            role: "user",
            content: [
              { type: "text", text: userMessage || "Analyze this image. What is it? Help me understand." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
          // Include the chat history before this message
          ...allMessages
            .slice(0, -1) // exclude the just-saved user message (it's the vision one above)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        const completion: any = await client.chat.completions.createVision({
          model: "glm-4v",
          messages: visionMessages,
        });
        reply =
          completion?.choices?.[0]?.message?.content ??
          completion?.choices?.[0]?.delta?.content ??
          "";
        if (!reply) throw new Error("Vision AI returned empty response");
      } else {
        reply = await callAI(aiMessages, null, { userId: user.id, route: "/api/tutor/chat" });
      }

      // Parse + strip <thinking> block (engine)
      const split = splitThinking(reply);
      reply = split.clean;
      thinkingSteps = split.steps;
    } catch (e: any) {
      await refundTokens(user.id, "tutor", deduct.costTokens);
      // Return 200 (not 500) so the client shows the error as a chat message
      // instead of a network error.
      return NextResponse.json({
        ok: false,
        error: e?.message ?? "AI couldn't respond right now. Please try again.",
      });
    }

    // 8. Post-process: graph specs + examgen + proof engine (engine)
    const post = await postProcessReply({
      reply,
      userMessage,
      userId: user.id,
      userGrade: user.grade,
      intents,
      thinkingSteps,
    });
    const finalReply = post.reply;
    const allAttachments = [...attachments, ...post.attachments];
    const proofResult = post.proof;
    const examGenConfig = post.examGen;
    thinkingSteps = post.thinkingSteps;

    // 9. Save the AI's reply (with attachments metadata)
    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content: finalReply,
        attachments: allAttachments.length > 0 ? (allAttachments as any) : null,
      },
    });

    // 10. Update conversation timestamp
    await db.chatConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      reply: finalReply,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
      examGen: examGenConfig ?? undefined,
      thinking: [...thinkingSteps, ...(post.proofThinkingSteps ?? [])],
      proof: proofResult ?? undefined,
      remaining: deduct.remaining,
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    console.error("[tutor-chat] error:", e?.message);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
