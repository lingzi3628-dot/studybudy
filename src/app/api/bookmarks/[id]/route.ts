import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** DELETE /api/bookmarks/[id] — remove a bookmark */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  // Also allow removing by resource — handle ?resourceId=&resourceType= query
  // For now just delete by bookmark id
  const bookmark = await db.bookmark.findUnique({
    where: { id },
    select: { id: true, userId: true },
  }).catch(() => null);

  if (!bookmark) return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  if (bookmark.userId !== user.id) return NextResponse.json({ error: "Not your bookmark" }, { status: 403 });

  await db.bookmark.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
