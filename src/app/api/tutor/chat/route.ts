import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type ChatMessage as AIMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";
import { buildTeachingProfile } from "@/lib/aware-engine";
import { buildCurriculumContext, getCurriculumForGrade } from "@/lib/curriculum-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/tutor/chat
 *
 * ChatGPT-style persistent AI Tutor (Phase 28+):
 * - Creates/uses a conversation (messages saved to DB, never lost)
 * - AI can fetch images, videos, graphs via web_search
 * - AI can generate concept maps inline (returned as Mermaid-style JSON for client render)
 * - Returns the AI reply + saves both messages to DB
 *
 * Body: {
 *   conversationId?: string,  // null = create new conversation
 *   message: string,
 * }
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const conversationId = (body?.conversationId ?? "").toString().trim() || null;
  const userMessage = (body?.message ?? "").toString().trim();
  // Optional image attachment — base64 data URL (e.g. "data:image/jpeg;base64,...")
  // When present, the AI calls the vision model to analyze the image.
  const imageDataUrl = (body?.image ?? "").toString().trim() || null;

  if (!userMessage && !imageDataUrl) {
    return NextResponse.json({ error: "Message or image is required" }, { status: 400 });
  }

  // Deduct tokens
  const deduct = await checkAndDeductTokens(user.id, "tutor");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, needsUpgrade: true },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: deduct.error, code: deduct.code }, { status: 500 });
  }

  try {
    // 1. Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await db.chatConversation.findFirst({
        where: { id: conversationId, userId: user.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }
    if (!conversation) {
      const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? "…" : "");
      conversation = await db.chatConversation.create({
        data: { userId: user.id, title },
        include: { messages: true },
      });
    }

    // 2. Save the user's message (with optional image attachment)
    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: userMessage || "(Image attached — please analyze)",
        attachments: imageDataUrl ? [{ type: "image", url: imageDataUrl, caption: "Uploaded image" }] as any : null,
      },
    });

    // 3. Build chat history from DB (last 20 for context window)
    const allMessages = await db.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // 4. Detect intent from user message
    const lowerMsg = userMessage.toLowerCase();
    const wantsVideo = /\bvideo\b|\bclip\b|\bwatch\b|youtube|\bsend me.*(video|clip)\b|show me.*(video|clip)\b/i.test(userMessage);
    const wantsImage = /\bimage\b|\bpicture\b|\bphoto\b|\billustration\b/i.test(userMessage) &&
                       !/draw.*(graph|chart|plot|curve|function|polygon|triangle|circle)/i.test(userMessage) &&
                       !/\bdiagram\b.*\bof\b.*\bvenn\b/i.test(userMessage);
    // Graph types — each detected type gets its own JSON spec
    const wantsFunctionPlot = /\b(y\s*=|f\(x\)|graph (?:of )?(?:y|x|sin|cos|tan|x²|x\^))\b|draw\s+(?:y\s*=|f\(x\))/i.test(userMessage) &&
                              !/\b(scatter|bar|pie|histogram|box|venn|tree|number line|vector)\b/i.test(userMessage);
    const wantsScatter = /\b(scatter|data points?|plot (?:the|these|all) (?:data )?points?|line of best fit|velocity.*(vs|versus).*time|distance.*(vs|versus).*time|time series)\b/i.test(userMessage) ||
                         /\(\s*\d+\s*,\s*\d+\s*\)/.test(userMessage); // (x, y) tuples
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
    // Phase 31 — additional grade-leveled math renderers
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
    // Phase 32 — spreadsheet + database
    const wantsCSV = /\bexcel sheet\b|\bspreadsheet\b|\bworksheet\b|\bbuild a sheet\b|make a (food capacity|payment|attendance|inventory|grade book|budget) (sheet|worksheet|spreadsheet)/i.test(userMessage);
    const wantsERDiagram = /\b(er diagram|entity.?relationship|database schema|database design|access table|ms access|simple database|build a database|design a database)/i.test(userMessage);
    // Phase 33 — step-by-step solver
    const wantsSteps = /\bstep by step\b|\bstep[- ]by[- ]step\b|\bshow your work\b|\bhow to solve\b|\bwork it out\b|\bworking for\b/i.test(userMessage) ||
                       (/\bsolve\b/i.test(userMessage) && /=/i.test(userMessage));
    const wantsSearch = /\bfind\b|\bsearch\b|\blook up\b|\bwhat is\b|\bwho is\b|\bwhen did\b|\bhow does\b/i.test(userMessage) && !wantsVideo &&
                       !wantsScatter && !wantsBar && !wantsHistogram && !wantsPie && !wantsVenn &&
                       !wantsNumberLine && !wantsTree && !wantsBoxPlot && !wantsVector && !wantsPolygon;

    // Aggregate "wants graph" — true if ANY graph type detected
    const wantsGraph = wantsFunctionPlot || wantsScatter || wantsBar || wantsHistogram || wantsPie ||
                       wantsVenn || wantsNumberLine || wantsTree || wantsBoxPlot || wantsVector ||
                       wantsPolygon || wantsNetwork || wantsConceptMap || wantsArgand || wantsContour ||
                       wantsVectorField || wantsTessellation || wantsKnot ||
                       wantsPictogram || wantsTally || wantsCarroll || wantsOgive || wantsUnitCircle ||
                       wantsTransform || wantsAxes3D || wantsTwoWay ||
                       wantsCSV || wantsERDiagram || wantsSteps;

    let attachments: Array<{ type: string; url: string | null; caption: string }> = [];
    let searchContext = "";

    // 5. Web search for general queries (and videos, images)
    if (wantsSearch || wantsVideo || wantsImage) {
      try {
        const ZAI = (await import("z-ai-web-dev-sdk")).default;
        const client = await ZAI.create();

        // For videos, explicitly search YouTube
        const searchQuery = wantsVideo
          ? `${userMessage.replace(/video|clip|watch|send me|show me/gi, "").trim()} site:youtube.com`
          : userMessage;

        const searchResult: any = await client.functions.invoke("web_search", {
          query: searchQuery,
          num: wantsVideo ? 5 : 6,
        });

        // SDK returns array of SearchFunctionResultItem (not {results: [...]})
        const results: any[] = Array.isArray(searchResult)
          ? searchResult
          : (searchResult?.results ?? searchResult?.data ?? []);

        if (results.length > 0) {
          // Build context for the AI
          const resultLines = results.slice(0, 6).map((r: any) =>
            `- ${r.name ?? r.title ?? "Result"} (${r.url ?? r.link ?? ""})\n  ${r.snippet ?? r.description ?? ""}`
          ).join("\n");
          searchContext = `\n\nWEB SEARCH RESULTS for "${userMessage}":\n${resultLines}`;

          // Find YouTube videos for video requests
          if (wantsVideo) {
            const ytResults = results.filter((r: any) => {
              const u = r.url ?? r.link ?? "";
              return /youtube\.com\/watch|youtu\.be\//.test(u);
            }).slice(0, 2);

            for (const r of ytResults) {
              const url = r.url ?? r.link ?? "";
              attachments.push({
                type: "video",
                url,
                caption: r.name ?? r.title ?? "YouTube video",
              });
            }
          }

          // Find images via image-search SDK (returns {results:[{original_url, caption}]})
          if (wantsImage) {
            try {
              const imageSearchRes: any = await client.images.search.create({
                query: userMessage.replace(/image|picture|photo|diagram|show me|send me/gi, "").trim(),
                count: 3,
              });
              const imageResults: any[] = imageSearchRes?.results ?? [];
              for (const r of imageResults.slice(0, 2)) {
                const imgUrl = r.original_url ?? r.url ?? r.thumbnail;
                if (imgUrl) {
                  attachments.push({
                    type: "image",
                    url: imgUrl,
                    caption: r.caption ?? r.title ?? "Related image",
                  });
                }
              }
            } catch (imgErr: any) {
              console.error("[tutor-chat] image search failed:", imgErr?.message);
            }
          }
        }
      } catch (e: any) {
        console.error("[tutor-chat] web search failed:", e?.message);
      }
    }

    // 6. Build AI messages with system prompt + curriculum context + search results
    const teachingProfile = buildTeachingProfile(user.grade ?? "Form 1");

    // Build curriculum context using the CBC curriculum engine (Phase 41)
    // This grounds the AI within the student's grade-level curriculum —
    // the AI should NEVER go outside the curriculum topics.
    const curriculumContext = buildCurriculumContext(user.grade ?? "Form 1");

    // Also try to fetch admin-uploaded curriculum content from DB (best-effort)
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

    const systemContent = `You are StudyBuddy, a friendly AI tutor for Kenyan students (CBC / KCSE / KPSEA / KJSEA curriculum). ${teachingProfile.systemPromptSuffix}${curriculumContext}${dbCurriculumContext}${searchContext}

SPECIAL CAPABILITIES — when the user asks, you can do these (the system has already fetched the content for you, just describe and reference it):

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

The "type" field tells the frontend which renderer to use. Available types:

1. function  — { expr: "x^2", xRange, yRange, title, xLabel, yLabel } — y = f(x) plot
2. scatter   — { points: [[x,y],...], lineOfBestFit: true, xLabel, yLabel, title } — data points + best fit
3. bar      — { categories: [...], values: [...], xLabel, yLabel, title } — bar chart
4. histogram — { bins: [{start, end, count},...] } — grouped frequency
5. pie      — { slices: [{label, value, color?},...] } — pie chart
6. venn     — { sets: [{label, value?, color?},...] } — 2-3 set Venn
7. numberline — { range, shadedRange, markers: [{value, label, open}] } — inequality
8. tree     — { root: { label, children: [{label, probability, children},...] } } — probability tree
9. network  — { nodes: [{id, label, color?},...], edges: [{from, to, label?}] } — graph theory + concept maps
10. vector  — { vectors: [{from?, to, label, color?},...], xRange, yRange } — vector arrows
11. polygon — { vertices: [[x,y],...], labels: [...], showAngles, showSides } — geometric figure
12. boxplot  — { datasets: [{label, min, q1, median, q3, max, outliers?},...] } — box-and-whisker
13. slopefield — { expr: "x - y", xRange, yRange, gridSize } — ODE direction field
14. stemleaf — { data: [...], stemUnit, leafUnit } — stem-and-leaf plot
15. frequency_polygon — { points: [{midpoint, frequency},...] } OR { bins: [...] } — frequency polygon
16. freeform — { svg: "<raw SVG markup>", width, height, title } — ANY custom drawing (raw SVG)
17. argand  — { range, points: [{re, im, label, color?},...] } — complex plane
18. contour — { levels: [{level, color?, points?},...] } — topographic contour map
19. vectorfield — { exprP, exprQ, range, gridSize } OR { vectors: [...] } — vector field arrows
20. tessellation — { tile: "hexagon"|"triangle"|"square", cols, rows, tileSize, colors? } — repeating tiles
21. knot    — { knotType: "trefoil"|"figure8" } OR { strands: [...], crossings: [...] } — knot diagram
22. pictogram — { categories: [...], values: [...], symbol: "\u{1F34E}", symbolValue: N } — symbol chart
23. tally   — { categories: [...], counts: [...] } — tally chart
24. carroll — { labelX, labelY, attributeX: [yes,no], attributeY: [yes,no], cells: {topLeft:[...],...} } — Carroll diagram
25. ogive   — { bins: [{start, end, count},...] } OR { points: [[x,y],...] } — cumulative frequency
26. unitcircle — { angle: degrees } — unit circle with sin/cos projections
27. transform — { transformType: "reflect"|"rotate"|"translate"|"enlarge", mirrorLine?, original: [[x,y],...], transformed: [[x,y],...], range } — geometric transformation
28. axes3d  — { range, points: [{x, y, z, label, color?},...] } — 3D coordinate system
29. twoway  — { rowLabels: [...], colLabels: [...], data: [[...],...], rowLabel, colLabel } — contingency table
30. erdiagram — { tables: [{name, fields: [{name, type, pk?, fk?},...]}], relationships: [{from: "table.field", to: "table.field", label?}] } — ER diagram
31. csv     — { headers: [...], rows: [[...],...], downloadName } — spreadsheet with CSV download
32. steps   — { steps: [{title?, expression?, explanation?},...] } — step-by-step solution

IMPORTANT: Generate the spec data from the USER'S question — do NOT use template/placeholder data.
Use the exact values the user provided. If the user says "plot (0,0) (1,5) (2,10)", use those exact points.
If the user says "food capacity: maize 50kg, beans 20kg", use those exact items in the CSV rows.

GENERAL RULES — GENERIC DRAWING PRINCIPLE:
- ALWAYS pick the MOST APPROPRIATE graph type from the 32 types above. Match by the user's question:
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
  * "build me an Excel sheet / spreadsheet / worksheet for [topic]" → csv (with proper headers + rows + a download button)
  * "draw a database schema / ER diagram / Access-style tables" → erdiagram (with tables + PKs/FKs + relationships)
  * "solve ... step by step" / "show your work" / "explain how to solve" → steps (with title, expression, explanation per step)
  * "phase portrait for spiral" → freeform (no dedicated renderer yet)
  * "compass-and-straightedge construction" → freeform
- When the user asks for something you can't express with the 32 specific types,
  use "freeform" with raw SVG. Be creative — you can draw 3D cubes (with
  dashed hidden edges), compass constructions (arcs + lines), phase portraits
  (spiral/saddle/node shapes), contour maps, knot diagrams, tessellations,
  Möbius strips, etc. Just write the SVG markup directly.

CRITICAL RULES — NO MARKDOWN TABLES WHEN A GRAPH IS REQUESTED:
- When the user asks for a database, ER diagram, spreadsheet, worksheet, or
  any structured-data visual, you MUST include a fenced \`\`\`mathgraph ...\`\`\`
  code block with the appropriate JSON spec ("erdiagram" or "csv"). DO NOT
  instead show plain markdown tables in your reply prose.
- Markdown tables (| col1 | col2 |) are FORBIDDEN in database/spreadsheet
  replies — the rendered ER diagram or CSV preview IS the table. Only the
  JSON spec inside the mathgraph block contains the data.
- Your prose should only briefly describe the design (e.g. "Here's a school
  database with Students, Classes, Teachers plus relationships. Tap a table
  to edit fields, or use the Edit button to add tables."). Do NOT echo the
  data in markdown form.

- For spreadsheet/Excel/worksheet requests, ALWAYS use "csv" type with realistic
  rows matching the user's scenario (food capacity, payment schedule, budget,
  attendance, inventory, grade book, etc.). Include the column headers
  matching the user's request.
- For database requests, ALWAYS use "erdiagram" type with sensible tables
  (primary keys, foreign keys, types) matching the user's domain (library,
  school, store, hospital, etc.). Include relationships between FKs and PKs.
- When the user asks to EDIT an existing database/table/spreadsheet (e.g.
  "add a column to the Students table" or "remove the Orders table"),
  include the FULL UPDATED JSON spec in the mathgraph block — not just the
  change. The frontend replaces the previous graph with the updated one,
  it does not stack a second graph. Always include the COMPLETE spec.
- Always include meaningful titles, axis labels, and category labels in the
  spec — these are shown on the rendered diagram.
- Be encouraging and clear. Reply in the same language the user used (English / Kiswahili / French).
- Keep answers under 250 words unless asked for detail.
- Use markdown: **bold**, *italic*, lists (- or 1.), [link](url), \`code\`, fenced code blocks for graphs.
- For MATH EQUATIONS, use LaTeX syntax: inline math $y = mx + b$ or block math $$\\frac{a}{b} = c$$ or $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$. The frontend renders these with KaTeX.
- For SUPERSCRIPTS in plain text, you can also use x², x³, etc. (Unicode), but for complex expressions prefer LaTeX.

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

    const aiMessages: AIMessage[] = [
      { role: "system", content: systemContent },
      ...allMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // 7. Call AI — if an image was attached, use the vision API; otherwise the standard chat.
    let reply = "";
    try {
      if (imageDataUrl) {
        // Vision path — use the z-ai SDK's createVision endpoint directly.
        // The image is passed as a multimodal content item in the user message.
        const ZAI = (await import("z-ai-web-dev-sdk")).default;
        const client = await ZAI.create();
        const visionMessages: any = [
          { role: "system", content: systemContent },
          {
            role: "user",
            content: [
              { type: "text", text: userMessage || "Analyze this image. What is it? Help me understand." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
          // Include the chat history before this message
          ...allMessages
            .slice(0, -1) // exclude the just-saved user message (it's the vision one above)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        const completion: any = await client.chat.completions.createVision({
          model: "glm-4v",
          messages: visionMessages,
        });
        reply =
          completion?.choices?.[0]?.message?.content ??
          completion?.choices?.[0]?.delta?.content ??
          "";
        if (!reply) throw new Error("Vision AI returned empty response");
      } else {
        reply = await callAI(aiMessages, null, { userId: user.id, route: "/api/tutor/chat" });
      }
    } catch (e: any) {
      await refundTokens(user.id, "tutor", deduct.costTokens);
      // Return 200 (not 500) so the client shows the error as a chat message
      // instead of a network error. The error message is displayed in the
      // error banner at the bottom of the chat.
      return NextResponse.json({
        ok: false,
        error: e?.message ?? "AI couldn't respond right now. Please try again.",
      });
    }

    // 8. Parse reply for inline graph / concept map blocks
    // The AI is asked to use ```mathgraph ... ``` blocks, but in practice it
    // often uses ```json, ```text, or no code block at all. We use a lenient
    // parser: scan ALL fenced code blocks AND any inline JSON-looking text
    // in the reply, then keep only the ones that look like graph specs
    // (contain a "type" field matching one of our known graph types).
    try {
      const KNOWN_GRAPH_TYPES = new Set([
        "function", "scatter", "bar", "histogram", "pie", "venn",
        "numberline", "tree", "network", "vector", "polygon", "boxplot",
        "slopefield", "stemleaf", "frequency_polygon", "freeform",
        "argand", "contour", "vectorfield", "tessellation", "knot",
        "pictogram", "tally", "carroll", "ogive", "unitcircle",
        "transform", "axes3d", "twoway", "erdiagram", "csv", "steps",
      ]);

      // Helper: try to parse a string as JSON and check if it has a known graph type
      const tryParseGraphSpec = (raw: string): any | null => {
        let s = raw.trim();
        if (!s) return null;
        // Strip leading/trailing ``` if accidentally included
        s = s.replace(/^```[\w-]*\s*/i, "").replace(/```\s*$/i, "");
        // Find the first { ... } block (in case there's surrounding text)
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
      };

      // 1) Look for fenced code blocks (ANY language tag — mathgraph, json, text, etc.)
      const codeBlockRe = /```([\w-]*)\s*([\s\S]*?)```/g;
      const foundSpecs: any[] = [];
      let codeBlockMatch: RegExpExecArray | null;
      while ((codeBlockMatch = codeBlockRe.exec(reply)) !== null) {
        const lang = (codeBlockMatch[1] ?? "").toLowerCase();
        const body = codeBlockMatch[2] ?? "";
        // Skip non-JSON code blocks like bash, python, javascript, typescript
        // (these are real code snippets, not graph specs)
        if (["bash", "sh", "shell", "python", "py", "javascript", "js", "typescript", "ts", "html", "css", "sql"].includes(lang)) {
          continue;
        }
        const spec = tryParseGraphSpec(body);
        if (spec) {
          foundSpecs.push(spec);
        }
      }

      // 2) Also scan for inline JSON-looking text outside code blocks
      // (when the AI just dumps {"type":"scatter",...} directly in the message)
      // Look for `{"type":"..."` patterns
      const inlineJsonRe = /\{\s*"(?:type|title)"\s*:[^{}]*\}/g;
      const strippedReply = reply.replace(/```[\s\S]*?```/g, ""); // skip already-processed blocks
      let inlineMatch: RegExpExecArray | null;
      while ((inlineMatch = inlineJsonRe.exec(strippedReply)) !== null) {
        // Greedy match — find the full {...} starting at this position
        const start = inlineMatch.index;
        const end = strippedReply.indexOf("}", start);
        if (end === -1) continue;
        // Extend to capture nested braces (graph specs may have nested objects like {bins:[{...}]} or {vectors:[{...}]})
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

      // 3) Convert each found spec into an attachment
      for (const spec of foundSpecs) {
        // For backward compat, network-type specs are tagged as "conceptmap" so the
        // UI shows the Brain icon — UNLESS the spec type is explicitly "network"
        // (which means it was actually a graph-theory network diagram).
        let attachmentType = "graph";
        if (spec.type === "network") {
          // Could be a graph-theory network OR a concept map. If the AI used the
          // old "conceptmap" tag (we already converted that above), or if the
          // title mentions "concept map" / "mind map", label it as conceptmap.
          // Otherwise label as graph.
          const titleLower = (spec.title ?? "").toLowerCase();
          if (/concept map|mind map|mindmap/.test(titleLower) || wantsConceptMap) {
            attachmentType = "conceptmap";
          }
        }
        attachments.push({
          type: attachmentType,
          url: null,
          caption: JSON.stringify(spec),
        });
      }

      // (graphMatch and conceptMapMatch removed — we use foundSpecs.length === 0
      // to decide whether to run the fallback synthesis below.)

      // Fallback synthesis REMOVED — the AI must generate its own graph specs
      // using the mathgraph code block. We no longer inject hardcoded data
      // when the AI forgets. This ensures all drawings are truly generative
      // from the AI's understanding of the user's question, not from templates.
      //
      // If the AI doesn't include a mathgraph block, the user just sees the
      // AI's text reply (which should describe what to draw). They can then
      // ask again with more specific instructions.
      //
      // Exception: concept maps get a minimal fallback because the AI often
      // writes a text outline instead of the JSON spec — we extract the
      // structure from the AI's reply (### headers, **bolded** terms, topic
      // from the question) and build a hub-and-spoke network diagram.
      if (wantsConceptMap && foundSpecs.length === 0) {
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
        let attachmentType = "conceptmap";
        attachments.push({ type: attachmentType, url: null, caption: JSON.stringify(synthesized) });
      }
    } catch (parseErr: any) {
      console.error("[tutor-chat] attachment parse failed:", parseErr?.message);
    }

    // 8b. Parse reply for exam generation blocks (```examgen { ... } ```)
    let examGenConfig: any = null;
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
          examGenConfig = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        }
      }
    } catch (examParseErr: any) {
      console.error("[tutor-chat] examgen parse failed:", examParseErr?.message);
    }

    // 9. Save the AI's reply (with attachments metadata)
    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content: reply,
        attachments: attachments.length > 0 ? (attachments as any) : null,
      },
    });

    // 10. Update conversation timestamp
    await db.chatConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      reply,
      attachments: attachments.length > 0 ? attachments : undefined,
      examGen: examGenConfig ? {
        topic: examGenConfig.topic ?? "General",
        numQuestions: Math.min(40, Math.max(5, Number(examGenConfig.numQuestions) || 10)),
        numPages: Math.min(10, Math.max(1, Number(examGenConfig.numPages) || 2)),
        gradeLevel: examGenConfig.gradeLevel ?? user.grade ?? "General",
        examType: examGenConfig.examType ?? "kcse_style",
        difficulty: examGenConfig.difficulty ?? "medium",
      } : undefined,
      remaining: deduct.remaining,
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    console.error("[tutor-chat] error:", e?.message);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
