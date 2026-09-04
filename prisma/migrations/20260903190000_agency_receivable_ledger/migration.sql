BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';
SET LOCAL TIME ZONE 'UTC';

-- Mapping columns are introduced here so the first immutable ledger backfill can
-- snapshot the classifications that were effective at cutover time.
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "receivableGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "cashGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "adjustmentGlCode" TEXT;
ALTER TABLE "AgencyProgram" ADD COLUMN IF NOT EXISTS "costCenterCode" TEXT;

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
    "glCodeSnapshot" TEXT,
    "costCenterCodeSnapshot" TEXT,
    "sourceSystem" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencyLedgerEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgencyLedgerEntry" ADD COLUMN IF NOT EXISTS "glCodeSnapshot" TEXT;
ALTER TABLE "AgencyLedgerEntry" ADD COLUMN IF NOT EXISTS "costCenterCodeSnapshot" TEXT;

-- Deny browser roles before any financial backfill. The transaction also prevents a
-- later failure from leaving a partially applied public financial schema behind.
ALTER TABLE "AgencyLedgerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyLedgerEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AgencyLedgerAccount" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "AgencyLedgerEntry" FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyLedgerAccount_centerId_agencyProgramId_key" ON "AgencyLedgerAccount"("centerId", "agencyProgramId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAccount_centerId_balanceCents_idx" ON "AgencyLedgerAccount"("centerId", "balanceCents");
CREATE INDEX IF NOT EXISTS "AgencyLedgerAccount_agencyProgramId_idx" ON "AgencyLedgerAccount"("agencyProgramId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyLedgerEntry_sourceSystem_externalId_key" ON "AgencyLedgerEntry"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_agencyLedgerAccountId_effectiveAt_createdAt_id_idx" ON "AgencyLedgerEntry"("agencyLedgerAccountId", "effectiveAt", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_claimId_idx" ON "AgencyLedgerEntry"("claimId");
CREATE INDEX IF NOT EXISTS "AgencyLedgerEntry_remittanceId_idx" ON "AgencyLedgerEntry"("remittanceId");

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAccount_centerId_fkey' AND conrelid = '"AgencyLedgerAccount"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAccount" ADD CONSTRAINT "AgencyLedgerAccount_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerAccount_agencyProgramId_fkey' AND conrelid = '"AgencyLedgerAccount"'::regclass) THEN
        ALTER TABLE "AgencyLedgerAccount" ADD CONSTRAINT "AgencyLedgerAccount_agencyProgramId_fkey" FOREIGN KEY ("agencyProgramId") REFERENCES "AgencyProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_agencyLedgerAccountId_fkey' AND conrelid = '"AgencyLedgerEntry"'::regclass) THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_agencyLedgerAccountId_fkey" FOREIGN KEY ("agencyLedgerAccountId") REFERENCES "AgencyLedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_claimId_fkey' AND conrelid = '"AgencyLedgerEntry"'::regclass) THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SubsidyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyLedgerEntry_remittanceId_fkey' AND conrelid = '"AgencyLedgerEntry"'::regclass) THEN
        ALTER TABLE "AgencyLedgerEntry" ADD CONSTRAINT "AgencyLedgerEntry_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "SubsidyRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$migration$;

-- Independent foreign keys do not prove that their rows belong to the same school.
-- Enforce the complete tenant/program relationship for every service-role write.
CREATE OR REPLACE FUNCTION public.enforce_agency_ledger_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    program_center_id TEXT;
BEGIN
    SELECT program."centerId"
    INTO program_center_id
    FROM public."AgencyProgram" program
    WHERE program.id = NEW."agencyProgramId";

    IF program_center_id IS NULL OR program_center_id <> NEW."centerId" THEN
        RAISE EXCEPTION 'Agency ledger account scope conflict';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agency_ledger_entry_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    account_center_id TEXT;
    account_program_id TEXT;
    related_claim_id TEXT;
    related_center_id TEXT;
    related_program_id TEXT;
BEGIN
    SELECT account."centerId", account."agencyProgramId"
    INTO account_center_id, account_program_id
    FROM public."AgencyLedgerAccount" account
    WHERE account.id = NEW."agencyLedgerAccountId";

    IF account_center_id IS NULL THEN
        RAISE EXCEPTION 'Agency ledger entry account is missing';
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

    IF NEW."remittanceId" IS NOT NULL THEN
        SELECT remittance."claimId", claim."centerId", claim."agencyProgramId"
        INTO related_claim_id, related_center_id, related_program_id
        FROM public."SubsidyRemittance" remittance
        JOIN public."SubsidyClaim" claim ON claim.id = remittance."claimId"
        WHERE remittance.id = NEW."remittanceId";

        IF related_claim_id IS NULL
           OR related_center_id <> account_center_id
           OR related_program_id <> account_program_id
           OR NEW."claimId" IS DISTINCT FROM related_claim_id THEN
            RAISE EXCEPTION 'Agency ledger entry remittance scope conflict';
        END IF;
    END IF;

    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_agency_ledger_account_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_agency_ledger_entry_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "AgencyLedgerAccount_scope_guard" ON "AgencyLedgerAccount";
CREATE TRIGGER "AgencyLedgerAccount_scope_guard"
BEFORE INSERT OR UPDATE OF "centerId", "agencyProgramId" ON "AgencyLedgerAccount"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_ledger_account_scope();

DROP TRIGGER IF EXISTS "AgencyLedgerEntry_scope_guard" ON "AgencyLedgerEntry";
CREATE TRIGGER "AgencyLedgerEntry_scope_guard"
BEFORE INSERT OR UPDATE OF "agencyLedgerAccountId", "claimId", "remittanceId" ON "AgencyLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.enforce_agency_ledger_entry_scope();

-- Fail closed on evidence that cannot safely produce a school-scoped, chronological
-- receivable ledger. These checks run before any backfill in the same transaction.
DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
        WHERE program."centerId" <> claim."centerId"
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: a claim and agency program belong to different schools';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyAuthorization" subsidy_authorization
        JOIN "AgencyProgram" program ON program.id = subsidy_authorization."agencyProgramId"
        WHERE program."centerId" <> subsidy_authorization."centerId"
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: an authorization and agency program belong to different schools';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        JOIN "SubsidyAuthorization" subsidy_authorization ON subsidy_authorization.id = claim."authorizationId"
        WHERE subsidy_authorization."centerId" <> claim."centerId"
           OR subsidy_authorization."agencyProgramId" <> claim."agencyProgramId"
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: a claim and authorization have conflicting school or agency scope';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyAuthorization" subsidy_authorization
        JOIN "Family" family ON family.id = subsidy_authorization."familyId"
        JOIN "Child" child ON child.id = subsidy_authorization."childId"
        WHERE family."centerId" IS DISTINCT FROM subsidy_authorization."centerId"
           OR child."familyId" <> subsidy_authorization."familyId"
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: an authorization, family, and child have conflicting scope';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        WHERE claim.status IN ('approved', 'partially_paid', 'paid')
          AND claim."authorizationId" IS NULL
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: an approved lifecycle claim lacks authorization evidence';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "SubsidyRemittance"
        WHERE "amountCents" <= 0
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: a remittance amount is not positive';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "SubsidyRemittance"
        WHERE NULLIF(BTRIM("enteredById"), '') IS NULL
           OR ("reversedAt" IS NOT NULL AND (
                NULLIF(BTRIM("reversedById"), '') IS NULL
                OR NULLIF(BTRIM("reversalReason"), '') IS NULL
            ))
           OR ("reversedAt" IS NULL AND (
                "reversedById" IS NOT NULL
                OR "reversalReason" IS NOT NULL
           ))
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: remittance actor or reversal evidence is incomplete';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "SubsidyRemittance"
        WHERE "reversedAt" IS NOT NULL AND "reversedAt" < "paidAt"
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: a remittance reversal predates its receipt';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "SubsidyRemittance"
        WHERE "paidAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
           OR "reversedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: a remittance receipt or reversal is future-dated';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        WHERE claim.status IN ('approved', 'partially_paid', 'paid')
          AND COALESCE(claim."approvedAt", claim."createdAt") >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: a claim approval event is future-dated';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        WHERE claim."paidCents"::bigint <> COALESCE((
            SELECT SUM(remittance."amountCents"::bigint)
            FROM "SubsidyRemittance" remittance
            WHERE remittance."claimId" = claim.id AND remittance."reversedAt" IS NULL
        ), 0)
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: claim paidCents conflicts with active remittance evidence';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        WHERE claim.status IN ('approved', 'partially_paid', 'paid')
          AND COALESCE(claim."approvedCents", 0) <= 0
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: an approved lifecycle claim lacks a positive approved amount';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        WHERE claim."approvedCents" > claim."claimedCents"
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: an approved amount exceeds its claim amount';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        WHERE (claim.status = 'approved' AND claim."paidCents" <> 0)
           OR (claim.status = 'partially_paid' AND (claim."paidCents" <= 0 OR claim."paidCents" >= claim."approvedCents"))
           OR (claim.status = 'paid' AND claim."paidCents" <> claim."approvedCents")
           OR (claim.status NOT IN ('approved', 'partially_paid', 'paid') AND claim."paidCents" <> 0)
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: a claim status conflicts with its paid amount';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "AgencyLedgerAccount" account
        JOIN "AgencyProgram" program ON program.id = account."agencyProgramId"
        WHERE account."centerId" <> program."centerId"
    ) OR EXISTS (
        SELECT 1
        FROM "AgencyLedgerEntry" entry
        JOIN "AgencyLedgerAccount" account ON account.id = entry."agencyLedgerAccountId"
        JOIN "SubsidyClaim" claim ON claim.id = entry."claimId"
        WHERE claim."centerId" <> account."centerId"
           OR claim."agencyProgramId" <> account."agencyProgramId"
    ) OR EXISTS (
        SELECT 1
        FROM "AgencyLedgerEntry" entry
        JOIN "AgencyLedgerAccount" account ON account.id = entry."agencyLedgerAccountId"
        JOIN "SubsidyRemittance" remittance ON remittance.id = entry."remittanceId"
        JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
        WHERE claim."centerId" <> account."centerId"
           OR claim."agencyProgramId" <> account."agencyProgramId"
           OR entry."claimId" IS DISTINCT FROM remittance."claimId"
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: an existing ledger account or entry has conflicting scope';
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

-- Any nonzero approved amount outside an explicit approved lifecycle is conflicting evidence,
-- not authority to infer a receivable. Legacy approved rows may have a null approvedAt;
-- their createdAt fallback below is deliberate and deterministic.
DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        WHERE COALESCE(claim."approvedCents", 0) <> 0
          AND claim.status NOT IN ('approved', 'partially_paid', 'paid')
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: nonzero approvedCents exists outside an approved claim lifecycle';
    END IF;
END
$migration$;

-- Approved claims become agency receivable charges. Family billing is not changed.
INSERT INTO "AgencyLedgerEntry" (
    "id", "agencyLedgerAccountId", "claimId", "type", "description",
    "amountCents", "balanceAfterCents", "effectiveAt", "externalReference", "glCodeSnapshot", "costCenterCodeSnapshot",
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
    COALESCE(claim."approvedAt", claim."createdAt"),
    claim."externalReference",
    program."receivableGlCode",
    program."costCenterCode",
    'subsidy_agency',
    'claim-approved:' || claim.id,
    jsonb_build_object('claimNumber', claim.number, 'backfilled', true),
    COALESCE(claim."approvedAt", claim."createdAt")
FROM "SubsidyClaim" claim
JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
WHERE COALESCE(claim."approvedCents", 0) > 0
  AND claim.status IN ('approved', 'partially_paid', 'paid')
ON CONFLICT ("sourceSystem", "externalId") DO NOTHING;

-- Every remittance remains an immutable payment entry, including remittances later reversed.
INSERT INTO "AgencyLedgerEntry" (
    "id", "agencyLedgerAccountId", "claimId", "remittanceId", "type", "description",
    "amountCents", "balanceAfterCents", "effectiveAt", "externalReference", "glCodeSnapshot", "costCenterCodeSnapshot",
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
    program."cashGlCode",
    program."costCenterCode",
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
    "amountCents", "balanceAfterCents", "effectiveAt", "externalReference", "glCodeSnapshot", "costCenterCodeSnapshot",
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
    receipt."glCodeSnapshot",
    receipt."costCenterCodeSnapshot",
    'subsidy_agency',
    'remittance-reversal:' || remittance.id,
    jsonb_build_object('claimNumber', claim.number, 'reason', remittance."reversalReason", 'backfilled', true),
    remittance."reversedAt"
FROM "SubsidyRemittance" remittance
JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
JOIN "AgencyLedgerEntry" receipt ON receipt."sourceSystem" = 'subsidy_agency' AND receipt."externalId" = 'remittance:' || remittance.id
WHERE remittance."reversedAt" IS NOT NULL
ON CONFLICT ("sourceSystem", "externalId") DO NOTHING;

-- A replay may reuse a deterministic source key only when every material financial
-- fact still matches the source row. Never accept a conflicting pre-existing row.
DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "SubsidyClaim" claim
        JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
        JOIN "AgencyLedgerEntry" entry ON entry."sourceSystem" = 'subsidy_agency' AND entry."externalId" = 'claim-approved:' || claim.id
        WHERE COALESCE(claim."approvedCents", 0) > 0
          AND claim.status IN ('approved', 'partially_paid', 'paid')
          AND (
              entry."agencyLedgerAccountId" <> account.id
              OR entry."claimId" IS DISTINCT FROM claim.id
              OR entry."remittanceId" IS NOT NULL
              OR entry.type <> 'claim_approved'
              OR entry."amountCents" <> claim."approvedCents"
              OR entry."effectiveAt" <> COALESCE(claim."approvedAt", claim."createdAt")
              OR entry."externalReference" IS DISTINCT FROM claim."externalReference"
          )
    ) OR EXISTS (
        SELECT 1
        FROM "SubsidyRemittance" remittance
        JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
        JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
        JOIN "AgencyLedgerEntry" entry ON entry."sourceSystem" = 'subsidy_agency' AND entry."externalId" = 'remittance:' || remittance.id
        WHERE entry."agencyLedgerAccountId" <> account.id
           OR entry."claimId" IS DISTINCT FROM claim.id
           OR entry."remittanceId" IS DISTINCT FROM remittance.id
           OR entry.type <> 'remittance_received'
           OR entry."amountCents" <> -remittance."amountCents"
           OR entry."effectiveAt" < remittance."paidAt"
           OR entry."externalReference" IS DISTINCT FROM remittance."externalReference"
    ) OR EXISTS (
        SELECT 1
        FROM "SubsidyRemittance" remittance
        JOIN "SubsidyClaim" claim ON claim.id = remittance."claimId"
        JOIN "AgencyLedgerAccount" account ON account."centerId" = claim."centerId" AND account."agencyProgramId" = claim."agencyProgramId"
        JOIN "AgencyLedgerEntry" entry ON entry."sourceSystem" = 'subsidy_agency' AND entry."externalId" = 'remittance-reversal:' || remittance.id
        JOIN "AgencyLedgerEntry" receipt ON receipt."sourceSystem" = 'subsidy_agency' AND receipt."externalId" = 'remittance:' || remittance.id
        WHERE remittance."reversedAt" IS NOT NULL
          AND (
              entry."agencyLedgerAccountId" <> account.id
              OR entry."claimId" IS DISTINCT FROM claim.id
              OR entry."remittanceId" IS DISTINCT FROM remittance.id
              OR entry.type <> 'remittance_reversal'
              OR entry."amountCents" <> remittance."amountCents"
              OR entry."effectiveAt" <> remittance."reversedAt"
              OR entry."externalReference" IS DISTINCT FROM remittance."externalReference"
              OR entry."glCodeSnapshot" IS DISTINCT FROM receipt."glCodeSnapshot"
              OR entry."costCenterCodeSnapshot" IS DISTINCT FROM receipt."costCenterCodeSnapshot"
          )
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: an existing source key conflicts with source financial facts';
    END IF;
END
$migration$;

-- A receipt may post after its original deposit day only when the reconciliation
-- schema exists and an exact reviewed allocation proves that deferred posting.
-- Dynamic SQL keeps this first migration independently runnable before the later
-- allocation and batch tables/columns have been introduced.
DO $migration$
BEGIN
    IF to_regclass('public."AgencyRemittanceAllocation"') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'AgencyLedgerEntry'
             AND column_name = 'remittanceBatchId'
       ) THEN
        EXECUTE $validation$
            DO $late_receipt$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM public."AgencyLedgerEntry" entry
                    JOIN public."SubsidyRemittance" remittance ON remittance.id = entry."remittanceId"
                    WHERE entry."sourceSystem" = 'subsidy_agency'
                      AND entry."externalId" = 'remittance:' || remittance.id
                      AND entry."effectiveAt" > remittance."paidAt"
                      AND NOT EXISTS (
                          SELECT 1
                          FROM public."AgencyRemittanceAllocation" allocation
                          WHERE allocation."remittanceId" = remittance.id
                            AND allocation."claimId" = remittance."claimId"
                            AND allocation."batchId" = entry."remittanceBatchId"
                            AND allocation.status IN ('posted', 'reversed')
                            AND allocation."reviewedAt" = entry."effectiveAt"
                      )
                ) THEN
                    RAISE EXCEPTION 'Agency ledger migration blocked: a deferred remittance receipt lacks exact reviewed allocation evidence';
                END IF;
            END
            $late_receipt$
        $validation$;
    END IF;
END
$migration$;

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "AgencyLedgerEntry"
        GROUP BY "agencyLedgerAccountId"
        HAVING SUM("amountCents"::bigint) NOT BETWEEN -2147483648 AND 2147483647
    ) OR EXISTS (
        SELECT 1
        FROM (
            SELECT SUM("amountCents"::bigint) OVER (
                PARTITION BY "agencyLedgerAccountId"
                ORDER BY "effectiveAt", "createdAt", id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_balance
            FROM "AgencyLedgerEntry"
        ) running
        WHERE running.running_balance NOT BETWEEN -2147483648 AND 2147483647
    ) THEN
        RAISE EXCEPTION 'Agency ledger migration blocked: an account or running balance exceeds the supported INTEGER range';
    END IF;
END
$migration$;

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
WHERE running_balances.id = entry.id
  AND entry."balanceAfterCents" IS DISTINCT FROM running_balances."balanceAfterCents";

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
WHERE account_balances.id = account.id
  AND account."balanceCents" IS DISTINCT FROM account_balances."balanceCents";

COMMIT;
