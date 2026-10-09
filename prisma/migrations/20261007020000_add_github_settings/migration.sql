-- CreateTable
CREATE TABLE "GithubSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "clientSecretEncrypted" TEXT,
    "allowedOrgs" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubSettings_pkey" PRIMARY KEY ("id")
);

-- Add GitHub fields to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubUsername" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubTokenEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubConnectedAt" TIMESTAMP(3);
