import "./load-env";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const EXPECTED = {
  centerId: "cmp4ewg8w004k6alwid0bwiur",
  centerName: "Kid City USA - Pisgah Forest",
  familyId: "cms7g820e003d6a44w4gtdz44",
  familyName: "Baggaley Household",
  familyExternalId: "42370",
  primaryChildId: "cmta4xzkj000ql2047bsalb8t",
  duplicateChildId: "cmta5fp7y000gl5045aoqbu39",
  fullName: "Sloane Baggaley",
  dateOfBirth: "2023-09-28T12:00:00.000Z",
  startDate: "2026-08-24T12:00:00.000Z",
  ageGroup: "Threes",
  classroomId: "cms7g82h0003j6a449te14ggd",
  evidenceMessageId: "1a03e5f22e908367",
  actorEmail: "brenden@kidcityusa.com",
} as const;

type ReadClient = Pick<Prisma.TransactionClient, "center" | "family" | "child" | "user">;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function timestamp(value: Date | null) {
  return value?.toISOString() ?? null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)]),
  );
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

const childSelect = {
  id: true,
  familyId: true,
  classroomId: true,
  fullName: true,
  preferredName: true,
  dateOfBirth: true,
  ageGroup: true,
  enrollmentStatus: true,
  startDate: true,
  schedule: true,
  photoVideoPermission: true,
  fieldTripPermission: true,
  napNotes: true,
  feedingNotes: true,
  pottyNotes: true,
  developmentalNotes: true,
  sourceSystem: true,
  externalId: true,
  customFields: true,
  createdAt: true,
  updatedAt: true,
  liveLocation: { select: { id: true } },
  _count: {
    select: {
      medicalNotes: true,
      allergies: true,
      enrollments: true,
      attendance: true,
      checkLogs: true,
      dailyReports: true,
      incidents: true,
      documents: true,
      media: true,
      medicationLogs: true,
      locationTransitions: true,
      subsidyAuthorizations: true,
      subsidyClaimLines: true,
    },
  },
} satisfies Prisma.ChildSelect;

async function readState(db: ReadClient = prisma) {
  const [center, family, children, actor] = await Promise.all([
    db.center.findUnique({
      where: { id: EXPECTED.centerId },
      select: { id: true, name: true, organization: { select: { tenantId: true } } },
    }),
    db.family.findUnique({
      where: { id: EXPECTED.familyId },
      select: {
        id: true,
        centerId: true,
        name: true,
        sourceSystem: true,
        externalId: true,
        guardians: { orderBy: { id: "asc" }, select: { id: true, fullName: true, email: true, userId: true } },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            _count: { select: { invoices: true, payments: true, ledgerEntries: true } },
          },
        },
      },
    }),
    db.child.findMany({
      where: { id: { in: [EXPECTED.primaryChildId, EXPECTED.duplicateChildId] } },
      orderBy: { createdAt: "asc" },
      select: childSelect,
    }),
    db.user.findUnique({
      where: { email: EXPECTED.actorEmail },
      select: { id: true, email: true, tenantId: true, isActive: true },
    }),
  ]);

  invariant(center?.name === EXPECTED.centerName, "Pisgah Forest center identity changed.");
  invariant(family?.centerId === center.id && family.name === EXPECTED.familyName, "Baggaley family scope changed.");
  invariant(family.externalId === EXPECTED.familyExternalId, "Baggaley ProCare family identity changed.");
  invariant(actor?.isActive && actor.tenantId === center.organization.tenantId, "Audit actor is missing or outside the Pisgah tenant.");
  invariant(children.length === 2, `Expected the two reviewed Sloane records; found ${children.length}.`);

  const primary = children.find((child) => child.id === EXPECTED.primaryChildId);
  const duplicate = children.find((child) => child.id === EXPECTED.duplicateChildId);
  invariant(primary && duplicate, "One of the reviewed Sloane child records is missing.");
  for (const child of [primary, duplicate]) {
    invariant(child.familyId === family.id, `${child.id} moved outside the Baggaley family.`);
    invariant(child.fullName === EXPECTED.fullName, `${child.id} name changed.`);
    invariant(timestamp(child.dateOfBirth) === EXPECTED.dateOfBirth, `${child.id} birth date changed.`);
    invariant(timestamp(child.startDate) === EXPECTED.startDate, `${child.id} start date changed.`);
    invariant(child.ageGroup === EXPECTED.ageGroup, `${child.id} age group changed.`);
    invariant(child.enrollmentStatus === "enrolled", `${child.id} enrollment status changed.`);
    invariant(child.classroomId === EXPECTED.classroomId, `${child.id} classroom changed.`);
  }
  const identityFields = (child: typeof primary) => ({
    familyId: child.familyId,
    classroomId: child.classroomId,
    fullName: child.fullName,
    preferredName: child.preferredName,
    dateOfBirth: timestamp(child.dateOfBirth),
    ageGroup: child.ageGroup,
    enrollmentStatus: child.enrollmentStatus,
    startDate: timestamp(child.startDate),
    schedule: child.schedule,
    photoVideoPermission: child.photoVideoPermission,
    fieldTripPermission: child.fieldTripPermission,
    napNotes: child.napNotes,
    feedingNotes: child.feedingNotes,
    pottyNotes: child.pottyNotes,
    developmentalNotes: child.developmentalNotes,
    sourceSystem: child.sourceSystem,
    externalId: child.externalId,
    customFields: child.customFields,
  });
  invariant(fingerprint(identityFields(primary)) === fingerprint(identityFields(duplicate)), "Sloane records are no longer exact duplicates.");
  invariant(duplicate.liveLocation === null, "Duplicate Sloane record has a live location.");
  invariant(Object.values(duplicate._count).every((count) => count === 0), "Duplicate Sloane record now has dependent history and cannot use this guarded merge.");

  const snapshot = { center, family, actor, primary, duplicate };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}

function arg(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

async function main() {
  const before = await readState();
  const applying = process.argv.includes("--apply");
  if (!applying) {
    console.log(JSON.stringify({
      mode: "dry_run",
      fingerprint: before.fingerprint,
      center: before.center.name,
      family: before.family.name,
      keptChildId: before.primary.id,
      duplicateChildId: before.duplicate.id,
      duplicateCreatedAt: before.duplicate.createdAt,
      duplicateDependencies: before.duplicate._count,
      billingAccount: before.family.billingAccount,
      evidenceMessageId: EXPECTED.evidenceMessageId,
    }, null, 2));
    return;
  }

  invariant(arg("--expected-fingerprint") === before.fingerprint, "Production state fingerprint was not supplied or changed after review.");
  const mergedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "Family"
      WHERE "id" = ${EXPECTED.familyId}
      FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "Child"
      WHERE "id" IN (${Prisma.join([EXPECTED.primaryChildId, EXPECTED.duplicateChildId])})
      ORDER BY "id"
      FOR UPDATE
    `);
    const locked = await readState(tx);
    invariant(locked.fingerprint === before.fingerprint, "Sloane state changed while acquiring locks.");

    const primaryFields = record(locked.primary.customFields);
    const mergedChildIds = Array.from(new Set([
      ...(Array.isArray(primaryFields.mergedChildIds) ? primaryFields.mergedChildIds.filter((value): value is string => typeof value === "string") : []),
      locked.duplicate.id,
    ]));
    await tx.child.update({
      where: { id: locked.primary.id },
      data: {
        customFields: {
          ...primaryFields,
          mergedChildIds,
          lastChildMerge: {
            duplicateChildId: locked.duplicate.id,
            duplicateName: locked.duplicate.fullName,
            duplicateFamilyId: locked.duplicate.familyId,
            mergedAt: mergedAt.toISOString(),
            mergedBy: EXPECTED.actorEmail,
            evidenceMessageId: EXPECTED.evidenceMessageId,
          },
        } as Prisma.InputJsonObject,
      },
    });
    await tx.child.delete({ where: { id: locked.duplicate.id } });
    await tx.auditLog.create({
      data: {
        tenantId: locked.center.organization.tenantId,
        centerId: locked.center.id,
        userId: locked.actor.id,
        action: "operations.childMerge.merged",
        resource: "childMerge",
        resourceId: locked.primary.id,
        metadata: {
          mode: "merged",
          primaryChildId: locked.primary.id,
          duplicateChildId: locked.duplicate.id,
          familyId: locked.family.id,
          evidenceMessageId: EXPECTED.evidenceMessageId,
          beforeFingerprint: locked.fingerprint,
          duplicateCreatedAt: locked.duplicate.createdAt.toISOString(),
          duplicateDependencies: locked.duplicate._count,
          billingChanged: false,
          paymentHistoryChanged: false,
          familyHistoryChanged: false,
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });

  const [primary, duplicate, mergeAudit] = await Promise.all([
    prisma.child.findUnique({ where: { id: EXPECTED.primaryChildId }, select: { id: true, familyId: true, fullName: true, dateOfBirth: true, startDate: true, ageGroup: true, enrollmentStatus: true, classroomId: true, customFields: true } }),
    prisma.child.findUnique({ where: { id: EXPECTED.duplicateChildId }, select: { id: true } }),
    prisma.auditLog.findFirst({ where: { action: "operations.childMerge.merged", resourceId: EXPECTED.primaryChildId, metadata: { path: ["evidenceMessageId"], equals: EXPECTED.evidenceMessageId } }, orderBy: { createdAt: "desc" } }),
  ]);
  invariant(primary?.familyId === EXPECTED.familyId && primary.enrollmentStatus === "enrolled", "Kept Sloane record failed post-merge validation.");
  invariant(duplicate === null, "Duplicate Sloane record still exists after merge.");
  invariant(Array.isArray(record(primary.customFields).mergedChildIds) && (record(primary.customFields).mergedChildIds as unknown[]).includes(EXPECTED.duplicateChildId), "Kept Sloane record does not contain merge provenance.");
  invariant(mergeAudit, "Sloane merge audit log is missing.");
  console.log(JSON.stringify({ mode: "applied", primary, duplicate, auditLogId: mergeAudit.id }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
