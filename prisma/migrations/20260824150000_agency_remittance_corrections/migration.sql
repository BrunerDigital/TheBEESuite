ALTER TABLE "SubsidyRemittance"
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "reversedById" TEXT,
ADD COLUMN "reversalReason" TEXT;

CREATE INDEX "SubsidyRemittance_claimId_reversedAt_idx"
ON "SubsidyRemittance"("claimId", "reversedAt");
