import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/books — list all books with chapter counts. */
export async function GET() {
  await requireAdmin();
  const books = await db.book.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chapters: true } } },
  });
  return NextResponse.json({ books });
}

/** POST /api/admin/books — create a book. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const title = (body.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

  const book = await db.book.create({
    data: {
      title,
      description: body.description ?? null,
      coverImageUrl: body.coverImageUrl ?? null,
      published: body.published === true,
      createdById: admin.id,
    },
  });
  await logAdminAction(admin.id, "book.create", { bookId: book.id, title });
  return NextResponse.json({ book });
}
