/**
 * Tutor Context Builder — Phase 91
 *
 * Extracted from src/lib/tutor-chat-engine.ts (originally ~220 lines, lines
 * 247–664) so that future phases (92: learner-state injection, 93: semantic
 * RAG, 95: lesson controller) can target a small, well-tested module instead
 * of the 1,138-line tutor-chat-engine.ts.
 *
 * PIPELINE POSITION (in the tutor chat flow):
 *   detectIntents() → runWebSearch() → [THIS MODULE] → AI call → splitThinking → postProcessReply
 *
 * WHAT THIS MODULE DOES:
 *   - Assembles the system prompt for the AI Tutor
 *   - Loads the teaching profile (grade-aware language/vocabulary)
 *   - Loads KICD CBC curriculum grounding (K-12 + secondary only — higher-ed skips this)
 *   - Loads CourseKnowledge RAG chunks (last 5 by createdAt DESC — Phase 93 will replace this with semantic retrieval)
 *   - Loads admin-uploaded curriculum content from DB (best-effort)
 *   - Adds track + course context (university/college/tvet get course-aware instructions)
 *   - Adds the proactive teaching rules (mathgraph / quiz / draw_task / examgen)
 *   - Adds learning-mode instructions (explain / practice / hint / simpler)
 *   - Adds client-platform-aware workspace handoff rules (mobile vs web)
 *   - Adds web-search source citation rules
 *
 * BEHAVIOR CONTRACT (Phase 91):
 *   The output of buildTutorSystemPrompt() MUST be byte-identical to the
 *   pre-Phase-91 implementation. Any change in output is a regression.
 *   Unit tests in __tests__/context-builder.test.ts cover the 6 track × course branches.
 *
 * FUTURE PHASES WILL ADD (additive, behind flags):
 *   - Phase 92: LEARNER STATE block (mastery levels, weak topics, streaks)
 *   - Phase 93: RETRIEVED KNOWLEDGE block (semantic top-K chunks)
 *   - Phase 95: LESSON STATE block (current topic + stage)
 */

import { db } from "@/lib/db";
import { buildTeachingProfile } from "@/lib/aware-engine";
import { buildCurriculumContextResolved } from "@/lib/curriculum-engine";
import { getBuddy } from "@/lib/buddies/registry";
import type { Buddy } from "@/lib/buddies/types";
import { getLearnerStatePromptBlock } from "./learner-state";
import { getRetrievedKnowledgePromptBlock } from "./rag";
import { getLessonStatePromptBlock } from "./lesson-controller";

// ============================================================
// Types
// ============================================================

export type TutorLearningMode = "standard" | "explain" | "practice" | "hint" | "simpler";

// ============================================================
// Constants — proactive teaching prompt rules
// ============================================================

// Feature flag: controls whether the AI prompt includes flowchart_v1 instructions.
// Server-side only — not exposed to the browser. Default: off (old drawing behavior).
function isFlowchartGenerationEnabled(): boolean {
  const flag = (process.env.TUTOR_FLOWCHART_GENERATION_ENABLED ?? "false").toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "on";
}

const STUDY_PROMPT_GRAPH_RULES = `PROACTIVE TEACHING MODE — You are the TEACHER, not just a responder.
Lead the conversation: teach, quiz, and suggest next steps. Be encouraging.

GRAPHING & DRAWING — when asked to draw/plot/chart, include a \`\`\`mathgraph block with JSON:
- bar: {"type":"bar","title":"...","categories":["A","B"],"values":[4,6]}
- pie: {"type":"pie","title":"...","slices":[{"label":"A","value":4}]}
- scatter: {"type":"scatter","title":"...","xLabel":"...","yLabel":"...","points":[[1,2],[3,4]]}
- scene: {"type":"scene","title":"...","elements":[{"kind":"rect","x":100,"y":100,"width":200,"height":100,"label":"..."}]}
- Other types: histogram, function, venn, numberline, tree, boxplot, vector, polygon, csv, erdiagram, steps, manipulative, code_project, science_simulation${isFlowchartGenerationEnabled() ? `, flowchart_v1` : ""}
- DO NOT output raw SVG/HTML. Include the block ONCE. Use real data, not placeholders.
- Double-check JSON is valid.

QUIZ: When user says "quiz me", include \`\`\`quiz block: {"title":"...","questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"..."}]}

EXAM: When user says "generate exam/test", include \`\`\`examgen block: {"topic":"...","numQuestions":10,"gradeLevel":"...","examType":"kcse_style","difficulty":"medium"}

DRAW TASK: When you want the user to draw, include \`\`\`draw_task block: {"title":"...","prompt":"Draw...","hint":"...","expectedKeywords":["..."]}

GENERAL: Reply in the user's language. Use markdown + LaTeX for math ($y=mx+b$). Keep replies under 250 words unless asked for detail.`;

// ============================================================
// Learning-mode instructions (per-mode behavior modifiers)
// ============================================================

const LEARNING_MODE_INSTRUCTIONS: Record<TutorLearningMode, string> = {
  standard: "",
  explain: "Teach this clearly in small numbered steps. Include one short example when it helps, and define unfamiliar terms.",
  practice: "Use a practice-first teaching style. Ask one focused question at a time and let the learner attempt it before revealing the answer. If they asked a direct factual question, answer briefly, then offer one practice question.",
  hint: "Give the smallest useful hint first. Do not reveal the full solution unless the learner explicitly asks for it. For factual questions, give a concise clue and invite a guess.",
  simpler: "Use plain, age-appropriate language, short sentences, and explain any necessary technical word. Keep the answer concise.",
};

// ============================================================
// Main: build the system prompt
// ============================================================

export interface BuildTutorSystemPromptOpts {
  user: {
    /** Phase 92 — used to fetch learner state (mastery, streak, active room). Optional for backward compat. */
    id?: string;
    grade?: string | null;
    track?: string | null;
    course?: string | null;
    subjects?: string[] | null;
    learningLanguage?: string | null;
    currentModel?: string | null;
  };
  buddy: Buddy;
  buddyId: string;
  userMessage: string;
  dataSaver: boolean;
  imageDataUrl: string | null;
  searchContext: string;
  toolResults?: string;
  studyContext?: string;
  learningMode?: TutorLearningMode;
  clientPlatform?: "mobile" | "web";
  /** Phase 92 — set true to skip the LEARNER STATE block even when enabled via env.
   *  Useful for tests + for routes that don't want personalization (e.g. exam generation). */
  skipLearnerState?: boolean;
  /** Phase 93 — set true to skip semantic RAG retrieval (e.g. tests, exam generation). */
  skipRag?: boolean;
  /** Phase 95 — the conversation ID (used to look up the active lesson state). */
  conversationId?: string | null;
  /** Phase 95 — set true to skip the LESSON STATE block (e.g. tests, exam generation). */
  skipLessonState?: boolean;
  /** AC1 — workspace context from the client (artifact type + caption + action).
   *  Sent as a SEPARATE field in the request body, NOT in the visible message. */
  workspaceContext?: {
    artifactType: string;
    artifactCaption: string;
    action: string;
  } | null;
}

export interface BuildTutorSystemPromptResult {
  systemContent: string;
  teachingProfile: ReturnType<typeof buildTeachingProfile>;
  curriculumContext: string;
}

/**
 * Build the AI tutor's system prompt.
 *
 * Phase 91 — extracted verbatim from src/lib/tutor-chat-engine.ts.
 * Behavior MUST be byte-identical to the pre-Phase-91 implementation.
 *
 * Pipeline: detectIntents → runWebSearch → [THIS] → AI call → splitThinking → postProcessReply
 */
export async function buildTutorSystemPrompt(
  opts: BuildTutorSystemPromptOpts,
): Promise<BuildTutorSystemPromptResult> {
  const {
    user,
    buddy,
    buddyId,
    userMessage,
    dataSaver,
    imageDataUrl,
    searchContext,
    toolResults = "",
    studyContext = "",
    learningMode = "standard",
    clientPlatform = "web",
    skipLearnerState = false,
    skipRag = false,
    conversationId = null,
    skipLessonState = false,
    workspaceContext = null,
  } = opts;
  const completeContext = [searchContext, toolResults, studyContext].filter(Boolean).join("\n\n");

  // Phase 84 — track + course awareness
  // Don't blindly assume Form 1 — use the user's actual track + course.
  const track = user.track || "k12";
  const course = user.course || null;
  const isHigherEd = track === "university" || track === "college" || track === "tvet"
    || (track === "mixed" && !!course);  // legacy mixed users with a course

  // For K-12/secondary: use grade-based teaching profile + curriculum context
  // For university/college/tvet: use adult-learner profile, NO K-12 curriculum
  const gradeForProfile = (track === "k12" || track === "secondary")
    ? (user.grade || "Form 1")
    : "Higher Education";
  const teachingProfile = buildTeachingProfile(gradeForProfile);

  // Phase 88.1 — CRITICAL FIX: Do NOT load K-12 curriculum context for
  // university/college/tvet students. The curriculum engine has hardcoded
  // rules like "Only teach topics listed above" + "If advanced, say it's
  // in a higher grade" — these were being injected for ALL users including
  // university Law students, causing the AI to refuse to teach Law and
  // redirect to Form 1 Math/Biology instead.
  const curriculumContext = isHigherEd
    ? ""  // No K-12 curriculum for higher-ed — let the AI use its own knowledge
    : buildCurriculumContextResolved(gradeForProfile);

  // Phase 84 — load CourseKnowledge for this user's track + course/grade
  // This is the RAG context the AI uses to answer course-specific questions.
  // NOTE (Phase 93 will replace this): currently "last 5 by createdAt DESC" —
  // no semantic relevance. Will become embedding-based top-K retrieval.
  let courseKnowledgeContext = "";
  try {
    const where: any = { track };
    if (isHigherEd && course) {
      // Match this course OR general (null course) for the track
      where.OR = [{ course }, { course: null }];
    } else if (user.grade) {
      where.OR = [{ gradeLevel: user.grade }, { gradeLevel: null }];
    }
    const knowledgeEntries = await db.courseKnowledge.findMany({
      where,
      orderBy: [{ isVerified: "desc" }, { createdAt: "desc" }],
      take: 5,  // top 5 most recent verified entries
    }).catch(() => []);
    if (knowledgeEntries.length > 0) {
      const blocks: string[] = [];
      for (const k of knowledgeEntries) {
        const topics = Array.isArray(k.topics) ? k.topics.slice(0, 8) : [];
        const topicList = topics.map((t: any) =>
          `  • ${t.title}${t.description ? ` — ${t.description}` : ""}${Array.isArray(t.keyConcepts) && t.keyConcepts.length ? ` (key: ${t.keyConcepts.join(", ")})` : ""}`
        ).join("\n");
        blocks.push(`### ${k.title}
Source: ${k.sourceType} uploaded ${new Date(k.createdAt).toLocaleDateString()}
Summary: ${k.summary.slice(0, 500)}${k.summary.length > 500 ? "…" : ""}
Topics:
${topicList || "  (no structured topics extracted)"}

Excerpt:
${k.rawText.slice(0, 1000)}${k.rawText.length > 1000 ? "…" : ""}`);
      }
      courseKnowledgeContext = `\n\n=== COURSE KNOWLEDGE BASE (Phase 84) ===
The following knowledge entries were uploaded by students/instructors on the same track${course ? ` + course (${course})` : user.grade ? ` + grade (${user.grade})` : ""} as the current user.
Use this knowledge as PRIMARY CONTEXT for answering their questions. Cite it naturally in your responses.

${blocks.join("\n\n---\n\n")}

=== END COURSE KNOWLEDGE BASE ===\n`;
    }
  } catch {}

  // Phase 84 — track + course context (system prompt section)
  let trackContext = "";
  if (isHigherEd && course) {
    trackContext = `
=== STUDENT CONTEXT ===
The student is enrolled in: ${track.toUpperCase()} — ${course}
This is a higher-education student. Do NOT assume they are in a Kenyan secondary school grade.
Tailor every answer to the ${course} curriculum.
If they ask "what can you teach", list subjects/topics relevant to ${course} — NOT Form 1 / KCSE subjects.
Be professional but warm — like a knowledgeable course tutor.
=== END STUDENT CONTEXT ===
`;
  } else if (track === "secondary" && user.grade) {
    trackContext = `
=== STUDENT CONTEXT ===
The student is in: ${track.toUpperCase()} — ${user.grade}
Tailor answers to the Kenyan ${user.grade} curriculum.
=== END STUDENT CONTEXT ===
`;
  } else if (track === "k12" && user.grade) {
    trackContext = `
=== STUDENT CONTEXT ===
The student is in: K-12 — ${user.grade}
Tailor answers to the Kenyan CBC curriculum for ${user.grade}.
=== END STUDENT CONTEXT ===
`;
  }

  // Phase 84 — proactive prompt to upload course outline if no knowledge exists yet
  let uploadPrompt = "";
  if (courseKnowledgeContext === "") {
    if (isHigherEd && course) {
      uploadPrompt = `
=== KNOWLEDGE GAP ===
No course outline has been uploaded yet for "${course}".
If the student asks general questions like "what can you teach" or "what topics do you cover",
warmly suggest they upload their course outline / syllabus (PDF or DOCX) using the 📎 upload button
so you can give them course-specific answers. Phrase it like a helpful tutor, e.g.:
"I can help with a wide range of ${course} topics — but to give you the most accurate answers,
I'd love to see your course outline! Tap the 📎 button below to upload it (PDF or DOCX)."
Only suggest this ONCE per conversation — don't nag.
=== END KNOWLEDGE GAP ===
`;
    } else if (track === "k12" || track === "secondary") {
      uploadPrompt = `
=== KNOWLEDGE GAP ===
No curriculum outline has been uploaded for ${track}${user.grade ? ` / ${user.grade}` : ""} yet.
If the student asks for topic lists or seems to need curriculum structure, gently suggest they
upload their class notes / syllabus (PDF or DOCX) using the 📎 button so you can be more specific.
Only suggest this ONCE per conversation — don't nag.
=== END KNOWLEDGE GAP ===
`;
    }
  }

  // Admin-uploaded curriculum content from DB (best-effort) — keep for K-12/secondary
  let dbCurriculumContext = "";
  try {
    if ((track === "k12" || track === "secondary") && user.grade) {
      const matchingGrade = await db.curriculumGrade.findFirst({
        where: { name: { equals: user.grade, mode: "insensitive" }, status: "ready" },
        include: {
          subjects: {
            select: {
              name: true,
              topics: { select: { name: true, summary: true, contentMarkdown: true }, orderBy: { orderIndex: "asc" } },
            },
          },
        },
      });
      if (matchingGrade) {
        const topicLines: string[] = [];
        for (const subj of matchingGrade.subjects) {
          if (subj.topics.length === 0) continue;
          topicLines.push(`\n## ${subj.name}`);
          for (const t of subj.topics.slice(0, 5)) {
            topicLines.push(`### ${t.name}\n${(t.contentMarkdown ?? "").slice(0, 200)}`);
          }
        }
        if (topicLines.length > 0) {
          dbCurriculumContext = `\n\nADDITIONAL CURRICULUM CONTENT (admin-uploaded):\n${topicLines.join("\n").slice(0, 3000)}`;
        }
      }
    }
  } catch {}

  // ------------------------------------------------------------------
  // Phase 92 — Learner state injection (read-only enrichment).
  //
  // Fetches the learner's mastery levels, streak, level, and active study room
  // topic, then formats them as a LEARNER STATE: block in the system prompt.
  // This lets the AI personalize its teaching instead of treating every turn
  // as if the learner were starting from scratch.
  //
  // Safety:
  //   - Strictly additive: if the fetch fails or returns empty, the prompt is
  //     byte-identical to Phase 91.
  //   - Feature-flagged via TUTOR_LEARNER_STATE_ENABLED (default: enabled).
  //   - skipLearnerState=true (used by tests + exam generation) bypasses entirely.
  // ------------------------------------------------------------------
  let learnerStateBlock = "";
  if (!skipLearnerState && user.id) {
    try {
      const result = await getLearnerStatePromptBlock(user.id);
      learnerStateBlock = result.text;
    } catch (err: any) {
      console.error("[context-builder] learner-state fetch failed:", err?.message ?? String(err));
      // Fail silently — omit the block, prompt stays Phase 91-compatible.
    }
  }

  // ------------------------------------------------------------------
  // Phase 93 — Semantic RAG retrieval.
  //
  // Embeds the user's latest message + retrieves top-K chunks from
  // CourseKnowledgeChunk rows tagged with the user's track + course/grade.
  // Returns the most semantically relevant chunks as a RETRIEVED KNOWLEDGE
  // block, which the AI uses as PRIMARY CONTEXT for answering.
  //
  // This REPLACES (not supplements) the Phase 84 "last 5 by createdAt" approach
  // for higher-ed students — for K-12/secondary, both run (the Phase 84 fetch
  // provides structured topics/summaries; RAG provides raw text chunks).
  //
  // Safety:
  //   - Strictly additive: if the fetch fails or returns empty, the prompt is
  //     byte-identical to Phase 92.
  //   - Feature-flagged via TUTOR_RAG_ENABLED (default: enabled).
  //   - skipRag=true bypasses entirely (used by tests + exam generation).
  // ------------------------------------------------------------------
  let retrievedKnowledgeBlock = "";
  if (!skipRag && userMessage && userMessage.length >= 3) {
    try {
      const result = await getRetrievedKnowledgePromptBlock({
        userMessage,
        track,
        course,
        grade: user.grade,
      });
      retrievedKnowledgeBlock = result.text;
    } catch (err: any) {
      console.error("[context-builder] RAG retrieval failed:", err?.message ?? String(err));
      // Fail silently — omit the block, prompt stays Phase 92-compatible.
    }
  }

  // ------------------------------------------------------------------
  // Phase 95 — Lesson controller state machine.
  //
  // Looks up the active lesson for this conversation (if any). When a
  // lesson is active, the AI gets explicit guidance on what stage of
  // teaching it's in (introduce → explain → check → advance) and is told
  // not to switch topics mid-lesson.
  //
  // Safety:
  //   - Strictly additive: if no lesson exists, the block is omitted.
  //   - Feature-flagged via TUTOR_LESSON_CONTROLLER_ENABLED (default: enabled).
  //   - skipLessonState=true bypasses entirely (tests, exam generation).
  // ------------------------------------------------------------------
  let lessonStateBlock = "";
  if (!skipLessonState && conversationId && user.id) {
    try {
      const result = await getLessonStatePromptBlock(conversationId, user.id);
      lessonStateBlock = result.text;
    } catch (err: any) {
      console.error("[context-builder] lesson-state fetch failed:", err?.message ?? String(err));
      // Fail silently — omit the block, prompt stays Phase 94-compatible.
    }
  }

  // AC1: Build workspace context block — injected as INTERNAL context, not visible to learner.
  // The learner's message is clean ("Explain this graph") — the workspace context
  // is passed separately so it doesn't appear in the chat.
  let workspaceContextBlock = "";
  if (workspaceContext) {
    const typeLabel = workspaceContext.artifactType === "graph" ? "a graph"
      : workspaceContext.artifactType === "quiz" ? "a quiz"
      : workspaceContext.artifactType === "draw_task" ? "a drawing task"
      : workspaceContext.artifactType === "conceptmap" ? "a concept map"
      : workspaceContext.artifactType === "manipulative" ? "a math activity"
      : workspaceContext.artifactType === "code_project" ? "a code project"
      : workspaceContext.artifactType === "flowchart_v1" ? "a flowchart"
      : "an artifact";
    workspaceContextBlock = `\n\n=== ACTIVE WORKSPACE (the learner is looking at ${typeLabel}) ===
The learner has ${typeLabel} open in their workspace. Their question is about it.
Workspace artifact type: ${workspaceContext.artifactType}
Learner action: ${workspaceContext.artifactCaption.slice(0, 800)}${workspaceContext.artifactCaption.length > 800 ? "…" : ""}
Respond to the learner's question with specific reference to this artifact. Do NOT output the raw JSON — the learner can already see the artifact in their workspace.
=== END ACTIVE WORKSPACE ===\n`;
  }

  let systemContent: string;
  if (buddyId === "study") {
    // AC1: workspaceContextBlock injected after lessonStateBlock, before proactive teaching rules
    systemContent = `You are StudyBuddy, a friendly AI tutor. ${teachingProfile.systemPromptSuffix}${trackContext}${uploadPrompt}${courseKnowledgeContext}${retrievedKnowledgeBlock}${curriculumContext}${completeContext}${learnerStateBlock}${lessonStateBlock}${workspaceContextBlock}
${dataSaver ? `\nDATA SAVER: Keep replies to 1-2 short paragraphs (max ~150 words).\n` : ``}

${STUDY_PROMPT_GRAPH_RULES}`;
  } else if (buddyId === "web") {
    // Phase 9 fix — Web Buddy is a pure BUILDER, not a tutor. It should NOT
    // receive tutor-specific context (curriculum, learner state, lesson
    // state, "upload your syllabus" nags, RAG chunks). Only append the
    // workspaceContextBlock (so the AI knows what's in the workspace).
    // Dev Buddy + Backend Buddy still get tutor context (they teach code).
    systemContent = buddy.buildSystemPrompt({
      userGrade: user.grade ?? null,
      languageOfInstruction: user.learningLanguage ?? "English",
      currentModel: user.currentModel ?? "study_buddy_free",
      userMessage,
      dataSaver,
      searchContext: completeContext,
      curriculumContext,
      dbCurriculumContext,
      teachingProfileSuffix: teachingProfile.systemPromptSuffix,
      hasImage: !!imageDataUrl,
      gradeBand: undefined,
    });
    // Only workspace context — NO track/course/curriculum/learner/lesson context
    systemContent += `\n${workspaceContextBlock}`;
  } else {
    // Phase 47 — delegate to the buddy's buildSystemPrompt().
    systemContent = buddy.buildSystemPrompt({
      userGrade: user.grade ?? null,
      languageOfInstruction: user.learningLanguage ?? "English",
      currentModel: user.currentModel ?? "study_buddy_free",
      userMessage,
      dataSaver,
      searchContext: completeContext,
      curriculumContext,
      dbCurriculumContext,
      teachingProfileSuffix: teachingProfile.systemPromptSuffix,
      hasImage: !!imageDataUrl,
      gradeBand: undefined,
    });
    // Phase 84 — append track + course + knowledge context to all buddies (not just "study")
    // Phase 92 — also append the learner-state block so non-study buddies personalize too
    // Phase 93 — also append retrieved-knowledge block (RAG chunks)
    // Phase 95 — also append lesson-state block
    systemContent += `\n${trackContext}${uploadPrompt}${courseKnowledgeContext}${retrievedKnowledgeBlock}${learnerStateBlock}${lessonStateBlock}${workspaceContextBlock}`;
  }

  if (toolResults) {
    systemContent += "\n\nTUTOR TOOL RESULTS: A tool result is included in the context above. Use it when relevant, preserve exact calculation/code output, and briefly tell the learner which tool you used. If a tool result reports failure, say that clearly and continue with a safe explanation instead of pretending it succeeded.";
  }

  if (learningMode !== "standard") {
    systemContent += `\n\nLEARNER-SELECTED TUTOR MODE (${learningMode}): ${LEARNING_MODE_INSTRUCTIONS[learningMode]}`;
  }
  systemContent += `\n\nWORKSPACE OFFER (${clientPlatform}): On mobile, if a task needs a bigger screen (coding, exams, drawing), suggest the matching workspace (design/study/exam/code/web/modeling/simulation/data/tvet) using: \`\`\`computer_workspace\n{"title":"...","reason":"...","benefit":"...","workspace":"..."}\n\`\`\`. On web, don't suggest switching devices. Don't offer for low tokens (shared across devices).`;

  // Phase 9 — Code language preference + sandbox awareness.
  systemContent += `\n\nCODE LANGUAGE PREFERENCE: When the learner asks for a specific programming language (e.g. "use JavaScript", "in Python", "don't use python", "what about js"), you MUST write ALL code in that reply using the requested language. Never default to Python when the learner explicitly asked for JavaScript. If unclear which language they want, ASK before writing code. The code sandbox supports: python, javascript. NOTE: "java" means Java (a compiled language) — if the learner previously discussed JavaScript and says "java", CLARIFY whether they mean Java or JavaScript before writing code.`;

  // Phase 9 — Code playground (workspace code execution).
  // CRITICAL: code goes in the WORKSPACE, NOT in the chat bubble.
  // The AI must NOT show the code twice (once as a ```javascript block
  // in chat AND once in code_playground). The code_playground IS where
  // the code lives. The chat should have a BRIEF intro only.
  systemContent += `\n\nCODE PLAYGROUND RULES (CRITICAL):
- When the learner wants to write, run, or experiment with code (e.g. "write me X", "show me Y", "let me code", "open a code playground"), emit a \`\`\`code_playground fence.
- The code_playground fence shape: \`\`\`code_playground\n{"language":"python","code":"# code here"}\n\`\`\`
- DO NOT also show the code as a \`\`\`javascript or \`\`\`python block in the chat. The code lives in the workspace playground, NOT in the chat bubble. Showing code in BOTH places is confusing + wastes tokens.
- The chat reply should have a 1-2 sentence intro BEFORE the code_playground fence, explaining what the code does. NO code blocks in the chat text itself.
- If the learner asks to UPDATE existing code (e.g. "change X to Y", "add a loop"), use \`\`\`workspace_edit to patch the active playground instead of emitting a new code_playground.
- Keep starter code SHORT (5-20 lines) and well-commented. The learner will edit + run it in the workspace.`;

  // Phase 9 — Website building. When the learner wants to build a website,
  // offer the web workspace (WebBuilderScreen) via computer_workspace.
  // Do NOT dump HTML/CSS/JS code in chat — the web workspace has its own
  // editor + live preview.
  systemContent += `\n\nWEBSITE BUILDING: When the learner wants to build a website or web page (e.g. "build a website", "make a webpage", "create a portfolio site", "let's build a website"), emit a \`\`\`computer_workspace fence with workspace:"web" to open the Web Builder. Do NOT dump multiple HTML/CSS/JS code files in the chat — the web workspace has a full editor + live preview. Keep the chat reply SHORT: 1-2 sentences about what you'll build, then the computer_workspace offer.`;

  // Phase 9 — Conciseness. The AI should be Socratic, not a textbook dump.
  systemContent += `\n\nCONCISENESS: Keep replies SHORT. Don't dump 4 sections + 3 tables + 3 code files in one reply. Ask ONE question or show ONE concept at a time. If the learner needs to see code, use code_playground (not inline code blocks). If they need to build something, use the workspace. Be conversational, not encyclopedic.`;

  if (searchContext.includes("WEB SEARCH RESULTS")) {
    systemContent += "\n\nSOURCE CITATIONS: For claims from web results above, cite inline as a Markdown link. Do not invent links.";
  }

  // Phase 5 — Global context budget: truncate system prompt to stay within
  // provider token limits. Some providers (OpenRouter free tier) limit prompt
  // to ~4500 tokens (~18000 chars). We cap at 20000 chars to be safe.
  // Truncation strategy: trim the CONTEXT BLOCKS (before rules) but keep
  // the rules + post-rules sections (learning mode, workspace offer, etc.)
  // intact since they're essential for behavior.
  const MAX_SYSTEM_CONTENT_CHARS = 20000;
  if (systemContent.length > MAX_SYSTEM_CONTENT_CHARS) {
    const rulesStart = systemContent.indexOf("PROACTIVE TEACHING MODE");
    if (rulesStart > 0) {
      // Keep first 4000 chars of context + all rules + post-rules sections
      const contextPart = systemContent.slice(0, Math.min(rulesStart, 4000));
      const rulesAndAfter = systemContent.slice(rulesStart);
      systemContent = contextPart + "\n…(context truncated)…\n" + rulesAndAfter;
    } else {
      systemContent = systemContent.slice(0, MAX_SYSTEM_CONTENT_CHARS) + "\n…(truncated)";
    }
  }

  return { systemContent, teachingProfile, curriculumContext };
}

// `getBuddy` is imported above for type-only usage via Buddy; the actual buddy
// resolution happens in the route, which passes the resolved Buddy object in.
// Re-export here so callers don't need to import from two places.
export { getBuddy };
