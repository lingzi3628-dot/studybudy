/**
 * One-time fix: set tokenResetDate for existing users who registered
 * before the Phase 10 changes added tokenResetDate to the signup flow.
 *
 * Also restores tokenBalance to 1000 for any free user whose balance
 * dropped to 0 due to the previous double-charge bug.
 *
 * Run with: bun run scripts/fix-existing-users.ts
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const result = await db.user.updateMany({
  where: {
    tokenResetDate: null,
    planId: null, // free users only
  },
  data: {
    tokenResetDate: (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      return d;
    })(),
  },
});
console.log(`✓ Set tokenResetDate for ${result.count} free users`);

// Restore balance for free users who hit 0 due to the double-charge bug
const restored = await db.user.updateMany({
  where: {
    tokenBalance: 0,
    planId: null, // free users only
  },
  data: {
    tokenBalance: 1000,
  },
});
console.log(`✓ Restored tokenBalance to 1000 for ${restored.count} free users (was 0)`);

// Show current state
const users = await db.user.findMany({
  where: { planId: null },
  select: { email: true, tokenBalance: true, tokenResetDate: true, planId: true },
  orderBy: { createdAt: "desc" },
  take: 10,
});
console.log("\n=== Current free users ===");
for (const u of users) {
  console.log({
    email: u.email,
    tokenBalance: u.tokenBalance,
    tokenResetDate: u.tokenResetDate,
    planId: u.planId,
  });
}

await db.$disconnect();
