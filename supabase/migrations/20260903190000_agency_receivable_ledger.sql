CREATE TABLE IF NOT EXISTS "AgencyLedgerAccount" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "agencyProgramId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgencyLedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgencyLedgerEntry" (
    "id" TEXT NOT NULL,
    "agencyLedgerAccountId" TEXT NOT NULL,
    "claimId" TEXT,
    "remittanceId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "externalReference" TEXT,
    "sourceSystem" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencyLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyLedgerAccount_centerId_agencyProgramId_key" ON "AgencyLedgerAccount"("centerId", "agencyProgramId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAccount_centerId_balanceCents_idx" ON "AgencyLedgerAccount"("centerId", "balanceCents");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyLedgerEntry_sourceSystem_externalId_key" ON "AgencyLedgerEntry"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_agencyLedgerAccountId_effectiveAt_createdAt_idx" ON "AgencyLedgerEntry"("agencyLedgerAccountId", "effectiveAt", "createdAt");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_claimId_idx" ON "AgencyLedgerEntry"("claimId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_remittanceId_idx" ON "AgencyLedgerEntry"("remittanceId");

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAccount_centerId_fkey') THEN
        ALTER TABLE "AgencyLedgerAccount" ADD CONSTRAINT "AgencyLedgerAccount_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAccount_agencyProgramId_fkey') THEN
        ALTER TABLE "AgencyLedgerAccount" ADD CONSTRAINT "AgencyLedgerAccount_agencyProgramId_fkey" FOREIGN KEY ("agencyProgramId") REFERENCES "AgencyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_agencyLedgerAccountId_fkey') THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_agencyLedgerAccountId_fkey" FOREIGN KEY ("agencyLedgerAccountId") REFERENCES "AgencyLedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_claimId_fkey') THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_remittanceId_fkey') THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "SubsidyRemittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$migration$;

-- Establish one separate receivable account per school-specific agency program.
INSERT INTO "AgencyLedgerAccount" ("id", "centerId", "agencyProgramId", "balanceCents", "createdAt", "updatedAt")
SELECT
    'agency-ledger-account:' || program.id,
    program."centerId",
    program.id,
    0,
    program."createdAt",
    CURRENT_TIMESTAMP
FROM "AgencyProgram" program
ON CONFLICT ("centerId", "agencyProgramId") DO NOTHING;

-- Approved claims become agency receivable charges. Family billing is not changed.
INSERT INTO "AgencyLedgerEntry" (
    "id", "agencyLedgerAccountId", "claimId", "type", "description",
    "amountCents", "balanceAfterCents", "effectiveAt", "externalReference",
    "sourceSystem", "externalId", "metadata", "createdAt"
)
SELECT
    'agency-ledger-claim:' || claim.id,
    account.id,
    claim.id,
    'claim_approved',
    program.name || ' approved ' || claim.number,
    claim."approvedCents",
    0,
    COALESCE(claim."approvedAt", claim."updatedAt", claim."createdAt"),
    claim."externalReference",
    'subsidy_agency',
    'claim-approved:' || claim.id,
    jsonb_build_object('claimNumber', claim.number, 'backfilled', true),
    COALESCE(claim."approvedAt", claim."createdAt")
FROM "SubsidyClaim" claim
JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
WHERE COALESCE(claim."approvedCents", 0) > 0
ON CONFLICT ("sourceSystem", "externalId") DO NOTHING;

-- Every remittance remains an immutable payment entry, including remittances later reversed.
INSERT INTO "AgencyLedgerEntry" (
    "id", "agencyLedgerAccountId", "claimId", "remittanceId", "type", "description",
    "amountCents", "balanceAfterCents", "effectiveAt", "externalReference",
    "sourceSystem", "externalId", "metadata", "createdAt"
)
SELECT
    'agency-ledger-remittance:' || remittance.id,
    account.id,
    claim.id,
    remittance.id,
    'remittance_received',
    program.name || ' remittance for ' || claim.number,
    -remittance."amountCents",
    0,
    remittance."paidAt",
    remittance."externalReference",
    'subsidy_agency',
    'remittance:' || remittance.id,
    jsonb_build_object('claimNumber', claim.number, 'paymentMethod', remittance."paymentMethod", 'backfilled', true),
    remittance."createdAt"
FROM "SubsidyRemittance" remittance
JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
ON CONFLICT ("sourceSystem", "externalId") DO NOTHING;

INSERT INTO "AgencyLedgerEntry" (
    "id", "agencyLedgerAccountId", "claimId", "remittanceId", "type", "description",
    "amountCents", "balanceAfterCents", "effectiveAt", "externalReference",
    "sourceSystem", "externalId", "metadata", "createdAt"
)
SELECT
    'agency-ledger-remittance-reversal:' || remittance.id,
    account.id,
    claim.id,
    remittance.id,
    'remittance_reversal',
    'Reversed agency remittance for ' || claim.number,
    remittance."amountCents",
    0,
    remittance."reversedAt",
    remittance."externalReference",
    'subsidy_agency',
    'remittance-reversal:' || remittance.id,
    jsonb_build_object('claimNumber', claim.number, 'reason', remittance."reversalReason", 'backfilled', true),
    remittance."reversedAt"
FROM "SubsidyRemittance" remittance
JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
WHERE remittance."reversedAt" IS NOT NULL
ON CONFLICT ("sourceSystem", "externalId") DO NOTHING;

WITH running_balances AS (
    SELECT
        entry.id,
        SUM(entry."amountCents") OVER (
            PARTITION BY entry."agencyLedgerAccountId"
            ORDER BY entry."effectiveAt", entry."createdAt", entry.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::integer AS "balanceAfterCents"
    FROM "AgencyLedgerEntry" entry
)
UPDATE "AgencyLedgerEntry" entry
SET "balanceAfterCents" = running_balances."balanceAfterCents"
FROM running_balances
WHERE running_balances.id = entry.id;

WITH account_balances AS (
    SELECT
        account.id,
        COALESCE(SUM(entry."amountCents"), 0)::integer AS "balanceCents"
    FROM "AgencyLedgerAccount" account
    LEFT JOIN "AgencyLedgerEntry" entry ON entry."agencyLedgerAccountId" = account.id
    GROUP BY account.id
)
UPDATE "AgencyLedgerAccount" account
SET "balanceCents" = account_balances."balanceCents", "updatedAt" = CURRENT_TIMESTAMP
FROM account_balances
WHERE account_balances.id = account.id;

-- Server-side school and role checks remain the only access path.
ALTER TABLE "AgencyLedgerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyLedgerEntry" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AgencyLedgerAccount" FROM anon, authenticated;
REVOKE ALL ON TABLE "AgencyLedgerEntry" FROM anon, authenticated;
