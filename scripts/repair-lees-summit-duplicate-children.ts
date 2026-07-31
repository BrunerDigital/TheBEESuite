import "./load-env";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_LOCATION_ID = "MO | Lees Summit";
const CENTER_NAME = "Kid City USA - Lees Summit";
const PROCARE_SOURCE = "procare";
const TEST_SOURCE = "bee_suite_parent_invite_test";
const REPAIR_SOURCE = "lees_summit_relationship_row_deduplication_2026_07_31";
const EXPECTED_PRE_FINGERPRINT = "8cdd97d6ca2f581bb1b84ebd355fa72955b49c6474aaaddf9f498c9fed18233e";
const CURRENT_STATUSES = new Set(["enrolled", "active", "current"]);
const EXPECTED_PRE_STATUSES = { drop_in: 20, enrolled: 81, not_enrolled: 2, pre_registered: 19, waitlisted: 15, withdrawn: 486 };
const EXPECTED_POST_STATUSES = { drop_in: 8, enrolled: 27, not_enrolled: 2, pre_registered: 4, waitlisted: 11, withdrawn: 172 };

type RepairDb = Pick<
  Prisma.TransactionClient,
  | "auditLog"
  | "authorizedPickup"
  | "billingAccount"
  | "center"
  | "child"
  | "emergencyContact"
  | "family"
  | "guardian"
  | "invoice"
  | "message"
  | "payment"
  | "procareImportBatch"
  | "procareImportRow"
  | "user"
  | "userAccessGrant"
>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizeStatus(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function normalizePart(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes(",")) {
    const [last = "", rest = ""] = trimmed.split(",", 2);
    return `${normalizePart(rest.trim().split(/\s+/)[0] ?? "")}:${normalizePart(last)}`;
  }
  const parts = trimmed.split(/\s+/);
  return `${normalizePart(parts[0] ?? "")}:${normalizePart(parts.at(-1) ?? "")}`;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function jsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function cloneJson(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function contactMaterialKey(contact: {
  fullName: string;
  phone: string | null;
  relation: string;
  sourceSystem: string | null;
  externalId: string | null;
  customFields: Prisma.JsonValue | null;
}) {
  return createHash("sha256").update(JSON.stringify({
    fullName: contact.fullName,
    phone: contact.phone,
    relation: contact.relation,
    sourceSystem: contact.sourceSystem,
    externalId: contact.externalId,
    customFields: contact.customFields,
  })).digest("hex");
}

async function readBoundaryCounts(db: RepairDb, centerId: string, tenantId: string) {
  const [
    children,
    families,
    emergencyContacts,
    authorizedPickups,
    guardians,
    linkedGuardianUsers,
    billingAccounts,
    invoices,
    payments,
    messages,
    tenantUsers,
    centerAccessGrants,
    importBatches,
    importRows,
    auditLogs,
  ] = await Promise.all([
    db.child.count({ where: { family: { centerId } } }),
    db.family.count({ where: { centerId } }),
    db.emergencyContact.count({ where: { family: { centerId } } }),
    db.authorizedPickup.count({ where: { family: { centerId } } }),
    db.guardian.count({ where: { family: { centerId } } }),
    db.guardian.count({ where: { family: { centerId }, userId: { not: null } } }),
    db.billingAccount.count({ where: { family: { centerId } } }),
    db.invoice.count({ where: { billingAccount: { family: { centerId } } } }),
    db.payment.count({ where: { billingAccount: { family: { centerId } } } }),
    db.message.count({ where: { family: { centerId } } }),
    db.user.count({ where: { tenantId } }),
    db.userAccessGrant.count({ where: { centerId } }),
    db.procareImportBatch.count({ where: { centerId } }),
    db.procareImportRow.count({ where: { batch: { centerId } } }),
    db.auditLog.count({ where: { centerId } }),
  ]);
  return { children, families, emergencyContacts, authorizedPickups, guardians, linkedGuardianUsers, billingAccounts, invoices, payments, messages, tenantUsers, centerAccessGrants, importBatches, importRows, auditLogs };
}

async function readState(db: RepairDb) {
  const centers = await db.center.findMany({
    where: { crmLocationId: CENTER_LOCATION_ID },
    take: 2,
    select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } },
  });
  invariant(centers.length === 1, `Expected exactly one ${CENTER_LOCATION_ID} center; found ${centers.length}.`);
  const center = centers[0];
  invariant(center.name === CENTER_NAME, `Expected ${CENTER_NAME}; found ${center.name}.`);
  invariant(center.status === "active", `Expected ${CENTER_NAME} to be active; found ${center.status}.`);

  const [children, familyCount, importBatches, priorRepair, boundary] = await Promise.all([
    db.child.findMany({
      where: { family: { centerId: center.id } },
      select: {
        id: true,
        fullName: true,
        dateOfBirth: true,
        enrollmentStatus: true,
        sourceSystem: true,
        externalId: true,
        createdAt: true,
        classroomId: true,
        customFields: true,
        family: {
          select: {
            id: true,
            sourceSystem: true,
            externalId: true,
            customFields: true,
            guardians: { select: { id: true, userId: true } },
            emergencyContacts: { select: { id: true, familyId: true, fullName: true, phone: true, relation: true, sourceSystem: true, externalId: true, customFields: true } },
            pickups: { select: { id: true } },
            billingAccount: { select: { id: true, _count: { select: { invoices: true, payments: true, ledgerEntries: true } } } },
            _count: { select: { children: true, messages: true, documents: true, notesList: true, surveyResponses: true, dataDeletionRequests: true, refundRequests: true } },
          },
        },
        _count: { select: { medicalNotes: true, allergies: true, enrollments: true, attendance: true, checkLogs: true, dailyReports: true, incidents: true, documents: true, media: true, medicationLogs: true, locationTransitions: true } },
        liveLocation: { select: { id: true } },
      },
      orderBy: [{ externalId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    db.family.count({ where: { centerId: center.id } }),
    db.procareImportBatch.findMany({ where: { centerId: center.id }, select: { id: true, filename: true, status: true, _count: { select: { rows: true } } }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findFirst({ where: { centerId: center.id, action: "procare.lees_summit_duplicate_children.consolidated" }, select: { id: true, metadata: true }, orderBy: { createdAt: "desc" } }),
    readBoundaryCounts(db, center.id, center.organization.tenantId),
  ]);
  return { center, children, familyCount, importBatches, priorRepair, boundary };
}

type State = Awaited<ReturnType<typeof readState>>;
type ChildRow = State["children"][number];

function statusCounts(children: ChildRow[]) {
  return Object.fromEntries(Object.entries(Object.groupBy(children, (child) => normalizeStatus(child.enrollmentStatus))).map(([status, rows]) => [status, rows?.length ?? 0]));
}

function assertStatusCounts(actual: Record<string, number>, expected: Record<string, number>, label: string) {
  invariant(JSON.stringify(Object.fromEntries(Object.entries(actual).sort())) === JSON.stringify(Object.fromEntries(Object.entries(expected).sort())), `${label} enrollment-status distribution changed.`);
}

function deriveRepair(state: State) {
  const procareChildren = state.children.filter((child) => child.sourceSystem === PROCARE_SOURCE && child.externalId);
  const sourceGroups = Object.entries(Object.groupBy(procareChildren, (child) => child.externalId!))
    .map(([externalId, rows]) => ({ externalId, rows: rows ?? [] }))
    .sort((left, right) => left.externalId.localeCompare(right.externalId));
  const duplicateGroups = sourceGroups.filter((group) => group.rows.length > 1);

  const groups = duplicateGroups.map((group) => {
    const rows = [...group.rows].sort((left, right) => left.createdAt.valueOf() - right.createdAt.valueOf() || left.id.localeCompare(right.id));
    const canonical = rows[0];
    invariant(new Set(rows.map((child) => `${nameKey(child.fullName)}:${dateKey(child.dateOfBirth)}`)).size === 1, `Child identity conflict for ProCare child ${group.externalId}.`);
    invariant(new Set(rows.map((child) => normalizeStatus(child.enrollmentStatus))).size === 1, `Enrollment-status conflict for ProCare child ${group.externalId}.`);
    invariant(new Set(rows.map((child) => child.classroomId ?? "NONE")).size === 1, `Classroom conflict for ProCare child ${group.externalId}.`);

    for (const child of rows) {
      const childDependencies = Object.values(child._count).reduce((total, count) => total + count, 0) + (child.liveLocation ? 1 : 0);
      const family = child.family;
      const protectedFamilyDependencies = family.guardians.length
        + family.pickups.length
        + (family.billingAccount ? 1 + family.billingAccount._count.invoices + family.billingAccount._count.payments + family.billingAccount._count.ledgerEntries : 0)
        + family._count.messages
        + family._count.documents
        + family._count.notesList
        + family._count.surveyResponses
        + family._count.dataDeletionRequests
        + family._count.refundRequests;
      invariant(childDependencies === 0, `ProCare child ${group.externalId} has operational child records and cannot be consolidated automatically.`);
      invariant(protectedFamilyDependencies === 0, `ProCare child ${group.externalId} has protected family records and cannot be consolidated automatically.`);
      invariant(family._count.children === 1, `ProCare child ${group.externalId} belongs to a family containing another child.`);
      invariant(family.sourceSystem === PROCARE_SOURCE && !family.externalId, `ProCare child ${group.externalId} belongs to an account-linked or non-ProCare family.`);
    }

    const contacts = rows.flatMap((child) => child.family.emergencyContacts);
    const contactGroups = Object.entries(Object.groupBy(contacts, contactMaterialKey)).sort(([left], [right]) => left.localeCompare(right));
    const keepContacts = contactGroups.map(([, matches]) => [...(matches ?? [])].sort((left, right) => left.id.localeCompare(right.id))[0]);
    const keepContactIds = new Set(keepContacts.map((contact) => contact.id));
    const snapshot = {
      externalId: group.externalId,
      identityHash: createHash("sha256").update(`${nameKey(canonical.fullName)}:${dateKey(canonical.dateOfBirth)}`).digest("hex"),
      sourceRowsHash: createHash("sha256").update(JSON.stringify(rows.map((child) => ({ childId: child.id, familyId: child.family.id, childCustomFields: child.customFields, familyCustomFields: child.family.customFields })))).digest("hex"),
      status: normalizeStatus(canonical.enrollmentStatus),
      classroomId: canonical.classroomId,
      canonicalChildId: canonical.id,
      canonicalFamilyId: canonical.family.id,
      redundantChildIds: rows.slice(1).map((child) => child.id).sort(),
      redundantFamilyIds: rows.slice(1).map((child) => child.family.id).sort(),
      keepContacts: keepContacts.map((contact) => ({ id: contact.id, fromFamilyId: contact.familyId })).sort((left, right) => left.id.localeCompare(right.id)),
      duplicateContactIds: contacts.filter((contact) => !keepContactIds.has(contact.id)).map((contact) => contact.id).sort(),
    };
    return { snapshot, rows, canonical };
  });

  const fingerprint = createHash("sha256").update(JSON.stringify({ centerId: state.center.id, groups: groups.map((group) => group.snapshot) })).digest("hex");
  return {
    procareChildren,
    sourceGroups,
    groups,
    fingerprint,
    redundantChildIds: groups.flatMap((group) => group.snapshot.redundantChildIds),
    redundantFamilyIds: groups.flatMap((group) => group.snapshot.redundantFamilyIds),
    contactsToMove: groups.flatMap((group) => group.snapshot.keepContacts.filter((contact) => contact.fromFamilyId !== group.snapshot.canonicalFamilyId).map((contact) => contact.id)),
    duplicateContactIds: groups.flatMap((group) => group.snapshot.duplicateContactIds),
  };
}

function currentChildren(children: ChildRow[]) {
  return children.filter((child) => CURRENT_STATUSES.has(normalizeStatus(child.enrollmentStatus)) && child.classroomId);
}

function publicState(state: State) {
  const procare = state.children.filter((child) => child.sourceSystem === PROCARE_SOURCE && child.externalId);
  const uniqueProcareIds = new Set(procare.map((child) => child.externalId));
  const current = currentChildren(state.children);
  const currentUnique = new Set(current.map((child) => `${nameKey(child.fullName)}:${dateKey(child.dateOfBirth)}`));
  const rooms = Object.entries(Object.groupBy(current, (child) => child.classroomId ?? "UNASSIGNED")).map(([classroomId, rows]) => ({ classroomId, records: rows?.length ?? 0, uniqueChildren: new Set(rows?.map((child) => `${nameKey(child.fullName)}:${dateKey(child.dateOfBirth)}`)).size }));
  return {
    center: CENTER_LOCATION_ID,
    childRecords: state.children.length,
    families: state.familyCount,
    procareChildRecords: procare.length,
    uniqueProcareChildren: uniqueProcareIds.size,
    currentRecords: current.length,
    uniqueCurrentChildren: currentUnique.size,
    dropInRecords: state.children.filter((child) => normalizeStatus(child.enrollmentStatus) === "drop_in").length,
    statuses: statusCounts(state.children),
    classrooms: rooms,
  };
}

function assertImportBoundary(state: State) {
  invariant(state.importBatches.length === 1, `Expected one preserved Lee's Summit import batch; found ${state.importBatches.length}.`);
  const batch = state.importBatches[0];
  invariant(batch.filename === "Child W relationship.csv" && batch.status === "processing" && batch._count.rows === 0, "The preserved Lee's Summit import batch changed.");
}

function assertPreRepair(state: State, repair: ReturnType<typeof deriveRepair>) {
  assertImportBoundary(state);
  invariant(state.children.length === 623 && state.familyCount === 623, "Lee's Summit pre-repair child/family counts changed.");
  invariant(repair.procareChildren.length === 621, `Expected 621 ProCare child rows; found ${repair.procareChildren.length}.`);
  invariant(repair.sourceGroups.length === 222, `Expected 222 unique ProCare child IDs; found ${repair.sourceGroups.length}.`);
  invariant(repair.groups.length === 146, `Expected 146 duplicate ProCare child groups; found ${repair.groups.length}.`);
  invariant(repair.redundantChildIds.length === 399 && repair.redundantFamilyIds.length === 399, "Expected 399 redundant child/family records.");
  invariant(repair.contactsToMove.length === 398, `Expected 398 relationship contacts to move; found ${repair.contactsToMove.length}.`);
  invariant(repair.duplicateContactIds.length === 0, "No source-distinct relationship contact may be deleted.");
  invariant(repair.fingerprint === EXPECTED_PRE_FINGERPRINT, "Lee's Summit live duplicates no longer match the reviewed relationship-row evidence.");
  invariant(currentChildren(state.children).length === 81, "Expected 81 pre-repair current classroom records.");
  invariant(state.children.filter((child) => normalizeStatus(child.enrollmentStatus) === "drop_in").length === 20, "Expected 20 pre-repair drop-in rows.");
  invariant(state.children.filter((child) => child.sourceSystem === TEST_SOURCE).length === 2, "Expected two isolated test records.");
  assertStatusCounts(statusCounts(state.children), EXPECTED_PRE_STATUSES, "Pre-repair");
}

function isPostRepair(state: State) {
  const procare = state.children.filter((child) => child.sourceSystem === PROCARE_SOURCE && child.externalId);
  const grouped = Object.groupBy(procare, (child) => child.externalId!);
  const metadata = jsonObject(state.priorRepair?.metadata as Prisma.JsonValue | null);
  return state.children.length === 224
    && state.familyCount === 224
    && procare.length === 222
    && Object.keys(grouped).length === 222
    && Object.values(grouped).every((rows) => rows?.length === 1)
    && currentChildren(state.children).length === 27
    && state.children.filter((child) => normalizeStatus(child.enrollmentStatus) === "drop_in").length === 8
    && state.children.filter((child) => child.sourceSystem === TEST_SOURCE).length === 2
    && metadata.preFingerprint === EXPECTED_PRE_FINGERPRINT;
}

function assertPostRepair(state: State, repair?: ReturnType<typeof deriveRepair>) {
  assertImportBoundary(state);
  invariant(isPostRepair(state), "Lee's Summit did not reach the guarded post-repair state.");
  assertStatusCounts(statusCounts(state.children), EXPECTED_POST_STATUSES, "Post-repair");
  if (!repair) return;
  const byId = new Map(state.children.map((child) => [child.id, child]));
  for (const group of repair.groups) {
    const canonical = byId.get(group.snapshot.canonicalChildId);
    invariant(canonical && canonical.family.id === group.snapshot.canonicalFamilyId, `Canonical child ${group.snapshot.externalId} was not preserved.`);
    invariant(group.snapshot.redundantChildIds.every((id) => !byId.has(id)), `A redundant child remains for ${group.snapshot.externalId}.`);
    const fields = jsonObject(canonical.customFields);
    const consolidation = jsonObject(fields.duplicateConsolidation as Prisma.JsonValue | null);
    invariant(consolidation.preFingerprint === EXPECTED_PRE_FINGERPRINT, `Canonical child ${group.snapshot.externalId} is missing consolidation evidence.`);
    invariant(Array.isArray(fields.procareRelationshipRows) && fields.procareRelationshipRows.length === group.rows.length, `Canonical child ${group.snapshot.externalId} did not preserve every source relationship row.`);
    invariant(group.snapshot.keepContacts.every((contact) => canonical.family.emergencyContacts.some((candidate) => candidate.id === contact.id)), `Canonical family ${group.snapshot.externalId} did not preserve every relationship contact.`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-mo-lees-summit");
  const initial = await readState(prisma);

  if (isPostRepair(initial)) {
    assertPostRepair(initial);
    console.log(JSON.stringify({ ok: true, applied: false, alreadyRepaired: true, state: publicState(initial) }, null, 2));
    return;
  }

  const repair = deriveRepair(initial);
  assertPreRepair(initial, repair);
  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      preFingerprint: repair.fingerprint,
      affectedChildren: repair.groups.length,
      wouldRemoveRedundantChildRecords: repair.redundantChildIds.length,
      wouldRemoveRedundantFamilyRecords: repair.redundantFamilyIds.length,
      wouldMoveRelationshipContacts: repair.contactsToMove.length,
      wouldDeleteRelationshipContacts: repair.duplicateContactIds.length,
      projectedCurrentChildren: 27,
      projectedDropInRecords: 8,
      enrollmentStatusesChanged: false,
      billingChanged: false,
      paymentsChanged: false,
      messagesChanged: false,
      identitiesChanged: false,
      accessChanged: false,
      state: publicState(initial),
    }, null, 2));
    return;
  }

  invariant(confirmed, "Apply mode requires --confirm-mo-lees-summit.");
  const result = await prisma.$transaction(async (tx) => {
    const before = await readState(tx);
    const guarded = deriveRepair(before);
    assertPreRepair(before, guarded);
    const consolidatedAt = new Date().toISOString();
    let movedContacts = 0;

    for (const group of guarded.groups) {
      const contactIds = group.snapshot.keepContacts.filter((contact) => contact.fromFamilyId !== group.snapshot.canonicalFamilyId).map((contact) => contact.id);
      if (contactIds.length) {
        const moved = await tx.emergencyContact.updateMany({ where: { id: { in: contactIds } }, data: { familyId: group.snapshot.canonicalFamilyId } });
        invariant(moved.count === contactIds.length, `Expected to move ${contactIds.length} relationship contacts for ${group.snapshot.externalId}; moved ${moved.count}.`);
        movedContacts += moved.count;
      }

      const canonicalFields = jsonObject(group.canonical.customFields);
      await tx.child.update({
        where: { id: group.snapshot.canonicalChildId },
        data: {
          customFields: {
            ...canonicalFields,
            duplicateConsolidation: {
              source: REPAIR_SOURCE,
              preFingerprint: EXPECTED_PRE_FINGERPRINT,
              mergedChildRecords: group.rows.length,
              preservedRelationshipRows: group.rows.length,
              movedRelationshipContacts: contactIds.length,
              enrollmentStatusChanged: false,
              consolidatedAt,
            },
            procareRelationshipRows: group.rows.map((child) => ({
              sourceChildRecordId: child.id,
              sourceFamilyRecordId: child.family.id,
              rawData: cloneJson(jsonObject(child.customFields).rawData),
            })),
          } as Prisma.InputJsonValue,
        },
      });
    }

    invariant(movedContacts === guarded.contactsToMove.length, `Expected to move ${guarded.contactsToMove.length} relationship contacts; moved ${movedContacts}.`);
    const deletedChildren = await tx.child.deleteMany({ where: { id: { in: guarded.redundantChildIds }, family: { centerId: before.center.id } } });
    invariant(deletedChildren.count === guarded.redundantChildIds.length, `Expected to delete ${guarded.redundantChildIds.length} redundant child rows; deleted ${deletedChildren.count}.`);
    const deletedFamilies = await tx.family.deleteMany({ where: { id: { in: guarded.redundantFamilyIds }, centerId: before.center.id } });
    invariant(deletedFamilies.count === guarded.redundantFamilyIds.length, `Expected to delete ${guarded.redundantFamilyIds.length} redundant family rows; deleted ${deletedFamilies.count}.`);

    await tx.auditLog.create({
      data: {
        tenantId: before.center.organization.tenantId,
        centerId: before.center.id,
        action: "procare.lees_summit_duplicate_children.consolidated",
        resource: "Center",
        resourceId: before.center.id,
        metadata: {
          source: REPAIR_SOURCE,
          preFingerprint: EXPECTED_PRE_FINGERPRINT,
          affectedChildren: guarded.groups.length,
          removedChildRecords: deletedChildren.count,
          removedFamilyRecords: deletedFamilies.count,
          movedRelationshipContacts: movedContacts,
          deletedRelationshipContacts: 0,
          preservedRelationshipRows: guarded.groups.reduce((total, group) => total + group.rows.length, 0),
          currentChildren: 27,
          dropInRecords: 8,
          enrollmentStatusesChanged: false,
          billingChanged: false,
          paymentsChanged: false,
          messagesChanged: false,
          identitiesChanged: false,
          accessChanged: false,
          importBatchChanged: false,
          consolidatedAt,
        },
      },
    });

    const after = await readState(tx);
    assertPostRepair(after, guarded);
    invariant(after.boundary.children === before.boundary.children - guarded.redundantChildIds.length, "The child inventory changed outside the reviewed duplicate rows.");
    invariant(after.boundary.families === before.boundary.families - guarded.redundantFamilyIds.length, "The family inventory changed outside the reviewed duplicate rows.");
    invariant(after.boundary.emergencyContacts === before.boundary.emergencyContacts, "Relationship contact inventory changed unexpectedly.");
    invariant(after.boundary.auditLogs === before.boundary.auditLogs + 1, "Expected one consolidation audit record.");
    for (const key of ["authorizedPickups", "guardians", "linkedGuardianUsers", "billingAccounts", "invoices", "payments", "messages", "tenantUsers", "centerAccessGrants", "importBatches", "importRows"] as const) {
      invariant(after.boundary[key] === before.boundary[key], `${key} changed unexpectedly.`);
    }
    return { affectedChildren: guarded.groups.length, removedChildRecords: deletedChildren.count, removedFamilyRecords: deletedFamilies.count, movedRelationshipContacts: movedContacts, preservedRelationshipRows: guarded.groups.reduce((total, group) => total + group.rows.length, 0), currentChildren: 27, dropInRecords: 8 };
  }, { maxWait: 10_000, timeout: 180_000 });

  const finalState = await readState(prisma);
  assertPostRepair(finalState, repair);
  console.log(JSON.stringify({ ok: true, applied: true, result, state: publicState(finalState) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
