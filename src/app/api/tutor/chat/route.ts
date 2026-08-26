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
    const wantsImage = /\bimage\b|\bpicture\b|\bphoto\b|\bdiagram\b|\billustration\b|\bdrawing\b/i.test(userMessage) &&
                       !/draw.*(graph|chart|plot|curve|function)/i.test(userMessage);
    const wantsGraph = /\bgraph\b|\bchart\b|\bplot\b|\bcurve\b|\bfunction\b|draw.*(equation|x²|y=)|sketch.*(graph|curve)/i.test(userMessage);
    const wantsConceptMap = /\bconcept map\b|\bmind map\b|\bmap of\b|\boverview of\b|\bsummary of\b|\brelationship between\b|\bmindmap\b/i.test(userMessage);
    const wantsSearch = /\bfind\b|\bsearch\b|\blook up\b|\bwhat is\b|\bwho is\b|\bwhen did\b|\bhow does\b/i.test(userMessage) && !wantsVideo;

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

    const systemContent = `You are StudyBuddy, a friendly AI tutor for Kenyan students. ${teachingProfile.systemPromptSuffix}${curriculumContext}${searchContext}

SPECIAL CAPABILITIES — when the user asks, you can do these (the system has already fetched the content for you, just describe and reference it):
- VIDEO: When the user asks for a video, you have been given YouTube URLs in the web search context above. Reference them in your reply like "Here's a YouTube video that explains it well: [Title](URL)".
- IMAGE: When the user asks for an image/diagram, mention that you've attached an image below.
- GRAPH: When the user asks for a graph of a function (e.g. "draw y = x²"), include a fenced code block tagged "mathgraph" containing a JSON object: {"expr": "x^2", "xRange": [-5,5], "yRange": [0,25], "title": "y = x²"}. The frontend will render this as an interactive SVG.
- CONCEPT MAP: When the user asks for a concept map or mind map, include a fenced code block tagged "conceptmap" containing a JSON object: {"title": "...", "nodes": [{"id":"a","label":"A","color":"#4F46E5"},{"id":"b","label":"B","color":"#10B981"}], "edges": [{"from":"a","to":"b","label":"related to"}]}. The frontend will render this as an interactive SVG diagram.
- Always be encouraging and clear.
- Reply in the same language the user used (English / Kiswahili / French).
- Keep answers under 250 words unless asked for detail.
- Use markdown: **bold**, *italic*, lists (- or 1.), [link](url), \`code\`, and fenced code blocks for graphs/concept maps.`;

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
    // The AI may have included ```mathgraph {...}``` or ```conceptmap {...}``` blocks
    try {
      const graphMatch = reply.match(/```mathgraph\s*([\s\S]*?)```/);
      if (graphMatch) {
        const graphJson = JSON.parse(graphMatch[1].trim());
        attachments.push({
          type: "graph",
          url: null,
          caption: JSON.stringify(graphJson),
        });
      }

      const conceptMapMatch = reply.match(/```conceptmap\s*([\s\S]*?)```/);
      if (conceptMapMatch) {
        const cmJson = JSON.parse(conceptMapMatch[1].trim());
        attachments.push({
          type: "conceptmap",
          url: null,
          caption: JSON.stringify(cmJson),
        });
      }

      // If user wanted graph/concept map but AI didn't include the code block, synthesize a default
      if (wantsGraph && !graphMatch) {
        // Try to extract an expression from the message
        const exprMatch = userMessage.match(/y\s*=\s*([^\s,)]+)/i) ||
                          userMessage.match(/f\(x\)\s*=\s*([^\s,)]+)/i) ||
                          userMessage.match(/graph\s+(?:of\s+)?([^\s,)]+)/i);
        const expr = exprMatch?.[1] ?? "x^2";
        attachments.push({
          type: "graph",
          url: null,
          caption: JSON.stringify({
            expr,
            xRange: [-5, 5],
            yRange: [-25, 25],
            title: `Graph of ${expr}`,
          }),
        });
      }

      if (wantsConceptMap && !conceptMapMatch) {
        // Build a simple concept map from the AI reply (extract key terms)
        const terms = (reply.match(/\*\*([A-Z][^*]+)\*\*/g) ?? []).slice(0, 5).map((s) => s.slice(2, -2));
        const nodes = terms.map((t, i) => ({ id: `n${i}`, label: t, color: ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"][i % 5] }));
        const edges: any[] = [];
        for (let i = 1; i < nodes.length; i++) {
          edges.push({ from: nodes[0].id, to: nodes[i].id, label: "→" });
        }
        attachments.push({
          type: "conceptmap",
          url: null,
          caption: JSON.stringify({ title: "Concept Map", nodes, edges }),
        });
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
