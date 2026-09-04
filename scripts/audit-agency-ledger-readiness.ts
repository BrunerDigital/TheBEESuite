import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

type CountRow = { status: string; count: bigint };
type LegacyRow = { id: string; centerName: string; amountCents: number; effectiveAt: Date; sourceSystem: string | null; externalId: string | null };
type AccessRow = { centerId: string; centerName: string; accountingUserCount: bigint };
type ChecksumRow = { recordCount: bigint; amountCents: bigint; checksum: string | null };

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function json(value: unknown) {
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? Number(item) : item, 2);
}

async function main() {
  const [databaseIdentity] = await prisma.$queryRaw<Array<{ databaseName: string; serverVersion: string }>>`
    SELECT current_database() AS "databaseName", current_setting('server_version') AS "serverVersion"
  `;
  const programCounts = await prisma.$queryRaw<CountRow[]>`
    SELECT status, COUNT(*)::bigint AS count FROM "AgencyProgram" GROUP BY status ORDER BY status
  `;
  const claimCounts = await prisma.$queryRaw<CountRow[]>`
    SELECT status, COUNT(*)::bigint AS count FROM "SubsidyClaim" GROUP BY status ORDER BY status
  `;
  const remittanceSummary = await prisma.$queryRaw<Array<{ count: bigint; amountCents: bigint; reversalChronologyViolations: bigint }>>`
    SELECT COUNT(*)::bigint AS count,
      COALESCE(SUM("amountCents"), 0)::bigint AS "amountCents",
      COUNT(*) FILTER (WHERE "reversedAt" IS NOT NULL AND "reversedAt" < "paidAt")::bigint AS "reversalChronologyViolations"
    FROM "SubsidyRemittance"
  `;
  const legacyRows = await prisma.$queryRaw<LegacyRow[]>`
    SELECT entry.id,
      center.name AS "centerName",
      entry."amountCents",
      entry."effectiveAt",
      entry."sourceSystem",
      entry."externalId"
    FROM "LedgerEntry" entry
    JOIN "BillingAccount" account ON account.id = entry."billingAccountId"
    JOIN "Family" family ON family.id = account."familyId"
    JOIN "Center" center ON center.id = family."centerId"
    WHERE entry.type = 'agency_payment'
    ORDER BY center.name, entry."effectiveAt", entry.id
  `;
  const legacySummary = await prisma.$queryRaw<Array<{ count: bigint; amountCents: bigint }>>`
    SELECT COUNT(*)::bigint AS count, COALESCE(SUM("amountCents"), 0)::bigint AS "amountCents"
    FROM "LedgerEntry" WHERE type = 'agency_payment'
  `;
  const sourceChecksums = await prisma.$queryRaw<ChecksumRow[]>`
    SELECT COUNT(*)::bigint AS "recordCount",
      COALESCE(SUM("amountCents"), 0)::bigint AS "amountCents",
      MD5(COALESCE(STRING_AGG(id || ':' || "amountCents"::text || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) AS checksum
    FROM "LedgerEntry"
    WHERE type = 'agency_payment'
  `;
  const accountingAccess = await prisma.$queryRaw<AccessRow[]>`
    WITH active_program_centers AS (
      SELECT DISTINCT center.id, center.name, center."organizationId", organization."tenantId"
      FROM "AgencyProgram" program
      JOIN "Center" center ON center.id = program."centerId"
      JOIN "Organization" organization ON organization.id = center."organizationId"
      WHERE program.status = 'active'
    ), eligible_users AS (
      SELECT DISTINCT center.id AS "centerId", app_user.id AS "userId"
      FROM active_program_centers center
      JOIN "User" app_user ON app_user."tenantId" = center."tenantId" AND app_user."isActive" = TRUE
      LEFT JOIN "UserAccessGrant" grant_row ON grant_row."userId" = app_user.id
        AND grant_row."isActive" = TRUE
        AND (grant_row."startsAt" IS NULL OR grant_row."startsAt" <= CURRENT_TIMESTAMP)
        AND (grant_row."endsAt" IS NULL OR grant_row."endsAt" > CURRENT_TIMESTAMP)
      WHERE COALESCE(grant_row.role::text, app_user.role::text) IN ('PLATFORM_OWNER', 'BRAND_ADMIN', 'REGIONAL_MANAGER', 'BILLING_ADMIN')
        AND (
          app_user.role::text = 'PLATFORM_OWNER'
          OR grant_row."centerId" = center.id
          OR grant_row."organizationId" = center."organizationId"
          OR (grant_row."tenantId" = center."tenantId" AND grant_row."scopeType" = 'tenant')
        )
    )
    SELECT center.id AS "centerId", center.name AS "centerName", COUNT(eligible."userId")::bigint AS "accountingUserCount"
    FROM active_program_centers center
    LEFT JOIN eligible_users eligible ON eligible."centerId" = center.id
    GROUP BY center.id, center.name
    ORDER BY center.name
  `;

  console.log(json({
    mode: "read_only",
    generatedAt: new Date().toISOString(),
    databaseIdentity,
    agencyPrograms: programCounts,
    subsidyClaims: claimCounts,
    subsidyRemittances: remittanceSummary[0],
    legacyAgencyPayments: {
      ...legacySummary[0],
      checksum: sourceChecksums[0]?.checksum ?? null,
      rows: legacyRows.map((row) => ({
        recordHash: shortHash(row.id),
        centerName: row.centerName,
        amountCents: row.amountCents,
        effectiveDate: row.effectiveAt.toISOString().slice(0, 10),
        sourceSystem: row.sourceSystem,
        hasExternalId: Boolean(row.externalId),
      })),
    },
    activeProgramCenterAccountingAccess: accountingAccess,
  }));
}

main().finally(() => prisma.$disconnect());
