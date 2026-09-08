import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { getRuntimeDatabaseUrl } from "@/lib/readiness-guardrails";
import { AGENCY_PRODUCTION_PROJECT_REF, assertExactSupabaseDatabaseTarget } from "./agency-ledger-rehearsal-target";

type CountRow = { status: string; count: bigint };
type LegacyRow = { id: string; centerName: string; amountCents: number; effectiveAt: Date; sourceSystem: string | null; externalId: string | null };
type AccessRow = { centerId: string; centerName: string; accountingUserCount: bigint };
type ChecksumRow = { recordCount: bigint; amountCents: bigint; checksum: string | null };
type ClaimIntegrityRow = {
  unsupportedStatusApprovalAmountCount: bigint;
  supportedStatusMissingApprovalAmountCount: bigint;
  supportedStatusNullApprovedAtCount: bigint;
  approvedLifecycleMissingAuthorizationCount: bigint;
  futureApprovalEventCount: bigint;
  approvalExceedsClaimCount: bigint;
  paidCentsMismatchCount: bigint;
  statusMismatchCount: bigint;
};
type RemittanceIntegrityRow = {
  count: bigint;
  amountCents: bigint;
  nonpositiveAmountCount: bigint;
  actorOrReversalEvidenceIncompleteCount: bigint;
  reversalChronologyViolations: bigint;
  futureEventCount: bigint;
};
type RelationshipIntegrityRow = {
  authorizationProgramSchoolMismatchCount: bigint;
  claimProgramSchoolMismatchCount: bigint;
  claimAuthorizationScopeMismatchCount: bigint;
  authorizationFamilySchoolMismatchCount: bigint;
  claimLineAuthorizationChildMismatchCount: bigint;
};

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function json(value: unknown) {
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? Number(item) : item, 2);
}

async function main() {
  const productionUrl = getRuntimeDatabaseUrl(process.env);
  if (!productionUrl) throw new Error("A production database URL is required for the readiness audit.");
  assertExactSupabaseDatabaseTarget(productionUrl, AGENCY_PRODUCTION_PROJECT_REF, "Production readiness source URL");
  const auditClient = new PrismaClient({ datasources: { db: { url: productionUrl } }, log: ["error"] });
  try {
    const result = await auditClient.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  const [databaseIdentity] = await tx.$queryRaw<Array<{ databaseName: string; serverVersion: string }>>`
    SELECT current_database() AS "databaseName", current_setting('server_version') AS "serverVersion"
  `;
  const programCounts = await tx.$queryRaw<CountRow[]>`
    SELECT status, COUNT(*)::bigint AS count FROM "AgencyProgram" GROUP BY status ORDER BY status
  `;
  const claimCounts = await tx.$queryRaw<CountRow[]>`
    SELECT status, COUNT(*)::bigint AS count FROM "SubsidyClaim" GROUP BY status ORDER BY status
  `;
  const [claimIntegrity] = await tx.$queryRaw<ClaimIntegrityRow[]>`
    WITH claim_sources AS (
      SELECT claim.id,
        claim.status,
        claim."authorizationId",
        claim."approvedCents",
        claim."approvedAt",
        claim."createdAt",
        claim."claimedCents",
        claim."paidCents"::bigint AS "paidCents",
        COALESCE(SUM(remittance."amountCents") FILTER (WHERE remittance."reversedAt" IS NULL), 0)::bigint AS "activeRemittanceCents"
      FROM "SubsidyClaim" claim
      LEFT JOIN "SubsidyRemittance" remittance ON remittance."claimId" = claim.id
      GROUP BY claim.id, claim.status, claim."authorizationId", claim."approvedCents", claim."approvedAt", claim."createdAt", claim."claimedCents", claim."paidCents"
    )
    SELECT
      COUNT(*) FILTER (WHERE COALESCE("approvedCents", 0) <> 0 AND status NOT IN ('approved', 'partially_paid', 'paid'))::bigint AS "unsupportedStatusApprovalAmountCount",
      COUNT(*) FILTER (WHERE status IN ('approved', 'partially_paid', 'paid') AND COALESCE("approvedCents", 0) <= 0)::bigint AS "supportedStatusMissingApprovalAmountCount",
      COUNT(*) FILTER (WHERE status IN ('approved', 'partially_paid', 'paid') AND "approvedAt" IS NULL)::bigint AS "supportedStatusNullApprovedAtCount",
      COUNT(*) FILTER (WHERE status IN ('approved', 'partially_paid', 'paid') AND "authorizationId" IS NULL)::bigint AS "approvedLifecycleMissingAuthorizationCount",
      COUNT(*) FILTER (WHERE status IN ('approved', 'partially_paid', 'paid') AND COALESCE("approvedAt", "createdAt") >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day')::bigint AS "futureApprovalEventCount",
      COUNT(*) FILTER (WHERE "approvedCents" > "claimedCents")::bigint AS "approvalExceedsClaimCount",
      COUNT(*) FILTER (WHERE "paidCents" <> "activeRemittanceCents")::bigint AS "paidCentsMismatchCount",
      COUNT(*) FILTER (WHERE
        (status = 'approved' AND "activeRemittanceCents" <> 0)
        OR (status = 'partially_paid' AND ("activeRemittanceCents" <= 0 OR "activeRemittanceCents" >= COALESCE("approvedCents", "claimedCents")))
        OR (status = 'paid' AND "activeRemittanceCents" <> COALESCE("approvedCents", "claimedCents"))
        OR (status NOT IN ('approved', 'partially_paid', 'paid') AND "activeRemittanceCents" <> 0)
      )::bigint AS "statusMismatchCount"
    FROM claim_sources
  `;
  const remittanceSummary = await tx.$queryRaw<RemittanceIntegrityRow[]>`
    SELECT COUNT(*)::bigint AS count,
      COALESCE(SUM("amountCents"), 0)::bigint AS "amountCents",
      COUNT(*) FILTER (WHERE "amountCents" <= 0)::bigint AS "nonpositiveAmountCount",
      COUNT(*) FILTER (WHERE NULLIF(BTRIM("enteredById"), '') IS NULL
        OR ("reversedAt" IS NOT NULL AND (NULLIF(BTRIM("reversedById"), '') IS NULL OR NULLIF(BTRIM("reversalReason"), '') IS NULL))
        OR ("reversedAt" IS NULL AND ("reversedById" IS NOT NULL OR "reversalReason" IS NOT NULL)))::bigint AS "actorOrReversalEvidenceIncompleteCount",
      COUNT(*) FILTER (WHERE "reversedAt" IS NOT NULL AND DATE_TRUNC('day', "reversedAt") < DATE_TRUNC('day', "paidAt"))::bigint AS "reversalChronologyViolations",
      COUNT(*) FILTER (WHERE "paidAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day'
        OR "reversedAt" >= DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day')::bigint AS "futureEventCount"
    FROM "SubsidyRemittance"
  `;
  const [relationshipIntegrity] = await tx.$queryRaw<RelationshipIntegrityRow[]>`
    SELECT
      (SELECT COUNT(*) FROM "SubsidyAuthorization" authorization_row
        JOIN "AgencyProgram" program ON program.id = authorization_row."agencyProgramId"
        WHERE program."centerId" <> authorization_row."centerId")::bigint AS "authorizationProgramSchoolMismatchCount",
      (SELECT COUNT(*) FROM "SubsidyClaim" claim
        JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
        WHERE program."centerId" <> claim."centerId")::bigint AS "claimProgramSchoolMismatchCount",
      (SELECT COUNT(*) FROM "SubsidyClaim" claim
        JOIN "SubsidyAuthorization" authorization_row ON authorization_row.id = claim."authorizationId"
        WHERE authorization_row."centerId" <> claim."centerId"
          OR authorization_row."agencyProgramId" <> claim."agencyProgramId")::bigint AS "claimAuthorizationScopeMismatchCount",
      (SELECT COUNT(*) FROM "SubsidyAuthorization" authorization_row
        JOIN "Family" family_row ON family_row.id = authorization_row."familyId"
        JOIN "Child" child_row ON child_row.id = authorization_row."childId"
        WHERE family_row."centerId" IS DISTINCT FROM authorization_row."centerId"
          OR child_row."familyId" <> authorization_row."familyId")::bigint AS "authorizationFamilySchoolMismatchCount",
      (SELECT COUNT(*) FROM "SubsidyClaimLine" claim_line
        JOIN "SubsidyClaim" claim ON claim.id = claim_line."claimId"
        JOIN "SubsidyAuthorization" authorization_row ON authorization_row.id = claim."authorizationId"
        WHERE claim_line."childId" <> authorization_row."childId")::bigint AS "claimLineAuthorizationChildMismatchCount"
  `;
  const legacyRows = await tx.$queryRaw<LegacyRow[]>`
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
  const legacySummary = await tx.$queryRaw<Array<{ count: bigint; amountCents: bigint }>>`
    SELECT COUNT(*)::bigint AS count, COALESCE(SUM("amountCents"), 0)::bigint AS "amountCents"
    FROM "LedgerEntry" WHERE type = 'agency_payment'
  `;
  const sourceChecksums = await tx.$queryRaw<ChecksumRow[]>`
    SELECT COUNT(*)::bigint AS "recordCount",
      COALESCE(SUM("amountCents"), 0)::bigint AS "amountCents",
      MD5(COALESCE(STRING_AGG(id || ':' || "amountCents"::text || ':' || "effectiveAt"::text, '|' ORDER BY id), '')) AS checksum
    FROM "LedgerEntry"
    WHERE type = 'agency_payment'
  `;
  const accountingAccess = await tx.$queryRaw<AccessRow[]>`
    WITH active_program_centers AS (
      SELECT DISTINCT center.id, center.name, center."organizationId", organization."tenantId"
      FROM "AgencyProgram" program
      JOIN "Center" center ON center.id = program."centerId"
      JOIN "Organization" organization ON organization.id = center."organizationId"
      WHERE program.status = 'active'
    ), usable_users AS (
      SELECT app_user.id, app_user."tenantId", app_user.role
      FROM "User" app_user
      WHERE app_user."isActive" = TRUE
        AND app_user."mustResetPassword" = FALSE
        AND app_user.role::text IN ('PLATFORM_OWNER', 'BRAND_ADMIN', 'REGIONAL_MANAGER', 'BILLING_ADMIN')
    ), eligible_users AS (
      SELECT DISTINCT center.id AS "centerId", app_user.id AS "userId"
      FROM active_program_centers center
      JOIN usable_users app_user ON (
        app_user.role::text = 'PLATFORM_OWNER'
        OR (app_user.role::text IN ('BRAND_ADMIN', 'REGIONAL_MANAGER') AND app_user."tenantId" = center."tenantId")
        OR (
          app_user.role::text = 'BILLING_ADMIN'
          AND app_user."tenantId" = center."tenantId"
          AND (
            EXISTS (
              SELECT 1 FROM "StaffProfile" profile
              WHERE profile."userId" = app_user.id AND profile."centerId" = center.id
            )
            OR EXISTS (
              SELECT 1 FROM "UserAccessGrant" grant_row
              WHERE grant_row."userId" = app_user.id
                AND grant_row."tenantId" = app_user."tenantId"
                AND grant_row."scopeType" = 'CENTER'
                AND grant_row."centerId" = center.id
                AND grant_row."isActive" = TRUE
                AND (grant_row."startsAt" IS NULL OR grant_row."startsAt" <= CURRENT_TIMESTAMP)
                AND (grant_row."endsAt" IS NULL OR grant_row."endsAt" >= CURRENT_TIMESTAMP)
            )
          )
        )
      )
    )
    SELECT center.id AS "centerId", center.name AS "centerName", COUNT(eligible."userId")::bigint AS "accountingUserCount"
    FROM active_program_centers center
    LEFT JOIN eligible_users eligible ON eligible."centerId" = center.id
    GROUP BY center.id, center.name
    ORDER BY center.name
  `;

  const hardBlockerCounts = [
    claimIntegrity?.unsupportedStatusApprovalAmountCount,
    claimIntegrity?.supportedStatusMissingApprovalAmountCount,
    claimIntegrity?.approvedLifecycleMissingAuthorizationCount,
    claimIntegrity?.futureApprovalEventCount,
    claimIntegrity?.approvalExceedsClaimCount,
    claimIntegrity?.paidCentsMismatchCount,
    claimIntegrity?.statusMismatchCount,
    remittanceSummary[0]?.nonpositiveAmountCount,
    remittanceSummary[0]?.actorOrReversalEvidenceIncompleteCount,
    remittanceSummary[0]?.reversalChronologyViolations,
    remittanceSummary[0]?.futureEventCount,
    ...Object.values(relationshipIntegrity ?? {}),
  ].map((value) => value ?? BigInt(0));
  const migrationBlockerCount = hardBlockerCounts.reduce((sum, value) => sum + value, BigInt(0));

  return {
    mode: "read_only",
    generatedAt: new Date().toISOString(),
    databaseIdentity,
    agencyPrograms: programCounts,
    subsidyClaims: claimCounts,
    subsidyClaimIntegrity: claimIntegrity,
    relationshipIntegrity,
    subsidyRemittances: remittanceSummary[0],
    migrationBlockerCount,
    readyForMigrationDataShape: migrationBlockerCount === BigInt(0),
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
  };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
    console.log(json(result));
  } finally {
    await auditClient.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
