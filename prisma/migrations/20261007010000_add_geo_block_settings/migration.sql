-- CreateTable
CREATE TABLE "GeoBlockSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowedCountries" TEXT NOT NULL DEFAULT 'KE',
    "blockTitle" TEXT NOT NULL DEFAULT 'Access Restricted',
    "blockMessage" TEXT NOT NULL DEFAULT 'This service is currently only available in Kenya. If you believe this is an error, please contact support.',
    "proxyTokens" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoBlockSettings_pkey" PRIMARY KEY ("id")
);
