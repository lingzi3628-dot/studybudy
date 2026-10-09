import { NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import {
  TECH_COURSES,
  buildTechCurriculumContext,
} from "@/lib/tech-curriculum";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/admin/seed-tech-curriculum
 *
 * Seeds the tech curriculum (AI/ML, Data Science, Web Dev, DevOps) into
 * the CourseKnowledge table so the AI Tutor's RAG retrieval can find them.
 *
 * Idempotent — skips rows that already exist (matched by title).
 *
 * After seeding, tech-track students (track=university, course containing
 * AI/ML/ICT/CS/Data Science/Web Dev/DevOps) will get curriculum-aware
 * answers from the AI Tutor.
 */
export async function POST() {
  const admin = await requireAdminJwt();

  const results: { course: string; status: "created" | "exists" | "error"; error?: string }[] = [];

  for (const course of TECH_COURSES) {
    const title = `${course.name} — Curriculum`;

    try {
      // Check if already exists (idempotent)
      const existing = await db.courseKnowledge.findFirst({
        where: { title },
        select: { id: true },
      });

      if (existing) {
        results.push({ course: course.name, status: "exists" });
        continue;
      }

      // Build the raw text (full curriculum as readable text)
      const rawText = buildTechCurriculumContext(course.id);

      // Build structured topics array
      const topics = course.modules.map((mod) => ({
        title: mod.name,
        description: mod.description,
        keyConcepts: mod.lessons.flatMap((l) => l.keyConcepts),
      }));

      // Build summary
      const lessonCount = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
      const summary = `${course.name}: ${course.modules.length} modules, ${lessonCount} lessons. ${course.description} Covers: ${course.modules.map((m) => m.name).join(", ")}.`;

      await db.courseKnowledge.create({
        data: {
          track: "university",
          course: course.name,
          subject: "Computer Science",
          title,
          sourceType: "curriculum",
          rawText,
          summary,
          topics,
          isVerified: true,
        },
      });

      results.push({ course: course.name, status: "created" });
    } catch (err: any) {
      results.push({ course: course.name, status: "error", error: err?.message });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const exists = results.filter((r) => r.status === "exists").length;
  const errors = results.filter((r) => r.status === "error").length;

  await logAdminActionViaJwt(admin, "seed_tech_curriculum", { created, exists, errors });

  return NextResponse.json({
    ok: true,
    summary: `${created} created, ${exists} already existed, ${errors} errors`,
    results,
  });
}
