import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { processSourceDoc } from "@/lib/curriculum";

export const runtime = "nodejs";

/**
 * GET  /api/admin/curriculum/docs?gradeId=...&subjectId=...
 *   Returns all source docs (with parse status).
 *
 * POST /api/admin/curriculum/docs
 *   body: { sourceDocId } — re-process a source doc (re-run the AI parser).
 *   Useful when the AI failed or new content was added.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const url = new URL(req.url);
  const gradeId = url.searchParams.get("gradeId") || undefined;
  const subjectId = url.searchParams.get("subjectId") || undefined;

  try {
    const docs = await db.curriculumSourceDoc.findMany({
      where: { gradeId, subjectId },
      orderBy: { createdAt: "desc" },
      include: {
        grade: { select: { name: true } },
        subject: { select: { name: true } },
      },
      take: 100,
    });
    return NextResponse.json({ docs });
  } catch (e: any) {
    if (e?.code === "P2021") return NextResponse.json({ docs: [] });
    return NextResponse.json({ error: "Failed to load docs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const sourceDocId = (body?.sourceDocId ?? "").toString().trim();
  if (!sourceDocId) {
    return NextResponse.json({ error: "sourceDocId is required" }, { status: 400 });
  }

  try {
    const result = await processSourceDoc(sourceDocId);
    return NextResponse.json({ ok: true, parseResult: result });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Re-parse failed", detail: e?.message },
      { status: 500 }
    );
  }
}
