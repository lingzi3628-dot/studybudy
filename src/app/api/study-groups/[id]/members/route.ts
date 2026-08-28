import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-groups/[id]/members
 *
 * Returns the member list of a study group. Includes each member's name,
 * avatar, XP/level (for the mini leaderboard), and joinedAt timestamp.
 *
 * Phase 46 — used by the StudyGroupScreen to show "who's in this group"
 * and a "Top members" mini leaderboard.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id: groupId } = await params;

  // Verify membership
  const membership = await db.studyGroupMember.findFirst({
    where: { groupId, userId: user.id },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "You are not a member of this group" }, { status: 403 });
  }

  const members = await db.studyGroupMember.findMany({
    where: { groupId },
    orderBy: { joinedAt: "asc" },
    include: {
      user: {
        select: {
          id: true, name: true, avatarUrl: true,
          userXp: { select: { xpAmount: true, level: true } },
        },
      },
    },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? "Anonymous",
      avatarUrl: m.user.avatarUrl,
      xp: m.user.userXp?.xpAmount ?? 0,
      level: m.user.userXp?.level ?? 1,
      joinedAt: m.joinedAt.toISOString(),
      isYou: m.user.id === user.id,
    })),
  });
}
