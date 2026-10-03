import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/admin/model-mappings */
export async function GET() {
  await requireAdminJwt();
  const mappings = await db.modelMapping.findMany({
    orderBy: { tokenCostMultiplier: "asc" },
  });
  return NextResponse.json({ mappings });
}

/** POST /api/admin/model-mappings — create or update */
export async function POST(req: NextRequest) {
  const admin = await requireAdminJwt();
  const body = await req.json().catch(() => ({}));
  const mapping = await db.modelMapping.upsert({
    where: { modelName: body.modelName },
    create: body,
    update: body,
  });
  return NextResponse.json({ mapping });
}

/**
 * DELETE /api/admin/model-mappings?modelName=...
 * OR DELETE /api/admin/model-mappings?id=...
 *
 * Deletes a Study Buddy (ModelMapping). If any users are currently using
 * this buddy, their currentModel is reset to "study_buddy_free" so they
 * can still chat.
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdminJwt();
  const url = new URL(req.url);
  const modelName = url.searchParams.get("modelName");
  const id = url.searchParams.get("id");

  if (!modelName && !id) {
    return NextResponse.json({ error: "modelName or id is required" }, { status: 400 });
  }

  // Find the mapping
  const mapping = modelName
    ? await db.modelMapping.findUnique({ where: { modelName } })
    : await db.modelMapping.findUnique({ where: { id: id! } });

  if (!mapping) {
    return NextResponse.json({ error: "Study Buddy not found" }, { status: 404 });
  }

  // Don't allow deleting the free model
  if (mapping.modelName === "study_buddy_free") {
    return NextResponse.json({ error: "Cannot delete the default free model" }, { status: 400 });
  }

  // Reset any users who are currently using this buddy to study_buddy_free
  const affectedUsers = await db.user.updateMany({
    where: { currentModel: mapping.modelName },
    data: { currentModel: "study_buddy_free" },
  });

  // Delete any active rentals for this model
  await db.modelRental.updateMany({
    where: { modelName: mapping.modelName, status: "active" },
    data: { status: "cancelled" },
  }).catch(() => {});

  // Delete the mapping
  await db.modelMapping.delete({ where: { id: mapping.id } });

  return NextResponse.json({
    ok: true,
    deleted: mapping.modelName,
    affectedUsers: affectedUsers.count,
    message: `Study Buddy "${mapping.displayName}" deleted. ${affectedUsers.count} user(s) reset to Study Buddy Free.`,
  });
}
