import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/tutor/conversations
 *   Returns all conversations for the current user (newest first).
 *   Each conversation includes its messages (for scroll-back history).
 *
 * GET /api/tutor/conversations?id=xxx
 *   Returns a single conversation with all messages.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const singleId = url.searchParams.get("id");

  try {
    if (singleId) {
      // Return single conversation with messages
      const conversation = await db.chatConversation.findFirst({
        where: { id: singleId, userId: user.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      return NextResponse.json({ conversation });
    }

    // Return all conversations (with last message preview)
    const conversations = await db.chatConversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1, // just the last message for preview
        },
      },
    });

    return NextResponse.json({ conversations });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ conversations: [] });
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}

/**
 * DELETE /api/tutor/conversations?id=xxx
 *   Deletes a conversation and all its messages.
 */
export async function DELETE(req: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await db.chatConversation.delete({ where: { id, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
