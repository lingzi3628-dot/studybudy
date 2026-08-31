import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkSseOpen, releaseSse } from "@/lib/sse-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/study-groups/[id]/chat/stream — Phase 52
 *
 * SSE live stream for study-group chat. Replaces the client's 3-second
 * setInterval polling: the server holds ONE connection open, polls the DB
 * itself every 2s, and only pushes when there are new messages. Battery +
 * bandwidth friendly, and works on both self-hosted (Caddy) and Vercel.
 *
 * Event protocol (Server-Sent Events):
 *   event: messages  data: { messages: [...] }   — new messages since last push
 *   id: <ISO date>                                 — Last-Event-ID resume marker
 *   event: ping      data: { t }                  — keep-alive every ~15s
 *   event: bye       data: {}                     — clean close (client auto-reconnects)
 *
 * Resume semantics: each push sets the SSE `id` to the newest message's
 * createdAt. If the connection drops, EventSource reconnects automatically
 * and sends `Last-Event-ID` — we resume from there, so no messages are lost.
 *
 * The stream self-closes after ~50s (Vercel function cap is 60s). The
 * browser's EventSource reconnects on its own — clients get continuous
 * "real-time" without any WebSocket infrastructure.
 */

const POLL_INTERVAL_MS = 2000;
const MAX_LOOP_MS = 50_000; // close before Vercel's 60s function cap
const PING_EVERY_N_POLLS = 7; // ~14s between pings

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id: groupId } = await params;

  // Verify the user is a member of the group
  const membership = await db.studyGroupMember.findFirst({
    where: { groupId, userId: user.id },
    select: { id: true },
  });
  if (!membership) {
    return new Response(JSON.stringify({ error: "You are not a member of this group" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Phase 53 — SSE safety-net rate limit. The group stream polls the DB every
  // 2s for up to 50s, so unbounded concurrent streams would exhaust the Neon
  // connection pool. EventSource auto-reconnect after the 50s self-close
  // counts as a new open — the 60 opens / 5 min window allows ~10 open chats.
  const gate = checkSseOpen(user.id, "group");
  if (!gate.allowed) {
    console.warn("[group-chat-stream] rate-limited:", user.id, gate.reason);
    return new Response(
      JSON.stringify({ error: "Too many live connections. Please try again shortly.", code: "SSE_RATE_LIMIT", retryAfter: gate.retryAfterSec }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(gate.retryAfterSec) },
      }
    );
  }

  // Resume point: Last-Event-ID header (from EventSource auto-reconnect)
  // or ?since= query param on the first connect.
  const url = new URL(req.url);
  const lastEventId = req.headers.get("last-event-id") || url.searchParams.get("since") || null;

  let since: Date | null = lastEventId ? new Date(lastEventId) : null;
  // If no valid resume point, treat as "first connect" — client already has
  // initial messages via the classic GET, so we start from now.
  if (since && isNaN(since.getTime())) since = null;

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  // Phase 53 — release the rate-limit slot exactly once, whether the stream
  // self-closes (50s cap), errors, or the client disconnects (cancel).
  let released = false;
  const releaseOnce = () => {
    if (!released) {
      released = true;
      releaseSse(user.id, "group");
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: any, id?: string) => {
        let chunk = "";
        if (id) chunk += `id: ${id}\n`;
        chunk += `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      let pollCount = 0;
      let closed = false;

      const fetchNew = async (): Promise<{ msgs: any[]; newest: string | null }> => {
        const messages = await db.studyGroupMessage.findMany({
          where: {
            groupId,
            ...(since ? { createdAt: { gt: since } } : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 100,
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        });
        const mapped = messages.map((m) => ({
          id: m.id,
          userId: m.userId,
          userName: m.user?.name ?? "Anonymous",
          userAvatar: m.user?.avatarUrl ?? null,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        }));
        const newest = mapped.length > 0 ? mapped[mapped.length - 1].createdAt : null;
        return { msgs: mapped, newest };
      };

      try {
        while (!closed && Date.now() - startedAt < MAX_LOOP_MS) {
          try {
            const { msgs, newest } = await fetchNew();
            if (msgs.length > 0) {
              since = new Date(newest as string);
              send("messages", { messages: msgs }, newest ?? undefined);
            }
          } catch (dbErr: any) {
            // Transient DB error — keep the stream alive, try next poll
            console.error("[group-chat-stream] poll error:", dbErr?.message);
          }

          pollCount++;
          if (pollCount % PING_EVERY_N_POLLS === 0) {
            send("ping", { t: Date.now() });
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
        if (!closed) send("bye", {});
      } catch (e: any) {
        console.error("[group-chat-stream] fatal:", e?.message);
      } finally {
        closed = true;
        releaseOnce();
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      // Client disconnected (tab closed, EventSource.close()) — stop the poll
      // loop promptly and release the rate-limit slot exactly once.
      closed = true;
      releaseOnce();
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
}
