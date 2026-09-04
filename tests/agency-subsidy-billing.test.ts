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
  }

  const reconciliationMigration = readFileSync(
    "prisma/migrations/20260903210000_agency_reconciliation_controls/migration.sql",
    "utf8",
  );
  assert.match(reconciliationMigration, /keeping reversed attempts separate from active corrections/);
  assert.match(reconciliationMigration, /WHEN remittance\."reversedAt" IS NULL THEN 'active'/);
  assert.match(reconciliationMigration, /'reversed:' \|\| TO_CHAR\(remittance\."reversedAt" AT TIME ZONE 'UTC'/);
  assert.match(reconciliationMigration, /grouped\.normalized_reference \|\| ':' \|\| grouped\.lifecycle_key/);
  assert.match(reconciliationMigration, /grouped\."paymentMethod",\s+grouped\.total_cents,\s+grouped\.total_cents,\s+0,/);
  assert.match(reconciliationMigration, /ON batch\.id = 'agency-remittance-batch:' \|\| MD5/);
  assert.doesNotMatch(reconciliationMigration, /grouped\.any_reversed/);
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
  assert.match(route, /updateAuthorization"\)[\s\S]*prisma\.\$transaction[\s\S]*TransactionIsolationLevel\.Serializable/);
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
  assert.match(route, /recordDecision"\)[\s\S]*tx\.subsidyClaim\.updateMany[\s\S]*findUniqueOrThrow[\s\S]*claimSubmissionBlockers/);
  assert.match(route, /Complete every required claim document before recording agency approval/);
  assert.match(route, /updateDocument"\)[\s\S]*tx\.subsidyClaim\.updateMany[\s\S]*status: \{ in: \["draft", "ready", "submitted"\] \}/);
  assert.match(route, /COUNT\(\*\) FILTER \(WHERE claim\.status IN \('draft', 'ready', 'submitted'\) AND \(/);
  assert.match(route, /Documents cannot be changed after the agency decision is recorded/);
  assert.match(route, /Enter the agency denial reason or code/);
  assert.match(route, /action === "voidClaim"/);
  assert.match(route, /updateMany\(\{ where: \{ id: claim\.id, status: \{ in: \["draft", "ready"\] \} \}/);
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
  assert.match(route, /new ReadableStream<Uint8Array>/);
  assert.match(route, /orderBy: \{ id: "asc" \}/);
  assert.match(route, /take: 250/);
  assert.match(route, /cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /const formulaSafeText = typeof value === "string" && \/\^\\s\*\[=\+\\-@\]\//);
  assert.match(route, /if \(typeof value === "number" && Number\.isFinite\(value\)\) return String\(value\)/);
  assert.match(route, /formulaSafeText\.replaceAll\('"', '""'\)/);
  assert.match(route, /if \(exportingClaims\) return exportClaimsCsv\(centerIds\)/);
});

test("agency remittances are staged, independently reviewed, and posted serializably", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  const reconciliation = readFileSync("src/components/agency-reconciliation-controls.tsx", "utf8");
  assert.match(route, /action === "prepareRemittanceBatch" \|\| action === "recordRemittance"/);
  assert.match(route, /agencyPostingClaim\(tx, allocation\.claimId\)/);
  assert.match(route, /action === "approveRemittanceBatch"/);
  assert.match(route, /action === "rejectBatchAllocation"/);
  assert.match(route, /reviewNotes: reason/);
  assert.match(route, /agencyBatchStatus\(\{ totalCents: allocation\.batch\.totalCents, allocatedCents: allocation\.batch\.allocatedCents \}\)/);
  assert.match(route, /canReviewAgencyPosting\(\{ role: auth\.user\.role, reviewerId: auth\.user\.id, requestedById: batch\.enteredById \}\)/);
  assert.match(route, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
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
  assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|INSERT INTO) "BillingAccount"|(?:UPDATE|DELETE FROM|INSERT INTO) "LedgerEntry"/);

  assert.match(route, /ensureAgencyClaimReceivable/);
  assert.match(route, /type: "claim_approved"/);
  assert.match(route, /type: "remittance_received"/);
  assert.match(route, /type: "remittance_reversal"/);
  assert.match(route, /agencyLedgerAccount\.findMany/);
  assert.match(route, /agencyLedgerEntry\.findMany/);
  assert.match(route, /if \(exportingLedger\) return exportAgencyLedgerCsv\(centerIds\)/);
  assert.match(route, /legacyCompatibilityMirror: true/);
  assert.match(route, /legacyFamilyLedgerAppliedCents = Math\.min/);

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
  assert.match(prismaMigration, /CREATE UNIQUE INDEX IF NOT EXISTS "AgencyLedgerAdjustment_idempotencyKey_key"/);
  assert.match(prismaMigration, /FROM grouped\s+ON CONFLICT DO NOTHING;/);
  assert.doesNotMatch(prismaMigration, /ON CONFLICT \("centerId", "agencyProgramId", "referenceKey"\)/);
  assert.match(prismaMigration, /'legacy-allocation:' \|\| remittance\.id/);
  assert.match(prismaMigration, /Historical record retained; no new approval was inferred/);
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
  assert.match(route, /async function recoverMissingAgencyLedgerCutoverEvents[\s\S]*INSERT INTO "AgencyLedgerAccount"[\s\S]*program\."centerId" = \$\{centerId\}[\s\S]*claim\."approvedCents" > 0[\s\S]*COALESCE\(claim\."approvedAt", claim\."updatedAt", claim\."createdAt"\) < \$\{endExclusive\}[\s\S]*entry\.type = 'claim_approved'/);
  assert.match(route, /const recoveredClaimReceivables[\s\S]*recoveredAtPeriodClose'[\s\S]*recoveredById'[\s\S]*ON CONFLICT \("sourceSystem", "externalId"\) DO NOTHING[\s\S]*RETURNING "agencyLedgerAccountId"/);
  assert.match(route, /const recoveredRemittanceReceipts[\s\S]*'agency-ledger-remittance:' \|\| remittance\.id[\s\S]*'remittance_received'[\s\S]*-remittance\."amountCents"[\s\S]*remittance\."paidAt" < \$\{endExclusive\}[\s\S]*entry\.type = 'remittance_received'/);
  assert.match(route, /const recoveredRemittanceReversals[\s\S]*'agency-ledger-remittance-reversal:' \|\| remittance\.id[\s\S]*'remittance_reversal'[\s\S]*remittance\."reversedAt" < \$\{endExclusive\}[\s\S]*entry\.type = 'remittance_reversal'/);
  assert.match(route, /const accountIds = \[\.\.\.new Set\(\[[\s\S]*\.\.\.recoveredClaimReceivables,[\s\S]*\.\.\.recoveredRemittanceReceipts,[\s\S]*\.\.\.recoveredRemittanceReversals,[\s\S]*recalculateAgencyLedgerBalances\(tx, accountId\)/);
  assert.match(route, /const recoveredCounts = await recoverMissingAgencyLedgerCutoverEvents\(tx, centerId, endExclusive, auth\.user\.id\);[\s\S]*agencyReconciliationVarianceCount\(tx, centerId, endExclusive\)/);
  assert.match(periodCloseMutation, /billing\.agency_accounting_period\.closed[\s\S]*\.\.\.recoveredCounts[\s\S]*\}, tx\);[\s\S]*return \{ period, reused: false, \.\.\.recoveredCounts \}/);
  assert.match(periodCloseMutation, /recoveredClaimReceivableCount: 0,[\s\S]*recoveredRemittanceReceivedCount: 0,[\s\S]*recoveredRemittanceReversalCount: 0,[\s\S]*billing\.agency_accounting_period\.close_replayed[\s\S]*\.\.\.recoveredCounts/);
  assert.doesNotMatch(periodCloseMutation, /\}\);\s+const recoveryMessage/);
  assert.match(route, /message: result\.reused \? "This accounting period was already closed\." : `Accounting period closed\.\$\{recoveryMessage\}`/);
  assert.match(route, /COALESCE\(approval\."effectiveAt", claim\."approvedAt", claim\."updatedAt", claim\."createdAt"\) AS "approvalEffectiveAt"/);
  assert.match(route, /const \[ledgerAggregates, claimAggregates, remittanceAggregates, adjustmentAggregates\] = await Promise\.all/);
  assert.match(route, /WITH scoped_remittances AS[\s\S]*JOIN "SubsidyClaim" claim[\s\S]*WITH scoped_claims|WITH scoped_claims AS[\s\S]*WITH scoped_remittances AS/);
  assert.match(route, /applicable_remittances[\s\S]*"paidAt" < \$\{endExclusive\} AND NOT "receivedAny"/);
  assert.match(route, /for \(const aggregate of \[\.\.\.claimAggregates, \.\.\.remittanceAggregates, \.\.\.adjustmentAggregates\]\)/);
  assert.doesNotMatch(periodCloseReconciliation, /\.findMany\(/);
  assert.match(route, /const approvedAt = decision === "approved" \? new Date\(\) : null;\s+if \(approvedAt\) await assertAgencyPeriodOpen\(tx, current\.centerId, approvedAt\);[\s\S]*ensureAgencyClaimReceivable/);
  assert.match(route, /const effectiveAt = claim\.approvedAt \?\? claim\.updatedAt \?\? claim\.createdAt;\s+await assertAgencyPeriodOpen\(tx, claim\.centerId, effectiveAt\)/);
  assert.match(route, /agencyLedgerRunningBalances\(entries, finalBalanceCents - entryTotalCents\)/);
  assert.match(route, /"receivedBeforeEnd"[\s\S]*"reversalBeforeEnd"[\s\S]*"missingLedgerEventCount"/);
  assert.match(route, /return netVarianceCount \+ missingLedgerEventCount/);
  assert.match(route, /if \(overlap\?\.status === "closed"\) \{[\s\S]*return \{ period: overlap, reused: true, \.\.\.recoveredCounts \}/);
  assert.match(route, /if \(remittance\.reversedAt\) throw new AgencyWorkflowError[\s\S]*await assertAgencyPeriodOpen\(tx, remittance\.claim\.centerId, input\.reversedAt\)/);
  assert.match(route, /if \(!agencyPaymentEntry\) \{\s+await assertAgencyPeriodOpen\(tx, remittance\.claim\.centerId, remittance\.paidAt\)/);
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
  assert.match(route, /const effectiveAt = claim\.approvedAt \?\? claim\.updatedAt \?\? claim\.createdAt/);
  assert.match(route, /const ledgerFrom = ledgerFromInput \? agencyUtcCalendarRange\(ledgerFromInput, ledgerFromInput\)\.startInclusive : null/);
  assert.match(route, /const ledgerToExclusive = ledgerToInput \? agencyUtcCalendarRange\(ledgerToInput, ledgerToInput\)\.endExclusive : null/);
  assert.match(route, /effectiveAt: \{[\s\S]*gte: ledgerFrom[\s\S]*lt: ledgerToExclusive/);
  assert.doesNotMatch(route, /agencyAccountingPeriod\.findMany\(\{[\s\S]{0,240}take: 36/);
  assert.match(route, /action === "reopenAccountingPeriod"[\s\S]*laterClosedPeriod[\s\S]*Reopen the later closed period/);
  assert.match(route, /agencyAccountingPeriod\.updateMany\([\s\S]*isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(route, /status: \{ in: ACTIVE_REMITTANCE_BATCH_STATUSES \}[\s\S]{0,120}reversedAt: null/);
  assert.match(route, /agencyRemittanceBatch\.groupBy\(\{[\s\S]*reviewedAt: \{ not: null \}[\s\S]*_sum: \{ unappliedCents: true \}/);
  assert.match(route, /openBatchesByProgram\.get\(account\.agencyProgramId\) \?\? 0/);
  assert.match(route, /async function agencyReconciliationClaimAggregates[\s\S]*WITH claim_balances AS[\s\S]*LEFT JOIN "SubsidyRemittance"[\s\S]*GROUP BY "agencyProgramId"/);
  assert.match(route, /reconciliationClaimAggregates, allocationClaims[\s\S]*status: \{ in: \["approved", "partially_paid"\] \}/);
  assert.doesNotMatch(route, /const \[programs,[^\n]*reconciliationClaims/);
  assert.match(route, /prisma\.ledgerEntry\.aggregate\(\{[\s\S]*sourceSystem: "subsidy_agency"[\s\S]*_sum: \{ amountCents: true \}[\s\S]*_count: \{ _all: true \}/);
  assert.match(route, /batch\.status === "rejected"[\s\S]*A rejected, unposted batch cannot be reversed/);
  assert.match(route, /!batch\.reviewedAt \|\| !REVERSIBLE_REMITTANCE_BATCH_STATUSES\.has\(batch\.status\)/);
  assert.match(controls, /ALLOCATABLE_BATCH_STATUSES\.has\(batch\.status\)/);
  assert.match(controls, /REVERSIBLE_BATCH_STATUSES\.has\(batch\.status\)/);
  assert.match(retryKeys, /\(\) => globalThis\.sessionStorage, \(\) => globalThis\.localStorage/);
  assert.match(retryKeys, /if \(!persisted\) throw new Error\(AGENCY_RETRY_STORAGE_ERROR\)/);
  assert.match(retryKeys, /crypto\?\.getRandomValues/);
  assert.doesNotMatch(retryKeys, /Math\.random/);
  assert.match(route, /if \(requestedAllocationRows\.hasDuplicateClaims\) return NextResponse\.json\(\{ ok: false, error: "Choose each claim only once in a deposit batch\." \}/);
  assert.match(route, /status: \{ in: \["approved", "partially_paid"\] \}[\s\S]*allocationClaims,/);
  assert.match(controls, /allocationClaims\.filter\(\(claim\) => \["approved", "partially_paid"\]\.includes\(claim\.status\)\)/);
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
  assert.match(route, /function exportClaimsCsv[\s\S]*new ReadableStream<Uint8Array>[\s\S]*async pull\(controller\)[\s\S]*subsidyClaim\.findMany\([\s\S]*take: 250,[\s\S]*cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /function exportClaimsCsv[\s\S]*cancel\(\) \{\s+cancelled = true/);
  assert.doesNotMatch(route, /function exportClaimsCsv[\s\S]*async start\(controller\)/);
  assert.match(route, /function exportAgencyLedgerCsv[\s\S]*new ReadableStream<Uint8Array>[\s\S]*async pull\(controller\)[\s\S]*agencyLedgerEntry\.findMany\([\s\S]*take: 250,[\s\S]*cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /function exportAgencyLedgerCsv[\s\S]*cancel\(\) \{\s+cancelled = true/);
  assert.doesNotMatch(route, /function exportAgencyLedgerCsv[\s\S]*async start\(controller\)/);
  assert.match(route, /function exportAgencyDepositsCsv[\s\S]*new ReadableStream<Uint8Array>[\s\S]*async pull\(controller\)[\s\S]*agencyRemittanceBatch\.findMany\([\s\S]*orderBy: \[\{ paidAt: "asc" \}, \{ createdAt: "asc" \}, \{ id: "asc" \}\][\s\S]*take: 100,[\s\S]*cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /function exportAgencyDepositsCsv[\s\S]*cancel\(\) \{\s+cancelled = true/);
  assert.doesNotMatch(route, /function exportAgencyDepositsCsv[\s\S]*async start\(controller\)/);
  assert.match(route, /batch\.totalCents \/ 100,[\s\S]*batch\.allocatedCents \/ 100,[\s\S]*batch\.unappliedCents \/ 100/);
  assert.match(route, /overdueFollowUpCount/);
  assert.match(route, /legacyFamilyAgencyBalanceCents/);
  assert.match(controls, /Prepare deposit batch/);
  assert.match(controls, /Adjustment request/);
  assert.match(controls, /Accounting periods/);
  assert.match(controls, /Close preflight restores any missing agency-ledger events from recorded approvals, remittances, and reversals/);
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
  assert.match(route, /action === "reverseRemittance"/);
  assert.match(route, /action === "reverseRemittance"[\s\S]*reverseAgencyRemittanceRecord\(tx, \{[\s\S]*reviewerRole: auth\.user\.role[\s\S]*expectedClaimId: claim\.id[\s\S]*requireUnbatched: true/);
  assert.match(route, /input\.reviewerRole && !canReviewAgencyPosting\(\{ role: input\.reviewerRole, reviewerId: input\.reviewerId, requestedById: remittance\.enteredById \}\)/);
  assert.match(route, /type: "agency_payment_reversal"[\s\S]*balanceAfterCents: 0[\s\S]*recalculateLegacyFamilyLedgerBalances\(tx, legacyPaymentEntry\.billingAccountId, updatedAccount\.balanceCents\)/);
  assert.match(route, /agency-remittance-reversal:/);
  assert.match(route, /billing\.subsidy_remittance\.reversed/);
  assert.match(route, /type: "agency_payment"/);
  assert.match(workspace, /Reverse remittance/);
  assert.match(workspace, /data\?\.capabilities\.canReviewAgencyPosting && data\.capabilities\.currentUserId !== remittance\.enteredById/);
  assert.doesNotMatch(workspace, /window\.prompt/);
});

test("agency dashboard totals use bounded database aggregates for the full non-void claim set", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /\$queryRaw<AgencySummaryRow\[\]>/);
  assert.match(route, /SUM\(claim\."claimedCents"\)/);
  assert.match(route, /COUNT\(\*\) FILTER \(WHERE claim\.status IN \('draft', 'ready', 'submitted'\) AND \(/);
  assert.match(route, /jsonb_array_elements[\s\S]*current_requirement[\s\S]*NOT EXISTS/);
  assert.match(route, /LEFT JOIN "SubsidyAuthorization" subsidy_authorization/);
  assert.doesNotMatch(route, /LEFT JOIN "SubsidyAuthorization" authorization/);
  assert.match(route, /claim\.status <> 'void'/);
  assert.doesNotMatch(route, /summaryClaims\.reduce/);
});

test("remittance status uses approved amount when available", () => {
  assert.equal(nextRemittanceStatus({ claimedCents: 50000, approvedCents: 45000, paidCents: 20000 }), "partially_paid");
  assert.equal(nextRemittanceStatus({ claimedCents: 50000, approvedCents: 45000, paidCents: 45000 }), "paid");
});
