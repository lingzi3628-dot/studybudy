/**
 * Curriculum Engine — Phase 22
 *
 * Parses raw document text (from PDF/DOC/paste) into structured curriculum
 * content: topics, flashcards, and quiz questions.
 *
 * The AI is given the raw text + a strict JSON schema instruction, and is
 * told to ONLY use the content in the text — no hallucination, no outside
 * knowledge. If the text doesn't cover something, the AI leaves it out.
 */
import { db } from "./db";
import { callAI, type ChatMessage } from "./ai";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type ParsedTopic = {
  name: string;
  summary: string;
  contentMarkdown: string;
  estimatedMin: number;
  flashcards: Array<{ front: string; back: string }>;
  quizQuestions: Array<{
    questionText: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    difficulty: "easy" | "medium" | "hard";
  }>;
};

export type ParsedCurriculum = {
  topics: ParsedTopic[];
};

// ---------------------------------------------------------------------
// AI parser
// ---------------------------------------------------------------------

/**
 * Calls the AI to parse raw document text into a structured curriculum.
 *
 * The AI is instructed to:
 *   1. Identify distinct topics/chapters in the text
 *   2. For each topic, write a 1-2 sentence summary + full markdown lesson
 *   3. Generate 3-5 flashcards per topic (front: question, back: answer)
 *   4. Generate 3-5 quiz questions per topic (4 options each, with explanations)
 *
 * STRICT RULE: only use content from the provided text. No hallucination.
 */
export async function parseCurriculumWithAI(
  rawText: string,
  context: { gradeName: string; subjectName: string }
): Promise<ParsedCurriculum> {
  const systemPrompt = `You are a curriculum architect for Kenyan CBC (Competency-Based Curriculum) schools.
You receive raw text extracted from a textbook or notes document, and your job
is to structure it into a teachable curriculum.

CRITICAL RULES:
1. ONLY use content that appears in the raw text. Do NOT invent topics, facts,
   or questions that aren't grounded in the provided text. If the text doesn't
   cover something, leave it out — better fewer topics than fabricated ones.
2. The text may have OCR artifacts or weird formatting. Do your best to extract
   the meaningful educational content and ignore noise.
3. Each topic should be a distinct lesson/chapter. Order them logically
   (simplest first, building up).
4. For each topic:
   - Write a 1-2 sentence summary suitable for a student.
   - Write full lesson content in Markdown (use ## headings, **bold** key terms,
     numbered steps for activities, etc.).
   - Generate 3-5 flashcards (front: short question/prompt, back: concise answer).
   - Generate 3-5 multiple-choice quiz questions with 4 options each.
     The correctIndex is 0-based. Include a brief explanation for each.
5. Keep language simple and appropriate for the grade level.
6. If the text is very short or doesn't contain enough for a topic, skip it.

Return ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{
  "topics": [
    {
      "name": "Topic Name",
      "summary": "1-2 sentence summary",
      "contentMarkdown": "## Heading\\n\\nLesson content in markdown...",
      "estimatedMin": 10,
      "flashcards": [
        {"front": "What is...?", "back": "It is..."}
      ],
      "quizQuestions": [
        {
          "questionText": "Which of the following...?",
          "options": ["A", "B", "C", "D"],
          "correctIndex": 0,
          "explanation": "Because...",
          "difficulty": "easy"
        }
      ]
    }
  ]
}`;

  const userPrompt = `GRADE: ${context.gradeName}
SUBJECT: ${context.subjectName}

RAW DOCUMENT TEXT (extracted from uploaded file):
"""
${rawText.slice(0, 12000)}
"""

Parse this into a structured curriculum. Return ONLY JSON.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // Use the admin's AI key if available — but for curriculum parsing we
  // don't have a user context, so we fall back to the platform AI.
  const reply = await callAI(messages, null, {
    userId: "system",
    route: "/lib/curriculum/parse",
  });

  // Strip markdown code fences if present
  let cleaned = reply.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }

  // Find the first { and last } to extract JSON
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("AI did not return valid JSON");
  }
  const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);

  const parsed = JSON.parse(jsonStr) as ParsedCurriculum;

  if (!parsed.topics || !Array.isArray(parsed.topics)) {
    throw new Error("AI response missing topics array");
  }

  return parsed;
}

// ---------------------------------------------------------------------
// DB writer — persists parsed curriculum to the DB
// ---------------------------------------------------------------------

/**
 * Persists a ParsedCurriculum to the database, creating topics, flashcards,
 * and quiz questions under the given subject.
 *
 * If topics already exist for this subject, they are NOT deleted — new ones
 * are appended. (Admin can manually delete old ones via the UI.)
 */
export async function persistParsedCurriculum(
  subjectId: string,
  parsed: ParsedCurriculum
): Promise<{
  topicCount: number;
  flashcardCount: number;
  quizQuestionCount: number;
}> {
  let flashcardCount = 0;
  let quizQuestionCount = 0;

  // Find the current max orderIndex so we append after existing topics
  const existingMaxOrder = await db.curriculumTopic.findFirst({
    where: { subjectId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  }).catch(() => null);
  let nextOrder = (existingMaxOrder?.orderIndex ?? -1) + 1;

  for (const topic of parsed.topics) {
    if (!topic.name || !topic.contentMarkdown) continue;

    const slug = topic.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    const topicRow = await db.curriculumTopic.create({
      data: {
        subjectId,
        name: topic.name,
        slug,
        summary: topic.summary ?? null,
        contentMarkdown: topic.contentMarkdown,
        estimatedMin: topic.estimatedMin ?? 10,
        orderIndex: nextOrder++,
      },
    });

    // Flashcards
    if (Array.isArray(topic.flashcards)) {
      for (let i = 0; i < topic.flashcards.length; i++) {
        const fc = topic.flashcards[i];
        if (!fc.front || !fc.back) continue;
        await db.curriculumFlashcard.create({
          data: {
            topicId: topicRow.id,
            front: fc.front,
            back: fc.back,
            orderIndex: i,
          },
        });
        flashcardCount++;
      }
    }

    // Quiz questions
    if (Array.isArray(topic.quizQuestions)) {
      for (let i = 0; i < topic.quizQuestions.length; i++) {
        const q = topic.quizQuestions[i];
        if (!q.questionText || !Array.isArray(q.options) || q.options.length < 2) continue;
        await db.curriculumQuizQuestion.create({
          data: {
            topicId: topicRow.id,
            questionText: q.questionText,
            options: q.options,
            correctIndex: Math.max(0, Math.min(q.options.length - 1, q.correctIndex ?? 0)),
            explanation: q.explanation ?? null,
            difficulty: ["easy", "medium", "hard"].includes(q.difficulty)
              ? q.difficulty
              : "easy",
            orderIndex: i,
          },
        });
        quizQuestionCount++;
      }
    }
  }

  return {
    topicCount: parsed.topics.length,
    flashcardCount,
    quizQuestionCount,
  };
}

// ---------------------------------------------------------------------
// Public: full pipeline — parse + persist
// ---------------------------------------------------------------------

/**
 * Full pipeline: takes a source doc ID, runs the AI parser, persists the
 * results, and updates the source doc's parsingStatus.
 *
 * Used by /api/admin/curriculum/upload and by the seed script.
 */
export async function processSourceDoc(sourceDocId: string): Promise<{
  topicCount: number;
  flashcardCount: number;
  quizQuestionCount: number;
}> {
  const sourceDoc = await db.curriculumSourceDoc.findUnique({
    where: { id: sourceDocId },
    include: {
      grade: true,
      subject: true,
    },
  });

  if (!sourceDoc) throw new Error("Source doc not found");
  if (!sourceDoc.subject) throw new Error("Source doc has no subject");

  // Mark as processing
  await db.curriculumSourceDoc.update({
    where: { id: sourceDocId },
    data: { parsingStatus: "processing", parseError: null },
  });

  try {
    const parsed = await parseCurriculumWithAI(sourceDoc.rawText, {
      gradeName: sourceDoc.grade.name,
      subjectName: sourceDoc.subject.name,
    });

    const result = await persistParsedCurriculum(sourceDoc.subject.id, parsed);

    await db.curriculumSourceDoc.update({
      where: { id: sourceDocId },
      data: {
        parsingStatus: "completed",
        parseError: null,
      },
    });

    return result;
  } catch (e: any) {
    await db.curriculumSourceDoc.update({
      where: { id: sourceDocId },
      data: {
        parsingStatus: "failed",
        parseError: (e?.message ?? String(e)).slice(0, 500),
      },
    });
    throw e;
  }
}
