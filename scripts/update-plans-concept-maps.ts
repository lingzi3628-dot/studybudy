/**
 * Update plans with concept map features.
 * Free: 1/day, no edit, no export
 * Plus: 3/day, no edit, no export
 * Pro: 10/day, edit yes, export yes
 * King: 25/day, edit yes, export yes
 * Ultra: 100/day, edit yes, export yes
 * Teddy: 500/day, edit yes, export yes
 * Photo: 5/day, no edit, no export
 *
 * Run with: bun run scripts/update-plans-concept-maps.ts
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const LIMITS: Record<string, { dailyLimit: number; editing: boolean; exportFlag: boolean }> = {
  free:   { dailyLimit: 1,   editing: false, exportFlag: false },
  plus:   { dailyLimit: 3,   editing: false, exportFlag: false },
  pro:    { dailyLimit: 10,  editing: true,  exportFlag: true  },
  king:   { dailyLimit: 25,  editing: true,  exportFlag: true  },
  ultra:  { dailyLimit: 100, editing: true,  exportFlag: true  },
  teddy:  { dailyLimit: 500, editing: true,  exportFlag: true  },
  photo:  { dailyLimit: 5,   editing: false, exportFlag: false },
};

const plans = await p.plan.findMany();
console.log(`Updating ${plans.length} plans...`);

for (const plan of plans) {
  const cfg = LIMITS[plan.slug];
  if (!cfg) {
    console.log(`  Skipping ${plan.slug} (unknown slug)`);
    continue;
  }
  await p.plan.update({
    where: { id: plan.id },
    data: {
      dailyConceptMapLimit: cfg.dailyLimit,
      conceptMapEditing: cfg.editing,
      conceptMapExport: cfg.exportFlag,
    },
  });
  console.log(`  ✓ ${plan.slug}: ${cfg.dailyLimit}/day, edit=${cfg.editing}, export=${cfg.exportFlag}`);
}

// Also seed default ConceptMapSettings row (id=1)
const existing = await p.conceptMapSettings.findUnique({ where: { id: 1 } });
if (!existing) {
  await p.conceptMapSettings.create({
    data: { id: 1, enabled: true, tokenCost: 300, freeDailyLimit: 1 },
  });
  console.log("\n✓ Created default ConceptMapSettings row");
} else {
  console.log("\nConceptMapSettings already exists");
}

await p.$disconnect();
console.log("Done.");
