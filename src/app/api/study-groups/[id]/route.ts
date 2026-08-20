import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-groups/[id]
 *
 * Returns group details, members (with XP), shared bookmarks, mini leaderboard.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const group = await db.studyGroup.findUnique({
    where: { id },
    select: {
      id: true, name: true, topicId: true, createdById: true, inviteCode: true, createdAt: true,
      topic: { select: { id: true, name: true, subject: true } },
    },
  }).catch(() => null);

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Verify membership
  const membership = await db.studyGroupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: user.id } },
  }).catch(() => null);
  if (!membership) {
    return NextResponse.json({ error: "You're not a member of this group" }, { status: 403 });
  }

  const [members, bookmarks] = await Promise.all([
    db.studyGroupMember.findMany({
      where: { groupId: id },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, avatarUrl: true,
            userXp: { select: { xpAmount: true, level: true, streakDays: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }).catch(() => []),
    db.bookmark.findMany({
      where: { groupId: id },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []),
  ]);

  // Mini leaderboard — sort members by XP
  const leaderboard = [...members].sort((a: any, b: any) => (b.user?.userXp?.xpAmount ?? 0) - (a.user?.userXp?.xpAmount ?? 0));

  return NextResponse.json({
    group: { ...group, isOwner: group.createdById === user.id },
    members: members.map((m: any) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email?.split("@")[0] ?? "Anonymous",
      avatarUrl: m.user.avatarUrl,
      xp: m.user.userXp?.xpAmount ?? 0,
      level: m.user.userXp?.level ?? 1,
      streak: m.user.userXp?.streakDays ?? 0,
      joinedAt: m.joinedAt,
      isCurrentUser: m.user.id === user.id,
    })),
    sharedResources: bookmarks.map((b: any) => ({
      id: b.id,
      resourceType: b.resourceType,
      resourceId: b.resourceId,
      sharedBy: { id: b.user.id, name: b.user.name ?? b.user.email?.split("@")[0] ?? "Anonymous" },
      createdAt: b.createdAt,
    })),
    leaderboard: leaderboard.map((m: any, idx: number) => ({
      rank: idx + 1,
      userId: m.user.id,
      name: m.user.name ?? m.user.email?.split("@")[0] ?? "Anonymous",
      avatarUrl: m.user.avatarUrl,
      xp: m.user.userXp?.xpAmount ?? 0,
      isCurrentUser: m.user.id === user.id,
    })),
  });
}

/** DELETE /api/study-groups/[id] — leave group (or delete if owner) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const group = await db.studyGroup.findUnique({
    where: { id },
    select: { id: true, createdById: true },
  }).catch(() => null);

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (group.createdById === user.id) {
    // Owner deletes the group
    await db.studyGroup.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true, message: "Group deleted" });
  }

  // Member just leaves
  await db.studyGroupMember.delete({
    where: { groupId_userId: { groupId: id, userId: user.id } },
  }).catch(() => null);
  return NextResponse.json({ ok: true, message: "Left the group" });
}
