import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/path
 *
 * Phase 17 — Dashboard path timeline.
 *
 * Loads the user's current active path (UserActivePath where isCurrent=true),
 * joins with LearningPath + PathModules + PathItems + UserPathProgress, and
 * builds a node list with per-module status (completed/current/locked).
 *
 * If the user has no current path, returns { hasPath: false } so the client
 * can render the empty state.
 *
 * Response shape (hasPath:true):
 *   { hasPath: true,
 *     path: { id, skill, subject, progress: {total, completed, percent} },
 *     nodes: [{ id, title, status, itemCount, completedItems }],
 *     currentNodeId }
 */
export async function GET() {
  const user = await getCurrentUser();

  // 1) Find current UserActivePath row
  let active = await db.userActivePath.findFirst({
    where: { userId: user.id, isCurrent: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, pathId: true },
  }).catch(() => null);

  // 1b) If no UserActivePath, check for existing LearningPath rows (Phase 12 paths)
  //     and auto-link the most recent one
  if (!active) {
    const existingPath = await db.learningPath.findFirst({
      where: { userId: user.id, isTemplate: false },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }).catch(() => null);

    if (existingPath) {
      // Auto-create UserActivePath for the existing path
      try {
        await db.userActivePath.create({
          data: { userId: user.id, pathId: existingPath.id, isCurrent: true },
        });
        // Also set isActive on the path
        await db.learningPath.update({
          where: { id: existingPath.id },
          data: { isActive: true },
        }).catch(() => {});
      } catch {
        // Might already exist (unique constraint) — try update instead
        await db.userActivePath.update({
          where: { userId_pathId: { userId: user.id, pathId: existingPath.id } },
          data: { isCurrent: true },
        }).catch(() => {});
      }
      // Re-fetch
      active = await db.userActivePath.findFirst({
        where: { userId: user.id, isCurrent: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, pathId: true },
      }).catch(() => null);
    }
  }

  if (!active) {
    return NextResponse.json({ hasPath: false });
  }

  // 2) Load full path with modules + items + user progress (single query)
  const path = await db.learningPath.findUnique({
    where: { id: active.pathId },
    include: {
      modules: {
        orderBy: { orderIndex: "asc" },
        include: {
          items: {
            orderBy: { orderIndex: "asc" },
            include: {
              userProgress: {
                where: { userId: user.id },
                select: { status: true },
              },
            },
          },
        },
      },
    },
  }).catch(() => null);

  if (!path) {
    // Path was deleted but UserActivePath row still exists — treat as no path
    return NextResponse.json({ hasPath: false });
  }

  // 3) Build node list with per-module status
  const currentNodeId = path.currentNodeId;
  const nodes: {
    id: string;
    title: string;
    status: "completed" | "current" | "locked" | "unlocked";
    itemCount: number;
    completedItems: number;
  }[] = [];

  let totalItems = 0;
  let totalCompleted = 0;

  for (const m of path.modules) {
    const items = m.items;
    const itemCount = items.length;
    // Count completed required items as well as all completed items
    const completedItems = items.filter(
      (it) => it.userProgress?.[0]?.status === "completed"
    ).length;

    totalItems += itemCount;
    totalCompleted += completedItems;

    // Determine module status:
    // - completed: PathModule.status === 'completed' OR all required items done
    // - current: matches currentNodeId (or first unlocked if currentNodeId missing)
    // - locked: PathModule.status === 'locked'
    // - unlocked: PathModule.status === 'unlocked' (reachable but not current)
    let status: "completed" | "current" | "locked" | "unlocked" = "locked";

    const requiredItems = items.filter((it) => it.isRequired);
    const allRequiredDone =
      requiredItems.length > 0
        ? requiredItems.every(
            (it) => it.userProgress?.[0]?.status === "completed"
          )
        : items.length > 0
        ? items.every(
            (it) => it.userProgress?.[0]?.status === "completed"
          )
        : false;

    if (m.status === "completed" || allRequiredDone) {
      status = "completed";
    } else if (currentNodeId ? m.id === currentNodeId : m.status === "unlocked") {
      status = "current";
    } else if (m.status === "locked") {
      status = "locked";
    } else {
      status = "unlocked";
    }

    nodes.push({
      id: m.id,
      title: m.title,
      status,
      itemCount,
      completedItems,
    });
  }

  const progress = {
    total: totalItems,
    completed: totalCompleted,
    percent:
      totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0,
  };

  return NextResponse.json({
    hasPath: true,
    path: {
      id: path.id,
      skill: path.skill,
      subject: path.subject,
      topicId: path.topicId,  // needed for navigating to Study Room
      progress,
    },
    nodes,
    currentNodeId,
    // Phase 17b — extra dashboard data
    dueReviewsCount: await db.cardReview.count({
      where: { userId: user.id, dueDate: { lte: new Date() } },
    }).catch(() => 0),
    todayChallenge: await db.dailyGoal.findUnique({
      where: { userId_date: { userId: user.id, date: (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })() } },
      select: { tasks: true },
    }).catch(() => null),
    userName: user.name,
    userEmail: user.email,
  });
}
