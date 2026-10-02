import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listArtifacts, createArtifact, ArtifactError } from "@/lib/tutor/artifact-service";

export const runtime = "nodejs";

/**
 * GET /api/artifacts?conversationId=...&pluginId=...
 *
 * List the current user's workspace artifacts.
 */
export async function GET(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId") || undefined;
  const pluginId = url.searchParams.get("pluginId") || undefined;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  const artifacts = await listArtifacts(user.id, { conversationId, pluginId, limit });
  return NextResponse.json({ artifacts });
}

/**
 * POST /api/artifacts
 *
 * Create a new workspace artifact.
 * Body: { pluginId, title, artifactType, payload, conversationId?, sourceMessageId?, status? }
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const pluginId = (body.pluginId ?? "").toString().trim();
  const title = (body.title ?? "").toString().trim();
  const artifactType = (body.artifactType ?? "").toString().trim();
  const payload = body.payload;

  if (!pluginId || !title || !artifactType || payload === undefined) {
    return NextResponse.json(
      { error: "pluginId, title, artifactType, and payload are required" },
      { status: 400 },
    );
  }

  try {
    const artifact = await createArtifact({
      ownerId: user.id,
      pluginId,
      title,
      artifactType,
      payload,
      conversationId: body.conversationId ?? null,
      sourceMessageId: body.sourceMessageId ?? null,
      status: body.status ?? "ready",
    });
    return NextResponse.json({ artifact });
  } catch (e: any) {
    if (e instanceof ArtifactError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create artifact" }, { status: 500 });
  }
}
