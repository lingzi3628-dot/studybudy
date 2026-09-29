import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/games — list all active games
 * Query: ?category=Arcade — filter by category
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  const where: any = { isActive: true };
  if (category && category !== "All") where.category = category;

  const games = await db.game.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { playCount: "desc" }, { createdAt: "desc" }],
    take: 100,
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
 * PATCH /api/games — increment play count
 * Body: { gameId, action: "play" }
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { gameId?: string; action?: string };
  if (body.gameId && body.action === "play") {
    await db.game.update({
      where: { id: body.gameId },
      data: { playCount: { increment: 1 } },
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/games — create a new game (admin)
 * Body: { title, description, category, gameUrl, thumbnailUrl, isFeatured, minStudyMinutes, playTimeMinutes }
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); } catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  // Check admin
  const adminCookie = req.cookies.get("admin_token") || req.cookies.get("sb_admin");
  if (!adminCookie) {
    // Allow any logged-in user to create games for now (can restrict later)
  }

  const body = await req.json().catch(() => ({})) as {
    title?: string; description?: string; category?: string;
    gameUrl?: string; thumbnailUrl?: string; isFeatured?: boolean;
    minStudyMinutes?: number; playTimeMinutes?: number;
  };

  if (!body.title || !body.gameUrl) {
    return NextResponse.json({ error: "title and gameUrl are required" }, { status: 400 });
  }

  const game = await db.game.create({
    data: {
      title: body.title,
      description: body.description || null,
      category: body.category || "Arcade",
      gameUrl: body.gameUrl,
      thumbnailUrl: body.thumbnailUrl || null,
      isFeatured: body.isFeatured || false,
      minStudyMinutes: body.minStudyMinutes || 30,
      playTimeMinutes: body.playTimeMinutes || 10,
    },
  });

  return NextResponse.json({ game });
}
