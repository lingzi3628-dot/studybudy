import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const games = [
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

  let created = 0;
  for (const g of games) {
    const existing = await db.game.findFirst({ where: { title: g.title } }).catch(() => null);
    if (!existing) {
      await db.game.create({ data: g }).catch(() => {});
      created++;
    }
  }

  return NextResponse.json({ ok: true, created, message: created > 0 ? `Added ${created} new games.` : "All games already exist." });
}
