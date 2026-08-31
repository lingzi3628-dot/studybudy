/**
 * Tutor Chat Engine — Phase 52
 *
 * Shared logic for BOTH chat endpoints:
 *   - POST /api/tutor/chat        (classic, single JSON response)
 *   - POST /api/tutor/chat/stream (SSE streaming)
 *
 * Extracted from the original 768-line route so the two endpoints stay in
 * lockstep. Any behavior change must be made HERE, not in either route.
 *
 * Pipeline:
 *   detectIntents() → runWebSearch() → buildTutorSystemPrompt() → [AI CALL]
 *   → splitThinking() → postProcessReply() (graph specs + examgen + proof)
 */

import { db } from "@/lib/db";
import { callAI, type ChatMessage as AIMessage } from "@/lib/ai";
import { buildTeachingProfile } from "@/lib/aware-engine";
import { buildCurriculumContextResolved } from "@/lib/curriculum-engine";
import { runProofEngine } from "@/lib/proof-engine";
import { validateAndCorrectGraphSpec } from "@/lib/graph-validator";
import { getBuddy } from "@/lib/buddies/registry";
import type { Buddy } from "@/lib/buddies/types";

export type TutorAttachment = { type: string; url: string | null; caption: string };

// ---------------------------------------------------------------
// 1. Intent detection
// ---------------------------------------------------------------

export type TutorIntents = {
  wantsVideo: boolean;
  wantsImage: boolean;
  wantsFunctionPlot: boolean;
  wantsScatter: boolean;
  wantsBar: boolean;
  wantsHistogram: boolean;
  wantsPie: boolean;
  wantsVenn: boolean;
  wantsNumberLine: boolean;
  wantsTree: boolean;
  wantsBoxPlot: boolean;
  wantsVector: boolean;
  wantsPolygon: boolean;
  wantsNetwork: boolean;
  wantsConceptMap: boolean;
  wantsArgand: boolean;
  wantsContour: boolean;
  wantsVectorField: boolean;
  wantsTessellation: boolean;
  wantsKnot: boolean;
  wantsPictogram: boolean;
  wantsTally: boolean;
  wantsCarroll: boolean;
  wantsOgive: boolean;
  wantsUnitCircle: boolean;
  wantsTransform: boolean;
  wantsAxes3D: boolean;
  wantsTwoWay: boolean;
  wantsCSV: boolean;
  wantsERDiagram: boolean;
  wantsSteps: boolean;
  wantsSearch: boolean;
  wantsGraph: boolean;
};

export function detectIntents(userMessage: string): TutorIntents {
  const wantsVideo = /\bvideo\b|\bclip\b|\bwatch\b|youtube|\bsend me.*(video|clip)\b|show me.*(video|clip)\b/i.test(userMessage);
  const wantsImage = /\bimage\b|\bpicture\b|\bphoto\b|\billustration\b/i.test(userMessage) &&
                     !/draw.*(graph|chart|plot|curve|function|polygon|triangle|circle)/i.test(userMessage) &&
                     !/\bdiagram\b.*\bof\b.*\bvenn\b/i.test(userMessage);
  const wantsFunctionPlot = /\b(y\s*=|f\(x\)|graph (?:of )?(?:y|x|sin|cos|tan|x²|x\^))\b|draw\s+(?:y\s*=|f\(x\))/i.test(userMessage) &&
                            !/\b(scatter|bar|pie|histogram|box|venn|tree|number line|vector)\b/i.test(userMessage);
  const wantsScatter = /\b(scatter|data points?|plot (?:the|these|all) (?:data )?points?|line of best fit|velocity.*(vs|versus).*time|distance.*(vs|versus).*time|time series)\b/i.test(userMessage) ||
                       /\(\s*\d+\s*,\s*\d+\s*\)/.test(userMessage);
  const wantsBar = /\b(bar\s*(chart|graph)|bar plot|column chart|frequency.*by)\b/i.test(userMessage);
  const wantsHistogram = /\bhistogram\b|frequency distribution|frequency.*class\b/i.test(userMessage);
  const wantsPie = /\bpie\s*(chart)?\b|percentages?\s*(of (a whole|the))?|proportion of\b/i.test(userMessage);
  const wantsVenn = /\bvenn\b|\bset[s]?\b.*\b(union|intersection|overlap|disjoint|difference)\b/i.test(userMessage);
  const wantsNumberLine = /\bnumber line\b|inequality|x\s*[<>≤≥]|x\s*∈|\b(-?\d+)\s*[<≤]\s*x\s*[<≤]\s*(-?\d+)\b/i.test(userMessage);
  const wantsTree = /\btree diagram\b|probability tree|outcome tree/i.test(userMessage);
  const wantsBoxPlot = /\bbox\s*(and|&|-)?\s*whisker\b|\bbox\s*plot\b|quartile|five[- ]number summary/i.test(userMessage);
  const wantsVector = /\bvector(s)?\b|force diagram|\bdisplacement vector\b|\bresultant\b/i.test(userMessage) && !/vector field/i.test(userMessage);
  const wantsPolygon = /\b(triangle|quadrilateral|pentagon|hexagon|heptagon|octagon|polygon|square|rectangle|rhombus|trapezium|trapezoid|parallelogram|kite)\b/i.test(userMessage) &&
                       /draw|sketch|construct|label|illustrat/i.test(userMessage);
  const wantsNetwork = /\bnetwork graph\b|graph theory|vertices and edges|social network|friend graph/i.test(userMessage);
  const wantsConceptMap = /\bconcept map\b|\bmind map\b|\bmindmap\b|\brelationship between\b/i.test(userMessage);
  const wantsArgand = /\bargand\b|complex plane|complex number plot|plot.*\bz_\d|plot.*complex number/i.test(userMessage);
  const wantsContour = /\bcontour map\b|contour lines?|level curves?|topographic|elevation levels?/i.test(userMessage);
  const wantsVectorField = /\bvector field\b|direction field|force field|magnetic field|electric field|flow field/i.test(userMessage);
  const wantsTessellation = /\btessellat|tiling pattern|tile the plane|repeating pattern of/i.test(userMessage);
  const wantsKnot = /\btrefoil\b|\bknot diagram\b|\bfigure.?eight knot\b|\bknot theory\b/i.test(userMessage);
  const wantsPictogram = /\bpictograph\b|\bpictogram\b|picture graph|symbol.*count|emoji.*count/i.test(userMessage);
  const wantsTally = /\btally (chart|marks?)\b|count tallies/i.test(userMessage);
  const wantsCarroll = /\bcarroll (diagram|sort)\b|sort by two attributes|sort.*yes.*no/i.test(userMessage);
  const wantsOgive = /\bogive\b|cumulative frequency curve|cumulative frequency graph/i.test(userMessage);
  const wantsUnitCircle = /\bunit circle\b|sin.*cos.*circle|trig.*circle|cos θ.*sin θ/i.test(userMessage);
  const wantsTransform = /\b(reflect|rotate|translate|enlarge|transformation).* (across|in|by|through|of|line|scale factor)/i.test(userMessage) ||
                          /\breflect (triangle|shape|figure) across\b/i.test(userMessage) ||
                          /\brotate (triangle|shape|figure) (by|around)\b/i.test(userMessage);
  const wantsAxes3D = /\b3d (coordinate|axes|space|system)\b|plot.*in 3d|point.*in 3d|\(x, y, z\)|3d graph/i.test(userMessage);
  const wantsTwoWay = /\btwo[- ]way table\b|contingency table|cross[- ]tabulation/i.test(userMessage);
  const wantsCSV = /\bexcel sheet\b|\bspreadsheet\b|\bworksheet\b|\bbuild a sheet\b|make a (food capacity|payment|attendance|inventory|grade book|budget) (sheet|worksheet|spreadsheet)/i.test(userMessage);
  const wantsERDiagram = /\b(er diagram|entity.?relationship|database schema|database design|access table|ms access|simple database|build a database|design a database)/i.test(userMessage);
  const wantsSteps = /\bstep by step\b|\bstep[- ]by[- ]step\b|\bshow your work\b|\bhow to solve\b|\bwork it out\b|\bworking for\b/i.test(userMessage) ||
                     (/\bsolve\b/i.test(userMessage) && /=/i.test(userMessage));
  const wantsSearch = /\bfind\b|\bsearch\b|\blook up\b|\bwhat is\b|\bwho is\b|\bwhen did\b|\bhow does\b/i.test(userMessage) && !wantsVideo &&
                      !wantsScatter && !wantsBar && !wantsHistogram && !wantsPie && !wantsVenn &&
                      !wantsNumberLine && !wantsTree && !wantsBoxPlot && !wantsVector && !wantsPolygon;

  const wantsGraph = wantsFunctionPlot || wantsScatter || wantsBar || wantsHistogram || wantsPie ||
                     wantsVenn || wantsNumberLine || wantsTree || wantsBoxPlot || wantsVector ||
                     wantsPolygon || wantsNetwork || wantsConceptMap || wantsArgand || wantsContour ||
                     wantsVectorField || wantsTessellation || wantsKnot ||
                     wantsPictogram || wantsTally || wantsCarroll || wantsOgive || wantsUnitCircle ||
                     wantsTransform || wantsAxes3D || wantsTwoWay ||
                     wantsCSV || wantsERDiagram || wantsSteps;

  return {
    wantsVideo, wantsImage, wantsFunctionPlot, wantsScatter, wantsBar, wantsHistogram,
    wantsPie, wantsVenn, wantsNumberLine, wantsTree, wantsBoxPlot, wantsVector,
    wantsPolygon, wantsNetwork, wantsConceptMap, wantsArgand, wantsContour,
    wantsVectorField, wantsTessellation, wantsKnot, wantsPictogram, wantsTally,
    wantsCarroll, wantsOgive, wantsUnitCircle, wantsTransform, wantsAxes3D,
    wantsTwoWay, wantsCSV, wantsERDiagram, wantsSteps, wantsSearch, wantsGraph,
  };
}

// ---------------------------------------------------------------
// 2. Web search (videos / images / general context)
// ---------------------------------------------------------------

export async function runWebSearch(opts: {
  userMessage: string;
  intents: TutorIntents;
  dataSaver: boolean;
}): Promise<{ searchContext: string; searchAttachments: TutorAttachment[] }> {
  const { userMessage, intents, dataSaver } = opts;
  let searchContext = "";
  const searchAttachments: TutorAttachment[] = [];

  // Phase 45: skip image search entirely in Data Saver mode (saves an external call).
  // Video and general web searches are still allowed because they're cheap.
  if ((intents.wantsSearch || intents.wantsVideo || (intents.wantsImage && !dataSaver)) &&
      (intents.wantsSearch || intents.wantsVideo || intents.wantsImage)) {
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      const client = await ZAI.create();

      // For videos, explicitly search YouTube
      const searchQuery = intents.wantsVideo
        ? `${userMessage.replace(/video|clip|watch|send me|show me/gi, "").trim()} site:youtube.com`
        : userMessage;

      const searchResult: any = await client.functions.invoke("web_search", {
        query: searchQuery,
        num: intents.wantsVideo ? 5 : 6,
      });

      // SDK returns array of SearchFunctionResultItem (not {results: [...]})
      const results: any[] = Array.isArray(searchResult)
        ? searchResult
        : (searchResult?.results ?? searchResult?.data ?? []);

      if (results.length > 0) {
        const resultLines = results.slice(0, 6).map((r: any) =>
          `- ${r.name ?? r.title ?? "Result"} (${r.url ?? r.link ?? ""})\n  ${r.snippet ?? r.description ?? ""}`
        ).join("\n");
        searchContext = `\n\nWEB SEARCH RESULTS for "${userMessage}":\n${resultLines}`;

        // Find YouTube videos for video requests
        if (intents.wantsVideo) {
          const ytResults = results.filter((r: any) => {
            const u = r.url ?? r.link ?? "";
            return /youtube\.com\/watch|youtu\.be\//.test(u);
          }).slice(0, 2);

          for (const r of ytResults) {
            const url = r.url ?? r.link ?? "";
            searchAttachments.push({
              type: "video",
              url,
              caption: r.name ?? r.title ?? "YouTube video",
            });
          }
        }

        // Find images via image-search SDK
        if (intents.wantsImage && !dataSaver) {
          try {
            const imageSearchRes: any = await client.images.search.create({
              query: userMessage.replace(/image|picture|photo|diagram|show me|send me/gi, "").trim(),
              count: 3,
            });
            const imageResults: any[] = imageSearchRes?.results ?? [];
            for (const r of imageResults.slice(0, 2)) {
              const imgUrl = r.original_url ?? r.url ?? r.thumbnail;
              if (imgUrl) {
                searchAttachments.push({
                  type: "image",
                  url: imgUrl,
                  caption: r.caption ?? r.title ?? "Related image",
                });
              }
            }
          } catch (imgErr: any) {
            console.error("[tutor-engine] image search failed:", imgErr?.message);
          }
        }
      }
    } catch (e: any) {
      console.error("[tutor-engine] web search failed:", e?.message);
    }
  }

  return { searchContext, searchAttachments };
}

// ---------------------------------------------------------------
// 3. System prompt
// ---------------------------------------------------------------

const STUDY_PROMPT_GRAPH_RULES = `SPECIAL CAPABILITIES — when the user asks, you can do these (the system has already fetched the content for you, just describe and reference it):

- VIDEO: When the user asks for a video, you have been given YouTube URLs in the web search context above. Reference them in your reply like "Here's a YouTube video that explains it well: [Title](URL)".
- IMAGE: When the user asks for an image/diagram, mention that you've attached an image below.

GRAPHING & DRAWING — when the user asks you to draw, plot, sketch, or illustrate something, you MUST include a fenced code block tagged "mathgraph" containing a JSON object. The frontend parses this and renders the appropriate visual as inline SVG.

CRITICAL RULES FOR THE mathgraph BLOCK:
- Use EXACTLY this format (the tag must be "mathgraph", not "json" or "text"):
  \`\`\`mathgraph
  {"type":"scatter", "title":"...", "xLabel":"...", "yLabel":"...", "points":[...]}
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
  * Anything else → freeform (raw SVG)
- DOUBLE-CHECK your JSON is valid before outputting — no trailing commas, no missing brackets.
- Include ALL required fields for the chosen type — check the schema reference above.

The "type" field tells the frontend which renderer to use. Available types:
1. function 2. scatter 3. bar 4. histogram 5. pie 6. venn 7. numberline 8. tree 9. network 10. vector 11. polygon 12. boxplot 13. slopefield 14. stemleaf 15. frequency_polygon 16. freeform 17. argand 18. contour 19. vectorfield 20. tessellation 21. knot 22. pictogram 23. tally 24. carroll 25. ogive 26. unitcircle 27. transform 28. axes3d 29. twoway 30. erdiagram 31. csv 32. steps

GENERAL RULES:
- ALWAYS pick the MOST APPROPRIATE graph type from the 32 types. Match by the user's question:
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
- For anything not covered by the 32 types, use "freeform" with raw SVG.

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

REAL-TIME THINKING:
Before answering, include your reasoning process inside <thinking>...</thinking> tags at the START of your reply.
Write your thinking as short, step-by-step notes (one per line) showing how you plan to answer.

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
The frontend will detect this, show a progress bar, generate the exam via the exam engine, publish it to the Exam Hub, and show the user a download link.`;

export async function buildTutorSystemPrompt(opts: {
  user: { grade?: string | null; learningLanguage?: string | null; currentModel?: string | null };
  buddy: Buddy;
  buddyId: string;
  userMessage: string;
  dataSaver: boolean;
  imageDataUrl: string | null;
  searchContext: string;
}): Promise<{ systemContent: string; teachingProfile: ReturnType<typeof buildTeachingProfile>; curriculumContext: string }> {
  const { user, buddy, buddyId, userMessage, dataSaver, imageDataUrl, searchContext } = opts;

  const teachingProfile = buildTeachingProfile(user.grade ?? "Form 1");
  const curriculumContext = buildCurriculumContextResolved(user.grade ?? "Form 1");

  // Admin-uploaded curriculum content from DB (best-effort)
  let dbCurriculumContext = "";
  try {
    if (user.grade) {
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

  let systemContent: string;
  if (buddyId === "study") {
    // Backward-compat path — exact same prompt as Phase 1-51.
    systemContent = `You are StudyBuddy, a friendly AI tutor for Kenyan students (CBC / KCSE / KPSEA / KJSEA curriculum). ${teachingProfile.systemPromptSuffix}${curriculumContext}${dbCurriculumContext}${searchContext}
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
      searchContext,
      curriculumContext,
      dbCurriculumContext,
      teachingProfileSuffix: teachingProfile.systemPromptSuffix,
      hasImage: !!imageDataUrl,
      gradeBand: undefined,
    });
  }

  return { systemContent, teachingProfile, curriculumContext };
}

// ---------------------------------------------------------------
// 4. Thinking block split
// ---------------------------------------------------------------

export function splitThinking(reply: string): { clean: string; steps: string[] } {
  const thinkingMatch = reply.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (!thinkingMatch) return { clean: reply, steps: [] };
  const thinkingText = thinkingMatch[1].trim();
  const steps = thinkingText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
    .slice(0, 10);
  return { clean: reply.replace(/<thinking>[\s\S]*?<\/thinking>/i, "").trim(), steps };
}

// ---------------------------------------------------------------
// 5. Graph spec parsing + validation + concept map fallback
// ---------------------------------------------------------------

const KNOWN_GRAPH_TYPES = new Set([
  "function", "scatter", "bar", "histogram", "pie", "venn",
  "numberline", "tree", "network", "vector", "polygon", "boxplot",
  "slopefield", "stemleaf", "frequency_polygon", "freeform",
  "argand", "contour", "vectorfield", "tessellation", "knot",
  "pictogram", "tally", "carroll", "ogive", "unitcircle",
  "transform", "axes3d", "twoway", "erdiagram", "csv", "steps",
]);

function tryParseGraphSpec(raw: string): any | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^```[\w-]*\s*/i, "").replace(/```\s*$/i, "");
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return null;
  const jsonStr = s.slice(firstBrace, lastBrace + 1);
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && typeof obj === "object" && typeof obj.type === "string" && KNOWN_GRAPH_TYPES.has(obj.type)) {
      return obj;
    }
    // Also accept old "conceptmap" tag — wrap as network type
    if (obj && typeof obj === "object" && obj.nodes && obj.edges && !obj.type) {
      return { ...obj, type: "network" };
    }
  } catch {
    return null;
  }
  return null;
}

export async function parseGraphAttachments(opts: {
  reply: string;
  userMessage: string;
  userId: string;
  intents: TutorIntents;
}): Promise<TutorAttachment[]> {
  const { reply, userMessage, userId, intents } = opts;
  const attachments: TutorAttachment[] = [];

  try {
    const foundSpecs: any[] = [];

    // 1) Fenced code blocks (ANY language tag)
    const codeBlockRe = /```([\w-]*)\s*([\s\S]*?)```/g;
    let codeBlockMatch: RegExpExecArray | null;
    while ((codeBlockMatch = codeBlockRe.exec(reply)) !== null) {
      const lang = (codeBlockMatch[1] ?? "").toLowerCase();
      const body = codeBlockMatch[2] ?? "";
      if (["bash", "sh", "shell", "python", "py", "javascript", "js", "typescript", "ts", "html", "css", "sql"].includes(lang)) {
        continue;
      }
      const spec = tryParseGraphSpec(body);
      if (spec) foundSpecs.push(spec);
    }

    // 2) Inline JSON-looking text outside code blocks
    const inlineJsonRe = /\{\s*"(?:type|title)"\s*:[^{}]*\}/g;
    const strippedReply = reply.replace(/```[\s\S]*?```/g, "");
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlineJsonRe.exec(strippedReply)) !== null) {
      const start = inlineMatch.index;
      const end = strippedReply.indexOf("}", start);
      if (end === -1) continue;
      let depth = 0;
      let lastBrace = -1;
      for (let i = start; i < strippedReply.length; i++) {
        if (strippedReply[i] === "{") depth++;
        else if (strippedReply[i] === "}") {
          depth--;
          if (depth === 0) { lastBrace = i; break; }
        }
      }
      if (lastBrace === -1) continue;
      const candidate = strippedReply.slice(start, lastBrace + 1);
      const spec = tryParseGraphSpec(candidate);
      if (spec) foundSpecs.push(spec);
    }

    // 3) Validate + correct each spec (with one AI retry on failure)
    for (const spec of foundSpecs) {
      let validation = validateAndCorrectGraphSpec(spec);

      if (!validation.valid && foundSpecs.length <= 2) {
        try {
          const fixMessages: AIMessage[] = [
            {
              role: "system",
              content:
                "You are a graph spec validator. The user asked a math/science question and your previous reply contained a graph spec that failed validation. " +
                "Output ONLY a single corrected JSON graph spec (no markdown fences, no explanation, no other text). " +
                "Use the exact same graph type but fix the listed errors. Include all required fields for that type.",
            },
            {
              role: "user",
              content:
                `The original (invalid) spec was:\n${JSON.stringify(spec, null, 2)}\n\n` +
                `Validation errors:\n- ${validation.errors.join("\n- ")}\n\n` +
                (validation.warnings.length > 0 ? `Auto-correction warnings:\n- ${validation.warnings.join("\n- ")}\n\n` : "") +
                `Output a corrected JSON spec now. Start with { and end with }. Do not include any other text.`,
            },
          ];
          const fixReply = await callAI(fixMessages, null, {
            userId,
            route: "/api/tutor/chat/retry-graph",
          });
          const trimmed = fixReply.trim().replace(/^```[\w-]*\s*/i, "").replace(/```\s*$/i, "");
          const fb = trimmed.indexOf("{");
          const lb = trimmed.lastIndexOf("}");
          if (fb !== -1 && lb !== -1 && lb > fb) {
            const retrySpec = JSON.parse(trimmed.slice(fb, lb + 1));
            const retryValidation = validateAndCorrectGraphSpec(retrySpec);
            if (retryValidation.valid) {
              console.log("[tutor-engine] graph spec retry succeeded — recovered", retrySpec.type);
              validation = retryValidation;
            } else {
              console.error("[tutor-engine] graph spec retry still invalid:", retryValidation.errors.join("; "));
            }
          }
        } catch (retryErr: any) {
          console.error("[tutor-engine] graph spec retry failed:", retryErr?.message);
        }
      }

      if (!validation.valid) {
        console.error("[tutor-engine] graph spec invalid (post-retry):", validation.errors.join("; "));
        continue;
      }
      const correctedSpec = validation.correctedSpec;

      let attachmentType = "graph";
      if (correctedSpec.type === "network") {
        const titleLower = (correctedSpec.title ?? "").toLowerCase();
        if (/concept map|mind map|mindmap/.test(titleLower) || intents.wantsConceptMap) {
          attachmentType = "conceptmap";
        }
      }
      attachments.push({
        type: attachmentType,
        url: null,
        caption: JSON.stringify(correctedSpec),
      });
    }

    // 4) Concept map fallback synthesis (from reply structure)
    if (intents.wantsConceptMap && foundSpecs.length === 0) {
      const PALETTE = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899"];
      let terms: string[] = (reply.match(/\*\*([A-Z][^*]+)\*\*/g) ?? [])
        .slice(0, 8)
        .map((s) => s.slice(2, -2).trim());
      if (terms.length < 3) {
        const headerMatches = reply.match(/^#{1,6}\s+(?:\d+\.\d+\s+)?([A-Z][^\n]+)/gm) ?? [];
        const headerTerms = headerMatches
          .map((h) => h.replace(/^#{1,6}\s+(?:\d+\.\d+\s+)?/, "").trim())
          .filter((t) => t.length >= 3 && t.length <= 30)
          .slice(0, 8);
        const seen = new Set(terms.map((t) => t.toLowerCase()));
        for (const ht of headerTerms) {
          if (!seen.has(ht.toLowerCase())) { terms.push(ht); seen.add(ht.toLowerCase()); }
        }
      }
      let topicName = "Topic";
      const topicMatch = userMessage.match(/(?:concept\s+map|mind\s+map)\s+(?:of\s+)?(.+)/i);
      if (topicMatch) {
        topicName = topicMatch[1].trim().replace(/[.?!]+$/, "").replace(/\bthe\b/gi, "").trim();
        topicName = topicName.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        if (topicName.length > 30) topicName = topicName.slice(0, 30) + "…";
      }
      if (terms.length === 0) {
        terms = topicName !== "Topic" ? ["Definition", "Components", "Process", "Examples", "Importance"] : ["Concept A", "Concept B", "Concept C", "Concept D"];
      }
      const nodes: any[] = [{ id: "n0", label: topicName, color: "#1E40AF" }];
      terms.slice(0, 8).forEach((t, i) => {
        nodes.push({ id: `n${i + 1}`, label: t.length > 30 ? t.slice(0, 30) + "…" : t, color: PALETTE[(i + 1) % PALETTE.length] });
      });
      const edges: any[] = [];
      for (let i = 1; i < nodes.length; i++) edges.push({ from: "n0", to: `n${i}`, label: "part of" });
      const synthesized = { type: "network", title: `Concept Map: ${topicName}`, nodes, edges };
      attachments.push({ type: "conceptmap", url: null, caption: JSON.stringify(synthesized) });
    }
  } catch (parseErr: any) {
    console.error("[tutor-engine] attachment parse failed:", parseErr?.message);
  }

  return attachments;
}

// ---------------------------------------------------------------
// 6. Exam generation block
// ---------------------------------------------------------------

export function parseExamGen(reply: string): any | null {
  try {
    const examGenMatch = reply.match(/```examgen\s*([\s\S]*?)```/);
    if (examGenMatch) {
      let cleaned = examGenMatch[1].trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      }
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      }
    }
  } catch (examParseErr: any) {
    console.error("[tutor-engine] examgen parse failed:", examParseErr?.message);
  }
  return null;
}

// ---------------------------------------------------------------
// 7. Post-process pipeline (graphs + examgen + proof engine)
// ---------------------------------------------------------------

export async function postProcessReply(opts: {
  reply: string;
  userMessage: string;
  userId: string;
  userGrade: string | null;
  intents: TutorIntents;
  thinkingSteps: string[];
}): Promise<{
  reply: string;
  attachments: TutorAttachment[];
  examGen: any | null;
  proof: any | null;
  thinkingSteps: string[];
  proofThinkingSteps: string[];
}> {
  const { reply, userMessage, userId, userGrade, intents, thinkingSteps } = opts;

  // Graph + concept map attachments
  const attachments = await parseGraphAttachments({
    reply,
    userMessage,
    userId,
    intents,
  });

  // Exam generation config
  const examGenRaw = parseExamGen(reply);
  const examGen = examGenRaw ? {
    topic: examGenRaw.topic ?? "General",
    numQuestions: Math.min(40, Math.max(5, Number(examGenRaw.numQuestions) || 10)),
    numPages: Math.min(10, Math.max(1, Number(examGenRaw.numPages) || 2)),
    gradeLevel: examGenRaw.gradeLevel ?? userGrade ?? "General",
    examType: examGenRaw.examType ?? "kcse_style",
    difficulty: examGenRaw.difficulty ?? "medium",
  } : null;

  // Proof Data Engine — validates the reply against curriculum
  let finalReply = reply;
  let proof: any = null;
  try {
    proof = await runProofEngine(reply, userGrade ?? "Form 1", userMessage, userId);
    if (proof.corrections.length > 0) {
      finalReply += "\n\n---\n**🔍 Verification Notes:**\n" + proof.corrections.join("\n");
    }
    if (proof.warnings.length > 0) {
      finalReply += "\n\n**⚠️ Notes:**\n" + proof.warnings.join("\n");
    }
  } catch (proofErr: any) {
    console.error("[tutor-engine] proof engine failed:", proofErr?.message);
  }

  return {
    reply: finalReply,
    attachments,
    examGen,
    proof: proof ? {
      passed: proof.passed,
      curriculumMatch: proof.curriculumMatch,
      readabilityScore: proof.readabilityScore,
      factualConfidence: proof.factualConfidence,
    } : null,
    thinkingSteps,
    proofThinkingSteps: proof?.thinkingSteps ?? [],
  };
}
