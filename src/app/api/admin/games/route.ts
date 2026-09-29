import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * GET /api/admin/games — list all games (including inactive)
 */
export async function GET() {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const games = await db.game.findMany({
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
  }).catch(() => []);
  return NextResponse.json({
    games: games.map((g) => ({
      ...g,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/admin/games — toggle featured / active
 * Body: { gameId, action: "feature" | "unfeature" | "activate" | "deactivate", value?: boolean }
 */
export async function PATCH(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as {
    gameId?: string;
    action?: string;
  };
  if (!body.gameId || !body.action) {
    return NextResponse.json({ error: "gameId and action are required" }, { status: 400 });
  }
  const patch: any = {};
  switch (body.action) {
    case "feature": patch.isFeatured = true; break;
    case "unfeature": patch.isFeatured = false; break;
    case "activate": patch.isActive = true; break;
    case "deactivate": patch.isActive = false; break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const game = await db.game.update({
    where: { id: body.gameId },
    data: patch,
  }).catch(() => null);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  return NextResponse.json({ game });
}
