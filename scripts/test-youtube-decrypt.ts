import { PrismaClient } from "@prisma/client";
import { createDecipheriv, createHash } from "crypto";
const db = new PrismaClient();

const SECRET_HEX = process.env.API_KEY_ENCRYPTION_SECRET || "";
const SECRET_KEY = Buffer.from(SECRET_HEX, "hex");
function getKey(): Buffer {
  if (SECRET_KEY.length === 32) return SECRET_KEY;
  return createHash("sha256").update("dev-only-key-do-not-use-in-prod").digest();
}
function decrypt(stored: string): string {
  try {
    const [ivHex, ctHex] = stored.split(":");
    if (!ivHex || !ctHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const ct = Buffer.from(ctHex, "hex");
    const decipher = createDecipheriv("aes-256-cbc", getKey(), iv);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf-8");
  } catch { return ""; }
}

const ss = await db.searchSettings.findUnique({ where: { id: 1 } });
if (!ss?.youtubeApiKeyEncrypted) {
  console.log("No encrypted YouTube key in DB");
  process.exit(0);
}
const key = decrypt(ss.youtubeApiKeyEncrypted);
console.log("Decrypted YouTube key:", key.slice(0, 12) + "...");
console.log("Length:", key.length, "expected:", 39);
console.log("Match:", key === "AIzaSyCHbIwUpYMOrTcvXVUz2sZ4SkCPybDyebQ" ? "✓" : "✗");

// Test the decrypted key against the YouTube API
const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=biology&maxResults=1&key=${key}`;
const r = await fetch(url);
console.log("YouTube API status with decrypted key:", r.status);
if (r.ok) {
  const d = await r.json();
  console.log("First video:", d.items?.[0]?.snippet?.title);
}
await db.$disconnect();
