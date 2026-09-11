import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { currentlyEnrolledStatusValues } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import type { SchoolDataReviewEvidence } from "@/lib/school-data-setup";

function record(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

async function schoolDataFingerprints(centerId: string) {
  const [families, classrooms, staff, openingBalanceInvoices, openingBalanceLedger] = await Promise.all([
    prisma.family.findMany({
    where: { centerId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      billingEmail: true,
      custodyNotes: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
      updatedAt: true,
      guardians: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          employer: true,
          relation: true,
          preferredCommunication: true,
          isBillingContact: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
        },
      },
      pickups: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          fullName: true,
          phone: true,
          relation: true,
          verificationNotes: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
        },
      },
      emergencyContacts: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          fullName: true,
          phone: true,
          relation: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
        },
      },
      children: {
        orderBy: { id: "asc" },
        select: {
          id: true,
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
          updatedAt: true,
          medicalNotes: {
            orderBy: { id: "asc" },
            select: { id: true, category: true, note: true, restricted: true, createdAt: true },
          },
          allergies: {
            orderBy: { id: "asc" },
            select: { id: true, allergen: true, severity: true, actionPlan: true },
          },
        },
      },
    },
    }),
    prisma.classroom.findMany({
      where: { centerId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        capacity: true,
        ratioRule: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        updatedAt: true,
      },
    }),
    prisma.staffProfile.findMany({
      where: { centerId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        userId: true,
        classroomId: true,
        title: true,
        phone: true,
        backgroundCheckStatus: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        user: { select: { name: true, email: true, isActive: true } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        sourceSystem: "procare",
        externalId: { startsWith: "procare-opening-balance:" },
        billingAccount: { family: { centerId } },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        billingAccountId: true,
        number: true,
        dueDate: true,
        totalCents: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        items: {
          orderBy: { id: "asc" },
          select: { id: true, description: true, amountCents: true },
        },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        sourceSystem: "procare",
        externalId: { startsWith: `procare-opening-balance:${centerId}:` },
        billingAccount: { family: { centerId } },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        billingAccountId: true,
        invoiceId: true,
        type: true,
        description: true,
        amountCents: true,
        sourceSystem: true,
        externalId: true,
        metadata: true,
      },
    }),
  ]);
  return {
    dataFingerprint: fingerprint({ version: 1, families, classrooms }),
    importTargetFingerprint: fingerprint({
      version: 1,
      families,
      classrooms,
      staff,
      openingBalanceInvoices,
      openingBalanceLedger,
    }),
  };
}

export async function loadSchoolDataFingerprint({ centerId }: { centerId: string }) {
  return (await schoolDataFingerprints(centerId)).importTargetFingerprint;
}

export async function loadSchoolDataReviewEvidence({
  centerId,
  tenantId,
}: {
  centerId: string;
  tenantId: string;
}): Promise<SchoolDataReviewEvidence> {
  const currentEnrollmentWhere: Prisma.ChildWhereInput = {
    enrollmentStatus: { in: currentlyEnrolledStatusValues() },
  };
  const currentFamilyWhere: Prisma.FamilyWhereInput = {
    centerId,
    children: { some: currentEnrollmentWhere },
  };
  const currentChildWhere: Prisma.ChildWhereInput = {
    ...currentEnrollmentWhere,
    family: { centerId },
  };
  const currentGuardianWhere: Prisma.GuardianWhereInput = {
    family: currentFamilyWhere,
  };

  const [
    familyCount,
    childCount,
    guardianCount,
    familiesMissingGuardianCount,
    childrenMissingClassroomCount,
    guardiansMissingContactCount,
    importBatchCount,
    latestFamily,
    latestChild,
    latestImportBatch,
    fingerprints,
  ] = await Promise.all([
    prisma.family.count({ where: currentFamilyWhere }),
    prisma.child.count({ where: currentChildWhere }),
    prisma.guardian.count({ where: currentGuardianWhere }),
    prisma.family.count({ where: { ...currentFamilyWhere, guardians: { none: {} } } }),
    prisma.child.count({
      where: {
        ...currentChildWhere,
        OR: [{ classroomId: null }, { classroomId: "" }],
      },
    }),
    prisma.guardian.count({
      where: {
        ...currentGuardianWhere,
        AND: [
          { OR: [{ email: null }, { email: "" }] },
          { OR: [{ phone: null }, { phone: "" }] },
        ],
      },
    }),
    prisma.procareImportBatch.count({
      where: { centerId, center: { organization: { tenantId } } },
    }),
    prisma.family.findFirst({
      where: currentFamilyWhere,
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.child.findFirst({
      where: currentChildWhere,
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.procareImportBatch.findFirst({
      where: { centerId, center: { organization: { tenantId } } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        status: true,
        summary: true,
        createdAt: true,
      },
    }),
    schoolDataFingerprints(centerId),
  ]);

  const [rowStatusCounts, latestFleetAudit] = latestImportBatch
    ? await Promise.all([
        prisma.procareImportRow.groupBy({
          by: ["status"],
          where: { batchId: latestImportBatch.id },
          _count: { _all: true },
        }),
        prisma.auditLog.findFirst({
          where: {
            tenantId,
            centerId,
            action: "procare.import.fleet_verification_exported",
            resource: "ProcareImportBatch",
            resourceId: latestImportBatch.id,
          },
          orderBy: { createdAt: "desc" },
          select: { resourceId: true, metadata: true, createdAt: true },
        }),
      ])
    : [[], null] as const;

  const newestRecordDate = [latestFamily?.updatedAt, latestChild?.updatedAt]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const latestSummary = record(latestImportBatch?.summary);
  const fleetMetadata = record(latestFleetAudit?.metadata);
  const rowCountByStatus = new Map(rowStatusCounts.map((row) => [row.status, row._count._all]));
  const totalRows = rowStatusCounts.reduce((total, row) => total + row._count._all, 0);
  const importedRows = rowCountByStatus.get("imported") ?? count(latestSummary.imported);
  const unresolvedRows = rowCountByStatus.get("needs_resolution") ?? count(latestSummary.unresolved);
  const disposedRows = rowCountByStatus.get("disposed") ?? count(latestSummary.disposed);
  const latestBatchEvidence = latestImportBatch ? {
    id: latestImportBatch.id,
    filename: latestImportBatch.filename,
    status: latestImportBatch.status,
    createdAt: latestImportBatch.createdAt.toISOString(),
    totalRows,
    importedRows,
    unresolvedRows,
    disposedRows,
    errorRows: Math.max(totalRows - importedRows, 0),
    sourceSha256: text(latestSummary.sourceSha256),
    reviewFingerprint: text(latestSummary.reviewFingerprint),
  } : null;

  return {
    dataFingerprint: fingerprints.dataFingerprint,
    importTargetFingerprint: fingerprints.importTargetFingerprint,
    familyCount,
    childCount,
    guardianCount,
    familiesMissingGuardianCount,
    childrenMissingClassroomCount,
    guardiansMissingContactCount,
    importBatchCount,
    latestRecordUpdatedAt: newestRecordDate?.toISOString() ?? null,
    latestImportBatch: latestBatchEvidence,
    latestFleetVerification: latestFleetAudit?.resourceId ? {
      batchId: latestFleetAudit.resourceId,
      status: text(fleetMetadata.status) ?? "NOT_VERIFIED",
      blockerCount: count(fleetMetadata.blockerCount),
      createdAt: latestFleetAudit.createdAt.toISOString(),
      verificationRevision: text(fleetMetadata.verificationRevision),
      targetDataFingerprint: text(fleetMetadata.targetDataFingerprint),
    } : null,
  };
}
