import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/paths
 *
 * Phase 17 — List all of the user's learning paths via UserActivePath.
 *
 * Returns one entry per UserActivePath row, joined with the underlying
 * LearningPath. Includes a progress summary (completed items / total items)
 * computed from UserPathProgress + PathItem counts, and the module count
 * for each path.
 *
 * Response shape:
 *   { paths: [{ id, skill, level, isCurrent, progress: {total, completed, percent}, modules: count }] }
 */
export async function GET() {
  const user = await getCurrentUser();

  // 1) All UserActivePath rows for the user, newest first
  const activePaths = await db.userActivePath.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      pathId: true,
      isCurrent: true,
      createdAt: true,
      path: {
        select: {
          id: true,
          skill: true,
          level: true,
          goal: true,
          subject: true,
          status: true,
          isActive: true,
          currentNodeId: true,
          createdAt: true,
          modules: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              _count: { select: { items: true } },
            },
          },
        },
      },
    },
  }).catch(() => []);

  if (activePaths.length === 0) {
    return NextResponse.json({ paths: [] });
  }

  // 2) The UserActivePath include above gives us module counts only
  //    (_count.items). To compute per-path progress we need every item
  //    id, so we fetch them all in a single query (one round-trip for
  //    every path at once, no N+1).
  const pathIds = activePaths.map((ap) => ap.pathId);
  const allModules = await db.pathModule.findMany({
    where: { pathId: { in: pathIds } },
    select: {
      id: true,
      pathId: true,
      items: { select: { id: true } },
    },
  }).catch(() => []);

  const moduleByPath = new Map<string, { moduleIds: string[]; itemIds: string[] }>();
  const allItemIdsFlat: string[] = [];
  for (const ap of activePaths) {
    moduleByPath.set(ap.pathId, { moduleIds: [], itemIds: [] });
  }
  for (const m of allModules) {
    const entry = moduleByPath.get(m.pathId);
    if (!entry) continue;
    entry.moduleIds.push(m.id);
    for (const it of m.items) {
      entry.itemIds.push(it.id);
      allItemIdsFlat.push(it.id);
    }
  }

  // 3) Single query for all completed UserPathProgress rows for these items
  const progressRows = allItemIdsFlat.length
    ? await db.userPathProgress.findMany({
        where: {
          userId: user.id,
          pathItemId: { in: allItemIdsFlat },
          status: "completed",
        },
        select: { pathItemId: true },
      }).catch(() => [])
    : [];
  const completedItemIds = new Set(progressRows.map((p) => p.pathItemId));

  // 4) Build the response
  const paths = activePaths.map((ap) => {
    const itemIds = moduleByPath.get(ap.pathId)?.itemIds ?? [];
    const total = itemIds.length;
    const completed = itemIds.filter((id) => completedItemIds.has(id)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      id: ap.path.id,
      pathId: ap.pathId,
      skill: ap.path.skill,
      level: ap.path.level,
      goal: ap.path.goal,
      subject: ap.path.subject,
      status: ap.path.status,
      isCurrent: ap.isCurrent,
      modules: ap.path.modules.length,
      progress: { total, completed, percent },
      createdAt: ap.path.createdAt,
    };
  });

  return NextResponse.json({ paths });
}
