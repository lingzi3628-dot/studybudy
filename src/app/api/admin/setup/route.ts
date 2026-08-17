import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/setup
 *
 * Auto-seeds the initial admin user from env vars:
 *   ADMIN_INITIAL_EMAIL
 *   ADMIN_INITIAL_PASSWORD
 *
 * Only runs if the admin_users table is empty. Otherwise returns 409.
 * This route is PUBLIC (no auth required) so it can be hit on first deploy.
 *
 * The login endpoint also calls ensureInitialAdmin() internally, so this
 * route is mainly for explicit setup checks.
 */

/** Ensure an admin exists — auto-creates from env vars if the table is empty. */
export async function ensureInitialAdmin(): Promise<{ created: boolean; email: string | null }> {
  const count = await db.adminUser.count();
  if (count > 0) {
    return { created: false, email: null };
  }

  const email = (process.env.ADMIN_INITIAL_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_INITIAL_PASSWORD ?? "";

  if (!email || !password) {
    return { created: false, email: null };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await db.adminUser.create({
    data: { email, passwordHash, name: "Admin" },
  });

  return { created: true, email };
}

export async function POST() {
  const result = await ensureInitialAdmin();
  if (!result.created) {
    return NextResponse.json(
      { ok: false, message: result.email === null
          ? "Admin already exists, or ADMIN_INITIAL_EMAIL/ADMIN_INITIAL_PASSWORD env vars are not set."
          : `Admin already exists (${result.email}).` },
      { status: 409 }
    );
  }
  return NextResponse.json({
    ok: true,
    message: `Initial admin created with email ${result.email}. Please change the password in the admin panel.`,
  });
}

/** GET — check if setup is needed (table is empty). */
export async function GET() {
  const count = await db.adminUser.count();
  return NextResponse.json({
    setupNeeded: count === 0,
    hasEnvEmail: Boolean(process.env.ADMIN_INITIAL_EMAIL),
    hasEnvPassword: Boolean(process.env.ADMIN_INITIAL_PASSWORD),
  });
}
