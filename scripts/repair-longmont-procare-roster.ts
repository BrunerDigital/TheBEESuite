import "./load-env";
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_LOCATION_ID = "CO | Longmont";
const CENTER_NAME = "Kid City USA - Longmont";
const PROCARE_SOURCE = "procare";
const TEST_SOURCE = "bee_suite_parent_invite_test";
const EXPECTED_PLAN_HASH = "e611c3fd1bec628c";
const EXPECTED_SOURCE_CHILDREN = 557;
const EXPECTED_TARGET_CHILDREN = 72;
const EXPECTED_MISSING_TARGET_CHILDREN = 13;
const EXPECTED_PRE_REPAIR_PROCARE_CHILDREN = 514;
const EXPECTED_POST_REPAIR_PROCARE_CHILDREN = 527;
const EXPECTED_TEST_CHILDREN = 3;

type StatusGroup = "withdrawn" | "summer_break" | "waitlisted" | "pre_registered" | "not_enrolled";

type PlanRoom = {
  externalId: string;
  name: string;
  children: string[];
};

type TargetChild = {
  externalId: string;
  personId: string;
  fullName: string;
  lastName: string;
  dateOfBirth: string;
  startDate: string;
  roomExternalId: string;
  roomName: string;
  familyKey: string;
  rowId: string;
};

type SourceRelationship = {
  familyKey: string;
  externalId: string;
  fullName: string;
  email: string;
  phone: string;
  relation: string;
  guardian: boolean;
  emergency: boolean;
  authorizedPickup: boolean;
  livesWith: boolean;
};

type RepairPlan = {
  version: number;
  centerLocationId: string;
  centerName: string;
  repairSource: string;
  sourceFolderId: string;
  selection: {
    sourceChildren: number;
    sourceEnrolled: number;
    scheduledChildren: number;
    billedChildren: number;
    staleAttendanceThreshold: string;
    staleBilledOutliers: number;
    targetCurrentChildren: number;
    missingTargetChildren: number;
  };
  statusGroups: Record<StatusGroup, string[]>;
  rooms: PlanRoom[];
  targetDetails: TargetChild[];
  relationships: SourceRelationship[];
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fnv1a64Utf16(value: string) {
  let hash = BigInt("14695981039346656037");
  const prime = BigInt("1099511628211");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

function parseDate(value: string, label: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  invariant(match, `${label} must use M/D/YYYY format.`);
  const [, month, day, year] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  invariant(!Number.isNaN(parsed.valueOf()), `${label} is not a valid date.`);
  return parsed;
}

function parseOptionalDate(value: string, label: string) {
  return value.trim() ? parseDate(value, label) : null;
}

function unique(values: string[], label: string) {
  const normalized = values.map((value) => value.trim());
  invariant(normalized.every(Boolean), `${label} contains a blank identifier.`);
  invariant(new Set(normalized).size === normalized.length, `${label} contains duplicate identifiers.`);
  return normalized;
}

function readPlan() {
  const planPath = process.env.LONGMONT_REPAIR_PLAN_PATH?.trim();
  const raw = planPath
    ? readFileSync(planPath, "utf8").trimEnd()
    : process.env.LONGMONT_REPAIR_PLAN_JSON ?? "";
  invariant(raw, "LONGMONT_REPAIR_PLAN_PATH or LONGMONT_REPAIR_PLAN_JSON is required.");
  invariant(fnv1a64Utf16(raw) === EXPECTED_PLAN_HASH, "The Longmont source plan does not match the reviewed ProCare export evidence.");
  const plan = JSON.parse(raw) as RepairPlan;
  invariant(plan.version === 1, `Expected plan version 1; found ${plan.version}.`);
  invariant(plan.centerLocationId === CENTER_LOCATION_ID, `Expected ${CENTER_LOCATION_ID}; found ${plan.centerLocationId}.`);
  invariant(plan.centerName === CENTER_NAME, `Expected ${CENTER_NAME}; found ${plan.centerName}.`);
  invariant(plan.selection.sourceChildren === EXPECTED_SOURCE_CHILDREN, `Expected ${EXPECTED_SOURCE_CHILDREN} source children.`);
  invariant(plan.selection.targetCurrentChildren === EXPECTED_TARGET_CHILDREN, `Expected ${EXPECTED_TARGET_CHILDREN} target children.`);
  invariant(plan.selection.missingTargetChildren === EXPECTED_MISSING_TARGET_CHILDREN, `Expected ${EXPECTED_MISSING_TARGET_CHILDREN} missing target children.`);
  invariant(plan.selection.sourceEnrolled === 80, "Expected 80 source rows marked Enrolled.");
  invariant(plan.selection.scheduledChildren === 75, "Expected 75 scheduled children.");
  invariant(plan.selection.billedChildren === 73, "Expected 73 contract-billing children.");
  invariant(plan.selection.staleBilledOutliers === 1, "Expected one stale billed-attendance outlier.");

  const targetIds = unique(plan.rooms.flatMap((room) => room.children), "Target roster");
  invariant(targetIds.length === EXPECTED_TARGET_CHILDREN, `Expected ${EXPECTED_TARGET_CHILDREN} unique target children; found ${targetIds.length}.`);
  invariant(plan.rooms.length === 6, `Expected six target classrooms; found ${plan.rooms.length}.`);
  const roomIds = unique(plan.rooms.map((room) => room.externalId), "Target classrooms");
  invariant(roomIds.length === plan.rooms.length, "Target classroom identifiers are not unique.");
  const nonCurrentIds = unique(Object.values(plan.statusGroups).flat(), "Non-current source roster");
  invariant(targetIds.length + nonCurrentIds.length === EXPECTED_SOURCE_CHILDREN, "The target and non-current source groups do not cover all source children.");
  invariant(targetIds.every((id) => !nonCurrentIds.includes(id)), "A source child appears in both current and non-current groups.");
  const missingIds = unique(plan.targetDetails.map((child) => child.externalId), "Missing current children");
  invariant(missingIds.length === EXPECTED_MISSING_TARGET_CHILDREN, `Expected ${EXPECTED_MISSING_TARGET_CHILDREN} missing child details.`);
  invariant(missingIds.every((id) => targetIds.includes(id)), "A missing child is not part of the target roster.");
  for (const child of plan.targetDetails) {
    invariant(child.fullName.trim(), `Missing child ${child.externalId} has no name.`);
    invariant(child.familyKey.trim(), `Missing child ${child.externalId} has no unambiguous ProCare account key.`);
    parseDate(child.dateOfBirth, `Date of birth for child ${child.externalId}`);
    parseOptionalDate(child.startDate, `Start date for child ${child.externalId}`);
    const room = plan.rooms.find((candidate) => candidate.externalId === child.roomExternalId);
    invariant(room?.name === child.roomName, `Missing child ${child.externalId} does not match a target classroom.`);
  }
  return { plan, targetIds, nonCurrentIds, missingIds };
}

type RepairDb = Pick<
  Prisma.TransactionClient,
  "auditLog" | "authorizedPickup" | "center" | "child" | "classroom" | "emergencyContact" | "family" | "guardian" | "procareImportBatch"
>;

async function readState(db: RepairDb, plan: RepairPlan) {
  const centers = await db.center.findMany({
    where: { crmLocationId: CENTER_LOCATION_ID },
    take: 2,
    select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } },
  });
  invariant(centers.length === 1, `Expected exactly one ${CENTER_LOCATION_ID} center; found ${centers.length}.`);
  const center = centers[0];
  invariant(center.name === CENTER_NAME, `Expected center name ${CENTER_NAME}; found ${center.name}.`);
  invariant(center.status === "active", `Expected ${CENTER_NAME} to be active; found ${center.status}.`);

  const [procareChildren, classrooms, testChildren, linkedTestGuardianUsers, familyTotal, importBatches] = await Promise.all([
    db.child.findMany({
      where: { sourceSystem: PROCARE_SOURCE, family: { centerId: center.id } },
      select: { id: true, externalId: true, enrollmentStatus: true, classroomId: true, familyId: true },
      orderBy: { externalId: "asc" },
    }),
    db.classroom.findMany({
      where: { centerId: center.id },
      select: { id: true, name: true, sourceSystem: true, externalId: true },
      orderBy: { name: "asc" },
    }),
    db.child.findMany({
      where: { family: { centerId: center.id, sourceSystem: TEST_SOURCE } },
      select: { id: true, enrollmentStatus: true, classroomId: true },
    }),
    db.guardian.count({ where: { userId: { not: null }, family: { centerId: center.id, sourceSystem: TEST_SOURCE } } }),
    db.family.count({ where: { centerId: center.id } }),
    db.procareImportBatch.findMany({
      where: { centerId: center.id },
      select: { id: true, status: true, _count: { select: { rows: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const sourceIds = new Set([...plan.rooms.flatMap((room) => room.children), ...Object.values(plan.statusGroups).flat()]);
  const liveIds = procareChildren.map((child) => child.externalId);
  invariant(liveIds.every(Boolean), "A Longmont ProCare child is missing an external identifier.");
  invariant(new Set(liveIds).size === liveIds.length, "Longmont has duplicate ProCare child external identifiers.");
  invariant(liveIds.every((id) => sourceIds.has(id!)), "A live Longmont ProCare child is absent from the reviewed enrollment export.");

  return { center, procareChildren, classrooms, testChildren, linkedTestGuardianUsers, familyTotal, importBatches };
}

function targetRoomMap(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  const result = new Map<string, string>();
  for (const expected of plan.rooms) {
    const matches = state.classrooms.filter((room) => room.sourceSystem === PROCARE_SOURCE && room.externalId === expected.externalId);
    invariant(matches.length === 1, `Expected one ProCare classroom ${expected.externalId}; found ${matches.length}.`);
    invariant(matches[0].name === expected.name, `Expected classroom ${expected.externalId} to be ${expected.name}; found ${matches[0].name}.`);
    result.set(expected.externalId, matches[0].id);
  }
  return result;
}

function isPostRepair(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  if (state.procareChildren.length !== EXPECTED_POST_REPAIR_PROCARE_CHILDREN) return false;
  if (state.testChildren.some((child) => child.enrollmentStatus !== "not_enrolled" || child.classroomId)) return false;
  const roomIds = targetRoomMap(state, plan);
  const byExternalId = new Map(state.procareChildren.map((child) => [child.externalId!, child]));
  for (const room of plan.rooms) {
    for (const externalId of room.children) {
      const child = byExternalId.get(externalId);
      if (!child || child.enrollmentStatus !== "enrolled" || child.classroomId !== roomIds.get(room.externalId)) return false;
    }
  }
  for (const [status, externalIds] of Object.entries(plan.statusGroups)) {
    for (const externalId of externalIds) {
      const child = byExternalId.get(externalId);
      if (child && (child.enrollmentStatus !== status || child.classroomId)) return false;
    }
  }
  return true;
}

function publicState(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  const targetIds = new Set(plan.rooms.flatMap((room) => room.children));
  const current = state.procareChildren.filter((child) => targetIds.has(child.externalId!) && child.enrollmentStatus === "enrolled" && child.classroomId);
  return {
    center: CENTER_LOCATION_ID,
    procareChildren: state.procareChildren.length,
    currentProcareChildren: current.length,
    sourceChildrenStillHeldForReview: EXPECTED_SOURCE_CHILDREN - state.procareChildren.length,
    familyTotal: state.familyTotal,
    testChildrenStillCurrent: state.testChildren.filter((child) => child.enrollmentStatus !== "not_enrolled" || child.classroomId).length,
    linkedTestGuardianUsersPreserved: state.linkedTestGuardianUsers,
    classrooms: plan.rooms.map((room) => ({ externalId: room.externalId, name: room.name, children: room.children.length })),
    importBatches: state.importBatches.map((batch) => ({ status: batch.status, rows: batch._count.rows })),
  };
}

async function resolveOrCreateFamily(
  tx: Prisma.TransactionClient,
  centerId: string,
  child: TargetChild,
  repairedAt: string,
) {
  const direct = await tx.family.findMany({
    where: { centerId, sourceSystem: PROCARE_SOURCE, externalId: child.familyKey },
    take: 2,
    select: { id: true },
  });
  invariant(direct.length <= 1, `More than one ProCare family uses source account ${child.familyKey}.`);
  if (direct[0]) return { familyId: direct[0].id, created: false };

  const created = await tx.family.create({
    data: {
      centerId,
      name: `${child.lastName.trim() || "ProCare"} Family`,
      sourceSystem: PROCARE_SOURCE,
      externalId: child.familyKey,
      customFields: {
        source: "longmont_procare_account_relationship",
        repairSource: "longmont_procare_reconciliation_2026_07_31",
        sourceAccountKeyPresent: true,
        billingImported: false,
        accessCreated: false,
        repairedAt,
      },
    },
    select: { id: true },
  });
  return { familyId: created.id, created: true };
}

async function main() {
  const { plan, targetIds, missingIds } = readPlan();
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-co-longmont");
  const initial = await readState(prisma, plan);
  targetRoomMap(initial, plan);

  if (isPostRepair(initial, plan)) {
    console.log(JSON.stringify({ ok: true, applied: false, alreadyRepaired: true, state: publicState(initial, plan) }, null, 2));
    return;
  }

  invariant(initial.procareChildren.length === EXPECTED_PRE_REPAIR_PROCARE_CHILDREN, `Expected ${EXPECTED_PRE_REPAIR_PROCARE_CHILDREN} pre-repair ProCare children; found ${initial.procareChildren.length}.`);
  invariant(initial.testChildren.length === EXPECTED_TEST_CHILDREN, `Expected ${EXPECTED_TEST_CHILDREN} isolated test children; found ${initial.testChildren.length}.`);
  const existingTargetIds = new Set(initial.procareChildren.filter((child) => targetIds.includes(child.externalId!)).map((child) => child.externalId!));
  invariant(existingTargetIds.size === EXPECTED_TARGET_CHILDREN - EXPECTED_MISSING_TARGET_CHILDREN, `Expected 59 existing target children; found ${existingTargetIds.size}.`);
  invariant(missingIds.every((id) => !existingTargetIds.has(id)), "A plan child described as missing already exists in the guarded pre-repair state.");

  const existingFamilyKeys = new Set((await prisma.family.findMany({
    where: { centerId: initial.center.id, sourceSystem: PROCARE_SOURCE, externalId: { in: plan.targetDetails.map((child) => child.familyKey) } },
    select: { externalId: true },
  })).map((family) => family.externalId).filter(Boolean) as string[]);
  const wouldCreateFamilyKeys = new Set(plan.targetDetails.map((child) => child.familyKey).filter((key) => !existingFamilyKeys.has(key)));

  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      planHash: EXPECTED_PLAN_HASH,
      sourceEvidence: plan.selection,
      wouldCreateCurrentChildren: EXPECTED_MISSING_TARGET_CHILDREN,
      wouldCreateFamilies: wouldCreateFamilyKeys.size,
      wouldNormalizeExistingProcareChildren: initial.procareChildren.length,
      wouldRetireTestChildren: initial.testChildren.length,
      wouldCreateRelationshipRecordsOnlyForNewFamilies: plan.relationships.filter((relationship) => wouldCreateFamilyKeys.has(relationship.familyKey)).length,
      billingChanged: false,
      invitationsChanged: false,
      identitiesChanged: false,
      state: publicState(initial, plan),
    }, null, 2));
    return;
  }
  invariant(confirmed, "Apply mode requires --confirm-co-longmont.");

  const result = await prisma.$transaction(async (tx) => {
    const before = await readState(tx, plan);
    invariant(before.procareChildren.length === EXPECTED_PRE_REPAIR_PROCARE_CHILDREN, "The guarded Longmont roster changed after the dry run.");
    invariant(before.testChildren.length === EXPECTED_TEST_CHILDREN, "The guarded Longmont test roster changed after the dry run.");
    const repairedAt = new Date().toISOString();
    const roomIds = targetRoomMap(before, plan);
    const familyIdByKey = new Map<string, string>();
    const createdFamilyKeys = new Set<string>();
    let createdChildren = 0;

    for (const child of plan.targetDetails) {
      let familyId = familyIdByKey.get(child.familyKey);
      if (!familyId) {
        const family = await resolveOrCreateFamily(tx, before.center.id, child, repairedAt);
        familyId = family.familyId;
        familyIdByKey.set(child.familyKey, familyId);
        if (family.created) createdFamilyKeys.add(child.familyKey);
      }
      const classroomId = roomIds.get(child.roomExternalId);
      invariant(classroomId, `Missing target classroom ${child.roomExternalId}.`);
      await tx.child.create({
        data: {
          familyId,
          classroomId,
          fullName: child.fullName,
          dateOfBirth: parseDate(child.dateOfBirth, `Date of birth for child ${child.externalId}`),
          ageGroup: child.roomName,
          enrollmentStatus: "enrolled",
          startDate: parseOptionalDate(child.startDate, `Start date for child ${child.externalId}`),
          sourceSystem: PROCARE_SOURCE,
          externalId: child.externalId,
          customFields: {
            source: plan.repairSource,
            sourceFolderId: plan.sourceFolderId,
            sourceRowId: child.rowId,
            sourcePersonId: child.personId,
            sourceAccountKeyPresent: true,
            currentRosterEvidence: "reviewed ProCare enrollment, classroom schedule, contract billing, and attendance exports",
            billingImported: false,
            accessCreated: false,
            repairedAt,
          },
        },
      });
      createdChildren += 1;
    }
    invariant(createdChildren === EXPECTED_MISSING_TARGET_CHILDREN, `Expected to create ${EXPECTED_MISSING_TARGET_CHILDREN} children; created ${createdChildren}.`);

    let currentUpdates = 0;
    for (const room of plan.rooms) {
      const classroomId = roomIds.get(room.externalId);
      invariant(classroomId, `Missing target classroom ${room.externalId}.`);
      const updated = await tx.child.updateMany({
        where: { sourceSystem: PROCARE_SOURCE, externalId: { in: room.children }, family: { centerId: before.center.id } },
        data: { enrollmentStatus: "enrolled", classroomId, ageGroup: room.name },
      });
      invariant(updated.count === room.children.length, `Expected ${room.children.length} children in ${room.name}; updated ${updated.count}.`);
      currentUpdates += updated.count;
    }

    let nonCurrentUpdates = 0;
    for (const [status, externalIds] of Object.entries(plan.statusGroups)) {
      const expectedExisting = before.procareChildren.filter((child) => externalIds.includes(child.externalId!)).length;
      const updated = await tx.child.updateMany({
        where: { sourceSystem: PROCARE_SOURCE, externalId: { in: externalIds }, family: { centerId: before.center.id } },
        data: { enrollmentStatus: status, classroomId: null },
      });
      invariant(updated.count === expectedExisting, `Expected to normalize ${expectedExisting} ${status} children; updated ${updated.count}.`);
      nonCurrentUpdates += updated.count;
    }

    const retiredTests = await tx.child.updateMany({
      where: { id: { in: before.testChildren.map((child) => child.id) }, family: { centerId: before.center.id, sourceSystem: TEST_SOURCE } },
      data: { enrollmentStatus: "not_enrolled", classroomId: null },
    });
    invariant(retiredTests.count === EXPECTED_TEST_CHILDREN, `Expected to retire ${EXPECTED_TEST_CHILDREN} test children; updated ${retiredTests.count}.`);

    let guardiansCreated = 0;
    let emergencyContactsCreated = 0;
    let pickupsCreated = 0;
    for (const relationship of plan.relationships) {
      if (!createdFamilyKeys.has(relationship.familyKey)) continue;
      const familyId = familyIdByKey.get(relationship.familyKey);
      invariant(familyId, "A new family is missing from the guarded family map.");
      const metadata = { source: plan.repairSource, sourceFolderId: plan.sourceFolderId, livesWith: relationship.livesWith, accessCreated: false, repairedAt };
      if (relationship.guardian) {
        const existing = await tx.guardian.findFirst({ where: { familyId, sourceSystem: PROCARE_SOURCE, externalId: relationship.externalId }, select: { id: true } });
        if (!existing) {
          await tx.guardian.create({ data: { familyId, fullName: relationship.fullName, email: relationship.email || null, phone: relationship.phone || null, relation: relationship.relation, isBillingContact: false, sourceSystem: PROCARE_SOURCE, externalId: relationship.externalId, customFields: metadata } });
          guardiansCreated += 1;
        }
      }
      if (relationship.emergency) {
        const existing = await tx.emergencyContact.findFirst({ where: { familyId, sourceSystem: PROCARE_SOURCE, externalId: relationship.externalId }, select: { id: true } });
        if (!existing) {
          await tx.emergencyContact.create({ data: { familyId, fullName: relationship.fullName, phone: relationship.phone || "Not imported", relation: relationship.relation, sourceSystem: PROCARE_SOURCE, externalId: relationship.externalId, customFields: metadata } });
          emergencyContactsCreated += 1;
        }
      }
      if (relationship.authorizedPickup) {
        const existing = await tx.authorizedPickup.findFirst({ where: { familyId, sourceSystem: PROCARE_SOURCE, externalId: relationship.externalId }, select: { id: true } });
        if (!existing) {
          await tx.authorizedPickup.create({ data: { familyId, fullName: relationship.fullName, phone: relationship.phone || null, relation: relationship.relation, verificationNotes: "Imported from ProCare; director should verify identity requirements.", sourceSystem: PROCARE_SOURCE, externalId: relationship.externalId, customFields: metadata } });
          pickupsCreated += 1;
        }
      }
    }

    await tx.auditLog.create({
      data: {
        tenantId: before.center.organization.tenantId,
        centerId: before.center.id,
        action: "procare.longmont_roster.reconciled",
        resource: "Center",
        resourceId: before.center.id,
        metadata: {
          source: plan.repairSource,
          sourceFolderId: plan.sourceFolderId,
          planHash: EXPECTED_PLAN_HASH,
          sourceEvidence: plan.selection,
          currentChildren: EXPECTED_TARGET_CHILDREN,
          currentRoomDistribution: plan.rooms.map((room) => ({ externalId: room.externalId, name: room.name, children: room.children.length })),
          createdChildren,
          createdFamilies: createdFamilyKeys.size,
          guardiansCreated,
          emergencyContactsCreated,
          authorizedPickupsCreated: pickupsCreated,
          normalizedCurrentChildren: currentUpdates,
          normalizedNonCurrentChildren: nonCurrentUpdates,
          retiredTestChildren: retiredTests.count,
          sourceChildrenHeldForReview: EXPECTED_SOURCE_CHILDREN - EXPECTED_POST_REPAIR_PROCARE_CHILDREN,
          billingChanged: false,
          invitationsChanged: false,
          identitiesChanged: false,
          historicalAttendanceImported: false,
          employeeAccessChanged: false,
          procareImportBatchChanged: false,
          repairedAt,
        },
      },
    });

    const after = await readState(tx, plan);
    invariant(isPostRepair(after, plan), "Longmont did not reach the guarded post-repair state.");
    invariant(after.linkedTestGuardianUsers === before.linkedTestGuardianUsers, "Linked test guardian identities changed unexpectedly.");
    invariant(after.importBatches.length === before.importBatches.length, "The ProCare import batch inventory changed unexpectedly.");
    invariant(after.importBatches.every((batch, index) => batch.id === before.importBatches[index]?.id && batch.status === before.importBatches[index]?.status && batch._count.rows === before.importBatches[index]?._count.rows), "A ProCare import batch changed unexpectedly.");
    const dashboardCurrentChildren = await tx.child.count({
      where: { sourceSystem: PROCARE_SOURCE, enrollmentStatus: "enrolled", classroomId: { not: null }, family: { centerId: before.center.id } },
    });
    invariant(dashboardCurrentChildren === EXPECTED_TARGET_CHILDREN, `Expected ${EXPECTED_TARGET_CHILDREN} current dashboard children; found ${dashboardCurrentChildren}.`);
    const dashboardCurrentFamilies = await tx.family.count({
      where: { centerId: before.center.id, children: { some: { sourceSystem: PROCARE_SOURCE, enrollmentStatus: "enrolled", classroomId: { not: null } } } },
    });
    return { createdChildren, createdFamilies: createdFamilyKeys.size, guardiansCreated, emergencyContactsCreated, authorizedPickupsCreated: pickupsCreated, retiredTestChildren: retiredTests.count, dashboardCurrentChildren, dashboardCurrentFamilies };
  }, { maxWait: 10_000, timeout: 120_000 });

  const finalState = await readState(prisma, plan);
  invariant(isPostRepair(finalState, plan), "Longmont final verification failed after commit.");
  console.log(JSON.stringify({ ok: true, applied: true, result, state: publicState(finalState, plan) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
