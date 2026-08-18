import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Fallback plans if DB tables aren't synced yet
const FALLBACK_PLANS = [
  { id: "free", name: "Study Buddy Free", slug: "free", price: 0, currency: "USD", tokenLimit: 1000, dailyQuizLimit: 5, dailyFlashcardGenLimit: 3, features: { emoji: "🌱", model: "study_buddy_free", tier: 0 } },
  { id: "plus", name: "Study Buddy Plus", slug: "plus", price: 4.99, currency: "USD", tokenLimit: 10000, dailyQuizLimit: 20, dailyFlashcardGenLimit: 10, features: { emoji: "⚡", model: "study_buddy_plus", tier: 1 } },
  { id: "pro", name: "Study Buddy Pro", slug: "pro", price: 9.99, currency: "USD", tokenLimit: 50000, dailyQuizLimit: 50, dailyFlashcardGenLimit: 25, features: { emoji: "🚀", model: "study_buddy_pro", tier: 2 } },
  { id: "king", name: "Study Buddy King", slug: "king", price: 19.99, currency: "USD", tokenLimit: 200000, dailyQuizLimit: 100, dailyFlashcardGenLimit: 50, features: { emoji: "👑", model: "study_buddy_king", tier: 3 } },
  { id: "ultra", name: "Study Buddy Ultra", slug: "ultra", price: 29.99, currency: "USD", tokenLimit: 500000, dailyQuizLimit: 200, dailyFlashcardGenLimit: 100, features: { emoji: "💎", model: "study_buddy_ultra", tier: 4 } },
  { id: "teddy", name: "Study Buddy Teddy", slug: "teddy", price: 39.99, currency: "USD", tokenLimit: 1000000, dailyQuizLimit: 500, dailyFlashcardGenLimit: 200, features: { emoji: "🧸", model: "study_buddy_teddy", tier: 5 } },
  { id: "photo", name: "Study Buddy Photo", slug: "photo", price: 14.99, currency: "USD", tokenLimit: 20000, dailyQuizLimit: 50, dailyFlashcardGenLimit: 20, features: { emoji: "📸", model: "study_buddy_photo", tier: 2 } },
];

/** GET /api/plans — public list of all plans (with DB fallback) */
export async function GET() {
  try {
    const plans = await db.plan.findMany({
      orderBy: { price: "asc" },
      select: { id: true, name: true, slug: true, price: true, currency: true, tokenLimit: true, dailyQuizLimit: true, dailyFlashcardGenLimit: true, features: true },
    });
    if (plans.length > 0) {
      return NextResponse.json({ plans });
    }
    // DB returned empty — use fallback
    return NextResponse.json({ plans: FALLBACK_PLANS });
  } catch (e) {
    // DB not synced or table missing — return hardcoded plans
    console.warn("/api/plans DB query failed, using fallback:", e?.message);
    return NextResponse.json({ plans: FALLBACK_PLANS });
  }
}
