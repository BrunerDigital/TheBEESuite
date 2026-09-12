import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  CLOSED_ENROLLMENT_STATUSES,
  TEMPORARY_BREAK_STATUSES,
  currentlyEnrolledStatusValues,
  enrollmentPipelineStatusValues,
  isCurrentlyEnrolledStatus,
} from "@/lib/enrollment-status";
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

function hasMeaningfulSchedule(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulSchedule);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasMeaningfulSchedule);
  return false;
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

function fingerprintAccumulator(domain: string) {
  const hash = createHash("sha256").update(JSON.stringify({ version: 3, domain }));
  return {
    add(value: unknown) {
      const serialized = JSON.stringify(canonicalize(value));
      hash.update(`\n${Buffer.byteLength(serialized, "utf8")}:`).update(serialized);
    },
    digest() {
      return hash.digest("hex");
    },
  };
}

async function schoolFamilyDomainFingerprints(centerId: string) {
  const rosterFingerprint = fingerprintAccumulator("roster");
  const safetyFingerprint = fingerprintAccumulator("safety");
  let cursor: string | undefined;
  const metrics = {
    totalFamilies: 0,
    totalChildren: 0,
    guardians: 0,
    authorizedPickups: 0,
    emergencyContacts: 0,
    medicalNotes: 0,
    allergies: 0,
    currentChildrenMissingSchedule: 0,
  };
  do {
    const families = await prisma.family.findMany({
      where: { centerId },
      orderBy: { id: "asc" },
      take: 100,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
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
    });
    for (const family of families) {
      metrics.totalFamilies += 1;
      metrics.totalChildren += family.children.length;
      metrics.guardians += family.guardians.length;
      metrics.authorizedPickups += family.pickups.length;
      metrics.emergencyContacts += family.emergencyContacts.length;
      metrics.medicalNotes += family.children.reduce((total, child) => total + child.medicalNotes.length, 0);
      metrics.allergies += family.children.reduce((total, child) => total + child.allergies.length, 0);
      metrics.currentChildrenMissingSchedule += family.children.filter((child) => (
        isCurrentlyEnrolledStatus(child.enrollmentStatus) && !hasMeaningfulSchedule(child.schedule)
      )).length;
      rosterFingerprint.add({
        id: family.id,
        name: family.name,
        address: family.address,
        billingEmail: family.billingEmail,
        sourceSystem: family.sourceSystem,
        externalId: family.externalId,
        customFields: family.customFields,
        updatedAt: family.updatedAt,
        guardians: family.guardians,
        children: family.children.map((child) => ({
          id: child.id,
          classroomId: child.classroomId,
          fullName: child.fullName,
          preferredName: child.preferredName,
          dateOfBirth: child.dateOfBirth,
          ageGroup: child.ageGroup,
          enrollmentStatus: child.enrollmentStatus,
          startDate: child.startDate,
          sourceSystem: child.sourceSystem,
          externalId: child.externalId,
          customFields: child.customFields,
          updatedAt: child.updatedAt,
        })),
      });
      safetyFingerprint.add({
        id: family.id,
        custodyNotes: family.custodyNotes,
        pickups: family.pickups,
        emergencyContacts: family.emergencyContacts,
        children: family.children.map((child) => ({
          id: child.id,
          schedule: child.schedule,
          photoVideoPermission: child.photoVideoPermission,
          fieldTripPermission: child.fieldTripPermission,
          napNotes: child.napNotes,
          feedingNotes: child.feedingNotes,
          pottyNotes: child.pottyNotes,
          developmentalNotes: child.developmentalNotes,
          medicalNotes: child.medicalNotes,
          allergies: child.allergies,
        })),
      });
    }
    cursor = families.length === 100 ? families.at(-1)?.id : undefined;
  } while (cursor);
  return { roster: rosterFingerprint.digest(), safety: safetyFingerprint.digest(), metrics };
}

async function schoolDataFingerprints(centerId: string) {
  const [familyDomains, classrooms, staff, openingBalanceInvoices, openingBalanceLedger] = await Promise.all([
    schoolFamilyDomainFingerprints(centerId),
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
        schedules: { orderBy: { id: "asc" }, select: { id: true, startsAt: true, endsAt: true, status: true } },
        certifications: { orderBy: { id: "asc" }, select: { id: true, name: true, expiresAt: true, status: true } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        OR: [
          { sourceSystem: "procare", externalId: { startsWith: "procare-opening-balance:" } },
          { sourceSystem: "bee_flat_file_v1", externalId: { startsWith: "bee_flat_file_v1-opening-balance:" } },
        ],
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
        OR: [
          { sourceSystem: "procare", externalId: { startsWith: `procare-opening-balance:${centerId}:` } },
          { sourceSystem: "bee_flat_file_v1", externalId: { startsWith: `bee_flat_file_v1-opening-balance:${centerId}:` } },
        ],
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
  const domainFingerprints = {
    roster: familyDomains.roster,
    safety: familyDomains.safety,
    classrooms: fingerprint({ version: 2, classrooms }),
    staff: fingerprint({ version: 2, staff }),
    billing: fingerprint({ version: 2, openingBalanceInvoices, openingBalanceLedger }),
  };
  const domainMetrics = {
    ...familyDomains.metrics,
    classrooms: classrooms.length,
    staff: staff.length,
    staffSchedules: staff.reduce((total, member) => total + member.schedules.length, 0),
    certifications: staff.reduce((total, member) => total + member.certifications.length, 0),
    openingBalanceInvoices: openingBalanceInvoices.length,
    openingBalanceLedgerEntries: openingBalanceLedger.length,
  };
  return {
    domainFingerprints,
    domainMetrics,
    dataFingerprint: fingerprint({
      version: 2,
      roster: domainFingerprints.roster,
      safety: domainFingerprints.safety,
      classrooms: domainFingerprints.classrooms,
    }),
    importTargetFingerprint: fingerprint({ version: 2, ...domainFingerprints }),
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
  const prospectiveEnrollmentWhere: Prisma.ChildWhereInput = {
    enrollmentStatus: { in: enrollmentPipelineStatusValues() },
  };
  const relevantEnrollmentWhere: Prisma.ChildWhereInput = {
    enrollmentStatus: { notIn: [...CLOSED_ENROLLMENT_STATUSES] },
  };
  const recognizedEnrollmentStatuses = [
    ...currentlyEnrolledStatusValues(),
    ...enrollmentPipelineStatusValues(),
    ...TEMPORARY_BREAK_STATUSES,
    ...CLOSED_ENROLLMENT_STATUSES,
  ];
  const currentFamilyWhere: Prisma.FamilyWhereInput = {
    centerId,
    children: { some: currentEnrollmentWhere },
  };
  const prospectiveFamilyWhere: Prisma.FamilyWhereInput = {
    centerId,
    children: { some: prospectiveEnrollmentWhere },
  };
  const relevantFamilyWhere: Prisma.FamilyWhereInput = {
    centerId,
    children: { some: relevantEnrollmentWhere },
  };
  const currentChildWhere: Prisma.ChildWhereInput = {
    ...currentEnrollmentWhere,
    family: { centerId },
  };
  const currentGuardianWhere: Prisma.GuardianWhereInput = {
    family: relevantFamilyWhere,
  };

  const [
    familyCount,
    childCount,
    guardianCount,
    relevantFamilyCount,
    relevantChildCount,
    prospectiveFamilyCount,
    prospectiveChildCount,
    familiesMissingChildCount,
    childrenNeedingEnrollmentStatusReviewCount,
    familiesMissingGuardianCount,
    childrenMissingClassroomCount,
    familiesMissingEmergencyContactCount,
    guardiansMissingContactCount,
    importBatchCount,
    latestFamily,
    latestChild,
    latestImportBatch,
    centerStatus,
    fingerprints,
  ] = await Promise.all([
    prisma.family.count({ where: currentFamilyWhere }),
    prisma.child.count({ where: currentChildWhere }),
    prisma.guardian.count({ where: currentGuardianWhere }),
    prisma.family.count({ where: relevantFamilyWhere }),
    prisma.child.count({ where: { ...relevantEnrollmentWhere, family: { centerId } } }),
    prisma.family.count({ where: prospectiveFamilyWhere }),
    prisma.child.count({ where: { ...prospectiveEnrollmentWhere, family: { centerId } } }),
    prisma.family.count({ where: { centerId, children: { none: {} } } }),
    prisma.child.count({
      where: {
        family: { centerId },
        enrollmentStatus: { notIn: recognizedEnrollmentStatuses },
      },
    }),
    prisma.family.count({ where: { ...relevantFamilyWhere, guardians: { none: {} } } }),
    prisma.child.count({
      where: {
        ...currentChildWhere,
        OR: [{ classroomId: null }, { classroomId: "" }],
      },
    }),
    prisma.family.count({ where: { ...relevantFamilyWhere, emergencyContacts: { none: {} } } }),
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
      where: relevantFamilyWhere,
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.child.findFirst({
      where: { ...relevantEnrollmentWhere, family: { centerId } },
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
    prisma.center.findFirst({
      where: { id: centerId, organization: { tenantId } },
      select: { status: true },
    }),
    schoolDataFingerprints(centerId),
  ]);
  const childrenMissingScheduleCount = fingerprints.domainMetrics.currentChildrenMissingSchedule ?? 0;

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
    sourceAdapter: latestSummary.sourceAdapter === "bee_flat_file_v1" ? "bee_flat_file_v1" as const : "procare" as const,
  } : null;

  return {
    centerStatus: centerStatus?.status ?? null,
    dataFingerprint: fingerprints.dataFingerprint,
    importTargetFingerprint: fingerprints.importTargetFingerprint,
    domainFingerprints: fingerprints.domainFingerprints,
    domainMetrics: fingerprints.domainMetrics,
    familyCount,
    childCount,
    guardianCount,
    relevantFamilyCount,
    relevantChildCount,
    prospectiveFamilyCount,
    prospectiveChildCount,
    familiesMissingChildCount,
    childrenNeedingEnrollmentStatusReviewCount,
    familiesMissingGuardianCount,
    childrenMissingClassroomCount,
    childrenMissingScheduleCount,
    familiesMissingEmergencyContactCount,
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
