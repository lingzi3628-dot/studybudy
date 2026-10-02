import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getArtifact,
  modifyArtifact,
  deleteArtifact,
  rollbackToVersion,
  getVersions,
  ArtifactError,
} from "@/lib/tutor/artifact-service";

export const runtime = "nodejs";

/**
 * GET /api/artifacts/[id]
 *   ?versions=true → list all versions instead of current payload
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const url = new URL(req.url);
  const wantVersions = url.searchParams.get("versions") === "true";

  if (wantVersions) {
    const versions = await getVersions(user.id, params.id);
    return NextResponse.json({ versions });
  }

  const artifact = await getArtifact(user.id, params.id);
  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }
  return NextResponse.json({ artifact });
}

/**
 * PUT /api/artifacts/[id]
 *   Body: { payload, changeSummary? } → create a new version
 *   Body: { rollbackTo: <version> } → restore a previous version
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));

  try {
    let artifact;
    if (body.rollbackTo !== undefined) {
      artifact = await rollbackToVersion({
        ownerId: user.id,
        artifactId: params.id,
        targetVersion: Number(body.rollbackTo),
      });
    } else if (body.payload !== undefined) {
      artifact = await modifyArtifact({
        ownerId: user.id,
        artifactId: params.id,
        payload: body.payload,
        changeSummary: body.changeSummary,
      });
    } else {
      return NextResponse.json(
        { error: "Either 'payload' or 'rollbackTo' is required" },
        { status: 400 },
      );
    }
    return NextResponse.json({ artifact });
  } catch (e: any) {
    if (e instanceof ArtifactError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to modify artifact" }, { status: 500 });
  }
}

/**
 * DELETE /api/artifacts/[id]
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const deleted = await deleteArtifact(user.id, params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
