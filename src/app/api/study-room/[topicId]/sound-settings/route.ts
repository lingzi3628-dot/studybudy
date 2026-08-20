import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type SoundSettings = {
  fireplace?: number;
  rain?: number;
  birds?: number;
  lofi?: number;
  pages?: number;
};

const KEYS: (keyof SoundSettings)[] = ["fireplace", "rain", "birds", "lofi", "pages"];

/**
 * PUT /api/study-room/[topicId]/sound-settings
 * Body: { fireplace?, rain?, birds?, lofi?, pages? } — each value 0-100
 *
 * Merges the supplied fields into the existing soundSettings JSON.
 * Missing keys are kept as-is. Values are clamped to [0,100].
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as SoundSettings;

  // Verify the topic exists
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  }).catch(() => null);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Fetch existing state (need current soundSettings to merge)
  const existing = await db.studyRoomState.findUnique({
    where: { userId_topicId: { userId: user.id, topicId } },
    select: { soundSettings: true },
  }).catch(() => null);

  const defaults: Required<SoundSettings> = {
    fireplace: 0,
    rain: 0,
    birds: 0,
    lofi: 0,
    pages: 0,
  };
  const current = { ...(defaults as Required<SoundSettings>), ...((existing?.soundSettings as any) ?? {}) };

  const next: Required<SoundSettings> = { ...current };
  for (const key of KEYS) {
    if (body[key] !== undefined) {
      next[key] = clampPercent(body[key]);
    }
  }

  const updated = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: {
      userId: user.id,
      topicId,
      soundSettings: next as any,
      lastVisited: new Date(),
    },
    update: {
      soundSettings: next as any,
      lastVisited: new Date(),
    },
  }).catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Failed to update sound settings." }, { status: 500 });
  }

  return NextResponse.json({
    room: {
      id: updated.id,
      topicId: updated.topicId,
      soundSettings: (updated.soundSettings as any) ?? next,
    },
  });
}

/** Coerce to integer in [0,100]. */
function clampPercent(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
