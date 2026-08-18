import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkRateLimit, refundRateLimit } from "@/lib/rate-limit";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";

/**
 * POST /api/language/translate
 * Body: { text, targetLanguage }
 *
 * Returns: { translation, pronunciation }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const text = (body.text ?? "").toString().trim();
  const targetLanguage = (body.targetLanguage ?? "Swahili").toString().trim();

  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const rl = checkRateLimit(user.id, user.plan);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Daily AI limit reached", limit: rl.limit, resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });
  const apiKey = userRec?.encryptedApiKey
    ? decryptApiKey(userRec.encryptedApiKey)
    : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `Translate "${text.slice(0, 500)}" to ${targetLanguage}. Return JSON:\n` +
        JSON.stringify(
          {
            translation: "",
            pronunciation: "",
          },
          null,
          2
        ),
    },
    { role: "user", content: text.slice(0, 500) },
  ];

  const deduct = await checkAndDeductTokens(user.id, "translate");
  if (!deduct.ok) {
    return NextResponse.json({ error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance }, { status: 402 });
  }

  try {
    const json = await callAIJson<{
      translation?: string;
      pronunciation?: string;
    }>(messages, apiKey, { userId: user.id, route: "/api/language/translate" });
    return NextResponse.json({
      original: text,
      targetLanguage,
      translation: json.translation ?? "",
      pronunciation: json.pronunciation ?? "",
      remaining: rl.remaining,
      tokenBalance: deduct.newBalance,
    });
  } catch (e: any) {
    refundRateLimit(user.id);
    await refundTokens(user.id, "translate", deduct.costTokens);
    const msg = e?.message ?? String(e);
    const isUpgrade = /upgrade|premium|subscription|tokens?|plan/i.test(msg);
    return NextResponse.json(
      { error: isUpgrade ? msg : "Translation failed", detail: msg, tokenBalance: user.tokenBalance },
      { status: isUpgrade ? 402 : 500 }
    );
  }
}
