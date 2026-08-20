import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/study-groups
 * Body: { name, topicId? }
 *
 * Creates a study group. Premium only (free users can join via invite code).
 * Generates a 6-character invite code.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { name?: string; topicId?: string };

  const name = (body.name ?? "").toString().trim();
  if (!name) {
    return NextResponse.json({ error: "Group name required" }, { status: 400 });
  }

  // Premium check — group creation is premium-only
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  if (!isPremium) {
    return NextResponse.json(
      { error: "Creating study groups requires a premium plan. Upgrade to invite friends and study together.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
      { status: 402 }
    );
  }

  // Generate unique invite code
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  const group = await db.studyGroup.create({
    data: {
      name: name.slice(0, 100),
      topicId: body.topicId ?? null,
      createdById: user.id,
      inviteCode,
    },
  });

  // Creator auto-joins
  await db.studyGroupMember.create({
    data: { groupId: group.id, userId: user.id },
  }).catch(() => null);

  return NextResponse.json({
    group,
    inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/study-groups/join?code=${inviteCode}`,
  });
}

/**
 * GET /api/study-groups — list groups the current user is a member of
 */
export async function GET() {
  const user = await getCurrentUser();
  const memberships = await db.studyGroupMember.findMany({
    where: { userId: user.id },
    include: {
      group: {
        select: {
          id: true, name: true, inviteCode: true, topicId: true, createdAt: true,
          topic: { select: { id: true, name: true, subject: true } },
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  }).catch(() => []);

  return NextResponse.json({
    groups: memberships.map((m) => ({ ...m.group, isOwner: m.group.id === user.id })),
  });
}
