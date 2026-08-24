import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/grades
 *
 * Public — returns all grades with their status ('ready' | 'coming_soon').
 * Used by the onboarding screen to show Grade 1 as selectable and other
 * grades greyed-out with a "coming soon" message.
 */
export async function GET() {
  try {
    const grades = await db.curriculumGrade.findMany({
      orderBy: [{ level: "asc" }, { orderIndex: "asc" }],
      select: {
        id: true,
        name: true,
        level: true,
        orderIndex: true,
        status: true,
        description: true,
        _count: { select: { subjects: true } },
      },
    });
    return NextResponse.json({
      grades: grades.map((g) => ({
        id: g.id,
        name: g.name,
        level: g.level,
        orderIndex: g.orderIndex,
        status: g.status,
        description: g.description,
        subjectCount: g._count.subjects,
      })),
    });
  } catch (e: any) {
    // P2021 = table doesn't exist yet — return empty so onboarding can still
    // fall back to its hardcoded grade list.
    if (e?.code === "P2021") {
      return NextResponse.json({ grades: [], tablesMissing: true });
    }
    return NextResponse.json(
      { error: "Failed to load grades", detail: e?.message },
      { status: 500 }
    );
  }
}
