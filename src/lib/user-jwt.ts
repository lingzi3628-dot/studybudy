/**
 * User JWT helpers — for direct email/password auth sessions.
 *
 * Uses ADMIN_JWT_SECRET if set, falls back to API_KEY_ENCRYPTION_SECRET
 * (which is always set) so user auth works even on Vercel without
 * ADMIN_JWT_SECRET configured.
 */
import jwt from "jsonwebtoken";

const SECRET =
  process.env.ADMIN_JWT_SECRET ||
  process.env.API_KEY_ENCRYPTION_SECRET ||
  "";

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
  if (!SECRET) {
    throw new Error("Neither ADMIN_JWT_SECRET nor API_KEY_ENCRYPTION_SECRET is set");
  }
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
