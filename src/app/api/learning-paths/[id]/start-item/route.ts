import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";
// Note: this route is FAST (under 2s). The actual AI content generation
// happens in /api/learning-paths/[id]/generate-item-content which can
// take up to 60s.

/**
 * POST /api/learning-paths/[id]/start-item
 * Body: { itemId }
 *
 * Fast claim endpoint:
 * 1. Validates the item exists + is unlocked
 * 2. If already has contentId → return existing content (instant)
 * 3. If item type is `study_room_start` → create/update topic + room state (fast)
 * 4. If item type is `project` → return prompt (instant)
 * 5. If item type is `video` → fetch YouTube results (fast, no tokens)
 * 6. For lesson/flashcards/quiz/concept_map → deduct tokens, create empty
 *    placeholder, mark in_progress, return contentId + pending:true
 *
 * The client then calls /generate-item-content with the itemId to do
 * the slow AI work separately (with proper loading UI).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id: pathId } = await params;
  const body = await req.json().catch(() => ({})) as { itemId?: string };
  const itemId = (body.itemId ?? "").toString().trim();

  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  // Fetch path + item + module context (single DB call)
  const path = await db.learningPath.findUnique({
    where: { id: pathId },
    select: {
      id: true, userId: true, skill: true, level: true, goal: true,
      subject: true, topicId: true,
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

  // Find the item + its module
  let item: any = null;
  let itemModule: any = null;
  for (const m of path.modules) {
    const found = m.items.find((i) => i.id === itemId);
    if (found) { item = found; itemModule = m; break; }
  }
  if (!item) {
    return NextResponse.json({ error: "Item not found in this path." }, { status: 404 });
  }
  if (itemModule.status === "locked") {
    return NextResponse.json({ error: "This item is locked. Complete the previous items first." }, { status: 403 });
  }

  // Mark in_progress (best-effort)
  await upsertProgress(user.id, itemId, "in_progress").catch(() => {});

  // ===== FAST PATHS (no AI, no tokens) =====
  // 1. Already has content
  if (item.contentId) {
    return NextResponse.json({
      item,
      content: { id: item.contentId, type: item.type, message: "Existing content" },
      alreadyGenerated: true,
      pending: false,
    });
  }

  // 2. study_room_start — create/update topic + room state (fast)
  if (item.type === "study_room_start") {
    const topicId = path.topicId ?? await ensureTopicForPath(path, pathId);
    if (topicId) {
      await db.studyRoomState.upsert({
        where: { userId_topicId: { userId: user.id, topicId } },
        create: { userId: user.id, topicId, pathId, lastVisited: new Date() },
        update: { pathId, lastVisited: new Date() },
      }).catch(() => null);
      return NextResponse.json({
        item,
        content: {
          type: "study_room_start",
          payload: { topicId, studyRoomUrl: `/study-room/${topicId}` },
        },
        pending: false,
      });
    }
  }

  // 3. project — just return the prompt (instant)
  if (item.type === "project") {
    return NextResponse.json({
      item,
      content: {
        type: "project",
        payload: { prompt: `Apply what you've learned about ${item.title} to a real-world scenario. Write 300-500 words.` },
      },
      pending: false,
    });
  }

  // 4. video — fetch YouTube search results (fast, no tokens)
  if (item.type === "video") {
    const videos = await fetchYouTubeResults(path.skill, item.title);
    return NextResponse.json({
      item,
      content: { type: "video", payload: { videos } },
      pending: false,
    });
  }

  // ===== SLOW PATHS (need tokens + AI) — claim fast, generate separately =====
  // Determine token cost
  const featureMap: Record<string, string> = {
    lesson: "path_lesson",
    flashcards: "path_flashcards",
    quiz: "path_quiz",
    concept_map: "concept_map",
  };
  const feature = featureMap[item.type];
  if (!feature) {
    return NextResponse.json({ error: `Unknown item type: ${item.type}` }, { status: 400 });
  }

  // Deduct tokens
  const deduct = await checkAndDeductTokens(user.id, feature);
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "We couldn't start the item right now. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  // Create empty placeholder content so we have a contentId to return
  let contentId: string | null = null;
  try {
    if (item.type === "concept_map") {
      const cm = await db.conceptMap.create({
        data: {
          userId: user.id,
          topicId: path.topicId,
          title: `${item.title} (Concept Map)`,
          nodes: [],
          edges: [],
          sourceType: "topic",
          sourceText: `Skill: ${path.skill}\nTopic: ${item.title}\nLevel: ${path.level}`,
          isPublic: false,
        },
      });
      contentId = cm.id;
    } else {
      // lesson, flashcards, quiz → create empty StudySet placeholder
      const studySet = await db.studySet.create({
        data: {
          userId: user.id,
          title: `${path.skill} - ${item.title}`,
          sourceType: "text",
          subject: path.subject ?? "General",
          topic: item.title,
          topicId: path.topicId,
          // No cards yet — they'll be generated by /generate-item-content
        },
      });
      contentId = studySet.id;
    }

    // Save contentId on the path item
    await db.pathItem.update({
      where: { id: itemId },
      data: { contentId },
    }).catch(() => {});
  } catch (e: any) {
    console.error("placeholder creation failed:", e?.message);
    await refundTokens(user.id, feature, deduct.costTokens);
    return NextResponse.json(
      { error: "Couldn't prepare the item. Please try again.", detail: e?.message, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }

  // Return FAST with pending=true — client must call /generate-item-content
  return NextResponse.json({
    item: { ...item, contentId },
    content: { id: contentId, type: item.type, message: "Content pending generation" },
    pending: true,
    generateUrl: `/api/learning-paths/${pathId}/generate-item-content`,
    tokenBalance: deduct.newBalance,
    costTokens: deduct.costTokens,
  });
}

async function upsertProgress(userId: string, itemId: string, status: string) {
  await db.userPathProgress.upsert({
    where: { userId_pathItemId: { userId, pathItemId: itemId } },
    create: { userId, pathItemId: itemId, status, attempts: 1 },
    update: { status, attempts: { increment: 1 } },
  });
}

async function ensureTopicForPath(path: any, pathId: string): Promise<string | null> {
  if (path.topicId) return path.topicId;
  try {
    const newTopic = await db.topic.create({
      data: { subject: path.subject ?? "General", name: path.skill, published: false },
    });
    await db.learningPath.update({ where: { id: pathId }, data: { topicId: newTopic.id } });
    return newTopic.id;
  } catch {
    return null;
  }
}

async function fetchYouTubeResults(skill: string, itemTitle: string): Promise<any[]> {
  try {
    const settings: any = await db.searchSettings.findUnique({ where: { id: 1 } });
    if (!settings?.youtubeApiKeyEncrypted) return [];
    const { decryptApiKey } = await import("@/lib/crypto");
    const ytKey = decryptApiKey(settings.youtubeApiKeyEncrypted);
    if (!ytKey) return [];
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(`${skill} ${itemTitle}`)}&maxResults=3&key=${ytKey}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; StudyBuddyBot/1.0)" } });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: any) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title ?? "Untitled",
      thumbnail: `https://i.ytimg.com/vi/${item.id?.videoId}/hqdefault.jpg`,
      channel: item.snippet?.channelTitle ?? "Unknown",
    })).filter((v: any) => v.videoId);
  } catch {
    return [];
  }
}
