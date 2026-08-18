import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/chapters?bookId= — list chapters (optionally filtered by book). */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const url = new URL(req.url);
  const bookId = url.searchParams.get("bookId");
  const chapters = await db.chapter.findMany({
    where: bookId ? { bookId } : undefined,
    orderBy: [{ bookId: "asc" }, { orderIndex: "asc" }],
    include: { _count: { select: { topics: true } }, book: { select: { title: true } } },
  });
  return NextResponse.json({ chapters });
}

/** POST /api/admin/chapters — create a chapter. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const bookId = (body.bookId ?? "").toString();
  if (!bookId) return NextResponse.json({ error: "Missing bookId" }, { status: 400 });

  const chapter = await db.chapter.create({
    data: {
      bookId,
      title: body.title ?? null,
      orderIndex: body.orderIndex ?? 0,
    },
  });
  await logAdminAction(admin.id, "chapter.create", { chapterId: chapter.id, bookId });
  return NextResponse.json({ chapter });
}
