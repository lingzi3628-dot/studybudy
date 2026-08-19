import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";
export const maxDuration = 60;

type CmNode = { id: string; label: string; description: string; type?: string };
type CmEdge = { source: string; target: string; label: string };
type CmGraph = { title: string; nodes: CmNode[]; edges: CmEdge[] };

/**
 * POST /api/generate/concept-map
 * Body: { topic?, text?, studySetId? }
 *
 * Generates a structured concept map (nodes + edges) from a topic name,
 * pasted text, or an existing study set's content. Saves to concept_maps
 * table. Deducts tokens via checkAndDeductTokens("concept_map").
 *
 * 402 = upgrade/limit/insufficient tokens (friendly upgrade card in UI)
 * 500 = server error / AI failure (tokens refunded)
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as {
    topic?: string;
    text?: string;
    studySetId?: string;
  };

  const topic = (body.topic ?? "").toString().trim();
  const text = (body.text ?? "").toString().trim();
  const studySetId = (body.studySetId ?? "").toString().trim() || null;

  if (!topic && !text && !studySetId) {
    return NextResponse.json(
      { error: "Please provide a topic, text, or study set to generate a concept map." },
      { status: 400 }
    );
  }

  // Check admin settings (is concept map enabled?)
  let settings: any = null;
  try {
    settings = await db.conceptMapSettings.findUnique({ where: { id: 1 } });
  } catch (e: any) {
    console.error("ConceptMapSettings fetch failed:", e?.message);
  }
  const enabled = settings?.enabled ?? true;
  if (!enabled) {
    return NextResponse.json(
      { error: "Concept map generation is currently disabled by the admin." },
      { status: 403 }
    );
  }

  // Determine source text
  let sourceText = text;
  let sourceType: "topic" | "text" | "study_set" = "topic";
  let resolvedTopic: string = topic;
  let topicId: string | null = null;

  if (studySetId) {
    sourceType = "study_set";
    const studySet = await db.studySet.findUnique({
      where: { id: studySetId },
      select: {
        id: true, title: true, subject: true, topic: true, topicId: true, sourceText: true,
        cards: { select: { front: true, back: true, question: true, explanation: true } },
      },
    }).catch(() => null);

    if (!studySet) {
      return NextResponse.json({ error: "Study set not found." }, { status: 404 });
    }
    if (studySet.topicId) topicId = studySet.topicId;
    resolvedTopic = studySet.topic || studySet.title || topic || "Concept Map";

    const cardText = (studySet.cards ?? [])
      .map((c: any) => {
        const parts: string[] = [];
        if (c.front) parts.push(c.front);
        if (c.back) parts.push(`→ ${c.back}`);
        if (c.question) parts.push(c.question);
        if (c.explanation) parts.push(`(${c.explanation})`);
        return parts.join(" ");
      })
      .join("\n");
    sourceText = [studySet.sourceText, cardText].filter(Boolean).join("\n\n") || resolvedTopic;
  } else if (topic) {
    // Try to find an existing topic in our DB
    const existingTopic = await db.topic.findFirst({
      where: { name: { equals: topic, mode: "insensitive" } },
      select: { id: true, name: true, subject: true },
    }).catch(() => null);
    if (existingTopic) {
      topicId = existingTopic.id;
      resolvedTopic = existingTopic.name;
    }
  } else if (text) {
    sourceType = "text";
    resolvedTopic = text.slice(0, 50) + (text.length > 50 ? "…" : "");
  }

  // Cache check: if user already generated a map for this topic in the last 24h, return it free
  if (topic && sourceType === "topic" && !studySetId) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cached = await db.conceptMap.findFirst({
      where: {
        OR: [
          { userId: user.id, title: { contains: resolvedTopic, mode: "insensitive" } },
          { isPublic: true, title: { contains: resolvedTopic, mode: "insensitive" } },
        ],
        createdAt: { gte: dayAgo },
      },
      orderBy: { createdAt: "desc" },
    }).catch(() => null);

    if (cached) {
      return NextResponse.json({
        conceptMap: {
          id: cached.id,
          title: cached.title,
          nodes: cached.nodes,
          edges: cached.edges,
          isPublic: cached.isPublic,
          cached: true,
        },
        tokenBalance: user.tokenBalance,
      });
    }
  }

  // Deduct tokens
  const deduct = await checkAndDeductTokens(user.id, "concept_map");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "We couldn't generate the concept map right now. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  // Fetch user's BYOK key
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  // Build AI prompt
  const sourceForAI = sourceText || `Topic: ${resolvedTopic}`;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert at creating educational concept maps. " +
        "Given the topic or text below, identify 8-12 most important concepts and their relationships.\n\n" +
        "Return ONLY valid JSON in this exact format (no markdown fences, no extra text):\n" +
        JSON.stringify(
          {
            title: "Concept Map Title",
            nodes: [
              { id: "n1", label: "Concept name", description: "Short 1-sentence description", type: "main" },
              { id: "n2", label: "Sub-concept", description: "Short description", type: "sub" },
            ],
            edges: [
              { source: "n1", target: "n2", label: "relationship (e.g. 'leads to', 'is part of')" },
            ],
          },
          null,
          2
        ) +
        "\n\nRules:\n" +
        "- The first node in the array should be the central concept (type: \"main\").\n" +
        "- Other nodes should have type: \"sub\".\n" +
        "- Use short, lowercase ids like n1, n2, n3…\n" +
        "- Labels should be 1-3 words.\n" +
        "- Descriptions should be 1 short sentence (under 100 chars).\n" +
        "- Edge labels should be 1-3 words describing the relationship.\n" +
        "- All node ids referenced in edges must exist in the nodes array.\n" +
        "- Return 8-12 nodes total.",
    },
    { role: "user", content: `Topic/Text:\n\n${sourceForAI.slice(0, 4000)}` },
  ];

  // Call AI with one retry on parse failure
  let graph: CmGraph | null = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callAIJson<CmGraph>(messages, apiKey, {
        userId: user.id,
        route: "/api/generate/concept-map",
      });

      if (!raw || typeof raw !== "object") {
        lastError = "AI returned non-object response";
        continue;
      }
      const nodes = Array.isArray(raw.nodes) ? raw.nodes : null;
      const edges = Array.isArray(raw.edges) ? raw.edges : null;
      const title = typeof raw.title === "string" ? raw.title : resolvedTopic;
      if (!nodes || nodes.length < 3) {
        lastError = `AI returned too few nodes (${nodes?.length ?? 0})`;
        continue;
      }

      // Sanitize nodes
      const cleanNodes: CmNode[] = nodes.slice(0, 15).map((n: any, i: number) => ({
        id: String(n?.id ?? `n${i + 1}`),
        label: String(n?.label ?? `Node ${i + 1}`).slice(0, 80),
        description: String(n?.description ?? "").slice(0, 200),
        type: n?.type === "main" ? "main" : "sub",
      }));

      // Sanitize edges — drop edges referencing missing nodes
      const nodeIds = new Set(cleanNodes.map((n) => n.id));
      const cleanEdges: CmEdge[] = (edges ?? [])
        .filter((e: any) => e?.source && e?.target && nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)))
        .map((e: any) => ({
          source: String(e.source),
          target: String(e.target),
          label: String(e?.label ?? "relates to").slice(0, 60),
        }))
        .slice(0, 30);

      // Make sure at least one node is marked as main
      if (!cleanNodes.some((n) => n.type === "main")) {
        cleanNodes[0].type = "main";
      }

      graph = { title, nodes: cleanNodes, edges: cleanEdges };
      break;
    } catch (e: any) {
      lastError = e?.message ?? "AI call failed";
      console.error(`concept-map attempt ${attempt} failed:`, lastError);
      if (attempt === 1) {
        messages[0].content =
          messages[0].content +
          "\n\nIMPORTANT: Output ONLY the JSON object. No prose, no markdown, no code fences. Start with { and end with }.";
        continue;
      }
    }
  }

  if (!graph) {
    await refundTokens(user.id, "concept_map", deduct.costTokens);
    return NextResponse.json(
      { error: "The AI couldn't generate a concept map right now. Please try again.", detail: lastError, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }

  // Save to DB
  let saved: any;
  try {
    saved = await db.conceptMap.create({
      data: {
        userId: user.id,
        topicId,
        title: graph.title,
        nodes: graph.nodes as any,
        edges: graph.edges as any,
        sourceType,
        sourceText: sourceText ? sourceText.slice(0, 5000) : null,
        isPublic: false,
      },
    });
  } catch (e: any) {
    console.error("concept map save failed:", e?.message);
    await refundTokens(user.id, "concept_map", deduct.costTokens);
    return NextResponse.json(
      { error: "Concept map was generated but couldn't be saved. Please try again.", detail: e?.message, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }

  return NextResponse.json({
    conceptMap: {
      id: saved.id,
      title: saved.title,
      nodes: saved.nodes,
      edges: saved.edges,
      isPublic: saved.isPublic,
      createdAt: saved.createdAt,
    },
    tokenBalance: deduct.newBalance,
    costTokens: deduct.costTokens,
  });
}
