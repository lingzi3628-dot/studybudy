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
import { checkSseOpen, releaseSse } from "@/lib/sse-rate-limit";
import { runTutorTools } from "@/lib/tutor-tools";
import { logger } from "@/lib/logger";
import { buildTurnContext, type TurnContext } from "@/lib/tutor/turn-manager";

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
  const clientPlatform = body?.clientPlatform === "mobile" ? "mobile" : "web";
  const imageDataUrl = (body?.image ?? "").toString().trim() || null;
  const studyRoomTopicId = (body?.studyRoomTopicId ?? "").toString().trim();
  const dataSaver = !!body?.dataSaver;
  const allowedLearningModes = ["standard", "explain", "practice", "hint", "simpler"] as const;
  const learningMode = allowedLearningModes.includes(body?.learningMode) ? body.learningMode : "standard";
  const requestedBuddyId = (body?.buddyId ?? "").toString().trim();
  const buddyId = isValidBuddyId(requestedBuddyId) ? requestedBuddyId : DEFAULT_BUDDY_ID;
  const buddy = getBuddy(buddyId);

  if (!userMessage && !imageDataUrl) {
    return new Response(JSON.stringify({ error: "Message or image is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Phase 1 — Build turn context (requestId / turnId / idempotencyKey)
  const clientKey = body?.idempotencyKey ? String(body.idempotencyKey).trim() : null;
  const turn: TurnContext = buildTurnContext({
    userId: user.id,
    clientKey,
  });
  const turnLogger = logger.withTurn({
    turnId: turn.turnId,
    requestId: turn.requestId,
    userId: user.id,
  });

  // Phase 53 — SSE safety-net rate limit (runaway-loop brake; the DB-backed
  // daily caps below remain the primary gate).
  const gate = checkSseOpen(user.id, "tutor");
  if (!gate.allowed) {
    console.warn("[tutor-chat-stream] rate-limited:", user.id, gate.reason);
    return new Response(
      JSON.stringify({ error: "Too many streaming requests. Please slow down and try again shortly.", code: "SSE_RATE_LIMIT", retryAfter: gate.retryAfterSec }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(gate.retryAfterSec) },
      }
    );
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

    let studyContext = "";
    if (studyRoomTopicId) {
      const room = await db.studyRoomState.findFirst({
        where: { userId: user.id, topicId: studyRoomTopicId },
        include: { topic: { select: { name: true, subject: true } } },
      }).catch(() => null);
      if (room) {
        const sources = await db.studySet.findMany({
          where: { userId: user.id, topicId: studyRoomTopicId, sourceText: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { title: true, sourceText: true },
        }).catch(() => []);
        const sourceText = sources.filter((source) => source.sourceText?.trim())
          .map((source) => `## ${source.title}\n${source.sourceText}`).join("\n\n").slice(0, 12_000);
        const activeClassroom = room.currentClassroomSessionId ? await db.classroomSession.findFirst({
          where: { id: room.currentClassroomSessionId, userId: user.id, status: "active" },
          select: { flowState: true, currentStep: true, totalSteps: true, progress: true, activeSeconds: true },
        }).catch(() => null) : null;
        const cachedLesson = await db.lessonContent.findFirst({ where: { topicId: studyRoomTopicId }, orderBy: { createdAt: "desc" }, select: { contentJson: true } }).catch(() => null);
        const lessonText = Array.isArray(cachedLesson?.contentJson) ? (cachedLesson.contentJson as any[])
          .map((block: any) => typeof block?.content === "string" ? block.content : "")
          .filter(Boolean).join("\n").slice(0, 5_000) : "";
        const computerTask = room.workspaceProgress && typeof room.workspaceProgress === "object" && !Array.isArray(room.workspaceProgress)
          ? (room.workspaceProgress as Record<string, any>).computerTask : null;
        const taskText = computerTask && typeof computerTask === "object"
          ? `\nCURRENT COMPUTER WORKSPACE TASK: ${String(computerTask.title || "").slice(0, 80)}. Reason: ${String(computerTask.reason || "").slice(0, 240)}. Learner benefit: ${String(computerTask.benefit || "").slice(0, 240)}. Continue helping with this task while respecting their current classroom progress.`
          : "";
        const classroomStatus = activeClassroom
          ? `ACTIVE CLASSROOM: state ${activeClassroom.flowState}; learning step ${activeClassroom.currentStep + 1} of ${activeClassroom.totalSteps}; saved progress ${Math.round(activeClassroom.progress * 100)}%; focused time ${Math.floor(activeClassroom.activeSeconds / 60)} minutes. Continue from this state and never claim progress that is not recorded.`
          : "There is no active classroom session right now. Offer to resume or begin one when relevant; do not imply a session is active.";
        studyContext = `LEARNER'S ACTIVE STUDY ROOM: ${room.topic.subject} — ${room.topic.name}. ${classroomStatus}${taskText} Use these source materials first, say when they do not contain an answer, and distinguish any outside information.\n\n${lessonText ? `CURRENT LESSON MATERIAL:\n${lessonText}\n\n` : ""}${sourceText}`;
      }
    }

    // ---- SSE response stream ----
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        let reply = "";
        try {
          const intents = detectIntents(userMessage);
          send("meta", { conversationId: conversation!.id, remaining: deduct.remaining, tokenBalance: deduct.newBalance, turnId: turn.turnId });
          const toolLabel: Record<string, string> = {
            calculator: "Using the calculator…",
            code_runner: "Running your code…",
            datetime: "Checking the current date and time…",
            web_search: "Searching the web…",
            image_search: "Finding a relevant image…",
          };
          const onToolStatus = (status: { phase: "start" | "done"; tool: string; success?: boolean }) => {
            const label = toolLabel[status.tool];
            if (label && status.phase === "start") send("status", { text: label });
            if (label && status.phase === "done") send("status", { text: status.success ? `${label.replace(/…$/, "")} Done.` : `${label.replace(/…$/, "")} No result found.` });
          };

          if (imageDataUrl) send("status", { text: "Reading the image you attached…" });
          else if (intents.wantsSearch || intents.wantsVideo || intents.wantsImage) send("status", { text: "Looking for useful sources…" });
          const [{ searchContext, searchAttachments }, toolContext] = await Promise.all([
            runWebSearch({ userMessage, intents, dataSaver, onStatus: onToolStatus }),
            runTutorTools(userMessage, onToolStatus),
          ]);
          const { systemContent } = await buildTutorSystemPrompt({
            user,
            buddy,
            buddyId,
            userMessage,
            dataSaver,
            imageDataUrl,
            searchContext,
            toolResults: toolContext,
            studyContext,
            learningMode,
            clientPlatform,
            conversationId: conversation!.id,  // Phase 95 — for lesson state lookup
          });
          const aiMessages: AIMessage[] = [
            { role: "system", content: systemContent },
            ...allMessages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          ];
          const usePlatformStream = !imageDataUrl && (await canStreamPlatform(user.id));
          send("status", { text: "Writing your explanation…" });
          if (!imageDataUrl && intents.wantsDrawing) send("status", { text: "Preparing your drawing…" });

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
            userTrack: (user as any).track,  // Phase 88.1 — skip proof engine for higher-ed
            intents,
            thinkingSteps,
            clientPlatform,
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
            turnId: turn.turnId,
          });
        } catch (e: any) {
          turnLogger.error("tutor stream AI call failed", { error: e?.message ?? String(e) });
          // Phase 1 — Idempotent refund
          await refundTokens(user.id, "tutor", deduct.costTokens, turn.idempotencyKey);
          send("error", {
            ok: false,
            error: e?.message ?? "AI couldn't respond right now. Please try again.",
          });
        } finally {
          releaseSse(user.id, "tutor");
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
    // The stream may or may not have started — release defensively; the
    // limiter tolerates over-release (clamps at 0).
    releaseSse(user.id, "tutor");
    // Phase 1 — Idempotent refund (key prevents double-refund if client retries)
    await refundTokens(user.id, "tutor", deduct.costTokens, turn.idempotencyKey);
    return new Response(JSON.stringify({ error: "Failed to process chat", turnId: turn.turnId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
