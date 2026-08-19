import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";
import { awardXp, recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/learning-paths
 * Body: { skill, level, goal?, subject?, topic?, isTemplate? }
 *
 * Generates a 4-week structured learning path with modules and items
 * via AI. Saves learning_paths + path_modules + path_items.
 * First module is 'unlocked', rest are 'locked'.
 *
 * 402 = upgrade/limit/insufficient tokens
 * 500 = server error / AI failure
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    skill: string;
    level?: string;
    goal?: string;
    subject?: string;
    topic?: string;
    isTemplate?: boolean;
  };

  const skill = (body.skill ?? "").toString().trim();
  const level = (body.level ?? "beginner").toString().trim();
  const goal = (body.goal ?? "").toString().trim();
  const subject = (body.subject ?? "").toString().trim() || null;
  const topic = (body.topic ?? "").toString().trim() || null;

  if (!skill) {
    return NextResponse.json({ error: "Skill/topic is required" }, { status: 400 });
  }

  // Free users limited to 1 active path
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  if (!isPremium && !body.isTemplate) {
    const activeCount = await db.learningPath.count({
      where: { userId: user.id, status: "active" },
    }).catch(() => 0);
    if (activeCount >= 1) {
      return NextResponse.json(
        { error: "Free users can have 1 active learning path. Complete your current path or upgrade to Premium for unlimited paths.", needsUpgrade: true, code: "ACTIVE_PATH_LIMIT" },
        { status: 402 }
      );
    }
  }

  // Only admins can create templates — check below
  let isTemplate = false;
  if (body.isTemplate) {
    // Verify admin
    try {
      const adminCookie = (await import("@/lib/admin-session")).requireAdminJwt;
      await adminCookie();
      isTemplate = true;
    } catch {
      return NextResponse.json({ error: "Only admins can create template paths." }, { status: 403 });
    }
  }

  // Deduct tokens
  const deduct = await checkAndDeductTokens(user.id, "learning_path");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "We couldn't generate the path right now. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  // Build AI prompt
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert curriculum designer. Generate a structured 4-week learning path. " +
        "Each week is a module with 3-5 items (lesson, flashcards, quiz, concept_map, video, or project). " +
        "The final module ends with a 'study_room_start' item that signals 'Begin your learning journey'.\n\n" +
        "Return ONLY valid JSON in this exact format (no markdown fences):\n" +
        JSON.stringify({
          title: "Short path title",
          coverImageUrl: null,
          modules: [
            {
              title: "Week 1: ...",
              description: "Brief week summary",
              items: [
                { type: "lesson", title: "Item title", difficulty: "easy" },
                { type: "flashcards", title: "Item title", difficulty: "medium" },
                { type: "quiz", title: "Item title", difficulty: "medium" },
                { type: "concept_map", title: "Item title", difficulty: "hard" },
                { type: "video", title: "Item title", difficulty: "easy" },
                { type: "project", title: "Item title", difficulty: "hard" },
                { type: "study_room_start", title: "Begin your learning journey", difficulty: "easy" },
              ],
            },
          ],
        }, null, 2) +
        "\n\nRules:\n" +
        "- 4 modules total, one per week.\n" +
        "- 3-5 items per module.\n" +
        "- The LAST item of the LAST module should be type='study_room_start' (it signals completion).\n" +
        "- Use a mix of item types across modules — variety helps learning.\n" +
        "- Difficulty: 'easy' | 'medium' | 'hard'. Start easy, ramp up.\n" +
        "- Item titles: 1-5 words, specific to the skill.\n" +
        "- coverImageUrl: leave as null (will be generated later).",
    },
    {
      role: "user",
      content: `Skill: ${skill}\nLevel: ${level}\nGoal: ${goal || "general mastery"}\nSubject: ${subject || "General"}\nTopic: ${topic || "General"}`,
    },
  ];

  // Call AI with retry
  let graph: any = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callAIJson<any>(messages, apiKey, {
        userId: user.id,
        route: "/api/learning-paths",
      });
      if (!raw || !Array.isArray(raw.modules) || raw.modules.length === 0) {
        lastError = "AI returned invalid path structure";
        continue;
      }
      graph = raw;
      break;
    } catch (e: any) {
      lastError = e?.message ?? "AI call failed";
      console.error(`learning-path attempt ${attempt} failed:`, lastError);
      if (attempt === 1) {
        messages[0].content += "\n\nIMPORTANT: Output ONLY JSON. No prose, no markdown fences. Start with { and end with }.";
      }
    }
  }

  if (!graph) {
    await refundTokens(user.id, "learning_path", deduct.costTokens);
    return NextResponse.json(
      { error: "The AI couldn't generate a learning path right now. Please try again.", detail: lastError, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }

  // Resolve topicId if topic name provided
  let topicId: string | null = null;
  if (topic) {
    const existingTopic = await db.topic.findFirst({
      where: { name: { equals: topic, mode: "insensitive" } },
      select: { id: true },
    }).catch(() => null);
    if (existingTopic) topicId = existingTopic.id;
  }

  // Save path
  let savedPath: any;
  try {
    savedPath = await db.learningPath.create({
      data: {
        userId: isTemplate ? null : user.id,
        skill,
        level,
        goal: goal || null,
        subject,
        topicId,
        roadmap: graph as any,
        status: "active",
        isTemplate,
        isPublished: isTemplate,
        coverImageUrl: graph.coverImageUrl ?? null,
      },
    });

    // Save modules + items
    for (let mIdx = 0; mIdx < graph.modules.length; mIdx++) {
      const m: any = graph.modules[mIdx];
      const moduleRecord = await db.pathModule.create({
        data: {
          pathId: savedPath.id,
          title: String(m.title ?? `Module ${mIdx + 1}`),
          description: m.description ? String(m.description) : null,
          orderIndex: mIdx,
          status: mIdx === 0 ? "unlocked" : "locked", // first module unlocked
        },
      });

      const items: any[] = Array.isArray(m.items) ? m.items : [];
      for (let iIdx = 0; iIdx < items.length; iIdx++) {
        const it: any = items[iIdx];
        await db.pathItem.create({
          data: {
            moduleId: moduleRecord.id,
            type: String(it.type ?? "lesson"),
            title: String(it.title ?? `Item ${iIdx + 1}`),
            orderIndex: iIdx,
            difficulty: ["easy", "medium", "hard"].includes(it.difficulty) ? it.difficulty : "medium",
            isRequired: it.type !== "video", // videos are optional
            contentId: null,
          },
        });
      }
    }
  } catch (e: any) {
    console.error("save learning path failed:", e?.message);
    await refundTokens(user.id, "learning_path", deduct.costTokens);
    return NextResponse.json(
      { error: "Path was generated but couldn't be saved. Please try again.", detail: e?.message, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }

  // Award XP for starting a path
  await recordActivity(user.id, 20);

  // Return with modules + items pre-loaded
  const full = await db.learningPath.findUnique({
    where: { id: savedPath.id },
    include: {
      modules: {
        orderBy: { orderIndex: "asc" },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });

  return NextResponse.json({
    learningPath: full,
    tokenBalance: deduct.newBalance,
    costTokens: deduct.costTokens,
  });
}

/**
 * GET /api/learning-paths — list user's paths + public templates
 */
export async function GET() {
  const user = await getCurrentUser();

  const [userPaths, templates] = await Promise.all([
    db.learningPath.findMany({
      where: { userId: user.id, isTemplate: false },
      orderBy: { createdAt: "desc" },
      include: {
        modules: { select: { id: true, title: true, _count: { select: { items: true } } } },
        _count: { select: { modules: true } },
      },
    }).catch(() => []),
    db.learningPath.findMany({
      where: { isTemplate: true, isPublished: true },
      orderBy: { createdAt: "desc" },
      include: {
        modules: { select: { id: true, title: true, _count: { select: { items: true } } } },
        _count: { select: { modules: true } },
      },
    }).catch(() => []),
  ]);

  // Get progress for user's paths
  const userProgress: any[] = await db.userPathProgress.findMany({
    where: { userId: user.id },
    select: { pathItemId: true, status: true, score: true },
  }).catch(() => []);
  const progressMap = new Map(userProgress.map((p) => [p.pathItemId, p] as [string, any]));

  return NextResponse.json({
    paths: userPaths.map((p) => ({
      ...p,
      progress: {
        total: p.modules.reduce((sum: number, m: any) => sum + (m._count?.items ?? 0), 0),
        completed: 0, // computed below per-item
      },
    })),
    templates,
    progressMap: Object.fromEntries(progressMap),
    tokenBalance: user.tokenBalance,
  });
}
