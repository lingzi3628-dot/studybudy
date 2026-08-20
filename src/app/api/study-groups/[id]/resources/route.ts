import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/study-groups/[id]/resources — list shared bookmarks in the group
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  // Verify membership
  const membership = await db.studyGroupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: user.id } },
  }).catch(() => null);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const bookmarks = await db.bookmark.findMany({
    where: { groupId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).catch(() => []);

  return NextResponse.json({
    bookmarks: bookmarks.map((b) => ({
      id: b.id,
      resourceType: b.resourceType,
      resourceId: b.resourceId,
      sharedBy: b.user?.name ?? b.user?.email ?? "Unknown",
      createdAt: b.createdAt,
    })),
  });
}

/**
 * POST /api/study-groups/[id]/resources — share a bookmark to the group
 * Body: { resourceType, resourceId }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    resourceType?: string;
    resourceId?: string;
  };

  if (!body.resourceType || !body.resourceId) {
    return NextResponse.json({ error: "resourceType and resourceId required" }, { status: 400 });
  }

  // Verify membership
  const membership = await db.studyGroupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: user.id } },
  }).catch(() => null);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  try {
    const bookmark = await db.bookmark.create({
      data: {
        userId: user.id,
        groupId: id,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
      },
    });
    return NextResponse.json({ bookmark, message: "Shared to group ✓" });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Already shared", alreadyShared: true }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to share" }, { status: 500 });
  }
}
