import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/calendar?month=YYYY-MM
 *
 * Returns calendar entries for the given month (or current month if not specified).
 * Used by the AI Calendar screen to show daily progress.
 *
 * Also returns a summary: total study minutes, quizzes taken, exams done,
 * current streak, etc.
 */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month"); // "2026-08"

  // Determine the date range
  const now = new Date();
  const year = monthParam ? parseInt(monthParam.split("-")[0]) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam.split("-")[1]) - 1 : now.getMonth();

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

  try {
    const entries = await db.calendarEntry.findMany({
      where: {
        userId: user.id,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { date: "asc" },
    });

    // Group by day
    const byDay: Record<string, Array<typeof entries[0]>> = {};
    for (const e of entries) {
      const dayKey = new Date(e.date).toISOString().slice(0, 10);
      if (!byDay[dayKey]) byDay[dayKey] = [];
      byDay[dayKey].push(e);
    }

    // Build summary
    const totalStudyMin = entries
      .filter((e) => e.type === "study")
      .reduce((sum, e) => sum + (e.durationMin ?? 0), 0);
    const quizzesTaken = entries.filter((e) => e.type === "quiz").length;
    const examsDone = entries.filter((e) => e.type === "exam").length;
    const flashcardSessions = entries.filter((e) => e.type === "flashcard").length;
    const studyDays = Object.keys(byDay).filter((day) =>
      byDay[day].some((e) => e.type === "study")
    ).length;

    // Calculate streak (consecutive days with at least one entry, counting back from today)
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dayKey = checkDate.toISOString().slice(0, 10);
      if (byDay[dayKey] && byDay[dayKey].length > 0) {
        streak++;
      } else if (i > 0) {
        break; // gap found
      }
    }

    return NextResponse.json({
      entries,
      byDay,
      summary: {
        totalStudyMin,
        quizzesTaken,
        examsDone,
        flashcardSessions,
        studyDays,
        streak,
      },
      month: { year, month: month + 1 },
    });
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({ entries: [], byDay: {}, summary: {} });
    }
    return NextResponse.json({ error: "Failed to load calendar" }, { status: 500 });
  }
}

/**
 * POST /api/curriculum/calendar
 * Body: { type, title, description?, durationMin?, score?, subjectId?, topicId? }
 *
 * Creates a calendar entry manually (e.g. when a quiz or exam is completed).
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const type = (body?.type ?? "").toString().trim();
  const title = (body?.title ?? "").toString().trim();

  if (!type || !title) {
    return NextResponse.json({ error: "type and title are required" }, { status: 400 });
  }

  try {
    const entry = await db.calendarEntry.create({
      data: {
        userId: user.id,
        date: new Date(),
        type,
        title,
        description: body?.description ?? null,
        durationMin: body?.durationMin ?? 0,
        score: body?.score ?? null,
        subjectId: body?.subjectId ?? null,
        topicId: body?.topicId ?? null,
      },
    });
    return NextResponse.json({ entry });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}
