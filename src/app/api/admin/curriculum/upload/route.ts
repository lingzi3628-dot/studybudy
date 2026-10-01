import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { callAI } from "@/lib/ai";
import { getTrack, getSubjectsForCourse } from "@/lib/education/catalog";
import { parseFormData, extractTextFromFile } from "@/lib/upload-helpers";
import { ingestCourseKnowledge } from "@/lib/tutor/rag";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/curriculum/upload
 *
 * Admin-only curriculum PDF/DOCX upload. Extends the user-facing
 * /api/tutor/upload-outline with three key differences:
 *
 *   1. ADMIN-ONLY — requires the admin JWT cookie (not user auth).
 *   2. EXPLICIT TARGETING — admin specifies track + grade + course + subject
 *      in form fields, instead of inheriting from the uploader's profile.
 *      This means an admin can upload a Grade 4 Mathematics curriculum PDF
 *      even if the admin's own profile is set to university/CS.
 *   3. AUTO-VERIFIED — admin uploads are marked `isVerified: true` so they
 *      are immediately trusted by the RAG retrieval pipeline. User uploads
 *      remain `isVerified: false` until an admin reviews them.
 *
 * Use case: Admins obtain official KICD curriculum design PDFs through
 * official channels (KICD distribution, print-to-PDF from the preview,
 * partner agreements) and upload them here. ALL students on the matching
 * track + grade/course benefit immediately — the Phase 93 RAG pipeline
 * chunks + embeds the content on upload.
 *
 * Body (multipart/form-data):
 *   - file: PDF/DOCX/TXT (max 4MB)
 *   - title: display title (e.g. "Grade 4 Mathematics Curriculum Design")
 *   - track: k12 | secondary | university | college | tvet
 *   - gradeLevel: (optional, for k12/secondary — e.g. "Grade 4", "Form 3")
 *   - course: (optional, for university/college/tvet — e.g. "Bachelor of Laws (LLB)")
 *   - subject: e.g. "Mathematics", "English", "Contract Law"
 *   - sourceType: outline | syllabus | notes | textbook | past_paper | marking_scheme | other
 */
export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdminJwt();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin authentication required" },
      { status: 401 },
    );
  }

  const parsed = await parseFormData(req, {
    maxFileSize: 4 * 1024 * 1024,
    allowedExts: ["pdf", "docx", "doc", "txt"],
  });
  if (parsed instanceof NextResponse) return parsed;
  const { file, fields } = parsed;

  // Validate required targeting fields
  const track = (fields.track || "k12").trim();
  const validTracks = ["k12", "secondary", "university", "college", "tvet"];
  if (!validTracks.includes(track)) {
    return NextResponse.json(
      { error: `Invalid track "${track}". Must be one of: ${validTracks.join(", ")}` },
      { status: 400 },
    );
  }

  const gradeLevel = (fields.gradeLevel || "").trim() || null;
  const course = (fields.course || "").trim() || null;
  const subject = (fields.subject || "General").trim();

  // Validate: university/college/tvet must have a course; k12/secondary must have a gradeLevel
  const isHigherEd = ["university", "college", "tvet"].includes(track);
  if (isHigherEd && !course) {
    return NextResponse.json(
      { error: `Course is required for track "${track}"` },
      { status: 400 },
    );
  }
  if (!isHigherEd && !gradeLevel) {
    return NextResponse.json(
      { error: `Grade level is required for track "${track}"` },
      { status: 400 },
    );
  }

  const title = (fields.title || file.name.replace(/\.[^/.]+$/, "")).trim();
  const sourceType = (fields.sourceType || "outline").trim();

  // Extract text from the uploaded file (uses the shared helper — handles PDF/DOCX/TXT)
  const rawText = await extractTextFromFile(file, { maxLength: 100_000 });
  if (!rawText.trim()) {
    return NextResponse.json(
      { error: "No text could be extracted from the file. If it's a scanned PDF, it may need OCR first." },
      { status: 400 },
    );
  }

  // Call AI to summarize + extract structured topics (same prompt as /api/tutor/upload-outline)
  const trackLabel = getTrack(track)?.label || track;
  const audience = course
    ? `a ${trackLabel} student studying "${course}"`
    : gradeLevel
      ? `a ${trackLabel} student in ${gradeLevel}`
      : `a ${trackLabel} student`;

  const aiPrompt = `You are analyzing a ${sourceType} uploaded by ${audience}.

Write a SUMMARY (2-3 paragraphs) + extract a STRUCTURED TOPIC LIST (array of objects with title, description, keyConcepts).

Subject: ${subject}
Track: ${trackLabel}${course ? `\nCourse: ${course}` : ""}${gradeLevel ? `\nGrade: ${gradeLevel}` : ""}

Respond in valid JSON only:
{
  "summary": "<2-3 paragraph summary>",
  "topics": [{ "title": "...", "description": "...", "keyConcepts": ["...", "..."] }]
}

DOCUMENT TEXT:
${rawText.slice(0, 30_000)}`;

  let summary = "";
  let topics: any = null;
  try {
    const aiReply = await callAI([
      { role: "system", content: "You are an educational content analyzer. Respond only with valid JSON." },
      { role: "user", content: aiPrompt },
    ]);
    let replyText = aiReply || "";
    replyText = replyText.replace(/^```(json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsedAi = JSON.parse(replyText);
    summary = parsedAi.summary || "";
    topics = parsedAi.topics || null;
  } catch (e: any) {
    summary = `Uploaded ${sourceType} for ${trackLabel}${course ? " / " + course : ""}${gradeLevel ? " / " + gradeLevel : ""}. Auto-summary failed: ${e?.message ?? "unknown"}.`;
  }

  // Persist as a CourseKnowledge row — AUTO-VERIFIED (admin uploads are trusted)
  const knowledge = await db.courseKnowledge.create({
    data: {
      track,
      gradeLevel,
      course,
      subject,
      title,
      sourceType,
      sourceFileName: file.name,
      rawText,
      summary,
      topics,
      uploadedById: admin.id,
      isVerified: true,  // KEY DIFFERENCE from user uploads — admin uploads are immediately trusted
    },
  });

  // Phase 93 — chunk + embed the rawText for semantic RAG retrieval
  let chunkCount = 0;
  try {
    chunkCount = await ingestCourseKnowledge(knowledge.id);
  } catch (e: any) {
    console.error("[admin/curriculum/upload] RAG ingestion failed (non-fatal):", e?.message ?? String(e));
  }

  // Log the admin action (audit trail)
  await logAdminActionViaJwt(
    admin,
    "curriculum_upload",
    {
      title,
      sourceType,
      track,
      gradeLevel,
      course,
      subject,
      chunkCount,
      message: `Uploaded "${title}" (${sourceType}) for ${track}${gradeLevel ? "/" + gradeLevel : ""}${course ? "/" + course : ""} — ${chunkCount} chunks embedded`,
    },
  );

  return NextResponse.json({
    ok: true,
    knowledge: {
      id: knowledge.id,
      title: knowledge.title,
      track,
      gradeLevel,
      course,
      subject,
      sourceType,
      isVerified: true,
      summary,
      topics,
      rawTextLength: rawText.length,
      topicCount: Array.isArray(topics) ? topics.length : 0,
      chunkCount,
    },
    message: `✓ ${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)} uploaded and auto-verified!${chunkCount > 0 ? ` Embedded ${chunkCount} chunks for semantic search.` : ""} All ${track} students${gradeLevel ? " in " + gradeLevel : ""}${course ? " studying " + course : ""} will now benefit from this knowledge.`,
  });
}
