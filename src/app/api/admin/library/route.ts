import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";

export const runtime = "nodejs";

/**
 * GET /api/admin/library?subjectId=...&gradeId=...
 * POST /api/admin/library — upload a book (body: { title, author?, description?, fileUrl, fileType?, coverImage?, subjectId?, gradeId?, pages? })
 * DELETE /api/admin/library — body: { id }
 */
export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId") || undefined;
  const gradeId = url.searchParams.get("gradeId") || undefined;
  const books = await db.libraryBook.findMany({
    where: { subjectId, gradeId, isPublished: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ books });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const title = (body?.title ?? "").toString().trim();
  const fileUrl = (body?.fileUrl ?? "").toString().trim();
  if (!title || !fileUrl) {
    return NextResponse.json({ error: "title and fileUrl are required" }, { status: 400 });
  }
  const book = await db.libraryBook.create({
    data: {
      title,
      author: body?.author ?? null,
      description: body?.description ?? null,
      fileUrl,
      fileType: body?.fileType ?? "pdf",
      coverImage: body?.coverImage ?? null,
      pages: body?.pages ?? null,
      subjectId: body?.subjectId ?? null,
      gradeId: body?.gradeId ?? null,
      uploadedBy: body?.uploadedBy ?? null,
      isPublished: body?.isPublished ?? true,
    },
  });
  return NextResponse.json({ book });
}

export async function DELETE(req: NextRequest) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? "").toString();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.libraryBook.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
