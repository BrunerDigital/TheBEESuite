DROP INDEX IF EXISTS "SubsidyRemittance_claimId_externalReference_key";

CREATE UNIQUE INDEX IF NOT EXISTS "SubsidyRemittance_claimId_externalReference_active_key"
ON "SubsidyRemittance"("claimId", "externalReference")
WHERE "reversedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "SubsidyRemittance_claimId_externalReference_idx"
ON "SubsidyRemittance"("claimId", "externalReference");
