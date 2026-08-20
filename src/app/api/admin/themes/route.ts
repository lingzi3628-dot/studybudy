import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/themes
 * Lists all RoomTheme rows (newest first).
 */
export async function GET() {
  await requireAdmin();
  const themes = await db.roomTheme.findMany({
    orderBy: { createdAt: "desc" },
  }).catch(() => []);
  return NextResponse.json({ themes });
}

/**
 * POST /api/admin/themes
 * Body: { name, description?, backgroundGradient, accentColor?, secondaryColor?, iconStyle?, isPremium?, coinCost? }
 * Creates a new RoomTheme. `name` must be unique (returns 409 on conflict).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    description?: string;
    backgroundGradient?: string;
    accentColor?: string;
    secondaryColor?: string;
    iconStyle?: string;
    isPremium?: boolean;
    coinCost?: number;
  };

  const name = (body.name ?? "").toString().trim();
  const backgroundGradient = (body.backgroundGradient ?? "").toString().trim();
  if (!name || !backgroundGradient) {
    return NextResponse.json(
      { error: "name and backgroundGradient are required." },
      { status: 400 }
    );
  }

  try {
    const theme = await db.roomTheme.create({
      data: {
        name,
        description: body.description ?? null,
        backgroundGradient,
        accentColor: body.accentColor ?? "#8B5CF6",
        secondaryColor: body.secondaryColor ?? "#6366F1",
        iconStyle: body.iconStyle ?? "lucide",
        isPremium: body.isPremium === true,
        coinCost: Math.max(0, body.coinCost ?? 0),
      },
    });
    await logAdminAction(admin, "theme.create", { themeId: theme.id, name });
    return NextResponse.json({ theme });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A theme with that name already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Create failed." }, { status: 500 });
  }
}
