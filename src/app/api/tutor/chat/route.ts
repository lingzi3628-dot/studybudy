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
 * ChatGPT-style persistent AI Tutor:
 * - Creates/uses a conversation (messages saved to DB, never lost)
 * - AI can fetch images, videos, graphs via web_search
 * - AI can generate concept maps inline
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
      // Create new conversation with title from first message
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

    // 3. Build chat history from DB
    const allMessages = await db.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20, // last 20 messages for context
    });

    // 4. Build AI messages
    const teachingProfile = buildTeachingProfile(user.grade ?? "Form 1");

    // Fetch curriculum context
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
            for (const t of subj.topics) {
              topicLines.push(`### ${t.name}\n${(t.contentMarkdown ?? "").slice(0, 300)}`);
            }
          }
          if (topicLines.length > 0) {
            curriculumContext = `\n\nCURRICULUM CONTENT for ${matchingGrade.name}:\n${topicLines.join("\n").slice(0, 6000)}`;
          }
        }
      }
    } catch {}

    const systemContent = `You are StudyBuddy, a helpful AI tutor. ${teachingProfile.systemPromptSuffix}${curriculumContext}

SPECIAL CAPABILITIES:
- When the user asks for a video (e.g. "send me a photosynthesis video"), search the web using the web_search function and include relevant YouTube URLs in your response.
- When the user asks about graphs or charts, you can describe them and include inline markdown.
- When the user asks for a concept map, generate a text-based concept map.
- Always be encouraging and clear.
- Reply in the same language the user used.
- Keep answers under 300 words unless asked for detail.`;

    const aiMessages: AIMessage[] = [
      { role: "system", content: systemContent },
      ...allMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // 5. Check if user wants web search, image, video, etc.
    const wantsSearch = /video|show me|find|search|image|picture|photo|diagram|youtube/i.test(userMessage);
    const wantsGraph = /graph|chart|plot|curve|function|equation.*draw/i.test(userMessage);
    const wantsConceptMap = /concept map|mind map|map of|overview of|summary of/i.test(userMessage);

    let attachments: any[] = [];

    // Web search via z-ai SDK
    if (wantsSearch) {
      try {
        const ZAI = (await import("z-ai-web-dev-sdk")).default;
        const client = await ZAI.create();
        const searchResult = await client.functions.invoke("web_search", { query: userMessage });
        // Extract relevant results
        const results = (searchResult as any)?.results ?? (searchResult as any)?.data ?? [];
        if (Array.isArray(results) && results.length > 0) {
          const searchContext = results.slice(0, 5).map((r: any) => 
            `- ${r.title ?? r.name ?? "Result"}: ${r.url ?? r.link ?? ""}\n  ${r.snippet ?? r.description ?? ""}`
          ).join("\n");
          aiMessages.push({
            role: "system" as any,
            content: `Web search results for "${userMessage}":\n${searchContext}`,
          });

          // Add video/image attachments
          for (const r of results.slice(0, 3)) {
            const url = r.url ?? r.link ?? "";
            if (url.includes("youtube") || url.includes("youtu.be")) {
              attachments.push({ type: "video", url, caption: r.title ?? "YouTube video" });
            }
          }
        }
      } catch (e: any) {
        console.error("[tutor-chat] web search failed:", e?.message);
      }
    }

    // 6. Call AI
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

    // 7. Add graph attachment if requested
    if (wantsGraph) {
      // Generate a graph URL via Pollinations or describe inline
      attachments.push({
        type: "graph",
        url: null,
        caption: "Graph generated by AI — see description in the response above.",
      });
    }

    // 8. Add concept map attachment if requested
    if (wantsConceptMap) {
      attachments.push({
        type: "conceptmap",
        url: null,
        caption: "Concept map generated by AI — see structure in the response above.",
      });
    }

    // 9. Save the AI's reply
    const savedReply = await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content: reply,
        attachments: attachments.length > 0 ? attachments : null,
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
