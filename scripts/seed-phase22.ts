/**
 * Phase 22 seed — creates the grade structure.
 *
 * - Grade 1 → status 'ready' (currently being built out)
 * - Grades 2-8 → status 'coming_soon' (greyed out in onboarding)
 * - Form 1-4 (secondary) → status 'coming_soon'
 *
 * Run with: bun run scripts/seed-phase22.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  console.log("[+] Phase 22 seed — creating curriculum grades...");

  const grades = [
    // Primary — Grade 1 is ready, the rest are coming soon
    { name: "Grade 1", level: "primary", orderIndex: 1, status: "ready", description: "Grade 1 — CBC curriculum. Available now." },
    { name: "Grade 2", level: "primary", orderIndex: 2, status: "coming_soon", description: "Coming soon — we'll email you when Grade 2 is ready." },
    { name: "Grade 3", level: "primary", orderIndex: 3, status: "coming_soon", description: "Coming soon — we'll email you when Grade 3 is ready." },
    { name: "Grade 4", level: "primary", orderIndex: 4, status: "coming_soon", description: "Coming soon — we'll email you when Grade 4 is ready." },
    { name: "Grade 5", level: "primary", orderIndex: 5, status: "coming_soon", description: "Coming soon — we'll email you when Grade 5 is ready." },
    { name: "Grade 6", level: "primary", orderIndex: 6, status: "coming_soon", description: "Coming soon — we'll email you when Grade 6 is ready." },
    // Secondary — all coming soon
    { name: "Form 1", level: "secondary", orderIndex: 7, status: "coming_soon", description: "Coming soon — we'll email you when Form 1 is ready." },
    { name: "Form 2", level: "secondary", orderIndex: 8, status: "coming_soon", description: "Coming soon — we'll email you when Form 2 is ready." },
    { name: "Form 3", level: "secondary", orderIndex: 9, status: "coming_soon", description: "Coming soon — we'll email you when Form 3 is ready." },
    { name: "Form 4", level: "secondary", orderIndex: 10, status: "coming_soon", description: "Coming soon — we'll email you when Form 4 is ready." },
  ];

  for (const g of grades) {
    const existing = await p.curriculumGrade.findUnique({ where: { name: g.name } });
    if (!existing) {
      await p.curriculumGrade.create({ data: g });
      console.log(`  ✓ ${g.name} (${g.status})`);
    } else {
      // Update status to match
      await p.curriculumGrade.update({
        where: { name: g.name },
        data: { status: g.status, description: g.description, level: g.level, orderIndex: g.orderIndex },
      });
      console.log(`  ↻ ${g.name} updated (${g.status})`);
    }
  }

  console.log("[+] Done.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
