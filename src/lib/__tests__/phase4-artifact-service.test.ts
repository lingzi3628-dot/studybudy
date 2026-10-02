/**
 * Phase 4 — Artifact service tests
 *
 * Covers:
 *   - createArtifact: creates artifact with version 1
 *   - getArtifact: loads artifact + current payload
 *   - getArtifact: ownership check (can't read other users' artifacts)
 *   - listArtifacts: lists user's artifacts, filtered by conversationId
 *   - modifyArtifact: creates new version (preserves history)
 *   - rollbackToVersion: restores old payload as new version
 *   - deleteArtifact: deletes artifact + cascade versions
 *   - getVersions: lists all versions
 *   - legacyAttachmentToArtifact: wraps old ChatMessage.attachment
 *   - API contracts preserved
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock db
vi.mock("../db", () => ({
  db: {
    workspaceArtifact: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      fields: { currentVersion: "currentVersion" },
    },
    artifactVersion: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "../db";
import {
  createArtifact,
  getArtifact,
  listArtifacts,
  modifyArtifact,
  rollbackToVersion,
  deleteArtifact,
  getVersions,
  legacyAttachmentToArtifact,
  ArtifactError,
} from "../tutor/artifact-service";

// ============================================================
// createArtifact
// ============================================================

describe("Phase 4 — createArtifact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an artifact with version 1", async () => {
    (db.workspaceArtifact.create as any).mockResolvedValue({
      id: "art1",
      ownerId: "u1",
      conversationId: "conv1",
      sourceMessageId: null,
      pluginId: "graph.bar",
      pluginVersion: 1,
      currentVersion: 1,
      title: "Class Scores",
      status: "ready",
      artifactType: "graph",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      versions: [{
        version: 1,
        payload: { type: "bar", categories: ["A", "B"], values: [4, 6] },
        createdBy: "u1",
        changeSummary: "Initial version",
        createdAt: new Date("2026-01-01"),
      }],
    });

    const result = await createArtifact({
      ownerId: "u1",
      pluginId: "graph.bar",
      title: "Class Scores",
      artifactType: "graph",
      payload: { type: "bar", categories: ["A", "B"], values: [4, 6] },
      conversationId: "conv1",
    });

    expect(result.id).toBe("art1");
    expect(result.currentVersion).toBe(1);
    expect(result.title).toBe("Class Scores");
    expect(result.payload).toEqual({ type: "bar", categories: ["A", "B"], values: [4, 6] });
    expect(db.workspaceArtifact.create).toHaveBeenCalled();
  });
});

// ============================================================
// getArtifact
// ============================================================

describe("Phase 4 — getArtifact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the artifact with current version payload", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue({
      id: "art1",
      ownerId: "u1",
      conversationId: null,
      sourceMessageId: null,
      pluginId: "graph.bar",
      pluginVersion: 1,
      currentVersion: 2,
      title: "Updated Graph",
      status: "ready",
      artifactType: "graph",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    });
    (db.artifactVersion.findFirst as any).mockResolvedValue({
      version: 2,
      payload: { type: "bar", values: [5, 7] },
      createdBy: "u1",
      changeSummary: "Updated values",
      createdAt: new Date("2026-01-02"),
    });

    const result = await getArtifact("u1", "art1");
    expect(result).not.toBeNull();
    expect(result!.currentVersion).toBe(2);
    expect(result!.payload).toEqual({ type: "bar", values: [5, 7] });
  });

  it("returns null when artifact not found or not owned by user", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue(null);
    const result = await getArtifact("u1", "nonexistent");
    expect(result).toBeNull();
  });
});

// ============================================================
// listArtifacts
// ============================================================

describe("Phase 4 — listArtifacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists artifacts for the user, filtered by conversationId", async () => {
    (db.workspaceArtifact.findMany as any).mockResolvedValue([
      {
        id: "art1",
        ownerId: "u1",
        conversationId: "conv1",
        sourceMessageId: null,
        pluginId: "graph.bar",
        pluginVersion: 1,
        currentVersion: 1,
        title: "Graph 1",
        status: "ready",
        artifactType: "graph",
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [{ version: 1, payload: { type: "bar" }, createdBy: "u1", changeSummary: null, createdAt: new Date() }],
      },
    ]);

    const results = await listArtifacts("u1", { conversationId: "conv1" });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Graph 1");
    expect(db.workspaceArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: "u1", conversationId: "conv1" }),
      }),
    );
  });
});

// ============================================================
// modifyArtifact
// ============================================================

describe("Phase 4 — modifyArtifact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new version (preserves history)", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue({
      id: "art1",
      ownerId: "u1",
      currentVersion: 1,
      versions: [{ version: 1, payload: { old: true } }],
    });
    (db.artifactVersion.create as any).mockResolvedValue({});
    (db.workspaceArtifact.update as any).mockResolvedValue({
      id: "art1",
      ownerId: "u1",
      conversationId: null,
      sourceMessageId: null,
      pluginId: "graph.bar",
      pluginVersion: 1,
      currentVersion: 2,
      title: "Graph",
      status: "ready",
      artifactType: "graph",
      createdAt: new Date(),
      updatedAt: new Date(),
      versions: [{ version: 2, payload: { new: true }, createdBy: "u1", changeSummary: "Updated", createdAt: new Date() }],
    });

    const result = await modifyArtifact({
      ownerId: "u1",
      artifactId: "art1",
      payload: { new: true },
      changeSummary: "Updated",
    });

    expect(result.currentVersion).toBe(2);
    expect(db.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 2, payload: { new: true } }),
      }),
    );
  });

  it("throws when artifact not found or not owned", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue(null);
    await expect(
      modifyArtifact({ ownerId: "u1", artifactId: "missing", payload: {} }),
    ).rejects.toThrow("Artifact not found");
  });
});

// ============================================================
// rollbackToVersion
// ============================================================

describe("Phase 4 — rollbackToVersion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores an old version as a new version", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue({
      id: "art1",
      ownerId: "u1",
      currentVersion: 3,
      versions: [{ version: 1, payload: { original: true } }],
    });
    (db.artifactVersion.create as any).mockResolvedValue({});
    (db.workspaceArtifact.update as any).mockResolvedValue({
      id: "art1",
      ownerId: "u1",
      conversationId: null,
      sourceMessageId: null,
      pluginId: "graph.bar",
      pluginVersion: 1,
      currentVersion: 4,
      title: "Graph",
      status: "ready",
      artifactType: "graph",
      createdAt: new Date(),
      updatedAt: new Date(),
      versions: [{ version: 4, payload: { original: true }, createdBy: "u1", changeSummary: "Rolled back", createdAt: new Date() }],
    });

    const result = await rollbackToVersion({
      ownerId: "u1",
      artifactId: "art1",
      targetVersion: 1,
    });

    expect(result.currentVersion).toBe(4);
    expect(result.payload).toEqual({ original: true });
  });
});

// ============================================================
// deleteArtifact
// ============================================================

describe("Phase 4 — deleteArtifact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes artifact owned by the user", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue({ id: "art1" });
    (db.workspaceArtifact.delete as any).mockResolvedValue({});

    const result = await deleteArtifact("u1", "art1");
    expect(result).toBe(true);
    expect(db.workspaceArtifact.delete).toHaveBeenCalledWith({ where: { id: "art1" } });
  });

  it("returns false when artifact not found or not owned", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue(null);
    const result = await deleteArtifact("u1", "missing");
    expect(result).toBe(false);
    expect(db.workspaceArtifact.delete).not.toHaveBeenCalled();
  });
});

// ============================================================
// getVersions
// ============================================================

describe("Phase 4 — getVersions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists all versions of an artifact", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue({ id: "art1" });
    (db.artifactVersion.findMany as any).mockResolvedValue([
      { id: "v3", version: 3, payload: { v: 3 }, createdBy: "u1", changeSummary: "v3", createdAt: new Date() },
      { id: "v2", version: 2, payload: { v: 2 }, createdBy: "u1", changeSummary: "v2", createdAt: new Date() },
      { id: "v1", version: 1, payload: { v: 1 }, createdBy: "u1", changeSummary: "Initial", createdAt: new Date() },
    ]);

    const versions = await getVersions("u1", "art1");
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe(3);
    expect(versions[2].version).toBe(1);
  });

  it("returns empty when artifact not found or not owned", async () => {
    (db.workspaceArtifact.findFirst as any).mockResolvedValue(null);
    const versions = await getVersions("u1", "missing");
    expect(versions).toEqual([]);
  });
});

// ============================================================
// legacyAttachmentToArtifact
// ============================================================

describe("Phase 4 — legacyAttachmentToArtifact", () => {
  it("wraps a graph attachment as a WorkspaceArtifact", () => {
    const result = legacyAttachmentToArtifact({
      attachment: {
        type: "graph",
        url: null,
        caption: '{"type":"bar","title":"Class Scores","categories":["A"],"values":[4]}',
      },
      ownerId: "u1",
      conversationId: "conv1",
      sourceMessageId: "msg1",
    });

    expect(result.ownerId).toBe("u1");
    expect(result.pluginId).toBe("graph.bar");
    expect(result.artifactType).toBe("graph");
    expect(result.title).toBe("Class Scores");
    expect(result.status).toBe("ready");
    expect(result.currentVersion).toBe(1);
    expect(result.payload).toEqual({
      type: "graph",
      url: null,
      caption: '{"type":"bar","title":"Class Scores","categories":["A"],"values":[4]}',
    });
    expect(result.id).toMatch(/^legacy-/);
  });

  it("wraps a flowchart attachment", () => {
    const result = legacyAttachmentToArtifact({
      attachment: { type: "flowchart_v1", url: null, caption: '{"type":"flowchart_v1","title":"Login Flow"}' },
      ownerId: "u1",
    });
    expect(result.pluginId).toBe("diagram.flowchart");
    expect(result.artifactType).toBe("flowchart_v1");
    expect(result.title).toBe("Login Flow");
  });

  it("wraps a quiz attachment", () => {
    const result = legacyAttachmentToArtifact({
      attachment: { type: "quiz", url: null, caption: '{"title":"Fractions Quiz"}' },
      ownerId: "u1",
    });
    expect(result.pluginId).toBe("assessment.quiz");
    expect(result.artifactType).toBe("quiz");
    expect(result.title).toBe("Fractions Quiz");
  });

  it("uses type as title when caption is not JSON", () => {
    const result = legacyAttachmentToArtifact({
      attachment: { type: "scene", url: null, caption: "not json" },
      ownerId: "u1",
    });
    expect(result.title).toBe("Scene");
    expect(result.pluginId).toBe("drawing.legacy-scene");
  });

  it("generates unique IDs for different legacy attachments", () => {
    const r1 = legacyAttachmentToArtifact({
      attachment: { type: "graph", url: null, caption: "{}" },
      ownerId: "u1",
    });
    const r2 = legacyAttachmentToArtifact({
      attachment: { type: "graph", url: null, caption: "{}" },
      ownerId: "u1",
    });
    expect(r1.id).not.toBe(r2.id);
  });
});

// ============================================================
// Existing contracts preserved
// ============================================================

describe("Phase 4 — Existing contracts preserved", () => {
  it("artifact-service exports all required functions", () => {
    expect(typeof createArtifact).toBe("function");
    expect(typeof getArtifact).toBe("function");
    expect(typeof listArtifacts).toBe("function");
    expect(typeof modifyArtifact).toBe("function");
    expect(typeof rollbackToVersion).toBe("function");
    expect(typeof deleteArtifact).toBe("function");
    expect(typeof getVersions).toBe("function");
    expect(typeof legacyAttachmentToArtifact).toBe("function");
    expect(typeof ArtifactError).toBe("function");
  });

  it("ArtifactError has code field", () => {
    const err = new ArtifactError("TEST_CODE", "test message");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err.name).toBe("ArtifactError");
  });
});
