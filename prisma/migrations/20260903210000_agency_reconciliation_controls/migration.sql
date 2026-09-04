BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';
SET LOCAL TIME ZONE 'UTC';

ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "receivableGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "cashGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "adjustmentGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "costCenterCode" TEXT;
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "agencyReconciliationEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "agencyReconciliationActivatedAt" TIMESTAMP(3);
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "agencyReconciliationActivatedById" TEXT;
ALTER TABLE "Center" ADD COLUMN IF NOT EXISTS "agencyReconciliationActivationReason" TEXT;

CREATE TABLE IF NOT EXISTS "AgencyRemittanceBatch" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "agencyProgramId" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "cashGlCodeSnapshot" TEXT,
    "costCenterCodeSnapshot" TEXT,
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
    "idempotencyKey" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
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
    "glCodeSnapshot" TEXT,
    "costCenterCodeSnapshot" TEXT,
    "fingerprint" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
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

ALTER TABLE "AgencyRemittanceBatch" ADD COLUMN IF NOT EXISTS "cashGlCodeSnapshot" TEXT;
ALTER TABLE "AgencyRemittanceBatch" ADD COLUMN IF NOT EXISTS "costCenterCodeSnapshot" TEXT;
ALTER TABLE "AgencyLedgerAdjustment" ADD COLUMN IF NOT EXISTS "glCodeSnapshot" TEXT;
ALTER TABLE "AgencyLedgerAdjustment" ADD COLUMN IF NOT EXISTS "costCenterCodeSnapshot" TEXT;
ALTER TABLE "AgencyLedgerEntry" ADD COLUMN IF NOT EXISTS "remittanceBatchId" TEXT;
ALTER TABLE "AgencyLedgerEntry" ADD COLUMN IF NOT EXISTS "adjustmentId" TEXT;

-- Existing rows can only come from an earlier rehearsal/replay of this additive
-- migration. Preserve an already-posted ledger classification when available;
-- otherwise take one explicit cutover snapshot from the program mapping.
UPDATE "AgencyLedgerAdjustment" adjustment
SET
    "glCodeSnapshot" = COALESCE(
        adjustment."glCodeSnapshot",
        (
            SELECT entry."glCodeSnapshot"
            FROM "AgencyLedgerEntry" entry
            WHERE entry."adjustmentId" = adjustment.id
              AND entry."sourceSystem" = 'subsidy_agency'
              AND entry."externalId" = 'adjustment:' || adjustment.id
            LIMIT 1
        ),
        program."adjustmentGlCode"
    ),
    "costCenterCodeSnapshot" = COALESCE(
        adjustment."costCenterCodeSnapshot",
        (
            SELECT entry."costCenterCodeSnapshot"
            FROM "AgencyLedgerEntry" entry
            WHERE entry."adjustmentId" = adjustment.id
              AND entry."sourceSystem" = 'subsidy_agency'
              AND entry."externalId" = 'adjustment:' || adjustment.id
            LIMIT 1
        ),
        program."costCenterCode"
    )
FROM "AgencyProgram" program
WHERE program.id = adjustment."agencyProgramId"
  AND (
      adjustment."glCodeSnapshot" IS NULL
      OR adjustment."costCenterCodeSnapshot" IS NULL
  );

-- Deny browser roles before any backfill. BEGIN/COMMIT keeps the migration
-- atomic if a constraint check, cast, or historical-data preflight fails.
ALTER TABLE "AgencyRemittanceBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyRemittanceAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyLedgerAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyAccountingPeriod" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AgencyRemittanceBatch" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "AgencyRemittanceAllocation" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "AgencyLedgerAdjustment" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "AgencyAccountingPeriod" FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceBatch_idempotencyKey_key" ON "AgencyRemittanceBatch"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceBatch_centerId_agencyProgramId_referenceKey_idx" ON "AgencyRemittanceBatch"("centerId", "agencyProgramId", "referenceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceBatch_active_referenceKey_key" ON "AgencyRemittanceBatch"("centerId", "agencyProgramId", "referenceKey") WHERE "status" NOT IN ('rejected', 'reversed') AND "reversedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "AgencyRemittanceBatch_centerId_status_paidAt_idx" ON "AgencyRemittanceBatch"("centerId", "status", "paidAt");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceBatch_agencyProgramId_paidAt_idx" ON "AgencyRemittanceBatch"("agencyProgramId", "paidAt");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceBatch_centerId_followUpDueAt_idx" ON "AgencyRemittanceBatch"("centerId", "followUpDueAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_remittanceId_key" ON "AgencyRemittanceAllocation"("remittanceId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_idempotencyKey_key" ON "AgencyRemittanceAllocation"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_active_batch_claim_key" ON "AgencyRemittanceAllocation"("batchId", "claimId") WHERE "status" IN ('pending_review', 'posted');
CREATE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_batchId_status_idx" ON "AgencyRemittanceAllocation"("batchId", "status");
CREATE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_claimId_status_idx" ON "AgencyRemittanceAllocation"("claimId", "status");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_centerId_status_effectiveAt_idx" ON "AgencyLedgerAdjustment"("centerId", "status", "effectiveAt");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_agencyProgramId_idx" ON "AgencyLedgerAdjustment"("agencyProgramId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_ledgerAccountId_status_idx" ON "AgencyLedgerAdjustment"("ledgerAccountId", "status");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_claimId_idx" ON "AgencyLedgerAdjustment"("claimId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_batchId_idx" ON "AgencyLedgerAdjustment"("batchId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_idempotencyKey_key" ON "AgencyLedgerAdjustment"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_centerId_followUpDueAt_idx" ON "AgencyLedgerAdjustment"("centerId", "followUpDueAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyAccountingPeriod_centerId_startDate_endDate_key" ON "AgencyAccountingPeriod"("centerId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "AgencyAccountingPeriod_centerId_status_startDate_endDate_idx" ON "AgencyAccountingPeriod"("centerId", "status", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_remittanceBatchId_idx" ON "AgencyLedgerEntry"("remittanceBatchId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_adjustmentId_idx" ON "AgencyLedgerEntry"("adjustmentId");

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Center_agency_reconciliation_activation_check' AND conrelid = '"Center"'::regclass) THEN
        ALTER TABLE "Center" ADD CONSTRAINT "Center_agency_reconciliation_activation_check" CHECK (
            NOT "agencyReconciliationEnabled" OR (
                "agencyReconciliationActivatedAt" IS NOT NULL
                AND NULLIF(BTRIM("agencyReconciliationActivatedById"), '') IS NOT NULL
                AND NULLIF(BTRIM("agencyReconciliationActivationReason"), '') IS NOT NULL
            )
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Center_agency_reconciliation_inactive_evidence_check' AND conrelid = '"Center"'::regclass) THEN
        ALTER TABLE "Center" ADD CONSTRAINT "Center_agency_reconciliation_inactive_evidence_check" CHECK (
            "agencyReconciliationEnabled"
            OR (
                "agencyReconciliationActivatedAt" IS NULL
                AND "agencyReconciliationActivatedById" IS NULL
                AND "agencyReconciliationActivationReason" IS NULL
            )
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubsidyRemittance_reversal_chronology_check' AND conrelid = '"SubsidyRemittance"'::regclass) THEN
        ALTER TABLE "SubsidyRemittance" ADD CONSTRAINT "SubsidyRemittance_reversal_chronology_check" CHECK ("reversedAt" IS NULL OR "reversedAt" >= "paidAt") NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_reversal_chronology_check' AND conrelid = '"AgencyRemittanceBatch"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_reversal_chronology_check" CHECK ("reversedAt" IS NULL OR "reversedAt" >= "paidAt") NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_reversal_chronology_check' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_reversal_chronology_check" CHECK ("reversedAt" IS NULL OR "reversedAt" >= "effectiveAt") NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_status_check' AND conrelid = '"AgencyRemittanceBatch"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_status_check" CHECK (
            status IN ('unmatched', 'pending_review', 'partially_allocated', 'reconciled', 'exception', 'rejected', 'reversed')
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_amounts_check' AND conrelid = '"AgencyRemittanceBatch"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_amounts_check" CHECK (
            "totalCents" > 0
            AND "allocatedCents" >= 0
            AND "unappliedCents" >= 0
            AND (
                (status IN ('pending_review', 'rejected') AND "allocatedCents" = 0 AND "unappliedCents" = 0)
                OR "allocatedCents"::bigint + "unappliedCents"::bigint = "totalCents"::bigint
            )
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_review_check' AND conrelid = '"AgencyRemittanceBatch"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_review_check" CHECK (
            (("reviewedAt" IS NULL AND "reviewedById" IS NULL) OR ("reviewedAt" IS NOT NULL AND NULLIF(BTRIM("reviewedById"), '') IS NOT NULL AND "reviewedById" <> "enteredById"))
            AND (
                status = 'pending_review'
                OR (status IN ('unmatched', 'partially_allocated', 'exception', 'rejected') AND "reviewedAt" IS NOT NULL)
                OR (status IN ('reconciled', 'reversed') AND ("reviewedAt" IS NOT NULL OR "idempotencyKey" LIKE 'legacy:%'))
            )
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_reversal_state_check' AND conrelid = '"AgencyRemittanceBatch"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_reversal_state_check" CHECK (
            (status = 'reversed' AND "reversedAt" IS NOT NULL AND NULLIF(BTRIM("reversedById"), '') IS NOT NULL AND NULLIF(BTRIM("reversalReason"), '') IS NOT NULL)
            OR (status <> 'reversed' AND "reversedAt" IS NULL AND "reversedById" IS NULL AND "reversalReason" IS NULL)
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceAllocation_status_amount_check' AND conrelid = '"AgencyRemittanceAllocation"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceAllocation" ADD CONSTRAINT "AgencyRemittanceAllocation_status_amount_check" CHECK (
            "amountCents" > 0 AND status IN ('pending_review', 'posted', 'rejected', 'reversed')
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceAllocation_review_check' AND conrelid = '"AgencyRemittanceAllocation"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceAllocation" ADD CONSTRAINT "AgencyRemittanceAllocation_review_check" CHECK (
            (("reviewedAt" IS NULL AND "reviewedById" IS NULL) OR ("reviewedAt" IS NOT NULL AND NULLIF(BTRIM("reviewedById"), '') IS NOT NULL AND "reviewedById" <> "requestedById"))
            AND (
                status = 'pending_review'
                OR (status = 'rejected' AND "reviewedAt" IS NOT NULL)
                OR (status IN ('posted', 'reversed') AND ("reviewedAt" IS NOT NULL OR "idempotencyKey" LIKE 'legacy-allocation:%'))
            )
            AND ((status IN ('pending_review', 'rejected') AND "remittanceId" IS NULL) OR (status IN ('posted', 'reversed') AND "remittanceId" IS NOT NULL))
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_type_amount_check' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_type_amount_check" CHECK (
            "amountCents" <> -2147483648
            AND (
                (type IN ('write_off', 'overpayment', 'correction_decrease') AND "amountCents" < 0)
                OR (type IN ('recoupment', 'correction_increase') AND "amountCents" > 0)
            )
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_accounting_snapshot_check' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_accounting_snapshot_check" CHECK (
            NULLIF(BTRIM("glCodeSnapshot"), '') IS NOT NULL
            AND NULLIF(BTRIM("costCenterCodeSnapshot"), '') IS NOT NULL
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_state_check' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_state_check" CHECK (
            status IN ('pending_review', 'posted', 'rejected', 'reversed')
            AND (
                (status = 'pending_review' AND "reviewedAt" IS NULL AND "reviewedById" IS NULL)
                OR (status IN ('posted', 'rejected', 'reversed') AND "reviewedAt" IS NOT NULL AND NULLIF(BTRIM("reviewedById"), '') IS NOT NULL AND "reviewedById" <> "requestedById")
            )
            AND (
                (status = 'reversed' AND "reversedAt" IS NOT NULL AND NULLIF(BTRIM("reversedById"), '') IS NOT NULL AND NULLIF(BTRIM("reversalReason"), '') IS NOT NULL)
                OR (status <> 'reversed' AND "reversedAt" IS NULL AND "reversedById" IS NULL AND "reversalReason" IS NULL)
            )
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyAccountingPeriod_state_check' AND conrelid = '"AgencyAccountingPeriod"'::regclass) THEN
        ALTER TABLE "AgencyAccountingPeriod" ADD CONSTRAINT "AgencyAccountingPeriod_state_check" CHECK (
            "startDate" <= "endDate"
            AND "startDate" = DATE_TRUNC('day', "startDate") + INTERVAL '12 hours'
            AND "endDate" = DATE_TRUNC('day', "endDate") + INTERVAL '12 hours'
            AND status IN ('open', 'closed')
            AND (
                (status = 'closed' AND "closedAt" IS NOT NULL AND NULLIF(BTRIM("closedById"), '') IS NOT NULL AND NULLIF(BTRIM("closeReason"), '') IS NOT NULL AND (
                    ("reopenedAt" IS NULL AND "reopenedById" IS NULL AND "reopenReason" IS NULL)
                    OR ("reopenedAt" IS NOT NULL AND NULLIF(BTRIM("reopenedById"), '') IS NOT NULL AND NULLIF(BTRIM("reopenReason"), '') IS NOT NULL)
                ))
                OR (status = 'open' AND (
                    ("closedAt" IS NULL AND "closedById" IS NULL AND "closeReason" IS NULL AND "reopenedAt" IS NULL AND "reopenedById" IS NULL AND "reopenReason" IS NULL)
                    OR ("closedAt" IS NOT NULL AND NULLIF(BTRIM("closedById"), '') IS NOT NULL AND NULLIF(BTRIM("closeReason"), '') IS NOT NULL AND "reopenedAt" IS NOT NULL AND NULLIF(BTRIM("reopenedById"), '') IS NOT NULL AND NULLIF(BTRIM("reopenReason"), '') IS NOT NULL)
                ))
            )
        ) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_centerId_fkey' AND conrelid = '"AgencyRemittanceBatch"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceBatch_agencyProgramId_fkey' AND conrelid = '"AgencyRemittanceBatch"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceBatch" ADD CONSTRAINT "AgencyRemittanceBatch_agencyProgramId_fkey" FOREIGN KEY ("agencyProgramId") REFERENCES "AgencyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceAllocation_batchId_fkey' AND conrelid = '"AgencyRemittanceAllocation"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceAllocation" ADD CONSTRAINT "AgencyRemittanceAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AgencyRemittanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceAllocation_claimId_fkey' AND conrelid = '"AgencyRemittanceAllocation"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceAllocation" ADD CONSTRAINT "AgencyRemittanceAllocation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyRemittanceAllocation_remittanceId_fkey' AND conrelid = '"AgencyRemittanceAllocation"'::regclass) THEN
        ALTER TABLE "AgencyRemittanceAllocation" ADD CONSTRAINT "AgencyRemittanceAllocation_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "SubsidyRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_centerId_fkey' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_agencyProgramId_fkey' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_agencyProgramId_fkey" FOREIGN KEY ("agencyProgramId") REFERENCES "AgencyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_ledgerAccountId_fkey' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "AgencyLedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_claimId_fkey' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAdjustment_batchId_fkey' AND conrelid = '"AgencyLedgerAdjustment"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAdjustment" ADD CONSTRAINT "AgencyLedgerAdjustment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AgencyRemittanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyAccountingPeriod_centerId_fkey' AND conrelid = '"AgencyAccountingPeriod"'::regclass) THEN
        ALTER TABLE "AgencyAccountingPeriod" ADD CONSTRAINT "AgencyAccountingPeriod_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_remittanceBatchId_fkey' AND conrelid = '"AgencyLedgerEntry"'::regclass) THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_remittanceBatchId_fkey" FOREIGN KEY ("remittanceBatchId") REFERENCES "AgencyRemittanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_adjustmentId_fkey' AND conrelid = '"AgencyLedgerEntry"'::regclass) THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "AgencyLedgerAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$migration$;

-- Validate complete tenant relationships on every backend/service-role write.
CREATE OR REPLACE FUNCTION public.enforce_agency_remittance_batch_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    program_center_id TEXT;
    program_status TEXT;
    program_cash_gl_code TEXT;
    program_cost_center_code TEXT;
    reconciliation_enabled BOOLEAN;
    expected_reference_key TEXT;
    requires_mapped_program BOOLEAN := FALSE;
BEGIN
    SELECT program."centerId", program.status, program."cashGlCode", program."costCenterCode", center."agencyReconciliationEnabled"
    INTO program_center_id, program_status, program_cash_gl_code, program_cost_center_code, reconciliation_enabled
    FROM public."AgencyProgram" program
    JOIN public."Center" center ON center.id = program."centerId"
    WHERE program.id = NEW."agencyProgramId";

    expected_reference_key := LOWER(REGEXP_REPLACE(BTRIM(NEW."paymentMethod"), '\s+', ' ', 'g')) || ':' || UPPER(REGEXP_REPLACE(BTRIM(NEW."externalReference"), '\s+', ' ', 'g'));
    IF program_center_id IS NULL OR program_center_id <> NEW."centerId" THEN
        RAISE EXCEPTION 'Agency remittance batch scope conflict';
    END IF;
    IF TG_OP = 'INSERT' THEN
        requires_mapped_program := TRUE;
    ELSIF OLD."reviewedAt" IS NULL
       AND NEW."reviewedAt" IS NOT NULL
       AND NEW.status NOT IN ('rejected', 'reversed') THEN
        requires_mapped_program := TRUE;
    END IF;

    IF reconciliation_enabled AND requires_mapped_program AND (
        program_status <> 'active'
        OR NULLIF(BTRIM(program_cash_gl_code), '') IS NULL
        OR NULLIF(BTRIM(program_cost_center_code), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Activated agency reconciliation requires an active mapped batch program';
    END IF;
    IF TG_OP = 'INSERT'
       AND NEW."idempotencyKey" NOT LIKE 'legacy:%'
       AND (
           NEW."cashGlCodeSnapshot" IS DISTINCT FROM program_cash_gl_code
           OR NEW."costCenterCodeSnapshot" IS DISTINCT FROM program_cost_center_code
       ) THEN
        RAISE EXCEPTION 'Agency remittance batch accounting snapshot must match its prepare-time program mapping';
    END IF;
    IF TG_OP = 'INSERT'
       AND NEW."idempotencyKey" NOT LIKE 'legacy:%'
       AND (
           NULLIF(BTRIM(NEW."evidenceName"), '') IS NULL
           OR NULLIF(BTRIM(NEW."evidenceReference"), '') IS NULL
           OR NULLIF(BTRIM(NEW."followUpOwnerId"), '') IS NULL
           OR NEW."followUpDueAt" IS NULL
           OR NEW."reconciliationFingerprint" !~ '^[0-9a-f]{64}$'
       ) THEN
        RAISE EXCEPTION 'Controlled agency remittance batch evidence or fingerprint is incomplete';
    END IF;
    IF TG_OP = 'INSERT'
       AND NEW."idempotencyKey" NOT LIKE 'legacy:%'
       AND (
           NEW.status <> 'pending_review'
           OR NEW."reviewedAt" IS NOT NULL
           OR NEW."reviewedById" IS NOT NULL
           OR NEW."reviewNotes" IS NOT NULL
           OR NEW."reversedAt" IS NOT NULL
           OR NEW."reversedById" IS NOT NULL
           OR NEW."reversalReason" IS NOT NULL
       ) THEN
        RAISE EXCEPTION 'A controlled agency remittance batch must begin pending independent review';
    END IF;
    IF TG_OP = 'INSERT'
       AND NOT reconciliation_enabled
       AND NEW."idempotencyKey" NOT LIKE 'legacy:%' THEN
        RAISE EXCEPTION 'New reviewed agency batches require school reconciliation activation';
    END IF;
    IF LOWER(REGEXP_REPLACE(BTRIM(NEW."paymentMethod"), '\s+', ' ', 'g')) NOT IN ('ach', 'check', 'agency_portal', 'other')
       OR NULLIF(BTRIM(NEW."externalReference"), '') IS NULL
       OR NEW."referenceKey" <> expected_reference_key
       OR NULLIF(BTRIM(NEW."idempotencyKey"), '') IS NULL
       OR NULLIF(BTRIM(NEW."enteredById"), '') IS NULL THEN
        RAISE EXCEPTION 'Agency remittance batch evidence is invalid';
    END IF;
    IF NEW."paidAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
       OR NEW."reviewedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
       OR NEW."reversedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day' THEN
        RAISE EXCEPTION 'Agency remittance batch receipt, review, or reversal cannot be future-dated';
    END IF;
    IF NEW."reviewedAt" < NEW."createdAt"
       OR NEW."reversedAt" < COALESCE(NEW."reviewedAt", NEW."paidAt") THEN
        RAISE EXCEPTION 'Agency remittance batch review or reversal chronology is invalid';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_remittance_allocation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    batch_center_id TEXT;
    batch_program_id TEXT;
    batch_paid_at TIMESTAMP(3);
    batch_payment_method TEXT;
    batch_external_reference TEXT;
    claim_center_id TEXT;
    claim_program_id TEXT;
    remittance_claim_id TEXT;
    remittance_amount_cents INTEGER;
    remittance_paid_at TIMESTAMP(3);
    remittance_payment_method TEXT;
    remittance_external_reference TEXT;
    remittance_reversed_at TIMESTAMP(3);
    reconciliation_enabled BOOLEAN;
    program_status TEXT;
    program_cash_gl_code TEXT;
    program_cost_center_code TEXT;
    requires_mapped_program BOOLEAN := FALSE;
BEGIN
    SELECT batch."centerId", batch."agencyProgramId", batch."paidAt", batch."paymentMethod", batch."externalReference", center."agencyReconciliationEnabled", program.status, program."cashGlCode", program."costCenterCode"
    INTO batch_center_id, batch_program_id, batch_paid_at, batch_payment_method, batch_external_reference, reconciliation_enabled, program_status, program_cash_gl_code, program_cost_center_code
    FROM public."AgencyRemittanceBatch" batch
    JOIN public."Center" center ON center.id = batch."centerId"
    JOIN public."AgencyProgram" program ON program.id = batch."agencyProgramId"
    WHERE batch.id = NEW."batchId";

    SELECT claim."centerId", claim."agencyProgramId"
    INTO claim_center_id, claim_program_id
    FROM public."SubsidyClaim" claim
    WHERE claim.id = NEW."claimId";

    IF batch_center_id IS NULL OR claim_center_id IS NULL
       OR batch_center_id <> claim_center_id
       OR batch_program_id <> claim_program_id THEN
        RAISE EXCEPTION 'Agency remittance allocation scope conflict';
    END IF;

    IF NEW."remittanceId" IS NOT NULL THEN
        SELECT remittance."claimId", remittance."amountCents", remittance."paidAt", remittance."paymentMethod", remittance."externalReference", remittance."reversedAt"
        INTO remittance_claim_id, remittance_amount_cents, remittance_paid_at, remittance_payment_method, remittance_external_reference, remittance_reversed_at
        FROM public."SubsidyRemittance" remittance
        WHERE remittance.id = NEW."remittanceId";

        IF remittance_claim_id IS NULL
           OR remittance_claim_id <> NEW."claimId"
           OR remittance_amount_cents <> NEW."amountCents"
           OR remittance_paid_at IS DISTINCT FROM batch_paid_at
           OR LOWER(REGEXP_REPLACE(BTRIM(remittance_payment_method), '\s+', ' ', 'g')) IS DISTINCT FROM LOWER(REGEXP_REPLACE(BTRIM(batch_payment_method), '\s+', ' ', 'g'))
           OR remittance_external_reference IS DISTINCT FROM batch_external_reference
           OR (remittance_reversed_at IS NULL AND NEW.status <> 'posted')
           OR (remittance_reversed_at IS NOT NULL AND NEW.status <> 'reversed') THEN
            RAISE EXCEPTION 'Agency remittance allocation source conflict';
        END IF;
    END IF;

    IF NULLIF(BTRIM(NEW."idempotencyKey"), '') IS NULL
       OR NULLIF(BTRIM(NEW."requestedById"), '') IS NULL THEN
        RAISE EXCEPTION 'Agency remittance allocation evidence is invalid';
    END IF;
    IF NEW."reviewedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day' THEN
        RAISE EXCEPTION 'Agency remittance allocation review cannot be future-dated';
    END IF;
    IF NEW."reviewedAt" < NEW."createdAt" THEN
        RAISE EXCEPTION 'Agency remittance allocation review cannot predate its request';
    END IF;
    IF TG_OP = 'INSERT'
       AND NEW."idempotencyKey" NOT LIKE 'legacy-allocation:%'
       AND NEW.fingerprint !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Controlled agency remittance allocation fingerprint is invalid';
    END IF;
    IF TG_OP = 'INSERT'
       AND NEW."idempotencyKey" NOT LIKE 'legacy-allocation:%'
       AND (
           NEW.status <> 'pending_review'
           OR NEW."remittanceId" IS NOT NULL
           OR NEW."reviewedAt" IS NOT NULL
           OR NEW."reviewedById" IS NOT NULL
           OR NEW."reviewNotes" IS NOT NULL
       ) THEN
        RAISE EXCEPTION 'A controlled agency remittance allocation must begin pending independent review';
    END IF;
    IF TG_OP = 'INSERT' AND NEW."idempotencyKey" NOT LIKE 'legacy-allocation:%' THEN
        requires_mapped_program := TRUE;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending_review' AND NEW.status = 'posted' THEN
        requires_mapped_program := TRUE;
    END IF;
    IF reconciliation_enabled AND requires_mapped_program AND (
        program_status <> 'active'
        OR NULLIF(BTRIM(program_cash_gl_code), '') IS NULL
        OR NULLIF(BTRIM(program_cost_center_code), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Activated agency reconciliation requires an active mapped allocation program';
    END IF;
    IF TG_OP = 'INSERT'
       AND NOT reconciliation_enabled
       AND NEW."idempotencyKey" NOT LIKE 'legacy-allocation:%' THEN
        RAISE EXCEPTION 'New reviewed agency allocations require school reconciliation activation';
    END IF;
    RETURN NEW;
END
$function$;

-- Preserve the base claim/authorization tenant graph after cutover. These guards
-- cover service-role writes, where RLS alone cannot prevent cross-school links.
CREATE OR REPLACE FUNCTION public.enforce_subsidy_authorization_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    program_center_id TEXT;
    family_center_id TEXT;
    child_family_id TEXT;
    child_classroom_center_id TEXT;
BEGIN
    SELECT program."centerId" INTO program_center_id
    FROM public."AgencyProgram" program
    WHERE program.id = NEW."agencyProgramId";

    SELECT family."centerId" INTO family_center_id
    FROM public."Family" family
    WHERE family.id = NEW."familyId";

    SELECT child."familyId", classroom."centerId" INTO child_family_id, child_classroom_center_id
    FROM public."Child" child
    LEFT JOIN public."Classroom" classroom ON classroom.id = child."classroomId"
    WHERE child.id = NEW."childId";

    IF program_center_id IS NULL
       OR family_center_id IS NULL
       OR child_family_id IS NULL
       OR program_center_id <> NEW."centerId"
       OR family_center_id <> NEW."centerId"
       OR child_family_id <> NEW."familyId"
       OR (child_classroom_center_id IS NOT NULL AND child_classroom_center_id <> NEW."centerId") THEN
        RAISE EXCEPTION 'Subsidy authorization school, program, family, or child scope conflict';
    END IF;

    IF TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1
        FROM public."SubsidyClaim" claim
        WHERE claim."authorizationId" = OLD.id
          AND (
              claim."centerId" IS DISTINCT FROM NEW."centerId"
              OR claim."agencyProgramId" IS DISTINCT FROM NEW."agencyProgramId"
              OR EXISTS (
                  SELECT 1
                  FROM public."SubsidyClaimLine" line
                  WHERE line."claimId" = claim.id
                    AND line."childId" IS DISTINCT FROM NEW."childId"
              )
          )
    ) THEN
        RAISE EXCEPTION 'Subsidy authorization update conflicts with an existing claim or claim-line scope';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_subsidy_claim_line_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    claim_center_id TEXT;
    authorization_child_id TEXT;
    child_family_center_id TEXT;
BEGIN
    SELECT claim."centerId", subsidy_authorization."childId"
    INTO claim_center_id, authorization_child_id
    FROM public."SubsidyClaim" claim
    LEFT JOIN public."SubsidyAuthorization" subsidy_authorization ON subsidy_authorization.id = claim."authorizationId"
    WHERE claim.id = NEW."claimId";

    SELECT family."centerId"
    INTO child_family_center_id
    FROM public."Child" child
    JOIN public."Family" family ON family.id = child."familyId"
    WHERE child.id = NEW."childId";

    IF claim_center_id IS NULL
       OR child_family_center_id IS NULL
       OR child_family_center_id <> claim_center_id
       OR (authorization_child_id IS NOT NULL AND NEW."childId" <> authorization_child_id) THEN
        RAISE EXCEPTION 'Subsidy claim line child scope conflicts with its claim or authorization';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_subsidy_claim_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    program_center_id TEXT;
    program_status TEXT;
    receivable_gl_code TEXT;
    cash_gl_code TEXT;
    adjustment_gl_code TEXT;
    cost_center_code TEXT;
    reconciliation_enabled BOOLEAN;
    authorization_center_id TEXT;
    authorization_program_id TEXT;
    authorization_child_id TEXT;
    requires_mapped_program BOOLEAN := FALSE;
BEGIN
    SELECT
        program."centerId",
        program.status,
        program."receivableGlCode",
        program."cashGlCode",
        program."adjustmentGlCode",
        program."costCenterCode",
        center."agencyReconciliationEnabled"
    INTO
        program_center_id,
        program_status,
        receivable_gl_code,
        cash_gl_code,
        adjustment_gl_code,
        cost_center_code,
        reconciliation_enabled
    FROM public."AgencyProgram" program
    JOIN public."Center" center ON center.id = program."centerId"
    WHERE program.id = NEW."agencyProgramId";

    IF program_center_id IS NULL OR program_center_id <> NEW."centerId" THEN
        RAISE EXCEPTION 'Subsidy claim school and agency program scope conflict';
    END IF;

    IF NEW."authorizationId" IS NOT NULL THEN
        SELECT subsidy_authorization."centerId", subsidy_authorization."agencyProgramId", subsidy_authorization."childId"
        INTO authorization_center_id, authorization_program_id, authorization_child_id
        FROM public."SubsidyAuthorization" subsidy_authorization
        WHERE subsidy_authorization.id = NEW."authorizationId";

        IF authorization_center_id IS NULL
           OR authorization_center_id <> NEW."centerId"
           OR authorization_program_id <> NEW."agencyProgramId" THEN
            RAISE EXCEPTION 'Subsidy claim authorization scope conflict';
        END IF;
    ELSIF NEW.status IN ('approved', 'partially_paid', 'paid') THEN
        RAISE EXCEPTION 'An approved-lifecycle subsidy claim requires authorization evidence';
    END IF;

    IF NEW.status IN ('approved', 'partially_paid', 'paid')
       AND COALESCE(NEW."approvedAt", NEW."createdAt") >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day' THEN
        RAISE EXCEPTION 'A subsidy claim approval event cannot be future-dated';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."SubsidyClaimLine" line
        JOIN public."Child" child ON child.id = line."childId"
        JOIN public."Family" family ON family.id = child."familyId"
        WHERE line."claimId" = NEW.id
          AND (
              family."centerId" IS DISTINCT FROM NEW."centerId"
              OR (authorization_child_id IS NOT NULL AND line."childId" <> authorization_child_id)
          )
    ) THEN
        RAISE EXCEPTION 'Subsidy claim update conflicts with an existing claim-line child';
    END IF;

    IF TG_OP = 'INSERT' THEN
        requires_mapped_program := NEW.status IN ('approved', 'partially_paid', 'paid');
    ELSIF OLD.status NOT IN ('approved', 'partially_paid', 'paid')
       AND NEW.status IN ('approved', 'partially_paid', 'paid') THEN
        requires_mapped_program := TRUE;
    END IF;

    IF reconciliation_enabled
       AND requires_mapped_program
       AND (
           program_status <> 'active'
           OR NULLIF(BTRIM(receivable_gl_code), '') IS NULL
           OR NULLIF(BTRIM(cash_gl_code), '') IS NULL
           OR NULLIF(BTRIM(adjustment_gl_code), '') IS NULL
           OR NULLIF(BTRIM(cost_center_code), '') IS NULL
       ) THEN
        RAISE EXCEPTION 'Activated agency reconciliation requires a fully mapped active agency program';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_program_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF NEW."centerId" IS DISTINCT FROM OLD."centerId" AND (
        EXISTS (SELECT 1 FROM public."SubsidyAuthorization" subsidy_authorization WHERE subsidy_authorization."agencyProgramId" = OLD.id)
        OR EXISTS (SELECT 1 FROM public."SubsidyClaim" claim WHERE claim."agencyProgramId" = OLD.id)
        OR EXISTS (SELECT 1 FROM public."AgencyLedgerAccount" account WHERE account."agencyProgramId" = OLD.id)
        OR EXISTS (SELECT 1 FROM public."AgencyRemittanceBatch" batch WHERE batch."agencyProgramId" = OLD.id)
        OR EXISTS (SELECT 1 FROM public."AgencyLedgerAdjustment" adjustment WHERE adjustment."agencyProgramId" = OLD.id)
    ) THEN
        RAISE EXCEPTION 'An agency program with financial or authorization history cannot move schools';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_family_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF NEW."centerId" IS DISTINCT FROM OLD."centerId" AND (
        EXISTS (
            SELECT 1
            FROM public."SubsidyAuthorization" subsidy_authorization
            WHERE subsidy_authorization."familyId" = OLD.id
              AND subsidy_authorization."centerId" IS DISTINCT FROM NEW."centerId"
        )
        OR EXISTS (
            SELECT 1
            FROM public."Child" child
            JOIN public."SubsidyClaimLine" line ON line."childId" = child.id
            JOIN public."SubsidyClaim" claim ON claim.id = line."claimId"
            WHERE child."familyId" = OLD.id
              AND claim."centerId" IS DISTINCT FROM NEW."centerId"
        )
    ) THEN
        RAISE EXCEPTION 'A family with agency authorization or claim history cannot move to a conflicting school';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_child_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    family_center_id TEXT;
    classroom_center_id TEXT;
BEGIN
    SELECT family."centerId" INTO family_center_id
    FROM public."Family" family
    WHERE family.id = NEW."familyId";

    IF NEW."classroomId" IS NOT NULL THEN
        SELECT classroom."centerId" INTO classroom_center_id
        FROM public."Classroom" classroom
        WHERE classroom.id = NEW."classroomId";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."SubsidyAuthorization" subsidy_authorization
        WHERE subsidy_authorization."childId" = OLD.id
          AND (
              subsidy_authorization."familyId" IS DISTINCT FROM NEW."familyId"
              OR subsidy_authorization."centerId" IS DISTINCT FROM family_center_id
              OR (NEW."classroomId" IS NOT NULL AND subsidy_authorization."centerId" IS DISTINCT FROM classroom_center_id)
          )
    ) OR EXISTS (
        SELECT 1
        FROM public."SubsidyClaimLine" line
        JOIN public."SubsidyClaim" claim ON claim.id = line."claimId"
        WHERE line."childId" = OLD.id
          AND claim."centerId" IS DISTINCT FROM family_center_id
    ) THEN
        RAISE EXCEPTION 'A child update conflicts with agency authorization or claim history';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_classroom_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF NEW."centerId" IS DISTINCT FROM OLD."centerId" AND EXISTS (
        SELECT 1
        FROM public."Child" child
        LEFT JOIN public."SubsidyAuthorization" subsidy_authorization ON subsidy_authorization."childId" = child.id
        LEFT JOIN public."SubsidyClaimLine" line ON line."childId" = child.id
        LEFT JOIN public."SubsidyClaim" claim ON claim.id = line."claimId"
        WHERE child."classroomId" = OLD.id
          AND (
              (subsidy_authorization.id IS NOT NULL AND subsidy_authorization."centerId" IS DISTINCT FROM NEW."centerId")
              OR (claim.id IS NOT NULL AND claim."centerId" IS DISTINCT FROM NEW."centerId")
          )
    ) THEN
        RAISE EXCEPTION 'A classroom with agency authorization or claim history cannot move to a conflicting school';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_program_activation_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    reconciliation_enabled BOOLEAN;
BEGIN
    SELECT center."agencyReconciliationEnabled"
    INTO reconciliation_enabled
    FROM public."Center" center
    WHERE center.id = NEW."centerId";

    IF reconciliation_enabled
       AND NEW.status = 'active'
       AND (
           NULLIF(BTRIM(NEW."receivableGlCode"), '') IS NULL
           OR NULLIF(BTRIM(NEW."cashGlCode"), '') IS NULL
           OR NULLIF(BTRIM(NEW."adjustmentGlCode"), '') IS NULL
           OR NULLIF(BTRIM(NEW."costCenterCode"), '') IS NULL
       ) THEN
        RAISE EXCEPTION 'An active agency program requires complete accounting mappings for reconciliation';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_ledger_adjustment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    program_center_id TEXT;
    account_center_id TEXT;
    account_program_id TEXT;
    related_center_id TEXT;
    related_program_id TEXT;
    related_claim_status TEXT;
    program_status TEXT;
    program_adjustment_gl_code TEXT;
    program_cost_center_code TEXT;
    reconciliation_enabled BOOLEAN;
    requires_mapped_program BOOLEAN := FALSE;
BEGIN
    SELECT program."centerId", program.status, program."adjustmentGlCode", program."costCenterCode", center."agencyReconciliationEnabled"
    INTO program_center_id, program_status, program_adjustment_gl_code, program_cost_center_code, reconciliation_enabled
    FROM public."AgencyProgram" program
    JOIN public."Center" center ON center.id = program."centerId"
    WHERE program.id = NEW."agencyProgramId";

    SELECT account."centerId", account."agencyProgramId"
    INTO account_center_id, account_program_id
    FROM public."AgencyLedgerAccount" account
    WHERE account.id = NEW."ledgerAccountId";

    IF program_center_id IS NULL OR account_center_id IS NULL
       OR program_center_id <> NEW."centerId"
       OR account_center_id <> NEW."centerId"
       OR account_program_id <> NEW."agencyProgramId" THEN
        RAISE EXCEPTION 'Agency ledger adjustment scope conflict';
    END IF;
    IF TG_OP = 'INSERT' THEN
        requires_mapped_program := TRUE;
    ELSIF OLD.status = 'pending_review' AND NEW.status = 'posted' THEN
        requires_mapped_program := TRUE;
    END IF;

    IF reconciliation_enabled AND requires_mapped_program AND (
        program_status <> 'active'
        OR NULLIF(BTRIM(program_adjustment_gl_code), '') IS NULL
        OR NULLIF(BTRIM(program_cost_center_code), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Activated agency reconciliation requires an active mapped adjustment program';
    END IF;
    IF TG_OP = 'INSERT' AND (
        NEW."glCodeSnapshot" IS DISTINCT FROM program_adjustment_gl_code
        OR NEW."costCenterCodeSnapshot" IS DISTINCT FROM program_cost_center_code
    ) THEN
        RAISE EXCEPTION 'Agency ledger adjustment accounting snapshot must match its prepare-time program mapping';
    END IF;
    IF TG_OP = 'INSERT' AND NOT reconciliation_enabled THEN
        RAISE EXCEPTION 'New agency adjustments require school reconciliation activation';
    END IF;
    IF TG_OP = 'INSERT' AND (
        NEW.status <> 'pending_review'
        OR NEW."reviewedAt" IS NOT NULL
        OR NEW."reviewedById" IS NOT NULL
        OR NEW."reviewNotes" IS NOT NULL
        OR NEW."reversedAt" IS NOT NULL
        OR NEW."reversedById" IS NOT NULL
        OR NEW."reversalReason" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'An agency ledger adjustment must begin pending independent review';
    END IF;

    IF NEW."claimId" IS NOT NULL THEN
        SELECT claim."centerId", claim."agencyProgramId", claim.status
        INTO related_center_id, related_program_id, related_claim_status
        FROM public."SubsidyClaim" claim
        WHERE claim.id = NEW."claimId";
        IF related_center_id IS NULL
           OR related_center_id <> NEW."centerId"
           OR related_program_id <> NEW."agencyProgramId"
           OR related_claim_status NOT IN ('approved', 'partially_paid', 'paid') THEN
            RAISE EXCEPTION 'Agency ledger adjustment requires an exact approved-lifecycle claim in the same school and program';
        END IF;
    END IF;

    IF NEW."batchId" IS NOT NULL THEN
        SELECT batch."centerId", batch."agencyProgramId"
        INTO related_center_id, related_program_id
        FROM public."AgencyRemittanceBatch" batch
        WHERE batch.id = NEW."batchId";
        IF related_center_id IS NULL OR related_center_id <> NEW."centerId" OR related_program_id <> NEW."agencyProgramId" THEN
            RAISE EXCEPTION 'Agency ledger adjustment batch scope conflict';
        END IF;
    END IF;

    IF NEW."effectiveAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
       OR NEW."reviewedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
       OR NEW."reversedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day' THEN
        RAISE EXCEPTION 'Agency ledger adjustment, review, or reversal cannot be future-dated';
    END IF;
    IF NEW."reviewedAt" < NEW."createdAt"
       OR NEW."reversedAt" < COALESCE(NEW."reviewedAt", NEW."effectiveAt") THEN
        RAISE EXCEPTION 'Agency ledger adjustment review or reversal chronology is invalid';
    END IF;
    IF NULLIF(BTRIM(NEW.reason), '') IS NULL
       OR NULLIF(BTRIM(NEW."idempotencyKey"), '') IS NULL
       OR NULLIF(BTRIM(NEW."requestedById"), '') IS NULL
       OR NULLIF(BTRIM(NEW."evidenceName"), '') IS NULL
       OR NULLIF(BTRIM(NEW."evidenceReference"), '') IS NULL
       OR NULLIF(BTRIM(NEW."followUpOwnerId"), '') IS NULL
       OR NEW."followUpDueAt" IS NULL
       OR NEW.fingerprint !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Agency ledger adjustment evidence is incomplete';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_ledger_entry_reconciliation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    account_center_id TEXT;
    account_program_id TEXT;
    related_center_id TEXT;
    related_program_id TEXT;
    related_account_id TEXT;
    related_claim_id TEXT;
    related_batch_id TEXT;
    related_gl_code TEXT;
    related_cost_center_code TEXT;
BEGIN
    SELECT account."centerId", account."agencyProgramId"
    INTO account_center_id, account_program_id
    FROM public."AgencyLedgerAccount" account
    WHERE account.id = NEW."agencyLedgerAccountId";

    IF account_center_id IS NULL THEN
        RAISE EXCEPTION 'Agency ledger entry account is missing';
    END IF;

    IF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1
        FROM public."AgencyAccountingPeriod" period
        WHERE period."centerId" = account_center_id
          AND period.status = 'closed'
          AND DATE_TRUNC('day', period."endDate") >= DATE_TRUNC('day', NEW."effectiveAt")
    ) THEN
        RAISE EXCEPTION 'Agency ledger activity cannot post before or within a later closed accounting period';
    END IF;

    IF NEW."claimId" IS NOT NULL THEN
        SELECT claim."centerId", claim."agencyProgramId"
        INTO related_center_id, related_program_id
        FROM public."SubsidyClaim" claim
        WHERE claim.id = NEW."claimId";

        IF related_center_id IS NULL
           OR related_center_id <> account_center_id
           OR related_program_id <> account_program_id THEN
            RAISE EXCEPTION 'Agency ledger entry claim scope conflict';
        END IF;
    END IF;

    IF NEW."remittanceBatchId" IS NOT NULL THEN
        SELECT batch."centerId", batch."agencyProgramId"
        INTO related_center_id, related_program_id
        FROM public."AgencyRemittanceBatch" batch
        WHERE batch.id = NEW."remittanceBatchId";
        IF related_center_id IS NULL OR related_center_id <> account_center_id OR related_program_id <> account_program_id THEN
            RAISE EXCEPTION 'Agency ledger entry batch scope conflict';
        END IF;
    END IF;

    IF NEW."adjustmentId" IS NOT NULL THEN
        SELECT adjustment."centerId", adjustment."agencyProgramId", adjustment."ledgerAccountId", adjustment."claimId", adjustment."batchId", adjustment."glCodeSnapshot", adjustment."costCenterCodeSnapshot"
        INTO related_center_id, related_program_id, related_account_id, related_claim_id, related_batch_id, related_gl_code, related_cost_center_code
        FROM public."AgencyLedgerAdjustment" adjustment
        WHERE adjustment.id = NEW."adjustmentId";
        IF related_center_id IS NULL
           OR related_center_id <> account_center_id
           OR related_program_id <> account_program_id
           OR related_account_id <> NEW."agencyLedgerAccountId"
           OR NEW."claimId" IS DISTINCT FROM related_claim_id
           OR NEW."remittanceBatchId" IS DISTINCT FROM related_batch_id
           OR NEW."glCodeSnapshot" IS DISTINCT FROM related_gl_code
           OR NEW."costCenterCodeSnapshot" IS DISTINCT FROM related_cost_center_code THEN
            RAISE EXCEPTION 'Agency ledger entry adjustment scope conflict';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

-- Cross-table provenance is deferred because posting creates the ledger entry
-- before it attaches the remittance to its allocation in the same transaction.
-- At commit, every linked source must match its exact claim, batch, amount,
-- effective date, accounting snapshot, and deterministic source key.
CREATE OR REPLACE FUNCTION public.assert_agency_ledger_entry_provenance(target_entry_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    entry_row public."AgencyLedgerEntry"%ROWTYPE;
    source_claim_id TEXT;
    source_amount_cents INTEGER;
    source_paid_at TIMESTAMP(3);
    source_reversed_at TIMESTAMP(3);
    source_external_reference TEXT;
    allocation_batch_id TEXT;
    allocation_reviewed_at TIMESTAMP(3);
    batch_gl_code TEXT;
    batch_cost_center_code TEXT;
    has_allocation BOOLEAN := FALSE;
    adjustment_row public."AgencyLedgerAdjustment"%ROWTYPE;
    adjustment_original_entry public."AgencyLedgerEntry"%ROWTYPE;
    has_adjustment_original BOOLEAN := FALSE;
    receipt_gl_code TEXT;
    receipt_cost_center_code TEXT;
    receipt_effective_at TIMESTAMP(3);
    claim_approved_cents INTEGER;
    claim_effective_at TIMESTAMP(3);
    claim_external_reference TEXT;
    batch_row public."AgencyRemittanceBatch"%ROWTYPE;
    parsed_allocation_id TEXT;
    linked_allocation_amount INTEGER;
    linked_allocation_reviewed_at TIMESTAMP(3);
    initial_unapplied_cents BIGINT;
    original_unapplied_amount BIGINT;
    unapplied_release_total BIGINT;
BEGIN
    SELECT entry.*
    INTO entry_row
    FROM public."AgencyLedgerEntry" entry
    WHERE entry.id = target_entry_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF entry_row."remittanceId" IS NOT NULL AND entry_row."adjustmentId" IS NOT NULL THEN
        RAISE EXCEPTION 'Agency ledger entry cannot link both a remittance and an adjustment';
    END IF;

    IF entry_row."remittanceId" IS NOT NULL THEN
        SELECT remittance."claimId", remittance."amountCents", remittance."paidAt", remittance."reversedAt", remittance."externalReference"
        INTO source_claim_id, source_amount_cents, source_paid_at, source_reversed_at, source_external_reference
        FROM public."SubsidyRemittance" remittance
        WHERE remittance.id = entry_row."remittanceId";

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Agency ledger entry remittance provenance is missing';
        END IF;

        SELECT allocation."batchId", allocation."reviewedAt", batch."cashGlCodeSnapshot", batch."costCenterCodeSnapshot"
        INTO allocation_batch_id, allocation_reviewed_at, batch_gl_code, batch_cost_center_code
        FROM public."AgencyRemittanceAllocation" allocation
        JOIN public."AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
        WHERE allocation."remittanceId" = entry_row."remittanceId";
        has_allocation := FOUND;

        IF entry_row."claimId" IS DISTINCT FROM source_claim_id
           OR (has_allocation AND entry_row."remittanceBatchId" IS DISTINCT FROM allocation_batch_id)
           OR (NOT has_allocation AND entry_row."remittanceBatchId" IS NOT NULL) THEN
            RAISE EXCEPTION 'Agency ledger entry remittance allocation provenance conflicts';
        END IF;

        IF entry_row.type = 'remittance_received' THEN
            IF entry_row."sourceSystem" IS DISTINCT FROM 'subsidy_agency'
               OR entry_row."externalId" IS DISTINCT FROM 'remittance:' || entry_row."remittanceId"
               OR entry_row."amountCents" <> -source_amount_cents
               OR entry_row."effectiveAt" < source_paid_at
               OR entry_row."externalReference" IS DISTINCT FROM source_external_reference
               OR (entry_row."effectiveAt" > source_paid_at AND (
                   NOT has_allocation OR allocation_reviewed_at IS DISTINCT FROM entry_row."effectiveAt"
               ))
               OR (has_allocation AND (
                   entry_row."glCodeSnapshot" IS DISTINCT FROM batch_gl_code
                   OR entry_row."costCenterCodeSnapshot" IS DISTINCT FROM batch_cost_center_code
               )) THEN
                RAISE EXCEPTION 'Agency ledger remittance receipt conflicts with exact source facts';
            END IF;
        ELSIF entry_row.type = 'remittance_reversal' THEN
            SELECT receipt."glCodeSnapshot", receipt."costCenterCodeSnapshot", receipt."effectiveAt"
            INTO receipt_gl_code, receipt_cost_center_code, receipt_effective_at
            FROM public."AgencyLedgerEntry" receipt
            WHERE receipt."sourceSystem" = 'subsidy_agency'
              AND receipt."externalId" = 'remittance:' || entry_row."remittanceId";

            IF source_reversed_at IS NULL
               OR entry_row."sourceSystem" IS DISTINCT FROM 'subsidy_agency'
               OR entry_row."externalId" IS DISTINCT FROM 'remittance-reversal:' || entry_row."remittanceId"
               OR entry_row."amountCents" <> source_amount_cents
               OR entry_row."effectiveAt" IS DISTINCT FROM source_reversed_at
               OR source_reversed_at < receipt_effective_at
               OR entry_row."externalReference" IS DISTINCT FROM source_external_reference
               OR NOT FOUND
               OR entry_row."glCodeSnapshot" IS DISTINCT FROM receipt_gl_code
               OR entry_row."costCenterCodeSnapshot" IS DISTINCT FROM receipt_cost_center_code THEN
                RAISE EXCEPTION 'Agency ledger remittance reversal conflicts with exact source facts';
            END IF;
        ELSE
            RAISE EXCEPTION 'Agency ledger remittance link has an unsupported entry type';
        END IF;
    END IF;

    IF entry_row."adjustmentId" IS NOT NULL THEN
        SELECT adjustment.*
        INTO adjustment_row
        FROM public."AgencyLedgerAdjustment" adjustment
        WHERE adjustment.id = entry_row."adjustmentId";

        IF NOT FOUND
           OR entry_row."agencyLedgerAccountId" IS DISTINCT FROM adjustment_row."ledgerAccountId"
           OR entry_row."claimId" IS DISTINCT FROM adjustment_row."claimId"
           OR entry_row."remittanceBatchId" IS DISTINCT FROM adjustment_row."batchId"
           OR entry_row."glCodeSnapshot" IS DISTINCT FROM adjustment_row."glCodeSnapshot"
           OR entry_row."costCenterCodeSnapshot" IS DISTINCT FROM adjustment_row."costCenterCodeSnapshot"
           OR entry_row."sourceSystem" IS DISTINCT FROM 'subsidy_agency'
           OR entry_row."externalReference" IS DISTINCT FROM adjustment_row."evidenceReference" THEN
            RAISE EXCEPTION 'Agency ledger adjustment provenance conflicts';
        END IF;

        IF adjustment_row.status IN ('posted', 'reversed') THEN
            SELECT original.*
            INTO adjustment_original_entry
            FROM public."AgencyLedgerEntry" original
            WHERE original."sourceSystem" = 'subsidy_agency'
              AND original."externalId" = 'adjustment:' || adjustment_row.id;
            has_adjustment_original := FOUND;

            IF NOT has_adjustment_original
               OR adjustment_original_entry."agencyLedgerAccountId" IS DISTINCT FROM adjustment_row."ledgerAccountId"
               OR adjustment_original_entry."claimId" IS DISTINCT FROM adjustment_row."claimId"
               OR adjustment_original_entry."remittanceId" IS NOT NULL
               OR adjustment_original_entry."remittanceBatchId" IS DISTINCT FROM adjustment_row."batchId"
               OR adjustment_original_entry."adjustmentId" IS DISTINCT FROM adjustment_row.id
               OR adjustment_original_entry.type IS DISTINCT FROM 'adjustment_' || adjustment_row.type
               OR adjustment_original_entry."amountCents" IS DISTINCT FROM adjustment_row."amountCents"
               OR adjustment_original_entry."effectiveAt" IS DISTINCT FROM adjustment_row."effectiveAt"
               OR adjustment_original_entry."externalReference" IS DISTINCT FROM adjustment_row."evidenceReference"
               OR adjustment_original_entry."glCodeSnapshot" IS DISTINCT FROM adjustment_row."glCodeSnapshot"
               OR adjustment_original_entry."costCenterCodeSnapshot" IS DISTINCT FROM adjustment_row."costCenterCodeSnapshot" THEN
                RAISE EXCEPTION 'Posted agency adjustment is missing its exact original ledger provenance';
            END IF;
        END IF;

        IF entry_row.type = 'adjustment_' || adjustment_row.type THEN
            IF adjustment_row.status NOT IN ('posted', 'reversed')
               OR entry_row."externalId" IS DISTINCT FROM 'adjustment:' || adjustment_row.id
               OR entry_row."amountCents" <> adjustment_row."amountCents"
               OR entry_row."effectiveAt" IS DISTINCT FROM adjustment_row."effectiveAt" THEN
                RAISE EXCEPTION 'Agency ledger adjustment entry conflicts with exact source facts';
            END IF;
        ELSIF entry_row.type = 'adjustment_reversal' THEN
            IF adjustment_row.status <> 'reversed'
               OR adjustment_row."reversedAt" IS NULL
               OR entry_row."externalId" IS DISTINCT FROM 'adjustment-reversal:' || adjustment_row.id
               OR entry_row."amountCents" <> -adjustment_row."amountCents"
               OR entry_row."effectiveAt" IS DISTINCT FROM adjustment_row."reversedAt" THEN
                RAISE EXCEPTION 'Agency ledger adjustment reversal conflicts with exact source facts';
            END IF;
        ELSE
            RAISE EXCEPTION 'Agency ledger adjustment link has an unsupported entry type';
        END IF;
    END IF;

    IF entry_row."remittanceId" IS NULL AND entry_row."adjustmentId" IS NULL THEN
        IF entry_row.type = 'claim_approved' THEN
            SELECT claim."approvedCents", COALESCE(claim."approvedAt", claim."createdAt"), claim."externalReference"
            INTO claim_approved_cents, claim_effective_at, claim_external_reference
            FROM public."SubsidyClaim" claim
            WHERE claim.id = entry_row."claimId"
              AND claim.status IN ('approved', 'partially_paid', 'paid');

            IF NOT FOUND
               OR entry_row."remittanceBatchId" IS NOT NULL
               OR entry_row."sourceSystem" IS DISTINCT FROM 'subsidy_agency'
               OR entry_row."externalId" IS DISTINCT FROM 'claim-approved:' || entry_row."claimId"
               OR entry_row."amountCents" IS DISTINCT FROM claim_approved_cents
               OR entry_row."effectiveAt" IS DISTINCT FROM claim_effective_at
               OR entry_row."externalReference" IS DISTINCT FROM claim_external_reference THEN
                RAISE EXCEPTION 'Agency ledger claim approval conflicts with exact source facts';
            END IF;
        ELSIF entry_row.type IN ('unapplied_cash', 'unapplied_cash_allocation', 'unapplied_cash_reversal') THEN
            IF entry_row."claimId" IS NOT NULL OR entry_row."remittanceBatchId" IS NULL THEN
                RAISE EXCEPTION 'Agency ledger unapplied cash link shape is invalid';
            END IF;

            SELECT batch.*
            INTO batch_row
            FROM public."AgencyRemittanceBatch" batch
            WHERE batch.id = entry_row."remittanceBatchId";

            IF NOT FOUND
               OR entry_row."sourceSystem" IS DISTINCT FROM 'subsidy_agency'
               OR entry_row."externalReference" IS DISTINCT FROM batch_row."externalReference"
               OR entry_row."glCodeSnapshot" IS DISTINCT FROM batch_row."cashGlCodeSnapshot"
               OR entry_row."costCenterCodeSnapshot" IS DISTINCT FROM batch_row."costCenterCodeSnapshot" THEN
                RAISE EXCEPTION 'Agency ledger unapplied cash batch provenance conflicts';
            END IF;

            IF entry_row.type = 'unapplied_cash' THEN
                SELECT batch_row."totalCents"::bigint - COALESCE(SUM(allocation."amountCents"::bigint), 0)
                INTO initial_unapplied_cents
                FROM public."AgencyRemittanceAllocation" allocation
                WHERE allocation."batchId" = batch_row.id
                  AND batch_row."reviewedAt" IS NOT NULL
                  AND allocation.status IN ('posted', 'reversed')
                  AND allocation."createdAt" <= batch_row."reviewedAt";

                IF entry_row."externalId" IS DISTINCT FROM 'batch-unapplied:' || batch_row.id
                   OR batch_row."reviewedAt" IS NULL
                   OR batch_row.status = 'rejected'
                   OR entry_row."effectiveAt" IS DISTINCT FROM batch_row."paidAt"
                   OR initial_unapplied_cents <= 0
                   OR entry_row."amountCents"::bigint <> -initial_unapplied_cents THEN
                    RAISE EXCEPTION 'Agency ledger unapplied cash receipt conflicts with exact batch facts';
                END IF;
            ELSIF entry_row.type = 'unapplied_cash_allocation' THEN
                parsed_allocation_id := SUBSTRING(entry_row."externalId" FROM LENGTH('batch-unapplied-allocation:') + 1);
                SELECT allocation."amountCents", allocation."reviewedAt"
                INTO linked_allocation_amount, linked_allocation_reviewed_at
                FROM public."AgencyRemittanceAllocation" allocation
                WHERE allocation.id = parsed_allocation_id
                  AND allocation."batchId" = batch_row.id
                  AND allocation.status IN ('posted', 'reversed');

                IF NOT FOUND
                   OR entry_row."externalId" IS DISTINCT FROM 'batch-unapplied-allocation:' || parsed_allocation_id
                   OR entry_row."amountCents" IS DISTINCT FROM linked_allocation_amount
                   OR entry_row."effectiveAt" IS DISTINCT FROM linked_allocation_reviewed_at THEN
                    RAISE EXCEPTION 'Agency ledger unapplied cash allocation conflicts with exact allocation facts';
                END IF;
            ELSE
                SELECT original."amountCents"::bigint, COALESCE(SUM(release."amountCents"::bigint), 0)
                INTO original_unapplied_amount, unapplied_release_total
                FROM public."AgencyLedgerEntry" original
                LEFT JOIN public."AgencyLedgerEntry" release
                  ON release."remittanceBatchId" = batch_row.id
                 AND release.type = 'unapplied_cash_allocation'
                 AND release."sourceSystem" = 'subsidy_agency'
                WHERE original."sourceSystem" = 'subsidy_agency'
                  AND original."externalId" = 'batch-unapplied:' || batch_row.id
                GROUP BY original."amountCents";

                IF NOT FOUND
                   OR batch_row.status <> 'reversed'
                   OR batch_row."reversedAt" IS NULL
                   OR entry_row."externalId" IS DISTINCT FROM 'batch-unapplied-reversal:' || batch_row.id
                   OR entry_row."amountCents" IS DISTINCT FROM batch_row."unappliedCents"
                   OR entry_row."amountCents"::bigint <> -(original_unapplied_amount + unapplied_release_total)
                   OR entry_row."effectiveAt" IS DISTINCT FROM batch_row."reversedAt" THEN
                    RAISE EXCEPTION 'Agency ledger unapplied cash reversal conflicts with exact batch facts';
                END IF;
            END IF;
        ELSE
            RAISE EXCEPTION 'Agency ledger entry type or source linkage is unsupported';
        END IF;
    END IF;

    RETURN;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_ledger_entry_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    PERFORM public.assert_agency_ledger_entry_provenance(NEW.id);
    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_agency_remittance_batch_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_remittance_allocation_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_subsidy_authorization_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_subsidy_claim_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_subsidy_claim_line_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_program_activation_readiness() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_program_parent_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_family_parent_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_child_parent_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_classroom_parent_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_ledger_adjustment_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_ledger_entry_reconciliation_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_agency_ledger_entry_provenance(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_ledger_entry_provenance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "AgencyRemittanceBatch_scope_guard" ON "AgencyRemittanceBatch";
CREATE TRIGGER "AgencyRemittanceBatch_scope_guard"
BEFORE INSERT OR UPDATE ON "AgencyRemittanceBatch"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_remittance_batch_scope();

DROP TRIGGER IF EXISTS "SubsidyAuthorization_scope_guard" ON "SubsidyAuthorization";
CREATE TRIGGER "SubsidyAuthorization_scope_guard"
BEFORE INSERT OR UPDATE OF "centerId", "agencyProgramId", "familyId", "childId" ON "SubsidyAuthorization"
FOR EACH ROW EXECUTE FUNCTION public.enforce_subsidy_authorization_scope();

DROP TRIGGER IF EXISTS "SubsidyClaim_scope_guard" ON "SubsidyClaim";
CREATE TRIGGER "SubsidyClaim_scope_guard"
BEFORE INSERT OR UPDATE OF "centerId", "agencyProgramId", "authorizationId", "status" ON "SubsidyClaim"
FOR EACH ROW EXECUTE FUNCTION public.enforce_subsidy_claim_scope();

DROP TRIGGER IF EXISTS "SubsidyClaimLine_scope_guard" ON "SubsidyClaimLine";
CREATE TRIGGER "SubsidyClaimLine_scope_guard"
BEFORE INSERT OR UPDATE OF "claimId", "childId" ON "SubsidyClaimLine"
FOR EACH ROW EXECUTE FUNCTION public.enforce_subsidy_claim_line_scope();

DROP TRIGGER IF EXISTS "AgencyProgram_activation_readiness_guard" ON "AgencyProgram";
CREATE TRIGGER "AgencyProgram_activation_readiness_guard"
BEFORE INSERT OR UPDATE OF "centerId", "status", "receivableGlCode", "cashGlCode", "adjustmentGlCode", "costCenterCode" ON "AgencyProgram"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_program_activation_readiness();

DROP TRIGGER IF EXISTS "AgencyProgram_parent_scope_guard" ON "AgencyProgram";
CREATE TRIGGER "AgencyProgram_parent_scope_guard"
BEFORE UPDATE OF "centerId" ON "AgencyProgram"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_program_parent_scope();

DROP TRIGGER IF EXISTS "Family_agency_parent_scope_guard" ON "Family";
CREATE TRIGGER "Family_agency_parent_scope_guard"
BEFORE UPDATE OF "centerId" ON "Family"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_family_parent_scope();

DROP TRIGGER IF EXISTS "Child_agency_parent_scope_guard" ON "Child";
CREATE TRIGGER "Child_agency_parent_scope_guard"
BEFORE UPDATE OF "familyId", "classroomId" ON "Child"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_child_parent_scope();

DROP TRIGGER IF EXISTS "Classroom_agency_parent_scope_guard" ON "Classroom";
CREATE TRIGGER "Classroom_agency_parent_scope_guard"
BEFORE UPDATE OF "centerId" ON "Classroom"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_classroom_parent_scope();

DROP TRIGGER IF EXISTS "AgencyRemittanceAllocation_scope_guard" ON "AgencyRemittanceAllocation";
CREATE TRIGGER "AgencyRemittanceAllocation_scope_guard"
BEFORE INSERT OR UPDATE ON "AgencyRemittanceAllocation"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_remittance_allocation_scope();

DROP TRIGGER IF EXISTS "AgencyLedgerAdjustment_scope_guard" ON "AgencyLedgerAdjustment";
CREATE TRIGGER "AgencyLedgerAdjustment_scope_guard"
BEFORE INSERT OR UPDATE ON "AgencyLedgerAdjustment"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_ledger_adjustment_scope();

DROP TRIGGER IF EXISTS "AgencyLedgerEntry_reconciliation_scope_guard" ON "AgencyLedgerEntry";
CREATE TRIGGER "AgencyLedgerEntry_reconciliation_scope_guard"
BEFORE INSERT OR UPDATE OF "agencyLedgerAccountId", "claimId", "remittanceId", "remittanceBatchId", "adjustmentId" ON "AgencyLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_ledger_entry_reconciliation_scope();

DROP TRIGGER IF EXISTS "AgencyLedgerEntry_exact_provenance_guard" ON "AgencyLedgerEntry";
CREATE CONSTRAINT TRIGGER "AgencyLedgerEntry_exact_provenance_guard"
AFTER INSERT OR UPDATE ON "AgencyLedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_ledger_entry_provenance();

-- A newly posted controlled claim receivable must snapshot the program's exact
-- accounting mapping at posting time. Historical entries are deliberately not
-- compared with today's mutable program mapping when running-balance updates
-- revisit them; their stored snapshots remain immutable instead.
CREATE OR REPLACE FUNCTION public.enforce_controlled_claim_approval_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    reconciliation_enabled BOOLEAN;
    receivable_gl_code TEXT;
    cost_center_code TEXT;
BEGIN
    IF NEW.type <> 'claim_approved' THEN
        RETURN NEW;
    END IF;

    SELECT center."agencyReconciliationEnabled", program."receivableGlCode", program."costCenterCode"
    INTO reconciliation_enabled, receivable_gl_code, cost_center_code
    FROM public."SubsidyClaim" claim
    JOIN public."AgencyProgram" program
      ON program.id = claim."agencyProgramId"
     AND program."centerId" = claim."centerId"
    JOIN public."Center" center ON center.id = claim."centerId"
    WHERE claim.id = NEW."claimId";

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agency claim approval snapshot requires an exact school and program source';
    END IF;

    IF reconciliation_enabled AND (
        NULLIF(BTRIM(receivable_gl_code), '') IS NULL
        OR NULLIF(BTRIM(cost_center_code), '') IS NULL
        OR NEW."glCodeSnapshot" IS DISTINCT FROM receivable_gl_code
        OR NEW."costCenterCodeSnapshot" IS DISTINCT FROM cost_center_code
    ) THEN
        RAISE EXCEPTION 'Controlled claim approval snapshots must match the active program accounting mapping';
    END IF;

    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_controlled_claim_approval_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "AgencyLedgerEntry_claim_approval_snapshot_guard" ON "AgencyLedgerEntry";
CREATE TRIGGER "AgencyLedgerEntry_claim_approval_snapshot_guard"
BEFORE INSERT ON "AgencyLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.enforce_controlled_claim_approval_snapshot();

-- Once an approval has become financial history, its source evidence is as
-- immutable as the resulting ledger entry. paidCents and status remain mutable
-- only because remittance posting/reversal derives them; deferred material
-- checks below prove those two fields from the remittance rows at commit.
CREATE OR REPLACE FUNCTION public.protect_subsidy_claim_financial_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    has_financial_history BOOLEAN;
BEGIN
    SELECT OLD.status IN ('approved', 'partially_paid', 'paid')
        OR EXISTS (
            SELECT 1
            FROM public."AgencyLedgerEntry" entry
            WHERE entry."claimId" = OLD.id
              AND entry.type = 'claim_approved'
        )
        OR EXISTS (
            SELECT 1
            FROM public."SubsidyRemittance" remittance
            WHERE remittance."claimId" = OLD.id
        )
    INTO has_financial_history;

    IF NOT has_financial_history THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Approved subsidy claim history is immutable; use remittance or adjustment reversals';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW."centerId" IS DISTINCT FROM OLD."centerId"
       OR NEW."agencyProgramId" IS DISTINCT FROM OLD."agencyProgramId"
       OR NEW."authorizationId" IS DISTINCT FROM OLD."authorizationId"
       OR NEW.number IS DISTINCT FROM OLD.number
       OR NEW."servicePeriodStart" IS DISTINCT FROM OLD."servicePeriodStart"
       OR NEW."servicePeriodEnd" IS DISTINCT FROM OLD."servicePeriodEnd"
       OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
       OR NEW."claimedCents" IS DISTINCT FROM OLD."claimedCents"
       OR NEW."approvedCents" IS DISTINCT FROM OLD."approvedCents"
       OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt"
       OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
       OR NEW."externalReference" IS DISTINCT FROM OLD."externalReference"
       OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Approved subsidy claim source facts are immutable; use a compensating financial correction';
    END IF;

    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_subsidy_claim_line_financial_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    old_claim_locked BOOLEAN := FALSE;
    new_claim_locked BOOLEAN := FALSE;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public."SubsidyClaim" claim
            WHERE claim.id = OLD."claimId"
              AND (
                  claim.status IN ('approved', 'partially_paid', 'paid')
                  OR EXISTS (
                      SELECT 1
                      FROM public."AgencyLedgerEntry" entry
                      WHERE entry."claimId" = claim.id
                        AND entry.type = 'claim_approved'
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public."SubsidyRemittance" remittance
                      WHERE remittance."claimId" = claim.id
                  )
              )
        ) INTO old_claim_locked;
    END IF;

    IF TG_OP <> 'DELETE' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public."SubsidyClaim" claim
            WHERE claim.id = NEW."claimId"
              AND (
                  claim.status IN ('approved', 'partially_paid', 'paid')
                  OR EXISTS (
                      SELECT 1
                      FROM public."AgencyLedgerEntry" entry
                      WHERE entry."claimId" = claim.id
                        AND entry.type = 'claim_approved'
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public."SubsidyRemittance" remittance
                      WHERE remittance."claimId" = claim.id
                  )
              )
        ) INTO new_claim_locked;
    END IF;

    IF old_claim_locked OR new_claim_locked THEN
        RAISE EXCEPTION 'Approved subsidy claim lines are immutable financial source evidence';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.assert_subsidy_claim_financial_state(target_claim_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    claim_row public."SubsidyClaim"%ROWTYPE;
    active_remittance_cents BIGINT;
    remittance_count BIGINT;
    claim_ledger_entry_count BIGINT;
    approval_entry_count BIGINT;
    exact_approval_entry_count BIGINT;
    reconciliation_enabled BOOLEAN;
BEGIN
    SELECT claim.*
    INTO claim_row
    FROM public."SubsidyClaim" claim
    WHERE claim.id = target_claim_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT center."agencyReconciliationEnabled"
    INTO reconciliation_enabled
    FROM public."Center" center
    WHERE center.id = claim_row."centerId";

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subsidy claim financial state is missing its school';
    END IF;

    SELECT
        COALESCE(SUM(remittance."amountCents"::bigint) FILTER (WHERE remittance."reversedAt" IS NULL), 0),
        COUNT(*)
    INTO active_remittance_cents, remittance_count
    FROM public."SubsidyRemittance" remittance
    WHERE remittance."claimId" = claim_row.id;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE entry.type = 'claim_approved'),
        COUNT(*) FILTER (WHERE
            entry.type = 'claim_approved'
            AND entry."sourceSystem" IS NOT DISTINCT FROM 'subsidy_agency'
            AND entry."externalId" IS NOT DISTINCT FROM 'claim-approved:' || claim_row.id
            AND entry."remittanceId" IS NULL
            AND entry."remittanceBatchId" IS NULL
            AND entry."adjustmentId" IS NULL
            AND entry."amountCents" IS NOT DISTINCT FROM claim_row."approvedCents"
            AND entry."effectiveAt" IS NOT DISTINCT FROM COALESCE(claim_row."approvedAt", claim_row."createdAt")
            AND entry."externalReference" IS NOT DISTINCT FROM claim_row."externalReference"
        )
    INTO claim_ledger_entry_count, approval_entry_count, exact_approval_entry_count
    FROM public."AgencyLedgerEntry" entry
    WHERE entry."claimId" = claim_row.id;

    IF claim_row.status IN ('approved', 'partially_paid', 'paid') THEN
        IF claim_row."approvedCents" IS NULL
           OR claim_row."approvedCents" <= 0
           OR claim_row."approvedCents" > claim_row."claimedCents"
           OR COALESCE(claim_row."approvedAt", claim_row."createdAt") >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
           OR active_remittance_cents < 0
           OR active_remittance_cents > claim_row."approvedCents"::bigint
           OR claim_row."paidCents"::bigint <> active_remittance_cents
           OR ((reconciliation_enabled OR claim_ledger_entry_count > 0) AND (
               approval_entry_count <> 1
               OR exact_approval_entry_count <> 1
           ))
           OR (active_remittance_cents = 0 AND claim_row.status <> 'approved')
           OR (active_remittance_cents > 0 AND active_remittance_cents < claim_row."approvedCents"::bigint AND claim_row.status <> 'partially_paid')
           OR (active_remittance_cents = claim_row."approvedCents"::bigint AND claim_row.status <> 'paid') THEN
            RAISE EXCEPTION 'Subsidy claim financial state conflicts with its exact approval or remittance evidence';
        END IF;
    ELSIF COALESCE(claim_row."approvedCents", 0) <> 0
       OR claim_row."paidCents" <> 0
       OR remittance_count <> 0
       OR claim_ledger_entry_count <> 0 THEN
        RAISE EXCEPTION 'A nonfinancial subsidy claim cannot retain approval or remittance postings';
    END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_subsidy_claim_financial_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    PERFORM public.assert_subsidy_claim_financial_state(NEW.id);
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_subsidy_remittance_claim_financial_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    candidate_claim_id TEXT;
BEGIN
    FOR candidate_claim_id IN
        SELECT DISTINCT value
        FROM (VALUES (CASE WHEN TG_OP <> 'INSERT' THEN OLD."claimId" END), (CASE WHEN TG_OP <> 'DELETE' THEN NEW."claimId" END)) candidates(value)
        WHERE value IS NOT NULL
    LOOP
        PERFORM public.assert_subsidy_claim_financial_state(candidate_claim_id);
    END LOOP;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.protect_subsidy_claim_financial_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_subsidy_claim_line_financial_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_subsidy_claim_financial_state(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_subsidy_claim_financial_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_subsidy_remittance_claim_financial_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "SubsidyClaim_immutable_financial_source_guard" ON "SubsidyClaim";
CREATE TRIGGER "SubsidyClaim_immutable_financial_source_guard"
BEFORE UPDATE OR DELETE ON "SubsidyClaim"
FOR EACH ROW EXECUTE FUNCTION public.protect_subsidy_claim_financial_source();

DROP TRIGGER IF EXISTS "SubsidyClaimLine_immutable_financial_source_guard" ON "SubsidyClaimLine";
CREATE TRIGGER "SubsidyClaimLine_immutable_financial_source_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "SubsidyClaimLine"
FOR EACH ROW EXECUTE FUNCTION public.protect_subsidy_claim_line_financial_source();

DROP TRIGGER IF EXISTS "SubsidyClaim_financial_state_guard" ON "SubsidyClaim";
CREATE CONSTRAINT TRIGGER "SubsidyClaim_financial_state_guard"
AFTER INSERT OR UPDATE ON "SubsidyClaim"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_subsidy_claim_financial_state();

DROP TRIGGER IF EXISTS "SubsidyRemittance_claim_financial_state_guard" ON "SubsidyRemittance";
CREATE CONSTRAINT TRIGGER "SubsidyRemittance_claim_financial_state_guard"
AFTER INSERT OR UPDATE OR DELETE ON "SubsidyRemittance"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_subsidy_remittance_claim_financial_state();

-- This deferred guard is the database-side release/rollback safety net. An
-- activated school cannot commit a direct remittance that bypasses a reviewed
-- allocation, even if an older application revision is temporarily running.
CREATE OR REPLACE FUNCTION public.enforce_activated_agency_remittance_control()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    target_remittance_id TEXT;
    target_claim_id TEXT;
    target_amount_cents INTEGER;
    target_paid_at TIMESTAMP(3);
    target_reversed_at TIMESTAMP(3);
    target_reversed_by_id TEXT;
    claim_center_id TEXT;
    claim_program_id TEXT;
    reconciliation_enabled BOOLEAN;
    controlled_record BOOLEAN;
    has_allocation_record BOOLEAN;
BEGIN
    target_remittance_id := NEW.id;
    SELECT remittance."claimId", remittance."amountCents", remittance."paidAt", remittance."reversedAt", remittance."reversedById", claim."centerId", claim."agencyProgramId", center."agencyReconciliationEnabled"
    INTO target_claim_id, target_amount_cents, target_paid_at, target_reversed_at, target_reversed_by_id, claim_center_id, claim_program_id, reconciliation_enabled
    FROM public."SubsidyRemittance" remittance
    JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
    JOIN public."Center" center ON center.id = claim."centerId"
    WHERE remittance.id = target_remittance_id;

    IF target_claim_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF target_paid_at >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
       OR target_reversed_at >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day' THEN
        RAISE EXCEPTION 'Agency remittance receipt or reversal cannot be future-dated';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public."AgencyRemittanceAllocation" allocation
        WHERE allocation."remittanceId" = target_remittance_id
    ) INTO has_allocation_record;

    SELECT reconciliation_enabled OR EXISTS (
        SELECT 1
        FROM public."AgencyRemittanceAllocation" allocation
        WHERE allocation."remittanceId" = target_remittance_id
          AND allocation."idempotencyKey" NOT LIKE 'legacy-allocation:%'
    ) INTO controlled_record;

    IF (reconciliation_enabled OR has_allocation_record) AND NOT EXISTS (
        SELECT 1
        FROM public."AgencyRemittanceAllocation" allocation
        JOIN public."AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
        WHERE allocation."remittanceId" = target_remittance_id
          AND allocation."claimId" = target_claim_id
          AND allocation."amountCents" = target_amount_cents
          AND batch."centerId" = claim_center_id
          AND batch."agencyProgramId" = claim_program_id
           AND (
               (target_reversed_at IS NULL AND allocation.status = 'posted')
               OR (
                   target_reversed_at IS NOT NULL
                   AND allocation.status = 'reversed'
                   AND (
                       NOT controlled_record
                       OR target_reversed_by_id IS DISTINCT FROM batch."enteredById"
                   )
               )
           )
    ) THEN
        RAISE EXCEPTION 'Activated agency reconciliation requires a matching reviewed batch allocation';
    END IF;

    IF (reconciliation_enabled OR has_allocation_record) AND NOT EXISTS (
        SELECT 1
        FROM public."AgencyLedgerEntry" receipt
        JOIN public."AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = target_remittance_id
        WHERE receipt."remittanceId" = target_remittance_id
          AND receipt."claimId" = target_claim_id
          AND receipt."remittanceBatchId" = allocation."batchId"
          AND receipt.type = 'remittance_received'
          AND receipt."sourceSystem" = 'subsidy_agency'
          AND receipt."externalId" = 'remittance:' || target_remittance_id
    ) THEN
        RAISE EXCEPTION 'Controlled agency remittance is missing its exact receipt ledger provenance';
    END IF;

    IF (reconciliation_enabled OR has_allocation_record) AND target_reversed_at IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public."AgencyLedgerEntry" reversal
        JOIN public."AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = target_remittance_id
        WHERE reversal."remittanceId" = target_remittance_id
          AND reversal."claimId" = target_claim_id
          AND reversal."remittanceBatchId" = allocation."batchId"
          AND reversal.type = 'remittance_reversal'
          AND reversal."sourceSystem" = 'subsidy_agency'
          AND reversal."externalId" = 'remittance-reversal:' || target_remittance_id
    ) THEN
        RAISE EXCEPTION 'Controlled agency remittance is missing its exact reversal ledger provenance';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_activated_agency_allocation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    candidate_remittance_id TEXT;
    target_claim_id TEXT;
    target_amount_cents INTEGER;
    target_reversed_at TIMESTAMP(3);
    claim_center_id TEXT;
    claim_program_id TEXT;
    reconciliation_enabled BOOLEAN;
BEGIN
    FOR candidate_remittance_id IN
        SELECT DISTINCT value
        FROM (VALUES (CASE WHEN TG_OP <> 'INSERT' THEN OLD."remittanceId" END), (CASE WHEN TG_OP <> 'DELETE' THEN NEW."remittanceId" END)) candidates(value)
        WHERE value IS NOT NULL
    LOOP
        SELECT remittance."claimId", remittance."amountCents", remittance."reversedAt", claim."centerId", claim."agencyProgramId", center."agencyReconciliationEnabled"
        INTO target_claim_id, target_amount_cents, target_reversed_at, claim_center_id, claim_program_id, reconciliation_enabled
        FROM public."SubsidyRemittance" remittance
        JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        JOIN public."Center" center ON center.id = claim."centerId"
        WHERE remittance.id = candidate_remittance_id;

        IF NOT EXISTS (
            SELECT 1
            FROM public."AgencyRemittanceAllocation" allocation
            JOIN public."AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
            WHERE allocation."remittanceId" = candidate_remittance_id
              AND allocation."claimId" = target_claim_id
              AND allocation."amountCents" = target_amount_cents
              AND batch."centerId" = claim_center_id
              AND batch."agencyProgramId" = claim_program_id
              AND (
                  (target_reversed_at IS NULL AND allocation.status = 'posted')
                  OR (target_reversed_at IS NOT NULL AND allocation.status = 'reversed')
              )
        ) THEN
            RAISE EXCEPTION 'Activated agency reconciliation allocation cannot be removed or detached from its remittance';
        END IF;
    END LOOP;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$function$;

-- A school may stay on the baseline direct-remittance flow after the additive
-- schema ships. Immediately before that school is explicitly activated, adopt
-- only those exact source records into legacy compatibility batches. No reviewer
-- or approval is inferred: the legacy markers and NULL review fields remain
-- visible, while the original receipt/reversal actors and snapshots are kept.
CREATE OR REPLACE FUNCTION public.assert_agency_remittance_batch_material_state(target_batch_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    batch_row public."AgencyRemittanceBatch"%ROWTYPE;
    posted_or_reversed_cents BIGINT;
    pending_cents BIGINT;
    pending_count BIGINT;
    posted_count BIGINT;
    reversed_count BIGINT;
    rejected_count BIGINT;
    allocation_count BIGINT;
    initial_allocated_cents BIGINT;
    initial_unapplied_cents BIGINT;
    late_allocation_count BIGINT;
    late_allocation_cents BIGINT;
    original_entry_count BIGINT;
    original_entry_cents BIGINT;
    release_entry_count BIGINT;
    release_entry_cents BIGINT;
    reversal_entry_count BIGINT;
    reversal_entry_cents BIGINT;
BEGIN
    SELECT batch.*
    INTO batch_row
    FROM public."AgencyRemittanceBatch" batch
    WHERE batch.id = target_batch_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT
        COALESCE(SUM(allocation."amountCents"::bigint) FILTER (WHERE allocation.status IN ('posted', 'reversed')), 0),
        COALESCE(SUM(allocation."amountCents"::bigint) FILTER (WHERE allocation.status = 'pending_review'), 0),
        COUNT(*) FILTER (WHERE allocation.status = 'pending_review'),
        COUNT(*) FILTER (WHERE allocation.status = 'posted'),
        COUNT(*) FILTER (WHERE allocation.status = 'reversed'),
        COUNT(*) FILTER (WHERE allocation.status = 'rejected'),
        COUNT(*)
    INTO posted_or_reversed_cents, pending_cents, pending_count, posted_count, reversed_count, rejected_count, allocation_count
    FROM public."AgencyRemittanceAllocation" allocation
    WHERE allocation."batchId" = target_batch_id;

    IF EXISTS (
        SELECT 1
        FROM public."AgencyRemittanceAllocation" allocation
        WHERE allocation."batchId" = batch_row.id
          AND allocation.status = 'rejected'
          AND NULLIF(BTRIM(allocation."reviewNotes"), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'A rejected agency remittance allocation requires review notes';
    END IF;

    IF posted_or_reversed_cents <> batch_row."allocatedCents"::bigint THEN
        RAISE EXCEPTION 'Agency remittance batch allocated total conflicts with its exact allocation rows';
    END IF;

    IF reversed_count <> 0
       AND batch_row.status <> 'reversed'
       AND batch_row."idempotencyKey" NOT LIKE 'legacy:%' THEN
        RAISE EXCEPTION 'A non-reversed controlled batch contains reversed allocations';
    END IF;

    IF batch_row.status = 'pending_review' THEN
        IF batch_row."reviewedAt" IS NULL THEN
            IF batch_row."allocatedCents" <> 0
               OR batch_row."unappliedCents" <> 0
               OR posted_count <> 0
               OR reversed_count <> 0
               OR rejected_count <> 0
               OR pending_cents > batch_row."totalCents"::bigint THEN
                RAISE EXCEPTION 'An unreviewed agency remittance batch has invalid allocation state';
            END IF;
        ELSIF pending_count = 0 THEN
            RAISE EXCEPTION 'A reviewed agency remittance batch can be pending only for an exact pending allocation';
        END IF;
    ELSIF batch_row.status = 'rejected' THEN
        IF pending_count <> 0
           OR posted_count <> 0
           OR reversed_count <> 0
           OR rejected_count <> allocation_count
           OR NULLIF(BTRIM(batch_row."reviewNotes"), '') IS NULL THEN
            RAISE EXCEPTION 'A rejected agency remittance batch must contain only rejected allocations';
        END IF;
    ELSIF batch_row.status = 'reversed' THEN
        IF pending_count <> 0 OR posted_count <> 0 OR reversed_count + rejected_count <> allocation_count THEN
            RAISE EXCEPTION 'A reversed agency remittance batch has active or pending allocations';
        END IF;
    ELSE
        IF pending_count <> 0 THEN
            RAISE EXCEPTION 'A non-pending agency remittance batch still has pending allocations';
        END IF;
        IF batch_row.status = 'unmatched' AND batch_row."allocatedCents" <> 0 THEN
            RAISE EXCEPTION 'An unmatched agency remittance batch has allocated cash';
        ELSIF batch_row.status = 'partially_allocated' AND (
            batch_row."allocatedCents" <= 0 OR batch_row."allocatedCents" >= batch_row."totalCents"
        ) THEN
            RAISE EXCEPTION 'A partially allocated agency remittance batch has invalid totals';
        ELSIF batch_row.status = 'reconciled' AND batch_row."allocatedCents" <> batch_row."totalCents" THEN
            RAISE EXCEPTION 'A reconciled agency remittance batch is not fully allocated';
        END IF;
    END IF;

    IF batch_row.status NOT IN ('pending_review', 'rejected')
       AND batch_row."allocatedCents"::bigint + batch_row."unappliedCents"::bigint <> batch_row."totalCents"::bigint THEN
        RAISE EXCEPTION 'Agency remittance batch unapplied total conflicts with its reviewed allocation rows';
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE entry.type = 'unapplied_cash'),
        COALESCE(SUM(entry."amountCents"::bigint) FILTER (WHERE entry.type = 'unapplied_cash'), 0),
        COUNT(*) FILTER (WHERE entry.type = 'unapplied_cash_allocation'),
        COALESCE(SUM(entry."amountCents"::bigint) FILTER (WHERE entry.type = 'unapplied_cash_allocation'), 0),
        COUNT(*) FILTER (WHERE entry.type = 'unapplied_cash_reversal'),
        COALESCE(SUM(entry."amountCents"::bigint) FILTER (WHERE entry.type = 'unapplied_cash_reversal'), 0)
    INTO original_entry_count, original_entry_cents, release_entry_count, release_entry_cents, reversal_entry_count, reversal_entry_cents
    FROM public."AgencyLedgerEntry" entry
    WHERE entry."remittanceBatchId" = batch_row.id
      AND entry."sourceSystem" = 'subsidy_agency'
      AND entry.type IN ('unapplied_cash', 'unapplied_cash_allocation', 'unapplied_cash_reversal');

    IF batch_row."reviewedAt" IS NULL THEN
        IF original_entry_count <> 0 OR release_entry_count <> 0 OR reversal_entry_count <> 0 THEN
            RAISE EXCEPTION 'An unreviewed or legacy compatibility batch cannot carry unapplied-cash ledger events';
        END IF;
    ELSIF batch_row.status = 'rejected' THEN
        IF original_entry_count <> 0 OR release_entry_count <> 0 OR reversal_entry_count <> 0 THEN
            RAISE EXCEPTION 'A rejected agency remittance batch cannot carry unapplied-cash ledger events';
        END IF;
    ELSE
        SELECT
            COALESCE(SUM(allocation."amountCents"::bigint) FILTER (
                WHERE allocation.status IN ('posted', 'reversed')
                  AND allocation."createdAt" <= batch_row."reviewedAt"
            ), 0),
            COUNT(*) FILTER (
                WHERE allocation.status IN ('posted', 'reversed')
                  AND allocation."createdAt" > batch_row."reviewedAt"
            ),
            COALESCE(SUM(allocation."amountCents"::bigint) FILTER (
                WHERE allocation.status IN ('posted', 'reversed')
                  AND allocation."createdAt" > batch_row."reviewedAt"
            ), 0)
        INTO initial_allocated_cents, late_allocation_count, late_allocation_cents
        FROM public."AgencyRemittanceAllocation" allocation
        WHERE allocation."batchId" = batch_row.id;

        initial_unapplied_cents := batch_row."totalCents"::bigint - initial_allocated_cents;
        IF initial_unapplied_cents < 0
           OR pending_cents > batch_row."unappliedCents"::bigint
           OR (initial_unapplied_cents = 0 AND original_entry_count <> 0)
           OR (initial_unapplied_cents > 0 AND (
               original_entry_count <> 1
               OR original_entry_cents <> -initial_unapplied_cents
           ))
           OR release_entry_count <> late_allocation_count
           OR release_entry_cents <> late_allocation_cents
           OR original_entry_cents + release_entry_cents <> -batch_row."unappliedCents"::bigint
           OR (batch_row.status = 'reversed' AND batch_row."unappliedCents" > 0 AND (
               reversal_entry_count <> 1
               OR reversal_entry_cents <> batch_row."unappliedCents"::bigint
           ))
           OR ((batch_row.status <> 'reversed' OR batch_row."unappliedCents" = 0) AND reversal_entry_count <> 0) THEN
            RAISE EXCEPTION 'Agency remittance batch unapplied-cash ledger evidence conflicts with its exact material state';
        END IF;
    END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_remittance_batch_material_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    PERFORM public.assert_agency_remittance_batch_material_state(NEW.id);
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_allocation_batch_material_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    candidate_batch_id TEXT;
BEGIN
    FOR candidate_batch_id IN
        SELECT DISTINCT value
        FROM (VALUES (CASE WHEN TG_OP <> 'INSERT' THEN OLD."batchId" END), (CASE WHEN TG_OP <> 'DELETE' THEN NEW."batchId" END)) candidates(value)
        WHERE value IS NOT NULL
    LOOP
        PERFORM public.assert_agency_remittance_batch_material_state(candidate_batch_id);
    END LOOP;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.assert_agency_ledger_adjustment_material_state(target_adjustment_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    adjustment_row public."AgencyLedgerAdjustment"%ROWTYPE;
    linked_entry_count BIGINT;
    original_entry_count BIGINT;
    reversal_entry_count BIGINT;
BEGIN
    SELECT adjustment.*
    INTO adjustment_row
    FROM public."AgencyLedgerAdjustment" adjustment
    WHERE adjustment.id = target_adjustment_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE
            entry."agencyLedgerAccountId" IS NOT DISTINCT FROM adjustment_row."ledgerAccountId"
            AND entry."claimId" IS NOT DISTINCT FROM adjustment_row."claimId"
            AND entry."remittanceId" IS NULL
            AND entry."remittanceBatchId" IS NOT DISTINCT FROM adjustment_row."batchId"
            AND entry.type IS NOT DISTINCT FROM 'adjustment_' || adjustment_row.type
            AND entry."amountCents" IS NOT DISTINCT FROM adjustment_row."amountCents"
            AND entry."effectiveAt" IS NOT DISTINCT FROM adjustment_row."effectiveAt"
            AND entry."externalReference" IS NOT DISTINCT FROM adjustment_row."evidenceReference"
            AND entry."sourceSystem" IS NOT DISTINCT FROM 'subsidy_agency'
            AND entry."externalId" IS NOT DISTINCT FROM 'adjustment:' || adjustment_row.id
            AND entry."glCodeSnapshot" IS NOT DISTINCT FROM adjustment_row."glCodeSnapshot"
            AND entry."costCenterCodeSnapshot" IS NOT DISTINCT FROM adjustment_row."costCenterCodeSnapshot"
        ),
        COUNT(*) FILTER (WHERE
            entry."agencyLedgerAccountId" IS NOT DISTINCT FROM adjustment_row."ledgerAccountId"
            AND entry."claimId" IS NOT DISTINCT FROM adjustment_row."claimId"
            AND entry."remittanceId" IS NULL
            AND entry."remittanceBatchId" IS NOT DISTINCT FROM adjustment_row."batchId"
            AND entry.type = 'adjustment_reversal'
            AND entry."amountCents" IS NOT DISTINCT FROM -adjustment_row."amountCents"
            AND entry."effectiveAt" IS NOT DISTINCT FROM adjustment_row."reversedAt"
            AND entry."externalReference" IS NOT DISTINCT FROM adjustment_row."evidenceReference"
            AND entry."sourceSystem" IS NOT DISTINCT FROM 'subsidy_agency'
            AND entry."externalId" IS NOT DISTINCT FROM 'adjustment-reversal:' || adjustment_row.id
            AND entry."glCodeSnapshot" IS NOT DISTINCT FROM adjustment_row."glCodeSnapshot"
            AND entry."costCenterCodeSnapshot" IS NOT DISTINCT FROM adjustment_row."costCenterCodeSnapshot"
        )
    INTO linked_entry_count, original_entry_count, reversal_entry_count
    FROM public."AgencyLedgerEntry" entry
    WHERE entry."adjustmentId" = adjustment_row.id;

    IF adjustment_row.status IN ('pending_review', 'rejected') THEN
        IF linked_entry_count <> 0 THEN
            RAISE EXCEPTION 'An unposted agency adjustment cannot carry ledger entries';
        END IF;
        IF adjustment_row.status = 'rejected'
           AND NULLIF(BTRIM(adjustment_row."reviewNotes"), '') IS NULL THEN
            RAISE EXCEPTION 'A rejected agency adjustment requires review notes';
        END IF;
    ELSIF adjustment_row.status = 'posted' THEN
        IF linked_entry_count <> 1 OR original_entry_count <> 1 OR reversal_entry_count <> 0 THEN
            RAISE EXCEPTION 'A posted agency adjustment requires exactly one matching original ledger entry';
        END IF;
    ELSIF adjustment_row.status = 'reversed' THEN
        IF linked_entry_count <> 2 OR original_entry_count <> 1 OR reversal_entry_count <> 1 THEN
            RAISE EXCEPTION 'A reversed agency adjustment requires exact original and reversal ledger entries';
        END IF;
    END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_ledger_adjustment_material_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    PERFORM public.assert_agency_ledger_adjustment_material_state(NEW.id);
    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.assert_agency_remittance_batch_material_state(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_remittance_batch_material_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_allocation_batch_material_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_agency_ledger_adjustment_material_state(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_ledger_adjustment_material_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "AgencyRemittanceBatch_material_state_guard" ON "AgencyRemittanceBatch";
CREATE CONSTRAINT TRIGGER "AgencyRemittanceBatch_material_state_guard"
AFTER INSERT OR UPDATE ON "AgencyRemittanceBatch"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_remittance_batch_material_state();

DROP TRIGGER IF EXISTS "AgencyRemittanceAllocation_batch_material_state_guard" ON "AgencyRemittanceAllocation";
CREATE CONSTRAINT TRIGGER "AgencyRemittanceAllocation_batch_material_state_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgencyRemittanceAllocation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_allocation_batch_material_state();

DROP TRIGGER IF EXISTS "AgencyLedgerAdjustment_material_state_guard" ON "AgencyLedgerAdjustment";
CREATE CONSTRAINT TRIGGER "AgencyLedgerAdjustment_material_state_guard"
AFTER INSERT OR UPDATE ON "AgencyLedgerAdjustment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_ledger_adjustment_material_state();

-- Derived balances remain mutable only so the application can recalculate them
-- after a backdated event. At commit they must exactly equal the immutable entry
-- stream in the same deterministic order used by exports and reconciliation.
CREATE OR REPLACE FUNCTION public.assert_agency_ledger_account_balances(target_account_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    stored_account_balance INTEGER;
    calculated_account_balance BIGINT;
BEGIN
    SELECT account."balanceCents"
    INTO stored_account_balance
    FROM public."AgencyLedgerAccount" account
    WHERE account.id = target_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(entry."amountCents"::bigint), 0)
    INTO calculated_account_balance
    FROM public."AgencyLedgerEntry" entry
    WHERE entry."agencyLedgerAccountId" = target_account_id;

    IF calculated_account_balance NOT BETWEEN -2147483648 AND 2147483647
       OR stored_account_balance::bigint <> calculated_account_balance THEN
        RAISE EXCEPTION 'Agency ledger account balance conflicts with its exact entry total or exceeds INTEGER range';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                entry."balanceAfterCents"::bigint AS stored_running_balance,
                SUM(entry."amountCents"::bigint) OVER (
                    PARTITION BY entry."agencyLedgerAccountId"
                    ORDER BY entry."effectiveAt", entry."createdAt", entry.id
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS calculated_running_balance
            FROM public."AgencyLedgerEntry" entry
            WHERE entry."agencyLedgerAccountId" = target_account_id
        ) running
        WHERE running.calculated_running_balance NOT BETWEEN -2147483648 AND 2147483647
           OR running.stored_running_balance <> running.calculated_running_balance
    ) THEN
        RAISE EXCEPTION 'Agency ledger running balances conflict with deterministic chronological entry order or exceed INTEGER range';
    END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_ledger_account_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    PERFORM public.assert_agency_ledger_account_balances(CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_ledger_entry_account_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    candidate_account_id TEXT;
BEGIN
    FOR candidate_account_id IN
        SELECT DISTINCT value
        FROM (VALUES
            (CASE WHEN TG_OP <> 'INSERT' THEN OLD."agencyLedgerAccountId" END),
            (CASE WHEN TG_OP <> 'DELETE' THEN NEW."agencyLedgerAccountId" END)
        ) candidates(value)
        WHERE value IS NOT NULL
    LOOP
        PERFORM public.assert_agency_ledger_account_balances(candidate_account_id);
    END LOOP;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.assert_agency_ledger_account_balances(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_ledger_account_balances() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_ledger_entry_account_balances() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "AgencyLedgerAccount_exact_balance_guard" ON "AgencyLedgerAccount";
CREATE CONSTRAINT TRIGGER "AgencyLedgerAccount_exact_balance_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgencyLedgerAccount"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_ledger_account_balances();

DROP TRIGGER IF EXISTS "AgencyLedgerEntry_exact_balance_guard" ON "AgencyLedgerEntry";
CREATE CONSTRAINT TRIGGER "AgencyLedgerEntry_exact_balance_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgencyLedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_ledger_entry_account_balances();

CREATE OR REPLACE FUNCTION public.adopt_pre_activation_agency_remittances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET timezone = 'UTC'
AS $function$
DECLARE
    adoption_remittance_ids TEXT[];
BEGIN
    IF NOT NEW."agencyReconciliationEnabled" OR OLD."agencyReconciliationEnabled" THEN
        RETURN NEW;
    END IF;

    SELECT ARRAY_AGG(remittance.id ORDER BY remittance.id)
    INTO adoption_remittance_ids
    FROM public."SubsidyRemittance" remittance
    JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
    WHERE claim."centerId" = NEW.id
      AND NOT EXISTS (
          SELECT 1
          FROM public."AgencyRemittanceAllocation" allocation
          WHERE allocation."remittanceId" = remittance.id
      );

    IF adoption_remittance_ids IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."SubsidyRemittance" remittance
        LEFT JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        LEFT JOIN public."AgencyLedgerEntry" receipt
          ON receipt."sourceSystem" = 'subsidy_agency'
         AND receipt."externalId" = 'remittance:' || remittance.id
        LEFT JOIN public."AgencyLedgerEntry" reversal
          ON reversal."sourceSystem" = 'subsidy_agency'
         AND reversal."externalId" = 'remittance-reversal:' || remittance.id
        WHERE remittance.id = ANY(adoption_remittance_ids)
          AND (
              claim.id IS NULL
              OR claim."centerId" <> NEW.id
              OR NULLIF(BTRIM(remittance."paymentMethod"), '') IS NULL
              OR LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) NOT IN ('ach', 'check', 'agency_portal', 'other')
              OR NULLIF(BTRIM(remittance."externalReference"), '') IS NULL
              OR NULLIF(BTRIM(remittance."enteredById"), '') IS NULL
              OR remittance."paidAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
              OR remittance."reversedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
              OR remittance."reversedAt" < remittance."paidAt"
              OR (remittance."reversedAt" IS NULL AND (remittance."reversedById" IS NOT NULL OR remittance."reversalReason" IS NOT NULL))
              OR (remittance."reversedAt" IS NOT NULL AND (
                  NULLIF(BTRIM(remittance."reversedById"), '') IS NULL
                  OR NULLIF(BTRIM(remittance."reversalReason"), '') IS NULL
              ))
              OR receipt.id IS NULL
              OR receipt."agencyLedgerAccountId" IS DISTINCT FROM (
                  SELECT account.id
                  FROM public."AgencyLedgerAccount" account
                  WHERE account."centerId" = claim."centerId"
                    AND account."agencyProgramId" = claim."agencyProgramId"
              )
              OR receipt."claimId" IS DISTINCT FROM remittance."claimId"
              OR receipt."remittanceId" IS DISTINCT FROM remittance.id
              OR receipt."remittanceBatchId" IS NOT NULL
              OR receipt."adjustmentId" IS NOT NULL
              OR receipt.type <> 'remittance_received'
              OR receipt."amountCents" <> -remittance."amountCents"
              OR receipt."effectiveAt" IS DISTINCT FROM remittance."paidAt"
              OR receipt."externalReference" IS DISTINCT FROM remittance."externalReference"
              OR (remittance."reversedAt" IS NULL AND reversal.id IS NOT NULL)
              OR (remittance."reversedAt" IS NOT NULL AND (
                  reversal.id IS NULL
                  OR reversal."agencyLedgerAccountId" IS DISTINCT FROM receipt."agencyLedgerAccountId"
                  OR reversal."claimId" IS DISTINCT FROM remittance."claimId"
                  OR reversal."remittanceId" IS DISTINCT FROM remittance.id
                  OR reversal."remittanceBatchId" IS NOT NULL
                  OR reversal."adjustmentId" IS NOT NULL
                  OR reversal.type <> 'remittance_reversal'
                  OR reversal."amountCents" <> remittance."amountCents"
                  OR reversal."effectiveAt" IS DISTINCT FROM remittance."reversedAt"
                  OR reversal."externalReference" IS DISTINCT FROM remittance."externalReference"
                  OR reversal."glCodeSnapshot" IS DISTINCT FROM receipt."glCodeSnapshot"
                  OR reversal."costCenterCodeSnapshot" IS DISTINCT FROM receipt."costCenterCodeSnapshot"
              ))
          )
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: baseline remittance evidence is incomplete or conflicting';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."AgencyLedgerEntry" entry
        WHERE entry."remittanceId" = ANY(adoption_remittance_ids)
          AND entry.type NOT IN ('remittance_received', 'remittance_reversal')
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: a baseline remittance has unsupported ledger provenance';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."SubsidyRemittance" remittance
        JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        WHERE remittance.id = ANY(adoption_remittance_ids)
          AND remittance."reversedAt" IS NULL
        GROUP BY
            claim."centerId",
            claim."agencyProgramId",
            LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')),
            UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')),
            remittance."claimId"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: duplicate active baseline remittances exist for one derived batch and claim';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."SubsidyRemittance" remittance
        JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        JOIN public."AgencyLedgerEntry" receipt
          ON receipt."sourceSystem" = 'subsidy_agency'
         AND receipt."externalId" = 'remittance:' || remittance.id
        WHERE remittance.id = ANY(adoption_remittance_ids)
        GROUP BY
            claim."centerId",
            claim."agencyProgramId",
            LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')),
            UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')),
            CASE
                WHEN remittance."reversedAt" IS NULL THEN 'active'
                ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
            END
        HAVING SUM(remittance."amountCents"::bigint) NOT BETWEEN 1 AND 2147483647
            OR COUNT(DISTINCT remittance."paidAt") <> 1
            OR COUNT(DISTINCT remittance."enteredById") <> 1
            OR COUNT(DISTINCT remittance."externalReference") <> 1
            OR COUNT(DISTINCT remittance."reversedAt") > 1
            OR COUNT(DISTINCT remittance."reversedById") > 1
            OR COUNT(DISTINCT remittance."reversalReason") > 1
            OR COUNT(DISTINCT (receipt."glCodeSnapshot", receipt."costCenterCodeSnapshot")) <> 1
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: grouped baseline remittances have conflicting batch facts';
    END IF;

    WITH source AS (
        SELECT
            remittance.id AS remittance_id,
            remittance."claimId" AS claim_id,
            claim."centerId" AS center_id,
            claim."agencyProgramId" AS agency_program_id,
            LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) AS normalized_payment_method,
            UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) AS normalized_reference,
            CASE
                WHEN remittance."reversedAt" IS NULL THEN 'active'
                ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
            END AS lifecycle_key,
            remittance."externalReference" AS external_reference,
            remittance."paidAt" AS paid_at,
            remittance."amountCents" AS amount_cents,
            remittance."enteredById" AS entered_by,
            remittance."reversedAt" AS reversed_at,
            remittance."reversedById" AS reversed_by,
            remittance."reversalReason" AS reversal_reason,
            remittance."createdAt" AS created_at,
            receipt."glCodeSnapshot" AS cash_gl_code_snapshot,
            receipt."costCenterCodeSnapshot" AS cost_center_code_snapshot,
            'agency-remittance-batch:' || MD5(
                claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
                LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
                UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':' ||
                CASE
                    WHEN remittance."reversedAt" IS NULL THEN 'active'
                    ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
                END
            ) AS batch_id
        FROM public."SubsidyRemittance" remittance
        JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        JOIN public."AgencyLedgerEntry" receipt
          ON receipt."sourceSystem" = 'subsidy_agency'
         AND receipt."externalId" = 'remittance:' || remittance.id
        WHERE remittance.id = ANY(adoption_remittance_ids)
    ), grouped AS (
        SELECT
            source.batch_id,
            source.center_id,
            source.agency_program_id,
            source.normalized_payment_method,
            source.normalized_reference,
            source.lifecycle_key,
            MIN(source.external_reference) AS display_reference,
            MIN(source.paid_at) AS paid_at,
            SUM(source.amount_cents::bigint)::integer AS total_cents,
            BOOL_AND(source.reversed_at IS NOT NULL) AS is_reversed,
            MIN(source.entered_by) AS entered_by,
            MAX(source.reversed_at) AS reversed_at,
            MIN(source.reversed_by) AS reversed_by,
            MIN(source.reversal_reason) AS reversal_reason,
            MIN(source.created_at) AS created_at,
            MIN(source.cash_gl_code_snapshot) AS cash_gl_code_snapshot,
            MIN(source.cost_center_code_snapshot) AS cost_center_code_snapshot
        FROM source
        GROUP BY source.batch_id, source.center_id, source.agency_program_id, source.normalized_payment_method, source.normalized_reference, source.lifecycle_key
    )
    INSERT INTO public."AgencyRemittanceBatch" (
        "id", "centerId", "agencyProgramId", "externalReference", "referenceKey", "paidAt", "paymentMethod",
        "cashGlCodeSnapshot", "costCenterCodeSnapshot", "totalCents", "allocatedCents", "unappliedCents", "status", "notes", "idempotencyKey",
        "reconciliationFingerprint", "enteredById", "reviewedById", "reviewedAt", "reviewNotes",
        "reversedAt", "reversedById", "reversalReason", "createdAt", "updatedAt"
    )
    SELECT
        grouped.batch_id,
        grouped.center_id,
        grouped.agency_program_id,
        grouped.display_reference,
        grouped.normalized_payment_method || ':' || grouped.normalized_reference,
        grouped.paid_at,
        grouped.normalized_payment_method,
        grouped.cash_gl_code_snapshot,
        grouped.cost_center_code_snapshot,
        grouped.total_cents,
        grouped.total_cents,
        0,
        CASE WHEN grouped.is_reversed THEN 'reversed' ELSE 'reconciled' END,
        'Pre-activation baseline remittance batch adopted at school activation.',
        'legacy:adoption:' || SUBSTRING(grouped.batch_id FROM LENGTH('agency-remittance-batch:') + 1),
        MD5(grouped.center_id || ':' || grouped.agency_program_id || ':' || grouped.total_cents::text || ':' || grouped.lifecycle_key),
        grouped.entered_by,
        NULL,
        NULL,
        'Baseline record adopted without inferring independent review.',
        grouped.reversed_at,
        grouped.reversed_by,
        grouped.reversal_reason,
        grouped.created_at,
        CURRENT_TIMESTAMP
    FROM grouped
    ON CONFLICT ("id") DO NOTHING;

    IF EXISTS (
        WITH source AS (
            SELECT
                remittance."claimId" AS claim_id,
                claim."centerId" AS center_id,
                claim."agencyProgramId" AS agency_program_id,
                LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) AS normalized_payment_method,
                UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) AS normalized_reference,
                CASE
                    WHEN remittance."reversedAt" IS NULL THEN 'active'
                    ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
                END AS lifecycle_key,
                remittance."externalReference" AS external_reference,
                remittance."paidAt" AS paid_at,
                remittance."amountCents" AS amount_cents,
                remittance."enteredById" AS entered_by,
                remittance."reversedAt" AS reversed_at,
                remittance."reversedById" AS reversed_by,
                remittance."reversalReason" AS reversal_reason,
                receipt."glCodeSnapshot" AS cash_gl_code_snapshot,
                receipt."costCenterCodeSnapshot" AS cost_center_code_snapshot,
                'agency-remittance-batch:' || MD5(
                    claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
                    LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
                    UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':' ||
                    CASE
                        WHEN remittance."reversedAt" IS NULL THEN 'active'
                        ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
                    END
                ) AS batch_id
            FROM public."SubsidyRemittance" remittance
            JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
            JOIN public."AgencyLedgerEntry" receipt
              ON receipt."sourceSystem" = 'subsidy_agency'
             AND receipt."externalId" = 'remittance:' || remittance.id
            WHERE remittance.id = ANY(adoption_remittance_ids)
        ), expected AS (
            SELECT
                source.batch_id,
                source.center_id,
                source.agency_program_id,
                source.normalized_payment_method,
                source.normalized_reference,
                source.lifecycle_key,
                MIN(source.external_reference) AS display_reference,
                MIN(source.paid_at) AS paid_at,
                SUM(source.amount_cents::bigint)::integer AS total_cents,
                BOOL_AND(source.reversed_at IS NOT NULL) AS is_reversed,
                MIN(source.entered_by) AS entered_by,
                MAX(source.reversed_at) AS reversed_at,
                MIN(source.reversed_by) AS reversed_by,
                MIN(source.reversal_reason) AS reversal_reason,
                MIN(source.cash_gl_code_snapshot) AS cash_gl_code_snapshot,
                MIN(source.cost_center_code_snapshot) AS cost_center_code_snapshot
            FROM source
            GROUP BY source.batch_id, source.center_id, source.agency_program_id, source.normalized_payment_method, source.normalized_reference, source.lifecycle_key
        )
        SELECT 1
        FROM expected
        LEFT JOIN public."AgencyRemittanceBatch" batch ON batch.id = expected.batch_id
        WHERE batch.id IS NULL
           OR batch."centerId" <> expected.center_id
           OR batch."agencyProgramId" <> expected.agency_program_id
           OR batch."externalReference" <> expected.display_reference
           OR batch."referenceKey" <> (expected.normalized_payment_method || ':' || expected.normalized_reference)
           OR batch."paidAt" <> expected.paid_at
           OR batch."paymentMethod" <> expected.normalized_payment_method
           OR batch."cashGlCodeSnapshot" IS DISTINCT FROM expected.cash_gl_code_snapshot
           OR batch."costCenterCodeSnapshot" IS DISTINCT FROM expected.cost_center_code_snapshot
           OR batch."totalCents" <> expected.total_cents
           OR batch."allocatedCents" <> expected.total_cents
           OR batch."unappliedCents" <> 0
           OR batch.status <> CASE WHEN expected.is_reversed THEN 'reversed' ELSE 'reconciled' END
           OR batch."idempotencyKey" <> 'legacy:adoption:' || SUBSTRING(expected.batch_id FROM LENGTH('agency-remittance-batch:') + 1)
           OR batch."reconciliationFingerprint" <> MD5(expected.center_id || ':' || expected.agency_program_id || ':' || expected.total_cents::text || ':' || expected.lifecycle_key)
           OR batch."enteredById" <> expected.entered_by
           OR batch."reviewedById" IS NOT NULL
           OR batch."reviewedAt" IS NOT NULL
           OR batch."reversedAt" IS DISTINCT FROM expected.reversed_at
           OR batch."reversedById" IS DISTINCT FROM expected.reversed_by
           OR batch."reversalReason" IS DISTINCT FROM expected.reversal_reason
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: baseline batch adoption conflicted with existing facts';
    END IF;

    WITH source AS (
        SELECT
            remittance.id AS remittance_id,
            remittance."claimId" AS claim_id,
            claim."centerId" AS center_id,
            claim."agencyProgramId" AS agency_program_id,
            remittance."amountCents" AS amount_cents,
            remittance."enteredById" AS entered_by,
            remittance."reversedAt" AS reversed_at,
            remittance."createdAt" AS created_at,
            'agency-remittance-batch:' || MD5(
                claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
                LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
                UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':' ||
                CASE
                    WHEN remittance."reversedAt" IS NULL THEN 'active'
                    ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
                END
            ) AS batch_id
        FROM public."SubsidyRemittance" remittance
        JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        WHERE remittance.id = ANY(adoption_remittance_ids)
    )
    INSERT INTO public."AgencyRemittanceAllocation" (
        "id", "batchId", "claimId", "remittanceId", "amountCents", "status", "notes", "fingerprint", "idempotencyKey",
        "requestedById", "reviewedById", "reviewedAt", "createdAt", "updatedAt"
    )
    SELECT
        'agency-remittance-allocation:' || source.remittance_id,
        source.batch_id,
        source.claim_id,
        source.remittance_id,
        source.amount_cents,
        CASE WHEN source.reversed_at IS NULL THEN 'posted' ELSE 'reversed' END,
        'Pre-activation baseline claim allocation adopted without review inference.',
        MD5(source.batch_id || ':' || source.claim_id || ':' || source.amount_cents::text),
        'legacy-allocation:adoption:' || source.remittance_id,
        source.entered_by,
        NULL,
        NULL,
        source.created_at,
        CURRENT_TIMESTAMP
    FROM source
    ON CONFLICT ("remittanceId") DO NOTHING;

    IF EXISTS (
        SELECT 1
        FROM public."SubsidyRemittance" remittance
        JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        LEFT JOIN public."AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = remittance.id
        WHERE remittance.id = ANY(adoption_remittance_ids)
          AND (
              allocation.id IS NULL
              OR allocation.id <> 'agency-remittance-allocation:' || remittance.id
              OR allocation."batchId" <> 'agency-remittance-batch:' || MD5(
                  claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
                  LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
                  UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':' ||
                  CASE
                      WHEN remittance."reversedAt" IS NULL THEN 'active'
                      ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
                  END
              )
              OR allocation."claimId" <> remittance."claimId"
              OR allocation."amountCents" <> remittance."amountCents"
              OR allocation.status <> CASE WHEN remittance."reversedAt" IS NULL THEN 'posted' ELSE 'reversed' END
              OR allocation."idempotencyKey" <> 'legacy-allocation:adoption:' || remittance.id
              OR allocation."requestedById" <> remittance."enteredById"
              OR allocation."reviewedById" IS NOT NULL
              OR allocation."reviewedAt" IS NOT NULL
          )
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: baseline allocation adoption conflicted with existing facts';
    END IF;

    UPDATE public."AgencyLedgerEntry" entry
    SET "remittanceBatchId" = allocation."batchId"
    FROM public."AgencyRemittanceAllocation" allocation
    WHERE allocation."remittanceId" = entry."remittanceId"
      AND allocation."remittanceId" = ANY(adoption_remittance_ids)
      AND allocation."idempotencyKey" LIKE 'legacy-allocation:adoption:%'
      AND entry."remittanceBatchId" IS NULL;

    IF EXISTS (
        SELECT 1
        FROM public."SubsidyRemittance" remittance
        JOIN public."AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = remittance.id
        JOIN public."AgencyLedgerEntry" receipt
          ON receipt."sourceSystem" = 'subsidy_agency'
         AND receipt."externalId" = 'remittance:' || remittance.id
        LEFT JOIN public."AgencyLedgerEntry" reversal
          ON reversal."sourceSystem" = 'subsidy_agency'
         AND reversal."externalId" = 'remittance-reversal:' || remittance.id
        WHERE remittance.id = ANY(adoption_remittance_ids)
          AND (
              receipt."remittanceBatchId" IS DISTINCT FROM allocation."batchId"
              OR (remittance."reversedAt" IS NOT NULL AND reversal."remittanceBatchId" IS DISTINCT FROM allocation."batchId")
          )
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: baseline ledger adoption did not preserve exact batch provenance';
    END IF;

    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_reconciliation_activation_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."agencyReconciliationEnabled"
           OR NEW."agencyReconciliationActivatedAt" IS NOT NULL
           OR NEW."agencyReconciliationActivatedById" IS NOT NULL
           OR NEW."agencyReconciliationActivationReason" IS NOT NULL THEN
            RAISE EXCEPTION 'A school must be created with agency reconciliation inactive and activated only after readiness validation';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD."agencyReconciliationEnabled" THEN
        IF NOT NEW."agencyReconciliationEnabled" THEN
            RAISE EXCEPTION 'Agency reconciliation activation cannot be disabled after controlled financial history exists';
        END IF;
        IF NEW."agencyReconciliationActivatedAt" IS DISTINCT FROM OLD."agencyReconciliationActivatedAt"
           OR NEW."agencyReconciliationActivatedById" IS DISTINCT FROM OLD."agencyReconciliationActivatedById"
           OR NEW."agencyReconciliationActivationReason" IS DISTINCT FROM OLD."agencyReconciliationActivationReason" THEN
            RAISE EXCEPTION 'Agency reconciliation activation evidence is immutable after activation';
        END IF;
        RETURN NEW;
    END IF;
    IF NOT NEW."agencyReconciliationEnabled" THEN
        IF NEW."agencyReconciliationActivatedAt" IS NOT NULL
           OR NEW."agencyReconciliationActivatedById" IS NOT NULL
           OR NEW."agencyReconciliationActivationReason" IS NOT NULL THEN
            RAISE EXCEPTION 'An inactive school cannot carry agency reconciliation activation evidence';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.status <> 'active' THEN
        RAISE EXCEPTION 'Only an active school can enable agency reconciliation';
    END IF;
    IF NEW."agencyReconciliationActivatedAt" IS NULL
       OR NULLIF(BTRIM(NEW."agencyReconciliationActivatedById"), '') IS NULL
       OR NULLIF(BTRIM(NEW."agencyReconciliationActivationReason"), '') IS NULL
       OR NEW."agencyReconciliationActivatedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day' THEN
        RAISE EXCEPTION 'Agency reconciliation activation evidence is incomplete or future-dated';
    END IF;
    IF NEW."agencyReconciliationEnabled" AND NOT OLD."agencyReconciliationEnabled" AND NOT EXISTS (
        SELECT 1
        FROM public."AgencyProgram" program
        WHERE program."centerId" = NEW.id
          AND program.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation requires at least one active agency program';
    END IF;
    IF NEW."agencyReconciliationEnabled" AND NOT OLD."agencyReconciliationEnabled" AND EXISTS (
        SELECT 1
        FROM public."AgencyProgram" program
        WHERE program."centerId" = NEW.id
          AND program.status = 'active'
          AND (
              NULLIF(BTRIM(program."receivableGlCode"), '') IS NULL
              OR NULLIF(BTRIM(program."cashGlCode"), '') IS NULL
              OR NULLIF(BTRIM(program."adjustmentGlCode"), '') IS NULL
              OR NULLIF(BTRIM(program."costCenterCode"), '') IS NULL
          )
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation requires complete mappings for every active agency program';
    END IF;
    IF NEW."agencyReconciliationEnabled" AND NOT OLD."agencyReconciliationEnabled" AND EXISTS (
        SELECT 1
        FROM public."SubsidyClaim" claim
        LEFT JOIN public."AgencyLedgerAccount" account
          ON account."centerId" = claim."centerId"
         AND account."agencyProgramId" = claim."agencyProgramId"
        WHERE claim."centerId" = NEW.id
          AND claim.status IN ('approved', 'partially_paid', 'paid')
          AND (
              account.id IS NULL
              OR (SELECT COUNT(*) FROM public."AgencyLedgerEntry" entry WHERE entry."claimId" = claim.id AND entry.type = 'claim_approved') <> 1
              OR NOT EXISTS (
                  SELECT 1
                  FROM public."AgencyLedgerEntry" entry
                  WHERE entry."agencyLedgerAccountId" = account.id
                    AND entry."claimId" = claim.id
                    AND entry."remittanceId" IS NULL
                    AND entry."remittanceBatchId" IS NULL
                    AND entry."adjustmentId" IS NULL
                    AND entry.type = 'claim_approved'
                    AND entry."amountCents" IS NOT DISTINCT FROM claim."approvedCents"
                    AND entry."effectiveAt" IS NOT DISTINCT FROM COALESCE(claim."approvedAt", claim."createdAt")
                    AND entry."externalReference" IS NOT DISTINCT FROM claim."externalReference"
                    AND entry."sourceSystem" = 'subsidy_agency'
                    AND entry."externalId" = 'claim-approved:' || claim.id
              )
          )
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: a financial claim lacks exact receivable ledger evidence';
    END IF;
    IF NEW."agencyReconciliationEnabled" AND NOT OLD."agencyReconciliationEnabled" AND EXISTS (
        SELECT 1
        FROM public."SubsidyRemittance" remittance
        JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        WHERE claim."centerId" = NEW.id
          AND NOT EXISTS (
              SELECT 1
              FROM public."AgencyRemittanceAllocation" allocation
              JOIN public."AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
              WHERE allocation."remittanceId" = remittance.id
                AND allocation."claimId" = remittance."claimId"
                AND allocation."amountCents" = remittance."amountCents"
                AND batch."centerId" = claim."centerId"
                AND batch."agencyProgramId" = claim."agencyProgramId"
                AND (
                    (remittance."reversedAt" IS NULL AND allocation.status = 'posted')
                    OR (remittance."reversedAt" IS NOT NULL AND allocation.status = 'reversed')
                )
          )
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation activation blocked: existing remittances lack controlled allocations';
    END IF;
    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_activated_agency_remittance_control() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_activated_agency_allocation_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adopt_pre_activation_agency_remittances() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_reconciliation_activation_readiness() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "SubsidyRemittance_activation_control_guard" ON "SubsidyRemittance";
CREATE CONSTRAINT TRIGGER "SubsidyRemittance_activation_control_guard"
AFTER INSERT OR UPDATE ON "SubsidyRemittance"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_activated_agency_remittance_control();

DROP TRIGGER IF EXISTS "AgencyRemittanceAllocation_activation_control_guard" ON "AgencyRemittanceAllocation";
CREATE CONSTRAINT TRIGGER "AgencyRemittanceAllocation_activation_control_guard"
AFTER INSERT OR UPDATE OR DELETE ON "AgencyRemittanceAllocation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_activated_agency_allocation_change();

DROP TRIGGER IF EXISTS "Center_agency_reconciliation_activation_readiness_guard" ON "Center";
CREATE TRIGGER "Center_agency_reconciliation_activation_readiness_guard"
BEFORE UPDATE OF "agencyReconciliationEnabled", "agencyReconciliationActivatedAt", "agencyReconciliationActivatedById", "agencyReconciliationActivationReason" ON "Center"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_reconciliation_activation_readiness();

DROP TRIGGER IF EXISTS "Center_agency_reconciliation_insert_default_guard" ON "Center";
CREATE TRIGGER "Center_agency_reconciliation_insert_default_guard"
BEFORE INSERT ON "Center"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_reconciliation_activation_readiness();

-- PostgreSQL executes same-kind triggers alphabetically. The 00 prefix makes
-- adoption complete before the readiness trigger checks the final exact links.
DROP TRIGGER IF EXISTS "Center_agency_reconciliation_00_adoption_guard" ON "Center";
CREATE TRIGGER "Center_agency_reconciliation_00_adoption_guard"
BEFORE UPDATE OF "agencyReconciliationEnabled" ON "Center"
FOR EACH ROW EXECUTE FUNCTION public.adopt_pre_activation_agency_remittances();

ALTER TABLE "Center" VALIDATE CONSTRAINT "Center_agency_reconciliation_activation_check";
ALTER TABLE "Center" VALIDATE CONSTRAINT "Center_agency_reconciliation_inactive_evidence_check";
ALTER TABLE "SubsidyRemittance" VALIDATE CONSTRAINT "SubsidyRemittance_reversal_chronology_check";
ALTER TABLE "AgencyRemittanceBatch" VALIDATE CONSTRAINT "AgencyRemittanceBatch_reversal_chronology_check";
ALTER TABLE "AgencyLedgerAdjustment" VALIDATE CONSTRAINT "AgencyLedgerAdjustment_reversal_chronology_check";
ALTER TABLE "AgencyRemittanceBatch" VALIDATE CONSTRAINT "AgencyRemittanceBatch_status_check";
ALTER TABLE "AgencyRemittanceBatch" VALIDATE CONSTRAINT "AgencyRemittanceBatch_amounts_check";
ALTER TABLE "AgencyRemittanceBatch" VALIDATE CONSTRAINT "AgencyRemittanceBatch_review_check";
ALTER TABLE "AgencyRemittanceBatch" VALIDATE CONSTRAINT "AgencyRemittanceBatch_reversal_state_check";
ALTER TABLE "AgencyRemittanceAllocation" VALIDATE CONSTRAINT "AgencyRemittanceAllocation_status_amount_check";
ALTER TABLE "AgencyRemittanceAllocation" VALIDATE CONSTRAINT "AgencyRemittanceAllocation_review_check";
ALTER TABLE "AgencyLedgerAdjustment" VALIDATE CONSTRAINT "AgencyLedgerAdjustment_type_amount_check";
ALTER TABLE "AgencyLedgerAdjustment" VALIDATE CONSTRAINT "AgencyLedgerAdjustment_accounting_snapshot_check";
ALTER TABLE "AgencyLedgerAdjustment" VALIDATE CONSTRAINT "AgencyLedgerAdjustment_state_check";
ALTER TABLE "AgencyAccountingPeriod" VALIDATE CONSTRAINT "AgencyAccountingPeriod_state_check";

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "AgencyRemittanceBatch" batch
        JOIN "AgencyProgram" program ON program.id = batch."agencyProgramId"
        WHERE batch."centerId" <> program."centerId"
    ) OR EXISTS (
        SELECT 1
        FROM "AgencyRemittanceAllocation" allocation
        JOIN "AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
        JOIN "SubsidyClaim" claim ON claim.id = allocation."claimId"
        LEFT JOIN "SubsidyRemittance" remittance ON remittance.id = allocation."remittanceId"
        WHERE batch."centerId" <> claim."centerId"
           OR batch."agencyProgramId" <> claim."agencyProgramId"
           OR (allocation."remittanceId" IS NOT NULL AND (
                remittance.id IS NULL
                OR remittance."claimId" <> allocation."claimId"
                OR remittance."amountCents" <> allocation."amountCents"
                OR remittance."paidAt" IS DISTINCT FROM batch."paidAt"
                OR LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) IS DISTINCT FROM LOWER(REGEXP_REPLACE(BTRIM(batch."paymentMethod"), '\s+', ' ', 'g'))
                OR remittance."externalReference" IS DISTINCT FROM batch."externalReference"
                OR (remittance."reversedAt" IS NULL AND allocation.status <> 'posted')
                OR (remittance."reversedAt" IS NOT NULL AND allocation.status <> 'reversed')
           ))
    ) OR EXISTS (
        SELECT 1
        FROM "AgencyLedgerAdjustment" adjustment
        JOIN "AgencyProgram" program ON program.id = adjustment."agencyProgramId"
        JOIN "AgencyLedgerAccount" account ON account.id = adjustment."ledgerAccountId"
        LEFT JOIN "SubsidyClaim" claim ON claim.id = adjustment."claimId"
        LEFT JOIN "AgencyRemittanceBatch" batch ON batch.id = adjustment."batchId"
        WHERE program."centerId" <> adjustment."centerId"
           OR account."centerId" <> adjustment."centerId"
           OR account."agencyProgramId" <> adjustment."agencyProgramId"
           OR (adjustment."claimId" IS NOT NULL AND (
                claim.id IS NULL
                OR claim."centerId" IS DISTINCT FROM adjustment."centerId"
                OR claim."agencyProgramId" IS DISTINCT FROM adjustment."agencyProgramId"
                OR claim.status NOT IN ('approved', 'partially_paid', 'paid')
           ))
           OR (adjustment."batchId" IS NOT NULL AND (batch."centerId" <> adjustment."centerId" OR batch."agencyProgramId" <> adjustment."agencyProgramId"))
    ) OR EXISTS (
        SELECT 1
        FROM "SubsidyAuthorization" subsidy_authorization
        LEFT JOIN "AgencyProgram" program ON program.id = subsidy_authorization."agencyProgramId"
        LEFT JOIN "Family" family ON family.id = subsidy_authorization."familyId"
        LEFT JOIN "Child" child ON child.id = subsidy_authorization."childId"
        LEFT JOIN "Classroom" classroom ON classroom.id = child."classroomId"
        WHERE program.id IS NULL
           OR family.id IS NULL
           OR child.id IS NULL
           OR program."centerId" IS DISTINCT FROM subsidy_authorization."centerId"
           OR family."centerId" IS DISTINCT FROM subsidy_authorization."centerId"
           OR child."familyId" IS DISTINCT FROM subsidy_authorization."familyId"
           OR (classroom.id IS NOT NULL AND classroom."centerId" IS DISTINCT FROM subsidy_authorization."centerId")
    ) OR EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        LEFT JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
        LEFT JOIN "SubsidyAuthorization" subsidy_authorization ON subsidy_authorization.id = claim."authorizationId"
        WHERE program.id IS NULL
           OR program."centerId" IS DISTINCT FROM claim."centerId"
           OR (claim.status IN ('approved', 'partially_paid', 'paid') AND claim."authorizationId" IS NULL)
           OR (claim."authorizationId" IS NOT NULL AND (
               subsidy_authorization.id IS NULL
               OR subsidy_authorization."centerId" IS DISTINCT FROM claim."centerId"
               OR subsidy_authorization."agencyProgramId" IS DISTINCT FROM claim."agencyProgramId"
           ))
    ) OR EXISTS (
        SELECT 1
        FROM "SubsidyClaimLine" line
        LEFT JOIN "SubsidyClaim" claim ON claim.id = line."claimId"
        LEFT JOIN "Child" child ON child.id = line."childId"
        LEFT JOIN "Family" family ON family.id = child."familyId"
        LEFT JOIN "SubsidyAuthorization" subsidy_authorization ON subsidy_authorization.id = claim."authorizationId"
        WHERE claim.id IS NULL
           OR child.id IS NULL
           OR family.id IS NULL
           OR family."centerId" IS DISTINCT FROM claim."centerId"
           OR (subsidy_authorization.id IS NOT NULL AND line."childId" <> subsidy_authorization."childId")
    ) OR EXISTS (
        SELECT 1
        FROM "AgencyLedgerEntry" entry
        JOIN "AgencyLedgerAccount" account ON account.id = entry."agencyLedgerAccountId"
        LEFT JOIN "AgencyRemittanceBatch" batch ON batch.id = entry."remittanceBatchId"
        LEFT JOIN "SubsidyRemittance" remittance ON remittance.id = entry."remittanceId"
        LEFT JOIN "AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = entry."remittanceId"
        LEFT JOIN "AgencyLedgerAdjustment" adjustment ON adjustment.id = entry."adjustmentId"
        WHERE (entry."remittanceBatchId" IS NOT NULL AND (batch."centerId" <> account."centerId" OR batch."agencyProgramId" <> account."agencyProgramId"))
           OR (entry."remittanceId" IS NOT NULL AND (
                remittance.id IS NULL
                OR entry."claimId" IS DISTINCT FROM remittance."claimId"
                OR (allocation.id IS NULL AND entry."remittanceBatchId" IS NOT NULL)
                OR (allocation.id IS NOT NULL AND entry."remittanceBatchId" IS DISTINCT FROM allocation."batchId")
           ))
           OR (entry."adjustmentId" IS NOT NULL AND (
                adjustment.id IS NULL
                OR adjustment."centerId" IS DISTINCT FROM account."centerId"
                OR adjustment."agencyProgramId" IS DISTINCT FROM account."agencyProgramId"
                OR adjustment."ledgerAccountId" IS DISTINCT FROM account.id
                OR entry."claimId" IS DISTINCT FROM adjustment."claimId"
                OR entry."remittanceBatchId" IS DISTINCT FROM adjustment."batchId"
                OR entry."glCodeSnapshot" IS DISTINCT FROM adjustment."glCodeSnapshot"
                OR entry."costCenterCodeSnapshot" IS DISTINCT FROM adjustment."costCenterCodeSnapshot"
           ))
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: existing financial rows have conflicting tenant or source scope';
    END IF;
END
$migration$;

-- The new active batch/claim invariant cannot represent two active legacy
-- remittances for the same derived deposit and claim without inventing evidence.
-- Fail closed with a diagnostic instead of partially or silently backfilling it.
DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "SubsidyRemittance" remittance
        JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
        WHERE remittance."reversedAt" IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM "AgencyRemittanceAllocation" allocation
              WHERE allocation."remittanceId" = remittance.id
          )
        GROUP BY
            claim."centerId",
            claim."agencyProgramId",
            LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')),
            UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')),
            remittance."claimId"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: duplicate active legacy remittances exist for one derived batch and claim';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyRemittance" remittance
        WHERE NOT EXISTS (
              SELECT 1 FROM "AgencyRemittanceAllocation" allocation
              WHERE allocation."remittanceId" = remittance.id
          )
          AND (
              NULLIF(BTRIM(remittance."paymentMethod"), '') IS NULL
              OR NULLIF(BTRIM(remittance."externalReference"), '') IS NULL
              OR LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) NOT IN ('ach', 'check', 'agency_portal', 'other')
              OR NULLIF(BTRIM(remittance."enteredById"), '') IS NULL
              OR (remittance."reversedAt" IS NOT NULL AND (
                  NULLIF(BTRIM(remittance."reversedById"), '') IS NULL
                  OR NULLIF(BTRIM(remittance."reversalReason"), '') IS NULL
              ))
          )
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: legacy remittance method, reference, or actor evidence is invalid';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyRemittance" remittance
        LEFT JOIN "AgencyLedgerEntry" receipt
          ON receipt."sourceSystem" = 'subsidy_agency'
         AND receipt."externalId" = 'remittance:' || remittance.id
        LEFT JOIN "AgencyLedgerEntry" reversal
          ON reversal."sourceSystem" = 'subsidy_agency'
         AND reversal."externalId" = 'remittance-reversal:' || remittance.id
        WHERE NOT EXISTS (
            SELECT 1 FROM "AgencyRemittanceAllocation" allocation
            WHERE allocation."remittanceId" = remittance.id
        )
          AND (
              receipt.id IS NULL
              OR receipt."claimId" IS DISTINCT FROM remittance."claimId"
              OR receipt."remittanceId" IS DISTINCT FROM remittance.id
              OR receipt."remittanceBatchId" IS NOT NULL
              OR receipt.type <> 'remittance_received'
              OR receipt."amountCents" <> -remittance."amountCents"
              OR receipt."effectiveAt" IS DISTINCT FROM remittance."paidAt"
              OR receipt."externalReference" IS DISTINCT FROM remittance."externalReference"
              OR (remittance."reversedAt" IS NULL AND reversal.id IS NOT NULL)
              OR (remittance."reversedAt" IS NOT NULL AND (
                  reversal.id IS NULL
                  OR reversal."claimId" IS DISTINCT FROM remittance."claimId"
                  OR reversal."remittanceId" IS DISTINCT FROM remittance.id
                  OR reversal."remittanceBatchId" IS NOT NULL
                  OR reversal.type <> 'remittance_reversal'
                  OR reversal."amountCents" <> remittance."amountCents"
                  OR reversal."effectiveAt" IS DISTINCT FROM remittance."reversedAt"
                  OR reversal."externalReference" IS DISTINCT FROM remittance."externalReference"
                  OR reversal."glCodeSnapshot" IS DISTINCT FROM receipt."glCodeSnapshot"
                  OR reversal."costCenterCodeSnapshot" IS DISTINCT FROM receipt."costCenterCodeSnapshot"
              ))
          )
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: an unallocated legacy remittance lacks exact ledger evidence';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyRemittance" remittance
        JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
        JOIN "AgencyLedgerEntry" receipt
          ON receipt."sourceSystem" = 'subsidy_agency'
         AND receipt."externalId" = 'remittance:' || remittance.id
        WHERE NOT EXISTS (
            SELECT 1 FROM "AgencyRemittanceAllocation" allocation
            WHERE allocation."remittanceId" = remittance.id
        )
        GROUP BY
            claim."centerId",
            claim."agencyProgramId",
            LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')),
            UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')),
            CASE
                WHEN remittance."reversedAt" IS NULL THEN 'active'
                ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
            END
        HAVING SUM(remittance."amountCents"::bigint) NOT BETWEEN 1 AND 2147483647
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: a derived legacy batch total is outside the supported INTEGER range';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyRemittance" remittance
        JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
        JOIN "AgencyLedgerEntry" receipt
          ON receipt."sourceSystem" = 'subsidy_agency'
         AND receipt."externalId" = 'remittance:' || remittance.id
        WHERE NOT EXISTS (
            SELECT 1 FROM "AgencyRemittanceAllocation" allocation
            WHERE allocation."remittanceId" = remittance.id
        )
        GROUP BY
            claim."centerId",
            claim."agencyProgramId",
            LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')),
            UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')),
            CASE
                WHEN remittance."reversedAt" IS NULL THEN 'active'
                ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
            END
        HAVING COUNT(DISTINCT remittance."paidAt") <> 1
            OR COUNT(DISTINCT remittance."enteredById") <> 1
            OR COUNT(DISTINCT remittance."externalReference") <> 1
            OR COUNT(DISTINCT remittance."reversedAt") > 1
            OR COUNT(DISTINCT remittance."reversedById") > 1
            OR COUNT(DISTINCT remittance."reversalReason") > 1
            OR COUNT(DISTINCT (receipt."glCodeSnapshot", receipt."costCenterCodeSnapshot")) <> 1
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: grouped legacy remittances have conflicting batch-level evidence';
    END IF;
END
$migration$;

-- Preserve only remittances that are not already represented by an allocation.
-- Temporary source sets make replay exact: no new orphan batch can be created for
-- a remittance that was already backfilled or posted by the live workflow.
-- On replay, suspend the post-migration direct-insert gate only inside this
-- transaction; it is recreated before COMMIT and other sessions never observe
-- an unguarded committed schema.
DROP TRIGGER IF EXISTS "AgencyRemittanceBatch_legacy_insert_context_guard" ON "AgencyRemittanceBatch";
DROP TRIGGER IF EXISTS "AgencyRemittanceAllocation_legacy_insert_context_guard" ON "AgencyRemittanceAllocation";
DROP TRIGGER IF EXISTS "AgencyLedgerEntry_immutable_history_guard" ON "AgencyLedgerEntry";

CREATE TEMP TABLE "_AgencyReconciliationLegacyRemittanceBackfill" ON COMMIT DROP AS
SELECT
    remittance.id AS remittance_id,
    remittance."claimId" AS claim_id,
    claim."centerId" AS center_id,
    claim."agencyProgramId" AS agency_program_id,
    LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) AS normalized_payment_method,
    UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) AS normalized_reference,
    CASE
        WHEN remittance."reversedAt" IS NULL THEN 'active'
        ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
    END AS lifecycle_key,
    remittance."externalReference" AS external_reference,
    remittance."paidAt" AS paid_at,
    remittance."amountCents" AS amount_cents,
    remittance."enteredById" AS entered_by,
    remittance."reversedAt" AS reversed_at,
    remittance."reversedById" AS reversed_by,
    remittance."reversalReason" AS reversal_reason,
    remittance."createdAt" AS created_at,
    receipt."glCodeSnapshot" AS cash_gl_code_snapshot,
    receipt."costCenterCodeSnapshot" AS cost_center_code_snapshot,
    'agency-remittance-batch:' || MD5(
        claim."centerId" || ':' || claim."agencyProgramId" || ':' ||
        LOWER(REGEXP_REPLACE(BTRIM(remittance."paymentMethod"), '\s+', ' ', 'g')) || ':' ||
        UPPER(REGEXP_REPLACE(BTRIM(remittance."externalReference"), '\s+', ' ', 'g')) || ':' ||
        CASE
            WHEN remittance."reversedAt" IS NULL THEN 'active'
            ELSE 'reversed:' || TO_CHAR(remittance."reversedAt" AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
        END
    ) AS batch_id
FROM "SubsidyRemittance" remittance
JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
JOIN "AgencyLedgerEntry" receipt
  ON receipt."sourceSystem" = 'subsidy_agency'
 AND receipt."externalId" = 'remittance:' || remittance.id
WHERE NOT EXISTS (
    SELECT 1
    FROM "AgencyRemittanceAllocation" allocation
    WHERE allocation."remittanceId" = remittance.id
);

CREATE TEMP TABLE "_AgencyReconciliationLegacyBatchBackfill" ON COMMIT DROP AS
SELECT
    source.batch_id,
    source.center_id,
    source.agency_program_id,
    source.normalized_payment_method,
    source.normalized_reference,
    source.lifecycle_key,
    MIN(source.external_reference) AS display_reference,
    MIN(source.paid_at) AS paid_at,
    SUM(source.amount_cents::bigint)::integer AS total_cents,
    BOOL_AND(source.reversed_at IS NOT NULL) AS is_reversed,
    MIN(source.entered_by) AS entered_by,
    MAX(source.reversed_at) AS reversed_at,
    MIN(source.reversed_by) AS reversed_by,
    MIN(source.reversal_reason) AS reversal_reason,
    MIN(source.created_at) AS created_at,
    MIN(source.cash_gl_code_snapshot) AS cash_gl_code_snapshot,
    MIN(source.cost_center_code_snapshot) AS cost_center_code_snapshot
FROM "_AgencyReconciliationLegacyRemittanceBackfill" source
GROUP BY source.batch_id, source.center_id, source.agency_program_id, source.normalized_payment_method, source.normalized_reference, source.lifecycle_key;

INSERT INTO "AgencyRemittanceBatch" (
    "id", "centerId", "agencyProgramId", "externalReference", "referenceKey", "paidAt", "paymentMethod",
    "cashGlCodeSnapshot", "costCenterCodeSnapshot", "totalCents", "allocatedCents", "unappliedCents", "status", "notes", "idempotencyKey",
    "reconciliationFingerprint", "enteredById", "reviewedById", "reviewedAt", "reviewNotes",
    "reversedAt", "reversedById", "reversalReason", "createdAt", "updatedAt"
)
SELECT
    grouped.batch_id,
    grouped.center_id,
    grouped.agency_program_id,
    grouped.display_reference,
    grouped.normalized_payment_method || ':' || grouped.normalized_reference,
    grouped.paid_at,
    grouped.normalized_payment_method,
    grouped.cash_gl_code_snapshot,
    grouped.cost_center_code_snapshot,
    grouped.total_cents,
    grouped.total_cents,
    0,
    CASE WHEN grouped.is_reversed THEN 'reversed' ELSE 'reconciled' END,
    'Historical remittance batch created during dedicated agency-ledger migration.',
    'legacy:' || SUBSTRING(grouped.batch_id FROM LENGTH('agency-remittance-batch:') + 1),
    MD5(grouped.center_id || ':' || grouped.agency_program_id || ':' || grouped.total_cents::text || ':' || grouped.lifecycle_key),
    grouped.entered_by,
    NULL,
    NULL,
    'Historical baseline record retained without inferring independent review.',
    grouped.reversed_at,
    grouped.reversed_by,
    grouped.reversal_reason,
    grouped.created_at,
    CURRENT_TIMESTAMP
FROM "_AgencyReconciliationLegacyBatchBackfill" grouped
ON CONFLICT ("id") DO NOTHING;

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "_AgencyReconciliationLegacyBatchBackfill" expected
        LEFT JOIN "AgencyRemittanceBatch" batch ON batch.id = expected.batch_id
        WHERE batch.id IS NULL
           OR batch."centerId" <> expected.center_id
           OR batch."agencyProgramId" <> expected.agency_program_id
           OR batch."externalReference" <> expected.display_reference
           OR batch."referenceKey" <> (expected.normalized_payment_method || ':' || expected.normalized_reference)
           OR batch."paidAt" <> expected.paid_at
           OR batch."paymentMethod" <> expected.normalized_payment_method
           OR batch."cashGlCodeSnapshot" IS DISTINCT FROM expected.cash_gl_code_snapshot
           OR batch."costCenterCodeSnapshot" IS DISTINCT FROM expected.cost_center_code_snapshot
           OR batch."totalCents" <> expected.total_cents
           OR batch."allocatedCents" <> expected.total_cents
           OR batch."unappliedCents" <> 0
           OR batch.status <> CASE WHEN expected.is_reversed THEN 'reversed' ELSE 'reconciled' END
           OR batch."idempotencyKey" <> 'legacy:' || SUBSTRING(expected.batch_id FROM LENGTH('agency-remittance-batch:') + 1)
           OR batch."reconciliationFingerprint" <> MD5(expected.center_id || ':' || expected.agency_program_id || ':' || expected.total_cents::text || ':' || expected.lifecycle_key)
           OR batch."enteredById" <> expected.entered_by
           OR batch."reviewedById" IS NOT NULL
           OR batch."reviewedAt" IS NOT NULL
           OR batch."reversedAt" IS DISTINCT FROM expected.reversed_at
           OR batch."reversedById" IS DISTINCT FROM expected.reversed_by
           OR batch."reversalReason" IS DISTINCT FROM expected.reversal_reason
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: an existing legacy batch conflicts with source financial facts';
    END IF;
END
$migration$;

INSERT INTO "AgencyRemittanceAllocation" (
    "id", "batchId", "claimId", "remittanceId", "amountCents", "status", "notes", "fingerprint", "idempotencyKey",
    "requestedById", "reviewedById", "reviewedAt", "createdAt", "updatedAt"
)
SELECT
    'agency-remittance-allocation:' || source.remittance_id,
    source.batch_id,
    source.claim_id,
    source.remittance_id,
    source.amount_cents,
    CASE WHEN source.reversed_at IS NULL THEN 'posted' ELSE 'reversed' END,
    'Historical claim allocation retained during agency reconciliation migration.',
    MD5(source.batch_id || ':' || source.claim_id || ':' || source.amount_cents::text),
    'legacy-allocation:' || source.remittance_id,
    source.entered_by,
    NULL,
    NULL,
    source.created_at,
    CURRENT_TIMESTAMP
FROM "_AgencyReconciliationLegacyRemittanceBackfill" source
ON CONFLICT ("remittanceId") DO NOTHING;

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "_AgencyReconciliationLegacyRemittanceBackfill" expected
        LEFT JOIN "AgencyRemittanceAllocation" allocation ON allocation."remittanceId" = expected.remittance_id
        WHERE allocation.id IS NULL
           OR allocation.id <> 'agency-remittance-allocation:' || expected.remittance_id
           OR allocation."batchId" <> expected.batch_id
           OR allocation."claimId" <> expected.claim_id
           OR allocation."amountCents" <> expected.amount_cents
           OR allocation.status <> CASE WHEN expected.reversed_at IS NULL THEN 'posted' ELSE 'reversed' END
           OR allocation.fingerprint <> MD5(expected.batch_id || ':' || expected.claim_id || ':' || expected.amount_cents::text)
           OR allocation."idempotencyKey" <> 'legacy-allocation:' || expected.remittance_id
           OR allocation."requestedById" <> expected.entered_by
           OR allocation."reviewedById" IS NOT NULL
           OR allocation."reviewedAt" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: an existing legacy allocation conflicts with source financial facts';
    END IF;
END
$migration$;

UPDATE "AgencyLedgerEntry" entry
SET "remittanceBatchId" = allocation."batchId"
FROM "AgencyRemittanceAllocation" allocation
JOIN "_AgencyReconciliationLegacyRemittanceBackfill" expected
  ON expected.remittance_id = allocation."remittanceId"
 AND expected.batch_id = allocation."batchId"
WHERE allocation."remittanceId" = entry."remittanceId"
  AND allocation."idempotencyKey" = 'legacy-allocation:' || expected.remittance_id
  AND entry."remittanceBatchId" IS NULL;

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "_AgencyReconciliationLegacyRemittanceBackfill" expected
        LEFT JOIN "AgencyLedgerEntry" entry
          ON entry."sourceSystem" = 'subsidy_agency'
         AND entry."externalId" = 'remittance:' || expected.remittance_id
        WHERE entry.id IS NULL OR entry."remittanceBatchId" IS DISTINCT FROM expected.batch_id
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: a legacy remittance ledger entry was not linked to its exact batch';
    END IF;
END
$migration$;

-- Constraint triggers validate changed rows. Run the same material assertions
-- once over all rows so a replay also fails closed on pre-existing partial state.
DO $migration$
BEGIN
    PERFORM public.assert_agency_remittance_batch_material_state(batch.id)
    FROM public."AgencyRemittanceBatch" batch;

    PERFORM public.assert_agency_ledger_adjustment_material_state(adjustment.id)
    FROM public."AgencyLedgerAdjustment" adjustment;

    PERFORM public.assert_subsidy_claim_financial_state(claim.id)
    FROM public."SubsidyClaim" claim;

    PERFORM public.assert_agency_ledger_account_balances(account.id)
    FROM public."AgencyLedgerAccount" account;

    PERFORM public.assert_agency_ledger_entry_provenance(entry.id)
    FROM public."AgencyLedgerEntry" entry;
END
$migration$;

-- Legacy compatibility rows may only be created by the exact Center activation
-- adoption trigger. A direct service-role insert cannot self-designate as legacy
-- to bypass independent review or activation controls.
CREATE OR REPLACE FUNCTION public.protect_agency_legacy_batch_insert_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF NEW."idempotencyKey" LIKE 'legacy:%' AND pg_trigger_depth() <= 1 THEN
        RAISE EXCEPTION 'Legacy agency remittance batches may only be created by verified activation adoption';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_legacy_allocation_insert_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF NEW."idempotencyKey" LIKE 'legacy-allocation:%' AND pg_trigger_depth() <= 1 THEN
        RAISE EXCEPTION 'Legacy agency remittance allocations may only be created by verified activation adoption';
    END IF;
    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.protect_agency_legacy_batch_insert_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_legacy_allocation_insert_context() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "AgencyRemittanceBatch_legacy_insert_context_guard"
BEFORE INSERT ON "AgencyRemittanceBatch"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_legacy_batch_insert_context();

CREATE TRIGGER "AgencyRemittanceAllocation_legacy_insert_context_guard"
BEFORE INSERT ON "AgencyRemittanceAllocation"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_legacy_allocation_insert_context();

-- Financial facts are append-only. Running balances may be recalculated and the
-- migration may attach a previously-null batch provenance link, but corrections
-- otherwise require compensating entries/reversals.
CREATE OR REPLACE FUNCTION public.protect_agency_ledger_account_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1 FROM public."AgencyLedgerEntry" entry
            WHERE entry."agencyLedgerAccountId" = OLD.id
        ) OR EXISTS (
            SELECT 1 FROM public."AgencyLedgerAdjustment" adjustment
            WHERE adjustment."ledgerAccountId" = OLD.id
        ) THEN
            RAISE EXCEPTION 'An agency ledger account with financial history cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW."centerId" IS DISTINCT FROM OLD."centerId"
       OR NEW."agencyProgramId" IS DISTINCT FROM OLD."agencyProgramId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Agency ledger account ownership is immutable once created';
    END IF;

    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_ledger_entry_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Agency ledger entries are immutable; post a compensating reversal';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW."agencyLedgerAccountId" IS DISTINCT FROM OLD."agencyLedgerAccountId"
       OR NEW."claimId" IS DISTINCT FROM OLD."claimId"
       OR NEW."remittanceId" IS DISTINCT FROM OLD."remittanceId"
       OR NEW."adjustmentId" IS DISTINCT FROM OLD."adjustmentId"
       OR NOT (
           NEW."remittanceBatchId" IS NOT DISTINCT FROM OLD."remittanceBatchId"
           OR (
               OLD."remittanceBatchId" IS NULL
               AND NEW."remittanceBatchId" IS NOT NULL
               AND pg_trigger_depth() > 1
               AND EXISTS (
                   SELECT 1
                   FROM public."AgencyRemittanceAllocation" allocation
                   WHERE allocation."remittanceId" = NEW."remittanceId"
                     AND allocation."claimId" = NEW."claimId"
                     AND allocation."batchId" = NEW."remittanceBatchId"
                     AND allocation."idempotencyKey" LIKE 'legacy-allocation:adoption:%'
               )
           )
       )
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW."amountCents" IS DISTINCT FROM OLD."amountCents"
       OR NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt"
       OR NEW."externalReference" IS DISTINCT FROM OLD."externalReference"
       OR NEW."glCodeSnapshot" IS DISTINCT FROM OLD."glCodeSnapshot"
       OR NEW."costCenterCodeSnapshot" IS DISTINCT FROM OLD."costCenterCodeSnapshot"
       OR NEW."sourceSystem" IS DISTINCT FROM OLD."sourceSystem"
       OR NEW."externalId" IS DISTINCT FROM OLD."externalId"
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Agency ledger financial facts are immutable; post a compensating reversal';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_subsidy_remittance_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Agency remittances are immutable; post a compensating reversal';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW."claimId" IS DISTINCT FROM OLD."claimId"
       OR NEW."amountCents" IS DISTINCT FROM OLD."amountCents"
       OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
       OR NEW."paymentMethod" IS DISTINCT FROM OLD."paymentMethod"
       OR NEW."externalReference" IS DISTINCT FROM OLD."externalReference"
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW."enteredById" IS DISTINCT FROM OLD."enteredById"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NOT (
           (NEW."reversedAt" IS NOT DISTINCT FROM OLD."reversedAt" AND NEW."reversedById" IS NOT DISTINCT FROM OLD."reversedById" AND NEW."reversalReason" IS NOT DISTINCT FROM OLD."reversalReason")
           OR (OLD."reversedAt" IS NULL AND NEW."reversedAt" IS NOT NULL AND NULLIF(BTRIM(NEW."reversedById"), '') IS NOT NULL AND NULLIF(BTRIM(NEW."reversalReason"), '') IS NOT NULL)
       ) THEN
        RAISE EXCEPTION 'Agency remittance financial facts are immutable; post a compensating reversal';
    END IF;
    IF OLD."reversedAt" IS NULL
       AND NEW."reversedAt" IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM public."AgencyRemittanceAllocation" allocation
           JOIN public."AgencyRemittanceBatch" batch ON batch.id = allocation."batchId"
           JOIN public."SubsidyClaim" claim ON claim.id = OLD."claimId"
           JOIN public."Center" center ON center.id = claim."centerId"
           WHERE allocation."remittanceId" = OLD.id
             AND NEW."reversedById" = batch."enteredById"
             AND (
                 center."agencyReconciliationEnabled"
                 OR allocation."idempotencyKey" NOT LIKE 'legacy-allocation:%'
             )
       ) THEN
        RAISE EXCEPTION 'A controlled remittance reversal requires an actor other than the batch preparer';
    END IF;
    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.protect_agency_ledger_account_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_ledger_entry_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_subsidy_remittance_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "AgencyLedgerAccount_immutable_history_guard" ON "AgencyLedgerAccount";
CREATE TRIGGER "AgencyLedgerAccount_immutable_history_guard"
BEFORE UPDATE OR DELETE ON "AgencyLedgerAccount"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_ledger_account_history();

DROP TRIGGER IF EXISTS "AgencyLedgerEntry_immutable_history_guard" ON "AgencyLedgerEntry";
CREATE TRIGGER "AgencyLedgerEntry_immutable_history_guard"
BEFORE UPDATE OR DELETE ON "AgencyLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_ledger_entry_history();

DROP TRIGGER IF EXISTS "SubsidyRemittance_immutable_history_guard" ON "SubsidyRemittance";
CREATE TRIGGER "SubsidyRemittance_immutable_history_guard"
BEFORE UPDATE OR DELETE ON "SubsidyRemittance"
FOR EACH ROW EXECUTE FUNCTION public.protect_subsidy_remittance_history();

CREATE OR REPLACE FUNCTION public.protect_agency_remittance_batch_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Agency remittance batches are immutable; reject or reverse the batch';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW."centerId" IS DISTINCT FROM OLD."centerId"
       OR NEW."agencyProgramId" IS DISTINCT FROM OLD."agencyProgramId"
       OR NEW."externalReference" IS DISTINCT FROM OLD."externalReference"
       OR NEW."referenceKey" IS DISTINCT FROM OLD."referenceKey"
       OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
       OR NEW."paymentMethod" IS DISTINCT FROM OLD."paymentMethod"
       OR NEW."cashGlCodeSnapshot" IS DISTINCT FROM OLD."cashGlCodeSnapshot"
       OR NEW."costCenterCodeSnapshot" IS DISTINCT FROM OLD."costCenterCodeSnapshot"
       OR NEW."totalCents" IS DISTINCT FROM OLD."totalCents"
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW."evidenceName" IS DISTINCT FROM OLD."evidenceName"
       OR NEW."evidenceReference" IS DISTINCT FROM OLD."evidenceReference"
       OR NEW."evidenceStorageKey" IS DISTINCT FROM OLD."evidenceStorageKey"
       OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
       OR NEW."reconciliationFingerprint" IS DISTINCT FROM OLD."reconciliationFingerprint"
       OR NEW."enteredById" IS DISTINCT FROM OLD."enteredById"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Agency remittance batch source facts are immutable; reject or reverse the batch';
    END IF;
    IF OLD.status IN ('rejected', 'reversed') AND (
        NEW.status IS DISTINCT FROM OLD.status
        OR NEW."allocatedCents" IS DISTINCT FROM OLD."allocatedCents"
        OR NEW."unappliedCents" IS DISTINCT FROM OLD."unappliedCents"
        OR NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById"
        OR NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
        OR NEW."reviewNotes" IS DISTINCT FROM OLD."reviewNotes"
        OR NEW."followUpOwnerId" IS DISTINCT FROM OLD."followUpOwnerId"
        OR NEW."followUpDueAt" IS DISTINCT FROM OLD."followUpDueAt"
        OR NEW."reversedAt" IS DISTINCT FROM OLD."reversedAt"
        OR NEW."reversedById" IS DISTINCT FROM OLD."reversedById"
        OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason"
    ) THEN
        RAISE EXCEPTION 'A rejected or reversed agency remittance batch is terminal';
    END IF;
    IF OLD."reviewedAt" IS NULL THEN
        IF NEW."reviewedAt" IS NULL AND (
            NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById"
            OR NEW."reviewNotes" IS DISTINCT FROM OLD."reviewNotes"
        ) THEN
            RAISE EXCEPTION 'Agency remittance batch review evidence cannot be rewritten';
        ELSIF NEW."reviewedAt" IS NOT NULL AND (
            NULLIF(BTRIM(NEW."reviewedById"), '') IS NULL
            OR NEW."reviewedById" = OLD."enteredById"
        ) THEN
            RAISE EXCEPTION 'Agency remittance batch review requires a different reviewer';
        END IF;
    ELSIF NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
       OR NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById"
       OR NEW."reviewNotes" IS DISTINCT FROM OLD."reviewNotes" THEN
        RAISE EXCEPTION 'Agency remittance batch review evidence is immutable';
    END IF;
    IF OLD."reviewedAt" IS NOT NULL AND (
        NEW."allocatedCents" < OLD."allocatedCents"
        OR NEW."unappliedCents" > OLD."unappliedCents"
    ) THEN
        RAISE EXCEPTION 'Agency remittance batch posted allocation totals cannot move backward';
    END IF;
    IF OLD."reversedAt" IS NULL THEN
        IF NEW."reversedAt" IS NOT NULL AND (
            NEW.status <> 'reversed'
            OR NULLIF(BTRIM(NEW."reversedById"), '') IS NULL
            OR NEW."reversedById" = OLD."enteredById"
            OR NULLIF(BTRIM(NEW."reversalReason"), '') IS NULL
            OR NEW."reversedAt" < OLD."paidAt"
            OR (OLD."reviewedAt" IS NULL AND OLD."idempotencyKey" NOT LIKE 'legacy:%')
        ) THEN
            RAISE EXCEPTION 'Agency remittance batch reversal evidence or reviewer is invalid';
        END IF;
    ELSIF NEW."reversedAt" IS DISTINCT FROM OLD."reversedAt"
       OR NEW."reversedById" IS DISTINCT FROM OLD."reversedById"
       OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason"
       OR NEW.status <> 'reversed' THEN
        RAISE EXCEPTION 'Agency remittance batch reversal evidence is immutable';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_remittance_allocation_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Agency remittance allocations are immutable; reject or reverse the allocation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW."batchId" IS DISTINCT FROM OLD."batchId"
       OR NEW."claimId" IS DISTINCT FROM OLD."claimId"
       OR NEW."amountCents" IS DISTINCT FROM OLD."amountCents"
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
       OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
       OR NEW."requestedById" IS DISTINCT FROM OLD."requestedById"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NOT (NEW."remittanceId" IS NOT DISTINCT FROM OLD."remittanceId" OR (OLD."remittanceId" IS NULL AND NEW."remittanceId" IS NOT NULL)) THEN
        RAISE EXCEPTION 'Agency remittance allocation source facts are immutable; reject or reverse the allocation';
    END IF;
    IF (OLD.status = 'pending_review' AND NEW.status NOT IN ('pending_review', 'posted', 'rejected'))
       OR (OLD.status = 'posted' AND NEW.status NOT IN ('posted', 'reversed'))
       OR (OLD.status IN ('rejected', 'reversed') AND NEW.status <> OLD.status) THEN
        RAISE EXCEPTION 'Agency remittance allocation lifecycle cannot move backward or reopen';
    END IF;
    IF OLD."reviewedAt" IS NULL THEN
        IF NEW."reviewedAt" IS NULL AND (
            NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById"
            OR NEW."reviewNotes" IS DISTINCT FROM OLD."reviewNotes"
        ) THEN
            RAISE EXCEPTION 'Agency remittance allocation review evidence cannot be rewritten';
        ELSIF NEW."reviewedAt" IS NOT NULL AND (
            NULLIF(BTRIM(NEW."reviewedById"), '') IS NULL
            OR NEW."reviewedById" = OLD."requestedById"
        ) THEN
            RAISE EXCEPTION 'Agency remittance allocation review requires a different reviewer';
        END IF;
    ELSIF NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
       OR NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById"
       OR NEW."reviewNotes" IS DISTINCT FROM OLD."reviewNotes" THEN
        RAISE EXCEPTION 'Agency remittance allocation review evidence is immutable';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_ledger_adjustment_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Agency ledger adjustments are immutable; reject or reverse the adjustment';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW."centerId" IS DISTINCT FROM OLD."centerId"
       OR NEW."agencyProgramId" IS DISTINCT FROM OLD."agencyProgramId"
       OR NEW."ledgerAccountId" IS DISTINCT FROM OLD."ledgerAccountId"
       OR NEW."claimId" IS DISTINCT FROM OLD."claimId"
       OR NEW."batchId" IS DISTINCT FROM OLD."batchId"
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW."amountCents" IS DISTINCT FROM OLD."amountCents"
       OR NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt"
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW."evidenceName" IS DISTINCT FROM OLD."evidenceName"
       OR NEW."evidenceReference" IS DISTINCT FROM OLD."evidenceReference"
       OR NEW."glCodeSnapshot" IS DISTINCT FROM OLD."glCodeSnapshot"
       OR NEW."costCenterCodeSnapshot" IS DISTINCT FROM OLD."costCenterCodeSnapshot"
       OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
       OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
       OR NEW."requestedById" IS DISTINCT FROM OLD."requestedById"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Agency ledger adjustment source facts are immutable; reject or reverse the adjustment';
    END IF;
    IF (OLD.status = 'pending_review' AND NEW.status NOT IN ('pending_review', 'posted', 'rejected'))
       OR (OLD.status = 'posted' AND NEW.status NOT IN ('posted', 'reversed'))
       OR (OLD.status IN ('rejected', 'reversed') AND NEW.status <> OLD.status) THEN
        RAISE EXCEPTION 'Agency ledger adjustment lifecycle cannot move backward or reopen';
    END IF;
    IF OLD."reviewedAt" IS NULL THEN
        IF NEW."reviewedAt" IS NULL AND (
            NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById"
            OR NEW."reviewNotes" IS DISTINCT FROM OLD."reviewNotes"
        ) THEN
            RAISE EXCEPTION 'Agency ledger adjustment review evidence cannot be rewritten';
        ELSIF NEW."reviewedAt" IS NOT NULL AND (
            NULLIF(BTRIM(NEW."reviewedById"), '') IS NULL
            OR NEW."reviewedById" = OLD."requestedById"
        ) THEN
            RAISE EXCEPTION 'Agency ledger adjustment review requires a different reviewer';
        END IF;
    ELSIF NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
       OR NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById"
       OR NEW."reviewNotes" IS DISTINCT FROM OLD."reviewNotes" THEN
        RAISE EXCEPTION 'Agency ledger adjustment review evidence is immutable';
    END IF;
    IF OLD."reversedAt" IS NULL THEN
        IF NEW."reversedAt" IS NOT NULL AND (
            OLD.status <> 'posted'
            OR NEW.status <> 'reversed'
            OR NULLIF(BTRIM(NEW."reversedById"), '') IS NULL
            OR NEW."reversedById" = OLD."requestedById"
            OR NULLIF(BTRIM(NEW."reversalReason"), '') IS NULL
            OR NEW."reversedAt" < OLD."effectiveAt"
        ) THEN
            RAISE EXCEPTION 'Agency ledger adjustment reversal evidence or reviewer is invalid';
        END IF;
    ELSIF NEW."reversedAt" IS DISTINCT FROM OLD."reversedAt"
       OR NEW."reversedById" IS DISTINCT FROM OLD."reversedById"
       OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason"
       OR NEW.status <> 'reversed' THEN
        RAISE EXCEPTION 'Agency ledger adjustment reversal evidence is immutable';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.protect_agency_accounting_period_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Agency accounting periods are immutable; reopen the period';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW."centerId" IS DISTINCT FROM OLD."centerId"
       OR NEW."startDate" IS DISTINCT FROM OLD."startDate"
       OR NEW."endDate" IS DISTINCT FROM OLD."endDate"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Agency accounting period boundaries are immutable';
    END IF;
    IF NEW.status = OLD.status AND (
        NEW."closedAt" IS DISTINCT FROM OLD."closedAt"
        OR NEW."closedById" IS DISTINCT FROM OLD."closedById"
        OR NEW."closeReason" IS DISTINCT FROM OLD."closeReason"
        OR NEW."reopenedAt" IS DISTINCT FROM OLD."reopenedAt"
        OR NEW."reopenedById" IS DISTINCT FROM OLD."reopenedById"
        OR NEW."reopenReason" IS DISTINCT FROM OLD."reopenReason"
    ) THEN
        RAISE EXCEPTION 'Agency accounting period evidence cannot change without a state transition';
    END IF;
    IF OLD.status = 'closed' AND NEW.status = 'open' AND (
        NEW."closedAt" IS DISTINCT FROM OLD."closedAt"
        OR NEW."closedById" IS DISTINCT FROM OLD."closedById"
        OR NEW."closeReason" IS DISTINCT FROM OLD."closeReason"
        OR NEW."reopenedAt" IS NULL
        OR NEW."reopenedAt" < OLD."closedAt"
        OR NULLIF(BTRIM(NEW."reopenedById"), '') IS NULL
        OR NULLIF(BTRIM(NEW."reopenReason"), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Agency accounting period reopen evidence is invalid';
    END IF;
    IF OLD.status = 'open' AND NEW.status = 'closed' AND (
        NEW."reopenedAt" IS DISTINCT FROM OLD."reopenedAt"
        OR NEW."reopenedById" IS DISTINCT FROM OLD."reopenedById"
        OR NEW."reopenReason" IS DISTINCT FROM OLD."reopenReason"
        OR NEW."closedAt" IS NULL
        OR (OLD."reopenedAt" IS NOT NULL AND NEW."closedAt" < OLD."reopenedAt")
        OR NULLIF(BTRIM(NEW."closedById"), '') IS NULL
        OR NULLIF(BTRIM(NEW."closeReason"), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Agency accounting period close evidence is invalid';
    END IF;
    IF (OLD.status = 'closed' AND NEW.status NOT IN ('closed', 'open'))
       OR (OLD.status = 'open' AND NEW.status NOT IN ('open', 'closed')) THEN
        RAISE EXCEPTION 'Agency accounting period state transition is invalid';
    END IF;
    RETURN NEW;
END
$function$;

-- Serialize period-range decisions per school so concurrent direct SQL cannot
-- create overlapping inclusive ranges or reopen history out of order.
CREATE OR REPLACE FUNCTION public.enforce_agency_accounting_period_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('agency-accounting-period'),
        pg_catalog.hashtext(NEW."centerId")
    );

    IF NEW."closedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
       OR NEW."reopenedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day' THEN
        RAISE EXCEPTION 'Agency accounting period close or reopen evidence cannot be future-dated';
    END IF;

    IF NEW.status = 'closed' AND (
        NEW."endDate" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
        OR DATE_TRUNC('day', NEW."closedAt") < DATE_TRUNC('day', NEW."endDate")
    ) THEN
        RAISE EXCEPTION 'Agency accounting period cannot close a future boundary or predate its period end';
    END IF;
    IF NEW."reopenedAt" IS NOT NULL AND NEW."reopenedAt" < NEW."closedAt" THEN
        RAISE EXCEPTION 'Agency accounting period reopen evidence cannot predate its close';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."AgencyAccountingPeriod" period
        WHERE period."centerId" = NEW."centerId"
          AND period.id <> NEW.id
          AND period."startDate" <= NEW."endDate"
          AND period."endDate" >= NEW."startDate"
    ) THEN
        RAISE EXCEPTION 'Agency accounting period ranges cannot overlap within a school';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status = 'closed'
       AND NEW.status = 'open'
       AND EXISTS (
           SELECT 1
           FROM public."AgencyAccountingPeriod" later_period
           WHERE later_period."centerId" = NEW."centerId"
             AND later_period.id <> NEW.id
             AND later_period.status = 'closed'
             AND later_period."startDate" > NEW."startDate"
       ) THEN
        RAISE EXCEPTION 'A later closed agency accounting period must be reopened first';
    END IF;

    RETURN NEW;
END
$function$;

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public."AgencyAccountingPeriod" earlier
        JOIN public."AgencyAccountingPeriod" later
          ON later."centerId" = earlier."centerId"
         AND later.id > earlier.id
         AND later."startDate" <= earlier."endDate"
         AND later."endDate" >= earlier."startDate"
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: existing accounting period ranges overlap';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public."AgencyAccountingPeriod" period
        WHERE (period.status = 'closed' AND (
                  period."endDate" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
                  OR DATE_TRUNC('day', period."closedAt") < DATE_TRUNC('day', period."endDate")
              ))
           OR (period."reopenedAt" IS NOT NULL AND period."reopenedAt" < period."closedAt")
    ) THEN
        RAISE EXCEPTION 'Agency reconciliation migration blocked: existing accounting period chronology is invalid';
    END IF;
END
$migration$;

REVOKE ALL ON FUNCTION public.protect_agency_remittance_batch_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_remittance_allocation_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_ledger_adjustment_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_agency_accounting_period_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_accounting_period_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "AgencyRemittanceBatch_immutable_history_guard" ON "AgencyRemittanceBatch";
CREATE TRIGGER "AgencyRemittanceBatch_immutable_history_guard"
BEFORE UPDATE OR DELETE ON "AgencyRemittanceBatch"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_remittance_batch_history();

DROP TRIGGER IF EXISTS "AgencyRemittanceAllocation_immutable_history_guard" ON "AgencyRemittanceAllocation";
CREATE TRIGGER "AgencyRemittanceAllocation_immutable_history_guard"
BEFORE UPDATE OR DELETE ON "AgencyRemittanceAllocation"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_remittance_allocation_history();

DROP TRIGGER IF EXISTS "AgencyLedgerAdjustment_immutable_history_guard" ON "AgencyLedgerAdjustment";
CREATE TRIGGER "AgencyLedgerAdjustment_immutable_history_guard"
BEFORE UPDATE OR DELETE ON "AgencyLedgerAdjustment"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_ledger_adjustment_history();

DROP TRIGGER IF EXISTS "AgencyAccountingPeriod_immutable_history_guard" ON "AgencyAccountingPeriod";
CREATE TRIGGER "AgencyAccountingPeriod_immutable_history_guard"
BEFORE UPDATE OR DELETE ON "AgencyAccountingPeriod"
FOR EACH ROW EXECUTE FUNCTION public.protect_agency_accounting_period_history();

DROP TRIGGER IF EXISTS "AgencyAccountingPeriod_order_guard" ON "AgencyAccountingPeriod";
CREATE TRIGGER "AgencyAccountingPeriod_order_guard"
BEFORE INSERT OR UPDATE ON "AgencyAccountingPeriod"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_accounting_period_order();

COMMIT;
