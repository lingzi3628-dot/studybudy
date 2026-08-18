/**
 * Admin JWT helpers — sign/verify HTTP-only cookies for /admin sessions.
 *
 * Secret resolution (in order):
 *   1. ADMIN_JWT_SECRET
 *   2. API_KEY_ENCRYPTION_SECRET
 *   3. Hash of DATABASE_URL (last resort — always present)
 */
import jwt from "jsonwebtoken";
import { createHash } from "crypto";

function getSecret(): string {
  if (process.env.ADMIN_JWT_SECRET) return process.env.ADMIN_JWT_SECRET;
  if (process.env.API_KEY_ENCRYPTION_SECRET) return process.env.API_KEY_ENCRYPTION_SECRET;
  // Last resort: derive from DATABASE_URL (always present)
  const dbUrl = process.env.DATABASE_URL || "fallback-secret-not-secure";
  return createHash("sha256").update(dbUrl).digest("hex");
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
