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

  if (!userMessage) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
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

    // 2. Save the user's message
    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: userMessage,
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
    const wantsSearch = /\bfind\b|\bsearch\b|\blook up\b|\bwhat is\b|\bwho is\b|\bwhen did\b|\bhow does\b/i.test(userMessage) && !wantsVideo &&
                       !wantsScatter && !wantsBar && !wantsHistogram && !wantsPie && !wantsVenn &&
                       !wantsNumberLine && !wantsTree && !wantsBoxPlot && !wantsVector && !wantsPolygon;

    // Aggregate "wants graph" — true if ANY graph type detected
    const wantsGraph = wantsFunctionPlot || wantsScatter || wantsBar || wantsHistogram || wantsPie ||
                       wantsVenn || wantsNumberLine || wantsTree || wantsBoxPlot || wantsVector ||
                       wantsPolygon || wantsNetwork || wantsConceptMap;

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

GENERAL RULES:
- Always pick the MOST APPROPRIATE graph type for the user's request. Don't use "function" for physics data plots — use "scatter" instead. Don't use "function" for statistics — use "bar"/"pie"/"boxplot" instead.
- When the user provides data points (e.g. "plot these: (0,0), (1,5), (2,10)"), use "scatter" with "lineOfBestFit":true.
- When the user asks for a graph of velocity vs time, distance vs time, or any measured data, use "scatter" (NOT "function").
- Be encouraging and clear. Reply in the same language the user used (English / Kiswahili / French).
- Keep answers under 250 words unless asked for detail.
- Use markdown: **bold**, *italic*, lists (- or 1.), [link](url), \`code\`, and fenced code blocks for graphs.`;

    const aiMessages: AIMessage[] = [
      { role: "system", content: systemContent },
      ...allMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // 7. Call AI
    let reply = "";
    try {
      reply = await callAI(aiMessages, null, { userId: user.id, route: "/api/tutor/chat" });
    } catch (e: any) {
      await refundTokens(user.id, "tutor", deduct.costTokens);
      return NextResponse.json(
        { error: "AI couldn't respond right now. Please try again." },
        { status: 500 }
      );
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
