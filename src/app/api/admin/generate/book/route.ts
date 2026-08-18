import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/generate/book
 * Body: { text, title?, description? }
 *
 * Uses AI to generate a book structure: chapters and topics per chapter.
 * Returns the proposed structure (not saved). Admin reviews then saves via
 * POST /api/admin/books etc.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const text = (body.text ?? "").toString().trim();
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

  const rl = checkRateLimit(admin.id, admin.plan);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Daily AI limit reached", limit: rl.limit, resetAt: rl.resetAt }, { status: 429 });
  }

  // BYOK if admin set one
  const adminUser = await db.user.findUnique({ where: { id: admin.id }, select: { encryptedApiKey: true } });
  const apiKey = adminUser?.encryptedApiKey ? decryptApiKey(adminUser.encryptedApiKey) : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `You are an instructional designer. Based on the following study material, propose a book structure with 3-5 chapters and 2-4 topics per chapter.\n` +
        `Return ONLY JSON:\n` +
        JSON.stringify({
          title: "Book title",
          description: "1-2 sentence book description",
          chapters: [
            {
              title: "Chapter title",
              orderIndex: 1,
              topics: [
                { name: "Topic name", subject: "Subject area" },
              ],
            },
          ],
        }, null, 2),
    },
    { role: "user", content: "Study material:\n\n" + text.slice(0, 12_000) },
  ];

  try {
    const json = await callAIJson<{
      title?: string;
      description?: string;
      chapters?: { title: string; orderIndex: number; topics: { name: string; subject: string }[] }[];
    }>(messages, apiKey, { userId: admin.id, route: "/api/admin/generate/book" });

    return NextResponse.json({
      title: json.title ?? body.title ?? "Untitled book",
      description: json.description ?? body.description ?? "",
      chapters: json.chapters ?? [],
      remaining: rl.remaining,
    });
  } catch (e: any) {
    refundRateLimit(admin.id);
    return NextResponse.json({ error: "AI generation failed", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
