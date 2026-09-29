import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/games/[id]?deleteFiles=true|false
 *
 * Deletes the Game record. If deleteFiles=true (default), also removes the
 * extracted game files from /public/games/<slug>/.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const deleteFiles = url.searchParams.get("deleteFiles") !== "false";

  const game = await db.game.findUnique({ where: { id } }).catch(() => null);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Delete files from /public/games/<slug>/
  if (deleteFiles && game.gameUrl) {
    // gameUrl is like /games/<slug>/<entry.html>
    const match = game.gameUrl.match(/^\/games\/([^/]+)/);
    if (match) {
      const slug = match[1];
      const targetDir = path.join(process.cwd(), "public", "games", slug);
      if (existsSync(targetDir)) {
        await rm(targetDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  await db.game.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
