import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI } from "@/lib/ai";
import { getTrack, getSubjectsForCourse } from "@/lib/education/catalog";
import { parseFormData, extractTextFromFile } from "@/lib/upload-helpers";
import { ingestCourseKnowledge } from "@/lib/tutor/rag";
import {
  createIngestionJob,
  startIngestionJob,
  completeIngestionJob,
  failIngestionJob,
} from "@/lib/tutor/ingestion-jobs";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/tutor/upload-outline
 * Accepts PDF/DOCX/TXT, extracts text, calls AI to summarize + extract topics,
 * saves as CourseKnowledge record.
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const parsed = await parseFormData(req, {
    maxFileSize: 4 * 1024 * 1024,
    allowedExts: ["pdf", "docx", "doc", "txt"],
  });
  if (parsed instanceof NextResponse) return parsed;
  const { file, fields } = parsed;

  const title = fields.title?.trim() || file.name.replace(/\.[^/.]+$/, "");
  const sourceType = fields.sourceType || "outline";

  // Determine the user's track + course + subject
  const track = (user as any).track || "k12";
  const grade = (user as any).grade || null;
  const course = (user as any).course || null;
  let subject = "General";
  if (track === "k12" || track === "secondary") {
    const subjects = (user as any).subjects;
    if (Array.isArray(subjects) && subjects.length > 0) subject = subjects[0];
  } else if (course) {
    const courseSubjects = getSubjectsForCourse(course);
    if (courseSubjects.length > 0) subject = courseSubjects[0];
  }

  // Phase 90 — use shared text extraction
  const rawText = await extractTextFromFile(file, { maxLength: 100_000 });
  if (!rawText.trim()) {
    return NextResponse.json({ error: "No text could be extracted from the file" }, { status: 400 });
  }

  // Call AI to summarize + extract structured topics
  const trackLabel = getTrack(track)?.label || track;
  const audience = course
    ? `a ${trackLabel} student studying "${course}"`
    : grade
      ? `a ${trackLabel} student in ${grade}`
      : `a ${trackLabel} student`;

  const aiPrompt = `You are analyzing a ${sourceType} uploaded by ${audience}.

Write a SUMMARY (2-3 paragraphs) + extract a STRUCTURED TOPIC LIST (array of objects with title, description, keyConcepts).

Subject: ${subject}
Track: ${trackLabel}${course ? `\nCourse: ${course}` : ""}${grade ? `\nGrade: ${grade}` : ""}

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
    const parsed = JSON.parse(replyText);
    summary = parsed.summary || "";
    topics = parsed.topics || null;
  } catch (e: any) {
    summary = `Uploaded ${sourceType} for ${trackLabel}${course ? " / " + course : ""}. Auto-summary failed: ${e?.message ?? "unknown"}.`;
  }

  const knowledge = await db.courseKnowledge.create({
    data: {
      track, gradeLevel: grade, course, subject, title, sourceType,
      sourceFileName: file.name, rawText, summary, topics,
      uploadedById: user.id, isVerified: false,
    },
  });

  // Phase 5 — Create an ingestion job for tracking + duplicate detection.
  // The job tracks the chunking + embedding process. The client can poll
  // /api/ingestion-jobs/[id] for progress.
  const ingestionJob = await createIngestionJob({
    userId: user.id,
    courseKnowledgeId: knowledge.id,
    content: rawText,
  });

  // If the job detected a duplicate (already completed), skip re-ingestion
  if (ingestionJob.status === "completed") {
    return NextResponse.json({
      knowledge: {
        id: knowledge.id, title: knowledge.title, track, gradeLevel: grade,
        course, subject, sourceType, summary, topics,
        rawTextLength: rawText.length,
        topicCount: Array.isArray(topics) ? topics.length : 0,
        chunkCount: ingestionJob.chunkCount,
      },
      ingestionJobId: ingestionJob.id,
      message: `✓ This document was already ingested (${ingestionJob.chunkCount} chunks). No re-processing needed.`,
    });
  }

  // Phase 5 — Process the ingestion with job tracking.
  // We still process inline (Vercel serverless has no true background workers),
  // but now the client can poll the job status + we have duplicate detection.
  let chunkCount = 0;
  await startIngestionJob(ingestionJob.id);
  try {
    chunkCount = await ingestCourseKnowledge(knowledge.id);
    await completeIngestionJob(ingestionJob.id, chunkCount);
  } catch (e: any) {
    console.error("[upload-outline] RAG ingestion failed (non-fatal):", e?.message ?? String(e));
    await failIngestionJob(ingestionJob.id, e?.message ?? String(e));
  }

  return NextResponse.json({
    knowledge: {
      id: knowledge.id, title: knowledge.title, track, gradeLevel: grade,
      course, subject, sourceType, summary, topics,
      rawTextLength: rawText.length,
      topicCount: Array.isArray(topics) ? topics.length : 0,
      chunkCount,  // Phase 93 — new field
    },
    ingestionJobId: ingestionJob.id,
    message: `✓ ${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)} parsed and saved!${chunkCount > 0 ? ` Embedded ${chunkCount} chunks for semantic search.` : ""} The AI tutor will now use this knowledge.`,
  });
}
