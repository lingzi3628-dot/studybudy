import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/generate/topic
 * Body: { topicName, subject, text?, numFlashcards?, numMCQs? }
 *
 * Generates lesson content + flashcards + MCQs for a topic.
 * Returns the structured content (not saved). Admin reviews then saves
 * via POST /api/admin/topics (with lessonContent) and existing card-generation endpoints.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const topicName = (body.topicName ?? "").toString().trim();
  const subject = (body.subject ?? "General").toString().trim();
  if (!topicName) return NextResponse.json({ error: "Missing topicName" }, { status: 400 });

  const numFlashcards = Math.max(0, Math.min(12, Number(body.numFlashcards ?? 5)));
  const numMCQs = Math.max(0, Math.min(12, Number(body.numMCQs ?? 5)));
  const text = (body.text ?? "").toString().trim();

  const rl = checkRateLimit(admin.id, admin.plan);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Daily AI limit reached", limit: rl.limit, resetAt: rl.resetAt }, { status: 429 });
  }

  const adminUser = await db.user.findUnique({ where: { id: admin.id }, select: { encryptedApiKey: true } });
  const apiKey = adminUser?.encryptedApiKey ? decryptApiKey(adminUser.encryptedApiKey) : null;

  const isMath = /math|algebra|geometry|calculus|equation|graph|polynomial/i.test(subject + " " + topicName);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `You are an instructional designer creating a topic lesson on "${topicName}" (${subject}). ` +
        (text ? `Source context:\n${text.slice(0, 8000)}\n\n` : "") +
        `Return ONLY JSON:\n` +
        JSON.stringify({
          lesson: {
            introduction: "2-4 sentence intro",
            keyConcepts: [{ title: "Concept name", explanation: "Explanation" }],
            examples: [{ title: "Example", problem: "Problem", steps: ["step 1", "step 2"], answer: "answer" }],
            formulas: isMath ? ["\\(y = mx + b\\)"] : [],
            summary: "1-2 sentence wrap-up",
          },
          flashcards: Array(numFlashcards > 0 ? 1 : 0).fill({ front: "Q", back: "A" }),
          mcqs: Array(numMCQs > 0 ? 1 : 0).fill({ question: "Q", options: ["A", "B", "C", "D"], correct_index: 0, explanation: "Why" }),
        }, null, 2) +
        `\nGenerate exactly ${numFlashcards} flashcards and ${numMCQs} MCQs. If numFlashcards=0, return empty flashcards array. If numMCQs=0, return empty mcqs array.`,
    },
    { role: "user", content: `Create a lesson on ${topicName}.` },
  ];

  try {
    const json = await callAIJson<{
      lesson?: {
        introduction?: string;
        keyConcepts?: { title: string; explanation: string }[];
        examples?: { title: string; problem: string; steps: string[]; answer: string }[];
        formulas?: string[];
        summary?: string;
      };
      flashcards?: { front: string; back: string }[];
      mcqs?: { question: string; options: string[]; correct_index: number; explanation: string }[];
    }>(messages, apiKey, { userId: admin.id, route: "/api/admin/generate/topic" });

    return NextResponse.json({
      topicName,
      subject,
      lesson: json.lesson ?? null,
      flashcards: (json.flashcards ?? []).slice(0, numFlashcards || 0),
      mcqs: (json.mcqs ?? []).slice(0, numMCQs || 0),
      remaining: rl.remaining,
    });
  } catch (e: any) {
    refundRateLimit(admin.id);
    return NextResponse.json({ error: "AI generation failed", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
