import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardXp } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/learning-paths/[id]/clone — clone a template path for the current user
 *
 * Creates a new path with the same modules + items, no progress.
 * Awards XP for cloning a template.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  // Free users limited to 1 active path
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  if (!isPremium) {
    const activeCount = await db.learningPath.count({
      where: { userId: user.id, status: "active" },
    }).catch(() => 0);
    if (activeCount >= 1) {
      return NextResponse.json(
        { error: "Free users can have 1 active learning path. Complete your current path or upgrade to Premium.", needsUpgrade: true, code: "ACTIVE_PATH_LIMIT" },
        { status: 402 }
      );
    }
  }

  const template = await db.learningPath.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { orderIndex: "asc" },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      },
    },
  }).catch(() => null);

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  if (!template.isTemplate || !template.isPublished) {
    return NextResponse.json({ error: "Path is not a published template." }, { status: 403 });
  }

  // Clone
  const cloned = await db.learningPath.create({
    data: {
      userId: user.id,
      skill: template.skill,
      level: template.level,
      goal: template.goal,
      subject: template.subject,
      topicId: template.topicId,
      roadmap: template.roadmap as any,
      status: "active",
      isTemplate: false,
      isPublished: false,
      sourceTemplateId: template.id,
      coverImageUrl: template.coverImageUrl,
      modules: {
        create: template.modules.map((m, mIdx) => ({
          title: m.title,
          description: m.description,
          orderIndex: mIdx,
          status: mIdx === 0 ? "unlocked" : "locked",
          items: {
            create: m.items.map((it, iIdx) => ({
              type: it.type,
              title: it.title,
              orderIndex: iIdx,
              difficulty: it.difficulty,
              isRequired: it.isRequired,
              completionCriteria: it.completionCriteria as any,
              contentId: null, // content generated on demand when user starts
            })),
          },
        })),
      },
    },
    include: {
      modules: {
        orderBy: { orderIndex: "asc" },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });

  // Award small XP for cloning
  await awardXp(user.id, 10);

  return NextResponse.json({
    learningPath: cloned,
    message: "Template cloned to your paths ✓",
  });
}
