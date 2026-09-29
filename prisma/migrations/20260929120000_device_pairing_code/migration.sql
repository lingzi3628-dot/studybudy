CREATE TABLE "DevicePairingCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "topicId" TEXT,
  "conversationId" TEXT,
  "workspaceOffer" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DevicePairingCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevicePairingCode_codeHash_key" ON "DevicePairingCode"("codeHash");
CREATE INDEX "DevicePairingCode_userId_createdAt_idx" ON "DevicePairingCode"("userId", "createdAt");
CREATE INDEX "DevicePairingCode_expiresAt_idx" ON "DevicePairingCode"("expiresAt");
ALTER TABLE "DevicePairingCode" ADD CONSTRAINT "DevicePairingCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
