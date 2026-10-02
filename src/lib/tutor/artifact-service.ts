/**
 * Artifact Service — Phase 4
 *
 * Persistent workspace artifacts with stable IDs, ownership, and version
 * history.
 *
 * CAPABILITIES:
 *   - createArtifact: create a new artifact with version 1
 *   - getArtifact: load an artifact + its current version's payload
 *   - listArtifacts: list a user's artifacts (optionally filtered by conversation)
 *   - modifyArtifact: create a new version (preserves history for undo/rollback)
 *   - getVersions: list all versions of an artifact
 *   - rollbackToVersion: restore a previous version as the current
 *   - legacyAdapter: wrap a ChatMessage.attachment as a temporary WorkspaceArtifact
 *
 * LEGACY COMPATIBILITY:
 *   Old ChatMessage.attachments (graph/quiz/flowchart stored as JSON in
 *   caption) continue to work. The legacyAdapter wraps them as in-memory
 *   WorkspaceArtifact representations so the frontend can use the same
 *   rendering path for both old and new artifacts.
 *
 * OWNERSHIP:
 *   Every artifact has an ownerId. getArtifact/modifyArtifact/listArtifacts
 *   always filter by ownerId — IDOR-safe.
 */

import { db } from "../db";
import { logger } from "../logger";
import { generateId } from "./turn-manager";
import type { TutorAttachment } from "../tutor-chat-engine";

// ============================================================
// Types
// ============================================================

export type ArtifactStatus = "draft" | "ready" | "submitted" | "completed";

export type CreateArtifactOpts = {
  ownerId: string;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  pluginId: string;
  pluginVersion?: number;
  title: string;
  artifactType: string;
  payload: unknown;
  status?: ArtifactStatus;
  createdBy?: string; // defaults to ownerId
  changeSummary?: string;
};

export type ArtifactResult = {
  id: string;
  ownerId: string;
  conversationId: string | null;
  sourceMessageId: string | null;
  pluginId: string;
  pluginVersion: number;
  currentVersion: number;
  title: string;
  status: ArtifactStatus;
  artifactType: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactVersionResult = {
  id: string;
  version: number;
  payload: unknown;
  createdBy: string;
  changeSummary: string | null;
  createdAt: string;
};

// ============================================================
// Create
// ============================================================

export async function createArtifact(opts: CreateArtifactOpts): Promise<ArtifactResult> {
  const {
    ownerId,
    conversationId = null,
    sourceMessageId = null,
    pluginId,
    pluginVersion = 1,
    title,
    artifactType,
    payload,
    status = "ready",
    createdBy,
    changeSummary,
  } = opts;

  const artifact = await db.workspaceArtifact.create({
    data: {
      ownerId,
      conversationId,
      sourceMessageId,
      pluginId,
      pluginVersion,
      currentVersion: 1,
      title: title.slice(0, 200),
      status,
      artifactType,
      versions: {
        create: {
          version: 1,
          payload: payload as any,
          createdBy: createdBy ?? ownerId,
          changeSummary: changeSummary?.slice(0, 500) ?? "Initial version",
        },
      },
    },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  logger.info("artifact created", {
    artifactId: artifact.id,
    ownerId,
    pluginId,
    artifactType,
    version: 1,
  });

  return toResult(artifact, artifact.versions[0]);
}

// ============================================================
// Read
// ============================================================

export async function getArtifact(ownerId: string, artifactId: string): Promise<ArtifactResult | null> {
  const artifact = await db.workspaceArtifact.findFirst({
    where: { id: artifactId, ownerId },
  });

  if (!artifact) return null;

  // Fetch the current version separately (avoids cross-table field reference type issue)
  const currentVersion = await db.artifactVersion.findFirst({
    where: { artifactId, version: artifact.currentVersion },
  });

  return toResult(artifact, currentVersion);
}

export async function listArtifacts(
  ownerId: string,
  opts?: { conversationId?: string; pluginId?: string; limit?: number },
): Promise<ArtifactResult[]> {
  const where: any = { ownerId };
  if (opts?.conversationId) where.conversationId = opts.conversationId;
  if (opts?.pluginId) where.pluginId = opts.pluginId;

  const artifacts = await db.workspaceArtifact.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: opts?.limit ?? 50,
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  return artifacts.map((a) => toResult(a, a.versions[0]));
}

export async function getVersions(ownerId: string, artifactId: string): Promise<ArtifactVersionResult[]> {
  // Verify ownership first
  const artifact = await db.workspaceArtifact.findFirst({
    where: { id: artifactId, ownerId },
    select: { id: true },
  });
  if (!artifact) return [];

  const versions = await db.artifactVersion.findMany({
    where: { artifactId },
    orderBy: { version: "desc" },
  });

  return versions.map(toVersionResult);
}

// ============================================================
// Modify (creates a new version — preserves history)
// ============================================================

export async function modifyArtifact(opts: {
  ownerId: string;
  artifactId: string;
  payload: unknown;
  changeSummary?: string;
  createdBy?: string;
}): Promise<ArtifactResult> {
  const { ownerId, artifactId, payload, changeSummary, createdBy } = opts;

  // Verify ownership
  const artifact = await db.workspaceArtifact.findFirst({
    where: { id: artifactId, ownerId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  if (!artifact) {
    throw new ArtifactError("ARTIFACT_NOT_FOUND", "Artifact not found or not owned by user");
  }

  const newVersion = artifact.currentVersion + 1;

  // Create new version
  await db.artifactVersion.create({
    data: {
      artifactId,
      version: newVersion,
      payload: payload as any,
      createdBy: createdBy ?? ownerId,
      changeSummary: changeSummary?.slice(0, 500) ?? `Version ${newVersion}`,
    },
  });

  // Update artifact's currentVersion
  const updated = await db.workspaceArtifact.update({
    where: { id: artifactId },
    data: { currentVersion: newVersion, updatedAt: new Date() },
    include: {
      versions: {
        where: { version: newVersion },
        take: 1,
      },
    },
  });

  logger.info("artifact modified", {
    artifactId,
    ownerId,
    newVersion,
    changeSummary,
  });

  return toResult(updated, updated.versions[0]);
}

// ============================================================
// Rollback (restore a previous version as current)
// ============================================================

export async function rollbackToVersion(opts: {
  ownerId: string;
  artifactId: string;
  targetVersion: number;
  createdBy?: string;
}): Promise<ArtifactResult> {
  const { ownerId, artifactId, targetVersion, createdBy } = opts;

  // Verify ownership + fetch target version
  const artifact = await db.workspaceArtifact.findFirst({
    where: { id: artifactId, ownerId },
    include: {
      versions: {
        where: { version: targetVersion },
        take: 1,
      },
    },
  });

  if (!artifact) {
    throw new ArtifactError("ARTIFACT_NOT_FOUND", "Artifact not found or not owned by user");
  }

  if (artifact.versions.length === 0) {
    throw new ArtifactError("VERSION_NOT_FOUND", `Version ${targetVersion} not found`);
  }

  const targetPayload = artifact.versions[0].payload;
  const newVersion = artifact.currentVersion + 1;

  // Create a NEW version with the old payload (preserves history)
  await db.artifactVersion.create({
    data: {
      artifactId,
      version: newVersion,
      payload: targetPayload as any,
      createdBy: createdBy ?? ownerId,
      changeSummary: `Rolled back to version ${targetVersion}`,
    },
  });

  const updated = await db.workspaceArtifact.update({
    where: { id: artifactId },
    data: { currentVersion: newVersion, updatedAt: new Date() },
    include: {
      versions: {
        where: { version: newVersion },
        take: 1,
      },
    },
  });

  logger.info("artifact rolled back", {
    artifactId,
    ownerId,
    targetVersion,
    newVersion,
  });

  return toResult(updated, updated.versions[0]);
}

// ============================================================
// Delete
// ============================================================

export async function deleteArtifact(ownerId: string, artifactId: string): Promise<boolean> {
  // Verify ownership before delete (cascade handles versions)
  const artifact = await db.workspaceArtifact.findFirst({
    where: { id: artifactId, ownerId },
    select: { id: true },
  });

  if (!artifact) return false;

  await db.workspaceArtifact.delete({ where: { id: artifactId } });
  logger.info("artifact deleted", { artifactId, ownerId });
  return true;
}

// ============================================================
// Legacy adapter — ChatMessage.attachment → WorkspaceArtifact
// ============================================================

/**
 * Wrap an old ChatMessage.attachment as an in-memory WorkspaceArtifact
 * representation (NOT persisted to DB — just for rendering compatibility).
 *
 * This lets the frontend use the same rendering path for both:
 *   - Old attachments (from ChatMessage.attachments JSON)
 *   - New persistent artifacts (from WorkspaceArtifact table)
 */
export function legacyAttachmentToArtifact(opts: {
  attachment: TutorAttachment;
  ownerId: string;
  conversationId?: string | null;
  sourceMessageId?: string | null;
}): ArtifactResult {
  const { attachment, ownerId, conversationId = null, sourceMessageId = null } = opts;

  // Determine pluginId + artifactType from the attachment type
  const { pluginId, artifactType } = mapAttachmentType(attachment.type);

  // Try to extract a title from the caption (graph specs usually have one)
  let title = "Untitled";
  try {
    const parsed = JSON.parse(attachment.caption);
    if (parsed && typeof parsed.title === "string") title = parsed.title.slice(0, 200);
  } catch {
    // caption is not JSON — use the type as title
    title = attachment.type.charAt(0).toUpperCase() + attachment.type.slice(1);
  }

  return {
    id: `legacy-${generateId()}`,
    ownerId,
    conversationId,
    sourceMessageId,
    pluginId,
    pluginVersion: 1,
    currentVersion: 1,
    title,
    status: "ready",
    artifactType,
    payload: {
      type: attachment.type,
      url: attachment.url,
      caption: attachment.caption,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapAttachmentType(attachmentType: string): { pluginId: string; artifactType: string } {
  const GRAPH_TYPES = new Set([
    "graph", "bar", "pie", "scatter", "histogram", "function", "line",
    "venn", "numberline", "tree", "boxplot", "vector", "polygon",
    "conceptmap", "network",
  ]);
  if (GRAPH_TYPES.has(attachmentType)) return { pluginId: "graph.bar", artifactType: "graph" };
  if (attachmentType === "flowchart_v1") return { pluginId: "diagram.flowchart", artifactType: "flowchart_v1" };
  if (attachmentType === "quiz") return { pluginId: "assessment.quiz", artifactType: "quiz" };
  if (attachmentType === "draw_task") return { pluginId: "drawing.freehand", artifactType: "draw_task" };
  if (attachmentType === "scene") return { pluginId: "drawing.legacy-scene", artifactType: "scene" };
  return { pluginId: "unknown", artifactType: attachmentType };
}

// ============================================================
// Helpers
// ============================================================

function toResult(artifact: any, version: any): ArtifactResult {
  return {
    id: artifact.id,
    ownerId: artifact.ownerId,
    conversationId: artifact.conversationId,
    sourceMessageId: artifact.sourceMessageId,
    pluginId: artifact.pluginId,
    pluginVersion: artifact.pluginVersion,
    currentVersion: artifact.currentVersion,
    title: artifact.title,
    status: artifact.status as ArtifactStatus,
    artifactType: artifact.artifactType,
    payload: version?.payload ?? null,
    createdAt: artifact.createdAt instanceof Date ? artifact.createdAt.toISOString() : String(artifact.createdAt),
    updatedAt: artifact.updatedAt instanceof Date ? artifact.updatedAt.toISOString() : String(artifact.updatedAt),
  };
}

function toVersionResult(version: any): ArtifactVersionResult {
  return {
    id: version.id,
    version: version.version,
    payload: version.payload,
    createdBy: version.createdBy,
    changeSummary: version.changeSummary,
    createdAt: version.createdAt instanceof Date ? version.createdAt.toISOString() : String(version.createdAt),
  };
}

// ============================================================
// Error class
// ============================================================

export class ArtifactError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ArtifactError";
  }
}
