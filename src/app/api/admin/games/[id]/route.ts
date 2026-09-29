import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/games/[id]?deleteFiles=true|false
 *
 * Deletes the Game record. The files field (JSON) is automatically deleted
 * with the record (CASCADE behavior on JSON columns). No filesystem cleanup
 * needed on Vercel — files are stored in the DB.
 *
 * Query param `deleteFiles` is kept for backwards compatibility with the UI
 * but no longer does anything (was previously used to wipe /public/games/).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const { id } = await params;

  const game = await db.game.findUnique({ where: { id } }).catch(() => null);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  await db.game.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
