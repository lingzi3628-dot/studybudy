/**
 * Save the YouTube API key using the EXACT same algorithm as src/lib/crypto.ts
 * so that Vercel can decrypt it at runtime.
 *
 * Run with: bun run scripts/save-youtube-key.ts
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
const db = new PrismaClient();

const YOUTUBE_API_KEY = "AIzaSyCHbIwUpYMOrTcvXVUz2sZ4SkCPybDyebQ";

// --- EXACT replica of src/lib/crypto.ts getKey() logic ---
const SECRET_HEX = process.env.API_KEY_ENCRYPTION_SECRET || "";
const SECRET_KEY_BUFFER = Buffer.from(SECRET_HEX, "hex");

function getKey(): Buffer {
  if (SECRET_KEY_BUFFER.length === 32) return SECRET_KEY_BUFFER;
  // dev fallback — matches crypto.ts
  return crypto.createHash("sha256").update("dev-only-key-do-not-use-in-prod").digest();
}

function encryptApiKey(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptApiKey(stored: string): string {
  try {
    const [ivHex, ctHex] = stored.split(":");
    if (!ivHex || !ctHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const ct = Buffer.from(ctHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(), iv);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    return "";
  }
}

async function main() {
  console.log("API_KEY_ENCRYPTION_SECRET env:", process.env.API_KEY_ENCRYPTION_SECRET ?? "(unset)");
  console.log("Using dev fallback key:", SECRET_KEY_BUFFER.length !== 32);

  // 1. Test the YouTube API key first
  console.log("\nTesting YouTube API key...");
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=photosynthesis&maxResults=2&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  console.log(`  Status: ${res.status}`);
  if (res.ok) {
    const data = await res.json();
    console.log(`  ✓ Key works! Got ${data.items?.length ?? 0} videos`);
  } else {
    const txt = await res.text();
    console.log(`  ✗ Key failed: ${txt.slice(0, 200)}`);
    process.exit(1);
  }

  // 2. Encrypt the key with the same algorithm as crypto.ts
  const encrypted = encryptApiKey(YOUTUBE_API_KEY);
  console.log(`\nEncrypted key (first 40 chars): ${encrypted.slice(0, 40)}...`);

  // 3. Verify roundtrip decryption works
  const decrypted = decryptApiKey(encrypted);
  console.log(`Decryption roundtrip: ${decrypted === YOUTUBE_API_KEY ? "✓" : "✗"}`);

  // 4. Upsert into SearchSettings
  console.log("\nSaving to SearchSettings...");
  const existing = await db.searchSettings.findUnique({ where: { id: 1 } });
  if (existing) {
    await db.searchSettings.update({
      where: { id: 1 },
      data: {
        youtubeApiKeyEncrypted: encrypted,
        pollinationsBaseUrl: "https://image.pollinations.ai/prompt/",
        imageSearchEnabled: true,
        videoSearchEnabled: true,
        imageTokenCost: 10,
        videoTokenCost: 50,
        freeDailyImageLimit: 5,
        freeDailyVideoLimit: 3,
      },
    });
    console.log("  ✓ Updated existing SearchSettings row");
  } else {
    await db.searchSettings.create({
      data: {
        id: 1,
        youtubeApiKeyEncrypted: encrypted,
        pollinationsBaseUrl: "https://image.pollinations.ai/prompt/",
        imageSearchEnabled: true,
        videoSearchEnabled: true,
        imageTokenCost: 10,
        videoTokenCost: 50,
        freeDailyImageLimit: 5,
        freeDailyVideoLimit: 3,
      },
    });
    console.log("  ✓ Created new SearchSettings row");
  }

  // 5. Verify
  const after = await db.searchSettings.findUnique({ where: { id: 1 } });
  console.log("\nVerified state:");
  console.log({
    id: after?.id,
    hasYoutubeKey: Boolean(after?.youtubeApiKeyEncrypted),
    pollinationsBaseUrl: after?.pollinationsBaseUrl,
    imageSearchEnabled: after?.imageSearchEnabled,
    videoSearchEnabled: after?.videoSearchEnabled,
    imageTokenCost: after?.imageTokenCost,
    videoTokenCost: after?.videoTokenCost,
    freeDailyImageLimit: after?.freeDailyImageLimit,
    freeDailyVideoLimit: after?.freeDailyVideoLimit,
    updatedAt: after?.updatedAt,
  });

  // 6. Decrypt from DB to verify Vercel will be able to decrypt
  if (after?.youtubeApiKeyEncrypted) {
    const dbDecrypted = decryptApiKey(after.youtubeApiKeyEncrypted);
    console.log(`\nDB decryption test: ${dbDecrypted === YOUTUBE_API_KEY ? "✓ Vercel will be able to decrypt" : "✗ MISMATCH!"}`);
    console.log(`  Decrypted value starts with: ${dbDecrypted.slice(0, 10)}...`);
  }

  await db.$disconnect();
  console.log("\n✓ Done.");
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
