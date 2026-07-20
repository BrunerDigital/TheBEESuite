CREATE TABLE "ParentPortalSetupToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastFailureReason" TEXT,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParentPortalSetupToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParentPortalSetupToken_tokenHash_key" ON "ParentPortalSetupToken"("tokenHash");
CREATE INDEX "ParentPortalSetupToken_userId_status_idx" ON "ParentPortalSetupToken"("userId", "status");
CREATE INDEX "ParentPortalSetupToken_guardianId_status_idx" ON "ParentPortalSetupToken"("guardianId", "status");
CREATE INDEX "ParentPortalSetupToken_tenantId_centerId_createdAt_idx" ON "ParentPortalSetupToken"("tenantId", "centerId", "createdAt");
CREATE INDEX "ParentPortalSetupToken_expiresAt_status_idx" ON "ParentPortalSetupToken"("expiresAt", "status");
