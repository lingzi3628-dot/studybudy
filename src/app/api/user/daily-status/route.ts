import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  FREE_DAILY_LIMITS,
  FREE_DAILY_TOKEN_ALLOWANCE,
  DAILY_COIN_FLOOR,
} from "@/lib/monetization";

export const runtime = "nodejs";

/**
 * GET /api/user/daily-status
 *
 * Phase 21 — friendly summary of the user's daily economy.
 *
 * Returns:
 *   {
 *     tokens: number,
 *     tokensRefillAt: string | null,   // ISO date when next refill happens
 *     dailyAllowance: number,           // 500 for free, null for premium
 *     coins: number,
 *     coinFloor: number,                // 50 — coins never go below this on reset
 *     isPremium: boolean,
 *     features: Array<{
 *       feature: string,
 *       label: string,
 *       usedToday: number,
 *       limit: number | null,           // null = unlimited (premium)
 *       remaining: number | null,
 *     }>
 *   }
 *
 * Used by the UI to show users exactly where they stand today, so they
 * never feel "stuck" without knowing when they can use a feature again.
 */
const FEATURE_LABELS: Record<string, string> = {
  search: "Search",
  cards: "Flashcards",
  quiz: "Quiz",
  tutor: "AI Tutor",
  graph: "Graph",
  translate: "Translate",
  learning_path: "Learning Path",
  image_search: "Image Search",
  video_search: "Video Search",
  concept_map: "Concept Map",
  ai_teacher: "AI Teacher",
  path_lesson: "Path Lesson",
  path_flashcards: "Path Flashcards",
  path_quiz: "Path Quiz",
  whiteboard_solver: "Whiteboard Solver",
  cover_image: "Cover Image",
  voice_transcribe: "Voice Transcribe",
  tts: "Text to Speech",
  classroom: "Classroom",
};

export async function GET() {
  const user = await getCurrentUser();

  const isPremium = Boolean(
    user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry)
  );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const allFeatures = Object.keys(FREE_DAILY_LIMITS);
  const usageRows: Array<{ feature: string; count: number }> = await db.dailyUsage.findMany({
    where: { userId: user.id, feature: { in: allFeatures }, usageDate: todayStart },
    select: { feature: true, count: true },
  }).catch(() => [] as Array<{ feature: string; count: number }>);
  const usageMap = new Map(usageRows.map((u) => [u.feature, u.count]));

  const features = allFeatures.map((f) => {
    const used = usageMap.get(f) ?? 0;
    const limit = FREE_DAILY_LIMITS[f] ?? 999;
    return {
      feature: f,
      label: FEATURE_LABELS[f] ?? f,
      usedToday: used,
      limit: isPremium ? null : limit,
      remaining: isPremium ? null : Math.max(0, limit - used),
    };
  });

  return NextResponse.json({
    tokens: user.tokenBalance ?? 0,
    tokensRefillAt: user.tokenResetDate ?? null,
    dailyAllowance: isPremium ? null : FREE_DAILY_TOKEN_ALLOWANCE,
    coins: user.coinBalance ?? 0,
    coinFloor: DAILY_COIN_FLOOR,
    isPremium,
    features,
  });
}
