import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-groups/[id]/chat?since=ISO_DATE
 *
 * Returns chat messages for a study group, optionally filtered to those
 * after `since` (for polling). Ordered oldest-first.
 *
 * Phase 46: simple polling-based chat — no websockets. The frontend polls
 * every 3 seconds. This keeps the change small and works without changes
 * to the deployment infrastructure.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id: groupId } = await params;
  const url = new URL(req.url);
  const since = url.searchParams.get("since");

  // Verify the user is a member of the group
  const membership = await db.studyGroupMember.findFirst({
    where: { groupId, userId: user.id },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "You are not a member of this group" }, { status: 403 });
  }

  const messages = await db.studyGroupMessage.findMany({
    where: {
      groupId,
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      userId: m.userId,
      userName: m.user?.name ?? "Anonymous",
      userAvatar: m.user?.avatarUrl ?? null,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/study-groups/[id]/chat
 * Body: { body: string }
 *
 * Posts a new chat message. Returns the created message.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id: groupId } = await params;
  const body = await req.json().catch(() => ({})) as { body?: string };

  const text = (body.body ?? "").toString().trim();
  if (!text) return NextResponse.json({ error: "Message body required" }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Message too long (max 1000 chars)" }, { status: 400 });

  // Verify membership
  const membership = await db.studyGroupMember.findFirst({
    where: { groupId, userId: user.id },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "You are not a member of this group" }, { status: 403 });
  }

  const message = await db.studyGroupMessage.create({
    data: {
      groupId,
      userId: user.id,
      body: text,
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  // Phase 52 — Web Push fan-out to other group members (best-effort, never blocks)
  try {
    const { sendPushToUsers } = await import("@/lib/push");
    const members = await db.studyGroupMember.findMany({
      where: { groupId, userId: { not: user.id } },
      select: { userId: true },
    });
    const groupName = await db.studyGroup.findUnique({
      where: { id: groupId },
      select: { name: true },
    });
    if (members.length > 0) {
      await sendPushToUsers(
        members.map((m) => m.userId),
        {
          title: `💬 ${groupName?.name ?? "Study group"}`,
          body: `${user.name ?? "A member"}: ${text.slice(0, 120)}`,
          url: "/",
          tag: `group-${groupId}`,
        }
      );
    }
  } catch (pushErr: any) {
    console.warn("[group-chat] push fan-out failed:", pushErr?.message);
  }

  return NextResponse.json({
    message: {
      id: message.id,
      userId: message.userId,
      userName: message.user?.name ?? "Anonymous",
      userAvatar: message.user?.avatarUrl ?? null,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    },
  });
}
