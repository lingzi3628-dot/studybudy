/**
 * Admin JWT helpers — sign/verify HTTP-only cookies for /admin sessions.
 *
 * Uses ADMIN_JWT_SECRET if set. Falls back to API_KEY_ENCRYPTION_SECRET
 * (which is always set) so admin auth works even if ADMIN_JWT_SECRET
 * was accidentally omitted from Vercel env vars.
 */
import jwt from "jsonwebtoken";

const SECRET =
  process.env.ADMIN_JWT_SECRET ||
  process.env.API_KEY_ENCRYPTION_SECRET ||
  "";

const COOKIE_NAME = process.env.ADMIN_JWT_COOKIE_NAME || "admin_token";
const EXPIRES_DAYS = Number(process.env.ADMIN_JWT_EXPIRES_DAYS || 7);

export type AdminJwtPayload = {
  adminId: string;
  adminEmail: string;
  iat?: number;
  exp?: number;
};

export function signAdminToken(adminId: string, adminEmail: string): string {
  if (!SECRET) {
    throw new Error("Neither ADMIN_JWT_SECRET nor API_KEY_ENCRYPTION_SECRET is set");
  }
  return jwt.sign({ adminId, adminEmail }, SECRET, {
    expiresIn: `${EXPIRES_DAYS}d`,
  });
}

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
  return EXPIRES_DAYS * 24 * 60 * 60;
}
