/**
 * User JWT helpers — for direct email/password auth sessions.
 *
 * Phase 0 — SECRET REQUIREMENTS IN PRODUCTION:
 *   1. USER_JWT_SECRET (REQUIRED in production — explicit, not derived)
 *   2. ADMIN_JWT_SECRET (fallback for backward compat — will be removed)
 *   3. API_KEY_ENCRYPTION_SECRET
 *   4. Hash of DATABASE_URL (LAST RESORT — dev/test only, never in production)
 *
 * In production (NODE_ENV=production), the module REFUSES to start if
 * USER_JWT_SECRET is not set. No DATABASE_URL-derived fallback is allowed.
 * In dev/test, the fallback chain remains with a console warning.
 */
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { assertProductionSecrets } from "./security-config";

// Phase 0 — Assert production secrets at module load time.
assertProductionSecrets();

function getSecret(): string {
  // Phase 90.2 / Phase 0 — User-specific secret (separate from admin)
  if (process.env.USER_JWT_SECRET) return process.env.USER_JWT_SECRET;
  // Fallback: derive a DIFFERENT secret from the admin secret
  // (adds "user:" prefix so the hash differs from admin's)
  // Phase 0: This fallback is ONLY available in dev/test.
  // assertProductionSecrets() above ensures production never reaches here without USER_JWT_SECRET.
  if (process.env.ADMIN_JWT_SECRET) {
    return createHash("sha256").update("user:" + process.env.ADMIN_JWT_SECRET).digest("hex");
  }
  if (process.env.API_KEY_ENCRYPTION_SECRET) {
    return createHash("sha256").update("user:" + process.env.API_KEY_ENCRYPTION_SECRET).digest("hex");
  }
  const dbUrl = process.env.DATABASE_URL || "fallback-secret-not-secure";
  return createHash("sha256").update("user:" + dbUrl).digest("hex");
}

const COOKIE_NAME = "user_token";
const EXPIRES_DAYS = 7;

export type UserJwtPayload = {
  userId: string;
  email: string;
  type: "user";
  iat?: number;
  exp?: number;
};

export function signUserToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, type: "user" }, getSecret(), {
    expiresIn: `${EXPIRES_DAYS}d`,
  });
}

export function verifyUserToken(token: string | undefined | null): UserJwtPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getSecret()) as UserJwtPayload;
    if (decoded.type !== "user" || !decoded.userId) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getUserCookieName(): string {
  return COOKIE_NAME;
}

export function getUserCookieMaxAge(): number {
  return EXPIRES_DAYS * 24 * 60 * 60;
}
