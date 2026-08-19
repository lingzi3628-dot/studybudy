import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/learning-paths/[id]/start-item
 * Body: { itemId }
 *
 * If the item already has contentId, return the existing content.
 * Otherwise, generate content based on item.type:
 *   - 'lesson'        → call /api/generate/concept-map-style lesson content (path_lesson feature, 200 tokens)
 *   - 'flashcards'    → generate flashcards (path_flashcards, 150 tokens)
 *   - 'quiz'          → generate quiz (path_quiz, 150 tokens)
 *   - 'concept_map'   → reuse concept map generation (concept_map, 300 tokens)
 *   - 'video'         → search YouTube (free, just link)
 *   - 'project'      → just description, no AI needed (free)
 *   - 'study_room_start' → create StudyRoomState, free
 *
 * Marks item as 'in_progress' in UserPathProgress.
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

  // Fetch path + item + module context
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

  // If item already has content, return it
  if (item.contentId) {
    await upsertProgress(user.id, itemId, "in_progress");
    return NextResponse.json({
      item,
      content: { id: item.contentId, type: item.type, message: "Existing content" },
      alreadyGenerated: true,
    });
  }

  // Fetch BYOK key
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // Determine token cost from item type
  const featureMap: Record<string, string> = {
    lesson: "path_lesson",
    flashcards: "path_flashcards",
    quiz: "path_quiz",
    concept_map: "concept_map",
  };
  const feature = featureMap[item.type];
  const isFree = !feature; // video, project, study_room_start are free

  // Deduct tokens (if not free)
  let deduct: any = null;
  if (!isFree) {
    deduct = await checkAndDeductTokens(user.id, feature);
    if (!deduct.ok) {
      if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
        return NextResponse.json(
          { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: "We couldn't generate the content right now. Please try again.", code: deduct.code, detail: deduct.error },
        { status: 500 }
      );
    }
  }

  // Generate content based on type
  const skill = path.skill;
  const itemTitle = item.title;
  let generated: { contentId?: string; type: string; payload?: any; error?: string } = { type: item.type };

  try {
    if (item.type === "lesson") {
      // Generate a short lesson (markdown-ish content)
      const messages: ChatMessage[] = [
        { role: "system", content: "You are a tutor. Write a 600-900 word lesson on the given topic. Use markdown-style structure with headings, paragraphs, and one example. Return only the lesson text, no JSON." },
        { role: "user", content: `Skill: ${skill}\nLesson: ${itemTitle}\nLevel: ${path.level}` },
      ];
      const { callAI } = await import("@/lib/ai");
      const text = await callAI(messages, apiKey, { userId: user.id, route: "/api/learning-paths/start-item" });
      generated = { type: "lesson", payload: { content: text } };
    } else if (item.type === "flashcards" || item.type === "quiz") {
      // Generate flashcards or quiz items via AI
      const isFlash = item.type === "flashcards";
      const count = isFlash ? 6 : 5;
      const messages: ChatMessage[] = [
        { role: "system", content: `You are an exam-prep tutor. Generate ${count} ${isFlash ? "flashcards (front=question, back=answer)" : "multiple-choice questions (4 options each, with correct_index and explanation)"} on the given topic. Return ONLY JSON: ${isFlash ? '{"flashcards":[{"front":"","back":""}]}' : '{"mcqs":[{"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}'}` },
        { role: "user", content: `Skill: ${skill}\nTopic: ${itemTitle}\nLevel: ${path.level}` },
      ];
      const raw = await callAIJson<any>(messages, apiKey, { userId: user.id, route: "/api/learning-paths/start-item" });
      // Create a study set with these cards
      const studySet = await db.studySet.create({
        data: {
          userId: user.id,
          title: `${skill} - ${itemTitle}`,
          sourceType: "text",
          subject: path.subject ?? "General",
          topic: itemTitle,
          topicId: path.topicId,
          cards: {
            create: isFlash
              ? (raw.flashcards ?? []).slice(0, 10).map((c: any) => ({
                  cardType: "flashcard",
                  front: String(c.front ?? ""),
                  back: String(c.back ?? ""),
                }))
              : (raw.mcqs ?? []).slice(0, 10).map((c: any) => ({
                  cardType: "mcq",
                  question: String(c.question ?? ""),
                  options: c.options ?? [],
                  correctIndex: Number(c.correct_index ?? 0),
                  explanation: String(c.explanation ?? ""),
                })),
          },
        },
      });
      generated = { contentId: studySet.id, type: item.type, payload: { studySetId: studySet.id } };
    } else if (item.type === "concept_map") {
      // Call concept-map generation
      const cm = await db.conceptMap.create({
        data: {
          userId: user.id,
          topicId: path.topicId,
          title: `${itemTitle} (Concept Map)`,
          nodes: [],
          edges: [],
          sourceType: "topic",
          sourceText: `Skill: ${skill}\nTopic: ${itemTitle}\nLevel: ${path.level}`,
          isPublic: false,
        },
      });
      generated = { contentId: cm.id, type: "concept_map", payload: { conceptMapId: cm.id, needsGeneration: true } };
    } else if (item.type === "video") {
      // Fetch YouTube search results for this topic
      let videos: any[] = [];
      try {
        const settings: any = await db.searchSettings.findUnique({ where: { id: 1 } });
        if (settings?.youtubeApiKeyEncrypted) {
          const ytKey = decryptApiKey(settings.youtubeApiKeyEncrypted);
          if (ytKey) {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(`${skill} ${itemTitle}`)}&maxResults=3&key=${ytKey}`;
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              videos = (data.items ?? []).map((item: any) => ({
                videoId: item.id?.videoId,
                title: item.snippet?.title ?? "Untitled",
                thumbnail: `https://i.ytimg.com/vi/${item.id?.videoId}/hqdefault.jpg`,
                channel: item.snippet?.channelTitle ?? "Unknown",
              })).filter((v: any) => v.videoId);
            }
          }
        }
      } catch {}
      generated = { type: "video", payload: { videos } };
    } else if (item.type === "project") {
      generated = { type: "project", payload: { prompt: `Apply what you've learned about ${itemTitle} to a real-world scenario. Write 300-500 words.` } };
    } else if (item.type === "study_room_start") {
      // Create or update study_room_state for this topic
      const topicId = path.topicId;
      if (!topicId) {
        // Create an ad-hoc topic for this skill
        const newTopic = await db.topic.create({
          data: { subject: path.subject ?? "General", name: skill, published: false },
        }).catch(() => null);
        if (newTopic) {
          await db.learningPath.update({ where: { id: pathId }, data: { topicId: newTopic.id } });
          await upsertStudyRoomState(user.id, newTopic.id, pathId);
          generated = { type: "study_room_start", payload: { topicId: newTopic.id, studyRoomUrl: `/study-room/${newTopic.id}` } };
        } else {
          generated = { type: "study_room_start", payload: { error: "Could not create study room topic" } };
        }
      } else {
        await upsertStudyRoomState(user.id, topicId, pathId);
        generated = { type: "study_room_start", payload: { topicId, studyRoomUrl: `/study-room/${topicId}` } };
      }
    }
  } catch (e: any) {
    console.error("content generation failed:", e?.message);
    if (deduct) await refundTokens(user.id, feature, deduct.costTokens);
    return NextResponse.json(
      { error: "Content generation failed. Please try again.", detail: e?.message, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }

  // Save contentId if generated
  if (generated.contentId) {
    await db.pathItem.update({
      where: { id: itemId },
      data: { contentId: generated.contentId },
    }).catch(() => {});
  }

  // Mark item as in_progress
  await upsertProgress(user.id, itemId, "in_progress");

  return NextResponse.json({
    item: { ...item, contentId: generated.contentId ?? item.contentId },
    content: generated,
    tokenBalance: deduct?.newBalance ?? user.tokenBalance,
    costTokens: deduct?.costTokens ?? 0,
  });
}

async function upsertProgress(userId: string, itemId: string, status: string) {
  try {
    await db.userPathProgress.upsert({
      where: { userId_pathItemId: { userId, pathItemId: itemId } },
      create: { userId, pathItemId: itemId, status, attempts: 1 },
      update: { status, attempts: { increment: 1 } },
    });
  } catch (e: any) {
    console.error("upsertProgress failed:", e?.message);
  }
}

async function upsertStudyRoomState(userId: string, topicId: string, pathId: string) {
  try {
    await db.studyRoomState.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: { userId, topicId, pathId, lastVisited: new Date() },
      update: { pathId, lastVisited: new Date() },
    });
  } catch (e: any) {
    console.error("upsertStudyRoomState failed:", e?.message);
  }
}
