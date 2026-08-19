import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { callAIJson, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type CmNode = { id: string; label: string; description: string; type?: string };
type CmEdge = { source: string; target: string; label: string };
type CmGraph = { title: string; nodes: CmNode[]; edges: CmEdge[] };

/**
 * POST /api/admin/concept-maps/generate
 * Body: { topics: string[], isPublic?: boolean }
 *
 * Pre-generate concept maps for a list of common topics.
 * Maps are stored as public (isPublic=true), userId=null (global).
 * These are free for any logged-in user to view.
 *
 * This is a long-running endpoint — designed for small batches (5-20 topics).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({})) as {
    topics?: string[];
    isPublic?: boolean;
  };

  const topics: string[] = Array.isArray(body.topics)
    ? body.topics.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (topics.length === 0) {
    return NextResponse.json({ error: "Provide at least one topic." }, { status: 400 });
  }
  if (topics.length > 20) {
    return NextResponse.json({ error: "Max 20 topics per request." }, { status: 400 });
  }

  const isPublic = body.isPublic !== false; // default true

  // Admin pre-generation uses platform AI (no BYOK)
  const apiKey = null;

  const results: { topic: string; status: "ok" | "skipped" | "error"; id?: string; error?: string }[] = [];

  for (const topic of topics) {
    try {
      // Skip if a public map for this topic already exists
      const existing = await db.conceptMap.findFirst({
        where: { isPublic: true, title: { equals: topic, mode: "insensitive" } },
        select: { id: true },
      }).catch(() => null);

      if (existing) {
        results.push({ topic, status: "skipped", id: existing.id });
        continue;
      }

      // Generate via AI
      const messages: ChatMessage[] = [
        {
          role: "system",
          content:
            "You are an expert at creating educational concept maps. " +
            "Given the topic below, identify 8-12 most important concepts and their relationships.\n\n" +
            "Return ONLY valid JSON in this exact format:\n" +
            JSON.stringify(
              {
                title: "Concept Map Title",
                nodes: [
                  { id: "n1", label: "Concept name", description: "Short description", type: "main" },
                  { id: "n2", label: "Sub-concept", description: "Short description", type: "sub" },
                ],
                edges: [{ source: "n1", target: "n2", label: "relationship" }],
              },
              null,
              2
            ) +
            "\n\nRules:\n- First node type: \"main\", others: \"sub\"\n- 8-12 nodes\n- ids: n1, n2…",
        },
        { role: "user", content: `Topic: ${topic}` },
      ];

      const raw = await callAIJson<CmGraph>(messages, apiKey, {
        userId: "system",
        route: "/api/admin/concept-maps/generate",
      });

      // Sanitize
      const cleanNodes: CmNode[] = (Array.isArray(raw.nodes) ? raw.nodes : [])
        .slice(0, 15)
        .map((n: any, i: number) => ({
          id: String(n?.id ?? `n${i + 1}`),
          label: String(n?.label ?? `Node ${i + 1}`).slice(0, 80),
          description: String(n?.description ?? "").slice(0, 200),
          type: n?.type === "main" ? "main" : "sub",
        }));
      const nodeIds = new Set(cleanNodes.map((n) => n.id));
      const cleanEdges: CmEdge[] = (Array.isArray(raw.edges) ? raw.edges : [])
        .filter((e: any) => e?.source && e?.target && nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)))
        .map((e: any) => ({
          source: String(e.source),
          target: String(e.target),
          label: String(e?.label ?? "relates to").slice(0, 60),
        }))
        .slice(0, 30);
      if (!cleanNodes.some((n) => n.type === "main")) cleanNodes[0].type = "main";

      const title = typeof raw.title === "string" ? raw.title : topic;

      const saved = await db.conceptMap.create({
        data: {
          userId: null,
          topicId: null,
          title,
          nodes: cleanNodes as any,
          edges: cleanEdges as any,
          isPublic,
          sourceType: "topic",
        },
      });

      results.push({ topic, status: "ok", id: saved.id });
    } catch (e: any) {
      console.error(`pre-generate failed for ${topic}:`, e?.message);
      results.push({ topic, status: "error", error: e?.message ?? "failed" });
    }
  }

  await logAdminActionViaJwt(admin, "concept_map.pre_generate", { count: topics.length, results });
  return NextResponse.json({ results });
}
