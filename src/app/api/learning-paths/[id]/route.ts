import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/learning-paths/[id] — fetch full path with modules, items, and user progress
 *
 * Access: owner OR public template
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const path = await db.learningPath.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { orderIndex: "asc" },
        include: {
          items: {
            orderBy: { orderIndex: "asc" },
            include: {
              userProgress: {
                where: { userId: user.id },
                select: { status: true, score: true, attempts: true, completedAt: true, timeSpentSec: true },
              },
            },
          },
        },
      },
      topic: { select: { id: true, name: true, subject: true } },
    },
  }).catch(() => null);

  if (!path) {
    return NextResponse.json({ error: "Learning path not found." }, { status: 404 });
  }

  // Access control: own path OR published template
  const isOwner = path.userId === user.id;
  const isPublicTemplate = path.isTemplate && path.isPublished;
  if (!isOwner && !isPublicTemplate) {
    return NextResponse.json({ error: "You don't have access to this learning path." }, { status: 403 });
  }

  // Compute progress summary
  const allItems = path.modules.flatMap((m) => m.items);
  const completed = allItems.filter((i) => i.userProgress[0]?.status === "completed").length;
  const inProgress = allItems.filter((i) => i.userProgress[0]?.status === "in_progress").length;
  const progress = {
    total: allItems.length,
    completed,
    inProgress,
    percent: allItems.length > 0 ? Math.round((completed / allItems.length) * 100) : 0,
  };

  return NextResponse.json({
    learningPath: {
      ...path,
      isOwner,
    },
    progress,
    tokenBalance: user.tokenBalance,
  });
}
