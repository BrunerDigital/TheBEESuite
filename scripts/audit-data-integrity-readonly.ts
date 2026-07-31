import { PrismaClient } from "@prisma/client";

type IntegrityCounts = {
  family_without_center: bigint;
  family_center_orphan: bigint;
  guardian_user_cross_tenant: bigint;
  child_classroom_cross_center: bigint;
  staff_classroom_cross_center: bigint;
  staff_user_cross_tenant: bigint;
  access_grant_user_cross_tenant: bigint;
  access_grant_center_cross_tenant: bigint;
  document_family_child_mismatch: bigint;
  survey_response_family_center_mismatch: bigint;
  survey_response_survey_tenant_mismatch: bigint;
  duplicate_family_source_keys: bigint;
  duplicate_guardian_source_keys: bigint;
  duplicate_child_source_keys: bigint;
  duplicate_invoice_numbers_per_account: bigint;
};

function numberCounts(row: IntegrityCounts) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  );
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return value;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the read-only integrity audit.");
  }

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<IntegrityCounts[]>`
      SELECT
        (SELECT COUNT(*) FROM "Family" f WHERE f."centerId" IS NULL) AS family_without_center,
        (
          SELECT COUNT(*)
          FROM "Family" f
          LEFT JOIN "Center" c ON c."id" = f."centerId"
          WHERE f."centerId" IS NOT NULL AND c."id" IS NULL
        ) AS family_center_orphan,
        (
          SELECT COUNT(*)
          FROM "Guardian" g
          JOIN "Family" f ON f."id" = g."familyId"
          JOIN "Center" c ON c."id" = f."centerId"
          JOIN "Organization" o ON o."id" = c."organizationId"
          JOIN "User" u ON u."id" = g."userId"
          WHERE g."userId" IS NOT NULL AND u."tenantId" <> o."tenantId"
        ) AS guardian_user_cross_tenant,
        (
          SELECT COUNT(*)
          FROM "Child" ch
          JOIN "Family" f ON f."id" = ch."familyId"
          JOIN "Classroom" cl ON cl."id" = ch."classroomId"
          WHERE ch."classroomId" IS NOT NULL
            AND f."centerId" IS NOT NULL
            AND cl."centerId" <> f."centerId"
        ) AS child_classroom_cross_center,
        (
          SELECT COUNT(*)
          FROM "StaffProfile" sp
          JOIN "Classroom" cl ON cl."id" = sp."classroomId"
          WHERE sp."classroomId" IS NOT NULL AND cl."centerId" <> sp."centerId"
        ) AS staff_classroom_cross_center,
        (
          SELECT COUNT(*)
          FROM "StaffProfile" sp
          JOIN "Center" c ON c."id" = sp."centerId"
          JOIN "Organization" o ON o."id" = c."organizationId"
          JOIN "User" u ON u."id" = sp."userId"
          WHERE u."tenantId" <> o."tenantId"
        ) AS staff_user_cross_tenant,
        (
          SELECT COUNT(*)
          FROM "UserAccessGrant" g
          JOIN "User" u ON u."id" = g."userId"
          WHERE g."tenantId" <> u."tenantId"
        ) AS access_grant_user_cross_tenant,
        (
          SELECT COUNT(*)
          FROM "UserAccessGrant" g
          JOIN "Center" c ON c."id" = g."centerId"
          JOIN "Organization" o ON o."id" = c."organizationId"
          WHERE g."centerId" IS NOT NULL AND g."tenantId" <> o."tenantId"
        ) AS access_grant_center_cross_tenant,
        (
          SELECT COUNT(*)
          FROM "Document" d
          JOIN "Child" ch ON ch."id" = d."childId"
          WHERE d."familyId" IS NOT NULL
            AND d."childId" IS NOT NULL
            AND ch."familyId" <> d."familyId"
        ) AS document_family_child_mismatch,
        (
          SELECT COUNT(*)
          FROM "SurveyResponse" sr
          JOIN "Family" f ON f."id" = sr."familyId"
          WHERE sr."familyId" IS NOT NULL
            AND sr."centerId" IS NOT NULL
            AND f."centerId" IS NOT NULL
            AND sr."centerId" <> f."centerId"
        ) AS survey_response_family_center_mismatch,
        (
          SELECT COUNT(*)
          FROM "SurveyResponse" sr
          JOIN "Survey" s ON s."id" = sr."surveyId"
          JOIN "Family" f ON f."id" = sr."familyId"
          JOIN "Center" c ON c."id" = f."centerId"
          JOIN "Organization" o ON o."id" = c."organizationId"
          WHERE sr."familyId" IS NOT NULL
            AND s."tenantId" IS NOT NULL
            AND s."tenantId" <> o."tenantId"
        ) AS survey_response_survey_tenant_mismatch,
        (
          SELECT COUNT(*)
          FROM (
            SELECT f."centerId", f."sourceSystem", f."externalId"
            FROM "Family" f
            WHERE f."sourceSystem" IS NOT NULL AND f."externalId" IS NOT NULL
            GROUP BY f."centerId", f."sourceSystem", f."externalId"
            HAVING COUNT(*) > 1
          ) duplicates
        ) AS duplicate_family_source_keys,
        (
          SELECT COUNT(*)
          FROM (
            SELECT f."centerId", g."sourceSystem", g."externalId"
            FROM "Guardian" g
            JOIN "Family" f ON f."id" = g."familyId"
            WHERE g."sourceSystem" IS NOT NULL AND g."externalId" IS NOT NULL
            GROUP BY f."centerId", g."sourceSystem", g."externalId"
            HAVING COUNT(*) > 1
          ) duplicates
        ) AS duplicate_guardian_source_keys,
        (
          SELECT COUNT(*)
          FROM (
            SELECT f."centerId", ch."sourceSystem", ch."externalId"
            FROM "Child" ch
            JOIN "Family" f ON f."id" = ch."familyId"
            WHERE ch."sourceSystem" IS NOT NULL AND ch."externalId" IS NOT NULL
            GROUP BY f."centerId", ch."sourceSystem", ch."externalId"
            HAVING COUNT(*) > 1
          ) duplicates
        ) AS duplicate_child_source_keys,
        (
          SELECT COUNT(*)
          FROM (
            SELECT i."billingAccountId", i."number"
            FROM "Invoice" i
            WHERE i."number" IS NOT NULL
            GROUP BY i."billingAccountId", i."number"
            HAVING COUNT(*) > 1
          ) duplicates
        ) AS duplicate_invoice_numbers_per_account
    `;

    if (!rows[0]) throw new Error("Integrity audit returned no result.");

    const [
      childClassroomMismatches,
      staffClassroomMismatches,
      grantUserTenantMismatches,
      grantCenterTenantMismatches,
      duplicateGuardianSources,
      duplicateChildSources,
      childClassroomCenterPairs,
      staffClassroomCenterPairs,
    ] = await Promise.all([
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          COALESCE(ch."enrollmentStatus", 'unknown') AS enrollment_status,
          COALESCE(ch."sourceSystem", 'manual') AS source_system,
          (family_org."tenantId" <> classroom_org."tenantId") AS tenant_mismatch,
          COUNT(*) AS count
        FROM "Child" ch
        JOIN "Family" f ON f."id" = ch."familyId"
        JOIN "Classroom" cl ON cl."id" = ch."classroomId"
        JOIN "Center" family_center ON family_center."id" = f."centerId"
        JOIN "Organization" family_org ON family_org."id" = family_center."organizationId"
        JOIN "Center" classroom_center ON classroom_center."id" = cl."centerId"
        JOIN "Organization" classroom_org ON classroom_org."id" = classroom_center."organizationId"
        WHERE ch."classroomId" IS NOT NULL
          AND f."centerId" IS NOT NULL
          AND cl."centerId" <> f."centerId"
        GROUP BY
          COALESCE(ch."enrollmentStatus", 'unknown'),
          COALESCE(ch."sourceSystem", 'manual'),
          (family_org."tenantId" <> classroom_org."tenantId")
        ORDER BY count DESC, enrollment_status, source_system, tenant_mismatch DESC
      `,
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          u."isActive" AS user_active,
          COALESCE(sp."sourceSystem", 'manual') AS source_system,
          (profile_org."tenantId" <> classroom_org."tenantId") AS tenant_mismatch,
          COUNT(*) AS count
        FROM "StaffProfile" sp
        JOIN "Classroom" cl ON cl."id" = sp."classroomId"
        JOIN "User" u ON u."id" = sp."userId"
        JOIN "Center" profile_center ON profile_center."id" = sp."centerId"
        JOIN "Organization" profile_org ON profile_org."id" = profile_center."organizationId"
        JOIN "Center" classroom_center ON classroom_center."id" = cl."centerId"
        JOIN "Organization" classroom_org ON classroom_org."id" = classroom_center."organizationId"
        WHERE sp."classroomId" IS NOT NULL AND cl."centerId" <> sp."centerId"
        GROUP BY
          u."isActive",
          COALESCE(sp."sourceSystem", 'manual'),
          (profile_org."tenantId" <> classroom_org."tenantId")
        ORDER BY count DESC, user_active DESC, source_system, tenant_mismatch DESC
      `,
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          u."role"::text AS role,
          u."isActive" AS user_active,
          g."isActive" AS grant_active,
          g."scopeType" AS scope_type,
          COUNT(*) AS count
        FROM "UserAccessGrant" g
        JOIN "User" u ON u."id" = g."userId"
        WHERE g."tenantId" <> u."tenantId"
        GROUP BY u."role", u."isActive", g."isActive", g."scopeType"
        ORDER BY count DESC, role, scope_type
      `,
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          u."role"::text AS role,
          u."isActive" AS user_active,
          g."isActive" AS grant_active,
          g."scopeType" AS scope_type,
          COUNT(*) AS count
        FROM "UserAccessGrant" g
        JOIN "User" u ON u."id" = g."userId"
        JOIN "Center" c ON c."id" = g."centerId"
        JOIN "Organization" o ON o."id" = c."organizationId"
        WHERE g."centerId" IS NOT NULL AND g."tenantId" <> o."tenantId"
        GROUP BY u."role", u."isActive", g."isActive", g."scopeType"
        ORDER BY count DESC, role, scope_type
      `,
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          COALESCE(duplicates.source_system, 'manual') AS source_system,
          COUNT(*) AS duplicate_groups,
          SUM(duplicates.record_count)::bigint AS records_in_groups
        FROM (
          SELECT
            g."sourceSystem" AS source_system,
            f."centerId",
            g."externalId",
            COUNT(*) AS record_count
          FROM "Guardian" g
          JOIN "Family" f ON f."id" = g."familyId"
          WHERE g."externalId" IS NOT NULL
          GROUP BY g."sourceSystem", f."centerId", g."externalId"
          HAVING COUNT(*) > 1
        ) duplicates
        GROUP BY COALESCE(duplicates.source_system, 'manual')
        ORDER BY duplicate_groups DESC, source_system
      `,
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          COALESCE(duplicates.source_system, 'manual') AS source_system,
          COUNT(*) AS duplicate_groups,
          SUM(duplicates.record_count)::bigint AS records_in_groups
        FROM (
          SELECT
            ch."sourceSystem" AS source_system,
            f."centerId",
            ch."externalId",
            COUNT(*) AS record_count
          FROM "Child" ch
          JOIN "Family" f ON f."id" = ch."familyId"
          WHERE ch."externalId" IS NOT NULL
          GROUP BY ch."sourceSystem", f."centerId", ch."externalId"
          HAVING COUNT(*) > 1
        ) duplicates
        GROUP BY COALESCE(duplicates.source_system, 'manual')
        ORDER BY duplicate_groups DESC, source_system
      `,
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          family_center."id" AS family_center_id,
          COALESCE(
            family_center."crmLocationId",
            NULLIF(CONCAT_WS(' | ', NULLIF(family_center."state", ''), NULLIF(family_center."city", '')), ''),
            family_center."name"
          ) AS family_location,
          classroom_center."id" AS classroom_center_id,
          COALESCE(
            classroom_center."crmLocationId",
            NULLIF(CONCAT_WS(' | ', NULLIF(classroom_center."state", ''), NULLIF(classroom_center."city", '')), ''),
            classroom_center."name"
          ) AS classroom_location,
          family_tenant."slug" AS tenant_slug,
          COUNT(*) AS count
        FROM "Child" ch
        JOIN "Family" f ON f."id" = ch."familyId"
        JOIN "Classroom" cl ON cl."id" = ch."classroomId"
        JOIN "Center" family_center ON family_center."id" = f."centerId"
        JOIN "Center" classroom_center ON classroom_center."id" = cl."centerId"
        JOIN "Organization" family_org ON family_org."id" = family_center."organizationId"
        JOIN "Tenant" family_tenant ON family_tenant."id" = family_org."tenantId"
        WHERE ch."classroomId" IS NOT NULL
          AND f."centerId" IS NOT NULL
          AND cl."centerId" <> f."centerId"
        GROUP BY
          family_center."id",
          COALESCE(
            family_center."crmLocationId",
            NULLIF(CONCAT_WS(' | ', NULLIF(family_center."state", ''), NULLIF(family_center."city", '')), ''),
            family_center."name"
          ),
          classroom_center."id",
          COALESCE(
            classroom_center."crmLocationId",
            NULLIF(CONCAT_WS(' | ', NULLIF(classroom_center."state", ''), NULLIF(classroom_center."city", '')), ''),
            classroom_center."name"
          ),
          family_tenant."slug"
        ORDER BY count DESC, family_location, classroom_location
      `,
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          profile_center."id" AS staff_center_id,
          COALESCE(
            profile_center."crmLocationId",
            NULLIF(CONCAT_WS(' | ', NULLIF(profile_center."state", ''), NULLIF(profile_center."city", '')), ''),
            profile_center."name"
          ) AS staff_location,
          classroom_center."id" AS classroom_center_id,
          COALESCE(
            classroom_center."crmLocationId",
            NULLIF(CONCAT_WS(' | ', NULLIF(classroom_center."state", ''), NULLIF(classroom_center."city", '')), ''),
            classroom_center."name"
          ) AS classroom_location,
          profile_tenant."slug" AS tenant_slug,
          COUNT(*) AS count
        FROM "StaffProfile" sp
        JOIN "Classroom" cl ON cl."id" = sp."classroomId"
        JOIN "Center" profile_center ON profile_center."id" = sp."centerId"
        JOIN "Center" classroom_center ON classroom_center."id" = cl."centerId"
        JOIN "Organization" profile_org ON profile_org."id" = profile_center."organizationId"
        JOIN "Tenant" profile_tenant ON profile_tenant."id" = profile_org."tenantId"
        WHERE sp."classroomId" IS NOT NULL AND cl."centerId" <> sp."centerId"
        GROUP BY
          profile_center."id",
          COALESCE(
            profile_center."crmLocationId",
            NULLIF(CONCAT_WS(' | ', NULLIF(profile_center."state", ''), NULLIF(profile_center."city", '')), ''),
            profile_center."name"
          ),
          classroom_center."id",
          COALESCE(
            classroom_center."crmLocationId",
            NULLIF(CONCAT_WS(' | ', NULLIF(classroom_center."state", ''), NULLIF(classroom_center."city", '')), ''),
            classroom_center."name"
          ),
          profile_tenant."slug"
        ORDER BY count DESC, staff_location, classroom_location
      `,
    ]);

    console.log(JSON.stringify({
      ok: true,
      mode: "read_only_counts",
      counts: numberCounts(rows[0]),
      summaries: jsonSafe({
        child_classroom_mismatches: childClassroomMismatches,
        staff_classroom_mismatches: staffClassroomMismatches,
        grant_user_tenant_mismatches: grantUserTenantMismatches,
        grant_center_tenant_mismatches: grantCenterTenantMismatches,
        duplicate_guardian_sources: duplicateGuardianSources,
        duplicate_child_sources: duplicateChildSources,
        child_classroom_center_pairs: childClassroomCenterPairs,
        staff_classroom_center_pairs: staffClassroomCenterPairs,
      }),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Integrity audit failed.");
  process.exitCode = 1;
});
