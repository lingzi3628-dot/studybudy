import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/daily-goals
 * Returns today's goals; if none, generates via AI based on path progress
 * + due cards. Free feature.
 */
export async function GET() {
  const user = await getCurrentUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let goals = await db.dailyGoal.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  }).catch(() => null);

  if (!goals) {
    // Generate default goals
    const dueCount = await db.cardReview.count({
      where: { userId: user.id, dueDate: { lte: new Date() } },
    }).catch(() => 0);

    const inProgressPaths = await db.learningPath.count({
      where: { userId: user.id, status: "active" },
    }).catch(() => 0);

    const tasks: any[] = [
      { id: "1", text: "Complete today's daily review", completed: false, xp: 30 },
      { id: "2", text: dueCount > 0 ? `Review ${dueCount} due flashcard${dueCount > 1 ? "s" : ""}` : "Practice 5 flashcards", completed: false, xp: 20 },
      { id: "3", text: "Spend 25 minutes in a focus session", completed: false, xp: 10 },
    ];

    if (inProgressPaths > 0) {
      tasks.push({ id: "4", text: "Continue your learning path", completed: false, xp: 25 });
    }

    // Optionally enhance with AI (best-effort, fall back to defaults)
    try {
      const userRec = await db.user.findUnique({
        where: { id: user.id },
        select: { encryptedApiKey: true },
      }).catch(() => null);
      const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: "You are an AI study coach. Suggest 4 short daily goals as JSON. Each goal should be actionable, specific, and achievable in 10-30 min. Return ONLY JSON: {\"tasks\":[{\"text\":\"...\",\"xp\":10}]}. Max 30 words per task.",
        },
        {
          role: "user",
          content: `User has ${dueCount} due cards and ${inProgressPaths} active paths. Generate 4 personalized goals.`,
        },
      ];
      const raw = await callAIJson<any>(messages, apiKey, { userId: user.id, route: "/api/daily-goals" });
      if (raw?.tasks && Array.isArray(raw.tasks)) {
        tasks.length = 0;
        raw.tasks.slice(0, 5).forEach((t: any, i: number) => {
          tasks.push({ id: String(i + 1), text: String(t.text ?? "Goal"), xp: Number(t.xp ?? 10), completed: false });
        });
      }
    } catch (e: any) {
      console.error("daily goals AI gen failed:", e?.message);
    }

    goals = await db.dailyGoal.create({
      data: { userId: user.id, date: today, tasks: tasks as any },
    }).catch(() => null) ?? goals;
  }

  return NextResponse.json({ goals: goals ? { ...goals, tasks: goals.tasks as any[] } : null });
}

/**
 * POST /api/daily-goals
 * Body: { tasks } — replace today's tasks (e.g., mark as completed)
 *
 * Awards XP for newly-completed tasks.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    tasks: { id: string; text: string; completed: boolean; xp: number }[];
  };

  if (!Array.isArray(body.tasks)) {
    return NextResponse.json({ error: "tasks array required" }, { status: 400 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch existing to compare which tasks were just completed
  const existing = await db.dailyGoal.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  }).catch(() => null);

  const oldTasks = (existing?.tasks as any[]) ?? [];
  const oldCompletedIds = new Set(
    oldTasks.filter((t) => t.completed).map((t) => t.id)
  );

  // Calculate XP for newly completed tasks
  const newlyCompletedXp = body.tasks
    .filter((t) => t.completed && !oldCompletedIds.has(t.id))
    .reduce((sum, t) => sum + (t.xp ?? 0), 0);

  const updated = await db.dailyGoal.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    create: { userId: user.id, date: today, tasks: body.tasks as any },
    update: { tasks: body.tasks as any },
  });

  // Award XP for newly completed tasks
  let xpResult = { leveledUp: false, newBadges: [] as any[] };
  if (newlyCompletedXp > 0) {
    const { awardXp } = await import("@/lib/gamify");
    xpResult = await awardXp(user.id, newlyCompletedXp);
  }

  return NextResponse.json({
    goals: { ...updated, tasks: updated.tasks as any[] },
    newlyCompletedXp,
    leveledUp: xpResult.leveledUp,
    newBadges: xpResult.newBadges,
  });
}
