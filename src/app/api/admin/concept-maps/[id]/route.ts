import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** DELETE /api/admin/concept-maps/[id] — admin can delete any concept map */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminJwt();
  const { id } = await params;

  const map = await db.conceptMap.findUnique({
    where: { id },
    select: { id: true, title: true, userId: true },
  }).catch(() => null);

  if (!map) {
    return NextResponse.json({ error: "Concept map not found." }, { status: 404 });
  }

  await db.conceptMap.delete({ where: { id } });
  await logAdminActionViaJwt(admin, "concept_map.delete", { id, title: map.title, ownerId: map.userId });

  return NextResponse.json({ ok: true });
}
