import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type ChatMessage as AIMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";
import { buildTeachingProfile } from "@/lib/aware-engine";

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

    // Fetch curriculum context (best-effort)
    let curriculumContext = "";
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
            for (const t of subj.topics.slice(0, 8)) {
              topicLines.push(`### ${t.name}\n${(t.contentMarkdown ?? "").slice(0, 200)}`);
            }
          }
          if (topicLines.length > 0) {
            curriculumContext = `\n\nCURRICULUM CONTENT for ${matchingGrade.name}:\n${topicLines.join("\n").slice(0, 5000)}`;
          }
        }
      }
    } catch {}

    const systemContent = `You are StudyBuddy, a friendly AI tutor for Kenyan students (CBC / KCSE / KPSEA / KJSEA curriculum). ${teachingProfile.systemPromptSuffix}${curriculumContext}${searchContext}

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

The "type" field tells the frontend which renderer to use. Available types:

1. "function" — y = f(x) line plot for math functions.
   JSON spec: {"type":"function", "expr":"x^2", "xRange":[-5,5], "yRange":[0,25], "title":"y = x²", "xLabel":"x", "yLabel":"y"}
   Supports: x^2, sin(x), cos(x), sqrt(x), abs(x), pi, e, log(x), exp(x), any expression using +, -, *, /, ^.

2. "scatter" — scatter plot of data points with optional line of best fit. USE THIS FOR PHYSICS / DATA / EXPERIMENTS (velocity-time, distance-time, data points, best fit line).
   JSON spec: {"type":"scatter", "title":"Velocity vs Time", "xLabel":"Time (s)", "yLabel":"Velocity (m/s)", "points":[[0,0],[1,5],[2,10],[3,15],[4,20],[5,25],[6,30]], "lineOfBestFit":true}
   The line of best fit is computed automatically via linear regression.

3. "bar" — vertical bar chart with categories. USE THIS FOR COMPARING GROUPS / FREQUENCIES.
   JSON spec: {"type":"bar", "title":"Test Scores by Subject", "xLabel":"Subject", "yLabel":"Score", "categories":["Math","English","Science","History"], "values":[85,72,90,68]}

4. "histogram" — like bar but no gaps (frequency distributions / grouped data).
   JSON spec: {"type":"histogram", "title":"Score Distribution", "bins":[{"start":0,"end":20,"count":2},{"start":20,"end":40,"count":5},{"start":40,"end":60,"count":12}]}

5. "pie" — pie chart with labeled slices (percentages of a whole).
   JSON spec: {"type":"pie", "title":"Budget Allocation", "slices":[{"label":"Rent","value":40,"color":"#4F46E5"},{"label":"Food","value":25,"color":"#10B981"},{"label":"Transport","value":15,"color":"#F59E0B"},{"label":"Savings","value":20,"color":"#EF4444"}]}

6. "venn" — 2 or 3 set Venn diagram (sets, unions, intersections).
   JSON spec: {"type":"venn", "title":"Sets A, B, C", "sets":[{"label":"A","color":"#4F46E5","value":30},{"label":"B","color":"#10B981","value":25},{"label":"C","color":"#F59E0B","value":20}]}

7. "numberline" — number line with markers and shaded range (inequalities).
   JSON spec: {"type":"numberline", "title":"x ∈ [-2, 3]", "range":[-5,5], "shadedRange":[-2,3], "markers":[{"value":-2,"label":"[","open":false},{"value":3,"label":"]","open":false}]}
   "open":true → hollow circle (excluded endpoint), "open":false → filled circle (included endpoint).

8. "tree" — probability tree diagram (branching outcomes).
   JSON spec: {"type":"tree", "title":"Coin Flips", "root":{"label":"Start","children":[{"label":"H","probability":"1/2","children":[{"label":"HH","probability":"1/2"},{"label":"HT","probability":"1/2"}]},{"label":"T","probability":"1/2","children":[{"label":"TH","probability":"1/2"},{"label":"TT","probability":"1/2"}]}]}}

9. "network" — graph theory: nodes connected by edges. ALSO USED FOR CONCEPT MAPS.
   For graph theory:
   JSON spec: {"type":"network", "title":"Friend Network", "nodes":[{"id":"a","label":"Alice","color":"#4F46E5"},{"id":"b","label":"Bob","color":"#10B981"}], "edges":[{"from":"a","to":"b","label":"friends","directed":false}]}
   For CONCEPT MAPS: use a hub-and-spoke structure. The first node is the central topic (id="n0"),
   other nodes are subtopics. The frontend auto-detects this layout and places the central node
   in the middle with subtopics radiating out.
   Example concept map of "human digestive system":
   \`\`\`mathgraph
   {"type":"network","title":"Concept Map: Human Digestive System","nodes":[{"id":"n0","label":"Digestive System","color":"#1E40AF"},{"id":"n1","label":"Mouth","color":"#4F46E5"},{"id":"n2","label":"Esophagus","color":"#10B981"},{"id":"n3","label":"Stomach","color":"#F59E0B"},{"id":"n4","label":"Small Intestine","color":"#EF4444"},{"id":"n5","label":"Large Intestine","color":"#8B5CF6"},{"id":"n6","label":"Anus","color":"#06B6D4"}],"edges":[{"from":"n0","to":"n1","label":"starts with"},{"from":"n0","to":"n2","label":"then"},{"from":"n0","to":"n3","label":"then"},{"from":"n0","to":"n4","label":"then"},{"from":"n0","to":"n5","label":"then"},{"from":"n0","to":"n6","label":"ends at"}]}
   \`\`\`
   Use the topic from the user's question as the central node's label (short, 1-3 words).
   Limit to 5-9 subtopic nodes (8 max) so the diagram stays readable.

10. "vector" — directed arrows on a coordinate plane (force / displacement vectors).
    JSON spec: {"type":"vector", "title":"Force Vectors", "xLabel":"x (N)", "yLabel":"y (N)", "vectors":[{"from":[0,0],"to":[3,4],"label":"F1","color":"#4F46E5"},{"from":[0,0],"to":[-2,1],"label":"F2","color":"#EF4444"}], "xRange":[-5,5], "yRange":[-5,5]}

11. "polygon" — 2D geometric figure with labeled vertices, sides, and angles.
    JSON spec: {"type":"polygon", "title":"Triangle ABC", "vertices":[[0,0],[4,0],[2,3]], "labels":["A","B","C"], "showAngles":true, "showSides":true}
    Side lengths are auto-computed from vertex coordinates and shown on the figure.

12. "boxplot" — box-and-whisker plot (quartiles, median, outliers).
    JSON spec: {"type":"boxplot", "title":"Test Scores", "yLabel":"Score", "datasets":[{"label":"Class A","min":45,"q1":60,"median":75,"q3":85,"max":95,"outliers":[30]},{"label":"Class B","min":50,"q1":65,"median":78,"q3":88,"max":92}]}

13. "slopefield" — direction field for a differential equation dy/dx = f(x, y).
    JSON spec: {"type":"slopefield", "title":"Slope Field", "expr":"x - y", "xRange":[-5,5], "yRange":[-5,5], "gridSize":10, "xLabel":"x", "yLabel":"y"}
    The "expr" supports Math.* functions and uses x, y as variables (e.g. "x*y", "sin(x) - y").

14. "stemleaf" — stem-and-leaf plot for raw data.
    JSON spec: {"type":"stemleaf", "title":"Test Scores", "data":[23,25,28,31,32,35,38,42,45,48,52,55,58], "stemUnit":10, "leafUnit":1}
    stemUnit=10 means stem is the tens digit; leafUnit=1 means leaf is the ones digit.

15. "frequency_polygon" — line graph connecting class midpoints to frequencies.
    JSON spec: {"type":"frequency_polygon", "title":"Frequency Polygon", "points":[{"midpoint":15,"frequency":3},{"midpoint":25,"frequency":7},{"midpoint":35,"frequency":12},{"midpoint":45,"frequency":8}]}
    OR using bins: {"type":"frequency_polygon", "bins":[{"start":10,"end":20,"count":3},{"start":20,"end":30,"count":7}]}

16. "freeform" — RAW SVG markup for ANY custom drawing that doesn't fit the other types.
    This is your escape hatch for advanced drawings: 3D solids, contour maps, phase portraits,
    tessellations, Argand diagrams, knot diagrams, vector fields, compass-and-straightedge
    constructions, network graphs with custom layouts, or any other visual you can imagine.
    JSON spec: {"type":"freeform", "title":"Cube", "width":400, "height":300, "svg":"<rect x='50' y='50' width='100' height='100' fill='#4F46E5'/><polygon points='150,50 200,20 200,120 150,150' fill='#8B5CF6'/>"}
    The "svg" field contains raw SVG element markup. You MAY include an outer <svg viewBox="...">...</svg>
    tag (we'll extract the inner content automatically) OR just provide the inner elements
    directly (rect, circle, line, polygon, path, text, ellipse, polyline, g, defs, marker, style).
    We'll wrap your content in our own <svg> with the dimensions from your viewBox or width/height.
    You MUST NOT include: <script>, on* event handlers, external http(s) URLs, javascript: URLs,
    or any external resource references (these are stripped by the sanitizer for security).

    TIPS for high-quality drawings:
    - For curves (knots, spirals, topological figures), use <path d="M ... C ..."/> with cubic
      Bézier curves (the C command). Don't try to fake curves with <line>.
    - To draw "over/under" crossings (knot diagrams), use stroke="white" with strokeWidth=8
      as a background "gap" before drawing the colored strand on top.
    - For 3D solids (cube, pyramid), draw the back/hidden edges with strokeDasharray="4 3"
      and the front edges solid.
    - For phase portraits (differential equations), use small <line> arrows in a grid pattern.
    - For tessellations, repeat <polygon> elements with transform="translate(...)".
    - Always use absolute coordinates that fit within your viewBox.

SPECIALIZED DEDICATED RENDERERS (prefer these over freeform when applicable):
17. "argand" — Argand diagram for complex numbers on the complex plane (Re/Im axes).
    JSON spec: {"type":"argand", "title":"Argand Diagram", "range":[-3,3], "points":[{"re":2,"im":1,"label":"z₁","color":"#4F46E5"},{"re":-1,"im":1.5,"label":"z₂","color":"#10B981"}]}
    Each point is drawn as a vector from origin to (Re, Im) with a labeled dot.

18. "contour" — contour map (topographic-style level curves) for f(x, y) = z.
    JSON spec: {"type":"contour", "title":"Contour Map", "levels":[{"level":10,"color":"#06B6D4"},{"level":20,"color":"#4F46E5"},{"level":30,"color":"#EF4444"}]}
    Each level can include optional "points" (a closed polygon path); if missing, the renderer
    falls back to circular rings centered on the canvas.

19. "vectorfield" — vector field F(x,y) = (P(x,y), Q(x,y)) as arrows on a grid.
    JSON spec: {"type":"vectorfield", "title":"Vector Field", "exprP":"-y", "exprQ":"x", "range":[-5,5], "gridSize":8}
    OR for explicit vectors: {"type":"vectorfield", "vectors":[{"from":[0,0],"to":[2,0]},{"from":[0,1],"to":[1,2]}]}
    Arrows colored by magnitude (cyan=weak → indigo=medium → red=strong).

20. "tessellation" — repeating geometric tile pattern that fills the plane.
    JSON spec: {"type":"tessellation", "title":"Hexagon Tessellation", "tile":"hexagon", "cols":6, "rows":5, "tileSize":50, "colors":["#4F46E5","#10B981","#F59E0B"]}
    Predefined tiles: "triangle", "square", "hexagon". Or use "tileVertices":[[x,y],...] for custom polygon.

21. "knot" — knot diagram (trefoil, figure-eight, or custom) with over/under crossings.
    JSON spec: {"type":"knot", "title":"Trefoil Knot", "knotType":"trefoil"}
    Predefined: "trefoil" (3 crossings) and "figure8" (4 crossings). For custom knots, pass
    {"strands":[{"path":"M ... C ...","color":"#4F46E5"}], "crossings":[{"x":150,"y":100}]}.

MATHEMATICAL DRAWING FAMILIES — additional dedicated renderers
covering Grade 1 through university math:

22. "pictogram" — symbol-based chart (Grade 1-3). Each symbol = N items.
    JSON spec: {"type":"pictogram", "title":"Favorite Fruits", "categories":["Apples","Bananas","Oranges"], "values":[8,5,10], "symbol":"🍎", "symbolValue":2}
    The symbol can be an emoji (🍎, ⭐, 🚗) or any character.

23. "tally" — tally chart (Grade 1-5). Groups of 5 strokes (4 vertical + 1 diagonal).
    JSON spec: {"type":"tally", "title":"Color Tally", "categories":["Red","Blue","Green","Yellow"], "counts":[8,12,5,3]}

24. "carroll" — Carroll diagram (Grade 4-6). 2x2 sort by two attributes.
    JSON spec: {"type":"carroll", "title":"Shape Sort", "labelX":"Is Red?", "labelY":"Is Square?", "attributeX":["Yes","No"], "attributeY":["Yes","No"], "cells":{"topLeft":["red square A","red square B"], "topRight":["blue square"], "bottomLeft":["red circle"], "bottomRight":["blue triangle"]}}

25. "ogive" — cumulative frequency curve (Grade 9-12).
    JSON spec: {"type":"ogive", "title":"Ogive", "bins":[{"start":0,"end":10,"count":3},{"start":10,"end":20,"count":7},{"start":20,"end":30,"count":12}]}
    OR explicit points: {"type":"ogive", "points":[[0,0],[10,3],[20,10],[30,22]]}

26. "unitcircle" — trigonometric unit circle (Grade 10-12). Shows angle θ, radius, cos θ, sin θ.
    JSON spec: {"type":"unitcircle", "title":"Unit Circle", "angle":45}
    The angle is in DEGREES (0-360). The renderer auto-projects cos θ to x-axis, sin θ to y-axis,
    draws the radius line, angle arc, and labels.

27. "transform" — geometric transformation (Grade 9-12). Reflect/rotate/translate/enlarge.
    JSON spec: {"type":"transform", "title":"Reflect in y-axis", "transformType":"reflect", "mirrorLine":"y", "original":[[1,1],[3,1],[2,3]], "transformed":[[-1,1],[-3,1],[-2,3]], "range":[-5,5]}
    transformType: "reflect" | "rotate" | "translate" | "enlarge".
    mirrorLine: "x" | "y" | "y=x" | "y=-x" (only for reflect).

28. "axes3d" — 3D coordinate system (Grade 11-university). x/y/z axes with optional points.
    JSON spec: {"type":"axes3d", "title":"3D Coordinates", "range":[-3,3], "points":[{"x":2,"y":1,"z":3,"label":"P(2,1,3)","color":"#4F46E5"}]}
    Uses isometric projection. Negative axes are dashed. Each point has projection lines to each axis.

29. "twoway" — two-way / contingency table (Grade 9-12). Rows × columns with cell counts.
    JSON spec: {"type":"twoway", "title":"Gender × Sport Preference", "rowLabels":["Male","Female"], "colLabels":["Football","Netball","Tennis"], "data":[[15,5,8],[3,18,6]], "rowLabel":"Gender", "colLabel":"Sport"}
    Row and column totals are auto-computed.

30. "erdiagram" — Entity-Relationship diagram / database schema (Access-style table view).
    Shows tables as boxes with field lists, primary keys (🔑), foreign keys (🔗),
    and relationship lines between FKs and PKs.
    JSON spec: {"type":"erdiagram", "title":"Library Database Schema", "tables":[{"name":"Students","fields":[{"name":"id","type":"INT","pk":true},{"name":"name","type":"VARCHAR(100)"},{"name":"class_id","type":"INT","fk":"Classes.id"}]},{"name":"Classes","fields":[{"name":"id","type":"INT","pk":true},{"name":"name","type":"VARCHAR(50)"}]}], "relationships":[{"from":"Students.class_id","to":"Classes.id","label":"belongs to"}]}

31. "csv" — spreadsheet / worksheet (Excel/CSV preview). For when the user asks for
    "Excel sheet", "spreadsheet", "worksheet", "table of data", "build a sheet".
    Renders an HTML table with a "Download CSV" button (opens in Excel/Google Sheets).
    JSON spec: {"type":"csv", "title":"Food Capacity Worksheet", "downloadName":"food-capacity.csv", "headers":["Item","Quantity","Unit","Cost per unit","Total"], "rows":[["Maize flour","50","kg","120","6000"],["Beans","20","kg","200","4000"],["Rice","15","kg","250","3750"],["Cooking oil","5","litres","300","1500"]]}

32. "steps" — step-by-step solution (for algebra, calculus, physics, multi-step
    reasoning problems). Renders each step as a numbered expandable block. Use
    this when the user asks to "solve step by step", "show your work", "explain
    how to solve", or when working through any problem with multiple steps.
    JSON spec: {"type":"steps", "title":"Solve 2x + 5 = 15", "steps":[{"title":"Start with the equation","expression":"2x + 5 = 15","explanation":"We want to isolate x."},{"title":"Subtract 5 from both sides","expression":"2x = 15 - 5 = 10","explanation":"Inverse operation: subtract the same value from both sides."},{"title":"Divide both sides by 2","expression":"x = 10 / 2 = 5","explanation":"Divide to isolate x."},{"title":"Final answer","expression":"x = 5","explanation":"The solution is x = 5."}]}

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
- For SUPERSCRIPTS in plain text, you can also use x², x³, etc. (Unicode), but for complex expressions prefer LaTeX.`;

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

      // Fallback synthesis — if user wanted a graph but AI didn't include ANY graph spec,
      // we synthesize a sensible default based on the detected type. This makes the system
      // robust to AI mistakes (e.g. the user's velocity-time complaint — AI gave y=x² instead
      // of a scatter plot, so we override with a scatter plot extracted from the data).
      if (wantsGraph && foundSpecs.length === 0) {
        let synthesized: any = null;

        if (wantsScatter) {
          // Try to extract data points from the user message (and the AI's reply table)
          // Look for "(0,0), (1,5)..." patterns OR "| 0 | 0 |" table rows
          const tupleMatches = userMessage.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g);
          let points: Array<[number, number]> = [];

          if (tupleMatches) {
            for (const t of tupleMatches) {
              const m = t.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
              if (m) points.push([parseFloat(m[1]), parseFloat(m[2])]);
            }
          }

          // If no tuples, try parsing a markdown table from the AI reply
          if (points.length === 0) {
            const tableRowRe = /\|\s*(-?\d+(?:\.\d+)?)\s*\|\s*(-?\d+(?:\.\d+)?)\s*\|/g;
            let m;
            while ((m = tableRowRe.exec(reply)) !== null) {
              points.push([parseFloat(m[1]), parseFloat(m[2])]);
            }
          }

          // If still no points, generate a simple linear sample for demo
          if (points.length === 0) {
            for (let x = 0; x <= 6; x++) points.push([x, x * 5]);
          }

          // Detect labels from the message ("velocity vs time" → xLabel="Time", yLabel="Velocity")
          const xLabelMatch = userMessage.match(/(\w+)\s*(?:vs|versus)\s*(\w+)/i);
          const xLabel = xLabelMatch?.[1] ?? "x";
          const yLabel = xLabelMatch?.[2] ?? "y";

          synthesized = {
            type: "scatter",
            title: `${yLabel} vs ${xLabel}`,
            xLabel,
            yLabel,
            points,
            lineOfBestFit: true,
          };
        } else if (wantsFunctionPlot) {
          const exprMatch = userMessage.match(/y\s*=\s*([^\s,)]+)/i) ||
                            userMessage.match(/f\(x\)\s*=\s*([^\s,)]+)/i) ||
                            userMessage.match(/graph\s+(?:of\s+)?([^\s,)]+)/i);
          const expr = exprMatch?.[1] ?? "x^2";
          synthesized = {
            type: "function",
            expr,
            xRange: [-5, 5],
            yRange: [-25, 25],
            title: `y = ${expr}`,
          };
        } else if (wantsBar) {
          synthesized = {
            type: "bar",
            title: "Bar Chart",
            categories: ["A", "B", "C", "D"],
            values: [10, 25, 18, 30],
          };
        } else if (wantsHistogram) {
          synthesized = {
            type: "histogram",
            title: "Histogram",
            bins: [
              { start: 0, end: 20, count: 3 },
              { start: 20, end: 40, count: 7 },
              { start: 40, end: 60, count: 12 },
              { start: 60, end: 80, count: 8 },
              { start: 80, end: 100, count: 2 },
            ],
          };
        } else if (wantsPie) {
          synthesized = {
            type: "pie",
            title: "Pie Chart",
            slices: [
              { label: "A", value: 40 },
              { label: "B", value: 30 },
              { label: "C", value: 20 },
              { label: "D", value: 10 },
            ],
          };
        } else if (wantsVenn) {
          synthesized = {
            type: "venn",
            title: "Venn Diagram",
            sets: [
              { label: "A", value: 30 },
              { label: "B", value: 25 },
              { label: "C", value: 20 },
            ],
          };
        } else if (wantsNumberLine) {
          // Try to extract an inequality like "-2 ≤ x ≤ 3"
          const ineqMatch = userMessage.match(/(-?\d+(?:\.\d+)?)\s*[<≤]\s*x\s*[<≤]\s*(-?\d+(?:\.\d+)?)/i);
          const lo = ineqMatch ? parseFloat(ineqMatch[1]) : -2;
          const hi = ineqMatch ? parseFloat(ineqMatch[2]) : 3;
          const range: [number, number] = [Math.floor(Math.min(lo, -2) * 1.5), Math.ceil(Math.max(hi, 3) * 1.5)];
          synthesized = {
            type: "numberline",
            title: `x ∈ [${lo}, ${hi}]`,
            range,
            shadedRange: [lo, hi],
            markers: [
              { value: lo, label: "[", open: false },
              { value: hi, label: "]", open: false },
            ],
          };
        } else if (wantsTree) {
          synthesized = {
            type: "tree",
            title: "Tree Diagram",
            root: {
              label: "S",
              children: [
                { label: "A", probability: "1/2", children: [{ label: "A1", probability: "1/2" }, { label: "A2", probability: "1/2" }] },
                { label: "B", probability: "1/2", children: [{ label: "B1", probability: "1/2" }, { label: "B2", probability: "1/2" }] },
              ],
            },
          };
        } else if (wantsBoxPlot) {
          synthesized = {
            type: "boxplot",
            title: "Box Plot",
            datasets: [
              { label: "Class A", min: 45, q1: 60, median: 75, q3: 85, max: 95, outliers: [30] },
              { label: "Class B", min: 50, q1: 65, median: 78, q3: 88, max: 92 },
            ],
          };
        } else if (wantsVector) {
          synthesized = {
            type: "vector",
            title: "Vector Diagram",
            vectors: [
              { from: [0, 0], to: [3, 4], label: "v₁", color: "#4F46E5" },
              { from: [0, 0], to: [-2, 1], label: "v₂", color: "#EF4444" },
            ],
            xRange: [-5, 5],
            yRange: [-5, 5],
          };
        } else if (wantsPolygon) {
          // Default to a triangle if shape can't be parsed; try to parse coords if user gave them
          const coordMatches = userMessage.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g);
          let vertices: Array<[number, number]> = [[0, 0], [4, 0], [2, 3]];
          if (coordMatches && coordMatches.length >= 3) {
            vertices = coordMatches.slice(0, 8).map((s) => {
              const m = s.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
              return m ? [parseFloat(m[1]), parseFloat(m[2])] as [number, number] : [0, 0];
            });
          }
          const labels = vertices.map((_, i) => String.fromCharCode(65 + i));
          synthesized = {
            type: "polygon",
            title: "Geometric Figure",
            vertices,
            labels,
            showAngles: true,
            showSides: true,
          };
        } else if (wantsNetwork) {
          synthesized = {
            type: "network",
            title: "Network Graph",
            nodes: [
              { id: "a", label: "A" },
              { id: "b", label: "B" },
              { id: "c", label: "C" },
              { id: "d", label: "D" },
            ],
            edges: [
              { from: "a", to: "b" },
              { from: "b", to: "c" },
              { from: "c", to: "d" },
              { from: "a", to: "d" },
            ],
          };
        } else if (wantsConceptMap) {
          // Build a concept map from the AI reply.
          // Strategy: extract **bolded** terms, then ### headers, then key
          // phrases from the user's question. Use the user's topic as the
          // central node and branch out to the extracted subtopics.
          const PALETTE = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899"];

          // 1) Bolded terms (highest priority)
          let terms: string[] = (reply.match(/\*\*([A-Z][^*]+)\*\*/g) ?? [])
            .slice(0, 8)
            .map((s) => s.slice(2, -2).trim());

          // 2) Markdown headers — ### 1.1 Mouth / ## Mouth / # Mouth
          if (terms.length < 3) {
            const headerMatches = reply.match(/^#{1,6}\s+(?:\d+\.\d+\s+)?([A-Z][^\n]+)/gm) ?? [];
            const headerTerms = headerMatches
              .map((h) => h.replace(/^#{1,6}\s+(?:\d+\.\d+\s+)?/, "").trim())
              .filter((t) => t.length >= 3 && t.length <= 30)
              .slice(0, 8);
            // Merge, dedupe (case-insensitive), preserve order
            const seen = new Set(terms.map((t) => t.toLowerCase()));
            for (const ht of headerTerms) {
              if (!seen.has(ht.toLowerCase())) {
                terms.push(ht);
                seen.add(ht.toLowerCase());
              }
            }
          }

          // 3) Topic words from the user's question (e.g. "concept map of the
          // human digestive system" → central node "Human Digestive System")
          let topicName = "Topic";
          const topicMatch = userMessage.match(/(?:concept\s+map|mind\s+map)\s+(?:of\s+)?(.+)/i);
          if (topicMatch) {
            topicName = topicMatch[1]
              .trim()
              .replace(/[.?!]+$/, "")
              .replace(/\bthe\b/gi, "")
              .trim();
            // Title-case each word
            topicName = topicName
              .split(/\s+/)
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(" ");
            // Limit length
            if (topicName.length > 30) topicName = topicName.slice(0, 30) + "…";
          }

          // If still no terms extracted, generate sensible defaults based on topic
          if (terms.length === 0) {
            const fallbackTerms = topicName !== "Topic"
              ? ["Definition", "Components", "Process", "Examples", "Importance"]
              : ["Concept A", "Concept B", "Concept C", "Concept D"];
            terms = fallbackTerms;
          }

          // Build the concept map: central topic node + subtopic nodes radiating out
          const nodes: any[] = [];
          nodes.push({ id: "n0", label: topicName, color: "#1E40AF" }); // darker color for the central node
          terms.slice(0, 8).forEach((t, i) => {
            nodes.push({
              id: `n${i + 1}`,
              label: t.length > 30 ? t.slice(0, 30) + "…" : t,
              color: PALETTE[(i + 1) % PALETTE.length],
            });
          });
          // Connect each subtopic to the central node
          const edges: any[] = [];
          for (let i = 1; i < nodes.length; i++) {
            edges.push({ from: "n0", to: `n${i}`, label: "part of" });
          }

          synthesized = {
            type: "network",
            title: `Concept Map: ${topicName}`,
            nodes,
            edges,
          };
        } else if (wantsArgand) {
          // Default Argand diagram if AI doesn't include the spec
          const complexMatch = userMessage.match(/\bz_?(\d+|[ivIV]+)\b\s*=\s*(\-?\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)i/);
          if (complexMatch) {
            const re = parseFloat(complexMatch[2]);
            const im = complexMatch[3] === "-" ? -parseFloat(complexMatch[4]) : parseFloat(complexMatch[4]);
            const label = `z${complexMatch[1]}`;
            synthesized = {
              type: "argand",
              title: "Argand Diagram",
              range: [-Math.max(Math.abs(re), Math.abs(im)) - 1, Math.max(Math.abs(re), Math.abs(im)) + 1],
              points: [{ re, im, label, color: "#4F46E5" }],
            };
          } else {
            synthesized = {
              type: "argand",
              title: "Argand Diagram",
              range: [-3, 3],
              points: [
                { re: 2, im: 1, label: "z₁", color: "#4F46E5" },
                { re: -1, im: 1.5, label: "z₂", color: "#10B981" },
              ],
            };
          }
        } else if (wantsContour) {
          synthesized = {
            type: "contour",
            title: "Contour Map",
            levels: [
              { level: 10, color: "#06B6D4" },
              { level: 20, color: "#10B981" },
              { level: 30, color: "#F59E0B" },
              { level: 40, color: "#EF4444" },
            ],
          };
        } else if (wantsVectorField) {
          // Try to extract P and Q from "F(x,y) = (P, Q)"
          const fieldMatch = userMessage.match(/\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/);
          const exprP = fieldMatch?.[1] ?? "-y";
          const exprQ = fieldMatch?.[2] ?? "x";
          synthesized = {
            type: "vectorfield",
            title: "Vector Field",
            exprP, exprQ,
            range: [-5, 5],
            gridSize: 8,
          };
        } else if (wantsTessellation) {
          const tileMatch = userMessage.match(/\b(hexagon|triangle|square)\b/i);
          const tile = tileMatch?.[1]?.toLowerCase() ?? "hexagon";
          synthesized = {
            type: "tessellation",
            title: `${tile.charAt(0).toUpperCase() + tile.slice(1)} Tessellation`,
            tile,
            cols: 6,
            rows: 5,
            tileSize: 50,
          };
        } else if (wantsKnot) {
          const isFigure8 = /figure.?eight|fig4|4_1/i.test(userMessage);
          synthesized = {
            type: "knot",
            title: isFigure8 ? "Figure-Eight Knot (4_1)" : "Trefoil Knot (3_1)",
            knotType: isFigure8 ? "figure8" : "trefoil",
          };
        } else if (wantsPictogram) {
          // Extract categories + values from the message
          const symbolMatch = userMessage.match(/([\u{1F000}-\u{1FFFF}])/u);
          const symbol = symbolMatch?.[1] ?? "●";
          synthesized = {
            type: "pictogram",
            title: "Pictogram",
            categories: ["A", "B", "C", "D"],
            values: [6, 9, 4, 8],
            symbol,
            symbolValue: 1,
          };
        } else if (wantsTally) {
          // Try to extract categories + counts from the message
          const pairs = userMessage.matchAll(/(\b[A-Z][a-z]+)\s*(?:=|:|\s)\s*(\d+)/g);
          const categories: string[] = [];
          const counts: number[] = [];
          for (const m of pairs) {
            categories.push(m[1]);
            counts.push(parseInt(m[2], 10));
          }
          if (categories.length === 0) {
            synthesized = {
              type: "tally",
              title: "Tally Chart",
              categories: ["Red", "Blue", "Green", "Yellow"],
              counts: [8, 12, 5, 3],
            };
          } else {
            synthesized = { type: "tally", title: "Tally Chart", categories, counts };
          }
        } else if (wantsCarroll) {
          synthesized = {
            type: "carroll",
            title: "Carroll Diagram",
            labelX: "Attribute 1",
            labelY: "Attribute 2",
            attributeX: ["Yes", "No"],
            attributeY: ["Yes", "No"],
            cells: {
              topLeft: ["item 1", "item 2"],
              topRight: ["item 3"],
              bottomLeft: ["item 4"],
              bottomRight: ["item 5"],
            },
          };
        } else if (wantsOgive) {
          // Try to parse bins from the message
          const binPairs = userMessage.matchAll(/(\d+)\s*[-–]\s*(\d+)\s*[:(]\s*(\d+)/g);
          const bins: Array<{ start: number; end: number; count: number }> = [];
          for (const m of binPairs) {
            bins.push({ start: parseInt(m[1], 10), end: parseInt(m[2], 10), count: parseInt(m[3], 10) });
          }
          synthesized = bins.length > 0
            ? { type: "ogive", title: "Ogive (Cumulative Frequency)", bins }
            : {
                type: "ogive",
                title: "Ogive (Cumulative Frequency)",
                bins: [
                  { start: 0, end: 10, count: 3 },
                  { start: 10, end: 20, count: 7 },
                  { start: 20, end: 30, count: 12 },
                  { start: 30, end: 40, count: 5 },
                ],
              };
        } else if (wantsUnitCircle) {
          const angleMatch = userMessage.match(/(\d+)\s*(?:°|degrees?|deg)/);
          const angle = angleMatch ? parseInt(angleMatch[1], 10) : 45;
          synthesized = {
            type: "unitcircle",
            title: `Unit Circle (θ = ${angle}°)`,
            angle,
          };
        } else if (wantsTransform) {
          // Try to extract vertices from "(0,0), (3,1), (2,3)" patterns
          const coordMatches = userMessage.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g);
          let original: Array<[number, number]> = [[1, 1], [3, 1], [2, 3]];
          if (coordMatches && coordMatches.length >= 3) {
            original = coordMatches.slice(0, 6).map((s) => {
              const m = s.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
              return m ? [parseFloat(m[1]), parseFloat(m[2])] as [number, number] : [0, 0];
            });
          }
          // Determine mirror line / transform type
          const mirrorMatch = userMessage.match(/\b(x|y|x-axis|y-axis|y\s*=\s*x|y\s*=\s*-x)\s*-?\s*axis?\b/i);
          let mirrorLine: "x" | "y" | "y=x" | "y=-x" = "y";
          const m = mirrorMatch?.[1]?.toLowerCase() ?? "y";
          if (m === "x" || m === "x-axis") mirrorLine = "x";
          else if (m === "y=x") mirrorLine = "y=x";
          else if (m === "y=-x") mirrorLine = "y=-x";

          // Compute transformed vertices
          let transformed: Array<[number, number]>;
          if (mirrorLine === "y") {
            transformed = original.map(([x, y]) => [-x, y] as [number, number]);
          } else if (mirrorLine === "x") {
            transformed = original.map(([x, y]) => [x, -y] as [number, number]);
          } else if (mirrorLine === "y=x") {
            transformed = original.map(([x, y]) => [y, x] as [number, number]);
          } else {
            transformed = original.map(([x, y]) => [-y, -x] as [number, number]);
          }

          synthesized = {
            type: "transform",
            title: `Reflect across ${mirrorLine}`,
            transformType: "reflect",
            mirrorLine,
            original,
            transformed,
            range: [-5, 5],
          };
        } else if (wantsAxes3D) {
          // Try to extract a 3D point "(x, y, z)" from the message
          const pointMatch = userMessage.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
          if (pointMatch) {
            const [x, y, z] = [parseInt(pointMatch[1], 10), parseInt(pointMatch[2], 10), parseInt(pointMatch[3], 10)];
            synthesized = {
              type: "axes3d",
              title: "3D Coordinate System",
              range: [-Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) - 1, Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) + 1],
              points: [{ x, y, z, label: `P(${x}, ${y}, ${z})`, color: "#4F46E5" }],
            };
          } else {
            synthesized = {
              type: "axes3d",
              title: "3D Coordinate System",
              range: [-3, 3],
              points: [{ x: 2, y: 1, z: 3, label: "P(2, 1, 3)", color: "#4F46E5" }],
            };
          }
        } else if (wantsTwoWay) {
          synthesized = {
            type: "twoway",
            title: "Two-Way Table",
            rowLabels: ["Row A", "Row B"],
            colLabels: ["Col 1", "Col 2", "Col 3"],
            data: [[15, 5, 8], [3, 18, 6]],
            rowLabel: "Row",
            colLabel: "Column",
          };
        } else if (wantsCSV) {
          // Spreadsheet / Excel worksheet — synthesize a generic data table
          // matching the user's scenario (we try to detect keywords).
          const lowerMsg = userMessage.toLowerCase();
          let headers: string[] = ["Item", "Quantity", "Unit"];
          let rows: string[][] = [
            ["Item A", "10", "units"],
            ["Item B", "20", "units"],
            ["Item C", "15", "units"],
          ];
          let downloadName = "worksheet.csv";
          let title = "Worksheet";

          // Food capacity
          if (/food|capacity|menu|meal|kitchen|recipe|ingredient/i.test(lowerMsg)) {
            title = "Food Capacity Worksheet";
            downloadName = "food-capacity.csv";
            headers = ["Food Item", "Quantity", "Unit", "Cost per Unit (KSh)", "Total Cost (KSh)"];
            rows = [
              ["Maize flour", "50", "kg", "120", "6000"],
              ["Beans", "20", "kg", "200", "4000"],
              ["Rice", "15", "kg", "250", "3750"],
              ["Cooking oil", "5", "litres", "300", "1500"],
              ["Vegetables", "30", "kg", "80", "2400"],
              ["Meat", "10", "kg", "500", "5000"],
            ];
          } else if (/payment|salary|wage|payroll/i.test(lowerMsg)) {
            title = "Payment Schedule";
            downloadName = "payment-schedule.csv";
            headers = ["Employee", "Hours", "Rate (KSh/hr)", "Gross (KSh)", "Tax (KSh)", "Net (KSh)"];
            rows = [
              ["Alice", "40", "200", "8000", "1200", "6800"],
              ["Bob", "35", "180", "6300", "945", "5355"],
              ["Carol", "40", "250", "10000", "1500", "8500"],
            ];
          } else if (/attendance|register/i.test(lowerMsg)) {
            title = "Attendance Register";
            downloadName = "attendance.csv";
            headers = ["Student Name", "Mon", "Tue", "Wed", "Thu", "Fri", "Total Present"];
            rows = [
              ["Alice Otieno", "P", "P", "P", "A", "P", "4"],
              ["Bob Kamau", "P", "A", "P", "P", "P", "4"],
              ["Carol Wanjiku", "P", "P", "P", "P", "P", "5"],
            ];
          } else if (/grade|mark|score|report card/i.test(lowerMsg)) {
            title = "Grade Book";
            downloadName = "grade-book.csv";
            headers = ["Student", "Math", "English", "Science", "Average", "Grade"];
            rows = [
              ["Alice", "85", "78", "92", "85", "A"],
              ["Bob", "72", "80", "75", "76", "B"],
              ["Carol", "90", "88", "95", "91", "A"],
            ];
          } else if (/budget|finance|expense/i.test(lowerMsg)) {
            title = "Budget Worksheet";
            downloadName = "budget.csv";
            headers = ["Category", "Planned (KSh)", "Actual (KSh)", "Difference"];
            rows = [
              ["Rent", "15000", "15000", "0"],
              ["Food", "8000", "9200", "-1200"],
              ["Transport", "3000", "2500", "+500"],
              ["Savings", "5000", "5000", "0"],
            ];
          } else if (/inventory|stock|product/i.test(lowerMsg)) {
            title = "Inventory Sheet";
            downloadName = "inventory.csv";
            headers = ["Product", "Stock", "Reorder Level", "Price (KSh)", "Status"];
            rows = [
              ["Maize flour 2kg", "45", "20", "180", "OK"],
              ["Sugar 1kg", "8", "15", "150", "LOW"],
              ["Cooking oil 1L", "30", "10", "320", "OK"],
            ];
          }

          synthesized = {
            type: "csv",
            title,
            downloadName,
            headers,
            rows,
          };
        } else if (wantsERDiagram) {
          // Database schema — pick a sensible default based on the user's domain
          const lowerMsg = userMessage.toLowerCase();
          let title = "Database Schema (ER Diagram)";
          let tables: any[] = [];
          let relationships: any[] = [];

          if (/school|student|class|teacher/i.test(lowerMsg)) {
            title = "School Database Schema";
            tables = [
              {
                name: "Students",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "name", type: "VARCHAR(100)" },
                  { name: "class_id", type: "INT", fk: "Classes.id" },
                ],
              },
              {
                name: "Classes",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "name", type: "VARCHAR(50)" },
                  { name: "teacher_id", type: "INT", fk: "Teachers.id" },
                ],
              },
              {
                name: "Teachers",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "name", type: "VARCHAR(100)" },
                  { name: "subject", type: "VARCHAR(50)" },
                ],
              },
            ];
            relationships = [
              { from: "Students.class_id", to: "Classes.id", label: "enrolled in" },
              { from: "Classes.teacher_id", to: "Teachers.id", label: "taught by" },
            ];
          } else if (/library|book|borrow/i.test(lowerMsg)) {
            title = "Library Database Schema";
            tables = [
              {
                name: "Books",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "title", type: "VARCHAR(200)" },
                  { name: "author_id", type: "INT", fk: "Authors.id" },
                ],
              },
              {
                name: "Authors",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "name", type: "VARCHAR(100)" },
                ],
              },
              {
                name: "Loans",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "book_id", type: "INT", fk: "Books.id" },
                  { name: "borrower_id", type: "INT", fk: "Borrowers.id" },
                  { name: "loan_date", type: "DATE" },
                ],
              },
              {
                name: "Borrowers",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "name", type: "VARCHAR(100)" },
                ],
              },
            ];
            relationships = [
              { from: "Books.author_id", to: "Authors.id", label: "written by" },
              { from: "Loans.book_id", to: "Books.id", label: "loaned" },
              { from: "Loans.borrower_id", to: "Borrowers.id", label: "borrowed by" },
            ];
          } else if (/store|shop|product|order|customer/i.test(lowerMsg)) {
            title = "Store Database Schema";
            tables = [
              {
                name: "Customers",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "name", type: "VARCHAR(100)" },
                  { name: "email", type: "VARCHAR(100)" },
                ],
              },
              {
                name: "Products",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "name", type: "VARCHAR(100)" },
                  { name: "price", type: "DECIMAL(10,2)" },
                ],
              },
              {
                name: "Orders",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "customer_id", type: "INT", fk: "Customers.id" },
                  { name: "order_date", type: "DATE" },
                ],
              },
              {
                name: "Order_Items",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "order_id", type: "INT", fk: "Orders.id" },
                  { name: "product_id", type: "INT", fk: "Products.id" },
                  { name: "quantity", type: "INT" },
                ],
              },
            ];
            relationships = [
              { from: "Orders.customer_id", to: "Customers.id", label: "placed by" },
              { from: "Order_Items.order_id", to: "Orders.id", label: "part of" },
              { from: "Order_Items.product_id", to: "Products.id", label: "contains" },
            ];
          } else {
            // Generic / hospital / etc. — fallback default
            tables = [
              {
                name: "Users",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "name", type: "VARCHAR(100)" },
                  { name: "email", type: "VARCHAR(100)" },
                ],
              },
              {
                name: "Posts",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "user_id", type: "INT", fk: "Users.id" },
                  { name: "title", type: "VARCHAR(200)" },
                  { name: "body", type: "TEXT" },
                ],
              },
              {
                name: "Comments",
                fields: [
                  { name: "id", type: "INT", pk: true },
                  { name: "post_id", type: "INT", fk: "Posts.id" },
                  { name: "user_id", type: "INT", fk: "Users.id" },
                  { name: "body", type: "TEXT" },
                ],
              },
            ];
            relationships = [
              { from: "Posts.user_id", to: "Users.id", label: "authored by" },
              { from: "Comments.post_id", to: "Posts.id", label: "on" },
              { from: "Comments.user_id", to: "Users.id", label: "by" },
            ];
          }

          synthesized = { type: "erdiagram", title, tables, relationships };
        } else if (wantsSteps) {
          // Fallback for step-by-step requests — synthesize a generic 3-step solution
          // The AI will usually include a better spec, but this catches the case where it forgets.
          // Try to extract the equation from the user's message
          const eqMatch = userMessage.match(/solve[:\s]+([^?]+)/i) ?? userMessage.match(/([^?]+)=([^?]+)/);
          const equation = (eqMatch?.[1] ?? userMessage)?.trim().slice(0, 80);
          synthesized = {
            type: "steps",
            title: `Solve: ${equation}`,
            steps: [
              { title: "Step 1: Identify the equation", expression: equation, explanation: "Read the equation carefully and identify what variable to solve for." },
              { title: "Step 2: Isolate the variable", expression: "", explanation: "Use inverse operations to move everything except the variable to one side of the equals sign." },
              { title: "Step 3: Solve for the variable", expression: "", explanation: "Perform the final operation to find the value of the variable." },
              { title: "Step 4: Verify your answer", expression: "", explanation: "Substitute your answer back into the original equation to check it works." },
            ],
          };
        }

        if (synthesized) {
          // Determine attachment type: concept maps should be tagged as "conceptmap"
          // so the UI shows the Brain icon. Graph specs (function/scatter/bar/etc)
          // are tagged as "graph".
          let attachmentType = "graph";
          if (
            synthesized.type === "network" ||
            (synthesized.nodes && synthesized.edges && !synthesized.type)
          ) {
            attachmentType = "conceptmap";
            // Make sure the synthesized spec has type: "network" so GraphRenderer
            // routes to NetworkSVG (not FunctionSVG).
            if (!synthesized.type) synthesized.type = "network";
          }
          attachments.push({
            type: attachmentType,
            url: null,
            caption: JSON.stringify(synthesized),
          });
        }
      }
    } catch (parseErr: any) {
      console.error("[tutor-chat] attachment parse failed:", parseErr?.message);
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
      remaining: deduct.remaining,
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    console.error("[tutor-chat] error:", e?.message);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
