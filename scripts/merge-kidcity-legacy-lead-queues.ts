import "./load-env";
import {
  Prisma,
  type BrandCustomization,
  type Center,
  type Lead,
  type UserAccessGrant,
} from "@prisma/client";
import {
  KIDCITY_LEGACY_CENTER_ALIASES,
  type KidCityLegacyCenterAlias,
} from "@/lib/kidcity-legacy-center-aliases";
import { prisma } from "@/lib/prisma";

const TENANT_SLUG = "kid-city-usa";
const REPAIR_SOURCE = "kidcity_legacy_lead_queue_merge_2026_08_01";
const AUDIT_ACTION = "center.legacy_lead_queue_merged";

const CENTER_ID_TABLES = [
  "Announcement",
  "AuditLog",
  "BrandAsset",
  "BrandCustomization",
  "CalendarEvent",
  "CheckInOutLog",
  "ChildLiveLocation",
  "ChildLocationTransition",
  "Classroom",
  "ClientErrorReport",
  "ComplianceTask",
  "DataDeletionRequest",
  "EmergencyDrillLog",
  "Family",
  "FteReport",
  "Integration",
  "IntegrationCredential",
  "IntegrationDelivery",
  "Lead",
  "MessageTemplate",
  "ParentPortalSetupToken",
  "PaymentMethodRequestLink",
  "ProcareImportBatch",
  "RefundRequest",
  "Review",
  "StaffProfile",
  "StaffSchedule",
  "Survey",
  "SurveyResponse",
  "Tour",
  "TuitionPlan",
  "UserAccessGrant",
] as const;

const SPECIAL_TABLES = new Set<string>(["BrandCustomization", "UserAccessGrant"]);
const EXPECTED_CENTER_UNIQUE_INDEXES = new Set([
  "FteReport_centerId_weekStart_key",
  "Lead_centerId_externalId_key",
  "MessageTemplate_tenantId_centerId_name_key",
]);

type Database = Prisma.TransactionClient | typeof prisma;
type CenterRow = Center | null;

type MergePair = {
  alias: KidCityLegacyCenterAlias;
  source: NonNullable<CenterRow>;
  target: NonNullable<CenterRow>;
  sourceCustomizations: BrandCustomization[];
  targetCustomizations: BrandCustomization[];
  sourceGrants: UserAccessGrant[];
  targetGrants: UserAccessGrant[];
  relationCounts: Record<string, number>;
};

type MergePlan = {
  tenantId: string;
  pending: MergePair[];
  alreadyMerged: KidCityLegacyCenterAlias[];
  errors: string[];
  conflicts: {
    leadExternalIds: number;
    fteWeeks: number;
    messageTemplateNames: number;
  };
  leadConflicts: Array<{
    pair: MergePair;
    sourceLead: Lead;
    targetLead: Lead;
    differingFields: string[];
  }>;
  remainingQueues: Array<{ crmLocationId: string | null; leads: number }>;
};

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
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

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function equivalentGrantKey(grant: MergePair["sourceGrants"][number]) {
  return canonicalJson({
    userId: grant.userId,
    tenantId: grant.tenantId,
    brandId: grant.brandId,
    organizationId: grant.organizationId,
    ownerGroupId: grant.ownerGroupId,
    role: grant.role,
    scopeType: grant.scopeType,
    permissions: grant.permissions,
    isActive: grant.isActive,
    startsAt: grant.startsAt,
    endsAt: grant.endsAt,
  });
}

function differingLeadFields(source: Lead, target: Lead) {
  const ignored = new Set(["id", "centerId", "createdAt", "updatedAt"]);
  const sourceRecord = source as unknown as Record<string, unknown>;
  const targetRecord = target as unknown as Record<string, unknown>;
  return Array.from(new Set([...Object.keys(sourceRecord), ...Object.keys(targetRecord)]))
    .filter((key) => !ignored.has(key) && canonicalJson(sourceRecord[key]) !== canonicalJson(targetRecord[key]))
    .sort();
}

function centerSnapshot(center: NonNullable<CenterRow>) {
  return {
    id: center.id,
    organizationId: center.organizationId,
    ownerGroupId: center.ownerGroupId,
    name: center.name,
    crmLocationId: center.crmLocationId,
    locationId: center.locationId,
    address: center.address,
    city: center.city,
    state: center.state,
    postalCode: center.postalCode,
    phone: center.phone,
    email: center.email,
    status: center.status,
    sourceSystem: center.sourceSystem,
    externalId: center.externalId,
    customFields: center.customFields,
    licensedCapacity: center.licensedCapacity,
    timezone: center.timezone,
    createdAt: center.createdAt.toISOString(),
    updatedAt: center.updatedAt.toISOString(),
  };
}

async function assertCenterIdSchema(db: Database) {
  const columns = await db.$queryRaw<Array<{ tableName: string }>>(Prisma.sql`
    SELECT table_name AS "tableName"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'centerId'
    ORDER BY table_name
  `);
  const actual = columns.map((row) => row.tableName);
  const expected = [...CENTER_ID_TABLES].sort();
  invariant(
    canonicalJson(actual) === canonicalJson(expected),
    `Center reference schema changed. Expected ${expected.join(", ")}; found ${actual.join(", ")}.`,
  );

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
  const unexpectedIndexes = indexes.filter((row) => !EXPECTED_CENTER_UNIQUE_INDEXES.has(row.indexName));
  invariant(
    unexpectedIndexes.length === 0,
    `A new center-scoped unique index requires conflict handling: ${unexpectedIndexes.map((row) => row.indexName).join(", ")}`,
  );

  const leadReferences = await db.$queryRaw<Array<{ tableName: string; columnName: string }>>(Prisma.sql`
    SELECT child.relname AS "tableName", attribute.attname AS "columnName"
    FROM pg_constraint constraint_row
    JOIN pg_class child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = constraint_row.confrelid
    JOIN pg_attribute attribute ON attribute.attrelid = child.oid AND attribute.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f' AND parent.relname = 'Lead' AND namespace.nspname = 'public'
    ORDER BY child.relname, attribute.attname
  `);
  const expectedLeadReferences = [
    "Enrollment.leadId",
    "IntegrationDelivery.leadId",
    "Note.leadId",
    "Task.leadId",
    "Tour.leadId",
    "_LeadTags.A",
  ];
  const actualLeadReferences = leadReferences.map((row) => `${row.tableName}.${row.columnName}`);
  invariant(
    canonicalJson(actualLeadReferences) === canonicalJson(expectedLeadReferences),
    `Lead reference schema changed. Expected ${expectedLeadReferences.join(", ")}; found ${actualLeadReferences.join(", ")}.`,
  );
}

function mappingValues(pairs: MergePair[]) {
  return Prisma.join(
    pairs.map((pair) => Prisma.sql`(${pair.source.id}, ${pair.target.id})`),
  );
}

async function relationCountsForCenters(db: Database, centerIds: string[]) {
  const counts = new Map<string, Record<string, number>>(
    centerIds.map((centerId) => [centerId, {}]),
  );
  if (!centerIds.length) return counts;

  for (const table of CENTER_ID_TABLES) {
    const rows = await db.$queryRaw<Array<{ centerId: string; rowCount: bigint }>>(Prisma.sql`
      SELECT "centerId", COUNT(*)::bigint AS "rowCount"
      FROM ${quotedIdentifier(table)}
      WHERE "centerId" IN (${Prisma.join(centerIds)})
      GROUP BY "centerId"
    `);
    for (const row of rows) counts.get(row.centerId)![table] = Number(row.rowCount);
  }

  return counts;
}

async function conflictCounts(db: Database, pairs: MergePair[]) {
  if (!pairs.length) return { leadExternalIds: 0, fteWeeks: 0, messageTemplateNames: 0 };
  const values = mappingValues(pairs);
  const [leadRows, fteRows, templateRows] = await Promise.all([
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (VALUES ${values}) AS mapping(source_id, target_id)
      JOIN "Lead" source ON source."centerId" = mapping.source_id AND source."externalId" IS NOT NULL
      JOIN "Lead" target ON target."centerId" = mapping.target_id AND target."externalId" = source."externalId"
    `),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (VALUES ${values}) AS mapping(source_id, target_id)
      JOIN "FteReport" source ON source."centerId" = mapping.source_id
      JOIN "FteReport" target ON target."centerId" = mapping.target_id AND target."weekStart" = source."weekStart"
    `),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (VALUES ${values}) AS mapping(source_id, target_id)
      JOIN "MessageTemplate" source ON source."centerId" = mapping.source_id
      JOIN "MessageTemplate" target ON target."centerId" = mapping.target_id
        AND target."tenantId" = source."tenantId" AND target.name = source.name
    `),
  ]);
  return {
    leadExternalIds: Number(leadRows[0]?.count ?? 0),
    fteWeeks: Number(fteRows[0]?.count ?? 0),
    messageTemplateNames: Number(templateRows[0]?.count ?? 0),
  };
}

async function leadConflictDetails(db: Database, pairs: MergePair[]) {
  if (!pairs.length) return [];
  const sourcePairByCenterId = new Map(pairs.map((pair) => [pair.source.id, pair]));
  const sourceCenterIds = pairs.map((pair) => pair.source.id);
  const targetCenterIds = pairs.map((pair) => pair.target.id);
  const [sourceLeads, targetLeads] = await Promise.all([
    db.lead.findMany({ where: { centerId: { in: sourceCenterIds }, externalId: { not: null } } }),
    db.lead.findMany({ where: { centerId: { in: targetCenterIds }, externalId: { not: null } } }),
  ]);
  const targetByCenterAndExternalId = new Map(
    targetLeads
      .filter((lead): lead is Lead & { externalId: string } => Boolean(lead.externalId))
      .map((lead) => [`${lead.centerId}\u0000${lead.externalId}`, lead]),
  );

  return sourceLeads.flatMap((sourceLead) => {
    const pair = sourcePairByCenterId.get(sourceLead.centerId);
    if (!pair || !sourceLead.externalId) return [];
    const targetLead = targetByCenterAndExternalId.get(`${pair.target.id}\u0000${sourceLead.externalId}`);
    return targetLead ? [{ pair, sourceLead, targetLead, differingFields: differingLeadFields(sourceLead, targetLead) }] : [];
  });
}

async function readPlan(db: Database): Promise<MergePlan> {
  await assertCenterIdSchema(db);
  const tenant = await db.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true } });
  invariant(tenant, `Tenant ${TENANT_SLUG} was not found.`);

  const identifiers = Array.from(new Set(KIDCITY_LEGACY_CENTER_ALIASES.flatMap((alias) => [
    alias.sourceCrmLocationId,
    alias.targetCrmLocationId,
  ])));
  const centers = await db.center.findMany({
    where: {
      organization: { tenantId: tenant.id },
      crmLocationId: { in: identifiers },
    },
  });
  const centersByCrmId = Map.groupBy(centers, (center) => center.crmLocationId ?? "");
  const errors: string[] = [];
  const pendingBase: Array<{ alias: KidCityLegacyCenterAlias; source: NonNullable<CenterRow>; target: NonNullable<CenterRow> }> = [];
  const alreadyMerged: KidCityLegacyCenterAlias[] = [];

  for (const alias of KIDCITY_LEGACY_CENTER_ALIASES) {
    const sources = centersByCrmId.get(alias.sourceCrmLocationId) ?? [];
    const targets = centersByCrmId.get(alias.targetCrmLocationId) ?? [];
    if (targets.length !== 1) {
      errors.push(`${alias.targetCrmLocationId}: expected one canonical center, found ${targets.length}`);
      continue;
    }
    const target = targets[0];
    if (target.status !== alias.targetStatus) {
      errors.push(`${alias.targetCrmLocationId}: expected status ${alias.targetStatus}, found ${target.status}`);
      continue;
    }
    if (sources.length === 0) {
      const audit = await db.auditLog.findFirst({
        where: { action: AUDIT_ACTION, resource: "Center", resourceId: { not: null }, centerId: target.id },
        select: { metadata: true },
        orderBy: { createdAt: "desc" },
      });
      const sourceCrmLocationId = jsonObject(audit?.metadata).sourceCrmLocationId;
      if (sourceCrmLocationId === alias.sourceCrmLocationId) alreadyMerged.push(alias);
      else errors.push(`${alias.sourceCrmLocationId}: source is missing without matching merge audit evidence`);
      continue;
    }
    if (sources.length !== 1) {
      errors.push(`${alias.sourceCrmLocationId}: expected one legacy queue, found ${sources.length}`);
      continue;
    }
    const source = sources[0];
    if (source.status !== "lead_queue" || source.sourceSystem !== "kidcity_legacy_crm") {
      errors.push(`${alias.sourceCrmLocationId}: expected kidcity_legacy_crm lead_queue, found ${source.sourceSystem}/${source.status}`);
      continue;
    }
    if (source.organizationId !== target.organizationId) {
      errors.push(`${alias.sourceCrmLocationId}: source and target belong to different organizations`);
      continue;
    }
    if (source.ownerGroupId && target.ownerGroupId && source.ownerGroupId !== target.ownerGroupId) {
      errors.push(`${alias.sourceCrmLocationId}: source and target have conflicting owner groups`);
      continue;
    }
    const customFieldKeys = Object.keys(jsonObject(source.customFields));
    const protectedKeys = customFieldKeys.filter((key) => /stripe|billing|tuition|payout|bank|payment/i.test(key));
    if (protectedKeys.length) {
      errors.push(`${alias.sourceCrmLocationId}: legacy queue has protected configuration fields: ${protectedKeys.join(", ")}`);
      continue;
    }
    pendingBase.push({ alias, source, target });
  }

  const sourceIds = pendingBase.map((pair) => pair.source.id);
  const targetIds = pendingBase.map((pair) => pair.target.id);
  const allPairIds = Array.from(new Set([...sourceIds, ...targetIds]));
  const [customizations, grants, counts, remainingQueues] = await Promise.all([
    db.brandCustomization.findMany({ where: { centerId: { in: allPairIds } }, orderBy: { createdAt: "asc" } }),
    db.userAccessGrant.findMany({ where: { centerId: { in: allPairIds } }, orderBy: { createdAt: "asc" } }),
    relationCountsForCenters(db, sourceIds),
    db.center.findMany({
      where: { organization: { tenantId: tenant.id }, status: "lead_queue" },
      select: { id: true, crmLocationId: true, _count: { select: { leads: true } } },
      orderBy: { crmLocationId: "asc" },
    }),
  ]);

  const pending: MergePair[] = pendingBase.map((pair) => ({
    ...pair,
    sourceCustomizations: customizations.filter((row) => row.centerId === pair.source.id),
    targetCustomizations: customizations.filter((row) => row.centerId === pair.target.id),
    sourceGrants: grants.filter((row) => row.centerId === pair.source.id),
    targetGrants: grants.filter((row) => row.centerId === pair.target.id),
    relationCounts: counts.get(pair.source.id) ?? {},
  }));
  for (const pair of pending) {
    if (pair.sourceCustomizations.length > 1) errors.push(`${pair.alias.sourceCrmLocationId}: multiple source customizations require manual review`);
    if (pair.targetCustomizations.length > 1) errors.push(`${pair.alias.targetCrmLocationId}: multiple target customizations require manual review`);
  }

  const [conflicts, leadConflicts] = await Promise.all([
    conflictCounts(db, pending),
    leadConflictDetails(db, pending),
  ]);
  if (leadConflicts.length !== conflicts.leadExternalIds) {
    errors.push(`Lead conflict audit mismatch: counted ${conflicts.leadExternalIds}, inspected ${leadConflicts.length}`);
  }
  return {
    tenantId: tenant.id,
    pending,
    alreadyMerged,
    errors,
    conflicts,
    leadConflicts,
    remainingQueues: remainingQueues.map((center) => ({ crmLocationId: center.crmLocationId, leads: center._count.leads })),
  };
}

function assertPlan(plan: MergePlan) {
  invariant(plan.errors.length === 0, `Merge plan failed closed:\n- ${plan.errors.join("\n- ")}`);
  const unsafeLeadConflicts = plan.leadConflicts.filter((conflict) =>
    conflict.differingFields.some((field) => field !== "customFields" && field !== "phone"),
  );
  invariant(
    unsafeLeadConflicts.length === 0,
    `Lead ID conflicts differ in protected fields: ${unsafeLeadConflicts.map((conflict) => `${conflict.pair.alias.sourceCrmLocationId} (${conflict.differingFields.join(", ")})`).join("; ")}`,
  );
  invariant(plan.conflicts.fteWeeks === 0, `FTE week conflicts: ${plan.conflicts.fteWeeks}`);
  invariant(plan.conflicts.messageTemplateNames === 0, `Message template conflicts: ${plan.conflicts.messageTemplateNames}`);
}

function planSummary(plan: MergePlan) {
  const pendingSources = new Set(plan.pending.map((pair) => pair.alias.sourceCrmLocationId));
  return {
    ok: plan.errors.length === 0
      && plan.conflicts.fteWeeks === 0
      && plan.conflicts.messageTemplateNames === 0
      && plan.leadConflicts.every((conflict) => conflict.differingFields.every((field) => field === "customFields" || field === "phone")),
    pendingMerges: plan.pending.map((pair) => ({
      from: pair.alias.sourceCrmLocationId,
      into: pair.alias.targetCrmLocationId,
      canonicalStatus: pair.target.status,
      evidence: pair.alias.evidence,
      rows: pair.relationCounts,
    })),
    pendingMergeCount: plan.pending.length,
    alreadyMergedCount: plan.alreadyMerged.length,
    conflicts: {
      ...plan.conflicts,
      leadRecordsSafeToConsolidate: plan.leadConflicts.length,
      leadConflictFields: Array.from(new Set(plan.leadConflicts.flatMap((conflict) => conflict.differingFields))).sort(),
    },
    heldQueues: plan.remainingQueues.filter((queue) => !pendingSources.has(queue.crmLocationId ?? "")),
    errors: plan.errors,
    messagesOrInvitesSent: 0,
    billingOrPaymentRecordsChanged: 0,
    stripeOrPayoutRecordsChanged: 0,
    supabaseAuthRecordsChanged: 0,
  };
}

async function moveGenericTableRows(db: Prisma.TransactionClient, table: typeof CENTER_ID_TABLES[number], pairs: MergePair[]) {
  if (!pairs.length) return 0;
  return db.$executeRaw(Prisma.sql`
    UPDATE ${quotedIdentifier(table)} AS record
    SET "centerId" = mapping.target_id
    FROM (VALUES ${mappingValues(pairs)}) AS mapping(source_id, target_id)
    WHERE record."centerId" = mapping.source_id
  `);
}

async function consolidateLeadConflict(
  tx: Prisma.TransactionClient,
  conflict: MergePlan["leadConflicts"][number],
  mergedAt: string,
) {
  const targetFields = jsonObject(conflict.targetLead.customFields);
  const existingMerges = Array.isArray(targetFields.legacyCenterLeadMerges)
    ? targetFields.legacyCenterLeadMerges
    : [];
  await tx.lead.update({
    where: { id: conflict.targetLead.id },
    data: {
      phone: conflict.targetLead.phone || conflict.sourceLead.phone,
      customFields: jsonSafe({
        ...targetFields,
        legacyCenterLeadMerges: [
          ...existingMerges,
          {
            mergedAt,
            sourceLeadId: conflict.sourceLead.id,
            sourceCenterId: conflict.sourceLead.centerId,
            sourceCrmLocationId: conflict.pair.alias.sourceCrmLocationId,
            sourceCustomFields: conflict.sourceLead.customFields,
            alternatePhone: conflict.sourceLead.phone && conflict.sourceLead.phone !== conflict.targetLead.phone
              ? conflict.sourceLead.phone
              : null,
          },
        ],
      }),
    },
  });

  const dependencyCounts = await Promise.all([
    tx.enrollment.updateMany({ where: { leadId: conflict.sourceLead.id }, data: { leadId: conflict.targetLead.id } }),
    tx.integrationDelivery.updateMany({ where: { leadId: conflict.sourceLead.id }, data: { leadId: conflict.targetLead.id } }),
    tx.note.updateMany({ where: { leadId: conflict.sourceLead.id }, data: { leadId: conflict.targetLead.id } }),
    tx.task.updateMany({ where: { leadId: conflict.sourceLead.id }, data: { leadId: conflict.targetLead.id } }),
    tx.tour.updateMany({ where: { leadId: conflict.sourceLead.id }, data: { leadId: conflict.targetLead.id } }),
  ]);
  const tagsCopied = await tx.$executeRaw(Prisma.sql`
    INSERT INTO "_LeadTags" ("A", "B")
    SELECT ${conflict.targetLead.id}, "B"
    FROM "_LeadTags"
    WHERE "A" = ${conflict.sourceLead.id}
    ON CONFLICT DO NOTHING
  `);
  await tx.lead.delete({ where: { id: conflict.sourceLead.id } });

  return {
    dependenciesMoved: dependencyCounts.reduce((sum, count) => sum + count.count, 0),
    tagsCopied,
  };
}

async function applyPlan(plan: MergePlan) {
  const before = await Promise.all([
    prisma.lead.count(),
    prisma.integrationDelivery.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
  ]);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${REPAIR_SOURCE}))`);
    if (plan.pending.length) {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM "Center"
        WHERE id IN (${Prisma.join(plan.pending.flatMap((pair) => [pair.source.id, pair.target.id]))})
        FOR UPDATE
      `);
    }
    const current = await readPlan(tx);
    assertPlan(current);
    invariant(
      canonicalJson(current.pending.map((pair) => pair.alias.sourceCrmLocationId))
        === canonicalJson(plan.pending.map((pair) => pair.alias.sourceCrmLocationId)),
      "The pending merge set changed after the dry-run audit.",
    );

    const movedCountsByPair = new Map(current.pending.map((pair) => [
      pair.source.id,
      {
        ...pair.relationCounts,
        BrandCustomizationMoved: 0,
        BrandCustomizationConsolidated: 0,
        UserAccessGrantMoved: 0,
        UserAccessGrantConsolidated: 0,
        LeadConsolidated: 0,
        LeadDependenciesMoved: 0,
        LeadTagsCopied: 0,
      },
    ]));
    const mergedAt = new Date().toISOString();

    for (const pair of current.pending) {
      if (!pair.target.ownerGroupId && pair.source.ownerGroupId) {
        await tx.center.update({ where: { id: pair.target.id }, data: { ownerGroupId: pair.source.ownerGroupId } });
      }

      const sourceCustomization = pair.sourceCustomizations[0];
      const targetCustomization = pair.targetCustomizations[0];
      if (sourceCustomization && !targetCustomization) {
        await tx.brandCustomization.update({ where: { id: sourceCustomization.id }, data: { centerId: pair.target.id } });
        movedCountsByPair.get(pair.source.id)!.BrandCustomizationMoved += 1;
      } else if (sourceCustomization && targetCustomization) {
        await tx.brandCustomization.delete({ where: { id: sourceCustomization.id } });
        movedCountsByPair.get(pair.source.id)!.BrandCustomizationConsolidated += 1;
      }

      const targetGrantKeys = new Set(pair.targetGrants.map(equivalentGrantKey));
      for (const grant of pair.sourceGrants) {
        if (targetGrantKeys.has(equivalentGrantKey(grant))) {
          await tx.userAccessGrant.delete({ where: { id: grant.id } });
          movedCountsByPair.get(pair.source.id)!.UserAccessGrantConsolidated += 1;
        } else {
          await tx.userAccessGrant.update({ where: { id: grant.id }, data: { centerId: pair.target.id } });
          movedCountsByPair.get(pair.source.id)!.UserAccessGrantMoved += 1;
        }
      }
    }

    for (const conflict of current.leadConflicts) {
      const consolidation = await consolidateLeadConflict(tx, conflict, mergedAt);
      const counts = movedCountsByPair.get(conflict.pair.source.id)!;
      counts.LeadConsolidated += 1;
      counts.LeadDependenciesMoved += consolidation.dependenciesMoved;
      counts.LeadTagsCopied += consolidation.tagsCopied;
    }

    const genericTables = CENTER_ID_TABLES.filter((table) => !SPECIAL_TABLES.has(table));
    const genericMoves: Record<string, number> = {};
    for (const table of genericTables) genericMoves[table] = await moveGenericTableRows(tx, table, current.pending);

    for (const pair of current.pending) {
      await tx.auditLog.create({
        data: {
          tenantId: current.tenantId,
          centerId: pair.target.id,
          action: AUDIT_ACTION,
          resource: "Center",
          resourceId: pair.source.id,
          metadata: jsonSafe({
            repairSource: REPAIR_SOURCE,
            mergedAt,
            sourceCrmLocationId: pair.alias.sourceCrmLocationId,
            targetCrmLocationId: pair.alias.targetCrmLocationId,
            evidence: pair.alias.evidence,
            sourceCenterSnapshot: centerSnapshot(pair.source),
            sourceCustomizationSnapshots: pair.sourceCustomizations.map((row) => ({
              ...row,
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
            })),
            movedCounts: movedCountsByPair.get(pair.source.id),
            messagesOrInvitesSent: 0,
            billingOrPaymentRecordsChanged: 0,
            stripeOrPayoutRecordsChanged: 0,
            supabaseAuthRecordsChanged: 0,
          }),
        },
      });
    }

    const deleted = await tx.center.deleteMany({ where: { id: { in: current.pending.map((pair) => pair.source.id) } } });
    invariant(deleted.count === current.pending.length, `Expected to delete ${current.pending.length} merged queue centers; deleted ${deleted.count}.`);

    const sourceIds = current.pending.map((pair) => pair.source.id);
    for (const table of CENTER_ID_TABLES) {
      const remaining = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM ${quotedIdentifier(table)}
        WHERE "centerId" IN (${Prisma.join(sourceIds)})
      `);
      invariant(Number(remaining[0]?.count ?? 0) === 0, `${table} still references a deleted legacy queue center.`);
    }

    return {
      appliedMerges: current.pending.length,
      consolidatedLeadCount: current.leadConflicts.length,
      genericMoves,
      movedCountsByPair: Object.fromEntries(current.pending.map((pair) => [
        pair.alias.sourceCrmLocationId,
        movedCountsByPair.get(pair.source.id),
      ])),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 120_000 });

  const after = await Promise.all([
    prisma.lead.count(),
    prisma.integrationDelivery.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
  ]);
  invariant(before[0] - result.consolidatedLeadCount === after[0], `Lead count changed from ${before[0]} to ${after[0]} after consolidating ${result.consolidatedLeadCount} duplicate lead rows.`);
  invariant(before[1] === after[1], `Integration delivery count changed from ${before[1]} to ${after[1]}.`);
  invariant(before[2] === after[2], `Invoice count changed from ${before[2]} to ${after[2]}.`);
  invariant(before[3] === after[3], `Payment count changed from ${before[3]} to ${after[3]}.`);

  const verification = await readPlan(prisma);
  assertPlan(verification);
  invariant(verification.pending.length === 0, `${verification.pending.length} proven duplicate queues remain after apply.`);
  invariant(
    verification.alreadyMerged.length === KIDCITY_LEGACY_CENTER_ALIASES.length,
    `Expected ${KIDCITY_LEGACY_CENTER_ALIASES.length} merge audits; found ${verification.alreadyMerged.length}.`,
  );
  return { result, verification: planSummary(verification) };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-kidcity-center-merge");
  const plan = await readPlan(prisma);
  assertPlan(plan);

  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, ...planSummary(plan) }, null, 2));
    return;
  }
  invariant(confirmed, "Apply mode requires --confirm-kidcity-center-merge.");
  invariant(plan.pending.length > 0, "No proven duplicate lead queues are pending merge.");

  const applied = await applyPlan(plan);
  console.log(JSON.stringify({ applied: true, ...applied }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
