/**
 * Backfill Phase 13: give existing users starting coins + ensure token balance.
 *
 * Run with: bun run scripts/backfill-phase13.ts
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// 1. Give existing users 20 starting coins (welcome bonus)
const coinResult = await p.user.updateMany({
  where: { coinBalance: 0 },
  data: { coinBalance: 20 },
});
console.log(`✓ Gave 20 starting coins to ${coinResult.count} users`);

// 2. Ensure users with tokenBalance > 50 keep their balance, but users with 0 get 50
const tokenResult = await p.user.updateMany({
  where: { tokenBalance: 0 },
  data: { tokenBalance: 50 },
});
console.log(`✓ Reset tokenBalance to 50 for ${tokenResult.count} users with 0 balance`);

// 3. Set tokenResetDate to +1 day for users without it
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const resetResult = await p.user.updateMany({
  where: { tokenResetDate: null },
  data: { tokenResetDate: tomorrow },
});
console.log(`✓ Set tokenResetDate for ${resetResult.count} users`);

// 4. Show current state
const users = await p.user.findMany({
  select: { email: true, tokenBalance: true, coinBalance: true, currentModel: true, freeModelRestingUntil: true, tokenResetDate: true },
  take: 5,
  orderBy: { createdAt: "desc" },
});
console.log("\n=== Sample users ===");
for (const u of users) {
  console.log({
    email: u.email,
    tokens: u.tokenBalance,
    coins: u.coinBalance,
    model: u.currentModel,
    resting: u.freeModelRestingUntil,
    reset: u.tokenResetDate,
  });
}

await p.$disconnect();
