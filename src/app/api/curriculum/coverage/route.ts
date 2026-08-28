import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/coverage?subjectId=...
 *
 * Phase 46 — Syllabus coverage tracker
 *
 * Returns the user's progress on a curriculum subject's topics:
 *   {
 *     subjectId: string,
 *     totalTopics: number,
 *     completedTopics: number,
 *     inProgressTopics: number,
 *     notStartedTopics: number,
 *     coveragePct: number,    // 0-100 — completed / total
 *     topics: Array<{
 *       id, name, status, startedAt, completedAt
 *     }>
 *   }
 *
 * Used by CurriculumSubjectView to render the "X/Y topics completed" ring
 * and gate topic access when the previous topic isn't complete.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId");
  if (!subjectId) {
    return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
  }

  // Load all topics for this subject
  const topics = await db.curriculumTopic.findMany({
    where: { subjectId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, name: true, orderIndex: true },
  });

  if (topics.length === 0) {
    return NextResponse.json({
      subjectId,
      totalTopics: 0,
      completedTopics: 0,
      inProgressTopics: 0,
      notStartedTopics: 0,
      coveragePct: 0,
      topics: [],
    });
  }

  // Load all progress rows for this user + these topics
  const progress = await db.curriculumTopicProgress.findMany({
    where: { userId: user.id, topicId: { in: topics.map((t) => t.id) } },
    select: { topicId: true, status: true, startedAt: true, completedAt: true },
  });

  // Build a map for fast lookup
  const progressMap = new Map(progress.map((p) => [p.topicId, p]));

  let completed = 0, inProgress = 0, notStarted = 0;
  const topicsWithStatus = topics.map((t) => {
    const p = progressMap.get(t.id);
    const status = p?.status ?? "not_started";
    if (status === "completed") completed++;
    else if (status === "in_progress") inProgress++;
    else notStarted++;
    return {
      id: t.id,
      name: t.name,
      status,
      startedAt: p?.startedAt ?? null,
      completedAt: p?.completedAt ?? null,
    };
  });

  const coveragePct = Math.round((completed / topics.length) * 100);

  return NextResponse.json({
    subjectId,
    totalTopics: topics.length,
    completedTopics: completed,
    inProgressTopics: inProgress,
    notStartedTopics: notStarted,
    coveragePct,
    topics: topicsWithStatus,
  });
}

/**
 * POST /api/curriculum/coverage
 *
 * Mark a topic as started or completed. Called by the topic study view
 * when the user opens a topic (in_progress) or finishes the quiz with
 * a passing score (completed).
 *
 * Body: { topicId: string, status: 'in_progress' | 'completed' }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { topicId?: string; status?: string };
  if (!body.topicId || !body.status) {
    return NextResponse.json({ error: "topicId and status required" }, { status: 400 });
  }
  if (!["in_progress", "completed"].includes(body.status)) {
    return NextResponse.json({ error: "status must be 'in_progress' or 'completed'" }, { status: 400 });
  }

  const now = new Date();
  const existing = await db.curriculumTopicProgress.findUnique({
    where: { userId_topicId: { userId: user.id, topicId: body.topicId } },
  });

  // Don't downgrade a completed topic back to in_progress
  if (existing?.status === "completed" && body.status === "in_progress") {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  await db.curriculumTopicProgress.upsert({
    where: { userId_topicId: { userId: user.id, topicId: body.topicId } },
    create: {
      userId: user.id,
      topicId: body.topicId,
      status: body.status,
      startedAt: body.status === "in_progress" ? now : null,
      completedAt: body.status === "completed" ? now : null,
    },
    update: {
      status: body.status,
      startedAt: body.status === "in_progress" && !existing?.startedAt ? now : existing?.startedAt,
      completedAt: body.status === "completed" ? now : null,
    },
  });

  return NextResponse.json({ ok: true });
}
