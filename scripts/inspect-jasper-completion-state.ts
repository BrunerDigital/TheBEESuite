import "./load-env";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ewec5003q6alwuwmakk73";
const CENTER_NAME = "Kid City USA - Jasper - Truman";
const CENTER_LOCATION = "Kid City USA - IN | Jasper - Truman";

function jsonKeys(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>).sort()
    : [];
}

async function main() {
  const center = await prisma.center.findUnique({
    where: { id: CENTER_ID },
    select: {
      id: true,
      name: true,
      locationId: true,
      status: true,
      timezone: true,
      organization: { select: { tenantId: true } },
    },
  });
  if (!center || center.name !== CENTER_NAME || center.locationId !== CENTER_LOCATION || center.status !== "active") {
    throw new Error("Jasper production center identity/status mismatch.");
  }
  const familyScope = { centerId: CENTER_ID } as const;
  const childScope = { family: familyScope } as const;
  const billingScope = { family: familyScope } as const;
  const [
    families,
    children,
    classrooms,
    guardians,
    emergencies,
    pickups,
    billingAccounts,
    invoices,
    payments,
    ledgerEntries,
    attendance,
    checkLogs,
    messages,
    documents,
    notes,
    surveys,
    refunds,
    deletionRequests,
    setupTokens,
    accessGrants,
    users,
    batches,
    statusGroups,
  ] = await Promise.all([
    prisma.family.findMany({ where: familyScope, select: { id: true, externalId: true, sourceSystem: true, customFields: true } }),
    prisma.child.findMany({ where: childScope, select: { id: true, familyId: true, externalId: true, sourceSystem: true, classroomId: true, enrollmentStatus: true, customFields: true } }),
    prisma.classroom.findMany({ where: { centerId: CENTER_ID }, select: { id: true, externalId: true, sourceSystem: true, customFields: true } }),
    prisma.guardian.findMany({ where: { family: familyScope }, select: { id: true, familyId: true, externalId: true, sourceSystem: true, isBillingContact: true, userId: true, customFields: true } }),
    prisma.emergencyContact.findMany({ where: { family: familyScope }, select: { id: true, familyId: true, externalId: true, sourceSystem: true } }),
    prisma.authorizedPickup.findMany({ where: { family: familyScope }, select: { id: true, familyId: true, externalId: true, sourceSystem: true } }),
    prisma.billingAccount.count({ where: billingScope }),
    prisma.invoice.count({ where: { billingAccount: billingScope } }),
    prisma.payment.count({ where: { billingAccount: billingScope } }),
    prisma.ledgerEntry.count({ where: { billingAccount: billingScope } }),
    prisma.attendanceRecord.count({ where: { child: childScope } }),
    prisma.checkInOutLog.count({ where: { centerId: CENTER_ID } }),
    prisma.message.count({ where: { family: familyScope } }),
    prisma.document.count({ where: { family: familyScope } }),
    prisma.note.count({ where: { family: familyScope } }),
    prisma.surveyResponse.count({ where: { family: familyScope } }),
    prisma.refundRequest.count({ where: { family: familyScope } }),
    prisma.dataDeletionRequest.count({ where: { family: familyScope } }),
    prisma.parentPortalSetupToken.count({ where: { centerId: CENTER_ID } }),
    prisma.userAccessGrant.count({ where: { centerId: CENTER_ID } }),
    prisma.user.count({ where: { guardians: { some: { family: familyScope } } } }),
    prisma.procareImportBatch.findMany({ where: { centerId: CENTER_ID }, orderBy: { createdAt: "asc" }, select: { id: true, filename: true, status: true, summary: true, _count: { select: { rows: true } } } }),
    prisma.child.groupBy({ by: ["enrollmentStatus"], where: childScope, _count: { _all: true } }),
  ]);

  const duplicateFamilyExternalIds = [...new Map(families.filter((item) => item.externalId).map((item) => [item.externalId!, 0])).keys()]
    .filter((externalId) => families.filter((item) => item.externalId === externalId).length > 1);
  const duplicateChildExternalIds = [...new Map(children.filter((item) => item.externalId).map((item) => [item.externalId!, 0])).keys()]
    .filter((externalId) => children.filter((item) => item.externalId === externalId).length > 1);
  const guardianKeys = new Map<string, number>();
  for (const guardian of guardians) {
    const key = `${guardian.familyId}\0${guardian.externalId ?? ""}`;
    guardianKeys.set(key, (guardianKeys.get(key) ?? 0) + 1);
  }
  const emergencyKeys = new Map<string, number>();
  for (const item of emergencies) {
    const key = `${item.familyId}\0${item.externalId ?? ""}`;
    emergencyKeys.set(key, (emergencyKeys.get(key) ?? 0) + 1);
  }
  const pickupKeys = new Map<string, number>();
  for (const item of pickups) {
    const key = `${item.familyId}\0${item.externalId ?? ""}`;
    pickupKeys.set(key, (pickupKeys.get(key) ?? 0) + 1);
  }
  console.log(JSON.stringify({
    center,
    counts: {
      families: families.length,
      children: children.length,
      classrooms: classrooms.length,
      guardians: guardians.length,
      billingGuardians: guardians.filter((item) => item.isBillingContact).length,
      guardiansLinkedToUsers: guardians.filter((item) => item.userId).length,
      emergencies: emergencies.length,
      pickups: pickups.length,
      billingAccounts,
      invoices,
      payments,
      ledgerEntries,
      attendance,
      checkLogs,
      messages,
      documents,
      notes,
      surveys,
      refunds,
      deletionRequests,
      setupTokens,
      accessGrants,
      users,
      batches: batches.length,
      importRows: batches.reduce((sum, item) => sum + item._count.rows, 0),
    },
    statuses: Object.fromEntries(statusGroups.map((item) => [item.enrollmentStatus, item._count._all])),
    identity: {
      procareFamilies: families.filter((item) => item.sourceSystem === "procare").length,
      familiesWithExternalId: families.filter((item) => item.externalId).length,
      duplicateFamilyExternalIds: duplicateFamilyExternalIds.length,
      procareChildren: children.filter((item) => item.sourceSystem === "procare").length,
      childrenWithExternalId: children.filter((item) => item.externalId).length,
      duplicateChildExternalIds: duplicateChildExternalIds.length,
      childrenAssignedToClassroom: children.filter((item) => item.classroomId).length,
      procareClassrooms: classrooms.filter((item) => item.sourceSystem === "procare").length,
      duplicateGuardianFamilyPersonKeys: [...guardianKeys.values()].filter((count) => count > 1).length,
      duplicateEmergencyFamilyPersonKeys: [...emergencyKeys.values()].filter((count) => count > 1).length,
      duplicatePickupFamilyPersonKeys: [...pickupKeys.values()].filter((count) => count > 1).length,
    },
    metadataShapes: {
      family: [...new Set(families.map((item) => jsonKeys(item.customFields).join("|")))],
      child: [...new Set(children.map((item) => jsonKeys(item.customFields).join("|")))],
      classroom: [...new Set(classrooms.map((item) => jsonKeys(item.customFields).join("|")))],
      guardian: [...new Set(guardians.map((item) => jsonKeys(item.customFields).join("|")))],
    },
    batches: batches.map((item) => ({ filename: item.filename, status: item.status, rows: item._count.rows })),
  }, null, 2));
}

void main().finally(async () => prisma.$disconnect());
