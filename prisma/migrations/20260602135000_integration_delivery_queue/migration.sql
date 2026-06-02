-- Durable outbound integration delivery log/retry queue.
CREATE TABLE "IntegrationDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "centerId" TEXT,
    "leadId" TEXT,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "payload" JSONB NOT NULL,
    "lastResult" JSONB,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationDelivery_status_nextAttemptAt_idx" ON "IntegrationDelivery"("status", "nextAttemptAt");
CREATE INDEX "IntegrationDelivery_tenantId_provider_createdAt_idx" ON "IntegrationDelivery"("tenantId", "provider", "createdAt");
CREATE INDEX "IntegrationDelivery_centerId_createdAt_idx" ON "IntegrationDelivery"("centerId", "createdAt");
CREATE INDEX "IntegrationDelivery_leadId_idx" ON "IntegrationDelivery"("leadId");

ALTER TABLE "IntegrationDelivery" ADD CONSTRAINT "IntegrationDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationDelivery" ADD CONSTRAINT "IntegrationDelivery_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntegrationDelivery" ADD CONSTRAINT "IntegrationDelivery_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
