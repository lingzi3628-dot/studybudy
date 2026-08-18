/**
 * User JWT helpers — for direct email/password auth sessions.
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
  const dbUrl = process.env.DATABASE_URL || "fallback-secret-not-secure";
  return createHash("sha256").update(dbUrl).digest("hex");
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
