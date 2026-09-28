import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import sharp from "sharp";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const room = await db.studyRoomState.findUnique({
    where: { userId_topicId: { userId: user.id, topicId } },
    select: { id: true },
  });
  if (!room) return NextResponse.json({ error: "Study Room not found." }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { svg?: string };
  const svg = typeof body.svg === "string" ? body.svg : "";
  if (!svg || svg.length > 300_000 || !svg.trimStart().startsWith("<svg") || /<script|foreignObject|(?:href|src)\s*=|url\(/i.test(svg)) {
    return NextResponse.json({ error: "Invalid drawing image." }, { status: 400 });
  }
  try {
    const png = await sharp(Buffer.from(svg), { density: 144, limitInputPixels: 2_000_000 })
      .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return NextResponse.json({ image: `data:image/png;base64,${png.toString("base64")}` });
  } catch {
    return NextResponse.json({ error: "Could not prepare that drawing for the tutor." }, { status: 400 });
  }
}
