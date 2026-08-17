import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** PUT /api/admin/books/[id] */
export async function PUT(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (body.title) data.title = body.title;
  if (typeof body.description === "string") data.description = body.description || null;
  if (typeof body.coverImageUrl === "string") data.coverImageUrl = body.coverImageUrl || null;
  if (typeof body.published === "boolean") data.published = body.published;

  const updated = await db.book.update({ where: { id }, data });
  await logAdminAction(admin.id, "book.update", { bookId: id, changes: data });
  return NextResponse.json({ book: updated });
}

/** DELETE /api/admin/books/[id] */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  const { id } = await params;
  await db.book.delete({ where: { id } });
  await logAdminAction(admin.id, "book.delete", { bookId: id });
  return NextResponse.json({ ok: true });
}
