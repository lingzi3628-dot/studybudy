import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const mappings = await p.modelMapping.findMany();
console.log("=== Model Mappings ===");
for (const m of mappings) {
  console.log({
    id: m.id,
    modelName: m.modelName,
    displayName: m.displayName,
    provider: m.provider,
    tokenCostMultiplier: m.tokenCostMultiplier,
    requiresPremium: m.requiresPremium,
    enabled: m.enabled,
  });
}

const ss = await p.searchSettings.findUnique({ where: { id: 1 } });
console.log("\n=== Search Settings ===");
console.log({
  id: ss?.id,
  hasYoutubeKey: Boolean(ss?.youtubeApiKeyEncrypted),
  pollinationsBaseUrl: ss?.pollinationsBaseUrl,
  imageSearchEnabled: ss?.imageSearchEnabled,
  videoSearchEnabled: ss?.videoSearchEnabled,
  imageTokenCost: ss?.imageTokenCost,
  videoTokenCost: ss?.videoTokenCost,
  freeDailyImageLimit: ss?.freeDailyImageLimit,
  freeDailyVideoLimit: ss?.freeDailyVideoLimit,
});

const plans = await p.plan.findMany({ select: { id: true, name: true, slug: true, price: true, tokenLimit: true } });
console.log("\n=== Plans ===");
for (const pl of plans) {
  console.log(pl);
}

await p.$disconnect();
