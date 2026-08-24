/**
 * Phase 21 backfill — clear stale tokenResetDate so existing users get
 * the new generous 500-token daily allowance on their next AI call.
 *
 * Run with: bun run scripts/backfill-phase21.ts
 *
 * Safe to re-run — idempotent.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  console.log("[+] Phase 21 backfill — clearing stale tokenResetDate for all users...");

  // Clear tokenResetDate so the next checkAndDeductTokens call will trigger
  // a daily reset, refilling the user's tokens to 500 (free) or plan.tokenLimit (premium).
  const result = await p.user.updateMany({
    where: {
      OR: [
        { tokenResetDate: { not: null } },
      ],
    },
    data: {
      tokenResetDate: null,
      // Also clear any stale resting state — the resting feature is removed
      freeModelRestingUntil: null,
    },
  });
  console.log(`[+] Updated ${result.count} users — tokenResetDate cleared, freeModelRestingUntil cleared.`);

  // Also bump existing free users' tokenBalance to at least 500 if they're below,
  // so they have tokens to use immediately on their next visit (without waiting
  // for the lazy reset on their next AI call).
  const freeBump = await p.user.updateMany({
    where: {
      planId: null,
      tokenBalance: { lt: 500 },
    },
    data: {
      tokenBalance: 500,
    },
  });
  console.log(`[+] Bumped ${freeBump.count} free users' tokenBalance to 500.`);

  // Bump any user's coinBalance to at least 50 if below (the new daily floor)
  const coinBump = await p.user.updateMany({
    where: {
      coinBalance: { lt: 50 },
    },
    data: {
      coinBalance: 50,
    },
  });
  console.log(`[+] Bumped ${coinBump.count} users' coinBalance to the 50 floor.`);

  console.log("[+] Done.");
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
