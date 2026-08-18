/**
 * AES-256-CBC encryption helpers for user BYOK API keys.
 * Secret comes from API_KEY_ENCRYPTION_SECRET env (32-byte hex).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const SECRET_HEX = process.env.API_KEY_ENCRYPTION_SECRET || "";
const SECRET_KEY = Buffer.from(SECRET_HEX, "hex");

function getKey(): Buffer {
  if (SECRET_KEY.length === 32) return SECRET_KEY;
  // dev fallback — deterministic key, NOT for production
  return createHash("sha256").update("dev-only-key-do-not-use-in-prod").digest();
}

/** Encrypt a string. Returns `iv:ciphertext` (both hex). */
export function encryptApiKey(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt an `iv:ciphertext` string. Returns plaintext. */
export function decryptApiKey(stored: string | null | undefined): string {
  if (!stored) return "";
  try {
    const [ivHex, ctHex] = stored.split(":");
    if (!ivHex || !ctHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const ct = Buffer.from(ctHex, "hex");
    const decipher = createDecipheriv("aes-256-cbc", getKey(), iv);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Mask an API key for safe display in admin UI.
 * Decrypts the stored `iv:ciphertext`, then returns `sk-****1234` style.
 * If decryption fails or the stored value is empty, returns null.
 */
export function maskApiKey(storedEncrypted: string | null | undefined): string | null {
  if (!storedEncrypted) return null;
  const plain = decryptApiKey(storedEncrypted);
  if (!plain) return null;
  if (plain.length <= 8) return "•".repeat(plain.length);
  return plain.slice(0, 3) + "•".repeat(Math.max(4, plain.length - 7)) + plain.slice(-4);
}
