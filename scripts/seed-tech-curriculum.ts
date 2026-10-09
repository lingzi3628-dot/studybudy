/**
 * Seed tech curriculum into CourseKnowledge DB.
 *
 * Usage: npx tsx scripts/seed-tech-curriculum.ts
 *
 * Creates CourseKnowledge rows for each tech course (AI/ML, Data Science,
 * Web Dev, DevOps) so the AI Tutor's RAG retrieval (Phase 93) can find
 * them when a tech-track student asks questions.
 *
 * Each row has:
 *   - track: "university" (higher-ed students)
 *   - course: the course name (e.g. "AI & Machine Learning")
 *   - subject: "Computer Science" (generic — matches most tech courses)
 *   - title: course name + " — Curriculum"
 *   - sourceType: "curriculum"
 *   - rawText: the full curriculum text (modules + lessons + key concepts)
 *   - summary: AI-generated overview
 *   - topics: structured JSON [{ title, description, keyConcepts }]
 *
 * This script is IDEMPOTENT — it checks for existing rows with the same
 * title before creating. Run it multiple times safely.
 */
import { db } from "../src/lib/db";
import {
  TECH_COURSES,
  buildTechCurriculumContext,
} from "../src/lib/tech-curriculum";

async function main() {
  console.log("Seeding tech curriculum into CourseKnowledge DB...\n");

  for (const course of TECH_COURSES) {
    const title = `${course.name} — Curriculum`;
    const courseName = course.name;

    // Check if already exists (idempotent)
    const existing = await db.courseKnowledge.findFirst({
      where: { title },
      select: { id: true },
    }).catch(() => null);

    if (existing) {
      console.log(`  ⏭️  "${title}" already exists — skipping`);
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

    try {
      await db.courseKnowledge.create({
        data: {
          track: "university",
          course: courseName,
          subject: "Computer Science",
          title,
          sourceType: "curriculum",
          rawText,
          summary,
          topics,
          isVerified: true,
        },
      });
      console.log(`  ✅ Created "${title}" (${course.modules.length} modules, ${lessonCount} lessons)`);
    } catch (err: any) {
      console.error(`  ❌ Failed to create "${title}": ${err?.message}`);
    }
  }

  console.log("\nDone! The AI Tutor's RAG retrieval will now find these courses.");
  console.log("Tech students (track=university, course containing AI/ML/ICT/CS/Data Science/Web Dev/DevOps)");
  console.log("will get curriculum-aware answers from the AI Tutor.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
