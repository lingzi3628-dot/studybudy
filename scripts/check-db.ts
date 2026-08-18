import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const users = await p.user.findMany({
  select: {
    id: true, email: true, name: true, plan: true, planId: true,
    tokenBalance: true, currentModel: true, tokenResetDate: true,
    subscriptionExpiry: true, encryptedApiKey: true,
    passwordHash: true, createdAt: true, lastLogin: true, banned: true,
  },
  orderBy: { createdAt: "desc" },
  take: 10,
});

console.log("=== Recent users ===");
for (const u of users) {
  console.log({
    id: u.id.slice(0, 8),
    email: u.email,
    name: u.name,
    plan: u.plan,
    planId: u.planId,
    tokenBalance: u.tokenBalance,
    currentModel: u.currentModel,
    tokenResetDate: u.tokenResetDate,
    subscriptionExpiry: u.subscriptionExpiry,
    hasApiKey: Boolean(u.encryptedApiKey),
    hasPassword: Boolean(u.passwordHash),
    banned: u.banned,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
  });
}

const adminCount = await p.adminUser.count();
console.log("\n=== Admin users count:", adminCount);

const planCount = await p.plan.count();
console.log("=== Plans count:", planCount);

const modelMappingCount = await p.modelMapping.count();
console.log("=== Model mappings count:", modelMappingCount);

const searchSettingsCount = await p.searchSettings.count();
console.log("=== SearchSettings rows:", searchSettingsCount);

const tokenUsageCount = await p.tokenUsageLog.count();
console.log("=== TokenUsageLog rows:", tokenUsageCount);

const dailyUsageCount = await p.dailyUsage.count();
console.log("=== DailyUsage rows:", dailyUsageCount);

await p.$disconnect();
