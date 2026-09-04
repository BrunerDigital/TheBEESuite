ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "receivableGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "cashGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "adjustmentGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "costCenterCode" TEXT;

CREATE TABLE IF NOT EXISTS "AgencyRemittanceBatch" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "agencyProgramId" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "allocatedCents" INTEGER NOT NULL DEFAULT 0,
    "unappliedCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "notes" TEXT,
    "evidenceName" TEXT,
    "evidenceReference" TEXT,
    "evidenceStorageKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reconciliationFingerprint" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "followUpOwnerId" TEXT,
    "followUpDueAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencyRemittanceBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgencyRemittanceAllocation" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "remittanceId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "notes" TEXT,
    "fingerprint" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencyRemittanceAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgencyLedgerAdjustment" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "agencyProgramId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "claimId" TEXT,
    "batchId" TEXT,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "reason" TEXT NOT NULL,
    "evidenceName" TEXT,
    "evidenceReference" TEXT,
    "fingerprint" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "followUpOwnerId" TEXT,
    "followUpDueAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencyLedgerAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgencyAccountingPeriod" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closeReason" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencyAccountingPeriod_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgencyLedgerEntry" ADD COLUMN IF NOT EXISTS "remittanceBatchId" TEXT;
ALTER TABLE "AgencyLedgerEntry" ADD COLUMN IF NOT EXISTS "adjustmentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceBatch_idempotencyKey_key" ON "AgencyRemittanceBatch"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceBatch_centerId_agencyProgramId_referenceKey_idx" ON "AgencyRemittanceBatch"("centerId", "agencyProgramId", "referenceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceBatch_active_referenceKey_key" ON "AgencyRemittanceBatch"("centerId", "agencyProgramId", "referenceKey") WHERE "status" NOT IN ('rejected', 'reversed') AND "reversedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "AgencyRemittanceBatch_centerId_status_paidAt_idx" ON "AgencyRemittanceBatch"("centerId", "status", "paidAt");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceBatch_agencyProgramId_paidAt_idx" ON "AgencyRemittanceBatch"("agencyProgramId", "paidAt");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceBatch_centerId_followUpDueAt_idx" ON "AgencyRemittanceBatch"("centerId", "followUpDueAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_remittanceId_key" ON "AgencyRemittanceAllocation"("remittanceId");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_batchId_status_idx" ON "AgencyRemittanceAllocation"("batchId", "status");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_claimId_status_idx" ON "AgencyRemittanceAllocation"("claimId", "status");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_centerId_status_effectiveAt_idx" ON "AgencyLedgerAdjustment"("centerId", "status", "effectiveAt");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_ledgerAccountId_status_idx" ON "AgencyLedgerAdjustment"("ledgerAccountId", "status");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_claimId_idx" ON "AgencyLedgerAdjustment"("claimId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_batchId_idx" ON "AgencyLedgerAdjustment"("batchId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_centerId_followUpDueAt_idx" ON "AgencyLedgerAdjustment"("centerId", "followUpDueAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyAccountingPeriod_centerId_startDate_endDate_key" ON "AgencyAccountingPeriod"("centerId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "AgencyAccountingPeriod_centerId_status_startDate_endDate_idx" ON "AgencyAccountingPeriod"("centerId", "status", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_remittanceBatchId_idx" ON "AgencyLedgerEntry"("remittanceBatchId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_adjustmentId_idx" ON "AgencyLedgerEntry"("adjustmentId");

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_centerId_fkey') THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_agencyProgramId_fkey') THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_agencyProgramId_fkey" FOREIGN KEY ("agencyProgramId") REFERENCES "AgencyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceAllocation_batchId_fkey') THEN
        ALTER TABLE "AgencyRemittanceAllocation" ADD CONSTRAINT "AgencyRemittanceAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AgencyRemittanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceAllocation_claimId_fkey') THEN
        ALTER TABLE "AgencyRemittanceAllocation" ADD CONSTRAINT "AgencyRemittanceAllocation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceAllocation_remittanceId_fkey') THEN
        ALTER TABLE "AgencyRemittanceAllocation" ADD CONSTRAINT "AgencyRemittanceAllocation_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "SubsidyRemittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_centerId_fkey') THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_agencyProgramId_fkey') THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_agencyProgramId_fkey" FOREIGN KEY ("agencyProgramId") REFERENCES "AgencyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_ledgerAccountId_fkey') THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "AgencyLedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_claimId_fkey') THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_batchId_fkey') THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AgencyRemittanceBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyAccountingPeriod_centerId_fkey') THEN
        ALTER TABLE "AgencyAccountingPeriod" ADD CONSTRAINT "AgencyAccountingPeriod_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_remittanceBatchId_fkey') THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_remittanceBatchId_fkey" FOREIGN KEY ("remittanceBatchId") REFERENCES "AgencyRemittanceBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_adjustmentId_fkey') THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "AgencyLedgerAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$migration$;

-- Preserve historical remittances by grouping every shared school/agency/reference into one legacy batch.
WITH grouped AS (
    SELECT
        claim."centerId",
        claim."agencyProgramId",
        remittance."paymentMethod",
        UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) AS normalized_reference,
        MIN(remittance."externalReference") AS display_reference,
        MIN(remittance."paidAt") AS paid_at,
        SUM(remittance."amountCents")::integer AS total_cents,
        SUM(remittance."amountCents") FILTER (WHERE remittance."reversedAt" IS NULL)::integer AS active_cents,
        BOOL_AND(remittance."reversedAt" IS NOT NULL) AS all_reversed,
        BOOL_OR(remittance."reversedAt" IS NOT NULL) AS any_reversed,
        MIN(remittance."enteredById") AS entered_by,
        MIN(remittance."createdAt") AS created_at
    FROM "SubsidyRemittance" remittance
    JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
    GROUP BY claim."centerId", claim."agencyProgramId", remittance."paymentMethod", UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g'))
)
INSERT INTO "AgencyRemittanceBatch" (
    "id", "centerId", "agencyProgramId", "externalReference", "referenceKey", "paidAt", "paymentMethod",
    "totalCents", "allocatedCents", "unappliedCents", "status", "notes", "idempotencyKey",
    "reconciliationFingerprint", "enteredById", "reviewedById", "reviewedAt", "reviewNotes", "createdAt", "updatedAt"
)
SELECT
    'agency-remittance-batch:' || MD5(grouped."centerId" || ':' || grouped."agencyProgramId" || ':' || LOWER(grouped."paymentMethod") || ':' || grouped.normalized_reference),
    grouped."centerId",
    grouped."agencyProgramId",
    grouped.display_reference,
    LOWER(grouped."paymentMethod") || ':' || grouped.normalized_reference,
    grouped.paid_at,
    grouped."paymentMethod",
    grouped.total_cents,
    COALESCE(grouped.active_cents, 0),
    0,
    CASE WHEN grouped.all_reversed THEN 'reversed' WHEN grouped.any_reversed THEN 'exception' ELSE 'reconciled' END,
    'Historical remittance batch created during dedicated agency-ledger migration.',
    'legacy:' || MD5(grouped."centerId" || ':' || grouped."agencyProgramId" || ':' || LOWER(grouped."paymentMethod") || ':' || grouped.normalized_reference),
    MD5(grouped."centerId" || ':' || grouped."agencyProgramId" || ':' || grouped.total_cents::text),
    grouped.entered_by,
    grouped.entered_by,
    grouped.created_at,
    'Historical record retained; no new approval was inferred.',
    grouped.created_at,
    CURRENT_TIMESTAMP
FROM grouped
ON CONFLICT DO NOTHING;

INSERT INTO "AgencyRemittanceAllocation" (
    "id", "batchId", "claimId", "remittanceId", "amountCents", "status", "notes", "fingerprint",
    "requestedById", "reviewedById", "reviewedAt", "createdAt", "updatedAt"
)
SELECT
    'agency-remittance-allocation:' || remittance.id,
    batch.id,
    remittance."claimId",
    remittance.id,
    remittance."amountCents",
    CASE WHEN remittance."reversedAt" IS NULL THEN 'posted' ELSE 'reversed' END,
    'Historical claim allocation retained during agency reconciliation migration.',
    MD5(batch.id || ':' || remittance."claimId" || ':' || remittance."amountCents"::text),
    remittance."enteredById",
    COALESCE(remittance."reversedById", remittance."enteredById"),
    COALESCE(remittance."reversedAt", remittance."createdAt"),
    remittance."createdAt",
    CURRENT_TIMESTAMP
FROM "SubsidyRemittance" remittance
JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
JOIN "AgencyRemittanceBatch" batch
  ON batch."centerId" = claim."centerId"
 AND batch."agencyProgramId" = claim."agencyProgramId"
 AND batch."referenceKey" = LOWER(remittance."paymentMethod") || ':' || UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g'))
ON CONFLICT ("remittanceId") DO NOTHING;

UPDATE "AgencyLedgerEntry" entry
SET "remittanceBatchId" = allocation."batchId"
FROM "AgencyRemittanceAllocation" allocation
WHERE allocation."remittanceId" = entry."remittanceId" AND entry."remittanceBatchId" IS NULL;

-- Server-side school and role checks remain the only access path.
ALTER TABLE "AgencyRemittanceBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyRemittanceAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyLedgerAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyAccountingPeriod" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AgencyRemittanceBatch" FROM anon, authenticated;
REVOKE ALL ON TABLE "AgencyRemittanceAllocation" FROM anon, authenticated;
REVOKE ALL ON TABLE "AgencyLedgerAdjustment" FROM anon, authenticated;
REVOKE ALL ON TABLE "AgencyAccountingPeriod" FROM anon, authenticated;
