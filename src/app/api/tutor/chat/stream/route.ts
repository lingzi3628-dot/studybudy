import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, streamPlatformAI, type ChatMessage as AIMessage } from "@/lib/ai";
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
 * POST /api/tutor/chat/stream — Phase 52
 *
 * SSE streaming variant of /api/tutor/chat. Same pipeline (shared engine),
 * but the AI reply is pushed to the client token-by-token as it is generated.
 *
 * Event protocol (Server-Sent Events):
 *   event: meta     data: { conversationId, attachments }         — sent once up front
 *   event: delta    data: { text }                                — incremental reply text
 *   event: done     data: { ok, conversationId, reply, ... }      — final enriched payload
 *   event: error    data: { ok: false, error }                    — failure (tokens refunded)
 *
 * The `done.reply` is the FINAL reply (thinking stripped, proof-engine
 * verification notes appended) — the client replaces its accumulated text
 * with it on receipt. Attachments (graphs, videos, images) are only known
 * after the full reply, so they arrive on `done` too.
 *
 * Streaming path resolution (mirrors callAI's chain):
 *   - Users on a custom model (ModelMapping) → non-streamed callAI (single
 *     delta) so the "model not connected" errors keep working.
 *   - Everyone else (free platform path) → true token streaming via GLM SDK.
 *
 * Body: same as /api/tutor/chat.
 */

// Users with a custom currentModel (e.g. rented / pro models) go through
// callAI's model-mapping logic which can throw meaningful "not connected"
// errors — those paths don't stream today. Free-model users stream directly.
async function canStreamPlatform(userId: string): Promise<boolean> {
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { currentModel: true },
    });
    return !u?.currentModel || u.currentModel === "study_buddy_free";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const conversationId = (body?.conversationId ?? "").toString().trim() || null;
  const userMessage = (body?.message ?? "").toString().trim();
  const imageDataUrl = (body?.image ?? "").toString().trim() || null;
  const dataSaver = !!body?.dataSaver;
  const requestedBuddyId = (body?.buddyId ?? "").toString().trim();
  const buddyId = isValidBuddyId(requestedBuddyId) ? requestedBuddyId : DEFAULT_BUDDY_ID;
  const buddy = getBuddy(buddyId);

  if (!userMessage && !imageDataUrl) {
    return new Response(JSON.stringify({ error: "Message or image is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Deduct tokens (same monetization as the classic route)
  const deduct = await checkAndDeductTokens(user.id, "tutor");
  if (!deduct.ok) {
    const status = deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED" ? 402 : 500;
    return new Response(JSON.stringify({ error: deduct.error, code: deduct.code, needsUpgrade: status === 402 }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- Pre-work (identical to classic route) ----
  let conversation;
  try {
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

    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: userMessage || "(Image attached — please analyze)",
        attachments: imageDataUrl ? [{ type: "image", url: imageDataUrl, caption: "Uploaded image" }] as any : null,
      },
    });

    const allMessages = await db.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const intents = detectIntents(userMessage);
    const { searchContext, searchAttachments } = await runWebSearch({ userMessage, intents, dataSaver });
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

    const usePlatformStream = !imageDataUrl && (await canStreamPlatform(user.id));

    // ---- SSE response stream ----
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        let reply = "";
        try {
          send("meta", { conversationId: conversation!.id, attachments: searchAttachments, remaining: deduct.remaining, tokenBalance: deduct.newBalance });

          if (imageDataUrl) {
            // Vision path — non-streamed (single delta)
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
              ...allMessages
                .slice(0, -1)
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
            send("delta", { text: reply });
          } else if (usePlatformStream) {
            // True token streaming via the GLM platform path
            for await (const delta of streamPlatformAI(aiMessages, { userId: user.id, route: "/api/tutor/chat/stream" })) {
              reply += delta;
              send("delta", { text: delta });
            }
          } else {
            // Custom-model path — full resolution (with meaningful errors), single delta
            reply = await callAI(aiMessages, null, { userId: user.id, route: "/api/tutor/chat/stream" });
            send("delta", { text: reply });
          }

          // Strip thinking block
          const split = splitThinking(reply);
          const cleanReply = split.clean;
          const thinkingSteps = split.steps;

          // Post-process (graphs + examgen + proof) — identical to classic route
          const post = await postProcessReply({
            reply: cleanReply,
            userMessage,
            userId: user.id,
            userGrade: user.grade,
            intents,
            thinkingSteps,
          });

          const allAttachments = [...searchAttachments, ...post.attachments];

          // Persist messages (same as classic route)
          await db.chatMessage.create({
            data: {
              conversationId: conversation!.id,
              userId: user.id,
              role: "assistant",
              content: post.reply,
              attachments: allAttachments.length > 0 ? (allAttachments as any) : null,
            },
          });
          await db.chatConversation.update({
            where: { id: conversation!.id },
            data: { updatedAt: new Date() },
          });

          send("done", {
            ok: true,
            conversationId: conversation!.id,
            reply: post.reply,
            streamedReply: cleanReply,
            attachments: allAttachments.length > 0 ? allAttachments : undefined,
            examGen: post.examGen ?? undefined,
            thinking: [...post.thinkingSteps, ...(post.proofThinkingSteps ?? [])],
            proof: post.proof ?? undefined,
            remaining: deduct.remaining,
            tokenBalance: deduct.newBalance,
          });
        } catch (e: any) {
          console.error("[tutor-chat-stream] error:", e?.message);
          await refundTokens(user.id, "tutor", deduct.costTokens);
          send("error", {
            ok: false,
            error: e?.message ?? "AI couldn't respond right now. Please try again.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: any) {
    console.error("[tutor-chat-stream] setup error:", e?.message);
    await refundTokens(user.id, "tutor", deduct.costTokens);
    return new Response(JSON.stringify({ error: "Failed to process chat" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
