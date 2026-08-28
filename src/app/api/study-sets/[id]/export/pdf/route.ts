import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildStudySetPDF } from "@/lib/pdf-export";

export const runtime = "nodejs";

/**
 * GET /api/study-sets/[id]/export/pdf
 *
 * Compiles the study set's flashcards + MCQs (and lesson content if
 * the set's topic has a lesson) into a printable PDF document.
 * Uses pdf-lib (pure JS, no native deps).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id: setId } = await params;

  // Verify ownership and load cards + lesson content
  const studySet = await db.studySet.findFirst({
    where: { id: setId, userId: user.id },
    include: {
      cards: true,
      topicRef: { select: { lessonContent: true, name: true, subject: true } },
    },
  });
  if (!studySet) {
    return NextResponse.json({ error: "Study set not found" }, { status: 404 });
  }

  if (studySet.cards.length === 0) {
    return NextResponse.json({ error: "No cards available to export" }, { status: 400 });
  }

  try {
    const pdfBytes = await buildStudySetPDF({
      title: studySet.title,
      subject: studySet.subject ?? studySet.topicRef?.subject ?? undefined,
      topic: studySet.topic ?? studySet.topicRef?.name ?? undefined,
      cards: studySet.cards,
      lessonContent:
        typeof studySet.topicRef?.lessonContent === "string"
          ? studySet.topicRef.lessonContent
          : studySet.topicRef?.lessonContent
          ? JSON.stringify(studySet.topicRef.lessonContent)
          : null,
    });

    const safeTitle = studySet.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeTitle || 'studyset'}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[export-pdf] failed:", e?.message);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
