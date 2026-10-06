-- CreateTable
CREATE TABLE "ToolhubSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKeyEncrypted" TEXT,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://toolhub.space-z.ai',
    "codeSandboxEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tutorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolhubSettings_pkey" PRIMARY KEY ("id")
);
