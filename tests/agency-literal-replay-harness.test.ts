import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const firstPrismaPath = new URL("../prisma/migrations/20260903190000_agency_receivable_ledger/migration.sql", import.meta.url);
const firstSupabasePath = new URL("../supabase/migrations/20260903190000_agency_receivable_ledger.sql", import.meta.url);
const secondPrismaPath = new URL("../prisma/migrations/20260903210000_agency_reconciliation_controls/migration.sql", import.meta.url);
const secondSupabasePath = new URL("../supabase/migrations/20260903210000_agency_reconciliation_controls.sql", import.meta.url);
const harnessPath = new URL("../scripts/rehearse-agency-ledger-literal-replay.mjs", import.meta.url);

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

test("literal replay harness pins exact LF migration mirrors", async () => {
  const [firstPrisma, firstSupabase, secondPrisma, secondSupabase, harness] = await Promise.all([
    readFile(firstPrismaPath),
    readFile(firstSupabasePath),
    readFile(secondPrismaPath),
    readFile(secondSupabasePath),
    readFile(harnessPath, "utf8"),
  ]);

  assert.deepEqual(firstPrisma, firstSupabase);
  assert.deepEqual(secondPrisma, secondSupabase);
  assert.equal(firstPrisma.includes(13), false);
  assert.equal(secondPrisma.includes(13), false);
  assert.equal(sha256(firstPrisma), "ef3d32acb21cca1e11d08db5098c850bca79b1bea89382a2c60e27454d59c0c5");
  assert.equal(sha256(secondPrisma), "5576f0ae9f743e45a713151dd7a87809d3596c33bc75b29b4e9ef4b9f3a99bd8");
  assert.match(harness, /ef3d32acb21cca1e11d08db5098c850bca79b1bea89382a2c60e27454d59c0c5/);
  assert.match(harness, /5576f0ae9f743e45a713151dd7a87809d3596c33bc75b29b4e9ef4b9f3a99bd8/);
  assert.match(harness, /expectedHistoryVersion: "20260905002924"/);
  assert.match(harness, /expectedHistoryVersion: "20260905002935"/);
  assert.match(harness, /expectedHistoryName: "20260903190000_agency_receivable_ledger"/);
  assert.match(harness, /expectedHistoryName: "20260903210000_agency_reconciliation_controls"/);
  assert.match(harness, /installed statement hash does not match the frozen migration/);
  assert.match(harness, /a8304df5ba2c68761c5b90525784557be3dab250f96c0530da2c0c86705c2793/);
  assert.match(harness, /agencyProgramCount: "82"/);
  assert.match(harness, /activeProgramCount: "5"/);
  assert.match(harness, /setupRequiredProgramCount: "77"/);
  assert.match(harness, /agencyProgramChecksum: "116c4ec14ae661d0225af532090169d6"/);
  assert.match(harness, /subsidyClaimCount: "51"/);
  assert.match(harness, /subsidyClaimChecksum: "81b9fb864f91a530ac84e9ffba4320fb"/);
  assert.match(harness, /billingAccountBalanceCents: "12400"/);
  assert.match(harness, /billingAccountChecksum: "7b0b4e8d7cd60bbbfcd2c0de865dbdb3"/);
  assert.match(harness, /familyLedgerEntryCents: "-122470"/);
  assert.match(harness, /familyLedgerChecksum: "a3b75d5417d644cd8a6f5115857d175b"/);
  assert.match(harness, /legacyAgencyPaymentChecksum: "b22b65d0feb18b5819c2860da9ffdbeb"/);
  assert.match(harness, /ledgerAccountCount: "82"/);
  assert.match(harness, /nonzeroLedgerAccountCount: "0"/);
  assert.match(harness, /ledgerEntryCount: "0"/);
  assert.match(harness, /legacyNullApprovedCreatedAt: new Date\("2026-06-01T12:00:00\.000Z"\)/);
  assert.match(harness, /approvedAt: null/);
  assert.match(harness, /legacyNullApprovedEntries\.length, 1/);
  assert.match(harness, /effectiveAt: ids\.legacyNullApprovedCreatedAt\.toISOString\(\)/);
  assert.match(harness, /createdAt: ids\.legacyNullApprovedCreatedAt\.toISOString\(\)/);
  assert.match(harness, /externalId: `claim-approved:\$\{ids\.legacyNullApprovedClaim\}`/);
  assert.match(harness, /baselineCompatibilityProjection: true/);
  assert.match(harness, /legacyNullApprovedAtFallbackUnchanged: true/);
});

test("literal replay harness remains fail-closed and child-env scoped", async () => {
  const harness = await readFile(harnessPath, "utf8");

  assert.match(harness, /process\.env\.REHEARSAL_DATABASE_URL/);
  assert.doesNotMatch(harness, /REHEARSAL_DATABASE_URL\s*\|\|/);
  assert.match(harness, /assertAuthorizedRehearsalDatabaseTarget\(rawUrl\)/);
  assert.match(harness, /AGENCY_REHEARSAL_DATABASE_MARKER/);
  assert.match(harness, /isolationLevel:\s*"Serializable"/);
  assert.match(harness, /childEnvironment\.DATABASE_URL = databaseUrl/);
  assert.match(harness, /delete childEnvironment\[key\]/);
  assert.match(harness, /spawn\(process\.execPath, args/);
  assert.match(harness, /shell:\s*false/);
  assert.match(harness, /"db",\s*\n\s*"execute",\s*\n\s*"--file"/);
  assert.doesNotMatch(harness, /"--url"/);
  assert.match(harness, /assert\.deepEqual\(\s*afterReplay,\s*beforeReplay/);
  assert.match(harness, /supabase_migrations\.schema_migrations/);
  assert.match(harness, /readGlobalLogicalDigests/);
  assert.match(harness, /readExpectedProductionDerivedSeedEvidence/);
  assert.match(harness, /everySanitizedCenterCarriesSourceShapeMarker/);
  assert.match(harness, /TO_JSONB\(table_row\)::text/);
  assert.match(harness, /"UserAccessGrant"/);
  assert.match(harness, /"BillingAccount"/);
  assert.match(harness, /"AgencyAccountingPeriodEvent"/);
  assert.match(harness, /No cleanup or retry was attempted/);
  assert.match(harness, /--prepare-predecessor/);
  assert.match(harness, /--clean-replay/);
  assert.match(harness, /readUnmigratedCandidateState/);
  assert.match(harness, /The predecessor branch already has candidate Supabase migration history/);
  assert.match(harness, /The predecessor branch already has candidate Prisma migration history/);
  assert.match(harness, /The predecessor branch already contains a candidate ledger relation/);
  assert.match(harness, /The predecessor branch already contains a candidate activation or accounting column/);
  assert.match(harness, /prepare_unmigrated_predecessor_fixture/);
  assert.match(harness, /Apply both exact frozen files in order through the selected Supabase-authoritative writer/);
  assert.match(harness, /executeLiteralMigration\([\s\S]*EXPECTED_MIGRATIONS\[0\]/);
  assert.match(harness, /executeLiteralMigration\([\s\S]*EXPECTED_MIGRATIONS\[1\]/);
  assert.match(harness, /readAfterFirstMigrationReplayProof/);
  assert.match(harness, /sharedLockFunctionDefinitionsUnchangedAfterEachReplay: true/);
  assert.match(harness, /routineAndTriggerCatalogUnchanged: true/);
  assert.match(harness, /familyBalancesInvoicesPaymentsAndParentVisibleHistoryUnchanged: true/);

  for (const triggerName of [
    "AgencyProgram_00_reconciliation_migration_fence",
    "SubsidyAuthorization_00_reconciliation_migration_fence",
    "SubsidyClaim_00_reconciliation_migration_fence",
    "SubsidyClaimLine_00_reconciliation_migration_fence",
    "SubsidyRemittance_00_reconciliation_migration_fence",
    "AgencyLedgerAccount_00_reconciliation_migration_fence",
    "AgencyLedgerEntry_00_reconciliation_migration_fence",
  ]) {
    assert.ok(harness.includes(triggerName), `Missing temporary-fence verification for ${triggerName}.`);
  }
  assert.match(harness, /block_agency_writes_during_reconciliation_migration/);
  assert.match(harness, /\[1, 2, 3\]/);
  assert.match(harness, /\["closed", "reopened", "closed"\]/);
});

test("literal predecessor and controlled-morning fixtures prove both chronology edges", async () => {
  const harness = await readFile(harnessPath, "utf8");

  assert.match(harness, /literal-predecessor-claim-v1/);
  assert.match(harness, /claimCreatedAt: new Date\("2026-06-01T12:00:00\.000Z"\)/);
  assert.match(harness, /paidAt: new Date\("2026-06-02T12:00:00\.000Z"\)/);
  assert.match(harness, /reversedAt: new Date\("2026-06-02T08:00:00\.000Z"\)/);
  assert.match(harness, /legacyApprovedAtIntentionallyNull/);
  assert.match(harness, /The dedicated reversal must clamp to the receipt effective time/);
  assert.match(harness, /sourceReversedAt: PREDECESSOR_FIXTURE\.reversedAt\.toISOString\(\)/);
  assert.match(harness, /postingRule: "later of source reversal and receipt effective time"/);
  assert.match(harness, /activationPreservedExactCutoverBatchAndAllocation: true/);
  assert.match(harness, /periodEventSequence/);

  assert.match(harness, /literal-controlled-morning-remittance-v1/);
  assert.match(harness, /reviewedAt: new Date\("2026-06-03T08:00:00\.000Z"\)/);
  assert.match(harness, /paidAt: new Date\("2026-06-03T12:00:00\.000Z"\)/);
  assert.match(harness, /postingRule: "independent_review"/);
  assert.match(harness, /assert\.notEqual\(allocation\[0\]\.requestedById, allocation\[0\]\.reviewedById\)/);
  assert.match(harness, /This proof requires the controlled receipt time to be before noon paidAt/);
  assert.match(harness, /familyFinancialRowsCreated: false/);
});

test("first migration installs the same shared school lock protocol used by replay", async () => {
  const [firstMigration, harness] = await Promise.all([
    readFile(firstPrismaPath, "utf8"),
    readFile(harnessPath, "utf8"),
  ]);

  assert.match(firstMigration, /CREATE OR REPLACE FUNCTION public\.lock_agency_financial_center\(target_center_id TEXT\)/);
  assert.match(firstMigration, /CREATE OR REPLACE FUNCTION public\.lock_agency_financial_centers\(target_center_ids TEXT\[\]\)/);
  assert.match(firstMigration, /CREATE OR REPLACE FUNCTION public\.enforce_agency_ledger_account_scope\(\)/);
  assert.match(firstMigration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(firstMigration, /UPDATE public\."Center" center\s+SET "updatedAt" = center\."updatedAt"/);
  assert.match(firstMigration, /PERFORM public\.lock_agency_financial_centers\(affected_center_ids\)/);
  assert.match(firstMigration, /ORDER BY candidate\.value/);
  assert.match(harness, /const SHARED_LOCK_FUNCTIONS/);
  assert.match(harness, /pg_get_functiondef\(function_row\.oid\)/);
  assert.match(harness, /Migration 1 replay downgraded a shared lock\/account-scope function/);
});
