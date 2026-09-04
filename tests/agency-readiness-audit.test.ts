import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const audit = readFileSync("scripts/audit-agency-ledger-readiness.ts", "utf8");
const rehearsalAudit = readFileSync("scripts/audit-agency-ledger-rehearsal.ts", "utf8");
const rehearsalWorkflow = readFileSync("scripts/rehearse-agency-ledger-workflow.mjs", "utf8");
const seed = readFileSync("scripts/seed-agency-ledger-rehearsal.ts", "utf8");
const operations = readFileSync("docs/AGENCY_SUBSIDY_BILLING_OPERATIONS.md", "utf8");

test("agency readiness audit binds validation and queries to the same production URL", () => {
  assert.match(audit, /const productionUrl = getRuntimeDatabaseUrl\(process\.env\)/);
  assert.match(audit, /assertExactSupabaseDatabaseTarget\(productionUrl,[\s\S]*new PrismaClient\(\{ datasources: \{ db: \{ url: productionUrl \} \}/);
  assert.doesNotMatch(audit, /import \{ prisma \} from "@\/lib\/prisma"/);
  assert.match(audit, /finally \{\s+await auditClient\.\$disconnect\(\)/);
});

test("agency readiness audit mirrors every first-migration source-data blocker", () => {
  assert.match(audit, /approvedLifecycleMissingAuthorizationCount/);
  assert.match(audit, /COALESCE\("approvedCents", 0\) <> 0 AND status NOT IN \('approved', 'partially_paid', 'paid'\)/);
  assert.match(audit, /nonpositiveAmountCount/);
  assert.match(audit, /actorOrReversalEvidenceIncompleteCount/);
  assert.match(audit, /DATE_TRUNC\('day', "reversedAt"\) < DATE_TRUNC\('day', "paidAt"\)/);
  assert.match(audit, /futureApprovalEventCount/);
  assert.match(audit, /futureEventCount/);
  assert.match(audit, /approvalExceedsClaimCount/);
  assert.match(audit, /status = 'paid' AND "activeRemittanceCents" <> COALESCE\("approvedCents", "claimedCents"\)/);
  assert.match(audit, /migrationBlockerCount/);
  assert.match(audit, /readyForMigrationDataShape: migrationBlockerCount === BigInt\(0\)/);
});

test("production-derived seed refuses a branch where either candidate was already applied", () => {
  assert.match(seed, /to_regclass\('public\."AgencyLedgerAccount"'\)/);
  assert.match(seed, /to_regclass\('public\."AgencyRemittanceBatch"'\)/);
  assert.match(seed, /to_regclass\('public\."_prisma_migrations"'\)/);
  assert.match(seed, /to_regclass\('supabase_migrations\.schema_migrations'\)/);
  assert.match(seed, /version IN \('20260903190000', '20260903210000'\)/);
  assert.match(seed, /candidateSupabaseHistory/);
  assert.match(seed, /migration_name IN \('20260903190000_agency_receivable_ledger', '20260903210000_agency_reconciliation_controls'\)/);
  assert.match(seed, /reset it to the exact production predecessor before seeding/);
  assert.match(seed, /agencyLedgerRehearsalSourceShapeSha256: sourceShapeChecksum/);
  assert.match(seed, /sourceShapeChecksum,/);
  assert.match(rehearsalWorkflow, /sourceShapeMarkerCount/);
  assert.match(rehearsalWorkflow, /Every sanitized rehearsal school must carry the captured source-shape marker/);
  assert.match(rehearsalWorkflow, /capturedSeedSourceShapeSha256: result\.identity\.sourceShapeSha256/);
});

test("rehearsal audit can fail closed on the captured production-derived post-migration baseline", () => {
  assert.match(rehearsalAudit, /REQUIRE_PRODUCTION_DERIVED_BASELINE/);
  assert.match(rehearsalAudit, /EXPECTED_PRODUCTION_DERIVED_BASELINE/);
  assert.match(rehearsalAudit, /ledgerAccountCount: BigInt\(82\)/);
  assert.match(rehearsalAudit, /ledgerEntryCount: BigInt\(0\)/);
  assert.match(rehearsalAudit, /RLS enabled\/not-forced state with no direct-client policies/);
  assert.match(rehearsalAudit, /20260903190000_agency_receivable_ledger/);
  assert.match(rehearsalAudit, /20260903210000_agency_reconciliation_controls/);
  assert.match(rehearsalAudit, /20260904230802/);
  assert.match(rehearsalAudit, /20260904230805/);
  assert.match(rehearsalAudit, /statementsSha256/);
  assert.match(rehearsalAudit, /candidateSupabaseMigrationHistory\.length !== EXPECTED_SUPABASE_MIGRATIONS\.length/);
  assert.match(rehearsalAudit, /candidatePrismaMigrationHistory\.length !== 0/);
  assert.match(rehearsalAudit, /to_regclass\('public\."_prisma_migrations"'\)/);
  assert.doesNotMatch(rehearsalAudit, /process\.env\.REHEARSAL_DATABASE_URL \|\| process\.env\.DATABASE_URL/);
  assert.match(rehearsalAudit, /sourceShapeMarkerCount !== result\.source\.centerCount/);
  assert.match(rehearsalAudit, /Production-derived post-migration baseline mismatch/);
});

test("strict rehearsal audit freezes exact catalog and completed-fence evidence", () => {
  for (const triggerName of [
    "AgencyProgram_00_reconciliation_migration_fence",
    "SubsidyAuthorization_00_reconciliation_migration_fence",
    "SubsidyClaim_00_reconciliation_migration_fence",
    "SubsidyClaimLine_00_reconciliation_migration_fence",
    "SubsidyRemittance_00_reconciliation_migration_fence",
    "AgencyLedgerAccount_00_reconciliation_migration_fence",
    "AgencyLedgerEntry_00_reconciliation_migration_fence",
  ]) {
    assert.match(rehearsalAudit, new RegExp(triggerName));
  }
  assert.match(rehearsalAudit, /block_agency_writes_during_reconciliation_migration/);
  assert.match(rehearsalAudit, /temporaryMigrationFenceObjects\.length !== 0/);
  assert.match(rehearsalAudit, /EXPECTED_NORMALIZED_CATALOG_MANIFEST/);
  assert.match(rehearsalAudit, /'relation'::text AS "objectKind"/);
  assert.match(rehearsalAudit, /relation_row\.relrowsecurity/);
  assert.match(rehearsalAudit, /relation_row\.relacl/);
  assert.match(rehearsalAudit, /'column'::text AS "objectKind"/);
  assert.match(rehearsalAudit, /format_type\(attribute_row\.atttypid, attribute_row\.atttypmod\)/);
  assert.match(rehearsalAudit, /pg_get_expr\(default_row\.adbin, default_row\.adrelid, TRUE\)/);
  assert.match(rehearsalAudit, /attribute_row\.attnotnull/);
  assert.match(rehearsalAudit, /pg_get_indexdef\(index_row\.oid\)/);
  assert.match(rehearsalAudit, /pg_get_constraintdef\(constraint_row\.oid, TRUE\)/);
  assert.match(rehearsalAudit, /pg_get_triggerdef\(trigger_row\.oid, TRUE\)/);
  assert.match(rehearsalAudit, /'enabled', trigger_row\.tgenabled/);
  assert.match(rehearsalAudit, /pg_get_functiondef\(routine_row\.oid\)/);
  assert.match(rehearsalAudit, /routine_row\.prosecdef/);
  assert.match(rehearsalAudit, /routine_row\.proconfig/);
  assert.match(rehearsalAudit, /routine_row\.proacl/);
  assert.match(rehearsalAudit, /catalogManifest\.sha256 !== EXPECTED_NORMALIZED_CATALOG_MANIFEST\.sha256/);
});

test("partial migration recovery preserves the original identity and requires a forward repair", () => {
  assert.match(operations, /Never edit the original migration bytes/);
  assert.match(operations, /never reuse either original name\/version for altered SQL or object definitions/);
  assert.match(operations, /separately reviewed migration with a new identity as a forward repair/);
  assert.match(operations, /never insert or edit a migration-history row or switch migration writers/);
});
