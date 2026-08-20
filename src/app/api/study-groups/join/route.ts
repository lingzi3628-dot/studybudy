import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/study-groups/join
 * Body: { inviteCode }
 *
 * Join a group via invite code. Free users can join (limit 1 group).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { inviteCode?: string };
  const inviteCode = (body.inviteCode ?? "").toString().trim().toUpperCase();

  if (!inviteCode) {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  const group = await db.studyGroup.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, topicId: true, createdById: true },
  }).catch(() => null);

  if (!group) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  // Check if already a member
  const existing = await db.studyGroupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
  }).catch(() => null);

  if (existing) {
    return NextResponse.json({ error: "Already a member", alreadyMember: true, group }, { status: 409 });
  }

  // Free users limited to 1 group
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  if (!isPremium) {
    const groupCount = await db.studyGroupMember.count({
      where: { userId: user.id },
    }).catch(() => 0);
    if (groupCount >= 1) {
      return NextResponse.json(
        { error: "Free users can join only 1 study group. Upgrade to Premium for unlimited.", needsUpgrade: true },
        { status: 402 }
      );
    }
  }

  await db.studyGroupMember.create({
    data: { groupId: group.id, userId: user.id },
  });

  return NextResponse.json({ group, message: `Joined "${group.name}" ✓` });
}
