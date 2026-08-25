import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { processSourceDoc } from "@/lib/curriculum";

export const runtime = "nodejs";

/**
 * POST /api/admin/curriculum/upload
 *
 * Admin-only. Accepts a JSON body with:
 *   {
 *     gradeId: string,
 *     subjectId?: string,        // if provided, use this existing subject
 *     subjectName?: string,      // if subjectId not provided, create a new subject with this name
 *     subjectIcon?: string,     // optional emoji for new subject
 *     subjectColor?: string,    // optional hex color for new subject
 *     sourceType: 'pdf' | 'doc' | 'paste',
 *     fileName: string,          // original filename (for paste, use a descriptive name)
 *     rawText: string,           // the extracted plain text content
 *     parseNow?: boolean,        // default true — run the AI parser immediately
 *   }
 *
 * Creates a CurriculumSourceDoc row, optionally runs the AI parser to
 * generate topics + flashcards + quiz questions.
 *
 * Returns the source doc ID + parse results (if parseNow was true).
 */
export async function POST(req: NextRequest) {
  // Verify admin
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const gradeId = (body?.gradeId ?? "").toString().trim();
  const subjectId = (body?.subjectId ?? "").toString().trim() || null;
  const subjectName = (body?.subjectName ?? "").toString().trim();
  const subjectIcon = (body?.subjectIcon ?? "📚").toString().trim();
  const subjectColor = (body?.subjectColor ?? "#6366F1").toString().trim();
  const sourceType = (body?.sourceType ?? "paste").toString().trim();
  const fileName = (body?.fileName ?? "untitled").toString().trim();
  const rawText = (body?.rawText ?? "").toString();
  const parseNow = body?.parseNow !== false; // default true

  if (!gradeId) {
    return NextResponse.json({ error: "gradeId is required" }, { status: 400 });
  }
  if (!rawText.trim()) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }
  if (rawText.length < 50) {
    return NextResponse.json(
      { error: "rawText is too short — need at least 50 characters of content" },
      { status: 400 }
    );
  }

  // Resolve subject — either use the provided subjectId or create a new one
  let finalSubjectId = subjectId;
  if (!finalSubjectId) {
    if (!subjectName) {
      return NextResponse.json(
        { error: "Either subjectId or subjectName is required" },
        { status: 400 }
      );
    }
    try {
      // Try to find an existing subject with this name in this grade
      const existing = await db.curriculumSubject.findFirst({
        where: { gradeId, name: subjectName },
      });
      if (existing) {
        finalSubjectId = existing.id;
      } else {
        const newSubject = await db.curriculumSubject.create({
          data: {
            gradeId,
            name: subjectName,
            icon: subjectIcon,
            color: subjectColor,
          },
        });
        finalSubjectId = newSubject.id;
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: "Failed to create subject", detail: e?.message },
        { status: 500 }
      );
    }
  }

  // Create the source doc
  let sourceDoc;
  try {
    sourceDoc = await db.curriculumSourceDoc.create({
      data: {
        gradeId,
        subjectId: finalSubjectId,
        fileName,
        rawText,
        sourceType,
        parsingStatus: parseNow ? "pending" : "pending",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to create source doc", detail: e?.message },
      { status: 500 }
    );
  }

  // Optionally run the AI parser immediately
  if (parseNow) {
    try {
      const result = await processSourceDoc(sourceDoc.id);
      return NextResponse.json({
        ok: true,
        sourceDocId: sourceDoc.id,
        subjectId: finalSubjectId,
        parseResult: result,
      });
    } catch (e: any) {
      return NextResponse.json({
        ok: true,
        sourceDocId: sourceDoc.id,
        subjectId: finalSubjectId,
        parseError: e?.message ?? String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sourceDocId: sourceDoc.id,
    subjectId: finalSubjectId,
    parseResult: null,
  });
}
