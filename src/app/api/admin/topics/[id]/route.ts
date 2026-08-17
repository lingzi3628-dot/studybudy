import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (body.subject) data.subject = body.subject;
  if (body.name) data.name = body.name;
  if (typeof body.description === "string") data.description = body.description || null;
  if (typeof body.chapterId === "string") data.chapterId = body.chapterId || null;
  if (typeof body.published === "boolean") data.published = body.published;
  if (body.lessonContent) data.lessonContent = body.lessonContent;

  const updated = await db.topic.update({ where: { id }, data });
  await logAdminAction(admin.id, "topic.update", { topicId: id, changes: { ...data, lessonContent: data.lessonContent ? "[updated]" : undefined } });
  return NextResponse.json({ topic: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;
  await db.topic.delete({ where: { id } });
  await logAdminAction(admin.id, "topic.delete", { topicId: id });
  return NextResponse.json({ ok: true });
}
