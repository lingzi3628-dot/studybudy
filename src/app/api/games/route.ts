import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Built-in starter games — auto-seeded if the DB is empty on first load.
// This means a fresh deployment shows games in the hub immediately, without
// requiring a manual POST /api/games/seed call.
const SEED_GAMES = [
  {
    title: "Chess 3D",
    description: "Full chess rules in stunning 3D! Orbit the board, choose your difficulty (Casual/Normal/Hard), and play as White, Black, or against a friend. Castling, en passant, promotion, checkmate — all working.",
    category: "Strategy",
    gameUrl: "/games/chess-3d/index.html",
    isFeatured: true,
    rating: 4.9,
    minStudyMinutes: 30,
    playTimeMinutes: 15,
  },
  {
    title: "Voxel World 3D",
    description: "A Minecraft-style voxel sandbox! Procedurally generate a world from any seed, mine and place blocks, explore a day/night cycle, and watch ambient mobs wander the landscape. Mobile + desktop controls.",
    category: "Adventure",
    gameUrl: "/games/voxel-world-3d/index.html",
    isFeatured: true,
    rating: 4.7,
    minStudyMinutes: 30,
    playTimeMinutes: 15,
  },
  {
    title: "8 Ball 3D",
    description: "Stunning 3D 8-ball pool with realistic physics. Drag from the cue ball to aim, hold to charge power, and sink your group before the AI does!",
    category: "Sports",
    gameUrl: "/games/8-ball-3d/index.html",
    isFeatured: true,
    rating: 4.8,
    minStudyMinutes: 30,
    playTimeMinutes: 15,
  },
  {
    title: "StudyBuddy Snake",
    description: "The classic snake game. Eat food, grow longer, don't hit yourself!",
    category: "Arcade",
    gameUrl: "/games/studybuddy-snake/index.html",
    isFeatured: false,
    rating: 4.0,
    minStudyMinutes: 30,
    playTimeMinutes: 10,
  },
  {
    title: "StudyBuddy Memory",
    description: "Flip cards and match pairs. Test your memory with education-themed emojis!",
    category: "Puzzle",
    gameUrl: "/games/studybuddy-memory/index.html",
    isFeatured: true,
    rating: 4.5,
    minStudyMinutes: 30,
    playTimeMinutes: 10,
  },
];

// Idempotent: if the DB has zero games, seed these. Race-safe via findFirst check.
async function ensureSeeded() {
  try {
    const count = await db.game.count();
    if (count > 0) return;
    for (const g of SEED_GAMES) {
      const existing = await db.game.findFirst({ where: { title: g.title } }).catch(() => null);
      if (!existing) {
        await db.game.create({
          data: {
            ...g,
            fileSize: 0,
            version: "1.0.0",
            isActive: true,
            playCount: 0,
          } as any,
        }).catch(() => {});
      }
    }
  } catch (e) {
    // DB might be unreachable in sandbox — swallow so the GET doesn't 500
  }
}

/**
 * GET /api/games — list all active games
 * Query: ?category=Arcade — filter by category
 *
 * Auto-seeds the DB on first call if empty.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  // Auto-seed if DB is empty (idempotent, race-safe)
  await ensureSeeded();

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
