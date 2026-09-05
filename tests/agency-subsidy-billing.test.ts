import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activeRemittanceTotalCents,
  agencyClaimApprovalLedgerExternalId,
  agencyRemittanceLedgerExternalId,
  agencyRemittanceReversalLedgerExternalId,
  AGENCY_SUBMISSION_METHODS,
  agencyProgramSetupBlockers,
  agencyProgramStatus,
  claimAmountCents,
  claimSubmissionBlockers,
  nextRemittanceStatus,
  normalizeAgencyRequirements,
  normalizeStateCode,
  subsidyClaimNumber,
} from "../src/lib/agency-subsidy-billing";

test("agency requirements are normalized and deduplicated", () => {
  assert.deepEqual(normalizeAgencyRequirements([
    { key: "attendance", label: "Attendance detail", type: "attendance", required: true },
    { key: "attendance", label: "Duplicate", type: "attendance" },
    { label: "Authorization copy", type: "authorization" },
  ]), [
    { key: "attendance", label: "Attendance detail", type: "attendance", required: true },
    { key: "authorization:authorization-copy", label: "Authorization copy", type: "authorization", required: true },
  ]);
});

test("agency remittance corrections replay safely in both migration ledgers", () => {
  const migrationNames = [
    "20260824150000_agency_remittance_corrections",
    "20260824173000_active_agency_remittance_reference",
    "20260903190000_agency_receivable_ledger",
    "20260903210000_agency_reconciliation_controls",
  ];

  for (const migrationName of migrationNames) {
    const prismaMigration = readFileSync(`prisma/migrations/${migrationName}/migration.sql`, "utf8");
    const supabaseMigration = readFileSync(`supabase/migrations/${migrationName}.sql`, "utf8");
    assert.equal(supabaseMigration, prismaMigration);
    assert.doesNotMatch(prismaMigration, /\b(?:ADD COLUMN|CREATE (?:UNIQUE )?INDEX|DROP INDEX)\s+"/);
    assert.match(prismaMigration, /IF (?:NOT )?EXISTS/);
    assert.doesNotMatch(prismaMigration, /"SubsidyAuthorization"\s+authorization\b/);
    assert.doesNotMatch(prismaMigration, /\bauthorization\.(?:"|id\b)/);
  }

  const reconciliationMigration = readFileSync(
    "prisma/migrations/20260903210000_agency_reconciliation_controls/migration.sql",
    "utf8",
  );
  const adjustmentLinkColumnPosition = reconciliationMigration.indexOf(
    'ALTER TABLE "AgencyLedgerEntry" ADD COLUMN IF NOT EXISTS "adjustmentId" TEXT;',
  );
  const adjustmentSnapshotBackfillPosition = reconciliationMigration.indexOf(
    'UPDATE "AgencyLedgerAdjustment" adjustment',
  );
  assert.ok(adjustmentLinkColumnPosition >= 0);
  assert.ok(adjustmentSnapshotBackfillPosition >= 0);
  assert.ok(adjustmentLinkColumnPosition < adjustmentSnapshotBackfillPosition);
  assert.match(reconciliationMigration, /Preserve only remittances that are not already represented by an allocation/);
  assert.match(reconciliationMigration, /WHEN remittance\."reversedAt" IS NULL THEN 'active'/);
  assert.match(reconciliationMigration, /'reversed:' \|\| TO_CHAR\(remittance\."reversedAt" AT TIME ZONE 'UTC'/);
  assert.match(reconciliationMigration, /WHERE NOT EXISTS \([\s\S]*"AgencyRemittanceAllocation" allocation[\s\S]*allocation\."remittanceId" = remittance\.id/);
  assert.match(reconciliationMigration, /grouped\.normalized_payment_method,[\s\S]*grouped\.total_cents,\s+grouped\.total_cents,\s+0,/);
  assert.match(reconciliationMigration, /ON CONFLICT \("id"\) DO NOTHING;[\s\S]*existing legacy batch conflicts with source financial facts/);
  assert.match(reconciliationMigration, /existing legacy allocation conflicts with source financial facts/);
  assert.doesNotMatch(reconciliationMigration, /grouped\.any_reversed/);
});

test("agency reconciliation migration keeps controlled history fail closed without disabling baseline corrections", () => {
  const migration = readFileSync(
    "prisma/migrations/20260903210000_agency_reconciliation_controls/migration.sql",
    "utf8",
  );
  const remittanceHistory = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.protect_subsidy_remittance_history"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.protect_agency_remittance_batch_history"),
  );
  const batchHistory = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.protect_agency_remittance_batch_history"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.protect_agency_remittance_allocation_history"),
  );

  assert.match(migration, /SubsidyRemittance_reversal_chronology_check[\s\S]*DATE_TRUNC\('day', "reversedAt"\) >= DATE_TRUNC\('day', "paidAt"\)/);
  assert.match(migration, /SubsidyRemittance_reversal_chronology_check";/);
  assert.match(remittanceHistory, /NEW\."reversedById" = batch\."enteredById"[\s\S]*controlled remittance reversal requires an actor other than the batch preparer/i);
  assert.doesNotMatch(remittanceHistory, /NEW\."reversedById"\s*=\s*OLD\."enteredById"/);
  assert.match(batchHistory, /NEW\."reversedById" = OLD\."enteredById"/);
  assert.match(migration, /Pre-activation baseline claim allocation adopted without review inference/);
  assert.match(migration, /'legacy-allocation:adoption:' \|\| source\.remittance_id,[\s\S]*source\.entered_by,\s+NULL,\s+NULL,/);
  assert.match(migration, /AgencyRemittanceBatch_material_state_guard"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*enforce_agency_remittance_batch_material_state/);
  assert.match(migration, /AgencyRemittanceAllocation_batch_material_state_guard"[\s\S]*AFTER INSERT OR UPDATE OR DELETE[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*enforce_agency_allocation_batch_material_state/);
  assert.match(migration, /reversed_count <> 0[\s\S]*batch_row\.status <> 'reversed'[\s\S]*A non-reversed controlled batch contains reversed allocations/);
  assert.match(migration, /AgencyLedgerAdjustment_material_state_guard"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*enforce_agency_ledger_adjustment_material_state/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.assert_agency_remittance_batch_material_state\(TEXT\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.assert_agency_ledger_entry_provenance[\s\S]*AgencyLedgerEntry_exact_provenance_guard/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enforce_controlled_claim_approval_snapshot[\s\S]*NEW\."glCodeSnapshot" IS DISTINCT FROM receivable_gl_code[\s\S]*NEW\."costCenterCodeSnapshot" IS DISTINCT FROM cost_center_code[\s\S]*AgencyLedgerEntry_claim_approval_snapshot_guard/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enforce_controlled_claim_approval_snapshot[\s\S]*lock_agency_financial_centers\(affected_center_ids\)[\s\S]*Re-read the program mapping after the shared school fence/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.protect_subsidy_claim_financial_source[\s\S]*Approved subsidy claim source facts are immutable/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.protect_subsidy_claim_line_financial_source[\s\S]*Approved subsidy claim lines are immutable financial source evidence/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.assert_subsidy_claim_financial_state[\s\S]*active_remittance_cents[\s\S]*exact_approval_entry_count[\s\S]*SubsidyClaim_financial_state_guard/);
  assert.match(migration, /SubsidyRemittance_claim_financial_state_guard"[\s\S]*AFTER INSERT OR UPDATE OR DELETE[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.protect_agency_ledger_account_history[\s\S]*NEW\."agencyProgramId" IS DISTINCT FROM OLD\."agencyProgramId"[\s\S]*Agency ledger account ownership is immutable once created/);
  assert.match(migration, /AgencyLedgerAccount_immutable_history_guard"[\s\S]*BEFORE UPDATE OR DELETE/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.assert_agency_ledger_account_balances[\s\S]*ORDER BY entry\."effectiveAt", entry\."createdAt", entry\.id[\s\S]*Agency ledger running balances conflict/);
  assert.match(migration, /AgencyLedgerAccount_exact_balance_guard"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*enforce_agency_ledger_account_balances/);
  assert.match(migration, /AgencyLedgerEntry_exact_balance_guard"[\s\S]*DEFERRABLE INITIALLY DEFERRED[\s\S]*enforce_agency_ledger_entry_account_balances/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lock_agency_financial_center[\s\S]*pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lock_agency_financial_centers[\s\S]*ORDER BY candidate\.value[\s\S]*lock_agency_financial_center/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enforce_agency_accounting_period_order[\s\S]*lock_agency_financial_centers\(ARRAY\[[\s\S]*Agency accounting periods require school reconciliation activation[\s\S]*period\."startDate" <= NEW\."endDate"[\s\S]*period\."endDate" >= NEW\."startDate"[\s\S]*later closed agency accounting period must be reopened first/i);
  assert.match(migration, /AgencyAccountingPeriod_order_guard"[\s\S]*BEFORE INSERT OR UPDATE[\s\S]*enforce_agency_accounting_period_order/);
  assert.match(migration, /existing accounting period ranges overlap/);
  assert.match(migration, /JOIN public\."AgencyLedgerEntry" receipt[\s\S]*COUNT\(DISTINCT \(receipt\."glCodeSnapshot", receipt\."costCenterCodeSnapshot"\)\) <> 1/);
  assert.match(migration, /Agency reconciliation activation requires at least one active agency program/);
  assert.match(migration, /Agency reconciliation activation requires complete mappings for every active agency program/);
  assert.match(migration, /An activated school must retain at least one active mapped agency program/);
  assert.match(migration, /AgencyProgram_activation_readiness_guard"[\s\S]*BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(migration, /Agency reconciliation activation cannot be disabled after controlled financial history exists/);
  assert.match(migration, /Center_agency_reconciliation_inactive_evidence_check[\s\S]*"agencyReconciliationActivatedAt" IS NULL/);
  assert.match(migration, /Agency reconciliation activation evidence is immutable after activation/);
  assert.match(migration, /NEW\.status <> 'active'[\s\S]*Only an active school can enable agency reconciliation/);
  assert.match(migration, /Agency reconciliation activation evidence is incomplete or future-dated/);
  assert.match(migration, /BEFORE UPDATE OF "agencyReconciliationEnabled", "agencyReconciliationActivatedAt", "agencyReconciliationActivatedById", "agencyReconciliationActivationReason"/);
  assert.match(migration, /Subsidy authorization update conflicts with an existing claim or claim-line scope/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enforce_agency_ledger_account_scope[\s\S]*lock_agency_financial_centers[\s\S]*Agency ledger account scope conflict/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enforce_agency_remittance_allocation_scope[\s\S]*post-lock rereads[\s\S]*lock_agency_financial_centers\(affected_center_ids\)[\s\S]*SELECT batch\."centerId"[\s\S]*SELECT claim\."centerId"/);
  assert.match(migration, /A subsidy claim with remittance allocation history cannot move schools or programs/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enforce_subsidy_authorization_scope[\s\S]*lock_agency_financial_centers[\s\S]*Re-read every relationship after the shared school locks/);
  assert.match(migration, /COALESCE\(claim_row\."approvedCents", 0\) <> 0[\s\S]*A nonfinancial subsidy claim cannot retain approval or remittance postings/);
  assert.match(migration, /IF NOT reconciliation_enabled THEN[\s\S]*ensure_baseline_claim_ledger_projection\(claim_row\.id\)[\s\S]*approval_entry_count <> 1[\s\S]*exact_approval_entry_count <> 1/);
  assert.match(migration, /IF NOT reconciliation_enabled AND NOT has_allocation_record THEN[\s\S]*ensure_baseline_remittance_ledger_projection\(target_remittance_id\)/);
  assert.match(migration, /SubsidyRemittance_00_financial_center_lock_guard[\s\S]*BEFORE INSERT OR UPDATE OR DELETE[\s\S]*lock_subsidy_remittance_financial_center/);
  assert.match(migration, /period\.status = 'open'[\s\S]*period\."reopenedAt" < period\."closedAt"[\s\S]*period\.status = 'closed'[\s\S]*period\."closedAt" < period\."reopenedAt"/);
  assert.match(migration, /Agency reconciliation activation blocked: a financial claim lacks exact receivable ledger evidence/);
  assert.match(migration, /COALESCE\(claim_row\."approvedAt", claim_row\."createdAt"\) >= DATE_TRUNC\('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'\) \+ INTERVAL '1 day'/);
  assert.ok(migration.includes("NEW.\"reconciliationFingerprint\" !~ '^[0-9a-f]{64}$'"));
  assert.ok(migration.includes("NEW.fingerprint !~ '^[0-9a-f]{64}$'"));
  assert.match(migration, /Controlled agency remittance batch evidence or fingerprint is incomplete/);
  assert.match(migration, /A controlled agency remittance batch must begin pending independent review/);
  assert.match(migration, /Controlled agency remittance allocation fingerprint is invalid/);
  assert.match(migration, /A controlled agency remittance allocation must begin pending independent review/);
  assert.match(migration, /Agency ledger adjustment evidence is incomplete/);
  assert.match(migration, /An agency ledger adjustment must begin pending independent review/);
  assert.match(migration, /related_claim_status NOT IN \('approved', 'partially_paid', 'paid'\)[\s\S]*Agency ledger adjustment requires an exact approved-lifecycle claim in the same school and program/);
  assert.match(migration, /adjustment\."claimId" IS NOT NULL[\s\S]*claim\.status NOT IN \('approved', 'partially_paid', 'paid'\)/);
  assert.match(migration, /Agency remittance batch receipt, review, or reversal cannot be future-dated/);
  assert.match(migration, /Agency remittance batch review or reversal chronology is invalid/);
  assert.match(migration, /Agency remittance allocation review cannot be future-dated/);
  assert.match(migration, /Agency remittance allocation review cannot predate its request/);
  assert.match(migration, /Agency ledger adjustment, review, or reversal cannot be future-dated/);
  assert.match(migration, /Agency ledger adjustment review or reversal chronology is invalid/);
  assert.match(migration, /Agency accounting period close or reopen evidence cannot be future-dated/);
  assert.match(migration, /Agency accounting period cannot close a future boundary or predate its period end/);
  assert.match(migration, /Agency accounting period transition chronology is invalid/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "AgencyAccountingPeriodEvent"[\s\S]*"sequence" INTEGER NOT NULL[\s\S]*"evidence" JSONB/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_agency_accounting_period_transition[\s\S]*AgencyAccountingPeriodEvent/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.protect_agency_accounting_period_event_history[\s\S]*append-only/);
  assert.match(migration, /AgencyAccountingPeriod_event_state_guard[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /block_agency_writes_during_reconciliation_migration[\s\S]*temporarily frozen[\s\S]*DROP FUNCTION IF EXISTS public\.block_agency_writes_during_reconciliation_migration/);
  assert.match(migration, /Agency reconciliation migration blocked: existing accounting period chronology is invalid/);
  assert.match(migration, /AgencyAccountingPeriod_state_check[\s\S]*"startDate" = DATE_TRUNC\('day', "startDate"\) \+ INTERVAL '12 hours'[\s\S]*"endDate" = DATE_TRUNC\('day', "endDate"\) \+ INTERVAL '12 hours'/);
  assert.match(migration, /TG_OP = 'INSERT'[\s\S]*DATE_TRUNC\('day', period\."endDate"\) >= DATE_TRUNC\('day', NEW\."effectiveAt"\)[\s\S]*Agency ledger activity cannot post before or within a later closed accounting period/);
  assert.match(migration, /A rejected agency remittance allocation requires review notes/);
  assert.match(migration, /A rejected agency adjustment requires review notes/);
  assert.match(migration, /NEW\."idempotencyKey" LIKE 'legacy:%' AND pg_trigger_depth\(\) <= 1[\s\S]*Legacy agency remittance batches may only be created by verified activation adoption/);
  assert.match(migration, /NEW\."idempotencyKey" LIKE 'legacy-allocation:%' AND pg_trigger_depth\(\) <= 1[\s\S]*Legacy agency remittance allocations may only be created by verified activation adoption/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.adopt_pre_activation_agency_remittances[\s\S]*SET timezone = 'UTC'/);
  assert.match(migration, /pg_try_advisory_xact_lock[\s\S]*agency_financial_center_[\s\S]*'held'/);
  assert.match(migration, /DROP TRIGGER IF EXISTS "AgencyLedgerEntry_immutable_history_guard"[\s\S]*JOIN "_AgencyReconciliationLegacyRemittanceBackfill" expected[\s\S]*allocation\."idempotencyKey" = 'legacy-allocation:' \|\| expected\.remittance_id/);
  assert.match(migration, /Agency ledger financial facts are immutable; post a compensating reversal/);
});

test("claim math and identifiers are deterministic", () => {
  assert.equal(normalizeStateCode(" in "), "IN");
  assert.equal(normalizeStateCode("Indiana"), "");
  assert.equal(claimAmountCents({ serviceUnits: 4.5, rateCents: 12000 }), 54000);
  assert.equal(subsidyClaimNumber({ stateCode: "IN", centerId: "center_123456", now: new Date("2026-08-14T12:00:00Z"), suffix: "abc-123" }), "SUB-IN-123456-20260814-ABC123");
  assert.equal(agencyClaimApprovalLedgerExternalId(" claim-1 "), "claim-approved:claim-1");
  assert.equal(agencyRemittanceLedgerExternalId(" remittance-1 "), "remittance:remittance-1");
  assert.equal(agencyRemittanceReversalLedgerExternalId(" remittance-1 "), "remittance-reversal:remittance-1");
});

test("submission is fail closed on program setup and documentation", () => {
  assert.deepEqual(claimSubmissionBlockers({
    submissionMethod: "agency_portal",
    documents: [{ name: "Attendance", status: "required" }],
  }), [
    "Add the school-specific provider or vendor number.",
    "Add the official agency portal URL.",
    "Document the verified direct-deposit or payment-vendor setup.",
    "Complete required item: Attendance.",
  ]);
  assert.deepEqual(claimSubmissionBlockers({
    providerNumber: "PROV-1",
    submissionMethod: "agency_portal",
    portalUrl: "https://agency.example/provider",
    paymentInstructions: "Direct deposit verified with agency vendor",
    documents: [{ name: "Attendance", status: "verified" }],
  }), []);
});

test("agency setup remains blocked until provider, submission, and payment setup are documented", () => {
  assert.deepEqual(agencyProgramSetupBlockers({ submissionMethod: "agency_portal" }), [
    "Add the school-specific provider or vendor number.",
    "Add the official agency portal URL.",
    "Document the verified direct-deposit or payment-vendor setup.",
  ]);
  assert.equal(agencyProgramStatus({
    vendorNumber: "VENDOR-9",
    submissionMethod: "secure_email",
    paymentInstructions: "ACH enrollment confirmed by agency",
  }), "active");
});

test("agency mutations require evidence and external references", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /Complete agency setup before adding child authorizations/);
  assert.match(route, /Add an evidence note or linked document before marking this item verified/);
  assert.match(route, /Enter the confirmation reference returned by the external agency channel/);
  assert.match(route, /Enter the agency decision or claim reference/);
  assert.match(route, /approvedCents <= 0/);
  assert.match(route, /Record an agency approval before posting a remittance/);
});

test("agency readiness compares authorization expiration by UTC calendar day", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /Date\.UTC\(now\.getUTCFullYear\(\), now\.getUTCMonth\(\), now\.getUTCDate\(\)\)/);
  assert.match(route, /expirationCutoff\.getUTCDate\(\) \+ 31/);
  assert.match(route, /authorization\.coverageEnd < expirationCutoff/);
});

test("agency approvals preserve dollar units when posted", () => {
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(workspace, /decision: "approved", approvedDollars: form\.get\("approvedDollars"\), externalReference: form\.get\("externalReference"\)/);
  assert.doesNotMatch(workspace, /approvedDollars: approvedAmount/);
});

test("agency authorization entry resets and shows the selected child's saved rate", () => {
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(workspace, /key=\{`\$\{centerId\}:\$\{programId\}:\$\{familyId\}:\$\{childId\}:\$\{editingAuthorizationId\}`\}/);
  assert.match(workspace, /authorization\.childId === childId/);
  assert.match(workspace, /authorization\.agencyProgramId === programId/);
  assert.match(workspace, /Saved authorization\{selectedChildAuthorizations\.length === 1/);
  assert.match(workspace, /money\(authorization\.authorizedRateCents\).*authorization\.unitType/);
  assert.match(workspace, /authorization\.agencyProgram\.name.*money\(authorization\.authorizedRateCents\)/);
  assert.match(workspace, /Switching children clears the entry fields/);
});

test("agency family choices include child and guardian names", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(route, /guardians: \{ select: \{ fullName: true \}, orderBy: \{ fullName: "asc" \} \}/);
  assert.match(workspace, /function familyOptionLabel\(family: Family\)/);
  assert.match(workspace, /family\.children\.map\(\(child\) => child\.fullName\)/);
  assert.match(workspace, /family\.guardians\.map\(\(guardian\) => guardian\.fullName\)/);
  assert.match(workspace, /Options include the family, current child, and guardian names/);
});

test("authorization corrections fail closed and return useful duplicate guidance", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(route, /currently enrolled child with an assigned classroom can receive a new agency authorization/);
  assert.match(route, /subsidyAuthorizations: \{ some: \{\} \}/);
  assert.match(route, /currentlyEnrolledStatusValues/);
  assert.match(route, /isCurrentlyEnrolledChildRecord/);
  assert.match(route, /action === "updateAuthorization"/);
  assert.match(route, /action === "restoreAuthorization"/);
  assert.match(route, /claims: \{ where: \{ status: \{ not: "void" \}/);
  assert.match(route, /This authorization already exists[\s\S]*Use Edit authorization/);
  assert.match(route, /Family copay cannot be negative/);
  assert.match(route, /validCurrencyInput\(body\.familyCopayDollars, true\)/);
  assert.match(route, /no more than two decimal places/);
  assert.match(route, /date\.toISOString\(\)\.slice\(0, 10\) !== text/);
  assert.match(route, /AUTHORIZATION_UNIT_TYPES/);
  assert.match(route, /updateAuthorization"\)[\s\S]*prisma\.\$transaction[\s\S]*AGENCY_WRITE_TRANSACTION_OPTIONS/);
  assert.match(workspace, /Edit authorization/);
  assert.match(workspace, /Save correction/);
  assert.match(workspace, /Restore/);
  assert.match(workspace, /Authorized units/);
  assert.match(workspace, /former child[\s\S]*review or archive/);
  assert.match(workspace, /authorization\.status === "active" && isCurrentlyEnrolledChildRecord\(authorization\.child\)/);
});

test("agency claims enforce active authorizations, periods, units, and state transitions", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(route, /authorization\.status !== "active"/);
  assert.match(route, /isCurrentlyEnrolledChildRecord\(authorization\.child\)[\s\S]*assigned classroom can be used for a new claim/);
  assert.match(route, /servicePeriodStart: \{ lte: end \}[\s\S]*servicePeriodEnd: \{ gte: start \}/);
  assert.match(route, /exceed the authorization's total approved units/);
  assert.match(route, /unitsAtPrecision\(\(used\._sum\.serviceUnits \?\? 0\) \+ units\) > unitsAtPrecision\(authorization\.authorizedUnits\)/);
  assert.match(route, /\|\\\.\\d\+\)\$\/\.test\(text\)/);
  assert.match(route, /cannot exceed the authorization rate/);
  assert.match(route, /claim\.status !== "submitted"/);
  assert.match(route, /recordDecision"\)[\s\S]*requireCurrentAgencyClaimMutationScope\(tx, claim\.id, centerId, auth\.user\)[\s\S]*tx\.subsidyClaim\.updateMany[\s\S]*centerId[\s\S]*updatedAt: current\.updatedAt[\s\S]*claimSubmissionBlockers/);
  assert.match(route, /Complete every required claim document before recording agency approval/);
  assert.match(route, /updateDocument"\)[\s\S]*requireCurrentAgencyClaimMutationScope\(tx, claim\.id, centerId, auth\.user\)[\s\S]*tx\.subsidyClaim\.updateMany[\s\S]*status: \{ in: \["draft", "ready", "submitted"\] \}/);
  assert.match(route, /COUNT\(\*\) FILTER \(WHERE claim\.status IN \('draft', 'ready', 'submitted'\) AND \(/);
  assert.match(route, /Documents cannot be changed after the agency decision is recorded/);
  assert.match(route, /Enter the agency denial reason or code/);
  assert.match(route, /action === "voidClaim"/);
  assert.match(route, /submitClaim"\)[\s\S]*requireCurrentAgencyClaimMutationScope\(tx, claim\.id, centerId, auth\.user\)[\s\S]*updateMany\(\{ where: \{ id: current\.id, centerId, status: \{ in: \["draft", "ready"\] \}, updatedAt: current\.updatedAt \}/);
  assert.match(route, /The claim changed before it could be voided/);
  assert.match(workspace, /Record denial/);
  assert.match(workspace, /Void draft/);
  assert.match(workspace, /name="serviceUnits"[\s\S]*step="0\.000001"/);
  assert.match(workspace, /selectedClaimAuthorization\?\.coverageStart\.slice\(0, 10\)/);
  assert.match(workspace, /selectedClaimAuthorization\?\.coverageEnd\.slice\(0, 10\)/);
  assert.match(workspace, /onError: setClaimError/);
  assert.match(workspace, /Draft claim created and added to the agency claim queue below/);
  assert.match(workspace, /createdClaim\.authorization\?\.child\.fullName/);
  assert.match(workspace, /claims: \[createdClaim, \.\.\.current\.claims\.filter/);
  assert.match(route, /authorization: \{ include: \{ child: \{ select: \{ fullName: true \} \}, family: \{ select: \{ name: true \} \} \} \}/);
});

test("agency queue keeps new sibling claims visible and older actionable claims reachable", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(route, /CLAIM_PAGE_SIZE = 100/);
  assert.match(route, /subsidyClaim\.findMany\([\s\S]*orderBy: \[\{ createdAt: "desc" \}, \{ dueDate: "asc" \}, \{ id: "desc" \}\][\s\S]*cursor: \{ id: claimCursor \}, skip: 1[\s\S]*take: CLAIM_PAGE_SIZE \+ 1/);
  assert.match(route, /claimPagination: \{ page: claimPage, pageSize: CLAIM_PAGE_SIZE, hasNext: hasNextClaimPage, nextCursor:/);
  assert.match(workspace, /claimPage=\$\{claimPage\}/);
  assert.match(workspace, /Claim queue page \{claimPagination\.page\}/);
  assert.match(workspace, /setClaimPage\(1\)/);
  assert.match(workspace, /setClaimError\(""\); setClaimMessage\(""\); setData\(null\)/);
  assert.match(workspace, /reloadClaimPage: 1/);
  assert.match(workspace, /const reloadPage = callbacks\.reloadClaimPage \?\? claimPage;[\s\S]*setLedgerPage\(1\); setLedgerCursorByPage\(\{\}\);[\s\S]*setBatchPage\(1\); setBatchCursorByPage\(\{\}\);[\s\S]*setAdjustmentPage\(1\); setAdjustmentCursorByPage\(\{\}\);[\s\S]*await load\(reloadPage, reloadPage === 1 \? "" : claimCursorByPage\[reloadPage\] \?\? "", "", 1, "", 1, ""\)/);
  assert.match(workspace, /exportClaims=true/);
  assert.match(workspace, /response\.blob\(\)/);
  assert.match(workspace, /const blob = await response\.blob\(\);\s+if \(centerIdRef\.current !== exportCenterId\) return;/);
  assert.match(workspace, /centerIdRef\.current !== requestCenterId/);
  assert.match(workspace, /setPending\(true\); setError\(""\); setClaimCursorByPage/);
  assert.match(workspace, /\.finally\(\(\) => \{ if \(active\) setPending\(false\); \}\)/);
  assert.match(workspace, /<Label htmlFor="claim-authorization">Authorization<\/Label><Select value=\{authorizationId\} disabled=\{pending\}/);
  assert.match(route, /const fileStream = createReadStream\(exportPath\)/);
  assert.match(route, /orderBy: \{ id: "asc" \}/);
  assert.match(route, /take: 250/);
  assert.match(route, /cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /const formulaSafeText = typeof value === "string" && \/\^\\s\*\[=\+\\-@\]\//);
  assert.match(route, /if \(typeof value === "number" && Number\.isFinite\(value\)\) return String\(value\)/);
  assert.match(route, /formulaSafeText\.replaceAll\('"', '""'\)/);
  assert.match(route, /if \(exportingClaims\) return await exportClaimsCsv\(centerIds\)/);
});

test("agency remittances are staged, independently reviewed, and posted serializably", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  const reconciliation = readFileSync("src/components/agency-reconciliation-controls.tsx", "utf8");
  assert.match(route, /action === "prepareRemittanceBatch"/);
  assert.match(route, /action === "recordRemittance"[\s\S]*agencyReconciliationEnabled[\s\S]*reviewed deposit batches/);
  assert.match(route, /agencyPostingClaim\(tx, allocation\.claimId\)/);
  assert.match(route, /action === "approveRemittanceBatch"/);
  assert.match(route, /action === "rejectBatchAllocation"/);
  assert.match(route, /reviewNotes: reason/);
  assert.match(route, /agencyBatchStatus\(\{ totalCents: allocation\.batch\.totalCents, allocatedCents: allocation\.batch\.allocatedCents \}\)/);
  assert.match(route, /canReviewAgencyPosting\(\{ role: auth\.user\.role, reviewerId: auth\.user\.id, requestedById: batch\.enteredById \}\)/);
  assert.match(route, /const AGENCY_WRITE_TRANSACTION_OPTIONS = \{[\s\S]*isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable,[\s\S]*maxWait: 10_000,[\s\S]*timeout: 120_000/);
  assert.match(route, /\["P2002", "P2028", "P2034"\]/);
  assert.equal((route.match(/}, AGENCY_WRITE_TRANSACTION_OPTIONS\);/g) ?? []).length, 26);
  assert.match(route, /REMITTANCE_METHODS/);
  assert.match(route, /entryAuthorizationNumber && entryAgencyName[\s\S]*entryAuthorizationNumber === authorizationNumber && entryAgencyName === agencyName/);
  assert.match(route, /already have a remittance batch with this payment reference/);
  assert.match(workspace, /preparationKey: persistentAgencyRetryKey\(storageKey\)/);
  assert.match(workspace, /idempotencyKey: claimAction\.preparationKey \?\? persistentAgencyRetryKey\(remittanceStorageKey\)/);
  assert.match(workspace, /allocations: \[\{ claimId: claimAction\.claim\.id, amountDollars: form\.get\("amountDollars"\), notes: form\.get\("notes"\) \}\]/);
  assert.match(workspace, /Start different remittance/);
  assert.doesNotMatch(workspace, /agency-single:\$\{claimAction\.claim\.id\}:\$\{externalReference\.trim\(\)\.toUpperCase\(\)\}/);
  assert.match(workspace, /Prepare remittance/);
  assert.match(reconciliation, /Approve and post/);
  assert.match(reconciliation, /post\("rejectBatchAllocation", \{ allocationId: allocation\.id, reason: form\.get\("reason"\) \}\)/);
  assert.match(workspace, /Approvals and remittances post to the separate agency ledger/);
});

test("agency receivables use a dedicated immutable ledger with a legacy-only family mirror", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync("prisma/migrations/20260903190000_agency_receivable_ledger/migration.sql", "utf8");
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");

  assert.match(schema, /model AgencyLedgerAccount \{[\s\S]*@@unique\(\[centerId, agencyProgramId\]\)/);
  assert.match(schema, /model AgencyLedgerEntry \{[\s\S]*amountCents\s+Int[\s\S]*balanceAfterCents\s+Int[\s\S]*@@unique\(\[sourceSystem, externalId\]\)/);
  assert.match(migration, /Approved claims become agency receivable charges\. Family billing is not changed\./);
  assert.match(migration, /'claim_approved'/);
  assert.match(migration, /'remittance_received'/);
  assert.match(migration, /'remittance_reversal'/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lock_agency_financial_center[\s\S]*pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lock_agency_financial_centers[\s\S]*ORDER BY candidate\.value[\s\S]*lock_agency_financial_center/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enforce_agency_ledger_account_scope[\s\S]*lock_agency_financial_centers[\s\S]*Agency ledger account scope conflict/);
  assert.match(migration, /FROM "AgencyProgram" program[\s\S]*WHERE NOT EXISTS \([\s\S]*ORDER BY program\."centerId", program\.id[\s\S]*ON CONFLICT \("centerId", "agencyProgramId"\) DO NOTHING/);
  assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|INSERT INTO) "BillingAccount"|(?:UPDATE|DELETE FROM|INSERT INTO) "LedgerEntry"/);

  assert.match(route, /ensureAgencyClaimReceivable/);
  assert.match(route, /type: "claim_approved"/);
  assert.match(route, /type: "remittance_received"/);
  assert.match(route, /type: "remittance_reversal"/);
  assert.match(route, /agencyLedgerAccount\.findMany/);
  assert.match(route, /agencyLedgerEntry\.findMany/);
  assert.match(route, /if \(exportingLedger\) return await exportAgencyLedgerCsv\(centerIds\)/);
  assert.match(route, /legacyCompatibilityMirror: true/);
  assert.match(route, /const appliedCents = Math\.min\([\s\S]*input\.amountCents,[\s\S]*Math\.max\(0, matchingOutstandingCents\),[\s\S]*Math\.max\(0, totalAgencyResponsibilityCents\)/);
  assert.match(route, /parentVisibleAfterCents !== parentVisibleBeforeCents[\s\S]*legacy compatibility mirror would change parent-visible responsibility/i);

  assert.match(workspace, /title="Agency ledger"/);
  assert.match(workspace, /Ledger receivable/);
  assert.match(workspace, /exportLedger=true/);
  assert.match(workspace, /Family balances and parent payments do not post here/);
  assert.match(workspace, /Compatibility settlement is limited to clearing those pre-existing agency receivables/);
});

test("agency reconciliation controls cover deposit batches, exceptions, period close, and complete exports", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const periodCloseReconciliation = route.slice(route.indexOf("async function agencyReconciliationVarianceCount"), route.indexOf("function claimRequirements"));
  const periodCloseRecovery = route.slice(route.indexOf("async function recoverMissingAgencyLedgerCutoverEvents"), route.indexOf("type AgencyPostingClaim"));
  const periodCloseMutation = route.slice(route.indexOf('if (action === "closeAccountingPeriod")'), route.indexOf('if (action === "reopenAccountingPeriod")'));
  const controls = readFileSync("src/components/agency-reconciliation-controls.tsx", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  const retryKeys = readFileSync("src/lib/agency-retry-key.ts", "utf8");
  const prismaMigration = readFileSync("prisma/migrations/20260903210000_agency_reconciliation_controls/migration.sql", "utf8");
  const supabaseMigration = readFileSync("supabase/migrations/20260903210000_agency_reconciliation_controls.sql", "utf8");

  assert.equal(prismaMigration, supabaseMigration);
  assert.match(schema, /model AgencyRemittanceBatch \{[\s\S]*@@index\(\[centerId, agencyProgramId, referenceKey\]\)/);
  assert.match(schema, /model AgencyRemittanceAllocation \{[\s\S]*remittanceId\s+String\?\s+@unique[\s\S]*idempotencyKey\s+String\s+@unique/);
  assert.match(schema, /model AgencyLedgerAdjustment \{[\s\S]*status\s+String\s+@default\("pending_review"\)[\s\S]*idempotencyKey\s+String\s+@unique/);
  assert.match(schema, /model AgencyProgram \{[\s\S]*receivableGlCode\s+String\?[\s\S]*cashGlCode\s+String\?[\s\S]*adjustmentGlCode\s+String\?[\s\S]*costCenterCode\s+String\?/);
  assert.match(schema, /model AgencyRemittanceBatch \{[\s\S]*followUpOwnerId\s+String\?[\s\S]*followUpDueAt\s+DateTime\?/);
  assert.match(schema, /model AgencyAccountingPeriod \{[\s\S]*@@unique\(\[centerId, startDate, endDate\]\)/);
  assert.match(prismaMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(prismaMigration, /CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceBatch_active_referenceKey_key"[\s\S]*WHERE "status" NOT IN \('rejected', 'reversed'\) AND "reversedAt" IS NULL/);
  assert.match(prismaMigration, /CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_idempotencyKey_key"/);
  assert.match(prismaMigration, /CREATE UNIQUE INDEX IF NOT EXISTS "AgencyRemittanceAllocation_active_batch_claim_key"[\s\S]*WHERE "status" IN \('pending_review', 'posted'\)/);
  assert.match(prismaMigration, /CREATE UNIQUE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_idempotencyKey_key"/);
  assert.match(prismaMigration, /FROM "_AgencyReconciliationLegacyBatchBackfill" grouped\s+ON CONFLICT \("id"\) DO NOTHING;/);
  assert.doesNotMatch(prismaMigration, /ON CONFLICT \("centerId", "agencyProgramId", "referenceKey"\)/);
  assert.match(prismaMigration, /'legacy-allocation:' \|\| source\.remittance_id/);
  assert.match(prismaMigration, /Historical baseline record retained without inferring independent review/);
  assert.match(route, /type: "unapplied_cash"/);
  assert.match(route, /type: "unapplied_cash_allocation"/);
  assert.match(route, /action === "requestLedgerAdjustment"/);
  assert.match(route, /action === "requestBatchAllocation"[\s\S]*agencyRemittanceAllocation\.findUnique\(\{ where: \{ idempotencyKey \}/);
  assert.match(route, /This retry key was already used for a different batch allocation/);
  assert.match(route, /existingActiveClaimAllocation[\s\S]*batchId: batch\.id, claimId, status: \{ in: \["pending_review", "posted"\] \}[\s\S]*already has an active allocation for that claim/);
  assert.match(route, /idempotencyKey: `batch-allocation:\$\{batch\.id\}:\$\{allocation\.claimId\}`/);
  assert.match(route, /agencyAllocationFingerprint\(\{ batchId, claimId, amountCents, notes \}\)/);
  assert.match(route, /action === "requestLedgerAdjustment"[\s\S]*agencyLedgerAdjustment\.findUnique\(\{ where: \{ idempotencyKey \}/);
  assert.match(route, /This retry key was already used for a different agency adjustment/);
  assert.match(route, /agencyAdjustmentFingerprint\(\{ ledgerAccountId: account\.id, claimId, batchId, type, amountCents, effectiveAt, reason, evidenceName, evidenceReference, followUpDueAt \}\)/);
  assert.match(route, /if \(claimId\) \{[\s\S]*status: \{ in: \["approved", "partially_paid", "paid"\] \}[\s\S]*claim-linked adjustment requires an approved, partially paid, or paid claim/);
  assert.match(route, /if \(adjustment\.claimId\) \{[\s\S]*status: \{ in: \["approved", "partially_paid", "paid"\] \}[\s\S]*linked claim is no longer an exact approved, partially paid, or paid claim/);
  assert.match(route, /action === "closeAccountingPeriod"/);
  assert.match(route, /const currentAccountingDate = dateValue\(dateInput\(new Date\(\)\)\) \?\? new Date\(\);\s+if \(endDate > currentAccountingDate\)[\s\S]*cannot be closed beyond the current UTC accounting day/);
  assert.match(route, /assertAgencyPeriodOpen/);
  assert.match(route, /status: "closed", endDate: \{ gte: accountingDate \}[\s\S]*or a later accounting period is closed/);
  assert.doesNotMatch(route, /status: "closed", startDate: \{ lte: accountingDate \}, endDate: \{ gte: accountingDate \}/);
  assert.match(route, /status: \{ in: \["unmatched", "partially_allocated", "exception"\] \}[\s\S]*paidAt: \{ lt: endExclusive \}/);
  assert.match(route, /status: "pending_review",\s+createdAt: \{ lt: endExclusive \},\s+batch: \{ centerId, reviewedAt: \{ not: null \} \}/);
  assert.match(route, /agencyLedgerAdjustment\.count\(\{[\s\S]*status: "pending_review",\s+effectiveAt: \{ lt: endExclusive \}/);
  assert.match(route, /WITH running AS \([\s\S]*SUM\("amountCents"\) OVER \([\s\S]*ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW[\s\S]*UPDATE "AgencyLedgerEntry" AS ledger_entry/);
  assert.match(route, /if \(options\.recalculate === false\) return \{ account, entry \}/);
  assert.match(route, /postAgencyClaimAllocation\(tx,[\s\S]*\{ recalculateAgencyLedger: false \}\)/);
  assert.match(route, /await recalculateAgencyLedgerBalances\(tx, agencyLedgerAccountId\)/);
  assert.match(route, /tx\.\$queryRaw<AgencyPeriodLedgerAggregateRow\[\]>`[\s\S]*SUM\(entry\."amountCents"\)[\s\S]*"unappliedLedgerCents"/);
  assert.match(route, /current\.ledger \+= Number\(aggregate\.ledgerCents\);\s+current\.expected \+= Number\(aggregate\.unappliedLedgerCents\)/);
  assert.doesNotMatch(route, /entries: \{ where: \{ effectiveAt: \{ lt: endExclusive \} \}/);
  assert.match(route, /BOOL_OR\(entry\.type = 'remittance_received' AND entry\."effectiveAt" < \$\{endExclusive\}\)/);
  assert.match(route, /ORDER BY entry\."effectiveAt" ASC, entry\."createdAt" ASC, entry\.id ASC\s+LIMIT 1/);
  assert.match(route, /reversedAt: null, status: \{ in: \["pending_review", "unmatched", "partially_allocated", "exception"\] \}/);
  assert.match(route, /agencyReconciliationVarianceCount\(tx, centerId, endExclusive\)/);
  assert.doesNotMatch(periodCloseRecovery, /INSERT INTO "AgencyLedgerAccount"/);
  assert.doesNotMatch(periodCloseRecovery, /const recoveredClaimReceivables|const recoveredRemittanceReversals/);
  assert.equal((periodCloseRecovery.match(/INSERT INTO "AgencyLedgerEntry"/g) ?? []).length, 1);
  assert.match(periodCloseRecovery, /agency-close:claim-evidence[\s\S]*missing, duplicate, or conflicting claim-approval event/);
  assert.match(periodCloseRecovery, /agency-close:direct-receipt-evidence[\s\S]*Direct receipts cannot be reconstructed/);
  assert.match(periodCloseRecovery, /agency-close:controlled-receipt-recovery[\s\S]*JOIN "AgencyRemittanceAllocation" allocation[\s\S]*allocation\.status IN \('posted', 'reversed'\)[\s\S]*batch\."cashGlCodeSnapshot"[\s\S]*batch\."costCenterCodeSnapshot"/);
  assert.match(periodCloseRecovery, /agency-close:remittance-reversal-evidence[\s\S]*missing, duplicate, or conflicting remittance reversal/);
  assert.match(periodCloseRecovery, /reversal\."effectiveAt" = GREATEST\(remittance\."reversedAt", receipt\."effectiveAt"\)/);
  assert.match(periodCloseRecovery, /reversal\."effectiveAt" >= receipt\."effectiveAt"/);
  assert.doesNotMatch(periodCloseRecovery, /DATE_TRUNC\('day', reversal\."effectiveAt"\) >= DATE_TRUNC\('day', receipt\."effectiveAt"\)/);
  assert.match(periodCloseRecovery, /agency-close:adjustment-evidence[\s\S]*missing, duplicate, or conflicting adjustment evidence/);
  assert.match(periodCloseRecovery, /const accountIds = \[\.\.\.new Set\(recoveredRemittanceReceipts\.map[\s\S]*recalculateAgencyLedgerBalances\(tx, accountId\)/);
  assert.match(periodCloseRecovery, /recoveredClaimReceivableCount: 0,[\s\S]*recoveredRemittanceReceivedCount: recoveredRemittanceReceipts\.length,[\s\S]*recoveredRemittanceReversalCount: 0/);
  assert.match(route, /const recoveredCounts = await recoverMissingAgencyLedgerCutoverEvents\(tx, centerId, endExclusive, auth\.user\.id\);[\s\S]*agencyReconciliationVarianceCount\(tx, centerId, endExclusive\)/);
  assert.match(periodCloseMutation, /billing\.agency_accounting_period\.closed[\s\S]*\.\.\.recoveredCounts[\s\S]*\}, tx\);[\s\S]*return \{ period, reused: false, \.\.\.recoveredCounts \}/);
  assert.match(periodCloseMutation, /recoveredClaimReceivableCount: 0,[\s\S]*recoveredRemittanceReceivedCount: 0,[\s\S]*recoveredRemittanceReversalCount: 0,[\s\S]*billing\.agency_accounting_period\.close_replayed[\s\S]*\.\.\.recoveredCounts/);
  assert.doesNotMatch(periodCloseMutation, /\}\);\s+const recoveryMessage/);
  assert.match(route, /message: result\.reused \? "This accounting period was already closed\." : `Accounting period closed\.\$\{recoveryMessage\}`/);
  assert.match(route, /COALESCE\(approval\."effectiveAt", claim\."approvedAt", claim\."createdAt"\) AS "approvalEffectiveAt"/);
  assert.match(route, /const \[ledgerAggregates, claimAggregates, remittanceAggregates, adjustmentAggregates\] = await Promise\.all/);
  assert.match(route, /WITH scoped_remittances AS[\s\S]*JOIN "SubsidyClaim" claim[\s\S]*WITH scoped_claims|WITH scoped_claims AS[\s\S]*WITH scoped_remittances AS/);
  assert.match(route, /applicable_remittances[\s\S]*"paidAt" < \$\{endExclusive\} AND NOT "receivedAny"/);
  assert.match(route, /for \(const aggregate of \[\.\.\.claimAggregates, \.\.\.remittanceAggregates, \.\.\.adjustmentAggregates\]\)/);
  assert.doesNotMatch(periodCloseReconciliation, /\.findMany\(/);
  assert.match(route, /const approvedAt = decision === "approved" \? new Date\(\) : null;\s+if \(approvedAt\) await assertAgencyPeriodOpen\(tx, current\.centerId, approvedAt\);[\s\S]*ensureAgencyClaimReceivable/);
  assert.match(route, /const effectiveAt = claim\.approvedAt \?\? claim\.createdAt;[\s\S]*?updatedAt changes after payments[\s\S]*?await assertAgencyPeriodOpen\(tx, claim\.centerId, effectiveAt\)|updatedAt changes after payments[\s\S]*?const effectiveAt = claim\.approvedAt \?\? claim\.createdAt;[\s\S]*?await assertAgencyPeriodOpen\(tx, claim\.centerId, effectiveAt\)/);
  assert.match(route, /agencyLedgerRunningBalances\(entries, finalBalanceCents - entryTotalCents\)/);
  assert.match(route, /"receivedBeforeEnd"[\s\S]*"reversalBeforeEnd"[\s\S]*"missingLedgerEventCount"/);
  assert.match(route, /CASE WHEN "receivedBeforeEnd"[\s\S]*CASE WHEN "reversalBeforeEnd"/);
  assert.match(route, /WITH scoped_adjustments AS[\s\S]*"adjustmentBeforeEnd"[\s\S]*"reversalBeforeEnd"[\s\S]*applicable_adjustments/);
  assert.match(route, /return netVarianceCount \+ missingLedgerEventCount/);
  assert.match(route, /if \(overlap\?\.status === "closed"\) \{[\s\S]*return \{ period: overlap, reused: true, \.\.\.recoveredCounts \}/);
  assert.match(route, /if \(remittance\.reversedAt\) throw new AgencyWorkflowError[\s\S]*const sourceReversedAt = input\.reversedAt[\s\S]*isBeforeUtcAccountingDay\(sourceReversedAt, remittance\.paidAt\)[\s\S]*const postingEffectiveAt = agencyReversalEffectiveAt\(agencyPaymentEntry\.effectiveAt, sourceReversedAt\)[\s\S]*await assertAgencyPeriodOpen\(tx, remittance\.claim\.centerId, postingEffectiveAt\)[\s\S]*data: \{ reversedAt: sourceReversedAt[\s\S]*effectiveAt: postingEffectiveAt[\s\S]*sourceReversedAt: sourceReversedAt\.toISOString\(\)[\s\S]*postingRule: "later of source reversal and receipt effective time"/);
  assert.match(route, /isFutureAgencyAccountingDate\(paidAt\)[\s\S]*payment date cannot be after the current UTC accounting day/);
  assert.match(route, /isFutureAgencyAccountingDate\(batch\.paidAt\)[\s\S]*future-dated remittance batch cannot be approved/);
  assert.match(route, /isFutureAgencyAccountingDate\(effectiveAt\)[\s\S]*adjustment cannot be effective after the current UTC accounting day/);
  assert.match(route, /isFutureAgencyAccountingDate\(adjustment\.effectiveAt\)[\s\S]*future-dated agency adjustment cannot be approved/);
  assert.match(route, /const effectiveAt = agencyReversalEffectiveAt\(adjustment\.effectiveAt\)/);
  assert.match(prismaMigration, /SubsidyRemittance_reversal_chronology_check[\s\S]*DATE_TRUNC\('day', "reversedAt"\) >= DATE_TRUNC\('day', "paidAt"\)/);
  assert.match(prismaMigration, /GREATEST\(remittance_row\."reversedAt", remittance_row\."paidAt"\)/);
  assert.match(prismaMigration, /sourceReversedAt[\s\S]*later of source reversal and receipt effective time/);
  assert.match(prismaMigration, /entry_row\."effectiveAt" IS DISTINCT FROM GREATEST\(source_reversed_at, receipt_effective_at\)/);
  assert.match(prismaMigration, /AgencyLedgerAdjustment_reversal_chronology_check[\s\S]*"reversedAt" >= "effectiveAt"/);
  assert.match(route, /if \(!agencyPaymentEntry\) throw new AgencyWorkflowError\("The remittance is missing its immutable receipt ledger entry\./);
  assert.match(route, /if \(action === "recordRemittance"\)[\s\S]*await assertAgencyPeriodOpen\(tx, current\.centerId, paidAt\);[\s\S]*await ensureAgencyClaimReceivable\(tx, current\)/);
  assert.match(route, /COUNT\(\*\) FILTER \(WHERE "approvedCents" > "paidCents" AND "dueDate" IS NOT NULL AND "dueDate" < \$\{today\}\)::bigint AS "overdueClaimCount"/);
  assert.match(route, /orderBy: \[\s*\{ agencyLedgerAccountId: "asc" \},\s*\{ effectiveAt: "asc" \},\s*\{ createdAt: "asc" \},\s*\{ id: "asc" \}/);
  assert.match(route, /currentUserId: auth\.user\.id/);
  assert.match(controls, /canReviewRequest = \(requestedById: string\) => capabilities\.canReviewAgencyPosting && capabilities\.currentUserId !== requestedById/);
  assert.match(controls, /canReviewRequest\(batch\.enteredById\)/);
  assert.match(controls, /canReviewRequest\(allocation\.requestedById\)/);
  assert.match(controls, /canReviewRequest\(adjustment\.requestedById\)/);
  assert.match(route, /cursor: \{ id: batchCursor \}, skip: 1[\s\S]*take: AGENCY_BATCH_LIMIT \+ 1/);
  assert.match(route, /cursor: \{ id: adjustmentCursor \}, skip: 1[\s\S]*take: AGENCY_ADJUSTMENT_LIMIT \+ 1/);
  assert.match(route, /where: \{ centerId: \{ in: centerIds \}, status: "pending_review", reversedAt: null \}/);
  assert.match(route, /new Map\(\[\.\.\.unresolvedBatches, \.\.\.visibleRecentBatches\]/);
  assert.match(route, /new Map\(\[\.\.\.unresolvedAdjustments, \.\.\.visibleRecentAdjustments\]/);
  assert.match(route, /batchPagination: \{ page: batchPage, pageSize: AGENCY_BATCH_LIMIT, hasNext: hasNextBatchPage/);
  assert.match(route, /adjustmentPagination: \{ page: adjustmentPage, pageSize: AGENCY_ADJUSTMENT_LIMIT, hasNext: hasNextAdjustmentPage/);
  assert.match(controls, /Deposit history page \{batchPagination\.page\}/);
  assert.match(controls, /Adjustment history page \{adjustmentPagination\.page\}/);
  assert.match(workspace, /setBatchPage\(1\); setBatchCursorByPage\(\{\}\)/);
  assert.match(workspace, /setAdjustmentPage\(1\); setAdjustmentCursorByPage\(\{\}\)/);
  assert.match(route, /requestedAllocationRows\.hasInvalidRows[\s\S]*Every allocation needs an approved claim and a positive dollar amount/);
  assert.match(route, /hasInvalidRows: value !== undefined/);
  assert.match(route, /!claimId \|\| !validCurrencyInput\(row\.amountDollars\) \|\| amountCents <= 0/);
  assert.match(controls, /enteredAllocationDrafts\.some\(\(row\) => !row\.claimId \|\| !row\.amountDollars\.trim\(\)[\s\S]*Complete or remove every allocation row/);
  assert.doesNotMatch(route, /approvedAt: \{ lt: endExclusive \}/);
  assert.match(route, /SUM\("approvedCents"\) FILTER \(WHERE "approvalEffectiveAt" < \$\{endExclusive\}\)/);
  assert.match(route, /"approvalEffectiveAt" < \$\{endExclusive\} AND "approvalEntryId" IS NULL/);
  assert.match(route, /const effectiveAt = claim\.approvedAt \?\? claim\.createdAt/);
  assert.doesNotMatch(route, /claim\.approvedAt \?\? claim\.updatedAt \?\? claim\.createdAt/);
  assert.doesNotMatch(prismaMigration, /COALESCE\(claim\."approvedAt", claim\."updatedAt", claim\."createdAt"\)/);
  assert.match(route, /const ledgerFrom = ledgerFromInput \? agencyUtcCalendarRange\(ledgerFromInput, ledgerFromInput\)\.startInclusive : null/);
  assert.match(route, /const ledgerToExclusive = ledgerToInput \? agencyUtcCalendarRange\(ledgerToInput, ledgerToInput\)\.endExclusive : null/);
  assert.match(route, /effectiveAt: \{[\s\S]*gte: ledgerFrom[\s\S]*lt: ledgerToExclusive/);
  assert.doesNotMatch(route, /agencyAccountingPeriod\.findMany\(\{[\s\S]{0,240}take: 36/);
  assert.match(route, /action === "reopenAccountingPeriod"[\s\S]*laterClosedPeriod[\s\S]*Reopen the later closed period/);
  assert.match(route, /agencyAccountingPeriod\.updateMany\([\s\S]*AGENCY_WRITE_TRANSACTION_OPTIONS/);
  assert.match(route, /batch\.status IN \(\$\{Prisma\.join\(ACTIVE_REMITTANCE_BATCH_STATUSES\)\}\)[\s\S]{0,160}batch\."reviewedAt" IS NOT NULL[\s\S]{0,120}batch\."reversedAt" IS NULL/);
  assert.match(route, /open_batches AS \([\s\S]*batch\.status IN \(\$\{Prisma\.join\(\[\.\.\.OPEN_REMITTANCE_BATCH_STATUSES\]\)\}\)[\s\S]*batch\."reversedAt" IS NULL/);
  assert.match(route, /COALESCE\(SUM\("openBatchExceptionCount"\), 0\)::bigint AS "openBatchExceptionCount"/);
  assert.match(route, /async function agencyReconciliationClaimAggregates[\s\S]*WITH claim_balances AS[\s\S]*LEFT JOIN "SubsidyRemittance"[\s\S]*GROUP BY "agencyProgramId"/);
  assert.match(route, /agencyReconciliationClaimAggregates\(tx, centerIds, snapshotAsOf\)[\s\S]*tx\.subsidyClaim\.findMany\(\{[\s\S]*status: \{ in: \["approved", "partially_paid"\] \}/);
  assert.doesNotMatch(route, /const \[programs,[^\n]*reconciliationClaims/);
  assert.match(route, /tx\.ledgerEntry\.aggregate\(\{[\s\S]*sourceSystem: "subsidy_agency"[\s\S]*_sum: \{ amountCents: true \}[\s\S]*_count: \{ _all: true \}/);
  assert.match(route, /batch\.status === "rejected"[\s\S]*A rejected, unposted batch cannot be reversed/);
  assert.match(route, /const isLegacyReconciledBatch = batch\.status === "reconciled" && !batch\.reviewedAt;\s+if \(\(!batch\.reviewedAt && !isLegacyReconciledBatch\) \|\| !REVERSIBLE_REMITTANCE_BATCH_STATUSES\.has\(batch\.status\)\)/);
  assert.match(route, /canReviewAgencyPosting\(\{ role: auth\.user\.role, reviewerId: auth\.user\.id, requestedById: batch\.enteredById \}\)[\s\S]*different billing administrator or accounting reviewer must reverse this batch/);
  assert.doesNotMatch(route, /postedAllocations\.some\(\(allocation\) => allocation\.remittance\?\.enteredById === auth\.user\.id\)/);
  assert.match(prismaMigration, /NEW\."reversedById" = OLD\."enteredById"[\s\S]*Agency remittance batch reversal evidence or reviewer is invalid/);
  assert.match(controls, /ALLOCATABLE_BATCH_STATUSES\.has\(batch\.status\)/);
  assert.match(controls, /REVERSIBLE_BATCH_STATUSES\.has\(batch\.status\)/);
  assert.match(retryKeys, /\(\) => globalThis\.sessionStorage, \(\) => globalThis\.localStorage/);
  assert.match(retryKeys, /if \(!persisted\) throw new Error\(AGENCY_RETRY_STORAGE_ERROR\)/);
  assert.match(retryKeys, /crypto\?\.getRandomValues/);
  assert.doesNotMatch(retryKeys, /Math\.random/);
  assert.match(route, /if \(requestedAllocationRows\.hasDuplicateClaims\) return NextResponse\.json\(\{ ok: false, error: "Choose each claim only once in a deposit batch\." \}/);
  assert.match(route, /status: \{ in: \["approved", "partially_paid"\] \}[\s\S]*allocationClaims,/);
  assert.match(controls, /allocationClaims\.filter\(\(claim\) => \["approved", "partially_paid"\]\.includes\(claim\.status\) && operationalProgramIds\.has\(claim\.agencyProgram\.id\)\)/);
  assert.match(controls, /disabled=\{selectedElsewhere\.has\(claim\.id\)\}/);
  assert.match(workspace, /const \[pending, setPending\] = useState\(Boolean\(centers\[0\]\?\.id\)\)/);
  assert.match(workspace, /centerIdRef\.current = value; setCenterId\(value\); setPending\(true\)/);
  assert.doesNotMatch(workspace, /useEffect\(\(\) => \{\s+let active = true;\s+setPending/);
  assert.match(workspace, /allocationClaims=\{data\.allocationClaims\}/);
  assert.match(controls, /agencyRetryStorageKey\(centerId, capabilities\.currentUserId, `batch-allocation:\$\{batch\.id\}`\)/);
  assert.match(controls, /agencyRetryStorageKey\(centerId, capabilities\.currentUserId, "ledger-adjustment"\)/);
  assert.match(controls, /post\("requestBatchAllocation"[\s\S]*idempotencyKey: requestKey/);
  assert.match(controls, /const retryKey = requireRetryKey\(storageKey\);[\s\S]*post\("requestLedgerAdjustment"[\s\S]*idempotencyKey: retryKey/);
  assert.match(controls, /Start different batch/);
  assert.match(controls, /Start different adjustment/);
  assert.match(controls, /Start different allocation/);
  assert.match(controls, /rotateAgencyRetryKey\(storageKey\)/);
  assert.match(route, /exportAgencyReconciliationCsv/);
  assert.match(route, /exportAgencyDepositsCsv/);
  assert.doesNotMatch(route, /\.toFixed\(2\)/);
  assert.match(route, /const AGENCY_READ_SNAPSHOT_OPTIONS = \{[\s\S]*isolationLevel: Prisma\.TransactionIsolationLevel\.RepeatableRead/);
  const exportHelper = route.slice(route.indexOf("async function agencyCsvSnapshotResponse"), route.indexOf("function exportClaimsCsv"));
  assert.match(exportHelper, /AGENCY_CSV_EXPORT_MAX_ROWS/);
  assert.match(exportHelper, /AGENCY_CSV_EXPORT_MAX_BYTES/);
  assert.match(exportHelper, /mkdtemp\(join\(tmpdir\(\), "bee-agency-export-"\)\)/);
  assert.match(exportHelper, /Buffer\.byteLength\(text, "utf8"\)[\s\S]*Buffer\.from\(text, "utf8"\)/);
  assert.match(exportHelper, /while \(offset < bytes\.byteLength\)[\s\S]*bytesWritten[\s\S]*offset \+= bytesWritten/);
  assert.match(exportHelper, /await prisma\.\$transaction[\s\S]*await flush\(\)[\s\S]*AGENCY_READ_SNAPSHOT_OPTIONS[\s\S]*await handle\.close\(\)[\s\S]*createReadStream\(exportPath\)/);
  assert.match(exportHelper, /fileStream\.once\("close", cleanup\)/);
  assert.match(exportHelper, /fileStream\.once\("error", cleanup\)/);
  assert.match(exportHelper, /Readable\.toWeb\(fileStream\)/);
  assert.match(exportHelper, /await rm\(exportDirectory, \{ recursive: true, force: true \}\)\.catch/);
  assert.doesNotMatch(exportHelper, /desiredSize|waitForDemand|snapshotChunks|chunks\.join/);
  assert.doesNotMatch(route.slice(route.indexOf("function exportClaimsCsv"), route.indexOf("async function currentBillingUser")), /\.map\([\s\S]{0,5000}\.join\(""\)|flatMap/);
  assert.match(route, /if \(error instanceof AgencyWorkflowError\) \{[\s\S]*status: error\.status/);
  assert.match(route, /function exportClaimsCsv[\s\S]*agencyCsvSnapshotResponse\("agency-claims\.csv"[\s\S]*tx\.subsidyClaim\.findMany\([\s\S]*take: 250,[\s\S]*cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /function exportAgencyLedgerCsv[\s\S]*agencyCsvSnapshotResponse\("agency-ledger\.csv"[\s\S]*tx\.agencyLedgerEntry\.findMany\([\s\S]*take: 250,[\s\S]*cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /function exportAgencyDepositsCsv[\s\S]*agencyCsvSnapshotResponse\("agency-deposits\.csv"[\s\S]*tx\.agencyRemittanceBatch\.findMany\([\s\S]*orderBy: \[\{ paidAt: "asc" \}, \{ createdAt: "asc" \}, \{ id: "asc" \}\][\s\S]*take: 100,[\s\S]*cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /csvRow\(\["School ID", "School", "Claim"/);
  assert.match(route, /csvRow\(\["School ID", "School", "Date"/);
  assert.match(route, /csvRow\(\["School ID", "School", "Agency", "Program"/);
  assert.match(route, /batch\.totalCents \/ 100,[\s\S]*batch\.allocatedCents \/ 100,[\s\S]*batch\.unappliedCents \/ 100/);
  assert.match(route, /overdueFollowUpCount/);
  assert.match(route, /legacyFamilyAgencyBalanceCents/);
  assert.match(route, /originalPaidAt: input\.paidAt\.toISOString\(\),[\s\S]*postingRule: \(input\.ledgerEffectiveAt \?\? input\.paidAt\)[\s\S]*legacyCompatibilityMirror: true/);
  assert.match(route, /const baselineCompatibilityEvidence = !Object\.prototype\.hasOwnProperty\.call\(metadata, "appliedCents"\)[\s\S]*legacyPaymentEntry\.description === `\$\{baselineAgencyName\} remittance for \$\{remittance\.claim\.number\}`/);
  assert.match(route, /const parentVisibleBeforeCents = billingAccount\.balanceCents - Math\.max\(0, totalAgencyResponsibilityBeforeCents\)[\s\S]*parentVisibleAfterCents !== parentVisibleBeforeCents[\s\S]*separately reviewed historical correction/);
  assert.match(controls, /Prepare deposit batch/);
  assert.match(controls, /Adjustment request/);
  assert.match(controls, /Accounting periods/);
  assert.match(controls, /Close preflight may restore only a missing receipt backed by exact immutable controlled-batch evidence\. Missing or conflicting claim approvals, direct remittances, adjustments, and reversals fail closed/);
  assert.match(workspace, /typeof body\.message === "string" && body\.message\.trim\(\) \? body\.message : "Agency billing record saved\."/);
  assert.match(controls, /Secure document\/advice reference/);
  assert.match(controls, /Follow-up due/);
});

test("agency requirements fail closed when current required items are missing", () => {
  assert.deepEqual(claimSubmissionBlockers({
    providerNumber: "P-1",
    submissionMethod: "secure_email",
    paymentInstructions: "ACH verified",
    requirements: [{ key: "attendance", label: "Attendance detail", type: "attendance", required: true }],
    documents: [],
  }), ["Add current required item: Attendance detail."]);
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /action === "syncRequirements"/);
  assert.match(route, /action === "syncRequirements"[\s\S]*subsidyClaim\.updateMany[\s\S]*subsidyClaimDocument\.createMany/);
  assert.match(route, /billing\.subsidy_claim\.requirements_synced/);
});

test("agency authorization creation and restoration revalidate serializably", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /action === "createAuthorization"[\s\S]*prisma\.\$transaction[\s\S]*isCurrentlyEnrolledChildRecord/);
  assert.match(route, /action === "restoreAuthorization"[\s\S]*prisma\.\$transaction[\s\S]*isCurrentlyEnrolledChildRecord/);
  assert.deepEqual(AGENCY_SUBMISSION_METHODS, ["agency_portal", "secure_email", "edi", "paper"]);
  assert.match(route, /SUBMISSION_METHODS\.has\(setup\.submissionMethod\)/);
});

test("agency remittance reversals preserve history and recalculate paid totals", () => {
  assert.equal(activeRemittanceTotalCents([
    { amountCents: 10000, reversedAt: null },
    { amountCents: 2500, reversedAt: "2026-08-24T12:00:00.000Z" },
  ]), 10000);
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  const reversalHelper = route.slice(route.indexOf("async function reverseAgencyRemittanceRecord"), route.indexOf("function exportClaimsCsv"));
  assert.match(route, /action === "reverseRemittance"/);
  assert.match(route, /action === "reverseRemittance"[\s\S]*center\.findUnique\(\{ where: \{ id: claim\.centerId \}, select: \{ agencyReconciliationEnabled: true \} \}\)[\s\S]*reverseAgencyRemittanceRecord\(tx, \{[\s\S]*reviewerId: auth\.user\.id[\s\S]*reviewerRole: auth\.user\.role[\s\S]*requireIndependentReviewer: center\.agencyReconciliationEnabled[\s\S]*expectedClaimId: claim\.id[\s\S]*requireUnbatched: true/);
  assert.match(reversalHelper, /input\.requireIndependentReviewer && \(!input\.reviewerRole \|\| !canReviewAgencyPosting\(\{ role: input\.reviewerRole, reviewerId: input\.reviewerId, requestedById: remittance\.enteredById \}\)\)/);
  assert.match(route, /type: "agency_payment_reversal"[\s\S]*balanceAfterCents: 0[\s\S]*recalculateLegacyFamilyLedgerBalances\(tx, legacyPaymentEntry\.billingAccountId, updatedAccount\.balanceCents\)/);
  assert.match(reversalHelper, /const baselineAgencyName = clean\(metadata\.agencyName\)[\s\S]*baselineCompatibilityEvidence[\s\S]*legacyPaymentEntry\.description === `\$\{baselineAgencyName\} remittance for \$\{remittance\.claim\.number\}`/);
  assert.doesNotMatch(reversalHelper, /clean\(metadata\.agencyName\) === remittance\.claim\.agencyProgram\.name/);
  assert.match(reversalHelper, /totalAgencyResponsibilityBeforeCents[\s\S]*parentVisibleAfterCents !== parentVisibleBeforeCents[\s\S]*separately reviewed historical correction/);
  assert.match(route, /agency-remittance-reversal:/);
  assert.match(route, /billing\.subsidy_remittance\.reversed/);
  assert.match(route, /type: "agency_payment"/);
  assert.match(workspace, /Reverse remittance/);
  assert.match(workspace, /remittance\.allocation \? <span> · batch controlled<\/span> : canManageAgencyBilling && \(!agencyReconciliationActivated \|\| \(data\?\.capabilities\.canReviewAgencyPosting && data\.capabilities\.currentUserId !== remittance\.enteredById\)\) \? <button[\s\S]*setClaimAction\(\{ kind: "reverse", claim, remittance \}\)/);
  assert.doesNotMatch(workspace, /window\.prompt/);
});

test("agency dashboard totals use bounded database aggregates for the full non-void claim set", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const aggregateStart = route.indexOf("tx.$queryRaw<AgencySummaryRow[]>");
  const aggregateEnd = route.indexOf("tx.family.findMany", aggregateStart);
  assert.notEqual(aggregateStart, -1);
  assert.notEqual(aggregateEnd, -1);
  const summaryAggregate = route.slice(aggregateStart, aggregateEnd);
  assert.match(summaryAggregate, /\$queryRaw<AgencySummaryRow\[\]>/);
  assert.match(summaryAggregate, /SUM\(claim\."claimedCents"\)/);
  assert.match(summaryAggregate, /COUNT\(\*\) FILTER \(WHERE claim\.status IN \('draft', 'ready', 'submitted'\) AND \(/);
  assert.match(summaryAggregate, /jsonb_array_elements[\s\S]*current_requirement[\s\S]*NOT EXISTS/);
  assert.match(summaryAggregate, /LEFT JOIN "SubsidyAuthorization" subsidy_authorization/);
  assert.doesNotMatch(summaryAggregate, /LEFT JOIN "SubsidyAuthorization" authorization/);
  assert.match(summaryAggregate, /claim\.status <> 'void'/);
  assert.doesNotMatch(summaryAggregate, /summaryClaims\.reduce/);
});

test("agency program serializable writes preserve authored errors and retry guidance", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /action === "createProgram"[\s\S]*try \{[\s\S]*prisma\.\$transaction[\s\S]*error instanceof AgencyWorkflowError[\s\S]*prismaConflict\(error\)/);
  assert.match(route, /action === "updateProgram"[\s\S]*try \{[\s\S]*prisma\.\$transaction[\s\S]*error instanceof AgencyWorkflowError[\s\S]*prismaConflict\(error\)/);
});

test("remittance status uses approved amount when available", () => {
  assert.equal(nextRemittanceStatus({ claimedCents: 50000, approvedCents: 45000, paidCents: 20000 }), "partially_paid");
  assert.equal(nextRemittanceStatus({ claimedCents: 50000, approvedCents: 45000, paidCents: 45000 }), "paid");
});
