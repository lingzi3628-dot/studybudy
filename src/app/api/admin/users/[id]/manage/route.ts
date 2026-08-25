import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/users/[id]/manage
 * Body: { action: 'ban' | 'unban' | 'delete' | 'verifyEmail', reason?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await requireAdmin(); } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Admin access required" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = (body?.action ?? "").toString();
  const reason = (body?.reason ?? "").toString().trim() || "No reason provided";

  if (!["ban", "unban", "delete", "verifyEmail"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let actionLabel = "";
    if (action === "ban") {
      await db.user.update({ where: { id }, data: { banned: true } });
      actionLabel = "BANNED";
    } else if (action === "unban") {
      await db.user.update({ where: { id }, data: { banned: false } });
      actionLabel = "UNBANNED";
    } else if (action === "verifyEmail") {
      await db.user.update({ where: { id }, data: { emailVerified: true } });
      actionLabel = "EMAIL VERIFIED";
    } else if (action === "delete") {
      await db.user.delete({ where: { id } });
      actionLabel = "DELETED";
    }

    // Automated admin notification email
    const html = `<div style="font-family:sans-serif;padding:24px;background:#f3f4f6;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
<div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:24px;color:#fff;">
<h1 style="margin:0;font-size:18px;">Admin Action: ${actionLabel}</h1>
</div>
<div style="padding:24px;">
<table style="width:100%;font-size:14px;color:#4b5563;">
<tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">User:</td><td>${user.name ?? "—"}</td></tr>
<tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Email:</td><td>${user.email ?? "—"}</td></tr>
<tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Action:</td><td><strong>${actionLabel}</strong></td></tr>
<tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Reason:</td><td>${reason}</td></tr>
<tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Time:</td><td>${new Date().toLocaleString()}</td></tr>
</table>
</div></div></div>`;

    sendEmail({
      to: "lingzi3628@gmail.com",
      subject: `Admin: User ${actionLabel} — ${user.email ?? "unknown"}`,
      html,
    }).catch(() => {});

    return NextResponse.json({ ok: true, action: actionLabel });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
