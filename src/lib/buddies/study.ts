/**
 * StudyBuddy — Phase 47 (wraps the existing Phase 1-46 StudyBuddy prompt)
 *
 * This is the "default" buddy: a friendly AI tutor for Kenyan K-12 students
 * grounded in the CBC / KCSE / KPSEA / KJSEA curriculum. It supports all
 * the existing capabilities (32 graph types, concept maps, step-by-step,
 * video search, vision, voice, exam generation, document upload).
 *
 * Phase 47 wraps the existing inline system prompt in `buildSystemPrompt`
 * so future buddies can be plugged in with the same interface. The chat
 * route continues to work exactly as before for users who never switch.
 */

import type { Buddy, BuddySuggestion } from "./types";

const SUGGESTIONS: BuddySuggestion[] = [
  { icon: "🍎", text: "Make a pictogram: 8 apples, 5 bananas, 10 oranges (🍎 = 2 fruits each)", category: "Grade 1-3" },
  { icon: "✋", text: "Tally the votes: Red 8, Blue 12, Green 5, Yellow 3", category: "Grade 1-3" },
  { icon: "🟦", text: "Sort shapes: Carroll diagram (is red? is square?)", category: "Grade 4-6" },
  { icon: "📊", text: "Make a bar chart of class scores: Math 85, English 72, Science 90, History 68", category: "Grade 4-6" },
  { icon: "📈", text: "Plot these data points: (0,0) (1,5) (2,10) (3,15) and draw a line of best fit", category: "Grade 7-9" },
  { icon: "🌿", text: "Make a stem-and-leaf plot of: 23 25 28 31 32 35 38 42 45 48", category: "Grade 7-9" },
  { icon: "➖", text: "Draw -2 ≤ x ≤ 3 on a number line", category: "Form 1-4" },
  { icon: "🌳", text: "Make a probability tree diagram for two coin flips", category: "Form 1-4" },
  { icon: "🧮", text: "Solve x² + 5x + 6 = 0 using the quadratic formula", category: "Form 1-4" },
  { icon: "📝", text: "Solve 2x + 5 = 15 step by step, showing your work", category: "Step-by-Step" },
  { icon: "📷", text: "Upload a photo of my homework using the 📎 button and ask 'help me solve this'", category: "Vision" },
  { icon: "🥧", text: "Draw a pie chart of budget: Rent 40%, Food 25%, Transport 15%, Savings 20%", category: "General" },
];

/**
 * The mathgraph spec instructions are large — we factor them out so they
 * can be reused by other buddies that also want graph drawing (e.g. DataBuddy,
 * MLBuddy). Kept here as a string template that gets embedded in the prompt.
 */
export const MATHGRAPH_INSTRUCTIONS = `
GRAPHING & DRAWING — when the user asks you to draw, plot, sketch, or illustrate something, you MUST include a fenced code block tagged "mathgraph" containing a JSON object. The frontend parses this and renders the appropriate visual as inline SVG.

CRITICAL RULES FOR THE mathgraph BLOCK:
- Use EXACTLY this format (the tag must be "mathgraph", not "json" or "text"):
  \`\`\`mathgraph
  { "type": "scatter", "points": [[0,0], [1,1], [2,4]] }
  \`\`\`
- Include ALL required fields for the chosen type — check the schema reference above.
- One graph per turn — don't include multiple mathgraph blocks unless the user explicitly asks for several.
- Use REAL data from the user's question, not placeholder/template data.
- If the user's request doesn't map to any graph type, explain in words and skip the block.
`;

export const EXAMGEN_INSTRUCTIONS = `
EXAM GENERATION MODE:
When the user asks to "test me", "generate an exam", "create a test", "give me questions", "exam me on",
or similar exam/test/quiz generation requests, include a fenced code block tagged "examgen" with JSON:
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
The frontend will detect this, show a progress bar, generate the exam via the exam engine,
publish it to the Exam Hub, and show the user a download link. You should also ask the user
a few clarifying questions if they haven't specified enough (e.g. "How many questions?"
"How many pages?" "What difficulty?"). If they've given enough info, generate the examgen
block directly. If the user's grade is known, use it as gradeLevel automatically.`;

export const studyBuddy: Buddy = {
  id: "study",
  displayName: "StudyBuddy",
  tagline: "K-12 tutor (Kenya CBC / KCSE)",
  description: "Friendly AI tutor grounded in the Kenyan CBC, KCSE, KPSEA, and KJSEA curriculum. Can draw 32 kinds of graphs, build concept maps, generate exams, and read your homework photos. Your chat history is saved automatically.",
  emoji: "📚",
  accentGradient: "from-indigo-500 to-violet-500",
  accentText: "text-indigo-600",
  phase: 1,
  plan: "free",
  capabilities: [
    "graph_drawing", "concept_maps", "step_by_step",
    "image_search", "video_search", "vision",
    "voice", "exam_generation", "document_upload",
    "project_save",
  ],
  knowledgeBases: ["Kenya CBC (PP1–Grade 9)", "Kenya KCSE/KCSE (Form 1–4)", "KCPE/KPSEA/KJSEA past papers"],
  suggestions: SUGGESTIONS,

  buildSystemPrompt: (ctx) => {
    const dataSaverHint = ctx.dataSaver
      ? `\nDATA SAVER MODE is ON. Keep your reply concise — target 1-2 short paragraphs (max ~150 words). Skip verbose examples and unnecessary elaboration. Lead with the direct answer; only add explanation if the user asks for it.\n`
      : ``;

    const capabilitiesIntro = `
SPECIAL CAPABILITIES — when the user asks, you can do these (the system has already fetched the content for you, just describe and reference it):

- VIDEO: When the user asks for a video, you have been given YouTube URLs in the web search context above. Reference them in your reply like "Here's a YouTube video that explains it well: [Title](URL)".
- IMAGE: When the user asks for an image/diagram, mention that you've attached an image below.`;

    return `You are StudyBuddy, a friendly AI tutor for Kenyan students (CBC / KCSE / KPSEA / KJSEA curriculum). ${ctx.teachingProfileSuffix}${ctx.curriculumContext}${ctx.dbCurriculumContext}${ctx.searchContext}
${dataSaverHint}
${capabilitiesIntro}

${MATHGRAPH_INSTRUCTIONS}

${EXAMGEN_INSTRUCTIONS}`;
  },
};
