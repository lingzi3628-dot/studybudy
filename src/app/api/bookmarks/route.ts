import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/bookmarks?groupId=... — list user's bookmarks */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");

  const bookmarks = await db.bookmark.findMany({
    where: {
      userId: user.id,
      groupId: groupId ?? null,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, resourceType: true, resourceId: true, groupId: true,
      createdAt: true,
    },
  }).catch(() => []);

  return NextResponse.json({ bookmarks });
}

/** POST /api/bookmarks — add a bookmark */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    resourceType: string;
    resourceId: string;
    groupId?: string;
  };

  if (!body.resourceType || !body.resourceId) {
    return NextResponse.json({ error: "resourceType and resourceId required" }, { status: 400 });
  }

  try {
    const bookmark = await db.bookmark.create({
      data: {
        userId: user.id,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        groupId: body.groupId ?? null,
      },
    });
    return NextResponse.json({ bookmark });
  } catch (e: any) {
    // Already bookmarked (unique constraint)
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Already bookmarked", alreadyBookmarked: true }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to bookmark" }, { status: 500 });
  }
}
