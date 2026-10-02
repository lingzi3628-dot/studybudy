/**
 * Admin JWT helpers — sign/verify HTTP-only cookies for /admin sessions.
 *
 * Phase 0 — SECRET REQUIREMENTS IN PRODUCTION:
 *   1. ADMIN_JWT_SECRET (REQUIRED in production — explicit, not derived)
 *   2. API_KEY_ENCRYPTION_SECRET (fallback, derived differently from user)
 *   3. Hash of DATABASE_URL with "admin:" prefix (LAST RESORT — dev/test only)
 *
 * In production (NODE_ENV=production), the module REFUSES to start if
 * ADMIN_JWT_SECRET is not set. No DATABASE_URL-derived fallback is allowed.
 * In dev/test, the fallback chain remains with a console warning.
 *
 * This separation means a leaked admin JWT secret CANNOT forge user tokens,
 * and vice versa. Defense in depth.
 */
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { assertProductionSecrets } from "./security-config";

// Phase 0 — Assert production secrets at module load time.
assertProductionSecrets();

function getSecret(): string {
  // Phase 90.2 / Phase 0 — Admin-specific secret (separate from user)
  if (process.env.ADMIN_JWT_SECRET) return process.env.ADMIN_JWT_SECRET;
  // Fallback: derive a DIFFERENT secret from the API key
  // (adds "admin:" prefix so the hash differs from user's)
  // Phase 0: This fallback is ONLY available in dev/test.
  if (process.env.API_KEY_ENCRYPTION_SECRET) {
    return createHash("sha256").update("admin:" + process.env.API_KEY_ENCRYPTION_SECRET).digest("hex");
  }
  const dbUrl = process.env.DATABASE_URL || "fallback-secret-not-secure";
  return createHash("sha256").update("admin:" + dbUrl).digest("hex");
}

const COOKIE_NAME = process.env.ADMIN_JWT_COOKIE_NAME || "admin_token";
const EXPIRES_DAYS = Number(process.env.ADMIN_JWT_EXPIRES_DAYS || 7);

export type AdminJwtPayload = {
  adminId: string;
  adminEmail: string;
  iat?: number;
  exp?: number;
};

export function signAdminToken(adminId: string, adminEmail: string): string {
  return jwt.sign({ adminId, adminEmail }, getSecret(), {
    expiresIn: `${EXPIRES_DAYS}d`,
  });
}

export function verifyAdminToken(token: string | undefined | null): AdminJwtPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getSecret()) as AdminJwtPayload;
    if (!decoded.adminId || !decoded.adminEmail) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getAdminCookieName(): string {
  return COOKIE_NAME;
}

export function getAdminCookieMaxAge(): number {
  return EXPIRES_DAYS * 24 * 60 * 60;
}
