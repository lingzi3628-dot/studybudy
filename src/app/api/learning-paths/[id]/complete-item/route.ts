import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardXp, recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * POST /api/learning-paths/[id]/complete-item
 * Body: { itemId, score?, timeSpentSec?, status }
 *
 * - Updates user_path_progress
 * - If status='completed', unlocks next item + awards XP + checks badges
 * - If status='failed' (e.g., quiz score below threshold), inserts an extra practice item
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id: pathId } = await params;
  const body = await req.json().catch(() => ({})) as {
    itemId?: string;
    score?: number;
    timeSpentSec?: number;
    status?: "completed" | "failed";
  };
  const itemId = (body.itemId ?? "").toString().trim();
  const status = body.status === "failed" ? "failed" : "completed";
  const score = typeof body.score === "number" ? body.score : null;
  const timeSpentSec = typeof body.timeSpentSec === "number" ? body.timeSpentSec : 0;

  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  // Fetch path + item + module context
  const path = await db.learningPath.findUnique({
    where: { id: pathId },
    select: {
      id: true, userId: true, skill: true, status: true,
      modules: {
        orderBy: { orderIndex: "asc" },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      },
    },
  }).catch(() => null);

  if (!path) {
    return NextResponse.json({ error: "Path not found." }, { status: 404 });
  }
  if (path.userId !== user.id) {
    return NextResponse.json({ error: "Not your path." }, { status: 403 });
  }

  // Flatten items into a single ordered array
  const flatItems: any[] = [];
  const moduleMap = new Map<string, any>();
  for (const m of path.modules) {
    for (const it of m.items) {
      flatItems.push({ ...it, moduleId: m.id });
      moduleMap.set(it.id, m);
    }
  }

  const idx = flatItems.findIndex((i) => i.id === itemId);
  if (idx < 0) {
    return NextResponse.json({ error: "Item not found in this path." }, { status: 404 });
  }
  const item = flatItems[idx];
  const itemModule = moduleMap.get(itemId)!;

  // Update progress
  await db.userPathProgress.upsert({
    where: { userId_pathItemId: { userId: user.id, pathItemId: itemId } },
    create: {
      userId: user.id, pathItemId: itemId, status, score, timeSpentSec,
      completedAt: status === "completed" ? new Date() : null, attempts: 1,
    },
    update: {
      status, score, timeSpentSec: { increment: timeSpentSec },
      completedAt: status === "completed" ? new Date() : null,
      attempts: { increment: 1 },
    },
  }).catch(() => null);

  let xpGained = 0;
  let leveledUp = false;
  let newBadges: any[] = [];
  let nextItem: any = null;
  let moduleCompleted = false;
  let pathCompleted = false;
  let extraPracticeItem: any = null;

  if (status === "completed") {
    // Award XP based on item type
    const xpMap: Record<string, number> = {
      lesson: 30, flashcards: 40, quiz: 50, concept_map: 60, video: 20, project: 80, study_room_start: 100,
    };
    xpGained = xpMap[item.type] ?? 30;

    // Bonus XP for high score
    if (score !== null && score >= 0.9) xpGained += 20;

    const xpResult = await awardXp(user.id, xpGained);
    leveledUp = xpResult.leveledUp;
    newBadges.push(...xpResult.newBadges);

    // Update streak
    await recordActivity(user.id, 0);

    // Unlock next item (or next module if this was last in module)
    if (idx + 1 < flatItems.length) {
      nextItem = flatItems[idx + 1];
      const nextModule = moduleMap.get(nextItem.id)!;
      // If next module was locked, unlock it
      if (nextModule.id !== itemModule.id && nextModule.status === "locked") {
        await db.pathModule.update({
          where: { id: nextModule.id },
          data: { status: "unlocked" },
        }).catch(() => {});
      }
    } else {
      // Was last item of path
      moduleCompleted = true;
      pathCompleted = true;
      await db.learningPath.update({
        where: { id: pathId },
        data: { status: "completed" },
      }).catch(() => {});
    }

    // Check if module is now complete (all required items completed)
    const moduleItems = itemModule.items ?? path.modules.find((m: any) => m.id === itemModule.id)?.items ?? [];
    const requiredItems = moduleItems.filter((i: any) => i.isRequired);
    if (requiredItems.length > 0) {
      const progress = await db.userPathProgress.findMany({
        where: {
          userId: user.id,
          pathItemId: { in: requiredItems.map((i: any) => i.id) },
          status: "completed",
        },
        select: { pathItemId: true },
      }).catch(() => []);
      if (progress.length === requiredItems.length) {
        moduleCompleted = true;
        await db.pathModule.update({
          where: { id: itemModule.id },
          data: { status: "completed" },
        }).catch(() => {});
        // Unlock next module
        const moduleIdx = path.modules.findIndex((m: any) => m.id === itemModule.id);
        if (moduleIdx + 1 < path.modules.length) {
          const nextMod = path.modules[moduleIdx + 1];
          await db.pathModule.update({
            where: { id: nextMod.id },
            data: { status: "unlocked" },
          }).catch(() => {});
        }
      }
    }
  } else if (status === "failed") {
    // Insert an extra practice item (flashcards or quiz) right after this one
    try {
      const practiceType = item.type === "quiz" ? "flashcards" : "quiz";
      // Shift all items after this one's orderIndex up by 1
      await db.pathItem.updateMany({
        where: { moduleId: itemModule.id, orderIndex: { gt: item.orderIndex } },
        data: { orderIndex: { increment: 1 } },
      });
      extraPracticeItem = await db.pathItem.create({
        data: {
          moduleId: itemModule.id,
          type: practiceType,
          title: `Retry practice: ${item.title}`,
          orderIndex: item.orderIndex + 1,
          difficulty: "easy",
          isRequired: false,
          contentId: null,
        },
      });
    } catch (e: any) {
      console.error("extra practice insert failed:", e?.message);
    }
  }

  return NextResponse.json({
    status,
    xpGained,
    leveledUp,
    newBadges,
    nextItem: nextItem ? { id: nextItem.id, title: nextItem.title, type: nextItem.type } : null,
    moduleCompleted,
    pathCompleted,
    extraPracticeItem: extraPracticeItem ? { id: extraPracticeItem.id, title: extraPracticeItem.title, type: extraPracticeItem.type } : null,
  });
}
