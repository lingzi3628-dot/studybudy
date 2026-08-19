import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/concept-maps — list all concept maps (user + public)
 * Query: ?public=true to filter only public maps
 */
export async function GET(req: NextRequest) {
  await requireAdminJwt();
  const url = new URL(req.url);
  const filterPublic = url.searchParams.get("public") === "true";

  const where = filterPublic ? { isPublic: true } : {};
  const maps = await db.conceptMap.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, title: true, isPublic: true, sourceType: true,
      userId: true, topicId: true, createdAt: true,
      user: { select: { email: true, name: true } },
      topic: { select: { name: true, subject: true } },
    },
  }).catch(() => []);

  return NextResponse.json({ maps });
}
