import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI } from "@/lib/ai";
import { getTrack, getSubjectsForCourse } from "@/lib/education/catalog";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 min for AI parsing
export const dynamic = "force-dynamic";

/**
 * POST /api/tutor/upload-outline
 *
 * Accepts multipart/form-data with:
 *   file: PDF / DOCX / TXT (≤ 10 MB)
 *   title?: override (defaults to filename)
 *   sourceType?: 'outline' | 'syllabus' | 'notes' | 'textbook' (default 'outline')
 *
 * The user's track + grade + course (from their profile) is used as the
 * knowledge target — so this knowledge will be served to the same user
 * (and any future user on the same track+grade+course) when they ask
 * the AI tutor questions.
 *
 * Pipeline:
 *   1. Extract text from PDF (pdf-parse) / DOCX (mammoth) / TXT (utf-8)
 *   2. Call AI to summarize + extract a structured topic list
 *   3. Save as CourseKnowledge record in DB
 *
 * Returns: { knowledge }
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  const title = (form.get("title") as string | null)?.toString().trim() || file.name.replace(/\.[^/.]+$/, "");
  const sourceType = (form.get("sourceType") as string | null)?.toString().trim() || "outline";

  // Determine the user's track + grade + course + subject
  const track = (user as any).track || "k12";
  const grade = (user as any).grade || null;
  const course = (user as any).course || null;
  // For K-12/secondary: use the user's subjects list (first one as default)
  // For university/college/tvet: derive from course
  let subject = "General";
  if (track === "k12" || track === "secondary") {
    const subjects = (user as any).subjects;
    if (Array.isArray(subjects) && subjects.length > 0) subject = subjects[0];
  } else if (course) {
    const courseSubjects = getSubjectsForCourse(course);
    if (courseSubjects.length > 0) subject = courseSubjects[0];
  }

  // Extract text from the file
  const buffer = Buffer.from(await file.arrayBuffer());
  let rawText = "";
  try {
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (ext === "pdf") {
      const { extractPdfText } = await import("@/lib/pdf");
      rawText = await extractPdfText(buffer);
    } else if (ext === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value || "";
    } else if (ext === "doc") {
      // Try mammoth first (works for some .doc), fall back to utf-8
      try {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value || "";
      } catch {
        rawText = buffer.toString("utf-8");
      }
    } else {
      // txt, md, etc.
      rawText = buffer.toString("utf-8");
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to extract text: ${e?.message ?? "unknown"}` }, { status: 500 });
  }

  if (!rawText.trim()) {
    return NextResponse.json({ error: "No text could be extracted from the file" }, { status: 400 });
  }
  // Cap raw text length for storage
  const MAX_TEXT = 100_000; // ~100k chars
  if (rawText.length > MAX_TEXT) rawText = rawText.slice(0, MAX_TEXT);

  // Call AI to summarize + extract structured topics
  const trackLabel = getTrack(track)?.label || track;
  const audience = course
    ? `a ${trackLabel} student studying "${course}"`
    : grade
      ? `a ${trackLabel} student in ${grade}`
      : `a ${trackLabel} student`;

  const aiPrompt = `You are analyzing a ${sourceType} uploaded by ${audience}.

Below is the extracted text from the document. Your job:
1. Write a concise SUMMARY (2-3 paragraphs) of what this document covers.
2. Extract a STRUCTURED TOPIC LIST — array of objects with:
   - title: short topic name (e.g. "Financial Accounting Basics")
   - description: 1-2 sentence overview
   - keyConcepts: array of 3-5 key concepts/terms (strings)

The subject area is: ${subject}
The track is: ${trackLabel}${course ? `\nThe course is: ${course}` : ""}${grade ? `\nThe grade is: ${grade}` : ""}

Respond in valid JSON only (no markdown, no commentary):
{
  "summary": "<2-3 paragraph summary>",
  "topics": [
    { "title": "...", "description": "...", "keyConcepts": ["...", "..."] }
  ]
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
    // Strip code fences if present
    replyText = replyText.replace(/^```(json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(replyText);
    summary = parsed.summary || "";
    topics = parsed.topics || null;
  } catch (e: any) {
    // AI parsing failed — still save with a fallback summary
    summary = `Uploaded ${sourceType} for ${trackLabel}${course ? " / " + course : ""}${grade ? " / " + grade : ""}. Auto-summary failed: ${e?.message ?? "unknown error"}. The raw text is available for the AI tutor to use directly.`;
  }

  // Save to DB
  const knowledge = await db.courseKnowledge.create({
    data: {
      track,
      gradeLevel: grade,
      course,
      subject,
      title,
      sourceType,
      sourceFileName: file.name,
      rawText,
      summary,
      topics,
      uploadedById: user.id,
      isVerified: false,
    },
  });

  return NextResponse.json({
    knowledge: {
      id: knowledge.id,
      title: knowledge.title,
      track: knowledge.track,
      gradeLevel: knowledge.gradeLevel,
      course: knowledge.course,
      subject: knowledge.subject,
      sourceType: knowledge.sourceType,
      summary: knowledge.summary,
      topics: knowledge.topics,
      rawTextLength: rawText.length,
      topicCount: Array.isArray(topics) ? topics.length : 0,
    },
    message: `✓ ${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)} parsed and saved! The AI tutor will now use this knowledge when answering your questions.`,
  });
}
