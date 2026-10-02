-- Phase 4 — WorkspaceArtifact + ArtifactVersion tables
-- Persistent workspace artifacts with stable IDs, ownership, and version history.

CREATE TABLE "WorkspaceArtifact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "sourceMessageId" TEXT,
    "pluginId" TEXT NOT NULL,
    "pluginVersion" INTEGER NOT NULL DEFAULT 1,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "artifactType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceArtifact_ownerId_idx" ON "WorkspaceArtifact"("ownerId");
CREATE INDEX "WorkspaceArtifact_conversationId_idx" ON "WorkspaceArtifact"("conversationId");
CREATE INDEX "WorkspaceArtifact_pluginId_idx" ON "WorkspaceArtifact"("pluginId");

CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArtifactVersion_artifactId_version_key" ON "ArtifactVersion"("artifactId", "version");
CREATE INDEX "ArtifactVersion_artifactId_idx" ON "ArtifactVersion"("artifactId");

-- Add foreign key constraint
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_artifactId_fkey"
    FOREIGN KEY ("artifactId") REFERENCES "WorkspaceArtifact"("id") ON DELETE CASCADE;
