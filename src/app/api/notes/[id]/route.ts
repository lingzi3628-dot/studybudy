import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** PUT /api/notes/[id] — update note */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { title?: string; content?: string };

  const note = await db.userNote.findUnique({
    where: { id },
    select: { id: true, userId: true },
  }).catch(() => null);

  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (note.userId !== user.id) return NextResponse.json({ error: "Not your note" }, { status: 403 });

  const data: any = {};
  if (typeof body.title === "string") data.title = body.title.slice(0, 200);
  if (typeof body.content === "string") data.content = body.content.slice(0, 50000);

  const updated = await db.userNote.update({ where: { id }, data });
  return NextResponse.json({ note: updated });
}

/** DELETE /api/notes/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const note = await db.userNote.findUnique({
    where: { id },
    select: { id: true, userId: true },
  }).catch(() => null);

  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (note.userId !== user.id) return NextResponse.json({ error: "Not your note" }, { status: 403 });

  await db.userNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
