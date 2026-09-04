import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  AGENCY_REHEARSAL_DATABASE_MARKER,
  AGENCY_REHEARSAL_PROJECT_REF,
  assertAuthorizedRehearsalDatabaseTarget,
} from "./agency-ledger-rehearsal-target";

const EXPECTED_PRODUCTION_DERIVED_BASELINE = Object.freeze({
  agencyProgramCount: BigInt(82),
  activeProgramCount: BigInt(5),
  setupRequiredProgramCount: BigInt(77),
  agencyProgramChecksum: "116c4ec14ae661d0225af532090169d6",
  subsidyClaimCount: BigInt(51),
  draftClaimCount: BigInt(51),
  subsidyClaimChecksum: "81b9fb864f91a530ac84e9ffba4320fb",
  subsidyRemittanceCount: BigInt(0),
  familyCount: BigInt(3),
  billingAccountCount: BigInt(3),
  billingAccountBalanceCents: BigInt(12_400),
  billingAccountChecksum: "7b0b4e8d7cd60bbbfcd2c0de865dbdb3",
  invoiceCount: BigInt(0),
  invoiceTotalCents: BigInt(0),
  paymentCount: BigInt(0),
  paymentTotalCents: BigInt(0),
  familyLedgerEntryCount: BigInt(4),
  familyLedgerEntryCents: BigInt(-122_470),
  familyLedgerChecksum: "a3b75d5417d644cd8a6f5115857d175b",
  legacyAgencyPaymentCount: BigInt(4),
  legacyAgencyPaymentCents: BigInt(-122_470),
  legacyAgencyPaymentChecksum: "b22b65d0feb18b5819c2860da9ffdbeb",
});

const EXPECTED_SUPABASE_MIGRATIONS = Object.freeze([
  {
    version: "20260904230802",
    name: "20260903190000_agency_receivable_ledger",
    statementsSha256: "ef3d32acb21cca1e11d08db5098c850bca79b1bea89382a2c60e27454d59c0c5",
    statementOctets: BigInt(31_631),
  },
  {
    version: "20260904230805",
    name: "20260903210000_agency_reconciliation_controls",
    statementsSha256: "5576f0ae9f743e45a713151dd7a87809d3596c33bc75b29b4e9ef4b9f3a99bd8",
    statementOctets: BigInt(253_662),
  },
]);

const EXPECTED_SOURCE_SHAPE_SHA256 = "a8304df5ba2c68761c5b90525784557be3dab250f96c0530da2c0c86705c2793";

const TEMPORARY_MIGRATION_FENCE_TRIGGER_NAMES = Object.freeze([
  "AgencyProgram_00_reconciliation_migration_fence",
  "SubsidyAuthorization_00_reconciliation_migration_fence",
  "SubsidyClaim_00_reconciliation_migration_fence",
  "SubsidyClaimLine_00_reconciliation_migration_fence",
  "SubsidyRemittance_00_reconciliation_migration_fence",
  "AgencyLedgerAccount_00_reconciliation_migration_fence",
  "AgencyLedgerEntry_00_reconciliation_migration_fence",
]);

// This is intentionally frozen from the disposable database after the exact two
// reviewed migration statements were installed. It covers normalized definitions
// and catalog/security attributes, not physical identifiers such as OIDs.
const EXPECTED_NORMALIZED_CATALOG_MANIFEST = Object.freeze({
  sha256: "b987ed1c7973d955bde31ca81fefc3750f5727db6a3f16c182e4fee9db21676a",
  objectCounts: Object.freeze({
    column: 269,
    constraint: 80,
    index: 74,
    relation: 16,
    routine: 58,
    trigger: 48,
  }),
});

type CandidatePrismaMigrationHistory = {
  migrationName: string;
  checksum: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
};

type TemporaryMigrationFenceObject = {
  objectKind: "routine" | "trigger";
  objectIdentity: string;
};

type CatalogManifestRow = {
  objectKind: "column" | "constraint" | "index" | "relation" | "routine" | "trigger";
  objectIdentity: string;
  definition: string;
  attributes: string;
};

type CatalogManifestEvidence = {
  sha256: string;
  objectCounts: Record<CatalogManifestRow["objectKind"], number>;
  objects: Array<{
    objectKind: CatalogManifestRow["objectKind"];
    objectIdentity: string;
    definitionSha256: string;
    attributesSha256: string;
  }>;
};

type RehearsalAuditResult = {
  source: Record<string, unknown>;
  tables: Array<{ tableName: string; present: boolean }>;
  nonIdleLocks: Array<unknown>;
  migrated: null | {
    counts: Record<string, unknown>;
    rls: Array<{ tableName: string; rlsEnabled: boolean; rlsForced: boolean; policyCount: bigint }>;
    privileges: Array<{ tableName: string; publicPrivileges: string[]; anonPrivileges: string[]; authenticatedPrivileges: string[] }>;
    routinePrivileges: Array<{ routineSignature: string; publicCanExecute: boolean; anonCanExecute: boolean; authenticatedCanExecute: boolean }>;
    indexes: Array<unknown>;
    constraints: Array<unknown>;
    triggers: Array<unknown>;
    catalogManifest: CatalogManifestEvidence;
  };
  supabaseMigrationHistoryPresent: boolean;
  prismaMigrationHistoryPresent: boolean;
  candidateSupabaseMigrationHistory: Array<{
    version: string;
    name: string;
    statementCount: number;
    statementsSha256: string;
    statementOctets: bigint;
  }>;
  candidatePrismaMigrationHistory: CandidatePrismaMigrationHistory[];
  temporaryMigrationFenceObjects: TemporaryMigrationFenceObject[];
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeCatalogText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function buildCatalogManifest(rows: CatalogManifestRow[]): CatalogManifestEvidence {
  const normalizedRows = rows
    .map((row) => ({
      objectKind: row.objectKind,
      objectIdentity: row.objectIdentity,
      definition: normalizeCatalogText(row.definition),
      attributes: normalizeCatalogText(row.attributes),
    }))
    .sort((left, right) => left.objectKind.localeCompare(right.objectKind)
      || left.objectIdentity.localeCompare(right.objectIdentity));
  const objectCounts: CatalogManifestEvidence["objectCounts"] = {
    column: 0,
    constraint: 0,
    index: 0,
    relation: 0,
    routine: 0,
    trigger: 0,
  };
  for (const row of normalizedRows) objectCounts[row.objectKind] += 1;
  return {
    sha256: sha256(JSON.stringify(normalizedRows)),
    objectCounts,
    objects: normalizedRows.map((row) => ({
      objectKind: row.objectKind,
      objectIdentity: row.objectIdentity,
      definitionSha256: sha256(row.definition),
      attributesSha256: sha256(row.attributes),
    })),
  };
}

function assertProductionDerivedBaseline(result: RehearsalAuditResult) {
  const failures: string[] = [];
  for (const [field, expected] of Object.entries(EXPECTED_PRODUCTION_DERIVED_BASELINE)) {
    if (result.source[field] !== expected) failures.push(`source.${field}`);
  }
  if (result.source.centerCount === BigInt(0)
    || result.source.sourceShapeMarkerCount !== result.source.centerCount
    || result.source.sourceShapeSha256 !== EXPECTED_SOURCE_SHAPE_SHA256) {
    failures.push("exact captured source-shape marker on every sanitized Center");
  }
  if (result.tables.length !== 7 || result.tables.some((row) => !row.present)) failures.push("all seven candidate tables");
  if (result.nonIdleLocks.length !== 0) failures.push("no non-idle competing locks");
  if (!result.migrated) {
    failures.push("migrated schema evidence");
  } else {
    const expectedMigratedCounts: Record<string, bigint> = {
      ledgerAccountCount: BigInt(82),
      ledgerEntryCount: BigInt(0),
      remittanceBatchCount: BigInt(0),
      remittanceAllocationCount: BigInt(0),
      ledgerAdjustmentCount: BigInt(0),
      accountingPeriodCount: BigInt(0),
      accountingPeriodEventCount: BigInt(0),
      ledgerBalanceCents: BigInt(0),
      ledgerEntryCents: BigInt(0),
    };
    for (const [field, expected] of Object.entries(expectedMigratedCounts)) {
      if (result.migrated.counts[field] !== expected) failures.push(`migrated.counts.${field}`);
    }
    if (result.migrated.rls.length !== 7 || result.migrated.rls.some((row) => !row.rlsEnabled || row.rlsForced || row.policyCount !== BigInt(0))) {
      failures.push("exact RLS enabled/not-forced state with no direct-client policies on all seven tables");
    }
    if (result.migrated.privileges.length !== 7 || result.migrated.privileges.some((row) =>
      row.publicPrivileges.length !== 0 || row.anonPrivileges.length !== 0 || row.authenticatedPrivileges.length !== 0)) {
      failures.push("no PUBLIC/anon/authenticated table privileges");
    }
    if (result.migrated.routinePrivileges.length === 0 || result.migrated.routinePrivileges.some((row) =>
      row.publicCanExecute || row.anonCanExecute || row.authenticatedCanExecute)) {
      failures.push("no PUBLIC/anon/authenticated execution of agency guard routines");
    }
    if (result.migrated.catalogManifest.sha256 !== EXPECTED_NORMALIZED_CATALOG_MANIFEST.sha256) {
      failures.push("exact normalized agency catalog manifest digest");
    }
    for (const [objectKind, expectedCount] of Object.entries(EXPECTED_NORMALIZED_CATALOG_MANIFEST.objectCounts)) {
      if (result.migrated.catalogManifest.objectCounts[objectKind as CatalogManifestRow["objectKind"]] !== expectedCount) {
        failures.push(`exact normalized agency catalog ${objectKind} count`);
      }
    }
  }
  if (!result.supabaseMigrationHistoryPresent) failures.push("Supabase migration history registry");
  if (result.candidateSupabaseMigrationHistory.length !== EXPECTED_SUPABASE_MIGRATIONS.length) {
    failures.push("exactly two candidate Supabase migration-history rows");
  }
  for (const expected of EXPECTED_SUPABASE_MIGRATIONS) {
    const recorded = result.candidateSupabaseMigrationHistory.find((row) => row.version === expected.version && row.name === expected.name);
    if (!recorded
      || recorded.statementCount !== 1
      || recorded.statementsSha256 !== expected.statementsSha256
      || recorded.statementOctets !== expected.statementOctets) {
      failures.push(`exact Supabase migration history ${expected.version}/${expected.name}`);
    }
  }
  if (result.candidatePrismaMigrationHistory.length !== 0) {
    failures.push("zero candidate Prisma migration-history rows");
  }
  if (result.temporaryMigrationFenceObjects.length !== 0) {
    failures.push(`all ${TEMPORARY_MIGRATION_FENCE_TRIGGER_NAMES.length} temporary migration fence triggers and the block routine removed`);
  }
  if (failures.length > 0) {
    throw new Error(`Production-derived post-migration baseline mismatch: ${failures.join(", ")}.`);
  }
}

function json(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
}

async function main() {
  loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
  const url = process.env.REHEARSAL_DATABASE_URL;
  if (!url) throw new Error("REHEARSAL_DATABASE_URL is required.");
  assertAuthorizedRehearsalDatabaseTarget(url);
  const prisma = new PrismaClient({ datasources: { db: { url } }, log: ["error"] });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const [identity] = await tx.$queryRaw<Array<{ databaseName: string; databaseUser: string; databaseMarker: string | null; postgresVersion: string; capturedAt: Date; supabaseMigrationHistoryPresent: boolean; prismaMigrationHistoryPresent: boolean }>>`
        SELECT current_database() AS "databaseName",
          current_user AS "databaseUser",
          shobj_description(database_row.oid, 'pg_database') AS "databaseMarker",
          current_setting('server_version') AS "postgresVersion",
          CURRENT_TIMESTAMP AS "capturedAt",
          (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL) AS "supabaseMigrationHistoryPresent",
          (to_regclass('public."_prisma_migrations"') IS NOT NULL) AS "prismaMigrationHistoryPresent"
        FROM pg_database database_row
        WHERE database_row.datname = current_database()
      `;
      if (!identity || identity.databaseName !== "postgres" || identity.databaseUser !== "postgres" || identity.databaseMarker !== AGENCY_REHEARSAL_DATABASE_MARKER) {
        throw new Error("The database-side disposable rehearsal marker does not match; refusing to audit the target.");
      }
      let candidateSupabaseMigrationHistory: RehearsalAuditResult["candidateSupabaseMigrationHistory"] = [];
      if (identity.supabaseMigrationHistoryPresent) {
        candidateSupabaseMigrationHistory = await tx.$queryRaw<RehearsalAuditResult["candidateSupabaseMigrationHistory"]>`
          SELECT version,
            name,
            COALESCE(array_length(statements, 1), 0)::integer AS "statementCount",
            encode(digest(convert_to(array_to_string(statements, E'\\n'), 'UTF8'), 'sha256'), 'hex') AS "statementsSha256",
            COALESCE((SELECT SUM(octet_length(statement)) FROM unnest(statements) AS statement), 0)::bigint AS "statementOctets"
          FROM supabase_migrations.schema_migrations
          WHERE version IN ('20260903190000', '20260903210000', '20260904230802', '20260904230805')
             OR name IN ('20260903190000_agency_receivable_ledger', '20260903210000_agency_reconciliation_controls')
          ORDER BY version, name
        `;
      }
      let candidatePrismaMigrationHistory: CandidatePrismaMigrationHistory[] = [];
      if (identity.prismaMigrationHistoryPresent) {
        candidatePrismaMigrationHistory = await tx.$queryRaw<CandidatePrismaMigrationHistory[]>`
          SELECT migration_name AS "migrationName",
            checksum,
            finished_at AS "finishedAt",
            rolled_back_at AS "rolledBackAt"
          FROM "_prisma_migrations"
          WHERE migration_name IN (
            '20260903190000_agency_receivable_ledger',
            '20260903210000_agency_reconciliation_controls'
          )
          ORDER BY migration_name, started_at, id
        `;
      }
      const temporaryMigrationFenceObjects = await tx.$queryRaw<TemporaryMigrationFenceObject[]>`
        SELECT 'trigger'::text AS "objectKind",
          format('%I.%I/%I', namespace_row.nspname, table_row.relname, trigger_row.tgname) AS "objectIdentity"
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE namespace_row.nspname = 'public'
          AND trigger_row.tgname IN (
            'AgencyProgram_00_reconciliation_migration_fence',
            'SubsidyAuthorization_00_reconciliation_migration_fence',
            'SubsidyClaim_00_reconciliation_migration_fence',
            'SubsidyClaimLine_00_reconciliation_migration_fence',
            'SubsidyRemittance_00_reconciliation_migration_fence',
            'AgencyLedgerAccount_00_reconciliation_migration_fence',
            'AgencyLedgerEntry_00_reconciliation_migration_fence'
          )
        UNION ALL
        SELECT 'routine'::text AS "objectKind",
          format('%I.%I(%s)', namespace_row.nspname, routine_row.proname, pg_get_function_identity_arguments(routine_row.oid)) AS "objectIdentity"
        FROM pg_proc routine_row
        JOIN pg_namespace namespace_row ON namespace_row.oid = routine_row.pronamespace
        WHERE namespace_row.nspname = 'public'
          AND routine_row.proname = 'block_agency_writes_during_reconciliation_migration'
        ORDER BY "objectKind", "objectIdentity"
      `;
      const [source] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          (SELECT COUNT(*) FROM "Center")::bigint AS "centerCount",
          (SELECT COUNT(*) FROM "Center"
            WHERE "customFields"->>'agencyLedgerRehearsalSourceShapeSha256' = ${EXPECTED_SOURCE_SHAPE_SHA256})::bigint AS "sourceShapeMarkerCount",
          (SELECT CASE
            WHEN COUNT(DISTINCT "customFields"->>'agencyLedgerRehearsalSourceShapeSha256') = 1
              THEN MIN("customFields"->>'agencyLedgerRehearsalSourceShapeSha256')
            ELSE NULL
          END FROM "Center") AS "sourceShapeSha256",
          (SELECT COUNT(*) FROM "AgencyProgram")::bigint AS "agencyProgramCount",
          (SELECT COUNT(*) FROM "AgencyProgram" WHERE status = 'active')::bigint AS "activeProgramCount",
          (SELECT COUNT(*) FROM "AgencyProgram" WHERE status = 'setup_required')::bigint AS "setupRequiredProgramCount",
          (SELECT COUNT(*) FROM "SubsidyClaim")::bigint AS "subsidyClaimCount",
          (SELECT COUNT(*) FROM "SubsidyClaim" WHERE status = 'draft')::bigint AS "draftClaimCount",
          (SELECT COUNT(*) FROM "SubsidyRemittance")::bigint AS "subsidyRemittanceCount",
          (SELECT COUNT(*) FROM "Family")::bigint AS "familyCount",
          (SELECT COUNT(*) FROM "BillingAccount")::bigint AS "billingAccountCount",
          (SELECT COALESCE(SUM("balanceCents"), 0) FROM "BillingAccount")::bigint AS "billingAccountBalanceCents",
          (SELECT COUNT(*) FROM "Invoice")::bigint AS "invoiceCount",
          (SELECT COALESCE(SUM("totalCents"), 0) FROM "Invoice")::bigint AS "invoiceTotalCents",
          (SELECT COUNT(*) FROM "Payment")::bigint AS "paymentCount",
          (SELECT COALESCE(SUM("amountCents"), 0) FROM "Payment")::bigint AS "paymentTotalCents",
          (SELECT COUNT(*) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCount",
          (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry")::bigint AS "familyLedgerEntryCents",
          (SELECT COUNT(*) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyAgencyPaymentCount",
          (SELECT COALESCE(SUM("amountCents"), 0) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyAgencyPaymentCents",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "centerId", '|' ORDER BY id), '')) FROM "AgencyProgram") AS "agencyProgramChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || status || ':' || "claimedCents"::text || ':' || COALESCE("approvedCents"::text, '') || ':' || "paidCents"::text || ':' || "servicePeriodStart"::text || ':' || "servicePeriodEnd"::text, '|' ORDER BY id), '')) FROM "SubsidyClaim") AS "subsidyClaimChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "amountCents"::text || ':' || "paidAt"::text || ':' || COALESCE("reversedAt"::text, ''), '|' ORDER BY id), '')) FROM "SubsidyRemittance") AS "subsidyRemittanceChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "centerId" || ':' || "createdAt"::text, '|' ORDER BY id), '')) FROM "Family") AS "familyChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "familyId" || ':' || "balanceCents"::text || ':' || COALESCE("ledgerSyncedAt"::text, ''), '|' ORDER BY id), '')) FROM "BillingAccount") AS "billingAccountChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || status::text || ':' || "totalCents"::text || ':' || "dueDate"::text, '|' ORDER BY id), '')) FROM "Invoice") AS "invoiceChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || status::text || ':' || "amountCents"::text || ':' || COALESCE("paidAt"::text, ''), '|' ORDER BY id), '')) FROM "Payment") AS "paymentChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || type || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry") AS "familyLedgerChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "billingAccountId" || ':' || "amountCents"::text || ':' || COALESCE("balanceAfterCents"::text, '') || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) FROM "LedgerEntry" WHERE type = 'agency_payment') AS "legacyAgencyPaymentChecksum",
          (SELECT MD5(COALESCE(STRING_AGG(id || ':' || "familyId" || ':' || "balanceCents"::text, '|' ORDER BY id), '')) FROM "BillingAccount" WHERE id LIKE 'rehearsal-account-%') AS "legacyBillingAccountChecksum"
      `;
      const nonIdleLocks = await tx.$queryRaw<Array<{ relationName: string | null; mode: string; granted: boolean; count: bigint }>>`
        SELECT CASE WHEN lock_row.relation IS NULL THEN NULL ELSE lock_row.relation::regclass::text END AS "relationName",
          lock_row.mode,
          lock_row.granted,
          COUNT(*)::bigint AS count
        FROM pg_locks lock_row
        JOIN pg_stat_activity activity ON activity.pid = lock_row.pid
        WHERE activity.datname = current_database()
          AND activity.pid <> pg_backend_pid()
          AND activity.state <> 'idle'
        GROUP BY lock_row.relation, lock_row.mode, lock_row.granted
        ORDER BY lock_row.granted, "relationName", lock_row.mode
      `;
      const tableRows = await tx.$queryRaw<Array<{ tableName: string; present: boolean }>>`
        SELECT table_name AS "tableName", to_regclass('public.' || quote_ident(table_name)) IS NOT NULL AS present
        FROM (VALUES
          ('AgencyLedgerAccount'),
          ('AgencyLedgerEntry'),
          ('AgencyRemittanceBatch'),
          ('AgencyRemittanceAllocation'),
          ('AgencyLedgerAdjustment'),
          ('AgencyAccountingPeriod'),
          ('AgencyAccountingPeriodEvent')
        ) AS expected(table_name)
        ORDER BY table_name
      `;
      const allLedgerTablesPresent = tableRows.every((row) => row.present);
      let migrated: RehearsalAuditResult["migrated"] = null;
      if (allLedgerTablesPresent) {
        const [counts] = await tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT
            (SELECT COUNT(*) FROM "AgencyLedgerAccount")::bigint AS "ledgerAccountCount",
            (SELECT COUNT(*) FROM "AgencyLedgerEntry")::bigint AS "ledgerEntryCount",
            (SELECT COUNT(*) FROM "AgencyRemittanceBatch")::bigint AS "remittanceBatchCount",
            (SELECT COUNT(*) FROM "AgencyRemittanceAllocation")::bigint AS "remittanceAllocationCount",
            (SELECT COUNT(*) FROM "AgencyLedgerAdjustment")::bigint AS "ledgerAdjustmentCount",
            (SELECT COUNT(*) FROM "AgencyAccountingPeriod")::bigint AS "accountingPeriodCount",
            (SELECT COUNT(*) FROM "AgencyAccountingPeriodEvent")::bigint AS "accountingPeriodEventCount",
            (SELECT COALESCE(SUM("balanceCents"), 0) FROM "AgencyLedgerAccount")::bigint AS "ledgerBalanceCents",
            (SELECT COALESCE(SUM("amountCents"), 0) FROM "AgencyLedgerEntry")::bigint AS "ledgerEntryCents"
        `;
        const rls = await tx.$queryRaw<Array<{ tableName: string; rlsEnabled: boolean; rlsForced: boolean; policyCount: bigint }>>`
          SELECT table_row.relname AS "tableName",
            table_row.relrowsecurity AS "rlsEnabled",
            table_row.relforcerowsecurity AS "rlsForced",
            (SELECT COUNT(*) FROM pg_policies policy_row WHERE policy_row.schemaname = 'public' AND policy_row.tablename = table_row.relname)::bigint AS "policyCount"
          FROM pg_class table_row
          WHERE table_row.oid IN (
            'public."AgencyLedgerAccount"'::regclass,
            'public."AgencyLedgerEntry"'::regclass,
            'public."AgencyRemittanceBatch"'::regclass,
            'public."AgencyRemittanceAllocation"'::regclass,
            'public."AgencyLedgerAdjustment"'::regclass,
            'public."AgencyAccountingPeriod"'::regclass,
            'public."AgencyAccountingPeriodEvent"'::regclass
          )
          ORDER BY table_row.relname
        `;
        const privileges = await tx.$queryRaw<Array<{ tableName: string; publicPrivileges: string[]; anonPrivileges: string[]; authenticatedPrivileges: string[] }>>`
          WITH expected(table_name) AS (VALUES
            ('AgencyLedgerAccount'),
            ('AgencyLedgerEntry'),
            ('AgencyRemittanceBatch'),
            ('AgencyRemittanceAllocation'),
            ('AgencyLedgerAdjustment'),
            ('AgencyAccountingPeriod'),
            ('AgencyAccountingPeriodEvent')
          )
          SELECT expected.table_name AS "tableName",
            COALESCE(ARRAY_AGG(grant_row.privilege_type::text ORDER BY grant_row.privilege_type::text) FILTER (WHERE grant_row.grantee = 'PUBLIC'), ARRAY[]::text[]) AS "publicPrivileges",
            COALESCE(ARRAY_AGG(grant_row.privilege_type::text ORDER BY grant_row.privilege_type::text) FILTER (WHERE grant_row.grantee = 'anon'), ARRAY[]::text[]) AS "anonPrivileges",
            COALESCE(ARRAY_AGG(grant_row.privilege_type::text ORDER BY grant_row.privilege_type::text) FILTER (WHERE grant_row.grantee = 'authenticated'), ARRAY[]::text[]) AS "authenticatedPrivileges"
          FROM expected
          LEFT JOIN information_schema.table_privileges grant_row
            ON grant_row.table_schema = 'public'
           AND grant_row.table_name = expected.table_name
           AND grant_row.grantee IN ('PUBLIC', 'anon', 'authenticated')
          GROUP BY expected.table_name
          ORDER BY expected.table_name
        `;
        const routinePrivileges = await tx.$queryRaw<Array<{ routineSignature: string; publicCanExecute: boolean; anonCanExecute: boolean; authenticatedCanExecute: boolean }>>`
          SELECT routine_row.oid::regprocedure::text AS "routineSignature",
            COALESCE(BOOL_OR(privilege_row.grantee = 0 AND privilege_row.privilege_type = 'EXECUTE'), FALSE) AS "publicCanExecute",
            has_function_privilege('anon', routine_row.oid, 'EXECUTE') AS "anonCanExecute",
            has_function_privilege('authenticated', routine_row.oid, 'EXECUTE') AS "authenticatedCanExecute"
          FROM pg_proc routine_row
          CROSS JOIN LATERAL aclexplode(COALESCE(routine_row.proacl, acldefault('f', routine_row.proowner))) privilege_row
          WHERE routine_row.pronamespace = 'public'::regnamespace
            AND (
              routine_row.proname ~ '(agency|subsidy)'
              OR routine_row.proname IN (
                'enforce_controlled_claim_approval_snapshot',
                'ensure_baseline_claim_ledger_projection',
                'ensure_baseline_remittance_ledger_projection'
              )
            )
          GROUP BY routine_row.oid
          ORDER BY routine_row.oid::regprocedure::text
        `;
        const indexes = await tx.$queryRaw<Array<{ tableName: string; indexCount: bigint; uniqueIndexCount: bigint; partialIndexCount: bigint }>>`
          WITH expected(table_name) AS (VALUES
            ('AgencyLedgerAccount'),
            ('AgencyLedgerEntry'),
            ('AgencyRemittanceBatch'),
            ('AgencyRemittanceAllocation'),
            ('AgencyLedgerAdjustment'),
            ('AgencyAccountingPeriod'),
            ('AgencyAccountingPeriodEvent')
          )
          SELECT expected.table_name AS "tableName",
            COUNT(index_row.indexname)::bigint AS "indexCount",
            COUNT(index_row.indexname) FILTER (WHERE index_row.indexdef LIKE 'CREATE UNIQUE INDEX%')::bigint AS "uniqueIndexCount",
            COUNT(index_row.indexname) FILTER (WHERE index_row.indexdef ~* '\\sWHERE\\s')::bigint AS "partialIndexCount"
          FROM expected
          LEFT JOIN pg_indexes index_row
            ON index_row.schemaname = 'public' AND index_row.tablename = expected.table_name
          GROUP BY expected.table_name
          ORDER BY expected.table_name
        `;
        const constraints = await tx.$queryRaw<Array<{ tableName: string; foreignKeyCount: bigint; checkCount: bigint; uniqueConstraintCount: bigint }>>`
          WITH expected(table_name) AS (VALUES
            ('AgencyLedgerAccount'),
            ('AgencyLedgerEntry'),
            ('AgencyRemittanceBatch'),
            ('AgencyRemittanceAllocation'),
            ('AgencyLedgerAdjustment'),
            ('AgencyAccountingPeriod'),
            ('AgencyAccountingPeriodEvent')
          )
          SELECT expected.table_name AS "tableName",
            COUNT(constraint_row.oid) FILTER (WHERE constraint_row.contype = 'f')::bigint AS "foreignKeyCount",
            COUNT(constraint_row.oid) FILTER (WHERE constraint_row.contype = 'c')::bigint AS "checkCount",
            COUNT(constraint_row.oid) FILTER (WHERE constraint_row.contype = 'u')::bigint AS "uniqueConstraintCount"
          FROM expected
          LEFT JOIN pg_class table_row ON table_row.relname = expected.table_name AND table_row.relnamespace = 'public'::regnamespace
          LEFT JOIN pg_constraint constraint_row ON constraint_row.conrelid = table_row.oid
          GROUP BY expected.table_name
          ORDER BY expected.table_name
        `;
        const triggers = await tx.$queryRaw<Array<{ tableName: string; triggerCount: bigint; constraintTriggerCount: bigint }>>`
          WITH expected(table_name) AS (VALUES
            ('AgencyLedgerAccount'),
            ('AgencyLedgerEntry'),
            ('AgencyRemittanceBatch'),
            ('AgencyRemittanceAllocation'),
            ('AgencyLedgerAdjustment'),
            ('AgencyAccountingPeriod'),
            ('AgencyAccountingPeriodEvent'),
            ('SubsidyAuthorization'),
            ('SubsidyClaim'),
            ('SubsidyClaimLine'),
            ('SubsidyRemittance'),
            ('AgencyProgram'),
            ('Center'),
            ('Family'),
            ('Child'),
            ('Classroom')
          )
          SELECT expected.table_name AS "tableName",
            COUNT(trigger_row.oid)::bigint AS "triggerCount",
            COUNT(trigger_row.oid) FILTER (WHERE trigger_row.tgconstraint <> 0)::bigint AS "constraintTriggerCount"
          FROM expected
          LEFT JOIN pg_class table_row ON table_row.relname = expected.table_name AND table_row.relnamespace = 'public'::regnamespace
          LEFT JOIN pg_trigger trigger_row ON trigger_row.tgrelid = table_row.oid AND NOT trigger_row.tgisinternal
          GROUP BY expected.table_name
          ORDER BY expected.table_name
        `;
        const catalogManifestRows = await tx.$queryRaw<CatalogManifestRow[]>`
          WITH relevant_relations(table_name) AS (VALUES
            ('AgencyLedgerAccount'),
            ('AgencyLedgerEntry'),
            ('AgencyRemittanceBatch'),
            ('AgencyRemittanceAllocation'),
            ('AgencyLedgerAdjustment'),
            ('AgencyAccountingPeriod'),
            ('AgencyAccountingPeriodEvent'),
            ('SubsidyAuthorization'),
            ('SubsidyClaim'),
            ('SubsidyClaimLine'),
            ('SubsidyRemittance'),
            ('AgencyProgram'),
            ('Center'),
            ('Family'),
            ('Child'),
            ('Classroom')
          ), relevant_tables AS (
            SELECT table_row.oid, table_row.relname, namespace_row.nspname
            FROM relevant_relations
            JOIN pg_class table_row
              ON table_row.relname = relevant_relations.table_name
             AND table_row.relkind IN ('r', 'p')
            JOIN pg_namespace namespace_row
              ON namespace_row.oid = table_row.relnamespace
             AND namespace_row.nspname = 'public'
          )
          SELECT 'relation'::text AS "objectKind",
            format('%I.%I', relevant_tables.nspname, relevant_tables.relname) AS "objectIdentity",
            format('%I.%I', relevant_tables.nspname, relevant_tables.relname) AS definition,
            jsonb_build_object(
              'acl', to_jsonb(ARRAY(
                SELECT acl_entry::text
                FROM unnest(COALESCE(relation_row.relacl, ARRAY[]::aclitem[])) AS acl_rows(acl_entry)
                ORDER BY acl_entry::text
              )),
              'aclIsDefault', relation_row.relacl IS NULL,
              'forceRowSecurity', relation_row.relforcerowsecurity,
              'hasRules', relation_row.relhasrules,
              'hasTriggers', relation_row.relhastriggers,
              'isPartition', relation_row.relispartition,
              'kind', relation_row.relkind,
              'options', COALESCE(to_jsonb(relation_row.reloptions), '[]'::jsonb),
              'owner', pg_get_userbyid(relation_row.relowner),
              'partitionBound', CASE
                WHEN relation_row.relispartition THEN pg_get_expr(relation_row.relpartbound, relation_row.oid, TRUE)
                ELSE NULL
              END,
              'persistence', relation_row.relpersistence,
              'replicaIdentity', relation_row.relreplident,
              'rowSecurity', relation_row.relrowsecurity,
              'tablespace', COALESCE(tablespace_row.spcname, '<database-default>')
            )::text AS attributes
          FROM relevant_tables
          JOIN pg_class relation_row ON relation_row.oid = relevant_tables.oid
          LEFT JOIN pg_tablespace tablespace_row ON tablespace_row.oid = relation_row.reltablespace

          UNION ALL

          SELECT 'column'::text AS "objectKind",
            format('%I.%I/%s:%I', relevant_tables.nspname, relevant_tables.relname, attribute_row.attnum, attribute_row.attname) AS "objectIdentity",
            concat_ws(' ',
              format('%I', attribute_row.attname),
              format_type(attribute_row.atttypid, attribute_row.atttypmod),
              CASE WHEN attribute_row.attnotnull THEN 'NOT NULL' END,
              CASE
                WHEN attribute_row.attgenerated <> '' THEN 'GENERATED ' || attribute_row.attgenerated::text || ' AS (' || pg_get_expr(default_row.adbin, default_row.adrelid, TRUE) || ')'
                WHEN attribute_row.attidentity <> '' THEN 'IDENTITY ' || attribute_row.attidentity::text
                WHEN default_row.oid IS NOT NULL THEN 'DEFAULT ' || pg_get_expr(default_row.adbin, default_row.adrelid, TRUE)
              END
            ) AS definition,
            jsonb_build_object(
              'acl', to_jsonb(ARRAY(
                SELECT acl_entry::text
                FROM unnest(COALESCE(attribute_row.attacl, ARRAY[]::aclitem[])) AS acl_rows(acl_entry)
                ORDER BY acl_entry::text
              )),
              'aclIsDefault', attribute_row.attacl IS NULL,
              'collation', CASE
                WHEN attribute_row.attcollation = 0 THEN NULL
                ELSE format('%I.%I', collation_namespace.nspname, collation_row.collname)
              END,
              'compression', attribute_row.attcompression,
              'defaultExpression', CASE
                WHEN default_row.oid IS NULL THEN NULL
                ELSE pg_get_expr(default_row.adbin, default_row.adrelid, TRUE)
              END,
              'generated', attribute_row.attgenerated,
              'hasDefault', attribute_row.atthasdef,
              'identity', attribute_row.attidentity,
              'notNull', attribute_row.attnotnull,
              'position', attribute_row.attnum,
              'statisticsTarget', attribute_row.attstattarget,
              'storage', attribute_row.attstorage,
              'type', format_type(attribute_row.atttypid, attribute_row.atttypmod)
            )::text AS attributes
          FROM relevant_tables
          JOIN pg_attribute attribute_row
            ON attribute_row.attrelid = relevant_tables.oid
           AND attribute_row.attnum > 0
           AND NOT attribute_row.attisdropped
          LEFT JOIN pg_attrdef default_row
            ON default_row.adrelid = attribute_row.attrelid
           AND default_row.adnum = attribute_row.attnum
          LEFT JOIN pg_collation collation_row ON collation_row.oid = attribute_row.attcollation
          LEFT JOIN pg_namespace collation_namespace ON collation_namespace.oid = collation_row.collnamespace

          UNION ALL

          SELECT 'index'::text AS "objectKind",
            format('%I.%I/%I', relevant_tables.nspname, relevant_tables.relname, index_row.relname) AS "objectIdentity",
            pg_get_indexdef(index_row.oid) AS definition,
            jsonb_build_object(
              'live', index_catalog.indislive,
              'primary', index_catalog.indisprimary,
              'ready', index_catalog.indisready,
              'unique', index_catalog.indisunique,
              'valid', index_catalog.indisvalid
            )::text AS attributes
          FROM relevant_tables
          JOIN pg_index index_catalog ON index_catalog.indrelid = relevant_tables.oid
          JOIN pg_class index_row ON index_row.oid = index_catalog.indexrelid

          UNION ALL

          SELECT 'constraint'::text AS "objectKind",
            format('%I.%I/%I', relevant_tables.nspname, relevant_tables.relname, constraint_row.conname) AS "objectIdentity",
            pg_get_constraintdef(constraint_row.oid, TRUE) AS definition,
            jsonb_build_object(
              'deferred', constraint_row.condeferred,
              'deferrable', constraint_row.condeferrable,
              'local', constraint_row.conislocal,
              'noInherit', constraint_row.connoinherit,
              'type', constraint_row.contype,
              'validated', constraint_row.convalidated
            )::text AS attributes
          FROM relevant_tables
          JOIN pg_constraint constraint_row ON constraint_row.conrelid = relevant_tables.oid

          UNION ALL

          SELECT 'trigger'::text AS "objectKind",
            format('%I.%I/%I', relevant_tables.nspname, relevant_tables.relname, trigger_row.tgname) AS "objectIdentity",
            pg_get_triggerdef(trigger_row.oid, TRUE) AS definition,
            jsonb_build_object(
              'constraint', trigger_row.tgconstraint <> 0,
              'deferrable', trigger_row.tgdeferrable,
              'enabled', trigger_row.tgenabled,
              'initiallyDeferred', trigger_row.tginitdeferred
            )::text AS attributes
          FROM relevant_tables
          JOIN pg_trigger trigger_row ON trigger_row.tgrelid = relevant_tables.oid
          WHERE NOT trigger_row.tgisinternal

          UNION ALL

          SELECT 'routine'::text AS "objectKind",
            format('%I.%I(%s)', namespace_row.nspname, routine_row.proname, pg_get_function_identity_arguments(routine_row.oid)) AS "objectIdentity",
            pg_get_functiondef(routine_row.oid) AS definition,
            jsonb_build_object(
              'acl', to_jsonb(ARRAY(
                SELECT acl_entry::text
                FROM unnest(COALESCE(routine_row.proacl, ARRAY[]::aclitem[])) AS acl_rows(acl_entry)
                ORDER BY acl_entry::text
              )),
              'aclIsDefault', routine_row.proacl IS NULL,
              'configuration', COALESCE(to_jsonb(routine_row.proconfig), '[]'::jsonb),
              'kind', routine_row.prokind,
              'language', language_row.lanname,
              'leakproof', routine_row.proleakproof,
              'owner', pg_get_userbyid(routine_row.proowner),
              'parallel', routine_row.proparallel,
              'searchPath', COALESCE((
                SELECT config_entry
                FROM unnest(COALESCE(routine_row.proconfig, ARRAY[]::text[])) AS config_rows(config_entry)
                WHERE config_entry LIKE 'search_path=%'
                LIMIT 1
              ), '<database-default>'),
              'securityDefiner', routine_row.prosecdef,
              'strict', routine_row.proisstrict,
              'volatility', routine_row.provolatile
            )::text AS attributes
          FROM pg_proc routine_row
          JOIN pg_namespace namespace_row ON namespace_row.oid = routine_row.pronamespace
          JOIN pg_language language_row ON language_row.oid = routine_row.prolang
          WHERE namespace_row.nspname = 'public'
            AND (
              routine_row.proname ~ '(agency|subsidy)'
              OR routine_row.proname IN (
                'enforce_controlled_claim_approval_snapshot',
                'ensure_baseline_claim_ledger_projection',
                'ensure_baseline_remittance_ledger_projection'
              )
            )
          ORDER BY "objectKind", "objectIdentity"
        `;
        const catalogManifest = buildCatalogManifest(catalogManifestRows);
        migrated = { counts, rls, privileges, routinePrivileges, indexes, constraints, triggers, catalogManifest };
      }
      return {
        identity,
        source,
        tables: tableRows,
        nonIdleLocks,
        migrated,
        supabaseMigrationHistoryPresent: identity.supabaseMigrationHistoryPresent,
        prismaMigrationHistoryPresent: identity.prismaMigrationHistoryPresent,
        candidateSupabaseMigrationHistory,
        candidatePrismaMigrationHistory,
        temporaryMigrationFenceObjects,
      };
    }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
    const requireProductionDerivedBaseline = process.env.REQUIRE_PRODUCTION_DERIVED_BASELINE === "1";
    if (requireProductionDerivedBaseline) assertProductionDerivedBaseline(result);
    console.log(json({
      mode: "read_only_rehearsal_audit",
      targetProjectRef: AGENCY_REHEARSAL_PROJECT_REF,
      requireProductionDerivedBaseline,
      productionDerivedBaselineMatched: requireProductionDerivedBaseline ? true : null,
      ...result,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
