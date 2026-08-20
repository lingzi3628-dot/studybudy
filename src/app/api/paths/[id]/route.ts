import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/paths/[id]
 *
 * Phase 17 — Path detail view.
 *
 * Loads the path with modules + items, attaches each item's
 * UserPathProgress.status (defaulting to "not_started" if no row exists),
 * and returns a flat { path, modules: [{ title, items: [{ title, type, status }] }] }
 * shape for easy client consumption.
 *
 * Access control: the path must belong to the requesting user (or be a
 * published template).
 *
 * 404 = path not found
 * 403 = not the owner (and not a published template)
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
                select: { status: true, score: true, completedAt: true },
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
    return NextResponse.json(
      { error: "You don't have access to this learning path." },
      { status: 403 }
    );
  }

  // Compute progress summary
  const allItems = path.modules.flatMap((m) => m.items);
  const completed = allItems.filter(
    (i) => i.userProgress?.[0]?.status === "completed"
  ).length;
  const inProgress = allItems.filter(
    (i) => i.userProgress?.[0]?.status === "in_progress"
  ).length;
  const progress = {
    total: allItems.length,
    completed,
    inProgress,
    percent:
      allItems.length > 0
        ? Math.round((completed / allItems.length) * 100)
        : 0,
  };

  // Build the { path, modules } response shape
  const modules = path.modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status,
    orderIndex: m.orderIndex,
    items: m.items.map((it) => ({
      id: it.id,
      title: it.title,
      type: it.type,
      status: it.userProgress?.[0]?.status ?? "not_started",
      difficulty: it.difficulty,
      isRequired: it.isRequired,
      contentId: it.contentId,
      orderIndex: it.orderIndex,
      score: it.userProgress?.[0]?.score ?? null,
      completedAt: it.userProgress?.[0]?.completedAt ?? null,
    })),
  }));

  return NextResponse.json({
    path: {
      id: path.id,
      skill: path.skill,
      level: path.level,
      goal: path.goal,
      subject: path.subject,
      topicId: path.topicId,
      topic: path.topic,
      status: path.status,
      isActive: path.isActive,
      isTemplate: path.isTemplate,
      isPublished: path.isPublished,
      currentNodeId: path.currentNodeId,
      coverImageUrl: path.coverImageUrl,
      createdAt: path.createdAt,
      updatedAt: path.updatedAt,
      isOwner,
    },
    modules,
    progress,
    currentNodeId: path.currentNodeId,
  });
}
