import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/subjects?gradeId=...
 *
 * Public — returns the subjects for a grade, with topic counts.
 * Used by the dashboard to show the user's available subjects.
 */
export async function GET(req: NextRequest) {
  const gradeId = new URL(req.url).searchParams.get("gradeId") ?? "";

  if (!gradeId) {
    return NextResponse.json(
      { error: "gradeId query param is required" },
      { status: 400 }
    );
  }

  try {
    const subjects = await db.curriculumSubject.findMany({
      where: { gradeId },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        name: true,
        icon: true,
        color: true,
        description: true,
        orderIndex: true,
        _count: { select: { topics: true } },
      },
    });

    return NextResponse.json({
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        color: s.color,
        description: s.description,
        orderIndex: s.orderIndex,
        topicCount: s._count.topics,
      })),
    });
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({ subjects: [], tablesMissing: true });
    }
    return NextResponse.json(
      { error: "Failed to load subjects", detail: e?.message },
      { status: 500 }
    );
  }
}
