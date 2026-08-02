import "./load-env";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canonicalSchoolLocationId,
  cleanLocationIdentifier,
  locationAliasesFromCustomFields,
  normalizeLocationIdentifier,
} from "@/lib/school-location-identifiers";

const OPERATIONAL_TENANT_SLUGS = ["kid-city-usa", "miss-honeys-learning-center"];
const SCHOOL_STATUSES = ["active", "archived", "closed", "trial_setup"];
const REPAIR_SOURCE = "canonical_brand_school_location_ids_2026_08_02";
const AUDIT_ACTION = "center.location_identifiers_canonicalized";

type Database = Prisma.TransactionClient | typeof prisma;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function readPlan(db: Database) {
  const centers = await db.center.findMany({
    where: {
      status: { in: SCHOOL_STATUSES },
      organization: { tenant: { slug: { in: OPERATIONAL_TENANT_SLUGS } } },
      NOT: [{ crmLocationId: "UNASSIGNED" }, { locationId: "UNASSIGNED" }],
    },
    orderBy: [
      { organization: { tenant: { slug: "asc" } } },
      { crmLocationId: "asc" },
      { name: "asc" },
    ],
    include: {
      organization: {
        select: {
          tenantId: true,
          tenant: { select: { slug: true } },
          brand: { select: { name: true, slug: true } },
        },
      },
    },
  });

  const rows = centers.map((center) => {
    const canonicalId = canonicalSchoolLocationId({
      brandName: center.organization.brand?.name,
      brandSlug: center.organization.brand?.slug,
      crmLocationId: center.crmLocationId,
    });
    const aliases = Array.from(new Set([
      ...locationAliasesFromCustomFields(center.customFields),
      cleanLocationIdentifier(center.crmLocationId),
      cleanLocationIdentifier(center.locationId),
    ].filter((value) => value && value !== canonicalId)));
    return { center, canonicalId, aliases };
  });
  const held = rows.filter((row) => !row.canonicalId);
  const unexpectedHeld = held.filter((row) => !(
    row.center.organization.tenant.slug === "miss-honeys-learning-center"
    && normalizeLocationIdentifier(row.center.name).includes("cuzco")
  ));
  invariant(
    unexpectedHeld.length === 0,
    `Unexpected schools lack a valid ST | City identifier: ${unexpectedHeld.map((row) => row.center.name).join(", ")}`,
  );

  const groups = Map.groupBy(rows.filter((row) => row.canonicalId), (row) => normalizeLocationIdentifier(row.canonicalId));
  const collisions = Array.from(groups.values()).filter((group) => group.length > 1);
  invariant(
    collisions.length === 0,
    `Canonical location ID collisions: ${collisions.map((group) => `${group[0].canonicalId} => ${group.map((row) => row.center.id).join(",")}`).join("; ")}`,
  );

  const pending = rows.filter((row) => row.canonicalId && (
    row.center.crmLocationId !== row.canonicalId
    || row.center.locationId !== row.canonicalId
    || JSON.stringify(locationAliasesFromCustomFields(row.center.customFields).sort()) !== JSON.stringify([...row.aliases].sort())
  ));
  return { rows, pending, held };
}

function summary(plan: Awaited<ReturnType<typeof readPlan>>) {
  return {
    schoolRecords: plan.rows.length,
    pendingUpdates: plan.pending.length,
    alreadyCanonical: plan.rows.length - plan.pending.length - plan.held.length,
    held: plan.held.map((row) => ({
      centerId: row.center.id,
      tenant: row.center.organization.tenant.slug,
      school: row.center.name,
      currentCrmLocationId: row.center.crmLocationId,
      reason: "Missing a proven state and city; no location ID was invented.",
    })),
    changes: plan.pending.map((row) => ({
      centerId: row.center.id,
      tenant: row.center.organization.tenant.slug,
      school: row.center.name,
      from: { crmLocationId: row.center.crmLocationId, locationId: row.center.locationId },
      to: row.canonicalId,
      retainedAliases: row.aliases,
    })),
    billingOrPaymentRecordsChanged: 0,
    messagesOrInvitationsSent: 0,
    supabaseAuthRecordsChanged: 0,
  };
}

async function applyPlan(expected: Awaited<ReturnType<typeof readPlan>>) {
  const before = await Promise.all([
    prisma.center.count(),
    prisma.lead.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.user.count(),
    prisma.userAccessGrant.count(),
  ]);
  const expectedIds = expected.pending.map((row) => row.center.id).sort();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${REPAIR_SOURCE}))`);
    if (expectedIds.length) {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM "Center" WHERE id IN (${Prisma.join(expectedIds)}) FOR UPDATE
      `);
    }
    const current = await readPlan(tx);
    invariant(
      JSON.stringify(current.pending.map((row) => row.center.id).sort()) === JSON.stringify(expectedIds),
      "The pending center set changed after the dry-run audit.",
    );
    const changedAt = new Date().toISOString();

    for (const row of current.pending) {
      const priorFields = jsonObject(row.center.customFields);
      await tx.center.update({
        where: { id: row.center.id },
        data: {
          crmLocationId: row.canonicalId,
          locationId: row.canonicalId,
          customFields: jsonSafe({
            ...priorFields,
            canonicalLocationIdVersion: 1,
            canonicalLocationIdUpdatedAt: changedAt,
            locationAliases: row.aliases,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: row.center.organization.tenantId,
          centerId: row.center.id,
          action: AUDIT_ACTION,
          resource: "Center",
          resourceId: row.center.id,
          metadata: jsonSafe({
            repairSource: REPAIR_SOURCE,
            changedAt,
            priorCrmLocationId: row.center.crmLocationId,
            priorLocationId: row.center.locationId,
            canonicalLocationId: row.canonicalId,
            retainedAliases: row.aliases,
          }),
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 120_000 });

  const after = await Promise.all([
    prisma.center.count(),
    prisma.lead.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.user.count(),
    prisma.userAccessGrant.count(),
  ]);
  invariant(JSON.stringify(before) === JSON.stringify(after), `Protected record counts changed: before=${before.join(",")} after=${after.join(",")}`);
  const verification = await readPlan(prisma);
  invariant(verification.pending.length === 0, `${verification.pending.length} location ID updates remain after apply.`);
  return verification;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-canonical-school-location-ids");
  const plan = await readPlan(prisma);
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, ...summary(plan) }, null, 2));
    return;
  }
  invariant(confirmed, "Apply mode requires --confirm-canonical-school-location-ids.");
  invariant(plan.pending.length > 0, "No school location identifiers are pending canonicalization.");
  const verification = await applyPlan(plan);
  console.log(JSON.stringify({ applied: true, ...summary(verification) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
