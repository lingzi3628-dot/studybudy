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
 *
 * Phase 22b: For large documents, the text is split into chunks and each
 * chunk is parsed separately. This avoids the AI hitting its output token
 * limit and producing truncated JSON.
 */
export async function parseCurriculumWithAI(
  rawText: string,
  context: { gradeName: string; subjectName: string }
): Promise<ParsedCurriculum> {
  // If the text is small enough, parse it in one shot
  if (rawText.length <= 6000) {
    return parseChunkWithAI(rawText, context);
  }

  // For large texts, split into chunks and parse each separately.
  // We split on double-newlines (paragraph breaks) and group into ~5000 char chunks.
  const chunks = splitIntoChunks(rawText, 5000);
  console.log(`[curriculum] Split ${rawText.length} chars into ${chunks.length} chunks`);

  const allTopics: ParsedTopic[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[curriculum] Parsing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
    try {
      const result = await parseChunkWithAI(chunks[i], context);
      allTopics.push(...result.topics);
    } catch (e: any) {
      console.error(`[curriculum] Chunk ${i + 1} failed:`, e?.message);
      // Continue with other chunks — partial results are better than none
    }
  }

  if (allTopics.length === 0) {
    throw new Error("AI could not parse any topics from the document. Try with a smaller document or check the content quality.");
  }

  // Deduplicate by topic name (case-insensitive) — keep the first occurrence
  const seen = new Set<string>();
  const deduped = allTopics.filter((t) => {
    const key = t.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { topics: deduped };
}

/**
 * Splits text into chunks of approximately `maxChars` characters,
 * preferring to break at paragraph boundaries (double newlines).
 */
function splitIntoChunks(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n\s*\n/); // split on blank lines
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > maxChars && current) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Parses a single chunk of text with the AI. Used by parseCurriculumWithAI
 * for both small (single-chunk) and large (multi-chunk) documents.
 */
async function parseChunkWithAI(
  rawText: string,
  context: { gradeName: string; subjectName: string }
): Promise<ParsedCurriculum> {
  const systemPrompt = `You are a curriculum architect for Kenyan CBC (Competency-Based Curriculum) schools.
You receive raw text extracted from a textbook or notes document, and your job
is to structure it into teachable curriculum topics.

CRITICAL RULES:
1. ONLY use content that appears in the raw text. Do NOT invent topics, facts,
   or questions that aren't grounded in the provided text.
2. The text may have OCR artifacts or weird formatting. Do your best to extract
   the meaningful educational content and ignore noise.
3. Each topic should be a distinct lesson/chapter.
4. For each topic:
   - Write a 1-2 sentence summary suitable for a student.
   - Write full lesson content in Markdown (## headings, **bold** key terms,
     numbered steps for activities).
   - Generate 3-5 flashcards (front: short question, back: concise answer).
   - Generate 3-5 multiple-choice quiz questions with 4 options each.
     The correctIndex is 0-based. Include a brief explanation.
5. Keep language simple and appropriate for the grade level.
6. If the text doesn't contain enough for a topic, skip it.

IMPORTANT — JSON FORMATTING:
- Return ONLY valid JSON. No markdown fences, no commentary before or after.
- All string values MUST be valid JSON strings — escape newlines as \\n,
  escape double quotes as \\", escape backslashes as \\\\.
- Do NOT include trailing commas.
- Do NOT include comments inside the JSON.

Return JSON in this exact shape:
{"topics":[{"name":"Topic Name","summary":"1-2 sentence summary","contentMarkdown":"## Heading\\n\\nLesson content","estimatedMin":10,"flashcards":[{"front":"What is...?","back":"It is..."}],"quizQuestions":[{"questionText":"Which...?","options":["A","B","C","D"],"correctIndex":0,"explanation":"Because...","difficulty":"easy"}]}]}`;

  const userPrompt = `GRADE: ${context.gradeName}
SUBJECT: ${context.subjectName}

RAW DOCUMENT TEXT:
"""
${rawText.slice(0, 6000)}
"""

Parse this into structured curriculum topics. Return ONLY valid JSON.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const reply = await callAI(messages, null, {
    userId: "system",
    route: "/lib/curriculum/parse",
  });

  const parsed = parseAIJsonResponse(reply);

  if (!parsed.topics || !Array.isArray(parsed.topics)) {
    throw new Error("AI response missing topics array");
  }

  return parsed as ParsedCurriculum;
}

/**
 * Robustly parses the AI's JSON response. Handles common issues:
 *   - Markdown code fences (```json ... ```)
 *   - Leading/trailing commentary
 *   - Truncated JSON (tries to salvage what's valid)
 *   - Unescaped newlines in string values
 *   - Trailing commas
 */
function parseAIJsonResponse(reply: string): any {
  let cleaned = reply.trim();

  // Strip markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }

  // Find the first { and last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("AI did not return any JSON object");
  }
  let jsonStr = cleaned.slice(firstBrace, lastBrace + 1);

  // Attempt 1: direct parse
  try {
    return JSON.parse(jsonStr);
  } catch (e1: any) {
    console.warn("[curriculum] Direct JSON.parse failed:", e1?.message);
  }

  // Attempt 2: fix trailing commas (common AI mistake)
  try {
    const fixed = jsonStr.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(fixed);
  } catch (e2: any) {
    console.warn("[curriculum] Trailing-comma fix failed:", e2?.message);
  }

  // Attempt 3: fix unescaped newlines inside string values
  // This is tricky — we need to find string values and escape literal newlines
  try {
    const fixed = fixUnescapedNewlines(jsonStr);
    return JSON.parse(fixed);
  } catch (e3: any) {
    console.warn("[curriculum] Newline fix failed:", e3?.message);
  }

  // Attempt 4: salvage — try to parse up to the last complete topic object
  // by finding the last valid closing bracket of a topic
  try {
    const salvaged = salvageJson(jsonStr);
    if (salvaged) return salvaged;
  } catch (e4: any) {
    console.warn("[curriculum] Salvage failed:", e4?.message);
  }

  throw new Error(
    `Could not parse AI JSON response. First 200 chars: ${jsonStr.slice(0, 200)}...`
  );
}

/**
 * Tries to fix unescaped newlines inside JSON string values.
 * Walks the string character by character, tracking whether we're inside a
 * string, and escapes literal newlines/tabs as \n / \t.
 */
function fixUnescapedNewlines(jsonStr: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      if (ch === "\n") {
        result += "\\n";
        continue;
      }
      if (ch === "\r") {
        result += "\\r";
        continue;
      }
      if (ch === "\t") {
        result += "\\t";
        continue;
      }
    }

    result += ch;
  }

  return result;
}

/**
 * Salvages a truncated JSON by finding the last complete topic object
 * and closing the array + object.
 */
function salvageJson(jsonStr: string): any | null {
  // Find all occurrences of `}` that close a topic object.
  // We look for `}` followed by optional whitespace and either `,` or `]`.
  // The last such occurrence before the truncation point gives us a valid
  // prefix to close.
  const topicEndRegex = /\}\s*(?=[,\]])/g;
  let lastValidEnd = -1;
  let match;
  while ((match = topicEndRegex.exec(jsonStr)) !== null) {
    lastValidEnd = match.index + 1; // position after the `}`
  }

  if (lastValidEnd === -1) return null;

  // Find the position of the `}` that closes the topics array.
  // We need to find where `"topics":[` starts, then close it.
  const topicsStart = jsonStr.indexOf('"topics"');
  if (topicsStart === -1) return null;

  const arrayStart = jsonStr.indexOf("[", topicsStart);
  if (arrayStart === -1) return null;

  // Take everything up to the last valid topic end, then close the array + object
  const prefix = jsonStr.slice(0, lastValidEnd);
  const salvaged = prefix + "]}";

  try {
    return JSON.parse(salvaged);
  } catch {
    return null;
  }
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
