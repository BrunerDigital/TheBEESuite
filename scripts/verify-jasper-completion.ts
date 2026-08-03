import "./load-env";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ewec5003q6alwuwmakk73";
const BATCH_FILENAME = "Jasper ProCare completion import (10 files)";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function main() {
  const familyScope = { centerId: CENTER_ID } as const;
  const childScope = { family: familyScope } as const;
  const billingScope = { family: familyScope } as const;
  const [families, children, guardians, emergencies, pickups, batch, attendanceGroups, checkGroups, checkTypes, billingAccounts, invoices, payments, ledgerEntries, messages, setupTokens, parentUsers, accessGrants, auditCount, staff] = await Promise.all([
    prisma.family.findMany({ where: familyScope, select: { id: true, externalId: true, customFields: true } }),
    prisma.child.findMany({ where: childScope, select: { id: true, familyId: true, externalId: true, enrollmentStatus: true, classroomId: true, dateOfBirth: true, schedule: true, customFields: true } }),
    prisma.guardian.findMany({ where: { family: familyScope }, select: { familyId: true, externalId: true, isBillingContact: true, userId: true } }),
    prisma.emergencyContact.findMany({ where: { family: familyScope }, select: { familyId: true, externalId: true } }),
    prisma.authorizedPickup.findMany({ where: { family: familyScope }, select: { familyId: true, externalId: true } }),
    prisma.procareImportBatch.findFirst({ where: { centerId: CENTER_ID, filename: BATCH_FILENAME, status: "completed_with_review_items" }, select: { id: true, summary: true, rows: { orderBy: { rowNumber: "asc" }, select: { status: true, rawData: true, createdChildId: true, createdFamilyId: true } } } }),
    prisma.attendanceRecord.groupBy({ by: ["externalId"], where: { child: childScope }, _count: { _all: true } }),
    prisma.checkInOutLog.groupBy({ by: ["externalId"], where: { centerId: CENTER_ID }, _count: { _all: true } }),
    prisma.checkInOutLog.groupBy({ by: ["type"], where: { centerId: CENTER_ID }, _count: { _all: true } }),
    prisma.billingAccount.count({ where: billingScope }), prisma.invoice.count({ where: { billingAccount: billingScope } }), prisma.payment.count({ where: { billingAccount: billingScope } }), prisma.ledgerEntry.count({ where: { billingAccount: billingScope } }), prisma.message.count({ where: { family: familyScope } }), prisma.parentPortalSetupToken.count({ where: { centerId: CENTER_ID } }), prisma.user.count({ where: { guardians: { some: { family: familyScope } } } }), prisma.userAccessGrant.count({ where: { centerId: CENTER_ID } }), prisma.auditLog.count({ where: { centerId: CENTER_ID, action: "procare.jasper_completion.imported" } }), prisma.staffProfile.count({ where: { centerId: CENTER_ID } }),
  ]);
  invariant(batch && batch.rows.length === 442, "Completion batch or its 442 rows is missing.");
  invariant(families.length === 1023 && children.length === 1341 && guardians.length === 802 && emergencies.length === 1499 && pickups.length === 1563, "Final Jasper roster/relationship counts do not match.");
  invariant(new Set(families.map((item) => item.externalId)).size === 1023 && new Set(children.map((item) => item.externalId)).size === 1341, "Family or child external identifiers are duplicated.");
  const childById = new Map(children.map((item) => [item.id, item]));
  invariant(batch.rows.every((row) => row.createdChildId && row.createdFamilyId && childById.get(row.createdChildId)?.familyId === row.createdFamilyId), "A completion row is missing its child-family link.");
  const createdChildren = batch.rows.map((row) => childById.get(row.createdChildId!)).filter(Boolean) as typeof children;
  const targetFamilies = new Set(batch.rows.map((row) => row.createdFamilyId));
  const createdFamilies = families.filter((item) => object(item.customFields).source === "jasper_procare_completion_2026_08_01");
  invariant(createdChildren.length === 442 && createdFamilies.length === 418, "Completion-created child/family totals drifted.");
  invariant(createdChildren.every((item) => object(item.customFields).needsDirectorReview === true), "A completion child is missing its director-review marker.");
  invariant(createdChildren.filter((item) => object(item.customFields).dateOfBirthMissing === true).length === 77, "Missing-DOB review count drifted.");
  invariant(createdChildren.every((item) => object(item.customFields).tuitionBillingEnabled !== true && object(item.customFields).tuitionAutobillEligible !== true), "A completion child has tuition enabled.");
  const provisionalFamilies = families.filter((item) => object(item.customFields).provisionalHousehold === true);
  invariant(provisionalFamilies.length === 413 && provisionalFamilies.every((item) => object(item.customFields).needsDirectorReview === true), "Provisional family review population drifted.");
  const statuses = Object.fromEntries([...new Set(children.map((item) => item.enrollmentStatus))].map((status) => [status, children.filter((item) => item.enrollmentStatus === status).length]));
  invariant(statuses.enrolled === 109 && statuses.waitlisted === 262 && statuses.withdrawn === 970, "Final enrollment statuses drifted.");
  invariant(children.filter((item) => item.enrollmentStatus === "enrolled" && item.classroomId).length === 108 && children.filter((item) => item.enrollmentStatus === "enrolled" && !item.classroomId).length === 1, "Current classroom assignment totals drifted.");
  invariant(children.filter((item) => item.schedule).length === 104, "Schedule snapshot count drifted.");
  invariant(children.filter((item) => object(item.customFields).procareContractBillingSnapshot).length === 108, "Contract billing snapshot count drifted.");
  invariant(attendanceGroups.length === 22792 && attendanceGroups.every((item) => item._count._all === 1), "Attendance identifiers are missing or duplicated.");
  invariant(checkGroups.length === 65530 && checkGroups.every((item) => item._count._all === 1), "Check-event identifiers are missing or duplicated.");
  const checkTypeCounts = Object.fromEntries(checkTypes.map((item) => [item.type, item._count._all]));
  invariant(checkTypeCounts.check_in === 32765 && checkTypeCounts.check_out === 32765, "Check-in/out event totals are unbalanced.");
  const duplicateKeys = <T extends { familyId: string; externalId: string | null }>(items: T[]) => {
    const counts = new Map<string, number>();
    for (const item of items) { const key = `${item.familyId}\0${item.externalId ?? ""}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
    return [...counts.values()].filter((count) => count > 1).length;
  };
  invariant(duplicateKeys(guardians) === 0 && duplicateKeys(emergencies) === 0 && duplicateKeys(pickups) === 0, "A family-person relationship was duplicated.");
  invariant(guardians.filter((item) => item.isBillingContact).length === 610 && guardians.every((item) => !item.userId), "Billing-contact or parent-user boundary drifted.");
  invariant(billingAccounts === 0 && invoices === 0 && payments === 0 && ledgerEntries === 0 && messages === 0 && setupTokens === 0 && parentUsers === 0 && accessGrants === 2, "Billing, messaging, identity, or access boundary changed.");
  invariant(auditCount === 1, "Completion audit record count mismatch.");
  const rowStatuses = Object.fromEntries([...new Set(batch.rows.map((row) => row.status))].map((status) => [status, batch.rows.filter((row) => row.status === status).length]));
  console.log(JSON.stringify({ ok: true, centerId: CENTER_ID, batchId: batch.id, counts: { families: families.length, children: children.length, guardians: guardians.length, emergencies: emergencies.length, pickups: pickups.length, attendanceDays: attendanceGroups.length, checkEvents: checkGroups.length, staffUnchangedByCompletion: staff }, statuses, review: { completionChildren: createdChildren.length, createdFamilies: createdFamilies.length, targetFamiliesUsed: targetFamilies.size, provisionalFamilies: provisionalFamilies.length, missingDobChildren: 77, enrolledWithoutClassroom: 1, batchRowStatuses: rowStatuses }, captured: { schedules: 104, contractBillingSnapshots: 108 }, gates: { billingAccounts, invoices, payments, ledgerEntries, messages, setupTokens, parentUsers, accessGrants, guardiansLinkedToUsers: 0 }, auditCount }, null, 2));
}

void main().finally(async () => prisma.$disconnect());
