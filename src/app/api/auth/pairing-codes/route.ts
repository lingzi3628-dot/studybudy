import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    const topicId = typeof body.topicId === "string" ? body.topicId.slice(0, 100) : null;
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.slice(0, 100) : null;
    const candidate = body.workspaceOffer;
    const allowedWorkspaces = ["computer", "design", "study", "exam", "code", "web", "modeling", "simulation", "data", "tvet"];
    const workspaceOffer = candidate && typeof candidate === "object" &&
      allowedWorkspaces.includes(candidate.workspace) &&
      [candidate.title, candidate.reason, candidate.benefit].every((value) => typeof value === "string" && value.trim().length > 0)
      ? { title: candidate.title.trim().slice(0, 80), reason: candidate.reason.trim().slice(0, 240), benefit: candidate.benefit.trim().slice(0, 240), workspace: candidate.workspace }
      : undefined;

    if (topicId) {
      const room = await db.studyRoomState.findUnique({ where: { userId_topicId: { userId: user.id, topicId } }, select: { id: true } });
      if (!room) return NextResponse.json({ error: "This Study Room is not available for your account." }, { status: 404 });
    }
    if (conversationId) {
      const conversation = await db.chatConversation.findFirst({ where: { id: conversationId, userId: user.id }, select: { id: true } });
      if (!conversation) return NextResponse.json({ error: "This tutor conversation is not available for your account." }, { status: 404 });
    }

    const now = new Date();
    await db.devicePairingCode.deleteMany({ where: { userId: user.id, OR: [{ expiresAt: { lte: now } }, { redeemedAt: { not: null } }] } });
    const active = await db.devicePairingCode.count({ where: { userId: user.id, expiresAt: { gt: now }, redeemedAt: null } });
    if (active >= 3) return NextResponse.json({ error: "You already have three active computer codes. Wait for one to expire and try again." }, { status: 429 });

    const code = randomBytes(6).toString("hex").toUpperCase();
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(now.getTime() + 8 * 60 * 1000);
    await db.devicePairingCode.create({ data: { userId: user.id, codeHash, topicId, conversationId, workspaceOffer, expiresAt } });
    return NextResponse.json({ code, expiresAt: expiresAt.toISOString(), connectUrl: "/connect-computer" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not prepare computer pairing." }, { status: error?.status || 500 });
  }
}
