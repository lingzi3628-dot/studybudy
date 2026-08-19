import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/concept-maps — list current user's concept maps
 *
 * Returns: { maps: [{ id, title, createdAt, isPublic, sourceType, _count }] }
 * Also includes public (admin-generated) maps the user can view.
 */
export async function GET() {
  const user = await getCurrentUser();

  const [userMaps, publicMaps] = await Promise.all([
    db.conceptMap.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        isPublic: true,
        sourceType: true,
        topicId: true,
        createdAt: true,
        updatedAt: true,
        topic: { select: { id: true, name: true, subject: true } },
      },
    }).catch(() => []),
    db.conceptMap.findMany({
      where: { isPublic: true, userId: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        isPublic: true,
        sourceType: true,
        topicId: true,
        createdAt: true,
        topic: { select: { id: true, name: true, subject: true } },
      },
    }).catch(() => []),
  ]);

  return NextResponse.json({
    maps: userMaps,
    publicMaps,
    tokenBalance: user.tokenBalance,
  });
}
