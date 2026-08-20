import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Default classroom settings if ClassroomSettings table is empty. */
const DEFAULT_SETTINGS = {
  durationMinutes: 30,
  testIntervalMin: 10,
  tokenCost: 50,
  passThreshold: 0.7,
  coinReward: 10,
  xpReward: 20,
  dailyLimit: 1,
};

type LessonBlock =
  | { type: "heading"; content: string }
  | { type: "text"; content: string }
  | { type: "equation"; content: string }
  | { type: "bullet"; content: string };

/** Fallback lesson used when AI generation fails. */
function defaultLesson(topicName: string, subject: string): LessonBlock[] {
  return [
    { type: "heading", content: `${topicName} — Overview` },
    { type: "text", content: `Welcome to today's class on ${topicName}. In this lesson we will explore the core ideas, work through some examples, and end with a short check-up.` },
    { type: "heading", content: "Key Concepts" },
    { type: "bullet", content: `Definition and importance of ${topicName} in ${subject}.` },
    { type: "bullet", content: "Core principles that underpin this topic." },
    { type: "bullet", content: "Common pitfalls and how to avoid them." },
    { type: "heading", content: "Worked Example" },
    { type: "text", content: "Let's walk through a simple example step by step to anchor the theory." },
    { type: "equation", content: "result = input × factor + offset" },
    { type: "heading", content: "Summary" },
    { type: "text", content: "Great job! Take the upcoming mini-test to see how much you remember." },
  ];
}

/** Generate whiteboard lesson blocks via AI (or fallback on failure). */
async function generateLessonBlocks(
  topicId: string,
  topicName: string,
  subject: string,
  description: string | null,
  userId: string
): Promise<LessonBlock[]> {
  const userRec = await db.user.findUnique({
    where: { id: userId },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are Professor Bloom teaching a class. Generate whiteboard content as a JSON array of blocks. " +
        "Each block has a 'type' (one of: 'heading', 'text', 'equation', 'bullet') and a 'content' string. " +
        "Return ONLY JSON — no prose, no code fences.",
    },
    {
      role: "user",
      content:
        `Topic: ${topicName}\nSubject: ${subject}\nDescription: ${description ?? "general overview"}\n\n` +
        `Generate 15-20 blocks covering the topic thoroughly. Include 1-2 equations if applicable. ` +
        `Return ONLY JSON like: ` +
        JSON.stringify(
          [
            { type: "heading", content: "Introduction" },
            { type: "text", content: "..." },
            { type: "equation", content: "E = mc^2" },
            { type: "bullet", content: "..." },
          ],
          null,
          2
        ),
    },
  ];

  try {
    const raw = await callAIJson<LessonBlock[]>(messages, apiKey, {
      userId,
      route: "/api/classroom/start",
    });
    if (Array.isArray(raw) && raw.length > 0) {
      // Sanitize: keep only valid block shapes
      const cleaned = raw
        .filter((b: any) => b && typeof b === "object" && typeof b.content === "string")
        .filter((b: any) => ["heading", "text", "equation", "bullet"].includes(b.type))
        .map((b: any) => ({ type: b.type, content: String(b.content).slice(0, 2000) })) as LessonBlock[];
      if (cleaned.length > 0) return cleaned.slice(0, 30);
    }
  } catch (e: any) {
    console.error("Lesson generation AI failed:", e?.message ?? e);
  }
  return defaultLesson(topicName, subject);
}

/**
 * POST /api/classroom/start
 * Body: { topicId, pathItemId? }
 *
 * Starts a virtual classroom session:
 *  - Loads classroom settings (or uses defaults)
 *  - Deducts classroom token cost (50 by default)
 *  - Creates ClassSession(status='in_progress')
 *  - Generates lesson whiteboard content via AI (or fetches from LessonContent cache)
 *  - Caches the lesson in LessonContent (upsert)
 *
 * Returns: { session, lessonBlocks, testIntervalMin, durationMinutes }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    topicId?: string;
    pathItemId?: string;
  };

  const topicId = (body.topicId ?? "").toString().trim();
  if (!topicId) {
    return NextResponse.json({ error: "topicId is required." }, { status: 400 });
  }

  // 1. Load classroom settings (DB first, fallback to defaults)
  let settings: any = null;
  try {
    settings = await db.classroomSettings.findFirst();
  } catch (e: any) {
    console.error("ClassroomSettings fetch failed:", e?.message);
  }
  const effectiveSettings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };

  // 2. Verify topic exists
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true, description: true },
  }).catch(() => null);

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // 3. Deduct tokens (classroom = 50 by default)
  const deduct = await checkAndDeductTokens(user.id, "classroom");
  if (!deduct.ok) {
    if (
      deduct.code === "DAILY_LIMIT" ||
      deduct.code === "INSUFFICIENT_TOKENS" ||
      deduct.code === "MODEL_LOCKED" ||
      deduct.code === "MODEL_RESTING"
    ) {
      return NextResponse.json(
        {
          error: deduct.error,
          code: deduct.code,
          tokenBalance: user.tokenBalance,
          needsUpgrade: true,
        },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't start the class right now. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  // 4. Create session
  const session = await db.classSession.create({
    data: {
      userId: user.id,
      topicId: topic.id,
      pathItemId: body.pathItemId ? String(body.pathItemId) : null,
      durationMinutes: effectiveSettings.durationMinutes,
      status: "in_progress",
      currentTestIndex: 0,
      progress: 0,
      tokensSpent: deduct.costTokens,
    },
  }).catch(async (e: any) => {
    await refundTokens(user.id, "classroom", deduct.costTokens);
    throw e;
  });

  // 5. Try cached lesson first; otherwise generate via AI
  let lessonBlocks: LessonBlock[] = [];
  const cached = await db.lessonContent.findFirst({
    where: { topicId: topic.id },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);

  if (cached && Array.isArray(cached.contentJson as any) && (cached.contentJson as any[]).length > 0) {
    lessonBlocks = (cached.contentJson as any[]).filter(
      (b: any) => b && typeof b.content === "string" && ["heading", "text", "equation", "bullet"].includes(b.type)
    ) as LessonBlock[];
  }

  if (lessonBlocks.length === 0) {
    lessonBlocks = await generateLessonBlocks(
      topic.id,
      topic.name,
      topic.subject,
      topic.description,
      user.id
    );

    // Cache the lesson (upsert by topic — keep only the latest)
    try {
      // Delete previous cached lessons for this topic, then insert
      await db.lessonContent.deleteMany({ where: { topicId: topic.id } }).catch(() => {});
      await db.lessonContent.create({
        data: { topicId: topic.id, contentJson: lessonBlocks as any },
      });
    } catch (e: any) {
      console.error("LessonContent cache write failed:", e?.message);
    }
  }

  return NextResponse.json({
    session,
    lessonBlocks,
    testIntervalMin: effectiveSettings.testIntervalMin,
    durationMinutes: effectiveSettings.durationMinutes,
    tokenBalance: deduct.newBalance,
    costTokens: deduct.costTokens,
  });
}
