import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/course-switch — list all course switch requests
 * Query: ?status=pending (default) | approved | rejected | all
 */
export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch {
    return NextResponse.json({ error: "Admin required" }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const where: any = {};
  if (status && status !== "all") where.status = status;

  const requests = await db.courseSwitchRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          track: true,
          grade: true,
          course: true,
          phoneNumber: true,
        },
      },
    },
  }).catch(() => []);

  return NextResponse.json({
    requests: requests.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() || null,
    })),
  });
}
