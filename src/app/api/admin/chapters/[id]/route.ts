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
  if (typeof body.title === "string") data.title = body.title || null;
  if (typeof body.orderIndex === "number") data.orderIndex = body.orderIndex;
  if (body.bookId) data.bookId = body.bookId;

  const updated = await db.chapter.update({ where: { id }, data });
  await logAdminAction(admin.id, "chapter.update", { chapterId: id, changes: data });
  return NextResponse.json({ chapter: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;
  await db.chapter.delete({ where: { id } });
  await logAdminAction(admin.id, "chapter.delete", { chapterId: id });
  return NextResponse.json({ ok: true });
}
