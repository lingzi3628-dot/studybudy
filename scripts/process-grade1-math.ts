/**
 * Phase 22 — Process the uploaded Grade 1 Mathematics notes through
 * the curriculum engine.
 *
 * Reads /home/z/my-project/upload/GRADE 1 MATHEMATICS NOTES.doc
 * Extracts text via antiword (or falls back to libreoffice)
 * Saves as a CurriculumSourceDoc
 * Runs the AI parser to generate topics + flashcards + quiz questions
 *
 * Run with: bun run scripts/process-grade1-math.ts
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { processSourceDoc } from "../src/lib/curriculum";

const p = new PrismaClient();

const DOC_PATH = "/home/z/my-project/upload/GRADE 1 MATHEMATICS NOTES.doc";
const TXT_PATH = "/tmp/grade1-math.txt";

async function main() {
  console.log("[+] Phase 22 — processing Grade 1 Mathematics notes...");

  // 1. Extract text from the .doc file
  if (!existsSync(DOC_PATH)) {
    console.error(`✗ Source file not found: ${DOC_PATH}`);
    process.exit(1);
  }

  let rawText = "";
  try {
    console.log("[+] Extracting text via antiword...");
    execSync(`antiword "${DOC_PATH}" > ${TXT_PATH} 2>&1`);
    rawText = readFileSync(TXT_PATH, "utf-8");
  } catch {
    console.log("[!] antiword failed, trying libreoffice...");
    try {
      execSync(
        `libreoffice --headless --convert-to txt "${DOC_PATH}" --outdir /tmp 2>&1`
      );
      const txtPath = "/tmp/GRADE 1 MATHEMATICS NOTES.txt";
      rawText = readFileSync(txtPath, "utf-8");
    } catch (e) {
      console.error("✗ Could not extract text from .doc file");
      console.error(e);
      process.exit(1);
    }
  }

  if (!rawText.trim() || rawText.length < 50) {
    console.error("✗ Extracted text is empty or too short");
    process.exit(1);
  }

  console.log(`[+] Extracted ${rawText.length} chars of text`);

  // 2. Find the Grade 1 grade row
  const grade1 = await p.curriculumGrade.findUnique({ where: { name: "Grade 1" } });
  if (!grade1) {
    console.error("✗ Grade 1 not found in DB. Run scripts/seed-phase22.ts first.");
    process.exit(1);
  }

  // 3. Find or create the Mathematics subject for Grade 1
  let subject = await p.curriculumSubject.findFirst({
    where: { gradeId: grade1.id, name: "Mathematics" },
  });
  if (!subject) {
    subject = await p.curriculumSubject.create({
      data: {
        gradeId: grade1.id,
        name: "Mathematics",
        icon: "🔢",
        color: "#6366F1",
        orderIndex: 1,
      },
    });
    console.log(`[+] Created subject: Mathematics`);
  } else {
    console.log(`[+] Found existing subject: Mathematics`);
  }

  // 4. Check if we already have a source doc for this — if so, skip
  const existing = await p.curriculumSourceDoc.findFirst({
    where: { gradeId: grade1.id, subjectId: subject.id, fileName: "GRADE 1 MATHEMATICS NOTES.doc" },
  });
  if (existing) {
    console.log(`[!] Source doc already exists (id=${existing.id})`);
    console.log(`    To re-process, delete it first: p.curriculumSourceDoc.delete({where:{id:"${existing.id}"}})`);
    console.log(`    Skipping. To force re-parse, run:`);
    console.log(`    bun run -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.curriculumSourceDoc.delete({where:{id:'${existing.id}'}}).then(()=>process.exit(0))"`);
    process.exit(0);
  }

  // 5. Create the source doc
  const sourceDoc = await p.curriculumSourceDoc.create({
    data: {
      gradeId: grade1.id,
      subjectId: subject.id,
      fileName: "GRADE 1 MATHEMATICS NOTES.doc",
      rawText,
      sourceType: "doc",
      parsingStatus: "pending",
    },
  });
  console.log(`[+] Created source doc: ${sourceDoc.id}`);

  // 6. Run the AI parser
  console.log("[+] Running AI parser (this may take 30-60 seconds)...");
  try {
    const result = await processSourceDoc(sourceDoc.id);
    console.log(`[+] ✅ Parsed successfully:`);
    console.log(`    Topics:         ${result.topicCount}`);
    console.log(`    Flashcards:     ${result.flashcardCount}`);
    console.log(`    Quiz questions: ${result.quizQuestionCount}`);
  } catch (e: any) {
    console.error(`✗ AI parsing failed: ${e?.message ?? e}`);
    console.error(`    The source doc is saved with status='failed'. You can re-run this script or use the admin UI to re-parse.`);
    process.exit(2);
  }

  console.log("[+] Done.");
}

main()
  .catch((e) => {
    console.error("Process failed:", e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
