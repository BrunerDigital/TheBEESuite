import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  AGENCY_PRODUCTION_PROJECT_REF,
  AGENCY_REHEARSAL_DATABASE_MARKER,
  AGENCY_REHEARSAL_PROJECT_REF,
  assertAuthorizedRehearsalDatabaseTarget,
  assertExactSupabaseDatabaseTarget,
} from "./agency-ledger-rehearsal-target";

const REHEARSAL_TENANT_ID = "agency-ledger-rehearsal-tenant";
const REHEARSAL_ORGANIZATION_ID = "agency-ledger-rehearsal-organization";

type SourceProgram = {
  id: string;
  centerId: string;
  stateCode: string;
  submissionMethod: string;
  status: string;
  hasProgramName: boolean;
  hasProviderNumber: boolean;
  hasVendorNumber: boolean;
  hasPortalUrl: boolean;
  hasRemittanceEmail: boolean;
  hasPaymentInstructions: boolean;
  receivableGlCode: string | null;
  cashGlCode: string | null;
  adjustmentGlCode: string | null;
  costCenterCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SourceClaim = {
  id: string;
  centerId: string;
  agencyProgramId: string;
  servicePeriodStart: Date;
  servicePeriodEnd: Date;
  dueDate: Date | null;
  status: string;
  claimedCents: number;
  approvedCents: number | null;
  paidCents: number;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SourceLegacyEntry = {
  id: string;
  billingAccountId: string;
  familyId: string;
  centerId: string;
  accountBalanceCents: number;
  amountCents: number;
  balanceAfterCents: number | null;
  effectiveAt: Date;
  createdAt: Date;
};

function id(prefix: string, sourceId: string) {
  return `${prefix}-${createHash("sha256").update(sourceId).digest("hex").slice(0, 20)}`;
}

function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)).digest("hex");
}

function withoutKeys<T extends object>(value: T, keys: Array<keyof T>) {
  const result = { ...value } as Record<string, unknown>;
  for (const key of keys) delete result[String(key)];
  return result;
}

function client(url: string) {
  return new PrismaClient({ datasources: { db: { url } }, log: ["error"] });
}

async function main() {
  loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
  const productionUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  const rehearsalUrl = process.env.REHEARSAL_DATABASE_URL;
  if (!productionUrl) throw new Error("A production read-only source URL is required.");
  if (!rehearsalUrl) throw new Error("REHEARSAL_DATABASE_URL must target the authorized disposable branch.");
  const productionTarget = assertExactSupabaseDatabaseTarget(productionUrl, AGENCY_PRODUCTION_PROJECT_REF, "Production source URL");
  const rehearsalTarget = assertAuthorizedRehearsalDatabaseTarget(rehearsalUrl);
  if (productionTarget === rehearsalTarget) throw new Error("Production and rehearsal database targets must be different.");

  const production = client(productionUrl);
  const rehearsal = client(rehearsalUrl);
  try {
    const source = await production.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const programs = await tx.$queryRaw<SourceProgram[]>`
        SELECT id,
          "centerId",
          "stateCode",
          "submissionMethod",
          status,
          ("programName" IS NOT NULL) AS "hasProgramName",
          ("providerNumber" IS NOT NULL) AS "hasProviderNumber",
          ("vendorNumber" IS NOT NULL) AS "hasVendorNumber",
          ("portalUrl" IS NOT NULL) AS "hasPortalUrl",
          ("remittanceEmail" IS NOT NULL) AS "hasRemittanceEmail",
          ("paymentInstructions" IS NOT NULL) AS "hasPaymentInstructions",
          NULL::text AS "receivableGlCode",
          NULL::text AS "cashGlCode",
          NULL::text AS "adjustmentGlCode",
          NULL::text AS "costCenterCode",
          "createdAt",
          "updatedAt"
        FROM "AgencyProgram"
        ORDER BY id
      `;
      const claims = await tx.$queryRaw<SourceClaim[]>`
        SELECT id,
          "centerId",
          "agencyProgramId",
          "servicePeriodStart",
          "servicePeriodEnd",
          "dueDate",
          status,
          "claimedCents",
          "approvedCents",
          "paidCents",
          "submittedAt",
          "approvedAt",
          "createdAt",
          "updatedAt"
        FROM "SubsidyClaim"
        ORDER BY id
      `;
      const legacyEntries = await tx.$queryRaw<SourceLegacyEntry[]>`
        SELECT entry.id,
          account.id AS "billingAccountId",
          family.id AS "familyId",
          family."centerId",
          account."balanceCents" AS "accountBalanceCents",
          entry."amountCents",
          entry."balanceAfterCents",
          entry."effectiveAt",
          entry."createdAt"
        FROM "LedgerEntry" entry
        JOIN "BillingAccount" account ON account.id = entry."billingAccountId"
        JOIN "Family" family ON family.id = account."familyId"
        WHERE entry.type = 'agency_payment'
        ORDER BY entry.id
      `;
      const remittanceCount = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "SubsidyRemittance"
      `;
      return { programs, claims, legacyEntries, remittanceCount: remittanceCount[0]?.count ?? BigInt(0) };
    }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });

    const centerIds = [...new Set([
      ...source.programs.map((program) => program.centerId),
      ...source.claims.map((claim) => claim.centerId),
      ...source.legacyEntries.map((entry) => entry.centerId),
    ])].sort();
    const centerMap = new Map(centerIds.map((sourceId, index) => [sourceId, { id: id("rehearsal-center", sourceId), name: `Rehearsal School ${index + 1}` }]));
    const programMap = new Map(source.programs.map((program) => [program.id, id("rehearsal-program", program.id)]));
    const familyMap = new Map(source.legacyEntries.map((entry) => [entry.familyId, id("rehearsal-family", entry.familyId)]));
    const accountMap = new Map(source.legacyEntries.map((entry) => [entry.billingAccountId, id("rehearsal-account", entry.billingAccountId)]));
    const sourceShapeChecksum = checksum({
      programs: source.programs.map((program) => withoutKeys(program, ["id", "centerId"])),
      claims: source.claims.map((claim) => withoutKeys(claim, ["id", "centerId", "agencyProgramId"])),
      legacyEntries: source.legacyEntries.map((entry) => withoutKeys(entry, ["id", "billingAccountId", "familyId", "centerId"])),
    });

    await rehearsal.$transaction(async (tx) => {
      const [targetIdentity] = await tx.$queryRaw<Array<{
        databaseName: string;
        databaseUser: string;
        databaseMarker: string | null;
        programCount: bigint;
        claimCount: bigint;
        remittanceCount: bigint;
        legacyCount: bigint;
        hasAgencyLedgerSchema: boolean;
        hasReconciliationSchema: boolean;
        hasPrismaMigrationHistory: boolean;
        hasSupabaseMigrationHistory: boolean;
      }>>`
        SELECT current_database() AS "databaseName",
          current_user AS "databaseUser",
          shobj_description(database_row.oid, 'pg_database') AS "databaseMarker",
          (SELECT COUNT(*) FROM "AgencyProgram")::bigint AS "programCount",
          (SELECT COUNT(*) FROM "SubsidyClaim")::bigint AS "claimCount",
          (SELECT COUNT(*) FROM "SubsidyRemittance")::bigint AS "remittanceCount",
          (SELECT COUNT(*) FROM "LedgerEntry" WHERE type = 'agency_payment')::bigint AS "legacyCount",
          (to_regclass('public."AgencyLedgerAccount"') IS NOT NULL) AS "hasAgencyLedgerSchema",
          (to_regclass('public."AgencyRemittanceBatch"') IS NOT NULL) AS "hasReconciliationSchema",
          (to_regclass('public."_prisma_migrations"') IS NOT NULL) AS "hasPrismaMigrationHistory",
          (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL) AS "hasSupabaseMigrationHistory"
        FROM pg_database database_row
        WHERE database_row.datname = current_database()
      `;
      if (!targetIdentity || targetIdentity.databaseName !== "postgres" || targetIdentity.databaseUser !== "postgres" || targetIdentity.databaseMarker !== AGENCY_REHEARSAL_DATABASE_MARKER) {
        throw new Error("The connected database does not carry the exact authorized disposable-branch marker; refusing every write.");
      }
      if (targetIdentity.programCount !== BigInt(0) || targetIdentity.claimCount !== BigInt(0) || targetIdentity.remittanceCount !== BigInt(0) || targetIdentity.legacyCount !== BigInt(0)) {
        throw new Error("The disposable rehearsal target is not empty; refusing to overwrite or mix data.");
      }
      if (targetIdentity.hasAgencyLedgerSchema || targetIdentity.hasReconciliationSchema) {
        throw new Error("The disposable rehearsal target already contains a candidate migration schema or history row; reset it to the exact production predecessor before seeding.");
      }
      if (targetIdentity.hasSupabaseMigrationHistory) {
        const [candidateSupabaseHistory] = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM supabase_migrations.schema_migrations
          WHERE version IN ('20260903190000', '20260903210000')
             OR name ILIKE '%agency_receivable_ledger%'
             OR name ILIKE '%agency_reconciliation_controls%'
        `;
        if ((candidateSupabaseHistory?.count ?? BigInt(0)) !== BigInt(0)) {
          throw new Error("The disposable rehearsal target already contains a candidate Supabase migration history row; reset it to the exact production predecessor before seeding.");
        }
      }
      if (targetIdentity.hasPrismaMigrationHistory) {
        const [candidatePrismaHistory] = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "_prisma_migrations"
          WHERE migration_name IN ('20260903190000_agency_receivable_ledger', '20260903210000_agency_reconciliation_controls')
        `;
        if ((candidatePrismaHistory?.count ?? BigInt(0)) !== BigInt(0)) {
          throw new Error("The disposable rehearsal target already contains a candidate Prisma migration history row; reset it to the exact production predecessor before seeding.");
        }
      }

      await tx.$executeRaw`
        INSERT INTO "Tenant" (id, name, slug, "createdAt", "updatedAt")
        VALUES (${REHEARSAL_TENANT_ID}, 'Agency ledger rehearsal', 'agency-ledger-rehearsal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      await tx.$executeRaw`
        INSERT INTO "Organization" (id, "tenantId", name, "createdAt", "updatedAt")
        VALUES (${REHEARSAL_ORGANIZATION_ID}, ${REHEARSAL_TENANT_ID}, 'Sanitized rehearsal organization', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      for (const [index, sourceCenterId] of centerIds.entries()) {
        const mapped = centerMap.get(sourceCenterId)!;
        await tx.$executeRaw`
          INSERT INTO "Center" (
            id, "organizationId", name, status, "customFields", "licensedCapacity", timezone, "createdAt", "updatedAt"
          ) VALUES (
            ${mapped.id}, ${REHEARSAL_ORGANIZATION_ID}, ${mapped.name}, 'active',
            ${JSON.stringify({ agencyLedgerRehearsalSourceShapeSha256: sourceShapeChecksum })}::jsonb,
            ${Math.max(1, index + 1)}, 'America/New_York', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `;
      }
      for (const [index, program] of source.programs.entries()) {
        await tx.$executeRaw`
          INSERT INTO "AgencyProgram" (
            id, "centerId", name, "programName", "stateCode", "providerNumber", "vendorNumber",
            "submissionMethod", "portalUrl", "remittanceEmail", "paymentInstructions",
            requirements, status, "createdAt", "updatedAt"
          ) VALUES (
            ${programMap.get(program.id)!}, ${centerMap.get(program.centerId)!.id}, ${`Rehearsal Agency ${index + 1}`},
            ${program.hasProgramName ? `Program ${index + 1}` : null}, ${program.stateCode},
            ${program.hasProviderNumber ? `PROVIDER-${index + 1}` : null}, ${program.hasVendorNumber ? `VENDOR-${index + 1}` : null},
            ${program.submissionMethod}, ${program.hasPortalUrl ? `https://example.invalid/agency/${index + 1}` : null},
            ${program.hasRemittanceEmail ? `rehearsal+${index + 1}@example.invalid` : null},
            ${program.hasPaymentInstructions ? 'Sanitized production-derived payment instructions' : null},
            '[]'::jsonb, ${program.status}, ${program.createdAt}, ${program.updatedAt}
          )
        `;
      }
      for (const [index, claim] of source.claims.entries()) {
        const mappedProgramId = programMap.get(claim.agencyProgramId);
        if (!mappedProgramId) throw new Error("A source claim references an agency program outside the captured source set.");
        await tx.$executeRaw`
          INSERT INTO "SubsidyClaim" (
            id, "centerId", "agencyProgramId", "authorizationId", number,
            "servicePeriodStart", "servicePeriodEnd", "dueDate", status,
            "claimedCents", "approvedCents", "paidCents", "submittedAt", "approvedAt",
            "externalReference", "createdById", "createdAt", "updatedAt"
          ) VALUES (
            ${id("rehearsal-claim", claim.id)}, ${centerMap.get(claim.centerId)!.id}, ${mappedProgramId}, NULL, ${`REHEARSAL-CLAIM-${index + 1}`},
            ${claim.servicePeriodStart}, ${claim.servicePeriodEnd}, ${claim.dueDate}, ${claim.status},
            ${claim.claimedCents}, ${claim.approvedCents}, ${claim.paidCents}, ${claim.submittedAt}, ${claim.approvedAt},
            NULL, 'rehearsal-source-user', ${claim.createdAt}, ${claim.updatedAt}
          )
        `;
      }
      const uniqueAccounts = [...new Map(source.legacyEntries.map((entry) => [entry.billingAccountId, entry])).values()];
      for (const [index, entry] of uniqueAccounts.entries()) {
        const familyId = familyMap.get(entry.familyId)!;
        await tx.$executeRaw`
          INSERT INTO "Family" (id, "centerId", name, "createdAt", "updatedAt")
          VALUES (${familyId}, ${centerMap.get(entry.centerId)!.id}, ${`Rehearsal Legacy Family ${index + 1}`}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
        await tx.$executeRaw`
          INSERT INTO "BillingAccount" (id, "familyId", "balanceCents", "autopayPlaceholder")
          VALUES (${accountMap.get(entry.billingAccountId)!}, ${familyId}, ${entry.accountBalanceCents}, FALSE)
        `;
      }
      for (const entry of source.legacyEntries) {
        const entryId = id("rehearsal-legacy-entry", entry.id);
        await tx.$executeRaw`
          INSERT INTO "LedgerEntry" (
            id, "billingAccountId", type, description, "amountCents", "balanceAfterCents",
            "effectiveAt", "createdAt", "sourceSystem", "externalId", metadata
          ) VALUES (
            ${entryId}, ${accountMap.get(entry.billingAccountId)!}, 'agency_payment', 'Sanitized legacy agency payment history',
            ${entry.amountCents}, ${entry.balanceAfterCents}, ${entry.effectiveAt}, ${entry.createdAt},
            'rehearsal_legacy', ${`legacy:${entryId}`}, '{"rehearsalSanitized":true}'::jsonb
          )
        `;
      }
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });

    console.log(JSON.stringify({
      mode: "sanitized_production_derived_seed",
      targetProjectRef: AGENCY_REHEARSAL_PROJECT_REF,
      sourceCounts: {
        agencyPrograms: source.programs.length,
        subsidyClaims: source.claims.length,
        subsidyRemittances: source.remittanceCount.toString(),
        legacyAgencyPayments: source.legacyEntries.length,
      },
      sourceShapeChecksum,
      privacy: "Names, emails, URLs, provider/vendor identifiers, claim references, and family identities were replaced or omitted.",
    }, null, 2));
  } finally {
    await Promise.allSettled([production.$disconnect(), rehearsal.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
