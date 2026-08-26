import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/exam-papers
 *
 * Query params:
 *   ?category=kcse_revision  — filter by category
 *   ?gradeLevel=Form+4      — filter by grade
 *   ?subjectName=Mathematics — filter by subject
 *   ?search=algebra         — smart search (title + description + subjectName + schoolName)
 *   ?trending=true           — only trending exams
 *   ?limit=20                — max results (default 50)
 *
 * Returns published exam papers for the Netflix-style exam hub.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") || undefined;
  const gradeLevel = url.searchParams.get("gradeLevel") || undefined;
  const subjectName = url.searchParams.get("subjectName") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const trending = url.searchParams.get("trending") === "true";
  const limit = Math.min(100, Number(url.searchParams.get("limit")) || 50);

  try {
    const where: any = { isPublished: true };
    if (category) where.category = category;
    if (gradeLevel) where.gradeLevel = gradeLevel;
    if (subjectName) where.subjectName = { contains: subjectName, mode: "insensitive" };
    if (trending) where.isTrending = true;

    // Smart search — search across title, description, subjectName, schoolName
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { subjectName: { contains: search, mode: "insensitive" } },
        { schoolName: { contains: search, mode: "insensitive" } },
        { paperType: { contains: search, mode: "insensitive" } },
      ];
    }

    const papers = await db.examPaper.findMany({
      where,
      orderBy: trending ? [{ viewCount: "desc" }] : [{ createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json({ papers });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ papers: [] });
    console.error("exam-papers error:", e?.message);
    return NextResponse.json({ papers: [] }, { status: 200 });
  }
}
