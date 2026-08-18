import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/** GET /api/admin/activation-keys?status=active */
export async function GET(req: NextRequest) {
  await requireAdminJwt();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const keys = await db.activationKey.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { plan: true, user: { select: { email: true, name: true } } },
  });
  return NextResponse.json({ keys });
}

/**
 * POST /api/admin/activation-keys
 * Body: { planId, expiresAt? (ISO string), userId? }
 * Generates a random activation key linked to the plan.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const planId = (body.planId ?? "").toString();
  if (!planId) return NextResponse.json({ error: "Missing planId" }, { status: 400 });

  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  // Generate key: SB-XXXX-XXXX-XXXX-XXXX
  const gen = () => randomBytes(4).toString("hex").toUpperCase().slice(0, 4);
  const key = `SB-${gen()}-${gen()}-${gen()}-${gen()}`;

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

  const activationKey = await db.activationKey.create({
    data: {
      key,
      planId,
      userId: body.userId || null,
      createdBy: admin.adminId,
      expiresAt,
    },
  });

  await logAdminActionViaJwt(admin, "activation_key.generate", { keyId: activationKey.id, planId });
  return NextResponse.json({ key: activationKey });
}

/**
 * DELETE /api/admin/activation-keys/[id] — revoke a key
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdminJwt();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.activationKey.update({
    where: { id },
    data: { status: "revoked" },
  });
  await logAdminActionViaJwt(admin, "activation_key.revoke", { keyId: id });
  return NextResponse.json({ ok: true });
}
