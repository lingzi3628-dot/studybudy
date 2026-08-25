import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/library?subjectId=...
 *
 * Public — returns published books for a subject.
 */
export async function GET(req: NextRequest) {
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? "";
  try {
    const books = await db.libraryBook.findMany({
      where: { subjectId, isPublished: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ books });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ books: [] });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
