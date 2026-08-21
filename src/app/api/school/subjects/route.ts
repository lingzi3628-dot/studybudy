import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/school/subjects?level=primary|secondary
 *
 * Lists SchoolSubjects for the given level. Used by the registration flow
 * to show the subject picker — public endpoint, no auth required.
 */
export async function GET(req: NextRequest) {
  const level = (req.nextUrl.searchParams.get("level") ?? "")
    .toString()
    .trim()
    .toLowerCase();

  // If level is provided, validate it's one of the supported values.
  if (level && level !== "primary" && level !== "secondary") {
    return NextResponse.json(
      { error: "Level must be 'primary' or 'secondary'" },
      { status: 400 }
    );
  }

  const subjects = await db.schoolSubject.findMany({
    where: level ? { level } : undefined,
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      level: true,
      icon: true,
      color: true,
    },
  }).catch(() => []);

  return NextResponse.json({ subjects });
}
