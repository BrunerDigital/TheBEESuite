ALTER TABLE "SubsidyRemittance"
ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reversedById" TEXT,
ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;

CREATE INDEX IF NOT EXISTS "SubsidyRemittance_claimId_reversedAt_idx"
ON "SubsidyRemittance"("claimId", "reversedAt");
