/**
 * Seed Phase 15: themes, room objects, pets.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// 1. Themes
const themes = [
  { name: "cozy_library", description: "Warm wood tones with soft lighting", backgroundGradient: "linear-gradient(135deg, #f5e6d3 0%, #e8d5b7 50%, #d4c4a8 100%)", accentColor: "#8B5CF6", secondaryColor: "#6366F1", isPremium: false, coinCost: 0 },
  { name: "futuristic_lab", description: "Sleek dark with neon accents", backgroundGradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)", accentColor: "#06b6d4", secondaryColor: "#0891b2", isPremium: false, coinCost: 0 },
  { name: "space_station", description: "Deep space with star particles", backgroundGradient: "linear-gradient(135deg, #0c0a1e 0%, #1a0f3e 50%, #0c0a1e 100%)", accentColor: "#a855f7", secondaryColor: "#7c3aed", isPremium: true, coinCost: 50 },
  { name: "beach_study", description: "Sandy beach with ocean breeze", backgroundGradient: "linear-gradient(135deg, #fef3c7 0%, #fde68a 30%, #a7f3d0 70%, #67e8f9 100%)", accentColor: "#f59e0b", secondaryColor: "#0ea5e9", isPremium: true, coinCost: 50 },
  { name: "dark_academia", description: "Moody scholarly atmosphere", backgroundGradient: "linear-gradient(135deg, #1c1917 0%, #292524 50%, #1c1917 100%)", accentColor: "#a16207", secondaryColor: "#92400e", isPremium: true, coinCost: 100 },
  { name: "cherry_blossom", description: "Soft pink with falling petals", backgroundGradient: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 50%, #f9a8d4 100%)", accentColor: "#ec4899", secondaryColor: "#db2777", isPremium: true, coinCost: 75 },
  { name: "mint_garden", description: "Fresh green study space", backgroundGradient: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)", accentColor: "#10b981", secondaryColor: "#059669", isPremium: false, coinCost: 0 },
  { name: "sunset_loft", description: "Warm sunset vibes", backgroundGradient: "linear-gradient(135deg, #fef3c7 0%, #fdba74 30%, #fb7185 60%, #c084fc 100%)", accentColor: "#f97316", secondaryColor: "#e11d48", isPremium: true, coinCost: 60 },
];
for (const t of themes) {
  const existing = await p.roomTheme.findUnique({ where: { name: t.name } });
  if (!existing) {
    await p.roomTheme.create({ data: t });
    console.log(`  ✓ Theme: ${t.name} ${t.isPremium ? "(premium, " + t.coinCost + "c)" : "(free)"}`);
  } else {
    await p.roomTheme.update({ where: { id: existing.id }, data: t });
    console.log(`  ↻ Theme: ${t.name}`);
  }
}

// 2. Room objects
const objects = [
  { name: "desk", type: "furniture", icon: "🪑", description: "A study desk", coinCost: 0, levelRequired: 1 },
  { name: "bookshelf", type: "furniture", icon: "📚", description: "Opens your library", coinCost: 0, levelRequired: 5 },
  { name: "trophy_case", type: "furniture", icon: "🏆", description: "Showcase your badges", coinCost: 0, levelRequired: 10 },
  { name: "plant", type: "decoration", icon: "🪴", description: "Gives motivational quotes", coinCost: 10, levelRequired: 1 },
  { name: "globe", type: "decoration", icon: "🌍", description: "Random educational fact", coinCost: 20, levelRequired: 1 },
  { name: "wall_poster", type: "decoration", icon: "🖼️", description: "Decorate your walls", coinCost: 5, levelRequired: 1 },
  { name: "rug", type: "decoration", icon: "🟫", description: "Cozy floor rug", coinCost: 15, levelRequired: 1 },
  { name: "lamp", type: "decoration", icon: "💡", description: "Toggle warm lighting", coinCost: 10, levelRequired: 1 },
  { name: "treasure_chest", type: "special", icon: "🧰", description: "Daily bonus rewards", coinCost: 0, levelRequired: 3 },
  { name: "window", type: "special", icon: "🪟", description: "Changes scenery by topic", coinCost: 0, levelRequired: 7 },
  { name: "fireplace", type: "decoration", icon: "🔥", description: "Cozy fireplace", coinCost: 30, levelRequired: 5 },
  { name: "crystal", type: "decoration", icon: "💎", description: "Shiny crystal", coinCost: 25, levelRequired: 8 },
  { name: "telescope", type: "decoration", icon: "🔭", description: "Look at the stars", coinCost: 40, levelRequired: 12 },
  { name: "piano", type: "decoration", icon: "🎹", description: "Play a tune", coinCost: 50, levelRequired: 15 },
];
for (const o of objects) {
  const existing = await p.roomObject.findUnique({ where: { name: o.name } });
  if (!existing) {
    await p.roomObject.create({ data: o });
    console.log(`  ✓ Object: ${o.icon} ${o.name} (${o.coinCost}c, L${o.levelRequired})`);
  } else {
    await p.roomObject.update({ where: { id: existing.id }, data: o });
    console.log(`  ↻ Object: ${o.name}`);
  }
}

// 3. Pets
const pets = [
  { name: "owl", emoji: "🦉", description: "Wise study companion", coinCost: 0, levelRequired: 1 },
  { name: "robot", emoji: "🤖", description: "Helpful AI bot", coinCost: 100, levelRequired: 5 },
  { name: "cat", emoji: "🐱", description: "Curious study cat", coinCost: 150, levelRequired: 5 },
  { name: "dragon", emoji: "🐉", description: "Powerful study dragon", coinCost: 500, levelRequired: 10 },
  { name: "penguin", emoji: "🐧", description: "Chilly study buddy", coinCost: 80, levelRequired: 3 },
  { name: "unicorn", emoji: "🦄", description: "Magical study companion", coinCost: 300, levelRequired: 8 },
  { name: "fox", emoji: "🦊", description: "Clever study fox", coinCost: 120, levelRequired: 5 },
  { name: "frog", emoji: "🐸", description: "Happy study frog", coinCost: 50, levelRequired: 2 },
];
for (const pet of pets) {
  const existing = await p.pet.findUnique({ where: { name: pet.name } });
  if (!existing) {
    await p.pet.create({ data: pet });
    console.log(`  ✓ Pet: ${pet.emoji} ${pet.name} (${pet.coinCost}c, L${pet.levelRequired})`);
  } else {
    await p.pet.update({ where: { id: existing.id }, data: pet });
    console.log(`  ↻ Pet: ${pet.name}`);
  }
}

console.log("\n✓ Phase 15 seed complete");
await p.$disconnect();
