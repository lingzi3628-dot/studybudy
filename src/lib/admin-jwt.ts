/**
 * Admin JWT helpers — sign/verify HTTP-only cookies for /admin sessions.
 * This is the SECONDARY auth system, separate from Clerk (user auth).
 *
 * The JWT payload is `{ adminId, adminEmail }` and is signed with
 * ADMIN_JWT_SECRET. Stored in cookie `admin_token` (configurable).
 *
 * Cookie attrs: HTTP-only, secure (in production), sameSite='lax',
 * maxAge = ADMIN_JWT_EXPIRES_DAYS (default 7).
 */
import jwt from "jsonwebtoken";

const SECRET = process.env.ADMIN_JWT_SECRET || "";
const COOKIE_NAME = process.env.ADMIN_JWT_COOKIE_NAME || "admin_token";
const EXPIRES_DAYS = Number(process.env.ADMIN_JWT_EXPIRES_DAYS || 7);

export type AdminJwtPayload = {
  adminId: string;
  adminEmail: string;
  iat?: number;
  exp?: number;
};

/** Sign a JWT for the given admin user. */
export function signAdminToken(adminId: string, adminEmail: string): string {
  if (!SECRET) {
    throw new Error("ADMIN_JWT_SECRET is not set in environment");
  }
  return jwt.sign({ adminId, adminEmail }, SECRET, {
    expiresIn: `${EXPIRES_DAYS}d`,
  });
}

/** Verify a JWT. Returns the payload or null if invalid/expired. */
export function verifyAdminToken(token: string | undefined | null): AdminJwtPayload | null {
  if (!token || !SECRET) return null;
  try {
    const decoded = jwt.verify(token, SECRET) as AdminJwtPayload;
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
  return EXPIRES_DAYS * 24 * 60 * 60; // seconds
}
