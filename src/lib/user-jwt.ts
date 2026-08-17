/**
 * User JWT helpers — for direct email/password auth sessions.
 * Separate from admin JWT (different cookie name, type field in payload).
 * Reuses the same secret (ADMIN_JWT_SECRET) for signing.
 */
import jwt from "jsonwebtoken";

const SECRET = process.env.ADMIN_JWT_SECRET || process.env.USER_JWT_SECRET || "";
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
  if (!SECRET) throw new Error("ADMIN_JWT_SECRET is not set");
  return jwt.sign({ userId, email, type: "user" }, SECRET, {
    expiresIn: `${EXPIRES_DAYS}d`,
  });
}

export function verifyUserToken(token: string | undefined | null): UserJwtPayload | null {
  if (!token || !SECRET) return null;
  try {
    const decoded = jwt.verify(token, SECRET) as UserJwtPayload;
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
