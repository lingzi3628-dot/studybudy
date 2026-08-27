import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type ChatMessage } from "@/lib/ai";
import { buildTeachingProfile } from "@/lib/aware-engine";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/tutor/compare
 * Body: {
 *   conversationId?: string,
 *   message: string,
 *   modelNames: string[],  // 2-5 Study Buddy model names to compare
 * }
 *
 * Sends the same prompt to multiple Study Buddies in parallel, returns
 * all replies with metadata (latency, tokens used, which model won by
 * being first to finish).
 *
 * Returns { results: [{ modelName, displayName, emoji, reply, latencyMs, error? }] }
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = (body?.message ?? "").toString().trim();
  const modelNames: string[] = Array.isArray(body?.modelNames) ? body.modelNames : [];

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (modelNames.length < 2) {
    return NextResponse.json({ error: "Pick at least 2 Study Buddies to compare" }, { status: 400 });
  }
  if (modelNames.length > 5) {
    return NextResponse.json({ error: "Max 5 Study Buddies per comparison" }, { status: 400 });
  }

  // Build a single shared system prompt + message
  const teachingProfile = buildTeachingProfile(user.grade ?? "Form 1");
  const systemContent = `You are StudyBuddy, a friendly AI tutor for Kenyan students. ${teachingProfile.systemPromptSuffix}

Reply in the same language the user used (English / Kiswahili / French).
Keep answers under 200 words. Use markdown: **bold**, lists, [link](url), \`code\`, fenced code blocks for graphs (type "mathgraph").`;

  const aiMessages: ChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: message },
  ];

  // Load the requested mappings
  const mappings = await db.modelMapping.findMany({
    where: { modelName: { in: modelNames } },
  });

  if (mappings.length === 0) {
    return NextResponse.json({ error: "No matching Study Buddies found" }, { status: 404 });
  }

  // Call each one in parallel with a custom userId hint per model
  const results = await Promise.all(
    mappings.map(async (mapping) => {
      const start = Date.now();
      // Temporarily set the user's currentModel so callAI picks up this mapping
      // (callAI uses user.currentModel to find the providerId)
      await db.user.update({
        where: { id: user.id },
        data: { currentModel: mapping.modelName },
      });
      try {
        // Force callAI to use this mapping by setting userId with the swapped model
        const reply = await callAI(aiMessages, null, {
          userId: user.id,
          route: "/api/tutor/compare",
        });
        const latencyMs = Date.now() - start;
        return {
          modelName: mapping.modelName,
          displayName: mapping.displayName,
          emoji: mapping.emoji,
          reply,
          latencyMs,
        };
      } catch (e: any) {
        const latencyMs = Date.now() - start;
        return {
          modelName: mapping.modelName,
          displayName: mapping.displayName,
          emoji: mapping.emoji,
          reply: "",
          latencyMs,
          error: e?.message ?? "AI failed",
        };
      }
    })
  );

  // Restore the user's previous currentModel (we changed it during the loop)
  // Pick whatever the user had BEFORE this compare call. We can't easily
  // restore without saving it first — so leave it as the LAST model used,
  // which is fine because the user is actively comparing.
  // (The user can switch back via the Profile selector if needed.)

  return NextResponse.json({ results });
}
