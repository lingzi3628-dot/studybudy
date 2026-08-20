import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * PUT /api/study-room/[topicId]/settings
 * Body: { aiTeacherName?, aiTeacherAvatar?, aiTeacherStyle?,
 *         roomTheme?, bookshelfColor?, preferredAudio?,
 *         voiceEnabled?, voiceVoice?, coverImageUrl? }
 *
 * Updates the StudyRoomState. Some fields are premium-only:
 * - roomTheme, bookshelfColor → premium (room customization)
 * - voiceEnabled, voiceVoice → premium (voice interaction)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as {
    aiTeacherName?: string;
    aiTeacherAvatar?: string;
    aiTeacherStyle?: string;
    roomTheme?: string;
    bookshelfColor?: string;
    preferredAudio?: string;
    voiceEnabled?: boolean;
    voiceVoice?: string;
    coverImageUrl?: string;
  };

  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));

  const data: any = {};

  // Free for all
  if (typeof body.aiTeacherName === "string") data.aiTeacherName = body.aiTeacherName.slice(0, 50);
  if (typeof body.aiTeacherAvatar === "string") data.aiTeacherAvatar = body.aiTeacherAvatar.slice(0, 10);
  if (typeof body.aiTeacherStyle === "string" && ["encouraging", "strict", "fun", "academic"].includes(body.aiTeacherStyle)) {
    data.aiTeacherStyle = body.aiTeacherStyle;
  }
  if (typeof body.preferredAudio === "string") data.preferredAudio = body.preferredAudio || null;
  if (typeof body.coverImageUrl === "string") data.coverImageUrl = body.coverImageUrl || null;

  // Premium-only
  if (typeof body.roomTheme === "string") {
    if (!isPremium) {
      return NextResponse.json(
        { error: "Customizing the room theme requires a premium plan.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }
    data.roomTheme = body.roomTheme;
  }
  if (typeof body.bookshelfColor === "string") {
    if (!isPremium) {
      return NextResponse.json(
        { error: "Customizing the bookshelf color requires a premium plan.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }
    data.bookshelfColor = body.bookshelfColor;
  }
  if (typeof body.voiceEnabled === "boolean") {
    if (!isPremium) {
      return NextResponse.json(
        { error: "Voice interaction requires a premium plan.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }
    data.voiceEnabled = body.voiceEnabled;
  }
  if (typeof body.voiceVoice === "string") {
    if (!isPremium) {
      return NextResponse.json(
        { error: "Voice selection requires a premium plan.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }
    data.voiceVoice = body.voiceVoice;
  }

  const updated = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: { userId: user.id, topicId, ...data },
    update: data,
  });

  return NextResponse.json({ room: updated });
}
