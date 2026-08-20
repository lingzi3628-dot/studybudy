import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { awardXp, recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/onboarding/create-path
 * Body: { skill, level, goal }
 *
 * Phase 17 — Onboarding path generator.
 *
 * Generates a 4-week structured learning path with modules + items via AI
 * (same prompt as /api/learning-paths POST), saves learning_paths +
 * path_modules + path_items (first module unlocked, rest locked), sets
 * isActive=true, currentNodeId=first module id, inserts UserActivePath with
 * isCurrent=true (deactivating any others), and flags
 * user.onboardingPathCreated=true.
 *
 * NO token cost — this is free during onboarding.
 *
 * 500 = server error / AI failure
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    skill?: string;
    level?: string;
    goal?: string;
  };

  const skill = (body.skill ?? "").toString().trim();
  const level = (body.level ?? "beginner").toString().trim();
  const goal = (body.goal ?? "").toString().trim();

  if (!skill) {
    return NextResponse.json({ error: "Skill is required" }, { status: 400 });
  }

  // Resolve BYOK key (best-effort — onboarding path is free, no token charge)
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // Build AI prompt — same pattern as /api/learning-paths POST
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
      content: `Skill: ${skill}\nLevel: ${level}\nGoal: ${goal || "general mastery"}`,
    },
  ];

  // Call AI with retry
  let graph: any = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callAIJson<any>(messages, apiKey, {
        userId: user.id,
        route: "/api/onboarding/create-path",
      });
      if (!raw || !Array.isArray(raw.modules) || raw.modules.length === 0) {
        lastError = "AI returned invalid path structure";
        continue;
      }
      graph = raw;
      break;
    } catch (e: any) {
      lastError = e?.message ?? "AI call failed";
      console.error(`onboarding create-path attempt ${attempt} failed:`, lastError);
      if (attempt === 1) {
        messages[0].content += "\n\nIMPORTANT: Output ONLY JSON. No prose, no markdown fences. Start with { and end with }.";
      }
    }
  }

  if (!graph) {
    return NextResponse.json(
      { error: "The AI couldn't generate your learning path right now. Please try again.", detail: lastError },
      { status: 500 }
    );
  }

  // Save path + modules + items, then wire up UserActivePath in a transaction
  let savedPathId: string | null = null;
  let firstModuleId: string | null = null;
  const moduleSummaries: { title: string; itemCount: number }[] = [];

  try {
    const result = await db.$transaction(async (tx) => {
      // 1) Create LearningPath
      const created = await tx.learningPath.create({
        data: {
          userId: user.id,
          skill,
          level,
          goal: goal || null,
          subject: null,
          topicId: null,
          roadmap: graph as any,
          status: "active",
          isTemplate: false,
          isPublished: false,
          coverImageUrl: graph.coverImageUrl ?? null,
          // Phase 17 — path dashboard fields
          isActive: true,
          currentNodeId: null, // set below after first module is created
        },
      });
      savedPathId = created.id;

      // 2) Create modules + items
      const modules = Array.isArray(graph.modules) ? graph.modules : [];
      for (let mIdx = 0; mIdx < modules.length; mIdx++) {
        const m: any = modules[mIdx];
        const moduleRecord = await tx.pathModule.create({
          data: {
            pathId: created.id,
            title: String(m.title ?? `Module ${mIdx + 1}`),
            description: m.description ? String(m.description) : null,
            orderIndex: mIdx,
            status: mIdx === 0 ? "unlocked" : "locked", // first module unlocked
          },
        });
        if (mIdx === 0) firstModuleId = moduleRecord.id;

        const items: any[] = Array.isArray(m.items) ? m.items : [];
        moduleSummaries.push({
          title: moduleRecord.title,
          itemCount: items.length,
        });

        for (let iIdx = 0; iIdx < items.length; iIdx++) {
          const it: any = items[iIdx];
          await tx.pathItem.create({
            data: {
              moduleId: moduleRecord.id,
              type: String(it.type ?? "lesson"),
              title: String(it.title ?? `Item ${iIdx + 1}`),
              orderIndex: iIdx,
              difficulty: ["easy", "medium", "hard"].includes(it.difficulty) ? it.difficulty : "medium",
              isRequired: it.type !== "video",
              contentId: null,
            },
          });
        }
      }

      // 3) Set currentNodeId to first module
      if (firstModuleId) {
        await tx.learningPath.update({
          where: { id: created.id },
          data: { currentNodeId: firstModuleId },
        });
      }

      // 4) Deactivate other UserActivePath rows + insert new current
      await tx.userActivePath.updateMany({
        where: { userId: user.id, isCurrent: true },
        data: { isCurrent: false },
      });
      // upsert guards against the @@unique([userId, pathId]) constraint
      await tx.userActivePath.upsert({
        where: { userId_pathId: { userId: user.id, pathId: created.id } },
        create: { userId: user.id, pathId: created.id, isCurrent: true },
        update: { isCurrent: true },
      });

      // 5) Flag onboarding path created
      await tx.user.update({
        where: { id: user.id },
        data: { onboardingPathCreated: true },
      });

      return created;
    });

    // 6) Award XP + activity (best-effort, outside transaction)
    await recordActivity(user.id, 20).catch(() => {});
    void awardXp(user.id, 20).catch(() => {});

    return NextResponse.json({
      pathId: result.id,
      skill,
      modules: moduleSummaries,
    });
  } catch (e: any) {
    console.error("save onboarding path failed:", e?.message);
    return NextResponse.json(
      { error: "Path was generated but couldn't be saved. Please try again.", detail: e?.message },
      { status: 500 }
    );
  }
}
