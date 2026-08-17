import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";

export const runtime = "nodejs";

/**
 * POST /api/admin/auth/change-password
 * Body: { currentPassword, newPassword }
 *
 * Verifies the current password, then updates the password_hash.
 * The admin stays logged in (the JWT cookie is unchanged).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const currentPassword = (body.currentPassword ?? "").toString();
  const newPassword = (body.newPassword ?? "").toString();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Both currentPassword and newPassword are required" }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }

  // Fetch current hash
  const adminRow = await db.adminUser.findUnique({ where: { id: admin.adminId } });
  if (!adminRow) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  const matches = bcrypt.compareSync(currentPassword, adminRow.passwordHash);
  if (!matches) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  // Update with new hash
  const newHash = bcrypt.hashSync(newPassword, 10);
  await db.adminUser.update({
    where: { id: admin.adminId },
    data: { passwordHash: newHash },
  });

  await logAdminActionViaJwt(admin, "admin.change_password", { email: admin.adminEmail });

  return NextResponse.json({ ok: true });
}
