import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/tutor/track
 *
 * Auto-records a study session when the user interacts with the AI Tutor.
 * Called by the frontend after each AI response to update study time + activity.
 *
 * Body: {
 *   durationSec?: number,  // seconds spent on this interaction
 *   activity?: string,     // 'chat' | 'quiz' | 'drawing' | 'exam' | 'project'
 *   topic?: string,        // what was discussed
 * }
 *
 * Creates or updates today's StudySession for the user.
 * Also increments the user's XP based on activity type.
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({})) as {
    durationSec?: number;
    activity?: string;
    topic?: string;
  };

  const durationSec = Math.min(300, Math.max(5, Number(body.durationSec) || 30));
  const activity = body.activity || "chat";
  const topic = body.topic || null;

  try {
    // Find or create today's active study session
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let session = await db.studySession.findFirst({
      where: {
        userId: user.id,
        status: "active",
        startedAt: { gte: today },
      },
      orderBy: { startedAt: "desc" },
    }).catch(() => null);

    if (!session) {
      // Create a new session for today
      session = await db.studySession.create({
        data: {
          userId: user.id,
          status: "active",
          durationSec: 0,
          flashcardsReviewed: 0,
          quizzesTaken: 0,
          topicsStudied: 0,
          earnedPlaySeconds: 0,
        },
      }).catch(() => null);
    }

    if (session) {
      // Update the session with this interaction
      const updates: any = {
        durationSec: { increment: durationSec },
        updatedAt: new Date(),
      };
      if (activity === "quiz") updates.quizzesTaken = { increment: 1 };
      if (activity === "chat" || activity === "drawing") updates.topicsStudied = { increment: 1 };
      // Earn play time: 30 min study = 600s play (1:2 ratio)
      updates.earnedPlaySeconds = { increment: Math.floor(durationSec / 2) };

      await db.studySession.update({
        where: { id: session.id },
        data: updates,
      }).catch(() => {});
    }

    // Also update user's XP (5 XP per interaction, 10 for quiz, 15 for exam)
    const xpGain = activity === "exam" ? 15 : activity === "quiz" ? 10 : 5;
    await db.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    }).catch(() => {});

    // Best-effort: directly update UserXp (no internal HTTP fetch needed)
    // Phase 88.3 — this is more reliable than calling /api/progress via fetch
    try {
      let userXp = await db.userXp.findUnique({ where: { userId: user.id } }).catch(() => null);
      if (!userXp) {
        userXp = await db.userXp.create({
          data: { userId: user.id, xpAmount: 0, level: 1, streakDays: 0 },
        });
      }
      // Calculate streak
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 86400000);
      const lastActivity = userXp.lastActivityDate ? new Date(userXp.lastActivityDate) : null;
      let newStreak = userXp.streakDays;
      if (lastActivity) {
        const lastDay = new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate());
        if (lastDay.getTime() === today.getTime()) {
          // Already active today — keep streak
        } else if (lastDay.getTime() === yesterday.getTime()) {
          newStreak = userXp.streakDays + 1;
        } else {
          newStreak = 1;
        }
      } else {
        newStreak = 1;
      }
      const newXp = userXp.xpAmount + xpGain;
      const newLevel = Math.floor(newXp / 200) + 1;
      await db.userXp.update({
        where: { userId: user.id },
        data: {
          xpAmount: newXp,
          level: newLevel,
          streakDays: newStreak,
          lastActivityDate: now,
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      sessionDuration: session?.durationSec || 0,
      xpGain,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
  }
}
