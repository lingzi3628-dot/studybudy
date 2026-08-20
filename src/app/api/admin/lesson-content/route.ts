import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/lesson-content
 *   Lists all cached lesson contents with their topic name.
 *
 * DELETE /api/admin/lesson-content?id=...
 *   Deletes a cached lesson by its id.
 */
export async function GET() {
  await requireAdminJwt();

  const lessons = await db.lessonContent.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      topic: {
        select: { id: true, name: true, subject: true },
      },
    },
  }).catch(() => []);

  const items = lessons.map((l: any) => {
    const blockCount = Array.isArray(l.contentJson) ? (l.contentJson as any[]).length : 0;
    return {
      id: l.id,
      topicId: l.topicId,
      topicName: l.topic?.name ?? "Unknown",
      subject: l.topic?.subject ?? "",
      blockCount,
      createdAt: l.createdAt,
    };
  });

  return NextResponse.json({ lessons: items });
}

/**
 * DELETE /api/admin/lesson-content?id=...
 * Deletes a single cached lesson by its id.
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdminJwt();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query parameter is required." }, { status: 400 });
  }

  const existing = await db.lessonContent.findUnique({ where: { id } }).catch(() => null);
  if (!existing) {
    return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  }

  try {
    await db.lessonContent.delete({ where: { id } });
  } catch (e: any) {
    return NextResponse.json({ error: "DB error: " + e?.message }, { status: 500 });
  }

  await logAdminActionViaJwt(admin, "lesson_content.delete", { id, topicId: existing.topicId });

  return NextResponse.json({ ok: true, deleted: id });
}
