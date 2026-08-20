import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { awardXp } from "@/lib/gamify";

export const runtime = "nodejs";

/**
 * GET /api/notes?topicId=... — list user's notes (optionally filtered by topic)
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const topicId = url.searchParams.get("topicId") || undefined;

  const notes = await db.userNote.findMany({
    where: { userId: user.id, topicId: topicId ?? null },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, content: true, topicId: true, createdAt: true, updatedAt: true },
  }).catch(() => []);

  return NextResponse.json({ notes });
}

/**
 * POST /api/notes — create a new note
 * Body: { title, content?, topicId? }
 * Awards 5 XP per note.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    title?: string;
    content?: string;
    topicId?: string;
  };

  const title = (body.title ?? "").toString().trim();
  if (!title) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const note = await db.userNote.create({
    data: {
      userId: user.id,
      topicId: body.topicId ?? null,
      title: title.slice(0, 200),
      content: (body.content ?? "").toString().slice(0, 50000),
    },
  });

  await awardXp(user.id, 5);
  return NextResponse.json({ note });
}
