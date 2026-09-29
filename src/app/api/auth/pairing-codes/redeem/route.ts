import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserCookieMaxAge, getUserCookieName, signUserToken } from "@/lib/user-jwt";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.replace(/\s|-/g, "").toUpperCase() : "";
  if (!/^[A-F0-9]{12}$/.test(code)) return NextResponse.json({ error: "Enter the 12-character code shown in the app." }, { status: 400 });

  const codeHash = createHash("sha256").update(code).digest("hex");
  const now = new Date();
  const pairing = await db.devicePairingCode.findFirst({
    where: { codeHash, redeemedAt: null, expiresAt: { gt: now } },
    include: { user: { select: { id: true, email: true, banned: true } } },
  });
  if (!pairing || pairing.user.banned) return NextResponse.json({ error: "That code is invalid or expired. Create a fresh code in the app." }, { status: 400 });

  // Atomic one-time redemption prevents a second browser from reusing the code.
  const consumed = await db.devicePairingCode.updateMany({
    where: { id: pairing.id, redeemedAt: null, expiresAt: { gt: now } },
    data: { redeemedAt: now },
  });
  if (consumed.count !== 1) return NextResponse.json({ error: "That code has already been used. Create a fresh code in the app." }, { status: 409 });

  if (pairing.topicId && pairing.workspaceOffer && typeof pairing.workspaceOffer === "object") {
    const room = await db.studyRoomState.findUnique({
      where: { userId_topicId: { userId: pairing.userId, topicId: pairing.topicId } },
      select: { workspaceProgress: true },
    });
    if (room) {
      const current = room.workspaceProgress && typeof room.workspaceProgress === "object" && !Array.isArray(room.workspaceProgress)
        ? room.workspaceProgress as Record<string, unknown> : {};
      await db.studyRoomState.update({
        where: { userId_topicId: { userId: pairing.userId, topicId: pairing.topicId } },
        data: { workspaceProgress: { ...current, computerTask: { ...(pairing.workspaceOffer as Record<string, unknown>), startedAt: now.toISOString() } } as any },
      });
    }
  }

  const emailClaim = pairing.user.email || `${pairing.user.id}@paired.studybuddy.invalid`;
  const token = signUserToken(pairing.user.id, emailClaim);
  const response = NextResponse.json({ ok: true, topicId: pairing.topicId, conversationId: pairing.conversationId, workspaceOffer: pairing.workspaceOffer });
  response.cookies.set(getUserCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: getUserCookieMaxAge(),
    path: "/",
  });
  return response;
}
