import "./load-env";

import { Prisma, type Center } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locationAliasesFromCustomFields } from "@/lib/school-location-identifiers";

const SOURCE_CENTER_ID = "cmp4ewf3l00426alwy8zbfc9i";
const TARGET_CENTER_ID = "cmp4ewkfu006a6alwld3k89qd";
const EXPECTED_ADDRESS = "2699 st route 261";
const REPAIR_SOURCE = "paradise_duplicate_school_merge_2026_08_02";
const AUDIT_ACTION = "center.duplicate_school_merged";

const CENTER_ID_TABLES = [
  "Announcement", "AuditLog", "BrandAsset", "BrandCustomization", "CalendarEvent",
  "CheckInOutLog", "ChildLiveLocation", "ChildLocationTransition", "Classroom",
  "ClientErrorReport", "ComplianceTask", "DataDeletionRequest", "EmergencyDrillLog",
  "Family", "FteReport", "Integration", "IntegrationCredential", "IntegrationDelivery",
  "Lead", "MessageTemplate", "ParentPortalSetupToken", "PaymentMethodRequestLink",
  "ProcareImportBatch", "RefundRequest", "Review", "StaffProfile", "StaffSchedule",
  "Survey", "SurveyResponse", "Tour", "TuitionPlan", "UserAccessGrant",
] as const;
const SPECIAL_TABLES = new Set<string>(["BrandCustomization", "UserAccessGrant"]);
const EXPECTED_CENTER_UNIQUE_INDEXES = new Set([
  "FteReport_centerId_weekStart_key",
  "Lead_centerId_externalId_key",
  "MessageTemplate_tenantId_centerId_name_key",
]);

type Database = Prisma.TransactionClient | typeof prisma;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function quotedIdentifier(value: string) {
  invariant(CENTER_ID_TABLES.includes(value as typeof CENTER_ID_TABLES[number]), `Unexpected table identifier: ${value}`);
  return Prisma.raw(`"${value.replaceAll('"', '""')}"`);
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function centerSnapshot(center: Center) {
  return {
    ...center,
    createdAt: center.createdAt.toISOString(),
    updatedAt: center.updatedAt.toISOString(),
  };
}

async function assertCenterSchema(db: Database) {
  const columns = await db.$queryRaw<Array<{ tableName: string }>>(Prisma.sql`
    SELECT table_name AS "tableName"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'centerId'
    ORDER BY table_name
  `);
  const actual = columns.map((row) => row.tableName);
  const expected = [...CENTER_ID_TABLES].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `Center reference schema changed: ${actual.join(", ")}`);

  const indexes = await db.$queryRaw<Array<{ indexName: string }>>(Prisma.sql`
    SELECT i.relname AS "indexName"
    FROM pg_index ix
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE ns.nspname = 'public'
      AND ix.indisunique
      AND pg_get_indexdef(ix.indexrelid) ILIKE '%"centerId"%'
    ORDER BY i.relname
  `);
  const unexpected = indexes.filter((row) => !EXPECTED_CENTER_UNIQUE_INDEXES.has(row.indexName));
  invariant(unexpected.length === 0, `New center-scoped unique indexes need explicit conflict handling: ${unexpected.map((row) => row.indexName).join(", ")}`);
}

async function relationCounts(db: Database, centerId: string) {
  const result: Record<string, number> = {};
  for (const table of CENTER_ID_TABLES) {
    const rows = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM ${quotedIdentifier(table)} WHERE "centerId" = ${centerId}
    `);
    const count = Number(rows[0]?.count ?? 0);
    if (count) result[table] = count;
  }
  return result;
}

async function readPlan(db: Database) {
  await assertCenterSchema(db);
  const [source, target] = await Promise.all([
    db.center.findUnique({ where: { id: SOURCE_CENTER_ID } }),
    db.center.findUnique({ where: { id: TARGET_CENTER_ID } }),
  ]);
  invariant(target, "The active Paradise target center was not found.");
  if (!source) {
    const audit = await db.auditLog.findFirst({
      where: { centerId: target.id, action: AUDIT_ACTION, resourceId: SOURCE_CENTER_ID },
      select: { id: true },
    });
    invariant(audit, "The archived Paradise source is missing without matching merge audit evidence.");
    return { source: null, target, alreadyMerged: true, counts: {}, sourceCustomization: null, targetCustomization: null, sourceGrants: [] };
  }

  invariant(source.status === "archived", `Expected archived Paradise source; found ${source.status}.`);
  invariant(target.status === "active", `Expected active Paradise target; found ${target.status}.`);
  invariant(normalize(source.address) === EXPECTED_ADDRESS && normalize(target.address) === EXPECTED_ADDRESS, "Paradise address evidence changed.");
  invariant(normalize(source.name) === normalize(target.name), "Paradise school names no longer match.");
  invariant(source.organizationId === target.organizationId, "Paradise profiles belong to different organizations.");
  const protectedSourceFields = Object.keys(jsonObject(source.customFields)).filter((key) => /stripe|billing|tuition|payout|bank|payment/i.test(key));
  invariant(protectedSourceFields.length === 0, `Archived Paradise contains protected settings: ${protectedSourceFields.join(", ")}`);

  const [counts, customizations, sourceGrants, leadConflicts, fteConflicts, templateConflicts] = await Promise.all([
    relationCounts(db, source.id),
    db.brandCustomization.findMany({ where: { centerId: { in: [source.id, target.id] } }, orderBy: { createdAt: "asc" } }),
    db.userAccessGrant.findMany({ where: { centerId: source.id }, orderBy: { createdAt: "asc" } }),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "Lead" source
      JOIN "Lead" target ON target."centerId" = ${target.id} AND target."externalId" = source."externalId"
      WHERE source."centerId" = ${source.id} AND source."externalId" IS NOT NULL
    `),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "FteReport" source
      JOIN "FteReport" target ON target."centerId" = ${target.id} AND target."weekStart" = source."weekStart"
      WHERE source."centerId" = ${source.id}
    `),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "MessageTemplate" source
      JOIN "MessageTemplate" target ON target."centerId" = ${target.id}
        AND target."tenantId" = source."tenantId" AND target.name = source.name
      WHERE source."centerId" = ${source.id}
    `),
  ]);
  invariant(customizations.filter((row) => row.centerId === source.id).length === 1, "Expected one archived Paradise customization.");
  invariant(customizations.filter((row) => row.centerId === target.id).length === 1, "Expected one active Paradise customization.");
  invariant(sourceGrants.every((grant) => !grant.isActive), "Archived Paradise unexpectedly has an active access grant.");
  invariant(Number(leadConflicts[0]?.count ?? 0) === 0, "Paradise lead external IDs conflict.");
  invariant(Number(fteConflicts[0]?.count ?? 0) === 0, "Paradise FTE weeks conflict.");
  invariant(Number(templateConflicts[0]?.count ?? 0) === 0, "Paradise message templates conflict.");

  return {
    source,
    target,
    alreadyMerged: false,
    counts,
    sourceCustomization: customizations.find((row) => row.centerId === source.id)!,
    targetCustomization: customizations.find((row) => row.centerId === target.id)!,
    sourceGrants,
  };
}

function planSummary(plan: Awaited<ReturnType<typeof readPlan>>) {
  return {
    alreadyMerged: plan.alreadyMerged,
    pendingMerge: plan.source ? {
      sourceCenterId: plan.source.id,
      sourceLocationId: plan.source.crmLocationId,
      targetCenterId: plan.target.id,
      targetLocationId: plan.target.crmLocationId,
      address: plan.target.address,
      rowsToMove: plan.counts,
    } : null,
    billingOrPaymentRecordsChanged: 0,
    messagesOrInvitationsSent: 0,
    supabaseAuthRecordsChanged: 0,
  };
}

async function moveTableRows(tx: Prisma.TransactionClient, table: typeof CENTER_ID_TABLES[number]) {
  return tx.$executeRaw(Prisma.sql`
    UPDATE ${quotedIdentifier(table)} SET "centerId" = ${TARGET_CENTER_ID} WHERE "centerId" = ${SOURCE_CENTER_ID}
  `);
}

async function applyPlan(expected: Awaited<ReturnType<typeof readPlan>>) {
  invariant(expected.source, "No Paradise duplicate center is pending merge.");
  const before = await Promise.all([
    prisma.center.count(), prisma.lead.count(), prisma.integrationDelivery.count(),
    prisma.invoice.count(), prisma.payment.count(), prisma.user.count(),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${REPAIR_SOURCE}))`);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Center" WHERE id IN (${SOURCE_CENTER_ID}, ${TARGET_CENTER_ID}) FOR UPDATE`);
    const current = await readPlan(tx);
    invariant(current.source && !current.alreadyMerged, "Paradise merge state changed after the dry run.");
    const mergedAt = new Date().toISOString();
    const sourceFields = jsonObject(current.source.customFields);
    const targetFields = jsonObject(current.target.customFields);
    const locationAliases = Array.from(new Set([
      ...locationAliasesFromCustomFields(current.target.customFields),
      ...locationAliasesFromCustomFields(current.source.customFields),
      current.source.crmLocationId,
      current.source.locationId,
    ].filter((value): value is string => Boolean(value))));

    await tx.center.update({
      where: { id: current.target.id },
      data: {
        customFields: jsonSafe({
          ...sourceFields,
          ...targetFields,
          locationAliases,
          duplicateSchoolMerges: [
            ...(Array.isArray(targetFields.duplicateSchoolMerges) ? targetFields.duplicateSchoolMerges : []),
            { sourceCenterId: current.source.id, sourceCrmLocationId: current.source.crmLocationId, mergedAt },
          ],
        }),
      },
    });

    await tx.brandCustomization.delete({ where: { id: current.sourceCustomization!.id } });
    for (const grant of current.sourceGrants) {
      await tx.userAccessGrant.update({ where: { id: grant.id }, data: { centerId: current.target.id } });
    }
    for (const table of CENTER_ID_TABLES.filter((item) => !SPECIAL_TABLES.has(item))) {
      await moveTableRows(tx, table);
    }

    await tx.auditLog.create({
      data: {
        tenantId: current.targetCustomization!.tenantId,
        centerId: current.target.id,
        action: AUDIT_ACTION,
        resource: "Center",
        resourceId: current.source.id,
        metadata: jsonSafe({
          repairSource: REPAIR_SOURCE,
          mergedAt,
          sourceCenterSnapshot: centerSnapshot(current.source),
          sourceCustomizationSnapshot: current.sourceCustomization,
          movedCounts: current.counts,
          targetCenterId: current.target.id,
          billingOrPaymentRecordsChanged: 0,
          messagesOrInvitationsSent: 0,
          supabaseAuthRecordsChanged: 0,
        }),
      },
    });
    await tx.center.delete({ where: { id: current.source.id } });

    for (const table of CENTER_ID_TABLES) {
      const rows = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM ${quotedIdentifier(table)} WHERE "centerId" = ${SOURCE_CENTER_ID}
      `);
      invariant(Number(rows[0]?.count ?? 0) === 0, `${table} still references the archived Paradise center.`);
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 120_000 });

  const after = await Promise.all([
    prisma.center.count(), prisma.lead.count(), prisma.integrationDelivery.count(),
    prisma.invoice.count(), prisma.payment.count(), prisma.user.count(),
  ]);
  invariant(before[0] - 1 === after[0], `Center count changed unexpectedly: ${before[0]} -> ${after[0]}`);
  invariant(JSON.stringify(before.slice(1)) === JSON.stringify(after.slice(1)), `Protected counts changed: before=${before.join(",")} after=${after.join(",")}`);
  const verification = await readPlan(prisma);
  invariant(verification.alreadyMerged, "Paradise merge verification failed.");
  return verification;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-paradise-center-merge");
  const plan = await readPlan(prisma);
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, ...planSummary(plan) }, null, 2));
    return;
  }
  invariant(confirmed, "Apply mode requires --confirm-paradise-center-merge.");
  const verification = await applyPlan(plan);
  console.log(JSON.stringify({ applied: true, ...planSummary(verification) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
