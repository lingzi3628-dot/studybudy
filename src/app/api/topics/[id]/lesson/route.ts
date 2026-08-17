import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/topics/[id]/lesson
 * Body: { level?: "beginner" | "intermediate" | "advanced", regenerate?: boolean }
 *
 * Generates a comprehensive AI lesson for the topic with:
 *   introduction, keyConcepts[], examples[], formulas[], summary
 *
 * Caches the lesson in topic_lessons table — subsequent calls return the cached
 * version unless `regenerate: true` is passed.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const level: string = ["beginner", "intermediate", "advanced"].includes(body.level)
    ? body.level
    : "beginner";
  const regenerate = body.regenerate === true;

  const topic = await db.topic.findUnique({ where: { id } });
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // Try cached lesson first
  if (!regenerate) {
    const cached = await db.topicLesson.findUnique({
      where: { topicId_level: { topicId: id, level } },
    });
    if (cached) {
      return NextResponse.json({ lesson: cached.content, level, cached: true });
    }
  }

  // Generate fresh lesson via AI
  const rl = checkRateLimit(user.id, user.plan);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily AI limit reached", limit: rl.limit, resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const isMath = /math|algebra|geometry|calculus|trigonometry|statistics/i.test(topic.subject) ||
    /equation|formula|graph|polynomial|derivative|integral|slope|theorem/i.test(topic.name);
  const isLanguage = /language|english|kiswahili|swahili|chinese|french|spanish|arabic/i.test(topic.subject) ||
    /greeting|vocabulary|grammar|translation|phrase/i.test(topic.name);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `You are an expert tutor writing a lesson on "${topic.name}" for a ${level} student. ` +
        `Subject: ${topic.subject}.` +
        (topic.description ? ` Description: ${topic.description}` : "") +
        "\n\nReturn ONLY valid JSON with these fields:\n" +
        JSON.stringify(
          {
            introduction: "2-4 sentences introducing the topic in simple terms",
            keyConcepts: [
              {
                title: "Concept name",
                explanation: "1-3 sentence explanation",
              },
            ],
            examples: [
              {
                title: "Example name",
                problem: "The problem to solve",
                steps: ["step 1", "step 2", "step 3"],
                answer: "final answer",
              },
            ],
            formulas: isMath ? ["\\(y = mx + b\\)"] : [],
            summary: "1-2 sentence wrap-up",
          },
          null,
          2
        ) +
        `\n\nIf this is not a math topic, return an empty formulas array. ` +
        `For language topics, examples should be vocabulary with translations.`,
    },
    {
      role: "user",
      content: `Write the lesson on ${topic.name}.`,
    },
  ];

  try {
    const json = await callAIJson<{
      introduction?: string;
      keyConcepts?: { title: string; explanation: string }[];
      examples?: { title: string; problem: string; steps: string[]; answer: string }[];
      formulas?: string[];
      summary?: string;
    }>(messages, apiKey);

    // Cache the lesson
    const saved = await db.topicLesson.upsert({
      where: { topicId_level: { topicId: id, level } },
      create: {
        topicId: id,
        level,
        content: json as any,
      },
      update: {
        content: json as any,
      },
    });

    return NextResponse.json({
      lesson: saved.content,
      level,
      cached: false,
      remaining: rl.remaining,
    });
  } catch (e: any) {
    refundRateLimit(user.id);
    return NextResponse.json(
      { error: "Lesson generation failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
