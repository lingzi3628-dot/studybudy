import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/topics?subject=&published=&chapterId=
 * List topics with optional filters. Includes card counts + lesson status.
 */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const url = new URL(req.url);
  const subject = url.searchParams.get("subject");
  const published = url.searchParams.get("published");
  const chapterId = url.searchParams.get("chapterId");
  const q = url.searchParams.get("q");

  const where: any = {};
  if (subject) where.subject = { equals: subject, mode: "insensitive" };
  if (published === "true") where.published = true;
  if (published === "false") where.published = false;
  if (chapterId) where.chapterId = chapterId;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const topics = await db.topic.findMany({
    where,
    orderBy: [{ published: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      _count: { select: { cards: true, lessons: true } },
      chapter: { select: { id: true, title: true, book: { select: { id: true, title: true } } } },
    },
  });

  return NextResponse.json({ topics });
}

/**
 * POST /api/admin/topics
 * Body: { subject, name, description?, chapterId?, published?, lessonContent? }
 * Upserts by (subject, name). If topic exists, updates; otherwise creates.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  const subject = (body.subject ?? "General").toString().trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const data: any = {
    subject,
    name,
    description: body.description ?? null,
    chapterId: body.chapterId ?? null,
    published: body.published === true,
    createdById: admin.id,
  };
  if (body.lessonContent) data.lessonContent = body.lessonContent;

  const topic = await db.topic.upsert({
    where: { subject_name: { subject, name } },
    create: data,
    update: {
      description: data.description,
      chapterId: data.chapterId,
      published: data.published,
      ...(body.lessonContent ? { lessonContent: body.lessonContent } : {}),
    },
  });

  await logAdminAction(admin.id, "topic.upsert", { topicId: topic.id, subject, name, published: data.published });
  return NextResponse.json({ topic });
}
