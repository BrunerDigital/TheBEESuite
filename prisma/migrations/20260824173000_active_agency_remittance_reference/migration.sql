DROP INDEX "SubsidyRemittance_claimId_externalReference_key";

CREATE UNIQUE INDEX "SubsidyRemittance_claimId_externalReference_active_key"
ON "SubsidyRemittance"("claimId", "externalReference")
WHERE "reversedAt" IS NULL;

CREATE INDEX "SubsidyRemittance_claimId_externalReference_idx"
ON "SubsidyRemittance"("claimId", "externalReference");
