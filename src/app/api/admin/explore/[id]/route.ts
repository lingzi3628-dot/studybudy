import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/explore/[id]
 * Deletes the project record. Files (stored in JSON field) are deleted with it.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const { id } = await params;
  await db.exploreProject.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
