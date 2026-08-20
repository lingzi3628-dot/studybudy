import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/library/[id]/add
 *
 * "Adds" a library resource to the user's room — implemented as a bookmark.
 * The resource itself stays in the library; the bookmark makes it appear
 * in the user's "Library" shelf.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const resource = await db.libraryResource.findUnique({
    where: { id },
    select: { id: true, resourceType: true, contentId: true, title: true },
  }).catch(() => null);

  if (!resource) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  // Create a bookmark pointing to the resource
  try {
    const bookmark = await db.bookmark.create({
      data: {
        userId: user.id,
        resourceType: resource.resourceType,
        resourceId: resource.contentId ?? resource.id, // link to actual content if exists
      },
    });
    return NextResponse.json({ bookmark, message: "Added to your room ✓" });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Already in your room", alreadyAdded: true }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to add resource" }, { status: 500 });
  }
}
