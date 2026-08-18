import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/generate/learning-path
 * Body: { skill, level, goal? }
 *
 * Calls AI to generate a 4-week roadmap, saves to learning_paths table
 * with corresponding lessons rows, and returns the path.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const skill = (body.skill ?? "").toString().trim();
  const level = (body.level ?? "beginner").toString().trim();
  const goal = (body.goal ?? "").toString().trim();

  if (!skill) {
    return NextResponse.json({ error: "Missing skill" }, { status: 400 });
  }

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
  const apiKey = userRec?.encryptedApiKey
    ? decryptApiKey(userRec.encryptedApiKey)
    : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `You are a learning coach. Create a 4-week learning path for someone who wants to learn ${skill} at ${level} level.${goal ? ` Goal: ${goal}.` : ""}\n` +
        "Return ONLY JSON:\n" +
        JSON.stringify(
          {
            weeks: [
              {
                week: 1,
                title: "Week 1: ...",
                objectives: ["...", "..."],
                resources: ["...", "..."],
                assessment: "...",
              },
            ],
          },
          null,
          2
        ),
    },
    { role: "user", content: `Skill: ${skill}\nLevel: ${level}\nGoal: ${goal || "general mastery"}` },
  ];

  try {
    const json = await callAIJson<{
      weeks?: {
        week: number;
        title: string;
        objectives: string[];
        resources: string[];
        assessment: string;
      }[];
    }>(messages, apiKey, { userId: user.id, route: "/api/generate/learning-path" });

    const weeks = json.weeks ?? [];

    // persist path
    const path = await db.learningPath.create({
      data: {
        userId: user.id,
        skill,
        level,
        goal: goal || null,
        roadmap: json as any,
      },
    });

    // seed lessons — one per week
    if (weeks.length) {
      await db.lesson.createMany({
        data: weeks.map((w, i) => ({
          pathId: path.id,
          title: w.title ?? `Week ${w.week}`,
          content: JSON.stringify(
            {
              objectives: w.objectives ?? [],
              resources: w.resources ?? [],
              assessment: w.assessment ?? "",
            },
            null,
            2
          ),
          orderIndex: i,
          completed: false,
        })),
      });
    }

    const withLessons = await db.learningPath.findUnique({
      where: { id: path.id },
      include: { lessons: { orderBy: { orderIndex: "asc" } } },
    });

    return NextResponse.json({ learningPath: withLessons, remaining: rl.remaining });
  } catch (e: any) {
    refundRateLimit(user.id);
    return NextResponse.json(
      { error: "AI generation failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
