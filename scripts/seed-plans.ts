/**
 * Seed plans, model mappings, and payment settings.
 * Run with: bun run scripts/seed-plans.ts
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const PLANS = [
  { name: "Study Buddy Free", slug: "free", price: 0, tokenLimit: 1000, dailyQuizLimit: 5, dailyFlashcardGenLimit: 3, features: { model: "study_buddy_free", tier: 0, emoji: "🌱" } },
  { name: "Study Buddy Plus", slug: "plus", price: 4.99, tokenLimit: 10000, dailyQuizLimit: 20, dailyFlashcardGenLimit: 10, features: { model: "study_buddy_plus", tier: 1, emoji: "⚡" } },
  { name: "Study Buddy Pro", slug: "pro", price: 9.99, tokenLimit: 50000, dailyQuizLimit: 50, dailyFlashcardGenLimit: 25, features: { model: "study_buddy_pro", tier: 2, emoji: "🚀" } },
  { name: "Study Buddy King", slug: "king", price: 19.99, tokenLimit: 200000, dailyQuizLimit: 100, dailyFlashcardGenLimit: 50, features: { model: "study_buddy_king", tier: 3, emoji: "👑" } },
  { name: "Study Buddy Ultra", slug: "ultra", price: 29.99, tokenLimit: 500000, dailyQuizLimit: 200, dailyFlashcardGenLimit: 100, features: { model: "study_buddy_ultra", tier: 4, emoji: "💎" } },
  { name: "Study Buddy Teddy", slug: "teddy", price: 39.99, tokenLimit: 1000000, dailyQuizLimit: 500, dailyFlashcardGenLimit: 200, features: { model: "study_buddy_teddy", tier: 5, emoji: "🧸" } },
  { name: "Study Buddy Photo", slug: "photo", price: 14.99, tokenLimit: 20000, dailyQuizLimit: 50, dailyFlashcardGenLimit: 20, features: { model: "study_buddy_photo", tier: 2, emoji: "📸" } },
];

const MODEL_MAPPINGS = [
  { modelName: "study_buddy_free", modelIdentifier: "openai", tokenCostMultiplier: 1, requiresPremium: false, planSlug: "free", emoji: "🌱", displayName: "Study Buddy Free" },
  { modelName: "study_buddy_plus", modelIdentifier: "gemini-1.5-flash", tokenCostMultiplier: 1.5, requiresPremium: true, planSlug: "plus", emoji: "⚡", displayName: "Study Buddy Plus" },
  { modelName: "study_buddy_pro", modelIdentifier: "gemini-1.5-pro", tokenCostMultiplier: 2, requiresPremium: true, planSlug: "pro", emoji: "🚀", displayName: "Study Buddy Pro" },
  { modelName: "study_buddy_king", modelIdentifier: "gpt-4o", tokenCostMultiplier: 3, requiresPremium: true, planSlug: "king", emoji: "👑", displayName: "Study Buddy King" },
  { modelName: "study_buddy_ultra", modelIdentifier: "glm-4", tokenCostMultiplier: 4, requiresPremium: true, planSlug: "ultra", emoji: "💎", displayName: "Study Buddy Ultra" },
  { modelName: "study_buddy_teddy", modelIdentifier: "meta-llama/llama-3.1-70b-instruct", tokenCostMultiplier: 5, requiresPremium: true, planSlug: "teddy", emoji: "🧸", displayName: "Study Buddy Teddy" },
  { modelName: "study_buddy_photo", modelIdentifier: "openai", tokenCostMultiplier: 2, requiresPremium: true, planSlug: "photo", emoji: "📸", displayName: "Study Buddy Photo" },
];

const PAYMENT_SETTINGS = [
  { method: "mpesa", label: "M-Pesa", instructions: "Send money to M-Pesa Paybill:", details: { paybill: "4040404", account: "StudyBuddy" } },
  { method: "binance", label: "Binance Pay", instructions: "Send USDT via Binance Pay ID:", details: { binanceId: "123456789" } },
  { method: "minipay", label: "MiniPay", instructions: "Send payment via MiniPay:", details: { address: "0x1234...abcd" } },
  { method: "paypal", label: "PayPal", instructions: "Send payment to PayPal email:", details: { email: "payments@studybuddy.ai" } },
  { method: "bank", label: "Bank Transfer", instructions: "Transfer to bank account:", details: { bank: "Equity Bank", account: "0123456789", name: "StudyBuddy AI Ltd" } },
];

async function main() {
  // Seed plans
  for (const plan of PLANS) {
    await p.plan.upsert({
      where: { slug: plan.slug },
      create: plan,
      update: plan,
    });
    console.log(`✓ Plan: ${plan.name} (${plan.slug}) — $${plan.price} / ${plan.tokenLimit} tokens`);
  }

  // Seed model mappings
  for (const mm of MODEL_MAPPINGS) {
    await p.modelMapping.upsert({
      where: { modelName: mm.modelName },
      create: mm,
      update: mm,
    });
    console.log(`✓ Model: ${mm.emoji} ${mm.displayName} → ${mm.modelIdentifier} (multiplier ${mm.tokenCostMultiplier})`);
  }

  // Seed payment settings
  for (const ps of PAYMENT_SETTINGS) {
    await p.paymentSetting.upsert({
      where: { method: ps.method },
      create: ps,
      update: ps,
    });
    console.log(`✓ Payment: ${ps.label}`);
  }

  console.log("\n✅ All seed data inserted.");
  process.exit(0);
}

main().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
