/**
 * Phase 93 — Backfill script for existing CourseKnowledge rows.
 *
 * Walks all CourseKnowledge rows, finds those without chunks (or with chunks
 * that have null embeddings), and ingests them via ingestCourseKnowledge().
 *
 * Run:
 *   node --experimental-vm-modules -e "require('./scripts/phase93-backfill.js').run()"
 *   OR (easier, from repo root):
 *   npx tsx scripts/phase93-backfill.ts
 *
 * Safety:
 *   - Skips rows that already have chunks WITH embeddings (idempotent)
 *   - Processes one row at a time (memory safety — TF.js USE loads ~25MB)
 *   - Prints progress every 10 rows
 *   - Exits 0 even on partial failure (so it can be re-run for the failed rows)
 */
import { PrismaClient } from "@prisma/client";
import { ingestCourseKnowledge } from "../src/lib/tutor/rag";

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("[phase93-backfill] Finding CourseKnowledge rows that need embedding...");

    // Find rows that have NO chunks, OR chunks with null embeddings
    const allKnowledge = await prisma.courseKnowledge.findMany({
      select: {
        id: true,
        title: true,
        track: true,
        course: true,
        rawText: true,
        chunks: {
          select: { id: true, embedding: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const needsEmbedding = allKnowledge.filter((k) => {
      if (k.chunks.length === 0) return true;  // no chunks at all
      // Has chunks but none have embeddings
      return !k.chunks.some((c) => c.embedding !== null);
    });

    console.log(`[phase93-backfill] Found ${allKnowledge.length} total rows; ${needsEmbedding.length} need embedding.`);

    if (needsEmbedding.length === 0) {
      console.log("[phase93-backfill] Nothing to do. All rows already have chunks with embeddings.");
      return;
    }

    let success = 0;
    let failed = 0;
    let i = 0;
    for (const k of needsEmbedding) {
      i++;
      try {
        console.log(`[${i}/${needsEmbedding.length}] Embedding: "${k.title}" (track=${k.track}, course=${k.course ?? "null"})`);
        const chunkCount = await ingestCourseKnowledge(k.id);
        if (chunkCount > 0) {
          success++;
          console.log(`  → stored ${chunkCount} chunks`);
        } else {
          failed++;
          console.log(`  → 0 chunks (ingestion returned 0 — may be empty text)`);
        }
      } catch (err: any) {
        failed++;
        console.error(`  → FAILED: ${err?.message ?? String(err)}`);
      }

      if (i % 10 === 0) {
        console.log(`[phase93-backfill] Progress: ${i}/${needsEmbedding.length} (success=${success}, failed=${failed})`);
      }
    }

    console.log(`\n[phase93-backfill] Done. Processed ${needsEmbedding.length} rows.`);
    console.log(`  Success: ${success}`);
    console.log(`  Failed:  ${failed}`);
    if (failed > 0) {
      console.log(`  Re-run this script to retry failed rows.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[phase93-backfill] FATAL:", err);
  process.exit(1);
});
