import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt, logAdminActionViaJwt } from "@/lib/admin-session";

export const runtime = "nodejs";

const DEFAULTS = {
  defaultCoverImages: [
    "https://image.pollinations.ai/prompt/study%20books%20library%20illustration?width=512&height=256&nologo=true",
    "https://image.pollinations.ai/prompt/graduation%20cap%20education%20illustration?width=512&height=256&nologo=true",
    "https://image.pollinations.ai/prompt/abacus%20math%20learning%20illustration?width=512&height=256&nologo=true",
  ],
  defaultTeacherName: "Professor Bloom",
  defaultTeacherAvatar: "🧙‍♂️",
  defaultTeacherStyle: "encouraging",
  availableAvatars: ["🧙‍♂️", "👩‍🏫", "👨‍🏫", "🦉", "🎓", "📚", "🌟", "🤖", "🦊", "🐧"],
  availableStyles: ["encouraging", "strict", "fun", "academic"],
};

// In-memory store for admin-tuned defaults (could be moved to DB if needed)
let adminTunedDefaults: any = {};

/** GET /api/admin/study-room-defaults */
export async function GET() {
  await requireAdminJwt();
  return NextResponse.json({ ...DEFAULTS, ...adminTunedDefaults });
}

/** PUT /api/admin/study-room-defaults */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));

  const updates: any = {};
  if (typeof body.defaultTeacherName === "string") updates.defaultTeacherName = body.defaultTeacherName.slice(0, 50);
  if (typeof body.defaultTeacherAvatar === "string") updates.defaultTeacherAvatar = body.defaultTeacherAvatar.slice(0, 10);
  if (typeof body.defaultTeacherStyle === "string" && DEFAULTS.availableStyles.includes(body.defaultTeacherStyle)) updates.defaultTeacherStyle = body.defaultTeacherStyle;
  if (Array.isArray(body.defaultCoverImages)) updates.defaultCoverImages = body.defaultCoverImages.slice(0, 20);

  adminTunedDefaults = { ...adminTunedDefaults, ...updates };
  await logAdminActionViaJwt(admin, "study_room_defaults.update", updates);
  return NextResponse.json({ ok: true, defaults: { ...DEFAULTS, ...adminTunedDefaults } });
}
