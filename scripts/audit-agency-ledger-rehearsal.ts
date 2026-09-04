import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  AGENCY_REHEARSAL_DATABASE_MARKER,
  AGENCY_REHEARSAL_PROJECT_REF,
  assertAuthorizedRehearsalDatabaseTarget,
} from "./agency-ledger-rehearsal-target";

function json(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
}

async function main() {
  loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
  const url = process.env.REHEARSAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("REHEARSAL_DATABASE_URL is required.");
  assertAuthorizedRehearsalDatabaseTarget(url);
  const prisma = new PrismaClient({ datasources: { db: { url } }, log: ["error"] });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const [identity] = await tx.$queryRaw<Array<{ databaseName: string; databaseUser: string; databaseMarker: string | null; postgresVersion: string; capturedAt: Date }>>`
        SELECT current_database() AS "databaseName",
          current_user AS "databaseUser",
          shobj_description(database_row.oid, 'pg_database') AS "databaseMarker",
          current_setting('server_version') AS "postgresVersion",
          CURRENT_TIMESTAMP AS "capturedAt"
        FROM pg_database database_row
        WHERE database_row.datname = current_database()
      `;
      if (!identity || identity.databaseName !== "postgres" || identity.databaseUser !== "postgres" || identity.databaseMarker !== AGENCY_REHEARSAL_DATABASE_MARKER) {
        throw new Error("The database-side disposable rehearsal marker does not match; refusing to audit the target.");
      }
      const [source] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
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
          ('AgencyAccountingPeriod')
        ) AS expected(table_name)
        ORDER BY table_name
      `;
      const allLedgerTablesPresent = tableRows.every((row) => row.present);
      let migrated: Record<string, unknown> | null = null;
      if (allLedgerTablesPresent) {
        const [counts] = await tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT
            (SELECT COUNT(*) FROM "AgencyLedgerAccount")::bigint AS "ledgerAccountCount",
            (SELECT COUNT(*) FROM "AgencyLedgerEntry")::bigint AS "ledgerEntryCount",
            (SELECT COUNT(*) FROM "AgencyRemittanceBatch")::bigint AS "remittanceBatchCount",
            (SELECT COUNT(*) FROM "AgencyRemittanceAllocation")::bigint AS "remittanceAllocationCount",
            (SELECT COUNT(*) FROM "AgencyLedgerAdjustment")::bigint AS "ledgerAdjustmentCount",
            (SELECT COUNT(*) FROM "AgencyAccountingPeriod")::bigint AS "accountingPeriodCount",
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
            'public."AgencyAccountingPeriod"'::regclass
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
            ('AgencyAccountingPeriod')
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
            AND routine_row.proname ~ '^(adopt|assert|enforce|protect)_.*(agency|subsidy)'
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
            ('AgencyAccountingPeriod')
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
            ('AgencyAccountingPeriod')
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
        migrated = { counts, rls, privileges, routinePrivileges, indexes, constraints, triggers };
      }
      return { identity, source, tables: tableRows, nonIdleLocks, migrated };
    }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
    console.log(json({ mode: "read_only_rehearsal_audit", targetProjectRef: AGENCY_REHEARSAL_PROJECT_REF, ...result }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
