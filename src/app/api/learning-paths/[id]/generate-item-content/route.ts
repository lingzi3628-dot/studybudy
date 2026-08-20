import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/learning-paths/[id]/generate-item-content
 * Body: { itemId }
 *
 * Slow endpoint that does the actual AI content generation. Called by the
 * client after /start-item returns pending=true. Tokens were already
 * deducted in /start-item — this endpoint does NOT deduct again.
 *
 * Returns the generated content payload based on item type.
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

  if (!path) return NextResponse.json({ error: "Path not found." }, { status: 404 });
  if (path.userId !== user.id) return NextResponse.json({ error: "Not your path." }, { status: 403 });

  let item: any = null;
  for (const m of path.modules) {
    const found = m.items.find((i) => i.id === itemId);
    if (found) { item = found; break; }
  }
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (!item.contentId) {
    return NextResponse.json({ error: "Item has no content placeholder. Call /start-item first." }, { status: 400 });
  }

  // Check if already generated
  const alreadyGenerated = await isAlreadyGenerated(item);
  if (alreadyGenerated) {
    return NextResponse.json({
      item,
      content: { id: item.contentId, type: item.type, message: "Already generated" },
      alreadyGenerated: true,
    });
  }

  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const skill = path.skill;
  const itemTitle = item.title;

  try {
    if (item.type === "lesson") {
      const messages: ChatMessage[] = [
        { role: "system", content: "You are a tutor. Write a 600-900 word lesson on the given topic. Use markdown-style structure with headings, paragraphs, and one example. Return only the lesson text, no JSON." },
        { role: "user", content: `Skill: ${skill}\nLesson: ${itemTitle}\nLevel: ${path.level}` },
      ];
      const { callAI } = await import("@/lib/ai");
      const text = await callAI(messages, apiKey, { userId: user.id, route: "/api/learning-paths/generate-item-content" });
      await db.card.create({
        data: {
          setId: item.contentId,
          cardType: "flashcard",
          front: itemTitle,
          back: text,
        },
      }).catch(() => null);
      return NextResponse.json({
        item,
        content: { type: "lesson", payload: { content: text, studySetId: item.contentId } },
      });
    }

    if (item.type === "flashcards" || item.type === "quiz") {
      const isFlash = item.type === "flashcards";
      const count = isFlash ? 6 : 5;
      const messages: ChatMessage[] = [
        {
          role: "system",
          content:
            `You are an exam-prep tutor. Generate ${count} ${isFlash ? "flashcards (front=question, back=answer)" : "multiple-choice questions (4 options each, with correct_index and explanation)"} on the given topic. Return ONLY JSON: ` +
            (isFlash ? '{"flashcards":[{"front":"","back":""}]}' : '{"mcqs":[{"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}'),
        },
        { role: "user", content: `Skill: ${skill}\nTopic: ${itemTitle}\nLevel: ${path.level}` },
      ];
      const raw = await callAIJson<any>(messages, apiKey, { userId: user.id, route: "/api/learning-paths/generate-item-content" });

      const cardsToCreate = isFlash
        ? (raw.flashcards ?? []).slice(0, 10).map((c: any) => ({
            setId: item.contentId,
            cardType: "flashcard" as const,
            front: String(c.front ?? ""),
            back: String(c.back ?? ""),
          }))
        : (raw.mcqs ?? []).slice(0, 10).map((c: any) => ({
            setId: item.contentId,
            cardType: "mcq" as const,
            question: String(c.question ?? ""),
            options: c.options ?? [],
            correctIndex: Number(c.correct_index ?? 0),
            explanation: String(c.explanation ?? ""),
          }));

      if (cardsToCreate.length > 0) {
        await db.card.createMany({ data: cardsToCreate }).catch(() => null);
      }
      return NextResponse.json({
        item,
        content: {
          type: item.type,
          payload: { studySetId: item.contentId, cardCount: cardsToCreate.length },
        },
      });
    }

    if (item.type === "concept_map") {
      return NextResponse.json({
        item,
        content: {
          type: "concept_map",
          payload: {
            conceptMapId: item.contentId,
            needsGeneration: true,
            message: "Open the concept map to generate it",
          },
        },
      });
    }

    return NextResponse.json({ error: `Cannot generate content for type: ${item.type}` }, { status: 400 });
  } catch (e: any) {
    console.error("generate-item-content failed:", e?.message);
    return NextResponse.json(
      { error: "Content generation failed. Please try again.", detail: e?.message },
      { status: 500 }
    );
  }
}

async function isAlreadyGenerated(item: any): Promise<boolean> {
  try {
    if (item.type === "concept_map") {
      const cm = await db.conceptMap.findUnique({
        where: { id: item.contentId },
        select: { nodes: true },
      });
      const nodes = cm?.nodes as any[];
      return Array.isArray(nodes) && nodes.length > 0;
    }
    const count = await db.card.count({ where: { setId: item.contentId } });
    return count > 0;
  } catch {
    return false;
  }
}
