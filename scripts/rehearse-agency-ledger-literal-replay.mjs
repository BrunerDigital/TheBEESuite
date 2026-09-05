import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import rehearsalTarget from "./agency-ledger-rehearsal-target.ts";

const {
  AGENCY_REHEARSAL_DATABASE_MARKER,
  AGENCY_REHEARSAL_PROJECT_REF,
  assertAuthorizedRehearsalDatabaseTarget,
} = rehearsalTarget;

const REHEARSAL_TENANT_ID = "agency-ledger-rehearsal-tenant";
const REHEARSAL_ORGANIZATION_ID = "agency-ledger-rehearsal-organization";
const EXPECTED_SOURCE_SHAPE_SHA256 = "a8304df5ba2c68761c5b90525784557be3dab250f96c0530da2c0c86705c2793";
const EXPECTED_PRODUCTION_DERIVED_SEED = Object.freeze({
  agencyProgramCount: "82",
  activeProgramCount: "5",
  setupRequiredProgramCount: "77",
  agencyProgramChecksum: "116c4ec14ae661d0225af532090169d6",
  subsidyClaimCount: "51",
  draftClaimCount: "51",
  subsidyClaimChecksum: "81b9fb864f91a530ac84e9ffba4320fb",
  subsidyRemittanceCount: "0",
  familyCount: "3",
  billingAccountCount: "3",
  billingAccountBalanceCents: "12400",
  billingAccountChecksum: "7b0b4e8d7cd60bbbfcd2c0de865dbdb3",
  invoiceCount: "0",
  paymentCount: "0",
  familyLedgerEntryCount: "4",
  familyLedgerEntryCents: "-122470",
  familyLedgerChecksum: "a3b75d5417d644cd8a6f5115857d175b",
  legacyAgencyPaymentCount: "4",
  legacyAgencyPaymentCents: "-122470",
  legacyAgencyPaymentChecksum: "b22b65d0feb18b5819c2860da9ffdbeb",
  ledgerAccountCount: "82",
  nonzeroLedgerAccountCount: "0",
  ledgerAccountBalanceCents: "0",
  ledgerEntryCount: "0",
  remittanceBatchCount: "0",
  remittanceAllocationCount: "0",
  ledgerAdjustmentCount: "0",
  accountingPeriodCount: "0",
  accountingPeriodEventCount: "0",
});
const EXPECTED_PRODUCTION_DERIVED_PREDECESSOR = Object.freeze({
  agencyProgramCount: "82",
  activeProgramCount: "5",
  setupRequiredProgramCount: "77",
  agencyProgramChecksum: "116c4ec14ae661d0225af532090169d6",
  subsidyClaimCount: "51",
  draftClaimCount: "51",
  subsidyClaimChecksum: "81b9fb864f91a530ac84e9ffba4320fb",
  subsidyRemittanceCount: "0",
  familyCount: "3",
  billingAccountCount: "3",
  billingAccountBalanceCents: "12400",
  billingAccountChecksum: "7b0b4e8d7cd60bbbfcd2c0de865dbdb3",
  invoiceCount: "0",
  paymentCount: "0",
  familyLedgerEntryCount: "4",
  familyLedgerEntryCents: "-122470",
  familyLedgerChecksum: "a3b75d5417d644cd8a6f5115857d175b",
  legacyAgencyPaymentCount: "4",
  legacyAgencyPaymentCents: "-122470",
  legacyAgencyPaymentChecksum: "b22b65d0feb18b5819c2860da9ffdbeb",
});
const PREDECESSOR_FIXTURE = Object.freeze({
  actor: "literal-predecessor-actor-v1",
  center: "literal-predecessor-center-v1",
  family: "literal-predecessor-family-v1",
  child: "literal-predecessor-child-v1",
  program: "literal-predecessor-program-v1",
  authorization: "literal-predecessor-authorization-v1",
  claim: "literal-predecessor-claim-v1",
  claimLine: "literal-predecessor-claim-line-v1",
  remittance: "literal-predecessor-remittance-v1",
  account: "agency-ledger-account:literal-predecessor-program-v1",
  claimEntry: "agency-ledger-claim:literal-predecessor-claim-v1",
  receiptEntry: "agency-ledger-remittance:literal-predecessor-remittance-v1",
  reversalEntry: "agency-ledger-remittance-reversal:literal-predecessor-remittance-v1",
  centerCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
  claimCreatedAt: new Date("2026-06-01T12:00:00.000Z"),
  remittanceCreatedAt: new Date("2026-06-02T07:00:00.000Z"),
  paidAt: new Date("2026-06-02T12:00:00.000Z"),
  reversedAt: new Date("2026-06-02T08:00:00.000Z"),
});
const CONTROLLED_MORNING_FIXTURE = Object.freeze({
  preparer: "literal-controlled-morning-preparer-v1",
  reviewer: "literal-controlled-morning-reviewer-v1",
  center: "literal-controlled-morning-center-v1",
  family: "literal-controlled-morning-family-v1",
  child: "literal-controlled-morning-child-v1",
  program: "literal-controlled-morning-program-v1",
  authorization: "literal-controlled-morning-authorization-v1",
  claim: "literal-controlled-morning-claim-v1",
  claimLine: "literal-controlled-morning-claim-line-v1",
  account: "agency-ledger-account:literal-controlled-morning-program-v1",
  claimEntry: "agency-ledger-claim:literal-controlled-morning-claim-v1",
  batch: "literal-controlled-morning-batch-v1",
  allocation: "literal-controlled-morning-allocation-v1",
  remittance: "literal-controlled-morning-remittance-v1",
  receiptEntry: "literal-controlled-morning-receipt-v1",
  externalReference: "LITERAL-CONTROLLED-MORNING-V1",
  centerCreatedAt: new Date("2026-05-02T12:00:00.000Z"),
  claimCreatedAt: new Date("2026-06-03T06:00:00.000Z"),
  approvedAt: new Date("2026-06-03T07:00:00.000Z"),
  activatedAt: new Date("2026-06-03T07:20:00.000Z"),
  batchCreatedAt: new Date("2026-06-03T07:30:00.000Z"),
  allocationCreatedAt: new Date("2026-06-03T07:40:00.000Z"),
  reviewedAt: new Date("2026-06-03T08:00:00.000Z"),
  paidAt: new Date("2026-06-03T12:00:00.000Z"),
});
const EXPECTED_MIGRATIONS = Object.freeze([
  {
    key: "agencyReceivableLedger",
    version: "20260903190000",
    nameFragment: "agency_receivable_ledger",
    expectedHistoryName: "20260903190000_agency_receivable_ledger",
    expectedHistoryVersion: "20260905002924",
    expectedHistoryStatementCount: 1,
    expectedHistoryStatementOctets: 31_631,
    expectedHistoryStatementsSha256: "ef3d32acb21cca1e11d08db5098c850bca79b1bea89382a2c60e27454d59c0c5",
    expectedSha256: "ef3d32acb21cca1e11d08db5098c850bca79b1bea89382a2c60e27454d59c0c5",
    prismaRelativePath: "prisma/migrations/20260903190000_agency_receivable_ledger/migration.sql",
    supabaseRelativePath: "supabase/migrations/20260903190000_agency_receivable_ledger.sql",
  },
  {
    key: "agencyReconciliationControls",
    version: "20260903210000",
    nameFragment: "agency_reconciliation_controls",
    expectedHistoryName: "20260903210000_agency_reconciliation_controls",
    expectedHistoryVersion: "20260905002935",
    expectedHistoryStatementCount: 1,
    expectedHistoryStatementOctets: 253_662,
    expectedHistoryStatementsSha256: "5576f0ae9f743e45a713151dd7a87809d3596c33bc75b29b4e9ef4b9f3a99bd8",
    expectedSha256: "5576f0ae9f743e45a713151dd7a87809d3596c33bc75b29b4e9ef4b9f3a99bd8",
    prismaRelativePath: "prisma/migrations/20260903210000_agency_reconciliation_controls/migration.sql",
    supabaseRelativePath: "supabase/migrations/20260903210000_agency_reconciliation_controls.sql",
  },
]);
const GLOBAL_LOGICAL_DIGEST_TABLES = Object.freeze([
  "Tenant",
  "Organization",
  "Center",
  "User",
  "UserAccessGrant",
  "StaffProfile",
  "Guardian",
  "AuthorizedPickup",
  "Family",
  "BillingAccount",
  "Invoice",
  "Payment",
  "LedgerEntry",
  "Classroom",
  "Child",
  "AgencyProgram",
  "SubsidyAuthorization",
  "SubsidyClaim",
  "SubsidyClaimLine",
  "SubsidyRemittance",
  "AgencyLedgerAccount",
  "AgencyLedgerEntry",
  "AgencyRemittanceBatch",
  "AgencyRemittanceAllocation",
  "AgencyLedgerAdjustment",
  "AgencyAccountingPeriod",
  "AgencyAccountingPeriodEvent",
]);
const TEMPORARY_FENCE_TRIGGERS = Object.freeze([
  "AgencyProgram_00_reconciliation_migration_fence",
  "SubsidyAuthorization_00_reconciliation_migration_fence",
  "SubsidyClaim_00_reconciliation_migration_fence",
  "SubsidyClaimLine_00_reconciliation_migration_fence",
  "SubsidyRemittance_00_reconciliation_migration_fence",
  "AgencyLedgerAccount_00_reconciliation_migration_fence",
  "AgencyLedgerEntry_00_reconciliation_migration_fence",
]);
const CANDIDATE_RELATIONS = Object.freeze([
  "AgencyLedgerAccount",
  "AgencyLedgerEntry",
  "AgencyRemittanceBatch",
  "AgencyRemittanceAllocation",
  "AgencyLedgerAdjustment",
  "AgencyAccountingPeriod",
  "AgencyAccountingPeriodEvent",
]);
const CANDIDATE_COLUMNS = Object.freeze([
  ["AgencyProgram", "receivableGlCode"],
  ["AgencyProgram", "cashGlCode"],
  ["AgencyProgram", "adjustmentGlCode"],
  ["AgencyProgram", "costCenterCode"],
  ["Center", "agencyReconciliationEnabled"],
  ["Center", "agencyReconciliationActivatedAt"],
  ["Center", "agencyReconciliationActivatedById"],
  ["Center", "agencyReconciliationActivationReason"],
]);
const SHARED_LOCK_FUNCTIONS = Object.freeze([
  "enforce_agency_ledger_account_scope",
  "lock_agency_financial_center",
  "lock_agency_financial_centers",
]);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const schemaPath = resolve(repositoryRoot, "prisma/schema.prisma");
const prismaCliPath = resolve(repositoryRoot, "node_modules/prisma/build/index.js");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (
    typeof item === "bigint" ? item.toString() : item
  )));
}

function utcDay(offset) {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + offset,
    12,
    0,
    0,
    0,
  ));
}

function validatedRehearsalUrl(rawUrl) {
  if (!rawUrl) throw new Error("REHEARSAL_DATABASE_URL is required; no DATABASE_URL fallback is permitted.");
  assertAuthorizedRehearsalDatabaseTarget(rawUrl);
  const parsed = new URL(rawUrl);
  if (parsed.hostname.endsWith(".pooler.supabase.com") && (parsed.port || "5432") !== "5432") {
    throw new Error("Literal replay requires a direct connection or the Supabase session pooler on port 5432.");
  }
  return parsed;
}

function urlWithApplicationName(parsedUrl, applicationName) {
  const result = new URL(parsedUrl.href);
  result.searchParams.set("application_name", applicationName);
  return result.href;
}

function client(databaseUrl) {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: ["error"],
  });
}

async function verifyMigrationFiles() {
  const result = {};
  for (const migration of EXPECTED_MIGRATIONS) {
    const [prismaBytes, supabaseBytes] = await Promise.all([
      readFile(resolve(repositoryRoot, migration.prismaRelativePath)),
      readFile(resolve(repositoryRoot, migration.supabaseRelativePath)),
    ]);
    assert.deepEqual(
      supabaseBytes,
      prismaBytes,
      `${migration.key} Prisma and Supabase migration mirrors differ byte-for-byte.`,
    );
    assert.equal(
      prismaBytes.includes(13),
      false,
      `${migration.key} must remain LF-only before its pinned hash is trusted.`,
    );
    const actualSha256 = sha256(prismaBytes);
    assert.equal(
      actualSha256,
      migration.expectedSha256,
      `${migration.key} changed after review; discard this rehearsal branch and re-audit before replay.`,
    );
    result[migration.key] = {
      sha256: actualSha256,
      mirrorsByteForByteIdentical: true,
      lineEndings: "LF",
    };
  }
  return result;
}

async function readDatabaseIdentity(tx, { requireSupabaseMigrationHistory = true } = {}) {
  const [identity] = await tx.$queryRaw`
    SELECT current_database() AS "databaseName",
      current_user AS "databaseUser",
      shobj_description(database_row.oid, 'pg_database') AS "databaseMarker",
      EXISTS (
        SELECT 1
        FROM "Tenant"
        WHERE id = ${REHEARSAL_TENANT_ID}
          AND name = 'Agency ledger rehearsal'
          AND slug = 'agency-ledger-rehearsal'
      ) AS "tenantMarkerPresent",
      EXISTS (
        SELECT 1
        FROM "Organization"
        WHERE id = ${REHEARSAL_ORGANIZATION_ID}
          AND "tenantId" = ${REHEARSAL_TENANT_ID}
          AND name = 'Sanitized rehearsal organization'
      ) AS "organizationMarkerPresent",
      (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL) AS "hasSupabaseMigrationHistory",
      (to_regclass('public."_prisma_migrations"') IS NOT NULL) AS "hasPrismaMigrationHistory"
    FROM pg_database database_row
    WHERE database_row.datname = current_database()
  `;
  assert.equal(identity?.databaseName, "postgres", "Literal replay must target the postgres database.");
  assert.equal(identity?.databaseUser, "postgres", "Literal replay must use the disposable branch postgres role.");
  assert.equal(
    identity?.databaseMarker,
    AGENCY_REHEARSAL_DATABASE_MARKER,
    "The exact disposable rehearsal database marker is missing or conflicting.",
  );
  assert.equal(identity?.tenantMarkerPresent, true, "The sanitized rehearsal tenant marker is missing.");
  assert.equal(identity?.organizationMarkerPresent, true, "The sanitized rehearsal organization marker is missing.");
  if (requireSupabaseMigrationHistory) {
    assert.equal(identity?.hasSupabaseMigrationHistory, true, "Supabase migration history is required for this rehearsal mode.");
  }
  return identity;
}

function migrationKind(row) {
  const version = String(row.version ?? "");
  const name = String(row.name ?? "").toLowerCase();
  return EXPECTED_MIGRATIONS.find((migration) => (
    version === migration.version || name.includes(migration.nameFragment)
  ));
}

async function readMigrationWriterEvidence(tx, identity) {
  const selectedRows = await tx.$queryRaw`
    SELECT version, name, statements
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('20260903190000', '20260903210000')
      OR LOWER(COALESCE(name, '')) LIKE '%agency_receivable_ledger%'
      OR LOWER(COALESCE(name, '')) LIKE '%agency_reconciliation_controls%'
    ORDER BY version, name
  `;
  assert.equal(
    selectedRows.length,
    EXPECTED_MIGRATIONS.length,
    "Supabase-authoritative rehearsal requires exactly one selected history row for each candidate migration.",
  );
  const history = selectedRows.map((row) => {
    const kind = migrationKind(row);
    assert.ok(kind, `Unexpected selected Supabase migration history row: ${String(row.version)} ${String(row.name)}`);
    const statements = Array.isArray(row.statements)
      ? row.statements.map((statement) => String(statement))
      : [String(row.statements ?? "")];
    return {
      key: kind.key,
      version: String(row.version),
      name: row.name === null ? null : String(row.name),
      statementCount: statements.length,
      statementOctets: Buffer.byteLength(statements.join("\n"), "utf8"),
      statementsSha256: sha256(statements.join("\n")),
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
  for (const migration of EXPECTED_MIGRATIONS) {
    const matchingRows = history.filter((row) => row.key === migration.key);
    assert.equal(matchingRows.length, 1, `Supabase migration history does not uniquely identify ${migration.key}.`);
    assert.equal(
      matchingRows[0].name,
      migration.expectedHistoryName,
      `${migration.key} was not installed through the selected exact-name Supabase writer path.`,
    );
    assert.equal(
      matchingRows[0].version,
      migration.expectedHistoryVersion,
      `${migration.key} has an unexpected Supabase writer version; discard or re-audit this exact branch.`,
    );
    assert.equal(
      matchingRows[0].statementCount,
      migration.expectedHistoryStatementCount,
      `${migration.key} has an unexpected installed statement count.`,
    );
    assert.equal(
      matchingRows[0].statementOctets,
      migration.expectedHistoryStatementOctets,
      `${migration.key} installed statement bytes do not match the frozen migration.`,
    );
    assert.equal(
      matchingRows[0].statementsSha256,
      migration.expectedHistoryStatementsSha256,
      `${migration.key} installed statement hash does not match the frozen migration.`,
    );
  }

  let candidatePrismaRows = [];
  if (identity.hasPrismaMigrationHistory) {
    candidatePrismaRows = await tx.$queryRawUnsafe(`
      SELECT migration_name AS "migrationName", checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
      FROM public."_prisma_migrations"
      WHERE migration_name IN (
        '20260903190000_agency_receivable_ledger',
        '20260903210000_agency_reconciliation_controls'
      )
      ORDER BY migration_name, started_at
    `);
  }
  assert.equal(
    candidatePrismaRows.length,
    0,
    "Candidate migration history is split between Prisma and Supabase writers; discard the rehearsal branch.",
  );
  return normalize({
    authority: "supabase_migrations.schema_migrations",
    selectedRows: history,
    prismaHistoryTablePresent: Boolean(identity.hasPrismaMigrationHistory),
    candidatePrismaRows,
  });
}

async function readUnmigratedCandidateState(tx, identity) {
  let supabaseHistoryRows = [];
  if (identity.hasSupabaseMigrationHistory) {
    supabaseHistoryRows = await tx.$queryRaw`
      SELECT version, name
      FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260903190000', '20260903210000')
        OR LOWER(COALESCE(name, '')) LIKE '%agency_receivable_ledger%'
        OR LOWER(COALESCE(name, '')) LIKE '%agency_reconciliation_controls%'
      ORDER BY version, name
    `;
  }
  let prismaHistoryRows = [];
  if (identity.hasPrismaMigrationHistory) {
    prismaHistoryRows = await tx.$queryRawUnsafe(`
      SELECT migration_name AS "migrationName"
      FROM public."_prisma_migrations"
      WHERE migration_name IN (
        '20260903190000_agency_receivable_ledger',
        '20260903210000_agency_reconciliation_controls'
      )
      ORDER BY migration_name, started_at
    `);
  }
  const [relations, columns, routines, catalogObjects] = await Promise.all([
    tx.$queryRaw`
      SELECT class_row.relname AS name
      FROM pg_class class_row
      WHERE class_row.relnamespace = 'public'::regnamespace
        AND class_row.relname = ANY(${CANDIDATE_RELATIONS})
      ORDER BY class_row.relname
    `,
    tx.$queryRaw`
      SELECT table_name AS "tableName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('AgencyProgram', 'receivableGlCode'),
          ('AgencyProgram', 'cashGlCode'),
          ('AgencyProgram', 'adjustmentGlCode'),
          ('AgencyProgram', 'costCenterCode'),
          ('Center', 'agencyReconciliationEnabled'),
          ('Center', 'agencyReconciliationActivatedAt'),
          ('Center', 'agencyReconciliationActivatedById'),
          ('Center', 'agencyReconciliationActivationReason')
        )
      ORDER BY table_name, column_name
    `,
    tx.$queryRaw`
      SELECT function_row.proname AS name,
        pg_get_function_identity_arguments(function_row.oid) AS arguments
      FROM pg_proc function_row
      WHERE function_row.pronamespace = 'public'::regnamespace
        AND (
          function_row.proname LIKE '%agency_ledger%'
          OR function_row.proname LIKE '%agency_remittance%'
          OR function_row.proname LIKE '%agency_accounting_period%'
          OR function_row.proname LIKE '%agency_reconciliation%'
          OR function_row.proname LIKE 'ensure_baseline_%'
          OR function_row.proname LIKE '%subsidy_claim_financial%'
          OR function_row.proname LIKE '%subsidy_remittance_financial%'
        )
      ORDER BY function_row.proname, pg_get_function_identity_arguments(function_row.oid)
    `,
    tx.$queryRaw`
      SELECT kind, name
      FROM (
        SELECT 'constraint'::text AS kind, constraint_row.conname AS name
        FROM pg_constraint constraint_row
        WHERE constraint_row.connamespace = 'public'::regnamespace
          AND (
            constraint_row.conname LIKE 'AgencyLedger%'
            OR constraint_row.conname LIKE 'AgencyRemittance%'
            OR constraint_row.conname LIKE 'AgencyAccountingPeriod%'
            OR constraint_row.conname LIKE 'Center_agency_reconciliation%'
            OR constraint_row.conname LIKE 'SubsidyRemittance_reversal_chronology%'
          )
        UNION ALL
        SELECT 'trigger', trigger_row.tgname
        FROM pg_trigger trigger_row
        JOIN pg_class class_row ON class_row.oid = trigger_row.tgrelid
        WHERE class_row.relnamespace = 'public'::regnamespace
          AND NOT trigger_row.tgisinternal
          AND (
            trigger_row.tgname LIKE '%agency_%'
            OR trigger_row.tgname LIKE 'AgencyLedger%'
            OR trigger_row.tgname LIKE 'AgencyRemittance%'
            OR trigger_row.tgname LIKE 'AgencyAccountingPeriod%'
            OR trigger_row.tgname LIKE 'SubsidyClaim%financial%'
            OR trigger_row.tgname LIKE 'SubsidyRemittance%financial%'
          )
        UNION ALL
        SELECT 'index', class_row.relname
        FROM pg_class class_row
        WHERE class_row.relnamespace = 'public'::regnamespace
          AND class_row.relkind = 'i'
          AND (
            class_row.relname LIKE 'AgencyLedger%'
            OR class_row.relname LIKE 'AgencyRemittance%'
            OR class_row.relname LIKE 'AgencyAccountingPeriod%'
          )
      ) candidate
      ORDER BY kind, name
    `,
  ]);

  assert.deepEqual(supabaseHistoryRows, [], "The predecessor branch already has candidate Supabase migration history.");
  assert.deepEqual(prismaHistoryRows, [], "The predecessor branch already has candidate Prisma migration history.");
  assert.deepEqual(relations, [], "The predecessor branch already contains a candidate ledger relation.");
  assert.deepEqual(columns, [], "The predecessor branch already contains a candidate activation or accounting column.");
  assert.deepEqual(routines, [], "The predecessor branch already contains a candidate ledger routine.");
  assert.deepEqual(catalogObjects, [], "The predecessor branch already contains a candidate constraint, trigger, or index.");
  return normalize({
    supabaseHistoryRows,
    prismaHistoryRows,
    relations,
    columns,
    routines,
    catalogObjects,
    expectedCandidateRelations: CANDIDATE_RELATIONS,
    expectedCandidateColumns: CANDIDATE_COLUMNS,
  });
}

async function readExpectedProductionDerivedPredecessorEvidence(tx) {
  const [row] = await tx.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "Center" WHERE id <> ${PREDECESSOR_FIXTURE.center})::bigint AS "centerCount",
      (SELECT COUNT(*) FROM "Center"
        WHERE id <> ${PREDECESSOR_FIXTURE.center}
          AND "organizationId" = ${REHEARSAL_ORGANIZATION_ID}
          AND "customFields"->>'agencyLedgerRehearsalSourceShapeSha256' = ${EXPECTED_SOURCE_SHAPE_SHA256})::bigint AS "sourceShapeMarkerCount",
      (SELECT COUNT(*) FROM "AgencyProgram" WHERE id <> ${PREDECESSOR_FIXTURE.program})::bigint AS "agencyProgramCount",
      (SELECT COUNT(*) FROM "AgencyProgram" WHERE id <> ${PREDECESSOR_FIXTURE.program} AND status = 'active')::bigint AS "activeProgramCount",
      (SELECT COUNT(*) FROM "AgencyProgram" WHERE id <> ${PREDECESSOR_FIXTURE.program} AND status = 'setup_required')::bigint AS "setupRequiredProgramCount",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "centerId", '|' ORDER BY id), '')) FROM "AgencyProgram" WHERE id <> ${PREDECESSOR_FIXTURE.program}) AS "agencyProgramChecksum",
      (SELECT COUNT(*) FROM "SubsidyClaim" WHERE id <> ${PREDECESSOR_FIXTURE.claim})::bigint AS "subsidyClaimCount",
      (SELECT COUNT(*) FROM "SubsidyClaim" WHERE id <> ${PREDECESSOR_FIXTURE.claim} AND status = 'draft')::bigint AS "draftClaimCount",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "claimedCents"::text || ':' || COALESCE("approvedCents"::text, '') || ':' || "paidCents"::text || ':' || "servicePeriodStart"::text || ':' || "servicePeriodEnd"::text, '|' ORDER BY id), '')) FROM "SubsidyClaim" WHERE id <> ${PREDECESSOR_FIXTURE.claim}) AS "subsidyClaimChecksum",
      (SELECT COUNT(*) FROM "SubsidyRemittance" WHERE id <> ${PREDECESSOR_FIXTURE.remittance})::bigint AS "subsidyRemittanceCount",
      (SELECT COUNT(*) FROM "Family" WHERE id <> ${PREDECESSOR_FIXTURE.family})::bigint AS "familyCount",
      (SELECT COUNT(*) FROM "BillingAccount")::bigint AS "billingAccountCount",
      (SELECT COALESCE(SUM("balanceCents"), 0) FROM "BillingAccount")::bigint AS "billingAccountBalanceCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "familyId" || ':' || "balanceCents"::text || ':' || COALESCE("ledgerSyncedAt"::text, ''), '|' ORDER BY id), '')) FROM "BillingAccount") AS "billingAccountChecksum",
      (SELECT COUNT(*) FROM "Invoice")::bigint AS "invoiceCount",
      (SELECT COUNT(*) FROM "Payment")::bigint AS "paymentCount",
      (SELECT COUNT(*) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCount",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || type || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry") AS "familyLedgerChecksum",
      (SELECT COUNT(*) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyAgencyPaymentCount",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyAgencyPaymentCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry" WHERE type = 'agency_payment') AS "legacyAgencyPaymentChecksum"
  `;
  assert.ok(row, "The production-derived predecessor evidence query returned no row.");
  const normalized = normalize(row);
  assert.ok(Number(normalized.centerCount) > 0, "The production-derived predecessor contains no sanitized school markers.");
  assert.equal(
    normalized.sourceShapeMarkerCount,
    normalized.centerCount,
    "Every sanitized predecessor school must carry the exact captured production source-shape marker.",
  );
  for (const [field, expected] of Object.entries(EXPECTED_PRODUCTION_DERIVED_PREDECESSOR)) {
    assert.equal(normalized[field], expected, `Production-derived predecessor mismatch for ${field}.`);
  }
  return {
    ...normalized,
    sourceShapeSha256: EXPECTED_SOURCE_SHAPE_SHA256,
    everySanitizedCenterCarriesSourceShapeMarker: true,
    exactExpectedCountsAndChecksumsMatched: true,
  };
}

function expectedPredecessorSourceSnapshot() {
  const fixture = PREDECESSOR_FIXTURE;
  return normalize({
    center: [{
      id: fixture.center,
      organizationId: REHEARSAL_ORGANIZATION_ID,
      name: "Literal predecessor school v1",
      status: "active",
      customFields: {
        agencyLedgerRehearsalSourceShapeSha256: EXPECTED_SOURCE_SHAPE_SHA256,
        disposableLiteralReplay: true,
        fixture: "predecessor-v1",
      },
      licensedCapacity: 1,
      timezone: "America/New_York",
      createdAt: fixture.centerCreatedAt,
      updatedAt: fixture.centerCreatedAt,
    }],
    family: [{
      id: fixture.family,
      centerId: fixture.center,
      name: "Literal predecessor family v1",
      customFields: { disposableLiteralReplay: true, fixture: "predecessor-v1" },
      createdAt: fixture.centerCreatedAt,
      updatedAt: fixture.centerCreatedAt,
    }],
    child: [{
      id: fixture.child,
      familyId: fixture.family,
      fullName: "Literal predecessor child v1",
      dateOfBirth: new Date("2021-06-01T12:00:00.000Z"),
      ageGroup: "preschool",
      enrollmentStatus: "enrolled",
      customFields: { disposableLiteralReplay: true, fixture: "predecessor-v1" },
      createdAt: fixture.centerCreatedAt,
      updatedAt: fixture.centerCreatedAt,
    }],
    program: [{
      id: fixture.program,
      centerId: fixture.center,
      name: "Literal Predecessor Agency v1",
      programName: "Migration compatibility proof",
      stateCode: "IN",
      providerNumber: "LITERAL-PREDECESSOR-V1",
      submissionMethod: "agency_portal",
      portalUrl: "https://example.invalid/literal-predecessor",
      paymentInstructions: "Disposable predecessor proof only",
      requirements: [],
      status: "active",
      customFields: { disposableLiteralReplay: true, fixture: "predecessor-v1" },
      createdAt: fixture.centerCreatedAt,
      updatedAt: fixture.centerCreatedAt,
    }],
    authorization: [{
      id: fixture.authorization,
      centerId: fixture.center,
      agencyProgramId: fixture.program,
      familyId: fixture.family,
      childId: fixture.child,
      authorizationNumber: "LITERAL-PREDECESSOR-AUTH-V1",
      coverageStart: new Date("2026-01-01T12:00:00.000Z"),
      coverageEnd: new Date("2026-12-31T12:00:00.000Z"),
      authorizedRateCents: 2_000,
      familyCopayCents: 0,
      unitType: "weekly",
      status: "active",
      requiredDocuments: [],
      customFields: { disposableLiteralReplay: true, fixture: "predecessor-v1" },
      createdAt: fixture.centerCreatedAt,
      updatedAt: fixture.centerCreatedAt,
    }],
    claim: [{
      id: fixture.claim,
      centerId: fixture.center,
      agencyProgramId: fixture.program,
      authorizationId: fixture.authorization,
      number: "LITERAL-PREDECESSOR-CLAIM-V1",
      servicePeriodStart: new Date("2026-05-18T12:00:00.000Z"),
      servicePeriodEnd: new Date("2026-05-24T12:00:00.000Z"),
      dueDate: new Date("2026-06-15T12:00:00.000Z"),
      status: "approved",
      claimedCents: 2_000,
      approvedCents: 2_000,
      paidCents: 0,
      submittedAt: new Date("2026-05-25T12:00:00.000Z"),
      approvedAt: null,
      externalReference: "LITERAL-PREDECESSOR-DECISION-V1",
      customFields: {
        disposableLiteralReplay: true,
        fixture: "predecessor-v1",
        legacyApprovedAtIntentionallyNull: true,
      },
      createdById: fixture.actor,
      createdAt: fixture.claimCreatedAt,
      updatedAt: fixture.claimCreatedAt,
    }],
    claimLine: [{
      id: fixture.claimLine,
      claimId: fixture.claim,
      childId: fixture.child,
      description: "Literal predecessor approved care",
      serviceUnits: 1,
      unitType: "weekly",
      rateCents: 2_000,
      amountCents: 2_000,
      createdAt: fixture.claimCreatedAt,
    }],
    remittance: [{
      id: fixture.remittance,
      claimId: fixture.claim,
      amountCents: 1_000,
      paidAt: fixture.paidAt,
      paymentMethod: "ach",
      externalReference: "LITERAL-PREDECESSOR-ACH-V1",
      notes: "Same UTC-day predecessor receipt/reversal proof",
      enteredById: fixture.actor,
      reversedAt: fixture.reversedAt,
      reversedById: "literal-predecessor-reverser-v1",
      reversalReason: "Same UTC-day predecessor reversal proof",
      createdAt: fixture.remittanceCreatedAt,
    }],
  });
}

async function readPredecessorSourceSnapshot(tx) {
  const [center, family, child, program, authorization, claim, claimLine, remittance] = await Promise.all([
    tx.$queryRaw`SELECT id, "organizationId", name, status, "customFields", "licensedCapacity", timezone, "createdAt", "updatedAt" FROM "Center" WHERE id = ${PREDECESSOR_FIXTURE.center}`,
    tx.$queryRaw`SELECT id, "centerId", name, "customFields", "createdAt", "updatedAt" FROM "Family" WHERE id = ${PREDECESSOR_FIXTURE.family}`,
    tx.$queryRaw`SELECT id, "familyId", "fullName", "dateOfBirth", "ageGroup", "enrollmentStatus", "customFields", "createdAt", "updatedAt" FROM "Child" WHERE id = ${PREDECESSOR_FIXTURE.child}`,
    tx.$queryRaw`SELECT id, "centerId", name, "programName", "stateCode", "providerNumber", "submissionMethod", "portalUrl", "paymentInstructions", requirements, status, "customFields", "createdAt", "updatedAt" FROM "AgencyProgram" WHERE id = ${PREDECESSOR_FIXTURE.program}`,
    tx.$queryRaw`SELECT id, "centerId", "agencyProgramId", "familyId", "childId", "authorizationNumber", "coverageStart", "coverageEnd", "authorizedRateCents", "familyCopayCents", "unitType", status, "requiredDocuments", "customFields", "createdAt", "updatedAt" FROM "SubsidyAuthorization" WHERE id = ${PREDECESSOR_FIXTURE.authorization}`,
    tx.$queryRaw`SELECT id, "centerId", "agencyProgramId", "authorizationId", number, "servicePeriodStart", "servicePeriodEnd", "dueDate", status, "claimedCents", "approvedCents", "paidCents", "submittedAt", "approvedAt", "externalReference", "customFields", "createdById", "createdAt", "updatedAt" FROM "SubsidyClaim" WHERE id = ${PREDECESSOR_FIXTURE.claim}`,
    tx.$queryRaw`SELECT id, "claimId", "childId", description, "serviceUnits", "unitType", "rateCents", "amountCents", "createdAt" FROM "SubsidyClaimLine" WHERE id = ${PREDECESSOR_FIXTURE.claimLine}`,
    tx.$queryRaw`SELECT id, "claimId", "amountCents", "paidAt", "paymentMethod", "externalReference", notes, "enteredById", "reversedAt", "reversedById", "reversalReason", "createdAt" FROM "SubsidyRemittance" WHERE id = ${PREDECESSOR_FIXTURE.remittance}`,
  ]);
  const snapshot = normalize({ center, family, child, program, authorization, claim, claimLine, remittance });
  assert.deepEqual(snapshot, expectedPredecessorSourceSnapshot(), "The deterministic predecessor source fixture is missing or changed.");
  return snapshot;
}

async function assertNoPredecessorFixtureCollision(tx) {
  const [collision] = await tx.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM "Center" WHERE id = ${PREDECESSOR_FIXTURE.center}
      UNION ALL SELECT 1 FROM "Family" WHERE id = ${PREDECESSOR_FIXTURE.family}
      UNION ALL SELECT 1 FROM "Child" WHERE id = ${PREDECESSOR_FIXTURE.child}
      UNION ALL SELECT 1 FROM "AgencyProgram" WHERE id = ${PREDECESSOR_FIXTURE.program}
      UNION ALL SELECT 1 FROM "SubsidyAuthorization" WHERE id = ${PREDECESSOR_FIXTURE.authorization}
      UNION ALL SELECT 1 FROM "SubsidyClaim" WHERE id = ${PREDECESSOR_FIXTURE.claim}
      UNION ALL SELECT 1 FROM "SubsidyClaimLine" WHERE id = ${PREDECESSOR_FIXTURE.claimLine}
      UNION ALL SELECT 1 FROM "SubsidyRemittance" WHERE id = ${PREDECESSOR_FIXTURE.remittance}
    ) AS collision
  `;
  assert.equal(collision?.collision, false, "The deterministic predecessor fixture already exists; no retry is allowed.");
}

async function insertPredecessorFixture(tx) {
  const fixture = PREDECESSOR_FIXTURE;
  await tx.$executeRaw`
    INSERT INTO "Center" (id, "organizationId", name, status, "customFields", "licensedCapacity", timezone, "createdAt", "updatedAt")
    VALUES (${fixture.center}, ${REHEARSAL_ORGANIZATION_ID}, 'Literal predecessor school v1', 'active',
      JSONB_BUILD_OBJECT('agencyLedgerRehearsalSourceShapeSha256', ${EXPECTED_SOURCE_SHAPE_SHA256}, 'disposableLiteralReplay', TRUE, 'fixture', 'predecessor-v1'),
      1, 'America/New_York', ${fixture.centerCreatedAt}, ${fixture.centerCreatedAt})
  `;
  await tx.$executeRaw`
    INSERT INTO "Family" (id, "centerId", name, "customFields", "createdAt", "updatedAt")
    VALUES (${fixture.family}, ${fixture.center}, 'Literal predecessor family v1',
      JSONB_BUILD_OBJECT('disposableLiteralReplay', TRUE, 'fixture', 'predecessor-v1'), ${fixture.centerCreatedAt}, ${fixture.centerCreatedAt})
  `;
  await tx.$executeRaw`
    INSERT INTO "Child" (id, "familyId", "fullName", "dateOfBirth", "ageGroup", "enrollmentStatus", "customFields", "createdAt", "updatedAt")
    VALUES (${fixture.child}, ${fixture.family}, 'Literal predecessor child v1', ${new Date("2021-06-01T12:00:00.000Z")},
      'preschool', 'enrolled', JSONB_BUILD_OBJECT('disposableLiteralReplay', TRUE, 'fixture', 'predecessor-v1'),
      ${fixture.centerCreatedAt}, ${fixture.centerCreatedAt})
  `;
  await tx.$executeRaw`
    INSERT INTO "AgencyProgram" (id, "centerId", name, "programName", "stateCode", "providerNumber", "submissionMethod", "portalUrl", "paymentInstructions", requirements, status, "customFields", "createdAt", "updatedAt")
    VALUES (${fixture.program}, ${fixture.center}, 'Literal Predecessor Agency v1', 'Migration compatibility proof', 'IN',
      'LITERAL-PREDECESSOR-V1', 'agency_portal', 'https://example.invalid/literal-predecessor', 'Disposable predecessor proof only',
      '[]'::jsonb, 'active', JSONB_BUILD_OBJECT('disposableLiteralReplay', TRUE, 'fixture', 'predecessor-v1'),
      ${fixture.centerCreatedAt}, ${fixture.centerCreatedAt})
  `;
  await tx.$executeRaw`
    INSERT INTO "SubsidyAuthorization" (id, "centerId", "agencyProgramId", "familyId", "childId", "authorizationNumber", "coverageStart", "coverageEnd", "authorizedRateCents", "familyCopayCents", "unitType", status, "requiredDocuments", "customFields", "createdAt", "updatedAt")
    VALUES (${fixture.authorization}, ${fixture.center}, ${fixture.program}, ${fixture.family}, ${fixture.child},
      'LITERAL-PREDECESSOR-AUTH-V1', ${new Date("2026-01-01T12:00:00.000Z")}, ${new Date("2026-12-31T12:00:00.000Z")},
      2000, 0, 'weekly', 'active', '[]'::jsonb, JSONB_BUILD_OBJECT('disposableLiteralReplay', TRUE, 'fixture', 'predecessor-v1'),
      ${fixture.centerCreatedAt}, ${fixture.centerCreatedAt})
  `;
  await tx.$executeRaw`
    INSERT INTO "SubsidyClaim" (id, "centerId", "agencyProgramId", "authorizationId", number, "servicePeriodStart", "servicePeriodEnd", "dueDate", status, "claimedCents", "approvedCents", "paidCents", "submittedAt", "approvedAt", "externalReference", "customFields", "createdById", "createdAt", "updatedAt")
    VALUES (${fixture.claim}, ${fixture.center}, ${fixture.program}, ${fixture.authorization}, 'LITERAL-PREDECESSOR-CLAIM-V1',
      ${new Date("2026-05-18T12:00:00.000Z")}, ${new Date("2026-05-24T12:00:00.000Z")}, ${new Date("2026-06-15T12:00:00.000Z")},
      'approved', 2000, 2000, 0, ${new Date("2026-05-25T12:00:00.000Z")}, NULL, 'LITERAL-PREDECESSOR-DECISION-V1',
      JSONB_BUILD_OBJECT('disposableLiteralReplay', TRUE, 'fixture', 'predecessor-v1', 'legacyApprovedAtIntentionallyNull', TRUE),
      ${fixture.actor}, ${fixture.claimCreatedAt}, ${fixture.claimCreatedAt})
  `;
  await tx.$executeRaw`
    INSERT INTO "SubsidyClaimLine" (id, "claimId", "childId", description, "serviceUnits", "unitType", "rateCents", "amountCents", "createdAt")
    VALUES (${fixture.claimLine}, ${fixture.claim}, ${fixture.child}, 'Literal predecessor approved care', 1, 'weekly', 2000, 2000, ${fixture.claimCreatedAt})
  `;
  await tx.$executeRaw`
    INSERT INTO "SubsidyRemittance" (id, "claimId", "amountCents", "paidAt", "paymentMethod", "externalReference", notes, "enteredById", "reversedAt", "reversedById", "reversalReason", "createdAt")
    VALUES (${fixture.remittance}, ${fixture.claim}, 1000, ${fixture.paidAt}, 'ach', 'LITERAL-PREDECESSOR-ACH-V1',
      'Same UTC-day predecessor receipt/reversal proof', ${fixture.actor}, ${fixture.reversedAt},
      'literal-predecessor-reverser-v1', 'Same UTC-day predecessor reversal proof', ${fixture.remittanceCreatedAt})
  `;
}

async function preparePredecessor(databaseUrl, migrationFiles) {
  let prisma = client(databaseUrl);
  try {
    const preflight = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const identity = await readDatabaseIdentity(tx, { requireSupabaseMigrationHistory: false });
      const candidateState = await readUnmigratedCandidateState(tx, identity);
      const capturedSeed = await readExpectedProductionDerivedPredecessorEvidence(tx);
      await assertNoPredecessorFixtureCollision(tx);
      return { identity, candidateState, capturedSeed };
    }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });

    const committed = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5min'");
      const identity = await readDatabaseIdentity(tx, { requireSupabaseMigrationHistory: false });
      const candidateState = await readUnmigratedCandidateState(tx, identity);
      const capturedSeed = await readExpectedProductionDerivedPredecessorEvidence(tx);
      await assertNoPredecessorFixtureCollision(tx);
      assert.deepEqual(candidateState, preflight.candidateState);
      assert.deepEqual(capturedSeed, preflight.capturedSeed);
      const immediatelyBeforeWriteIdentity = await readDatabaseIdentity(tx, { requireSupabaseMigrationHistory: false });
      assert.equal(immediatelyBeforeWriteIdentity.databaseMarker, AGENCY_REHEARSAL_DATABASE_MARKER);
      await insertPredecessorFixture(tx);
      const sourceSnapshot = await readPredecessorSourceSnapshot(tx);
      const stillUnmigrated = await readUnmigratedCandidateState(tx, immediatelyBeforeWriteIdentity);
      return normalize({
        databaseMarker: immediatelyBeforeWriteIdentity.databaseMarker,
        markerVerifiedImmediatelyBeforeFirstWrite: true,
        capturedSeed,
        candidateState: stillUnmigrated,
        fixtureDigestSha256: sha256(JSON.stringify(sourceSnapshot)),
      });
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 300_000 });

    console.log(JSON.stringify({
      mode: "prepare_unmigrated_predecessor_fixture",
      targetProjectRef: AGENCY_REHEARSAL_PROJECT_REF,
      target: {
        databaseName: preflight.identity.databaseName,
        databaseUser: preflight.identity.databaseUser,
        databaseMarker: preflight.identity.databaseMarker,
        urlGuard: "exact disposable Supabase project; production explicitly rejected; TLS required",
      },
      migrationFiles,
      fixture: {
        committedSerializableTransaction: true,
        markerVerifiedImmediatelyBeforeFirstWrite: committed.markerVerifiedImmediatelyBeforeFirstWrite,
        sourceRowsOnly: true,
        approvedAtNullUsesKnownCreatedAt: PREDECESSOR_FIXTURE.claimCreatedAt,
        paidAt: PREDECESSOR_FIXTURE.paidAt,
        sourceReversedAt: PREDECESSOR_FIXTURE.reversedAt,
        sameUtcCalendarDay: PREDECESSOR_FIXTURE.paidAt.toISOString().slice(0, 10) === PREDECESSOR_FIXTURE.reversedAt.toISOString().slice(0, 10),
        sourceReversalClockTimePrecedesNoonReceipt: PREDECESSOR_FIXTURE.reversedAt < PREDECESSOR_FIXTURE.paidAt,
        fixtureDigestSha256: committed.fixtureDigestSha256,
      },
      capturedProductionDerivedPredecessor: committed.capturedSeed,
      migrationState: committed.candidateState,
      nextRequiredStep: "Apply both exact frozen files in order through the selected Supabase-authoritative writer, then run this harness with no mode flag. Do not rerun preparation.",
      cleanupPolicy: "No automatic cleanup or retry. Discard this exact disposable branch after evidence capture or any failure.",
    }, null, 2));
  } finally {
    await prisma.$disconnect();
    prisma = null;
  }
}

async function readGlobalLogicalDigests(tx) {
  const results = [];
  for (const tableName of GLOBAL_LOGICAL_DIGEST_TABLES) {
    // Table names are a closed, hard-coded allowlist above. to_jsonb(row)
    // covers every logical column without depending on xmin, ctid, or OIDs.
    const [row] = await tx.$queryRawUnsafe(`
      SELECT COUNT(*)::bigint AS count,
        MD5(COALESCE(STRING_AGG(TO_JSONB(table_row)::text, E'\\n' ORDER BY table_row.id), '')) AS digest
      FROM public."${tableName}" table_row
    `);
    results.push({ tableName, count: row.count, digest: row.digest });
  }
  return normalize(results);
}

async function readReplayRoutineTriggerCatalog(tx) {
  const [routines, triggers] = await Promise.all([
    tx.$queryRaw`
      SELECT function_row.proname AS name,
        pg_get_function_identity_arguments(function_row.oid) AS arguments,
        pg_get_functiondef(function_row.oid) AS definition,
        function_row.prosecdef AS "securityDefiner",
        COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
        COALESCE(function_row.proacl::text, '__DEFAULT__') AS acl,
        owner_row.rolname AS owner,
        language_row.lanname AS language
      FROM pg_proc function_row
      JOIN pg_roles owner_row ON owner_row.oid = function_row.proowner
      JOIN pg_language language_row ON language_row.oid = function_row.prolang
      WHERE function_row.pronamespace = 'public'::regnamespace
        AND (
          function_row.proname LIKE '%agency_ledger%'
          OR function_row.proname LIKE '%agency_remittance%'
          OR function_row.proname LIKE '%agency_accounting_period%'
          OR function_row.proname LIKE '%agency_reconciliation%'
          OR function_row.proname LIKE 'ensure_baseline_%'
          OR function_row.proname LIKE '%subsidy_claim_financial%'
          OR function_row.proname LIKE '%subsidy_remittance_financial%'
        )
      ORDER BY function_row.proname, pg_get_function_identity_arguments(function_row.oid)
    `,
    tx.$queryRaw`
      SELECT class_row.relname AS "tableName", trigger_row.tgname AS name,
        trigger_row.tgenabled AS enabled,
        pg_get_triggerdef(trigger_row.oid, TRUE) AS definition,
        trigger_row.tgdeferrable AS deferrable,
        trigger_row.tginitdeferred AS "initiallyDeferred"
      FROM pg_trigger trigger_row
      JOIN pg_class class_row ON class_row.oid = trigger_row.tgrelid
      WHERE class_row.relnamespace = 'public'::regnamespace
        AND NOT trigger_row.tgisinternal
        AND class_row.relname = ANY(${[
          "Center",
          "AgencyProgram",
          "SubsidyAuthorization",
          "SubsidyClaim",
          "SubsidyClaimLine",
          "SubsidyRemittance",
          ...CANDIDATE_RELATIONS,
        ]})
      ORDER BY class_row.relname, trigger_row.tgname
    `,
  ]);
  const normalized = normalize({ routines, triggers });
  return {
    ...normalized,
    sha256: sha256(JSON.stringify(normalized)),
  };
}

async function readSharedLockFunctionSnapshot(tx) {
  const rows = await tx.$queryRaw`
    SELECT function_row.proname AS name,
      pg_get_function_identity_arguments(function_row.oid) AS arguments,
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosecdef AS "securityDefiner",
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      COALESCE(function_row.proacl::text, '__DEFAULT__') AS acl
    FROM pg_proc function_row
    WHERE function_row.pronamespace = 'public'::regnamespace
      AND function_row.proname = ANY(${SHARED_LOCK_FUNCTIONS})
    ORDER BY function_row.proname, pg_get_function_identity_arguments(function_row.oid)
  `;
  assert.equal(rows.length, SHARED_LOCK_FUNCTIONS.length, "The migrated database is missing a shared agency lock/account-scope function.");
  assert.deepEqual(rows.map((row) => row.name), [...SHARED_LOCK_FUNCTIONS].sort());
  const normalized = normalize(rows);
  return { rows: normalized, sha256: sha256(JSON.stringify(normalized)) };
}

async function readExpectedProductionDerivedSeedEvidence(tx) {
  const [row] = await tx.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "Center")::bigint AS "centerCount",
      (SELECT COUNT(*) FROM "Center"
        WHERE "organizationId" = ${REHEARSAL_ORGANIZATION_ID}
          AND "customFields"->>'agencyLedgerRehearsalSourceShapeSha256' = ${EXPECTED_SOURCE_SHAPE_SHA256})::bigint AS "sourceShapeMarkerCount",
      (SELECT COUNT(*) FROM "AgencyProgram")::bigint AS "agencyProgramCount",
      (SELECT COUNT(*) FROM "AgencyProgram" WHERE status = 'active')::bigint AS "activeProgramCount",
      (SELECT COUNT(*) FROM "AgencyProgram" WHERE status = 'setup_required')::bigint AS "setupRequiredProgramCount",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "centerId", '|' ORDER BY id), '')) FROM "AgencyProgram") AS "agencyProgramChecksum",
      (SELECT COUNT(*) FROM "SubsidyClaim")::bigint AS "subsidyClaimCount",
      (SELECT COUNT(*) FROM "SubsidyClaim" WHERE status = 'draft')::bigint AS "draftClaimCount",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "claimedCents"::text || ':' || COALESCE("approvedCents"::text, '') || ':' || "paidCents"::text || ':' || "servicePeriodStart"::text || ':' || "servicePeriodEnd"::text, '|' ORDER BY id), '')) FROM "SubsidyClaim") AS "subsidyClaimChecksum",
      (SELECT COUNT(*) FROM "SubsidyRemittance")::bigint AS "subsidyRemittanceCount",
      (SELECT COUNT(*) FROM "BillingAccount")::bigint AS "billingAccountCount",
      (SELECT COALESCE(SUM("balanceCents"), 0) FROM "BillingAccount")::bigint AS "billingAccountBalanceCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "familyId" || ':' || "balanceCents"::text || ':' || COALESCE("ledgerSyncedAt"::text, ''), '|' ORDER BY id), '')) FROM "BillingAccount") AS "billingAccountChecksum",
      (SELECT COUNT(*) FROM "Invoice")::bigint AS "invoiceCount",
      (SELECT COUNT(*) FROM "Payment")::bigint AS "paymentCount",
      (SELECT COUNT(*) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCount",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || type || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry") AS "familyLedgerChecksum",
      (SELECT COUNT(*) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyAgencyPaymentCount",
      (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyAgencyPaymentCents",
      (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry" WHERE type = 'agency_payment') AS "legacyAgencyPaymentChecksum",
      (SELECT COUNT(*) FROM "AgencyLedgerAccount")::bigint AS "ledgerAccountCount",
      (SELECT COUNT(*) FROM "AgencyLedgerAccount" WHERE "balanceCents" <> 0)::bigint AS "nonzeroLedgerAccountCount",
      (SELECT COALESCE(SUM("balanceCents"), 0) FROM "AgencyLedgerAccount")::bigint AS "ledgerAccountBalanceCents",
      (SELECT COUNT(*) FROM "AgencyLedgerEntry")::bigint AS "ledgerEntryCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceBatch")::bigint AS "remittanceBatchCount",
      (SELECT COUNT(*) FROM "AgencyRemittanceAllocation")::bigint AS "remittanceAllocationCount",
      (SELECT COUNT(*) FROM "AgencyLedgerAdjustment")::bigint AS "ledgerAdjustmentCount",
      (SELECT COUNT(*) FROM "AgencyAccountingPeriod")::bigint AS "accountingPeriodCount",
      (SELECT COUNT(*) FROM "AgencyAccountingPeriodEvent")::bigint AS "accountingPeriodEventCount"
  `;
  assert.ok(row, "The production-derived seed evidence query returned no row.");
  const normalized = normalize(row);
  assert.ok(Number(normalized.centerCount) > 0, "The production-derived seed contains no sanitized school markers.");
  assert.equal(
    normalized.sourceShapeMarkerCount,
    normalized.centerCount,
    "Every sanitized seed school must carry the exact captured production source-shape marker.",
  );
  for (const [field, expected] of Object.entries(EXPECTED_PRODUCTION_DERIVED_SEED)) {
    assert.equal(normalized[field], expected, `Production-derived seed mismatch for ${field}.`);
  }
  return {
    ...normalized,
    sourceShapeSha256: EXPECTED_SOURCE_SHAPE_SHA256,
    everySanitizedCenterCarriesSourceShapeMarker: true,
    exactExpectedCountsAndChecksumsMatched: true,
  };
}

async function flushBaselineCompatibilityProjection(tx, { claim = false, remittance = false } = {}) {
  if (remittance) {
    await tx.$executeRawUnsafe(`
      SET CONSTRAINTS
        "SubsidyRemittance_activation_control_guard",
        "SubsidyRemittance_claim_financial_state_guard"
      IMMEDIATE
    `);
    await tx.$executeRawUnsafe(`
      SET CONSTRAINTS
        "SubsidyRemittance_activation_control_guard",
        "SubsidyRemittance_claim_financial_state_guard"
      DEFERRED
    `);
  }
  if (claim) {
    await tx.$executeRawUnsafe('SET CONSTRAINTS "SubsidyClaim_financial_state_guard" IMMEDIATE');
    await tx.$executeRawUnsafe('SET CONSTRAINTS "SubsidyClaim_financial_state_guard" DEFERRED');
  }
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
}

async function seedDurableReplayFixture(prisma, ids) {
  return prisma.$transaction(async (tx) => {
    // This must remain the first operation in the mutating transaction. The
    // exact database marker is re-read before any fixture write is attempted.
    const identity = await readDatabaseIdentity(tx);
    assert.equal(identity.databaseMarker, AGENCY_REHEARSAL_DATABASE_MARKER);

    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5min'");

    const [collision] = await tx.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM "Center" WHERE id = ${ids.center}
        UNION ALL SELECT 1 FROM "AgencyProgram" WHERE id = ${ids.program}
        UNION ALL SELECT 1 FROM "SubsidyAuthorization" WHERE id = ${ids.authorization}
        UNION ALL SELECT 1 FROM "SubsidyClaim" WHERE id = ${ids.claim}
        UNION ALL SELECT 1 FROM "SubsidyClaim" WHERE id = ${ids.legacyNullApprovedClaim}
        UNION ALL SELECT 1 FROM "SubsidyRemittance" WHERE id = ${ids.remittance}
        UNION ALL SELECT 1 FROM "AgencyAccountingPeriod" WHERE id = ${ids.period}
      ) AS collision
    `;
    assert.equal(collision?.collision, false, "A run-unique fixture identifier already exists; no retry is allowed.");

    const capturedSeed = await readExpectedProductionDerivedSeedEvidence(tx);
    const immediatelyBeforeWriteIdentity = await readDatabaseIdentity(tx);
    assert.equal(
      immediatelyBeforeWriteIdentity.databaseMarker,
      AGENCY_REHEARSAL_DATABASE_MARKER,
      "The disposable database marker changed immediately before the first fixture write.",
    );

    await tx.center.create({
      data: {
        id: ids.center,
        organizationId: REHEARSAL_ORGANIZATION_ID,
        name: `Literal replay school ${ids.runId}`,
        status: "active",
        licensedCapacity: 1,
        timezone: "America/New_York",
        agencyReconciliationEnabled: false,
      },
    });
    await tx.family.create({
      data: {
        id: ids.family,
        centerId: ids.center,
        name: `Literal replay family ${ids.runId}`,
        customFields: { disposableLiteralReplay: true, runId: ids.runId },
      },
    });
    await tx.child.create({
      data: {
        id: ids.child,
        familyId: ids.family,
        fullName: `Literal replay child ${ids.runId}`,
        dateOfBirth: utcDay(-1_500),
        ageGroup: "preschool",
        enrollmentStatus: "enrolled",
        customFields: { disposableLiteralReplay: true, runId: ids.runId },
      },
    });
    await tx.agencyProgram.create({
      data: {
        id: ids.program,
        centerId: ids.center,
        name: `Literal Replay Agency ${ids.runId}`,
        programName: "Durable idempotency fixture",
        stateCode: "IN",
        providerNumber: `LITERAL-${ids.runId}`,
        submissionMethod: "agency_portal",
        portalUrl: "https://example.invalid/literal-replay",
        paymentInstructions: "Disposable literal replay only",
        receivableGlCode: "1200-LITERAL-AR",
        cashGlCode: "1000-LITERAL-CASH",
        adjustmentGlCode: "6900-LITERAL-ADJ",
        costCenterCode: "LITERAL-REPLAY",
        requirements: [],
        customFields: { disposableLiteralReplay: true, runId: ids.runId },
        status: "active",
      },
    });
    await tx.subsidyAuthorization.create({
      data: {
        id: ids.authorization,
        centerId: ids.center,
        agencyProgramId: ids.program,
        familyId: ids.family,
        childId: ids.child,
        authorizationNumber: `LITERAL-AUTH-${ids.runId}`,
        coverageStart: utcDay(-365),
        coverageEnd: utcDay(365),
        authorizedRateCents: 5_000,
        familyCopayCents: 0,
        unitType: "weekly",
        status: "active",
        requiredDocuments: [],
        customFields: { disposableLiteralReplay: true, runId: ids.runId },
      },
    });
    await tx.subsidyClaim.create({
      data: {
        id: ids.claim,
        centerId: ids.center,
        agencyProgramId: ids.program,
        authorizationId: ids.authorization,
        number: `LITERAL-CLAIM-${ids.runId}`,
        servicePeriodStart: utcDay(-60),
        servicePeriodEnd: utcDay(-54),
        dueDate: utcDay(-4),
        status: "draft",
        claimedCents: 5_000,
        approvedCents: null,
        paidCents: 0,
        submittedAt: utcDay(-8),
        approvedAt: null,
        createdById: ids.actor,
        customFields: { disposableLiteralReplay: true, runId: ids.runId },
        lines: {
          create: [{
            id: ids.claimLine,
            childId: ids.child,
            description: "Disposable literal replay subsidy care",
            serviceUnits: 1,
            unitType: "weekly",
            rateCents: 5_000,
            amountCents: 5_000,
          }],
        },
      },
    });
    await tx.subsidyClaim.update({
      where: { id: ids.claim },
      data: {
        status: "approved",
        approvedCents: 5_000,
        approvedAt: utcDay(-6),
        externalReference: `LITERAL-DECISION-${ids.runId}`,
      },
    });
    await flushBaselineCompatibilityProjection(tx, { claim: true });

    await tx.subsidyClaim.create({
      data: {
        id: ids.legacyNullApprovedClaim,
        centerId: ids.center,
        agencyProgramId: ids.program,
        authorizationId: ids.authorization,
        number: `LITERAL-LEGACY-NULL-APPROVED-${ids.runId}`,
        servicePeriodStart: new Date("2026-06-01T12:00:00.000Z"),
        servicePeriodEnd: new Date("2026-06-07T12:00:00.000Z"),
        dueDate: new Date("2026-06-15T12:00:00.000Z"),
        status: "draft",
        claimedCents: 2_000,
        approvedCents: null,
        paidCents: 0,
        submittedAt: new Date("2026-06-08T12:00:00.000Z"),
        approvedAt: null,
        createdById: ids.actor,
        createdAt: ids.legacyNullApprovedCreatedAt,
        customFields: {
          disposableLiteralReplay: true,
          runId: ids.runId,
          legacyApprovedAtIntentionallyNull: true,
        },
        lines: {
          create: [{
            id: ids.legacyNullApprovedClaimLine,
            childId: ids.child,
            description: "Disposable legacy null-approvedAt subsidy care",
            serviceUnits: 1,
            unitType: "weekly",
            rateCents: 2_000,
            amountCents: 2_000,
            createdAt: ids.legacyNullApprovedCreatedAt,
          }],
        },
      },
    });
    await tx.subsidyClaim.update({
      where: { id: ids.legacyNullApprovedClaim },
      data: {
        status: "approved",
        approvedCents: 2_000,
        approvedAt: null,
        externalReference: `LITERAL-LEGACY-DECISION-${ids.runId}`,
      },
    });
    await flushBaselineCompatibilityProjection(tx, { claim: true });
    const legacyNullApprovedEntries = await tx.$queryRaw`
      SELECT entry.id, entry."agencyLedgerAccountId", entry."claimId", entry."remittanceId",
        entry."remittanceBatchId", entry."adjustmentId", entry.type, entry.description,
        entry."amountCents", entry."balanceAfterCents", entry."effectiveAt",
        entry."externalReference", entry."glCodeSnapshot", entry."costCenterCodeSnapshot",
        entry."sourceSystem", entry."externalId", entry.metadata, entry."createdAt"
      FROM "AgencyLedgerEntry" entry
      WHERE entry."claimId" = ${ids.legacyNullApprovedClaim}
        AND entry.type = 'claim_approved'
      ORDER BY entry."effectiveAt", entry."createdAt", entry.id
    `;
    assert.equal(legacyNullApprovedEntries.length, 1, "A legacy null-approvedAt claim must project exactly one approval entry.");
    assert.deepEqual(normalize(legacyNullApprovedEntries), [{
      id: ids.legacyNullApprovedLedgerEntry,
      agencyLedgerAccountId: ids.account,
      claimId: ids.legacyNullApprovedClaim,
      remittanceId: null,
      remittanceBatchId: null,
      adjustmentId: null,
      type: "claim_approved",
      description: `Literal Replay Agency ${ids.runId} approved LITERAL-LEGACY-NULL-APPROVED-${ids.runId}`,
      amountCents: 2_000,
      balanceAfterCents: 2_000,
      effectiveAt: ids.legacyNullApprovedCreatedAt.toISOString(),
      externalReference: `LITERAL-LEGACY-DECISION-${ids.runId}`,
      glCodeSnapshot: "1200-LITERAL-AR",
      costCenterCodeSnapshot: "LITERAL-REPLAY",
      sourceSystem: "subsidy_agency",
      externalId: `claim-approved:${ids.legacyNullApprovedClaim}`,
      metadata: {
        claimNumber: `LITERAL-LEGACY-NULL-APPROVED-${ids.runId}`,
        baselineCompatibilityProjection: true,
      },
      createdAt: ids.legacyNullApprovedCreatedAt.toISOString(),
    }]);

    await tx.subsidyRemittance.create({
      data: {
        id: ids.remittance,
        claimId: ids.claim,
        amountCents: 1_000,
        paidAt: utcDay(-2),
        paymentMethod: "ach",
        externalReference: ids.remittanceReference,
        notes: "Disposable pre-activation direct remittance for literal replay",
        enteredById: ids.actor,
      },
    });
    await tx.subsidyClaim.update({
      where: { id: ids.claim },
      data: { status: "partially_paid", paidCents: 1_000 },
    });
    await flushBaselineCompatibilityProjection(tx, { claim: true, remittance: true });

    const [preActivation] = await tx.$queryRaw`
      SELECT center."agencyReconciliationEnabled",
        (SELECT COUNT(*) FROM "AgencyRemittanceAllocation" allocation WHERE allocation."remittanceId" = ${ids.remittance})::bigint AS "allocationCount",
        (SELECT COUNT(*) FROM "AgencyLedgerEntry" entry WHERE entry."remittanceId" = ${ids.remittance} AND entry.type = 'remittance_received')::bigint AS "receiptCount"
      FROM "Center" center
      WHERE center.id = ${ids.center}
    `;
    assert.equal(preActivation?.agencyReconciliationEnabled, false);
    assert.equal(preActivation?.allocationCount, 0n);
    assert.equal(preActivation?.receiptCount, 1n);

    await tx.center.update({
      where: { id: ids.center },
      data: {
        agencyReconciliationEnabled: true,
        agencyReconciliationActivatedAt: new Date(),
        agencyReconciliationActivatedById: ids.actor,
        agencyReconciliationActivationReason: "Durable disposable literal replay adoption proof",
      },
    });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");

    const firstClosedAt = new Date(Date.now() - 3_000);
    const reopenedAt = new Date(Date.now() - 2_000);
    const reclosedAt = new Date(Date.now() - 1_000);
    await tx.agencyAccountingPeriod.create({
      data: {
        id: ids.period,
        centerId: ids.center,
        name: `Literal replay period ${ids.runId}`,
        startDate: new Date("2026-05-01T12:00:00.000Z"),
        endDate: utcDay(-1),
        status: "closed",
        closedAt: firstClosedAt,
        closedById: ids.actor,
        closeReason: "Initial durable literal replay close",
      },
    });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
    await tx.agencyAccountingPeriod.update({
      where: { id: ids.period },
      data: {
        status: "open",
        reopenedAt,
        reopenedById: ids.actor,
        reopenReason: "Durable literal replay reopen",
      },
    });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
    await tx.agencyAccountingPeriod.update({
      where: { id: ids.period },
      data: {
        status: "closed",
        closedAt: reclosedAt,
        closedById: ids.actor,
        closeReason: "Durable literal replay re-close",
      },
    });
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");

    const events = await tx.agencyAccountingPeriodEvent.findMany({
      where: { periodId: ids.period },
      orderBy: { sequence: "asc" },
      select: { sequence: true, action: true, actorId: true, reason: true },
    });
    assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3]);
    assert.deepEqual(events.map((event) => event.action), ["closed", "reopened", "closed"]);
    assert.deepEqual(events.map((event) => event.actorId), [ids.actor, ids.actor, ids.actor]);
    assert.deepEqual(events.map((event) => event.reason), [
      "Initial durable literal replay close",
      "Durable literal replay reopen",
      "Durable literal replay re-close",
    ]);

    return normalize({
      databaseMarker: immediatelyBeforeWriteIdentity.databaseMarker,
      markerVerifiedImmediatelyBeforeFirstWrite: true,
      reconciliationWasInactiveBeforeAdoption: true,
      capturedSeed,
      periodEvents: events,
    });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 300_000 });
}

async function readPredecessorLedgerProof(tx, { cutoverBatchExpected = false, periodCreated = false } = {}) {
  const sourceSnapshot = await readPredecessorSourceSnapshot(tx);
  const [account, ledgerEntries, batchRows, allocationRows, periodRows, periodEvents] = await Promise.all([
    tx.$queryRaw`
      SELECT id, "centerId", "agencyProgramId", "balanceCents", "createdAt", "updatedAt"
      FROM "AgencyLedgerAccount"
      WHERE id = ${PREDECESSOR_FIXTURE.account}
    `,
    tx.$queryRaw`
      SELECT id, "agencyLedgerAccountId", "claimId", "remittanceId", "remittanceBatchId",
        "adjustmentId", type, description, "amountCents", "balanceAfterCents", "effectiveAt",
        "externalReference", "glCodeSnapshot", "costCenterCodeSnapshot", "sourceSystem",
        "externalId", metadata, "createdAt"
      FROM "AgencyLedgerEntry"
      WHERE "agencyLedgerAccountId" = ${PREDECESSOR_FIXTURE.account}
      ORDER BY "effectiveAt", "createdAt", id
    `,
    tx.$queryRaw`
      SELECT batch.*
      FROM "AgencyRemittanceBatch" batch
      JOIN "AgencyRemittanceAllocation" allocation ON allocation."batchId" = batch.id
      WHERE allocation."remittanceId" = ${PREDECESSOR_FIXTURE.remittance}
      ORDER BY batch.id
    `,
    tx.$queryRaw`
      SELECT allocation.*
      FROM "AgencyRemittanceAllocation" allocation
      WHERE allocation."remittanceId" = ${PREDECESSOR_FIXTURE.remittance}
      ORDER BY allocation.id
    `,
    tx.$queryRaw`
      SELECT * FROM "AgencyAccountingPeriod"
      WHERE "centerId" = ${PREDECESSOR_FIXTURE.center}
      ORDER BY "startDate", id
    `,
    tx.$queryRaw`
      SELECT event.*
      FROM "AgencyAccountingPeriodEvent" event
      WHERE event."centerId" = ${PREDECESSOR_FIXTURE.center}
      ORDER BY event.sequence, event."occurredAt", event.id
    `,
  ]);
  assert.equal(account.length, 1, "The predecessor program must have exactly one dedicated ledger account.");
  assert.equal(account[0].balanceCents, 2_000, "The predecessor account must retain its exact net receivable.");
  assert.equal(ledgerEntries.length, 3, "The predecessor source must backfill exactly one claim, receipt, and reversal entry.");
  assert.deepEqual(ledgerEntries.map((entry) => entry.type), ["claim_approved", "remittance_received", "remittance_reversal"]);
  const [claimEntry, receiptEntry, reversalEntry] = ledgerEntries;
  assert.equal(claimEntry.id, PREDECESSOR_FIXTURE.claimEntry);
  assert.equal(claimEntry.amountCents, 2_000);
  assert.equal(claimEntry.balanceAfterCents, 2_000);
  assert.equal(claimEntry.effectiveAt.getTime(), PREDECESSOR_FIXTURE.claimCreatedAt.getTime());
  assert.equal(claimEntry.createdAt.getTime(), PREDECESSOR_FIXTURE.claimCreatedAt.getTime());
  assert.equal(claimEntry.externalId, `claim-approved:${PREDECESSOR_FIXTURE.claim}`);
  assert.deepEqual(claimEntry.metadata, { claimNumber: "LITERAL-PREDECESSOR-CLAIM-V1", backfilled: true });
  assert.equal(receiptEntry.id, PREDECESSOR_FIXTURE.receiptEntry);
  assert.equal(receiptEntry.amountCents, -1_000);
  assert.equal(receiptEntry.balanceAfterCents, 1_000);
  assert.equal(receiptEntry.effectiveAt.getTime(), PREDECESSOR_FIXTURE.paidAt.getTime());
  assert.equal(receiptEntry.createdAt.getTime(), PREDECESSOR_FIXTURE.remittanceCreatedAt.getTime());
  assert.equal(receiptEntry.externalId, `remittance:${PREDECESSOR_FIXTURE.remittance}`);
  assert.deepEqual(receiptEntry.metadata, {
    claimNumber: "LITERAL-PREDECESSOR-CLAIM-V1",
    paymentMethod: "ach",
    backfilled: true,
  });
  assert.equal(reversalEntry.id, PREDECESSOR_FIXTURE.reversalEntry);
  assert.equal(reversalEntry.amountCents, 1_000);
  assert.equal(reversalEntry.balanceAfterCents, 2_000);
  assert.equal(reversalEntry.effectiveAt.getTime(), PREDECESSOR_FIXTURE.paidAt.getTime());
  assert.equal(reversalEntry.createdAt.getTime(), PREDECESSOR_FIXTURE.reversedAt.getTime());
  assert.equal(reversalEntry.externalId, `remittance-reversal:${PREDECESSOR_FIXTURE.remittance}`);
  assert.deepEqual(reversalEntry.metadata, {
    claimNumber: "LITERAL-PREDECESSOR-CLAIM-V1",
    reason: "Same UTC-day predecessor reversal proof",
    backfilled: true,
    sourceReversedAt: PREDECESSOR_FIXTURE.reversedAt.toISOString(),
    postingRule: "later of source reversal and receipt effective time",
  });
  assert.ok(receiptEntry.createdAt < reversalEntry.createdAt, "The immutable source ordering must place receipt before reversal.");
  assert.ok(PREDECESSOR_FIXTURE.reversedAt < PREDECESSOR_FIXTURE.paidAt, "This proof requires the predecessor source's reversal clock time to precede noon paidAt.");
  assert.equal(reversalEntry.effectiveAt.getTime(), receiptEntry.effectiveAt.getTime(), "The dedicated reversal must clamp to the receipt effective time.");
  assert.ok(reversalEntry.effectiveAt >= receiptEntry.effectiveAt, "A dedicated reversal must never become effective before its receipt.");
  assert.deepEqual(
    ledgerEntries.map((entry) => [entry.glCodeSnapshot, entry.costCenterCodeSnapshot]),
    [[null, null], [null, null], [null, null]],
    "Cutover snapshots for an unmapped predecessor must remain explicit null history after later mapping configuration.",
  );

  if (cutoverBatchExpected) {
    assert.equal(batchRows.length, 1, "Initial reconciliation migration must retain the predecessor remittance in one exact legacy batch.");
    assert.equal(allocationRows.length, 1, "Initial reconciliation migration must retain the predecessor remittance in one exact legacy allocation.");
    const batch = batchRows[0];
    const allocation = allocationRows[0];
    assert.equal(batch.centerId, PREDECESSOR_FIXTURE.center);
    assert.equal(batch.agencyProgramId, PREDECESSOR_FIXTURE.program);
    assert.equal(batch.paidAt.getTime(), PREDECESSOR_FIXTURE.paidAt.getTime());
    assert.equal(batch.reversedAt.getTime(), PREDECESSOR_FIXTURE.reversedAt.getTime());
    assert.equal(batch.status, "reversed");
    assert.equal(batch.totalCents, 1_000);
    assert.equal(batch.allocatedCents, 1_000);
    assert.equal(batch.unappliedCents, 0);
    assert.match(batch.idempotencyKey, /^legacy:[0-9a-f]{32}$/);
    assert.equal(batch.reviewedAt, null);
    assert.equal(allocation.batchId, batch.id);
    assert.equal(allocation.claimId, PREDECESSOR_FIXTURE.claim);
    assert.equal(allocation.remittanceId, PREDECESSOR_FIXTURE.remittance);
    assert.equal(allocation.status, "reversed");
    assert.equal(allocation.amountCents, 1_000);
    assert.equal(allocation.reviewedAt, null);
    assert.equal(allocation.idempotencyKey, `legacy-allocation:${PREDECESSOR_FIXTURE.remittance}`);
    assert.equal(receiptEntry.remittanceBatchId, batch.id);
    assert.equal(reversalEntry.remittanceBatchId, batch.id);
  } else {
    assert.deepEqual(batchRows, [], "No predecessor batch may exist before the reconciliation migration runs.");
    assert.deepEqual(allocationRows, [], "No predecessor allocation may exist before the reconciliation migration runs.");
    assert.equal(receiptEntry.remittanceBatchId, null);
    assert.equal(reversalEntry.remittanceBatchId, null);
  }

  if (periodCreated) {
    assert.equal(periodRows.length, 1, "The predecessor proof must retain one close/reopen/re-close period.");
    assert.equal(periodRows[0].status, "closed");
    assert.deepEqual(periodEvents.map((event) => event.sequence), [1, 2, 3]);
    assert.deepEqual(periodEvents.map((event) => event.action), ["closed", "reopened", "closed"]);
    assert.deepEqual(periodEvents.map((event) => event.actorId), [PREDECESSOR_FIXTURE.actor, PREDECESSOR_FIXTURE.actor, PREDECESSOR_FIXTURE.actor]);
  } else {
    assert.deepEqual(periodRows, []);
    assert.deepEqual(periodEvents, []);
  }

  return normalize({ sourceSnapshot, account, ledgerEntries, batchRows, allocationRows, periodRows, periodEvents });
}

async function activatePredecessorAndCreatePeriodHistory(tx) {
  await tx.$executeRaw`
    UPDATE "AgencyProgram"
    SET "receivableGlCode" = '1200-PREDECESSOR-AR',
      "cashGlCode" = '1000-PREDECESSOR-CASH',
      "adjustmentGlCode" = '6900-PREDECESSOR-ADJ',
      "costCenterCode" = 'PREDECESSOR'
    WHERE id = ${PREDECESSOR_FIXTURE.program}
  `;
  await tx.$executeRaw`
    UPDATE "Center"
    SET "agencyReconciliationEnabled" = TRUE,
      "agencyReconciliationActivatedAt" = ${new Date("2026-06-03T09:00:00.000Z")},
      "agencyReconciliationActivatedById" = ${PREDECESSOR_FIXTURE.actor},
      "agencyReconciliationActivationReason" = 'Literal predecessor activation and adoption proof'
    WHERE id = ${PREDECESSOR_FIXTURE.center}
  `;
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");

  const periodId = "literal-predecessor-period-v1";
  const firstClosedAt = new Date("2026-06-04T09:00:00.000Z");
  const reopenedAt = new Date("2026-06-04T10:00:00.000Z");
  const reclosedAt = new Date("2026-06-04T11:00:00.000Z");
  await tx.agencyAccountingPeriod.create({ data: {
    id: periodId,
    centerId: PREDECESSOR_FIXTURE.center,
    name: "Literal predecessor chronology period v1",
    startDate: new Date("2026-05-01T12:00:00.000Z"),
    endDate: new Date("2026-06-02T12:00:00.000Z"),
    status: "closed",
    closedAt: firstClosedAt,
    closedById: PREDECESSOR_FIXTURE.actor,
    closeReason: "Initial literal predecessor close",
    createdAt: new Date("2026-06-04T08:00:00.000Z"),
    updatedAt: firstClosedAt,
  } });
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
  await tx.agencyAccountingPeriod.update({
    where: { id: periodId },
    data: {
      status: "open",
      reopenedAt,
      reopenedById: PREDECESSOR_FIXTURE.actor,
      reopenReason: "Literal predecessor chronological reopen",
      updatedAt: reopenedAt,
    },
  });
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
  await tx.agencyAccountingPeriod.update({
    where: { id: periodId },
    data: {
      status: "closed",
      closedAt: reclosedAt,
      closedById: PREDECESSOR_FIXTURE.actor,
      closeReason: "Literal predecessor chronological re-close",
      updatedAt: reclosedAt,
    },
  });
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
}

async function createControlledMorningReceiptFixture(tx) {
  const fixture = CONTROLLED_MORNING_FIXTURE;
  const [collision] = await tx.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM "Center" WHERE id = ${fixture.center}
      UNION ALL SELECT 1 FROM "AgencyProgram" WHERE id = ${fixture.program}
      UNION ALL SELECT 1 FROM "SubsidyClaim" WHERE id = ${fixture.claim}
      UNION ALL SELECT 1 FROM "AgencyRemittanceBatch" WHERE id = ${fixture.batch}
      UNION ALL SELECT 1 FROM "AgencyRemittanceAllocation" WHERE id = ${fixture.allocation}
      UNION ALL SELECT 1 FROM "SubsidyRemittance" WHERE id = ${fixture.remittance}
      UNION ALL SELECT 1 FROM "AgencyLedgerEntry" WHERE id = ${fixture.receiptEntry}
    ) AS collision
  `;
  assert.equal(collision?.collision, false, "The deterministic controlled-morning fixture already exists; no retry is allowed.");

  await tx.center.create({ data: {
    id: fixture.center,
    organizationId: REHEARSAL_ORGANIZATION_ID,
    name: "Literal controlled morning school v1",
    status: "active",
    licensedCapacity: 1,
    timezone: "America/New_York",
    customFields: {
      agencyLedgerRehearsalSourceShapeSha256: EXPECTED_SOURCE_SHAPE_SHA256,
      disposableLiteralReplay: true,
      fixture: "controlled-morning-v1",
    },
    agencyReconciliationEnabled: false,
    createdAt: fixture.centerCreatedAt,
    updatedAt: fixture.centerCreatedAt,
  } });
  await tx.family.create({ data: {
    id: fixture.family,
    centerId: fixture.center,
    name: "Literal controlled morning family v1",
    customFields: { disposableLiteralReplay: true, fixture: "controlled-morning-v1" },
    createdAt: fixture.centerCreatedAt,
    updatedAt: fixture.centerCreatedAt,
  } });
  await tx.child.create({ data: {
    id: fixture.child,
    familyId: fixture.family,
    fullName: "Literal controlled morning child v1",
    dateOfBirth: new Date("2021-06-03T12:00:00.000Z"),
    ageGroup: "preschool",
    enrollmentStatus: "enrolled",
    customFields: { disposableLiteralReplay: true, fixture: "controlled-morning-v1" },
    createdAt: fixture.centerCreatedAt,
    updatedAt: fixture.centerCreatedAt,
  } });
  await tx.agencyProgram.create({ data: {
    id: fixture.program,
    centerId: fixture.center,
    name: "Literal Controlled Morning Agency v1",
    programName: "Controlled morning receipt proof",
    stateCode: "IN",
    providerNumber: "LITERAL-CONTROLLED-MORNING-V1",
    submissionMethod: "agency_portal",
    portalUrl: "https://example.invalid/literal-controlled-morning",
    paymentInstructions: "Disposable controlled morning proof only",
    receivableGlCode: "1200-CONTROLLED-AR",
    cashGlCode: "1000-CONTROLLED-CASH",
    adjustmentGlCode: "6900-CONTROLLED-ADJ",
    costCenterCode: "CONTROLLED-MORNING",
    requirements: [],
    status: "active",
    customFields: { disposableLiteralReplay: true, fixture: "controlled-morning-v1" },
    createdAt: fixture.centerCreatedAt,
    updatedAt: fixture.centerCreatedAt,
  } });
  await tx.subsidyAuthorization.create({ data: {
    id: fixture.authorization,
    centerId: fixture.center,
    agencyProgramId: fixture.program,
    familyId: fixture.family,
    childId: fixture.child,
    authorizationNumber: "LITERAL-CONTROLLED-MORNING-AUTH-V1",
    coverageStart: new Date("2026-01-01T12:00:00.000Z"),
    coverageEnd: new Date("2026-12-31T12:00:00.000Z"),
    authorizedRateCents: 1_500,
    familyCopayCents: 0,
    unitType: "weekly",
    status: "active",
    requiredDocuments: [],
    customFields: { disposableLiteralReplay: true, fixture: "controlled-morning-v1" },
    createdAt: fixture.centerCreatedAt,
    updatedAt: fixture.centerCreatedAt,
  } });
  await tx.subsidyClaim.create({ data: {
    id: fixture.claim,
    centerId: fixture.center,
    agencyProgramId: fixture.program,
    authorizationId: fixture.authorization,
    number: "LITERAL-CONTROLLED-MORNING-CLAIM-V1",
    servicePeriodStart: new Date("2026-05-25T12:00:00.000Z"),
    servicePeriodEnd: new Date("2026-05-31T12:00:00.000Z"),
    dueDate: new Date("2026-06-15T12:00:00.000Z"),
    status: "draft",
    claimedCents: 1_500,
    approvedCents: null,
    paidCents: 0,
    submittedAt: new Date("2026-06-01T12:00:00.000Z"),
    approvedAt: null,
    externalReference: null,
    createdById: fixture.preparer,
    customFields: { disposableLiteralReplay: true, fixture: "controlled-morning-v1" },
    createdAt: fixture.claimCreatedAt,
    updatedAt: fixture.claimCreatedAt,
    lines: { create: [{
      id: fixture.claimLine,
      childId: fixture.child,
      description: "Literal controlled morning approved care",
      serviceUnits: 1,
      unitType: "weekly",
      rateCents: 1_500,
      amountCents: 1_500,
      createdAt: fixture.claimCreatedAt,
    }] },
  } });
  await tx.subsidyClaim.update({
    where: { id: fixture.claim },
    data: {
      status: "approved",
      approvedCents: 1_500,
      approvedAt: fixture.approvedAt,
      externalReference: "LITERAL-CONTROLLED-MORNING-DECISION-V1",
      updatedAt: fixture.approvedAt,
    },
  });
  await flushBaselineCompatibilityProjection(tx, { claim: true });
  await tx.center.update({
    where: { id: fixture.center },
    data: {
      agencyReconciliationEnabled: true,
      agencyReconciliationActivatedAt: fixture.activatedAt,
      agencyReconciliationActivatedById: fixture.preparer,
      agencyReconciliationActivationReason: "Literal controlled morning receipt proof",
      updatedAt: fixture.activatedAt,
    },
  });
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");

  await tx.agencyRemittanceBatch.create({ data: {
    id: fixture.batch,
    centerId: fixture.center,
    agencyProgramId: fixture.program,
    externalReference: fixture.externalReference,
    referenceKey: `ach:${fixture.externalReference}`,
    paidAt: fixture.paidAt,
    paymentMethod: "ach",
    cashGlCodeSnapshot: "1000-CONTROLLED-CASH",
    costCenterCodeSnapshot: "CONTROLLED-MORNING",
    totalCents: 500,
    allocatedCents: 0,
    unappliedCents: 0,
    status: "pending_review",
    notes: "Literal same-day morning controlled receipt proof",
    evidenceName: "Literal controlled morning evidence",
    evidenceReference: "literal-controlled-morning:evidence:v1",
    idempotencyKey: "literal-controlled-morning-batch-key-v1",
    reconciliationFingerprint: sha256("literal-controlled-morning-batch-v1"),
    enteredById: fixture.preparer,
    followUpOwnerId: fixture.preparer,
    followUpDueAt: new Date("2026-06-04T12:00:00.000Z"),
    createdAt: fixture.batchCreatedAt,
    updatedAt: fixture.batchCreatedAt,
  } });
  await tx.agencyRemittanceAllocation.create({ data: {
    id: fixture.allocation,
    batchId: fixture.batch,
    claimId: fixture.claim,
    amountCents: 500,
    status: "pending_review",
    notes: "Literal morning allocation",
    fingerprint: sha256("literal-controlled-morning-allocation-v1"),
    idempotencyKey: "literal-controlled-morning-allocation-key-v1",
    requestedById: fixture.preparer,
    createdAt: fixture.allocationCreatedAt,
    updatedAt: fixture.allocationCreatedAt,
  } });
  await tx.subsidyRemittance.create({ data: {
    id: fixture.remittance,
    claimId: fixture.claim,
    amountCents: 500,
    paidAt: fixture.paidAt,
    paymentMethod: "ach",
    externalReference: fixture.externalReference,
    notes: "Literal controlled morning remittance",
    enteredById: fixture.reviewer,
    createdAt: fixture.reviewedAt,
  } });
  await tx.agencyLedgerEntry.create({ data: {
    id: fixture.receiptEntry,
    agencyLedgerAccountId: fixture.account,
    claimId: fixture.claim,
    remittanceId: fixture.remittance,
    remittanceBatchId: fixture.batch,
    type: "remittance_received",
    description: "Literal Controlled Morning Agency v1 remittance for LITERAL-CONTROLLED-MORNING-CLAIM-V1",
    amountCents: -500,
    balanceAfterCents: 0,
    effectiveAt: fixture.reviewedAt,
    externalReference: fixture.externalReference,
    glCodeSnapshot: "1000-CONTROLLED-CASH",
    costCenterCodeSnapshot: "CONTROLLED-MORNING",
    sourceSystem: "subsidy_agency",
    externalId: `remittance:${fixture.remittance}`,
    metadata: {
      claimNumber: "LITERAL-CONTROLLED-MORNING-CLAIM-V1",
      paymentMethod: "ach",
      remittanceBatchId: fixture.batch,
      originalPaidAt: fixture.paidAt.toISOString(),
      postingRule: "independent_review",
    },
    createdAt: fixture.reviewedAt,
  } });
  await tx.agencyRemittanceAllocation.update({
    where: { id: fixture.allocation },
    data: {
      status: "posted",
      remittanceId: fixture.remittance,
      reviewedById: fixture.reviewer,
      reviewedAt: fixture.reviewedAt,
      reviewNotes: "Independent literal morning review",
      updatedAt: fixture.reviewedAt,
    },
  });
  await tx.subsidyClaim.update({
    where: { id: fixture.claim },
    data: { status: "partially_paid", paidCents: 500, updatedAt: fixture.reviewedAt },
  });
  await tx.agencyRemittanceBatch.update({
    where: { id: fixture.batch },
    data: {
      allocatedCents: 500,
      unappliedCents: 0,
      status: "reconciled",
      reviewedById: fixture.reviewer,
      reviewedAt: fixture.reviewedAt,
      reviewNotes: "Independent literal morning review",
      followUpOwnerId: null,
      followUpDueAt: null,
      updatedAt: fixture.reviewedAt,
    },
  });
  await tx.$executeRaw`SELECT public.recalculate_compatibility_agency_ledger_account(${fixture.account})`;
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
  await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
}

async function readControlledMorningProof(tx) {
  const fixture = CONTROLLED_MORNING_FIXTURE;
  const [center, program, claim, remittance, batch, allocation, account, entries, familyFinancialCounts] = await Promise.all([
    tx.$queryRaw`SELECT * FROM "Center" WHERE id = ${fixture.center}`,
    tx.$queryRaw`SELECT * FROM "AgencyProgram" WHERE id = ${fixture.program}`,
    tx.$queryRaw`SELECT * FROM "SubsidyClaim" WHERE id = ${fixture.claim}`,
    tx.$queryRaw`SELECT * FROM "SubsidyRemittance" WHERE id = ${fixture.remittance}`,
    tx.$queryRaw`SELECT * FROM "AgencyRemittanceBatch" WHERE id = ${fixture.batch}`,
    tx.$queryRaw`SELECT * FROM "AgencyRemittanceAllocation" WHERE id = ${fixture.allocation}`,
    tx.$queryRaw`SELECT * FROM "AgencyLedgerAccount" WHERE id = ${fixture.account}`,
    tx.$queryRaw`SELECT * FROM "AgencyLedgerEntry" WHERE "agencyLedgerAccountId" = ${fixture.account} ORDER BY "effectiveAt", "createdAt", id`,
    tx.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM "BillingAccount" WHERE "familyId" = ${fixture.family})::bigint AS "billingAccountCount",
        (SELECT COUNT(*) FROM "LedgerEntry" entry JOIN "BillingAccount" account_row ON account_row.id = entry."billingAccountId" WHERE account_row."familyId" = ${fixture.family})::bigint AS "familyLedgerEntryCount",
        (SELECT COUNT(*) FROM "Invoice" invoice_row JOIN "BillingAccount" account_row ON account_row.id = invoice_row."billingAccountId" WHERE account_row."familyId" = ${fixture.family})::bigint AS "invoiceCount",
        (SELECT COUNT(*) FROM "Payment" payment_row JOIN "BillingAccount" account_row ON account_row.id = payment_row."billingAccountId" WHERE account_row."familyId" = ${fixture.family})::bigint AS "paymentCount"
    `,
  ]);
  for (const [label, rows] of Object.entries({ center, program, claim, remittance, batch, allocation, account })) {
    assert.equal(rows.length, 1, `Expected one controlled-morning ${label} row.`);
  }
  assert.equal(center[0].agencyReconciliationEnabled, true);
  assert.equal(program[0].status, "active");
  assert.equal(claim[0].status, "partially_paid");
  assert.equal(claim[0].paidCents, 500);
  assert.equal(remittance[0].paidAt.getTime(), fixture.paidAt.getTime());
  assert.equal(remittance[0].createdAt.getTime(), fixture.reviewedAt.getTime());
  assert.equal(batch[0].reviewedAt.getTime(), fixture.reviewedAt.getTime());
  assert.equal(allocation[0].reviewedAt.getTime(), fixture.reviewedAt.getTime());
  assert.equal(allocation[0].remittanceId, fixture.remittance);
  assert.equal(allocation[0].status, "posted");
  assert.equal(allocation[0].requestedById, fixture.preparer);
  assert.equal(allocation[0].reviewedById, fixture.reviewer);
  assert.notEqual(allocation[0].requestedById, allocation[0].reviewedById);
  assert.ok(fixture.reviewedAt < fixture.paidAt, "This proof requires the controlled receipt time to be before noon paidAt.");
  assert.equal(fixture.reviewedAt.toISOString().slice(0, 10), fixture.paidAt.toISOString().slice(0, 10));
  assert.equal(entries.length, 2, "The controlled fixture must have exactly one claim entry and one receipt entry.");
  assert.deepEqual(entries.map((entry) => entry.type), ["claim_approved", "remittance_received"]);
  assert.equal(entries[0].id, fixture.claimEntry);
  assert.equal(entries[0].amountCents, 1_500);
  assert.equal(entries[0].effectiveAt.getTime(), fixture.approvedAt.getTime());
  assert.equal(entries[0].balanceAfterCents, 1_500);
  assert.equal(entries[1].id, fixture.receiptEntry);
  assert.equal(entries[1].amountCents, -500);
  assert.equal(entries[1].effectiveAt.getTime(), fixture.reviewedAt.getTime());
  assert.equal(entries[1].createdAt.getTime(), fixture.reviewedAt.getTime());
  assert.equal(entries[1].balanceAfterCents, 1_000);
  assert.equal(entries[1].remittanceBatchId, fixture.batch);
  assert.deepEqual(entries[1].metadata, {
    claimNumber: "LITERAL-CONTROLLED-MORNING-CLAIM-V1",
    paymentMethod: "ach",
    remittanceBatchId: fixture.batch,
    originalPaidAt: fixture.paidAt.toISOString(),
    postingRule: "independent_review",
  });
  assert.equal(account[0].balanceCents, 1_000);
  assert.deepEqual(normalize(familyFinancialCounts), [{
    billingAccountCount: "0",
    familyLedgerEntryCount: "0",
    invoiceCount: "0",
    paymentCount: "0",
  }], "The controlled receipt proof must not create or change family financial records.");
  return normalize({ center, program, claim, remittance, batch, allocation, account, entries, familyFinancialCounts });
}

async function assertNoPostInstallFixtureCollision(tx) {
  const fixture = CONTROLLED_MORNING_FIXTURE;
  const [collision] = await tx.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM "AgencyAccountingPeriod" WHERE id = 'literal-predecessor-period-v1'
      UNION ALL SELECT 1 FROM "Center" WHERE id = ${fixture.center}
      UNION ALL SELECT 1 FROM "Family" WHERE id = ${fixture.family}
      UNION ALL SELECT 1 FROM "Child" WHERE id = ${fixture.child}
      UNION ALL SELECT 1 FROM "AgencyProgram" WHERE id = ${fixture.program}
      UNION ALL SELECT 1 FROM "SubsidyAuthorization" WHERE id = ${fixture.authorization}
      UNION ALL SELECT 1 FROM "SubsidyClaim" WHERE id = ${fixture.claim}
      UNION ALL SELECT 1 FROM "AgencyRemittanceBatch" WHERE id = ${fixture.batch}
      UNION ALL SELECT 1 FROM "AgencyRemittanceAllocation" WHERE id = ${fixture.allocation}
      UNION ALL SELECT 1 FROM "SubsidyRemittance" WHERE id = ${fixture.remittance}
      UNION ALL SELECT 1 FROM "AgencyLedgerEntry" WHERE id = ${fixture.receiptEntry}
    ) AS collision
  `;
  assert.equal(collision?.collision, false, "A deterministic post-install fixture already exists; no retry is allowed.");
}

async function createPostInstallProofFixtures(prisma) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5min'");
    const identity = await readDatabaseIdentity(tx);
    const migrationWriter = await readMigrationWriterEvidence(tx, identity);
    const capturedPredecessor = await readExpectedProductionDerivedPredecessorEvidence(tx);
    const predecessorBeforeActivation = await readPredecessorLedgerProof(tx, { cutoverBatchExpected: true, periodCreated: false });
    await assertNoPostInstallFixtureCollision(tx);
    const immediatelyBeforeWriteIdentity = await readDatabaseIdentity(tx);
    assert.equal(
      immediatelyBeforeWriteIdentity.databaseMarker,
      AGENCY_REHEARSAL_DATABASE_MARKER,
      "The disposable database marker changed immediately before the first post-install write.",
    );

    await activatePredecessorAndCreatePeriodHistory(tx);
    await createControlledMorningReceiptFixture(tx);
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
    const predecessorAfterActivation = await readPredecessorLedgerProof(tx, { cutoverBatchExpected: true, periodCreated: true });
    const controlledMorning = await readControlledMorningProof(tx);
    assert.deepEqual(
      predecessorAfterActivation.sourceSnapshot,
      predecessorBeforeActivation.sourceSnapshot,
      "Activation/adoption changed immutable predecessor source rows.",
    );
    return normalize({
      migrationWriter,
      capturedPredecessor,
      markerVerifiedImmediatelyBeforeFirstWrite: true,
      predecessorBeforeActivation,
      predecessorAfterActivation,
      controlledMorning,
    });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 300_000 });
}

async function readTemporaryFenceEvidence(tx) {
  const [temporaryFenceTriggers, blockFunction] = await Promise.all([
    tx.$queryRaw`
      SELECT trigger_row.tgname AS name
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgname = ANY(${TEMPORARY_FENCE_TRIGGERS})
        AND NOT trigger_row.tgisinternal
      ORDER BY trigger_row.tgname
    `,
    tx.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM pg_proc function_row
      WHERE function_row.pronamespace = 'public'::regnamespace
        AND function_row.proname = 'block_agency_writes_during_reconciliation_migration'
    `,
  ]);
  assert.deepEqual(temporaryFenceTriggers, [], "A temporary migration fence trigger survived the migration transaction.");
  assert.deepEqual(normalize(blockFunction), [{ count: "0" }], "The temporary migration fence function survived the migration transaction.");
  return normalize({ temporaryFenceTriggers, blockFunction });
}

async function readPostInstallLiteralSnapshot(prisma) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const identity = await readDatabaseIdentity(tx);
    const migrationWriter = await readMigrationWriterEvidence(tx, identity);
    const [globalLogicalDigests, routineTriggerCatalog, sharedLockFunctions, predecessor, controlledMorning, temporaryFenceEvidence] = await Promise.all([
      readGlobalLogicalDigests(tx),
      readReplayRoutineTriggerCatalog(tx),
      readSharedLockFunctionSnapshot(tx),
      readPredecessorLedgerProof(tx, { cutoverBatchExpected: true, periodCreated: true }),
      readControlledMorningProof(tx),
      readTemporaryFenceEvidence(tx),
    ]);
    return normalize({
      identity: {
        databaseName: identity.databaseName,
        databaseUser: identity.databaseUser,
        databaseMarker: identity.databaseMarker,
      },
      migrationWriter,
      globalLogicalDigests,
      routineTriggerCatalog,
      sharedLockFunctions,
      predecessor,
      controlledMorning,
      temporaryFenceEvidence,
    });
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 120_000 });
}

async function readAfterFirstMigrationReplayProof(prisma, beforeReplay) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const identity = await readDatabaseIdentity(tx);
    const migrationWriter = await readMigrationWriterEvidence(tx, identity);
    const globalLogicalDigests = await readGlobalLogicalDigests(tx);
    const sharedLockFunctions = await readSharedLockFunctionSnapshot(tx);
    assert.deepEqual(migrationWriter, beforeReplay.migrationWriter, "Migration 1 replay changed the selected Supabase history rows.");
    assert.deepEqual(globalLogicalDigests, beforeReplay.globalLogicalDigests, "Migration 1 replay changed global logical business rows.");
    assert.deepEqual(sharedLockFunctions, beforeReplay.sharedLockFunctions, "Migration 1 replay downgraded a shared lock/account-scope function.");
    return normalize({
      identity: {
        databaseName: identity.databaseName,
        databaseUser: identity.databaseUser,
        databaseMarker: identity.databaseMarker,
      },
      migrationWriter,
      globalLogicalDigests,
      sharedLockFunctions,
    });
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 120_000 });
}

async function readLogicalSnapshot(prisma, ids) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const identity = await readDatabaseIdentity(tx);
    const migrationWriter = await readMigrationWriterEvidence(tx, identity);
    const globalLogicalDigests = await readGlobalLogicalDigests(tx);
    const routineTriggerCatalog = await readReplayRoutineTriggerCatalog(tx);
    const sharedLockFunctions = await readSharedLockFunctionSnapshot(tx);
    const [
      center,
      program,
      authorization,
      claim,
      claimLine,
      legacyNullApprovedClaim,
      legacyNullApprovedClaimLine,
      remittance,
      account,
      batch,
      allocation,
      period,
    ] = await Promise.all([
      tx.$queryRaw`
        SELECT id, "organizationId", name, status, "licensedCapacity", timezone,
          "agencyReconciliationEnabled", "agencyReconciliationActivatedAt",
          "agencyReconciliationActivatedById", "agencyReconciliationActivationReason",
          "createdAt", "updatedAt"
        FROM "Center" WHERE id = ${ids.center}
      `,
      tx.$queryRaw`
        SELECT id, "centerId", name, "programName", "stateCode", "providerNumber",
          "submissionMethod", "portalUrl", "paymentInstructions", "receivableGlCode",
          "cashGlCode", "adjustmentGlCode", "costCenterCode", requirements, status,
          "customFields", "createdAt", "updatedAt"
        FROM "AgencyProgram" WHERE id = ${ids.program}
      `,
      tx.$queryRaw`
        SELECT id, "centerId", "agencyProgramId", "familyId", "childId", "authorizationNumber",
          "coverageStart", "coverageEnd", "authorizedRateCents", "familyCopayCents",
          "unitType", "authorizedUnits", status, "requiredDocuments", "customFields",
          "createdAt", "updatedAt"
        FROM "SubsidyAuthorization" WHERE id = ${ids.authorization}
      `,
      tx.$queryRaw`
        SELECT id, "centerId", "agencyProgramId", "authorizationId", number,
          "servicePeriodStart", "servicePeriodEnd", "dueDate", status, "claimedCents",
          "approvedCents", "paidCents", "submittedAt", "approvedAt", "externalReference",
          "customFields", "createdById", "createdAt", "updatedAt"
        FROM "SubsidyClaim" WHERE id = ${ids.claim}
      `,
      tx.$queryRaw`
        SELECT id, "claimId", "childId", description, "serviceUnits", "unitType",
          "rateCents", "amountCents", "attendanceDays", "attendanceData", "createdAt"
        FROM "SubsidyClaimLine" WHERE id = ${ids.claimLine}
      `,
      tx.$queryRaw`
        SELECT id, "centerId", "agencyProgramId", "authorizationId", number,
          "servicePeriodStart", "servicePeriodEnd", "dueDate", status, "claimedCents",
          "approvedCents", "paidCents", "submittedAt", "approvedAt", "externalReference",
          "customFields", "createdById", "createdAt", "updatedAt"
        FROM "SubsidyClaim" WHERE id = ${ids.legacyNullApprovedClaim}
      `,
      tx.$queryRaw`
        SELECT id, "claimId", "childId", description, "serviceUnits", "unitType",
          "rateCents", "amountCents", "attendanceDays", "attendanceData", "createdAt"
        FROM "SubsidyClaimLine" WHERE id = ${ids.legacyNullApprovedClaimLine}
      `,
      tx.$queryRaw`
        SELECT id, "claimId", "amountCents", "paidAt", "paymentMethod", "externalReference",
          notes, "enteredById", "reversedAt", "reversedById", "reversalReason", "createdAt"
        FROM "SubsidyRemittance" WHERE id = ${ids.remittance}
      `,
      tx.$queryRaw`
        SELECT id, "centerId", "agencyProgramId", "balanceCents", "createdAt", "updatedAt"
        FROM "AgencyLedgerAccount" WHERE id = ${ids.account}
      `,
      tx.$queryRaw`
        SELECT id, "centerId", "agencyProgramId", "externalReference", "referenceKey", "paidAt",
          "paymentMethod", "cashGlCodeSnapshot", "costCenterCodeSnapshot", "totalCents",
          "allocatedCents", "unappliedCents", status, notes, "idempotencyKey",
          "reconciliationFingerprint", "enteredById", "reviewedById", "reviewedAt",
          "reviewNotes", "reversedAt", "reversedById", "reversalReason", "createdAt", "updatedAt"
        FROM "AgencyRemittanceBatch" WHERE id = ${ids.batch}
      `,
      tx.$queryRaw`
        SELECT id, "batchId", "claimId", "remittanceId", "amountCents", status, notes,
          fingerprint, "idempotencyKey", "requestedById", "reviewedById", "reviewedAt",
          "reviewNotes", "createdAt", "updatedAt"
        FROM "AgencyRemittanceAllocation" WHERE id = ${ids.allocation}
      `,
      tx.$queryRaw`
        SELECT id, "centerId", name, "startDate", "endDate", status, "closedAt", "closedById",
          "closeReason", "reopenedAt", "reopenedById", "reopenReason", "createdAt", "updatedAt"
        FROM "AgencyAccountingPeriod" WHERE id = ${ids.period}
      `,
    ]);
    for (const [label, rows] of Object.entries({
      center,
      program,
      authorization,
      claim,
      claimLine,
      legacyNullApprovedClaim,
      legacyNullApprovedClaimLine,
      remittance,
      account,
      batch,
      allocation,
      period,
    })) {
      assert.equal(rows.length, 1, `Expected exactly one ${label} fixture row.`);
    }

    const [ledgerEntries, periodEvents, counts, temporaryFenceTriggers, blockFunction] = await Promise.all([
      tx.$queryRaw`
        SELECT id, "agencyLedgerAccountId", "claimId", "remittanceId", "remittanceBatchId",
          "adjustmentId", type, description, "amountCents", "balanceAfterCents", "effectiveAt",
          "externalReference", "glCodeSnapshot", "costCenterCodeSnapshot", "sourceSystem",
          "externalId", metadata, "createdAt"
        FROM "AgencyLedgerEntry"
        WHERE "agencyLedgerAccountId" = ${ids.account}
        ORDER BY "effectiveAt", "createdAt", id
      `,
      tx.$queryRaw`
        SELECT id, "centerId", "periodId", sequence, action, "occurredAt", "actorId", reason,
          evidence, "createdAt"
        FROM "AgencyAccountingPeriodEvent"
        WHERE "periodId" = ${ids.period}
        ORDER BY sequence, "occurredAt", id
      `,
      tx.$queryRaw`
        SELECT
          (SELECT COUNT(*) FROM "AgencyLedgerAccount" WHERE "centerId" = ${ids.center})::bigint AS "ledgerAccountCount",
          (SELECT COUNT(*) FROM "AgencyLedgerEntry" WHERE "agencyLedgerAccountId" = ${ids.account})::bigint AS "ledgerEntryCount",
          (SELECT COUNT(*) FROM "AgencyRemittanceBatch" WHERE "centerId" = ${ids.center})::bigint AS "batchCount",
          (SELECT COUNT(*) FROM "AgencyRemittanceAllocation" WHERE "batchId" = ${ids.batch})::bigint AS "allocationCount",
          (SELECT COUNT(*) FROM "SubsidyRemittance" WHERE id = ${ids.remittance})::bigint AS "remittanceCount",
          (SELECT COUNT(*) FROM "AgencyAccountingPeriod" WHERE id = ${ids.period})::bigint AS "periodCount",
          (SELECT COUNT(*) FROM "AgencyAccountingPeriodEvent" WHERE "periodId" = ${ids.period})::bigint AS "periodEventCount"
      `,
      tx.$queryRaw`
        SELECT trigger_row.tgname AS name
        FROM pg_trigger trigger_row
        WHERE trigger_row.tgname = ANY(${TEMPORARY_FENCE_TRIGGERS})
          AND NOT trigger_row.tgisinternal
        ORDER BY trigger_row.tgname
      `,
      tx.$queryRaw`
        SELECT COUNT(*)::bigint AS count
        FROM pg_proc function_row
        WHERE function_row.pronamespace = 'public'::regnamespace
          AND function_row.proname = 'block_agency_writes_during_reconciliation_migration'
      `,
    ]);
    assert.deepEqual(normalize(counts), [{
      ledgerAccountCount: "1",
      ledgerEntryCount: "3",
      batchCount: "1",
      allocationCount: "1",
      remittanceCount: "1",
      periodCount: "1",
      periodEventCount: "3",
    }]);
    assert.deepEqual(ledgerEntries.map((entry) => entry.type), ["claim_approved", "claim_approved", "remittance_received"]);
    assert.equal(legacyNullApprovedClaim[0].approvedAt, null);
    assert.equal(legacyNullApprovedClaim[0].status, "approved");
    assert.equal(legacyNullApprovedClaim[0].createdAt.getTime(), ids.legacyNullApprovedCreatedAt.getTime());
    assert.equal(account[0].balanceCents, 6_000);
    const legacyNullApprovedEntries = ledgerEntries.filter((entry) => entry.claimId === ids.legacyNullApprovedClaim);
    assert.equal(legacyNullApprovedEntries.length, 1);
    assert.equal(legacyNullApprovedEntries[0].id, ids.legacyNullApprovedLedgerEntry);
    assert.equal(legacyNullApprovedEntries[0].externalId, `claim-approved:${ids.legacyNullApprovedClaim}`);
    assert.equal(legacyNullApprovedEntries[0].sourceSystem, "subsidy_agency");
    assert.equal(legacyNullApprovedEntries[0].effectiveAt.getTime(), ids.legacyNullApprovedCreatedAt.getTime());
    assert.equal(legacyNullApprovedEntries[0].createdAt.getTime(), ids.legacyNullApprovedCreatedAt.getTime());
    assert.deepEqual(legacyNullApprovedEntries[0].metadata, {
      claimNumber: `LITERAL-LEGACY-NULL-APPROVED-${ids.runId}`,
      baselineCompatibilityProjection: true,
    });
    assert.deepEqual(periodEvents.map((event) => event.sequence), [1, 2, 3]);
    assert.deepEqual(periodEvents.map((event) => event.action), ["closed", "reopened", "closed"]);
    assert.deepEqual(periodEvents.map((event) => event.actorId), [ids.actor, ids.actor, ids.actor]);
    assert.deepEqual(periodEvents.map((event) => event.reason), [
      "Initial durable literal replay close",
      "Durable literal replay reopen",
      "Durable literal replay re-close",
    ]);
    assert.deepEqual(temporaryFenceTriggers, [], "A temporary migration fence trigger survived the migration transaction.");
    assert.deepEqual(normalize(blockFunction), [{ count: "0" }], "The temporary migration fence function survived the migration transaction.");

    return normalize({
      identity: {
        databaseName: identity.databaseName,
        databaseUser: identity.databaseUser,
        databaseMarker: identity.databaseMarker,
      },
      migrationWriter,
      globalLogicalDigests,
      routineTriggerCatalog,
      sharedLockFunctions,
      rows: {
        center,
        program,
        authorization,
        claim,
        claimLine,
        legacyNullApprovedClaim,
        legacyNullApprovedClaimLine,
        remittance,
        account,
        batch,
        allocation,
        ledgerEntries,
        period,
        periodEvents,
      },
      counts,
      temporaryFenceTriggers,
      blockFunction,
    });
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 60_000 });
}

function redactDatabaseSecrets(value, secrets) {
  let result = String(value ?? "");
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("[REDACTED_DATABASE_URL]");
  }
  return result.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]");
}

async function executeLiteralMigration(databaseUrl, applicationName, migration) {
  const childEnvironment = { ...process.env };
  childEnvironment.DATABASE_URL = databaseUrl;
  childEnvironment.PRISMA_HIDE_UPDATE_MESSAGE = "1";
  for (const key of [
    "REHEARSAL_DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "DIRECT_URL",
  ]) {
    delete childEnvironment[key];
  }

  const args = [
    prismaCliPath,
    "db",
    "execute",
    "--file",
    resolve(repositoryRoot, migration.prismaRelativePath),
    "--schema",
    schemaPath,
  ];
  assert.equal(args.some((argument) => argument.includes("postgres://") || argument.includes("postgresql://")), false);
  const startedAt = performance.now();
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd: repositoryRoot,
      env: childEnvironment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("close", (exitCode, signal) => resolvePromise({ exitCode, signal, stdout, stderr }));
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (result.exitCode !== 0) {
    const output = redactDatabaseSecrets(
      `${result.stdout}\n${result.stderr}`,
      [databaseUrl, process.env.REHEARSAL_DATABASE_URL],
    ).trim();
    throw new Error(`Literal migration replay failed (exit ${String(result.exitCode)}, signal ${String(result.signal)}): ${output}`);
  }
  return {
    executable: "process.execPath + local node_modules/prisma/build/index.js",
    command: `prisma db execute --file <exact-${migration.version}-prisma-migration> --schema prisma/schema.prisma`,
    migrationKey: migration.key,
    migrationVersion: migration.version,
    shell: false,
    databaseUrlInArgv: false,
    databaseUrlScopedToChildEnvironment: true,
    applicationName,
    exitCode: result.exitCode,
    elapsedMs,
  };
}

async function runCleanPostMigrationReplay(parsedRehearsalUrl, initialMigrationFiles) {
  const runId = randomUUID().replaceAll("-", "").slice(0, 16);
  const prefix = `literal-replay-${runId}`;
  const applicationName = `bee_literal_replay_${runId}`;
  const ids = {
    runId,
    actor: `${prefix}-actor`,
    center: `${prefix}-center`,
    family: `${prefix}-family`,
    child: `${prefix}-child`,
    program: `${prefix}-program`,
    authorization: `${prefix}-authorization`,
    claim: `${prefix}-claim`,
    claimLine: `${prefix}-claim-line`,
    legacyNullApprovedClaim: `${prefix}-legacy-null-approved-claim`,
    legacyNullApprovedClaimLine: `${prefix}-legacy-null-approved-claim-line`,
    legacyNullApprovedCreatedAt: new Date("2026-06-01T12:00:00.000Z"),
    remittance: `${prefix}-remittance`,
    period: `${prefix}-period`,
    remittanceReference: `LITERAL-ACH-${runId}`,
  };
  ids.account = `agency-ledger-account:${ids.program}`;
  ids.legacyNullApprovedLedgerEntry = `agency-ledger-claim:${ids.legacyNullApprovedClaim}`;
  ids.batch = `agency-remittance-batch:${md5(`${ids.center}:${ids.program}:ach:${ids.remittanceReference.toUpperCase()}:active`)}`;
  ids.allocation = `agency-remittance-allocation:${ids.remittance}`;

  const parentDatabaseUrl = urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_fixture`);
  let prisma = client(parentDatabaseUrl);
  let preflightIdentity;
  let preflightMigrationWriter;
  let preflightCapturedSeed;
  try {
    ({ identity: preflightIdentity, migrationWriter: preflightMigrationWriter, capturedSeed: preflightCapturedSeed } = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const identity = await readDatabaseIdentity(tx);
      const migrationWriter = await readMigrationWriterEvidence(tx, identity);
      const capturedSeed = await readExpectedProductionDerivedSeedEvidence(tx);
      return { identity, migrationWriter, capturedSeed };
    }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 }));
    const seededFixture = await seedDurableReplayFixture(prisma, ids);
    assert.deepEqual(seededFixture.capturedSeed, preflightCapturedSeed);
    const beforeReplay = await readLogicalSnapshot(prisma, ids);
    assert.deepEqual(beforeReplay.migrationWriter, preflightMigrationWriter);
    await prisma.$disconnect();
    prisma = null;

    const immediatelyBeforeReplayMigrationFiles = await verifyMigrationFiles();
    assert.deepEqual(immediatelyBeforeReplayMigrationFiles, initialMigrationFiles);
    const firstChildDatabaseUrl = urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_190000`);
    const firstReplay = await executeLiteralMigration(firstChildDatabaseUrl, `${applicationName}_190000`, EXPECTED_MIGRATIONS[0]);
    const afterReplayMigrationFiles = await verifyMigrationFiles();
    assert.deepEqual(afterReplayMigrationFiles, initialMigrationFiles);

    prisma = client(urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_phase1_verify`));
    const afterFirstReplay = await readAfterFirstMigrationReplayProof(prisma, beforeReplay);
    await prisma.$disconnect();
    prisma = null;

    const immediatelyBeforeSecondReplayMigrationFiles = await verifyMigrationFiles();
    assert.deepEqual(immediatelyBeforeSecondReplayMigrationFiles, initialMigrationFiles);
    const secondChildDatabaseUrl = urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_210000`);
    const secondReplay = await executeLiteralMigration(secondChildDatabaseUrl, `${applicationName}_210000`, EXPECTED_MIGRATIONS[1]);
    const afterSecondReplayMigrationFiles = await verifyMigrationFiles();
    assert.deepEqual(afterSecondReplayMigrationFiles, initialMigrationFiles);

    prisma = client(urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_final_verify`));
    const afterReplay = await readLogicalSnapshot(prisma, ids);
    assert.deepEqual(
      afterReplay,
      beforeReplay,
      "The exact reconciliation migration replay changed logical fixture rows or migration-writer history.",
    );

    console.log(JSON.stringify({
      mode: "durable_disposable_literal_migration_replay",
      targetProjectRef: AGENCY_REHEARSAL_PROJECT_REF,
      runId,
      target: {
        databaseName: preflightIdentity.databaseName,
        databaseUser: preflightIdentity.databaseUser,
        databaseMarker: preflightIdentity.databaseMarker,
        urlGuard: "exact disposable Supabase project; production explicitly rejected; TLS required",
      },
      migrationFiles: initialMigrationFiles,
      migrationWriter: preflightMigrationWriter,
      fixture: {
        committedSerializableTransaction: true,
        markerVerifiedImmediatelyBeforeFirstWrite: true,
        reconciliationInactiveBeforeActivation: true,
        activationAdoptedDirectRemittance: true,
        legacyNullApprovedAtFallback: {
          claimId: ids.legacyNullApprovedClaim,
          sourceApprovedAt: beforeReplay.rows.legacyNullApprovedClaim[0].approvedAt,
          sourceCreatedAt: beforeReplay.rows.legacyNullApprovedClaim[0].createdAt,
          ledgerEntryId: ids.legacyNullApprovedLedgerEntry,
          ledgerEffectiveAt: beforeReplay.rows.ledgerEntries.find((entry) => entry.id === ids.legacyNullApprovedLedgerEntry)?.effectiveAt,
          ledgerCreatedAt: beforeReplay.rows.ledgerEntries.find((entry) => entry.id === ids.legacyNullApprovedLedgerEntry)?.createdAt,
          exactProvenanceVerified: true,
        },
        counts: beforeReplay.counts[0],
        periodEventSequence: beforeReplay.rows.periodEvents.map((event) => ({
          sequence: event.sequence,
          action: event.action,
          actorId: event.actorId,
          reason: event.reason,
        })),
      },
      capturedProductionDerivedSeed: preflightCapturedSeed,
      replay: {
        inOrder: true,
        first: firstReplay,
        afterFirstMigration: {
          globalLogicalRowsUnchanged: true,
          supabaseMigrationHistoryUnchanged: true,
          sharedLockFunctionDefinitionsUnchanged: true,
          sharedLockFunctionsSha256: afterFirstReplay.sharedLockFunctions.sha256,
        },
        second: secondReplay,
      },
      verification: {
        orderedLogicalSnapshotUnchanged: true,
        supabaseMigrationHistoryUnchanged: true,
        routineAndTriggerCatalogUnchanged: true,
        sharedLockFunctionDefinitionsUnchangedAfterEachReplay: true,
        exactPeriodEventHistoryUnchanged: true,
        legacyNullApprovedAtFallbackUnchanged: true,
        temporaryFenceTriggerCount: afterReplay.temporaryFenceTriggers.length,
        temporaryBlockFunctionCount: afterReplay.blockFunction[0].count,
      },
      cleanupPolicy: "No automatic cleanup or retry. Discard this exact disposable branch after evidence capture.",
    }, null, 2));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

async function runPredecessorPostInstallReplay(parsedRehearsalUrl, initialMigrationFiles) {
  const runId = randomUUID().replaceAll("-", "").slice(0, 16);
  const applicationName = `bee_predecessor_replay_${runId}`;
  let prisma = client(urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_fixture`));
  let preflight;
  try {
    preflight = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const identity = await readDatabaseIdentity(tx);
      const migrationWriter = await readMigrationWriterEvidence(tx, identity);
      const capturedPredecessor = await readExpectedProductionDerivedPredecessorEvidence(tx);
      const predecessorBackfill = await readPredecessorLedgerProof(tx, { cutoverBatchExpected: true, periodCreated: false });
      await assertNoPostInstallFixtureCollision(tx);
      return normalize({ identity, migrationWriter, capturedPredecessor, predecessorBackfill });
    }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 120_000 });

    const seeded = await createPostInstallProofFixtures(prisma);
    assert.deepEqual(seeded.migrationWriter, preflight.migrationWriter);
    assert.deepEqual(seeded.capturedPredecessor, preflight.capturedPredecessor);
    assert.deepEqual(
      seeded.predecessorBeforeActivation.sourceSnapshot,
      preflight.predecessorBackfill.sourceSnapshot,
      "The predecessor source changed between read-only preflight and the committed proof transaction.",
    );
    const beforeReplay = await readPostInstallLiteralSnapshot(prisma);
    assert.deepEqual(beforeReplay.migrationWriter, preflight.migrationWriter);
    await prisma.$disconnect();
    prisma = null;

    const beforeFirstReplayFiles = await verifyMigrationFiles();
    assert.deepEqual(beforeFirstReplayFiles, initialMigrationFiles);
    const firstReplay = await executeLiteralMigration(
      urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_190000`),
      `${applicationName}_190000`,
      EXPECTED_MIGRATIONS[0],
    );
    const afterFirstReplayFiles = await verifyMigrationFiles();
    assert.deepEqual(afterFirstReplayFiles, initialMigrationFiles);

    prisma = client(urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_phase1_verify`));
    const afterFirstReplay = await readAfterFirstMigrationReplayProof(prisma, beforeReplay);
    await prisma.$disconnect();
    prisma = null;

    const beforeSecondReplayFiles = await verifyMigrationFiles();
    assert.deepEqual(beforeSecondReplayFiles, initialMigrationFiles);
    const secondReplay = await executeLiteralMigration(
      urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_210000`),
      `${applicationName}_210000`,
      EXPECTED_MIGRATIONS[1],
    );
    const afterSecondReplayFiles = await verifyMigrationFiles();
    assert.deepEqual(afterSecondReplayFiles, initialMigrationFiles);

    prisma = client(urlWithApplicationName(parsedRehearsalUrl, `${applicationName}_final_verify`));
    const afterReplay = await readPostInstallLiteralSnapshot(prisma);
    assert.deepEqual(
      afterReplay,
      beforeReplay,
      "The exact two-file replay changed global business rows, fixture chronology, migration history, or the normalized routine/trigger catalog.",
    );

    const predecessorEntries = beforeReplay.predecessor.ledgerEntries;
    const predecessorReceipt = predecessorEntries.find((entry) => entry.id === PREDECESSOR_FIXTURE.receiptEntry);
    const predecessorReversal = predecessorEntries.find((entry) => entry.id === PREDECESSOR_FIXTURE.reversalEntry);
    const controlledReceipt = beforeReplay.controlledMorning.entries.find((entry) => entry.id === CONTROLLED_MORNING_FIXTURE.receiptEntry);
    console.log(JSON.stringify({
      mode: "post_install_predecessor_and_two_file_literal_replay",
      targetProjectRef: AGENCY_REHEARSAL_PROJECT_REF,
      runId,
      target: {
        databaseName: preflight.identity.databaseName,
        databaseUser: preflight.identity.databaseUser,
        databaseMarker: preflight.identity.databaseMarker,
        urlGuard: "exact disposable Supabase project; production explicitly rejected; TLS required",
      },
      migrationFiles: initialMigrationFiles,
      migrationWriter: preflight.migrationWriter,
      capturedProductionDerivedPredecessor: preflight.capturedPredecessor,
      predecessorFixture: {
        committedSerializableActivationAdoptionAndPeriodTransaction: true,
        markerVerifiedImmediatelyBeforeFirstWrite: seeded.markerVerifiedImmediatelyBeforeFirstWrite,
        sourceSnapshotDigestSha256: sha256(JSON.stringify(beforeReplay.predecessor.sourceSnapshot)),
        sourceApprovedAt: beforeReplay.predecessor.sourceSnapshot.claim[0].approvedAt,
        sourceClaimCreatedAt: beforeReplay.predecessor.sourceSnapshot.claim[0].createdAt,
        claimEntryEffectiveAt: predecessorEntries.find((entry) => entry.id === PREDECESSOR_FIXTURE.claimEntry)?.effectiveAt,
        claimEntryCreatedAt: predecessorEntries.find((entry) => entry.id === PREDECESSOR_FIXTURE.claimEntry)?.createdAt,
        sourcePaidAt: beforeReplay.predecessor.sourceSnapshot.remittance[0].paidAt,
        sourceReversedAt: beforeReplay.predecessor.sourceSnapshot.remittance[0].reversedAt,
        receiptEffectiveAt: predecessorReceipt?.effectiveAt,
        reversalEffectiveAt: predecessorReversal?.effectiveAt,
        sourceRowsImmutable: true,
        reversalEffectiveAtClampedToReceipt: predecessorReversal?.effectiveAt === predecessorReceipt?.effectiveAt,
        exactBackfillProvenanceVerified: true,
        activationPreservedExactCutoverBatchAndAllocation: true,
        periodEventSequence: beforeReplay.predecessor.periodEvents.map((event) => ({ sequence: event.sequence, action: event.action })),
      },
      controlledMorningReceipt: {
        sourcePaidAt: beforeReplay.controlledMorning.remittance[0].paidAt,
        batchReviewedAt: beforeReplay.controlledMorning.batch[0].reviewedAt,
        allocationReviewedAt: beforeReplay.controlledMorning.allocation[0].reviewedAt,
        receiptEffectiveAt: controlledReceipt?.effectiveAt,
        sameUtcDayMorningReceiptBeforeNoonPaidAt: true,
        immutableIndependentReviewerEvidence: true,
        familyFinancialRowsCreated: false,
      },
      replay: {
        inOrder: true,
        first: firstReplay,
        afterFirstMigration: {
          globalLogicalRowsUnchanged: true,
          supabaseMigrationHistoryUnchanged: true,
          sharedLockFunctionDefinitionsUnchanged: true,
          sharedLockFunctionsSha256: afterFirstReplay.sharedLockFunctions.sha256,
        },
        second: secondReplay,
      },
      verification: {
        fullGlobalLogicalSnapshotUnchanged: true,
        exactSourceRowsUnchanged: true,
        exactLedgerBatchAllocationPeriodRowsUnchanged: true,
        supabaseMigrationHistoryUnchanged: true,
        routineAndTriggerCatalogUnchanged: true,
        sharedLockFunctionDefinitionsUnchangedAfterEachReplay: true,
        temporaryFenceTriggerCount: afterReplay.temporaryFenceEvidence.temporaryFenceTriggers.length,
        temporaryBlockFunctionCount: afterReplay.temporaryFenceEvidence.blockFunction[0].count,
        familyBalancesInvoicesPaymentsAndParentVisibleHistoryUnchanged: true,
      },
      cleanupPolicy: "No automatic cleanup or retry. Discard this exact disposable branch after evidence capture.",
    }, null, 2));
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const supportedModes = new Set(["--prepare-predecessor", "--clean-replay"]);
  assert.ok(args.length <= 1 && (args.length === 0 || supportedModes.has(args[0])), "Use no flag, --prepare-predecessor, or --clean-replay.");
  const rawRehearsalUrl = process.env.REHEARSAL_DATABASE_URL;
  const parsedRehearsalUrl = validatedRehearsalUrl(rawRehearsalUrl);
  const migrationFiles = await verifyMigrationFiles();
  if (args[0] === "--prepare-predecessor") {
    await preparePredecessor(
      urlWithApplicationName(parsedRehearsalUrl, "bee_prepare_predecessor_fixture"),
      migrationFiles,
    );
    return;
  }
  if (args[0] === "--clean-replay") {
    await runCleanPostMigrationReplay(parsedRehearsalUrl, migrationFiles);
    return;
  }
  await runPredecessorPostInstallReplay(parsedRehearsalUrl, migrationFiles);
}

main().catch((error) => {
  const message = redactDatabaseSecrets(
    error instanceof Error ? error.message : String(error),
    [process.env.REHEARSAL_DATABASE_URL],
  );
  console.error(`${message}\nNo cleanup or retry was attempted. Discard the exact disposable rehearsal branch before another run.`);
  process.exitCode = 1;
});
