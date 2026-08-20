import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/library
 * Lists admin-curated public library resources (any logged-in user can browse).
 */
export async function GET(req: NextRequest) {
  await getCurrentUser(); // ensure authed
  const url = new URL(req.url);
  const subject = url.searchParams.get("subject");
  const resourceType = url.searchParams.get("type");

  const where: any = { isPublic: true };
  if (subject) where.subject = subject;
  if (resourceType) where.resourceType = resourceType;

  const resources = await db.libraryResource.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, title: true, description: true, resourceType: true,
      contentId: true, subject: true, topicId: true, createdAt: true,
      topic: { select: { id: true, name: true, subject: true } },
    },
  }).catch(() => []);

  return NextResponse.json({ resources });
}
