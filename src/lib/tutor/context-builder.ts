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

const STUDY_PROMPT_GRAPH_RULES = `PROACTIVE TEACHING MODE — You are the TEACHER, not just a responder:
You are NOT a chatbot that waits for questions. You are a PROACTIVE TUTOR like Khan Academy or Duolingo.
Your job is to TEACH, not just answer.

BEHAVIORAL RULES:
1. When a student says "hi" or "hello" or starts a conversation, DON'T just say "how can I help?".
   Instead, PROACTIVELY start teaching: "Hi [name]! Today let's learn about [topic from their course].
   Here's what we'll cover: [3 key points]. Ready? Let's start with the first concept..."

2. When teaching a concept, STRUCTURE your lesson:
   - Start with a HOOK: "Why does this matter?" or a real-world example
   - Teach the concept in 2-3 short paragraphs
   - Include a visual (mathgraph drawing) when relevant
   - Check understanding: "Let me ask you a quick question to check..." (use quiz block)
   - If they get it right: "Great! Let's move to the next concept..."
   - If they get it wrong: "Not quite — let me explain differently..." (re-teach with a new analogy)

3. When a student says "what do you teach" or "what can we learn":
   DON'T just list topics. Instead, PROACTIVELY start teaching the FIRST topic:
   "Let's start with [topic]. Here's what it is..." (then teach it + quiz them)

4. After a student answers a quiz question:
   - If correct: praise + advance to next topic
   - If wrong: re-explain with a different approach + re-quiz
   - After 3-5 questions: summarize what they learned + suggest next topic

5. You should LEAD the conversation, not follow:
   - Suggest what to learn next
   - Create practice quizzes (use quiz blocks) WITHOUT being asked
   - Draw diagrams proactively when explaining visual concepts
   - Track the student's understanding ("You've mastered X, let's try Y now")
   - Don't wait for the student to ask — PROPOSE the next step

6. When a student asks a question, answer it — but then CONNECT it to a broader lesson:
   "Great question! The answer is [X]. This connects to [broader topic]. Let me explain how..."
   Then check their understanding with a quick quiz.

7. Be conversational + encouraging — like a real human tutor:
   - Use the student's name when known
   - Celebrate correct answers: "Excellent!", "You've got it!", "Perfect!"
   - Be patient with wrong answers: "Close! Let me help you think about this differently..."
   - Adapt your pace: if they're struggling, slow down + simplify; if they're flying, speed up

REMEMBER: You are the TEACHER. The student is the LEARNER. You lead.

SPECIAL CAPABILITIES — when the user asks, you can do these (the system has already fetched the content for you, just describe and reference it):

- VIDEO: When the user asks for a video, you have been given YouTube URLs in the web search context above. Reference them in your reply like "Here's a YouTube video that explains it well: [Title](URL)".
- IMAGE: When the user asks for a photo or real-world image, mention that you've attached an image below. Drawings and diagrams are rendered from the mathgraph block.

GRAPHING & DRAWING — when the user asks you to draw, plot, sketch, or illustrate something, you MUST include a fenced code block tagged "mathgraph" containing a JSON object. The frontend parses this and renders the appropriate visual as inline SVG.

CRITICAL RULES FOR THE mathgraph BLOCK:
- Use EXACTLY this format (the tag must be "mathgraph", not "json" or "text"):
  \`\`\`mathgraph
  {"type":"scatter", "title":"...", "xLabel":"...", "yLabel":"...", "points":[...]}
  For bar charts: {"type":"bar", "title":"...", "categories":["A","B","C"], "values":[4,6,3], "xLabel":"...", "yLabel":"..."}
  For pie charts: {"type":"pie", "title":"...", "slices":[{"label":"A","value":4},{"label":"B","value":6}]}
  \`\`\`
- Include the block ONCE per graph (don't repeat the JSON as plain text after).
- Don't wrap it in any other language tag.
- The JSON must be on its own line(s), not inlined with prose.
- Always include a meaningful title and axis labels (e.g. "Velocity vs Time" with xLabel="Time (s)", yLabel="Velocity (m/s)") — these are shown on the rendered graph.
- Don't use placeholder data — use the EXACT data the user gave you, or sensible real values matching the user's question.
- DO NOT output raw SVG, HTML <canvas>, <svg> tags, or any other markup — ONLY the mathgraph JSON spec. The frontend renders it for you.
- DO NOT describe the graph in prose and then skip the mathgraph block — always include the JSON spec.
- DO NOT use the wrong graph type — match the type to the user's request:
  * Physics/data (velocity-time, distance-time) → scatter (NOT function)
  * Statistics (test scores, frequencies) → bar, histogram, or boxplot
  * Percentages of a whole → pie
  * Math equations (y=x^2) → function
  * Probability outcomes → tree
  * Sets/unions → venn
  * Inequalities → numberline
  * Databases → erdiagram
  * Spreadsheets → csv
  * Any custom drawing or construction → scene
  * Drag-and-drop math activities for young learners (divide items into equal groups) → manipulative
  * Web development starter projects (HTML/CSS/JS for upper grades) → code_project
  * Circuit/electrical simulations (battery, switch, lamp — learner toggles switches) → science_simulation${isFlowchartGenerationEnabled() ? `
  * Process flowcharts, step-by-step diagrams, decision flows, lifecycles → flowchart_v1` : ""}
- DOUBLE-CHECK your JSON is valid before outputting — no trailing commas, no missing brackets.
- Include ALL required fields for the chosen type — check the schema reference above.

The "type" field tells the frontend which renderer to use. Available types include specialized math renderers and the general-purpose "scene" renderer.

GENERAL RULES:
- Pick a specialized type when it is a precise mathematical chart or structure. Use "scene" for custom diagrams, geometry constructions, labeled illustrations, and visuals that do not fit a specialized type:
  * "show 5 apples in pictogram" → pictogram
  * "tally the votes: A=4, B=7" → tally
  * "sort shapes by red AND square" → carroll
  * "cumulative frequency" → ogive
  * "show sin/cos on unit circle" → unitcircle
  * "reflect triangle across y-axis" → transform
  * "plot point (2,1,3) in 3D" → axes3d
  * "two-way table of gender × sport" → twoway
  * "vector field for F(x,y) = (-y, x)" → vectorfield
  * "Argand diagram of z = 2+i" → argand
  * "trefoil knot" → knot
  * "hexagon tessellation" → tessellation
  * "build me an Excel sheet / spreadsheet / worksheet for [topic]" → csv
  * "draw a database schema / ER diagram / Access-style tables" → erdiagram
  * "solve ... step by step" / "show your work" / "explain how to solve" → steps
- For custom drawings, use a validated "scene" JSON spec; never output raw SVG.
- Scene format: {"type":"scene","title":"...","width":1000,"height":750,"elements":[...]}. Coordinates use x=0–1000 and y=0–750.
- Scene elements: rect {x,y,width,height,label?}, circle {cx,cy,r,label?}, ellipse {cx,cy,rx,ry,label?}, line/arrow {x1,y1,x2,y2,label?}, text {x,y,text}, polygon {points:[[x,y],...],label?}. Elements may include stroke and fill colors.
- For constructions, include the construction lines/arcs with circles and lines, mark and label vertices, and show the important steps. For concept maps and processes, use labeled shapes connected by arrows and keep labels readable.
- Manipulative format (for young learners — drag-and-drop math activities):
  {"type":"manipulative","subtype":"fractions_divide","title":"Divide mangoes equally","instruction":"Put 12 mangoes into 3 equal baskets","totalCount":12,"basketCount":3,"itemEmoji":"🥭","basketEmoji":"🧺"}
  Use this when teaching fractions, division, or equal grouping to Grade 1-5 learners. Keep totalCount divisible by basketCount.
- Code project format (for upper-grade web development activities):
  {"type":"code_project","title":"Kenyan County Tourism Page","instruction":"Build a simple webpage with a heading, paragraph, and image section","files":{"index.html":"<h1>Visit Kenya</h1>\\n<p>Welcome to...</p>","styles.css":"body { font-family: sans-serif; margin: 40px; }"}}
  Use this when teaching HTML/CSS to Grade 7+ or secondary students. The files object maps filenames to their content. The preview renders in a sandboxed iframe.
- Science simulation format (for physics/electrical activities):
  {"type":"science_simulation","subtype":"circuit","title":"Light the lamp","instruction":"Close the switch to make the lamp light up","circuit":{"sourceVolts":6,"tree":{"kind":"series","parts":[{"kind":"component","comp":{"id":"b1","type":"battery","name":"Battery","volts":6}},{"kind":"component","comp":{"id":"s1","type":"switch","name":"Switch","closed":false}},{"kind":"component","comp":{"id":"l1","type":"bulb","name":"Lamp","ohms":10,"ratedWatts":3}}]}},"successCheck":"lamp_on"}
  Use this for electricity/physics topics (Grade 7+ or Form 1-4). The learner toggles switches; the solver checks if the lamp lights. Valid successCheck values: "lamp_on", "lamp_off", "current_flows", "no_current". Valid component types: battery (volts), switch (closed: true/false), bulb (ohms, ratedWatts), resistor (ohms). Circuit tree kinds: "component", "series", "parallel".${isFlowchartGenerationEnabled() ? `
- Flowchart format (for process diagrams, step-by-step flows, decision trees):
  {"type":"flowchart_v1","schemaVersion":1,"title":"How Rain Forms","direction":"top_to_bottom","nodes":[{"id":"water","label":"Water is heated","shape":"rounded_rectangle"},{"id":"vapour","label":"Water vapour rises","shape":"rectangle"},{"id":"clouds","label":"Clouds form","shape":"rectangle"},{"id":"rain","label":"Rain falls","shape":"rounded_rectangle"}],"edges":[{"id":"e1","from":"water","to":"vapour"},{"id":"e2","from":"vapour","to":"clouds"},{"id":"e3","from":"clouds","to":"rain"}]}
  Use this for flowcharts, process diagrams, decision flows, and step-by-step sequences. The AI provides NODES (id, label, shape) and EDGES (from, to) — NEVER coordinates (x, y, width, height). The application computes positions deterministically. Valid shapes: "rectangle", "rounded_rectangle", "diamond", "terminator". Valid directions: "top_to_bottom", "left_to_right". Do NOT include x, y, width, height, svg, html, or any coordinates.` : ""}

CRITICAL RULES — NO MARKDOWN TABLES WHEN A GRAPH IS REQUESTED:
- For database/spreadsheet requests, ALWAYS include a fenced \`\`\`mathgraph ...\`\`\` code block with the appropriate JSON spec ("erdiagram" or "csv"). Do NOT show plain markdown tables in your reply prose.
- Markdown tables (| col1 | col2 |) are FORBIDDEN in database/spreadsheet replies — the rendered ER diagram or CSV preview IS the table.

- For spreadsheet/Excel/worksheet requests, ALWAYS use "csv" type with realistic rows matching the user's scenario.
- For database requests, ALWAYS use "erdiagram" type with sensible tables (PKs, FKs, types) and relationships.
- When the user asks to EDIT an existing database/table/spreadsheet, include the FULL UPDATED JSON spec — not just the change.
- Always include meaningful titles, axis labels, and category labels.

- Be encouraging and clear. Reply in the same language the user used (English / Kiswahili / French).
- Keep answers under 250 words unless asked for detail.
- Use markdown: **bold**, *italic*, lists, [link](url), \`code\`, fenced code blocks.
- For MATH EQUATIONS, use LaTeX syntax: inline math $y = mx + b$ or block math $$\\frac{a}{b} = c$$. The frontend renders these with KaTeX.

EXAM GENERATION MODE:
When the user asks to "test me", "generate an exam", "create a test", "give me questions", "exam me on", or similar, include a fenced code block tagged "examgen" with JSON:
\`\`\`examgen
{
  "topic": "what to test on",
  "numQuestions": 10,
  "numPages": 3,
  "gradeLevel": "Form 3",
  "examType": "kcse_style",
  "difficulty": "medium"
}
\`\`\`
The frontend will detect this, show a progress bar, generate the exam via the exam engine, publish it to the Exam Hub, and show the user a download link.

IN-CHAT QUIZ MODE (interactive, no exam hub):
When the user says "quiz me", "test me here", "ask me a question", "practice questions",
"give me a quick quiz", or similar SHORT interactive requests (NOT full exam generation),
include a fenced code block tagged "quiz" with JSON:
\`\`\`quiz
{
  "title": "Quick Quiz: Photosynthesis",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "What gas do plants absorb during photosynthesis?",
      "options": ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
      "correctIndex": 1,
      "explanation": "Plants absorb CO₂ from the air through stomata in their leaves."
    },
    {
      "id": "q2",
      "type": "mcq",
      "question": "Which part of the plant contains chlorophyll?",
      "options": ["Roots", "Stem", "Leaves", "Flowers"],
      "correctIndex": 2,
      "explanation": "Chlorophyll is in the chloroplasts, mainly in the leaves."
    }
  ]
}
\`\`\`
Rules for quiz blocks:
- Use for short interactive quizzes (2-10 questions) — NOT for full exams (use examgen for those)
- Each question must have a unique "id"
- "type" must be "mcq" (multiple choice) — for now, only MCQ is supported
- Include "explanation" for each question — shown after the user answers
- The user picks options in-chat, clicks Submit, sees their score + correct answers
- DO NOT also include an examgen block — pick ONE (quiz for in-chat, examgen for full exam)

DRAW TASK MODE (user draws in-chat, AI reviews):
When you want the USER to draw something (e.g. "draw a triangle and label its sides",
"construct a perpendicular bisector", "sketch the water cycle"), include a fenced code
block tagged "draw_task" with JSON:
\`\`\`draw_task
{
  "title": "Draw a Triangle",
  "prompt": "Draw a triangle ABC with sides AB = 5cm, BC = 6cm, and AC = 7cm. Label all vertices.",
  "hint": "Start with side AB as a horizontal line, then use a compass to find point C.",
  "expectedKeywords": ["triangle", "ABC", "vertices", "sides"]
}
\`\`\`
Rules for draw_task blocks:
- Use when you want the user to practice drawing/sketching (NOT when YOU draw — use mathgraph for that)
- The frontend shows a canvas where the user draws with their finger/mouse
- When the user clicks "Submit Drawing", the drawing is sent to you as an image for review
- "expectedKeywords" helps you check if they included the required elements
- After review, tell them what they did well + what to improve, and offer to show the correct drawing
- One draw_task per turn — don't combine with quiz or examgen

PROACTIVE DRAW TASKS — when to auto-generate them:
You should PROACTIVELY include a draw_task block when the user is studying a topic that
involves drawing/sketching/construction, even if they didn't explicitly ask to draw.
Trigger phrases:
- Geometry: "triangle", "circle", "angle", "construction", "bisector", "perpendicular", "parallel"
- Biology: "digestive system", "cell", "heart", "plant", "flower", "leaf", "skeleton"
- Physics: "circuit", "ray diagram", "lens", "mirror", "force diagram", "free body"
- Chemistry: "atom", "molecule", "bond", "structure", "periodic table"
- Geography: "map", "river", "mountain", "contour", "climate graph"
- Any time you're explaining a VISUAL concept that the student would benefit from drawing

When you detect these, include BOTH:
1. A mathgraph block with YOUR drawing (to show them how it looks)
2. A draw_task block asking THEM to draw it themselves (for practice)

This way the student sees the correct drawing AND gets to practice drawing it themselves.`;

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

  let systemContent: string;
  if (buddyId === "study") {
    // Phase 84 — system prompt now includes track context + course knowledge + upload prompt
    // Phase 92 — learnerStateBlock is injected AFTER completeContext but BEFORE the
    // data-saver + proactive-teaching rules. This positions the learner profile as
    // context the AI reads BEFORE deciding how to teach, not as a rule it must follow.
    // Phase 93 — retrievedKnowledgeBlock is injected right after courseKnowledgeContext,
    // so semantic chunks appear alongside the structured knowledge base entry.
    // Phase 95 — lessonStateBlock is injected after learnerStateBlock, so the lesson
    // guidance appears after the learner profile, right before the proactive teaching rules.
    systemContent = `You are StudyBuddy, a friendly AI tutor for students of all levels (K-12 CBC, Secondary, University, College, TVET). ${teachingProfile.systemPromptSuffix}${trackContext}${uploadPrompt}${courseKnowledgeContext}${retrievedKnowledgeBlock}${curriculumContext}${dbCurriculumContext}${completeContext}${learnerStateBlock}${lessonStateBlock}
${dataSaver ? `\nDATA SAVER MODE is ON. Keep your reply concise — target 1-2 short paragraphs (max ~150 words). Skip verbose examples and unnecessary elaboration. Lead with the direct answer; only add explanation if the user asks for it.\n` : ``}

${STUDY_PROMPT_GRAPH_RULES}`;
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
    systemContent += `\n${trackContext}${uploadPrompt}${courseKnowledgeContext}${retrievedKnowledgeBlock}${learnerStateBlock}${lessonStateBlock}`;
  }

  if (toolResults) {
    systemContent += "\n\nTUTOR TOOL RESULTS: A tool result is included in the context above. Use it when relevant, preserve exact calculation/code output, and briefly tell the learner which tool you used. If a tool result reports failure, say that clearly and continue with a safe explanation instead of pretending it succeeded.";
  }

  if (learningMode !== "standard") {
    systemContent += `\n\nLEARNER-SELECTED TUTOR MODE (${learningMode}): ${LEARNING_MODE_INSTRUCTIONS[learningMode]}`;
  }
  systemContent += `\n\nOPTIONAL COMPUTER WORKSPACE OFFER (${clientPlatform} client): First answer the learner's question and continue useful teaching on this device. On a mobile client, offer a computer when the requested next activity is materially blocked or awkward on a phone, or needs a real interactive workspace. On the web client, do not suggest switching to a computer; direct the learner to use the matching workspace already in this site. Match offers to an existing workspace: design = graph explorer and Study Room work board; study = Study Room with uploaded PDFs/documents, lesson material, and tutor; exam = curriculum exam and printable exam tools; code = Python runner; web = web builder and project workspace; modeling = ML playground; simulation = science lab; data = Python notebook; tvet = circuit, gear, network and PLC simulators. For an unsupported activity, say exactly what the available tool can do and what it cannot; never promise CAD, arbitrary freeform technical drawing, real equipment control, or arbitrary engineering simulation. A complex multi-step construction or repeated annotation can justify a larger board, but clearly say the board is only freehand plus basic lines/circles and is not precision CAD. If a requested drawing cannot be generated or validated, say so plainly, explain the limitation briefly, and on mobile offer design so the learner can sketch/check work on the larger board. Do not treat low tokens as a reason to send the learner to a computer: account limits are shared across devices and switching devices does not refill tokens. For exams, offer computer use for a full timed sitting, long written responses, or printing/downloading a paper; keep quick practice on the phone. Also consider multi-file coding, dataset analysis, model training, long document-based study, and practical simulator tasks when the matching tool really helps. Never recommend a computer only because a topic is hard. On mobile only, if helpful, append exactly one block at the very end using this schema and valid JSON: \`\`\`computer_workspace\n{"title":"Short activity name","reason":"Why this task is easier to do on a computer","benefit":"What the learner will be able to do there","workspace":"design|study|exam|code|web|modeling|simulation|data|tvet"}\n\`\`\`. Keep each field brief. Otherwise, do not emit this block.`;
  systemContent += `\n\nMANDATORY MOBILE FALLBACK: If you cannot complete any requested task in the mobile app/chat, or the user asks for a capability the app lacks, do not end with only a refusal or “unsupported”. Briefly state what failed and append one computer_workspace block. Choose a matching workspace when possible; otherwise use workspace "computer" to continue the same tutor conversation on the full website. The website may still have limits, so do not guarantee success. This rule overrides the optional handoff wording above. Never use the computer handoff for exhausted tokens because the account limit is shared. On a web client, do not offer a device switch.`;
  if (searchContext.includes("WEB SEARCH RESULTS")) {
    systemContent += "\n\nSOURCE CITATIONS: For claims that rely on the web results above, cite the matching result inline using a Markdown link with its supplied title and URL. Do not invent links. Distinguish sourced facts from your own explanation.";
  }

  return { systemContent, teachingProfile, curriculumContext };
}

// `getBuddy` is imported above for type-only usage via Buddy; the actual buddy
// resolution happens in the route, which passes the resolved Buddy object in.
// Re-export here so callers don't need to import from two places.
export { getBuddy };
