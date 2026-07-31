import "./load-env";
import type { Prisma } from "@prisma/client";
import { currentlyEnrolledStatusValues, isCurrentlyEnrolledStatus } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";

const CENTER_LOCATION_ID = "MO | Lees Summit";
const CENTER_NAME = "Kid City USA - Lees Summit";
const REPAIR_SOURCE = "lees_summit_primary_classroom_repair_2026_07_31";
const TEST_SOURCE = "bee_suite_parent_invite_test";
const PROCARE_SOURCE = "procare";

const EXPECTED = {
  familyTotal: 623,
  procareFamilies: 621,
  procareChildren: 621,
  currentProcareChildren: 81,
  testFamilies: 2,
  testChildren: 2,
  linkedTestGuardianUsers: 2,
} as const;

const EXPECTED_ROOMS = [
  { externalId: "653", name: "Bay Bees (Infant A)", currentChildren: 8 },
  { externalId: "654", name: "New Bees (Infant B)", currentChildren: 3 },
  { externalId: "655", name: "Honey Bees (Twos)", currentChildren: 28 },
  { externalId: "656", name: "Buzzing Bees (Threes/Fours)", currentChildren: 27 },
  { externalId: "657", name: "Pollenaters (Preschool)", currentChildren: 15 },
] as const;

type RepairDb = Pick<
  Prisma.TransactionClient,
  "auditLog" | "center" | "child" | "classroom" | "family" | "guardian" | "procareImportBatch"
>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function sourceRoom(child: { customFields: Prisma.JsonValue | null }) {
  const customFields = jsonObject(child.customFields);
  const rawData = jsonObject(customFields.rawData);
  return {
    externalId: String(rawData["classroom id"] ?? "").trim(),
    name: String(rawData["primary classroom"] ?? "").trim(),
  };
}

async function readState(db: RepairDb) {
  const centers = await db.center.findMany({
    where: { crmLocationId: CENTER_LOCATION_ID },
    take: 2,
    select: {
      id: true,
      name: true,
      status: true,
      organization: { select: { tenantId: true } },
    },
  });
  invariant(centers.length === 1, `Expected exactly one ${CENTER_LOCATION_ID} center; found ${centers.length}.`);
  const center = centers[0];
  invariant(center.name === CENTER_NAME, `Expected center name ${CENTER_NAME}; found ${center.name}.`);
  invariant(center.status === "active", `Expected ${CENTER_NAME} to be active; found ${center.status}.`);

  const [familyTotal, procareFamilies, procareChildren, testFamilies, testChildren, linkedTestGuardianUsers, classrooms, importBatches] = await Promise.all([
    db.family.count({ where: { centerId: center.id } }),
    db.family.count({ where: { centerId: center.id, sourceSystem: PROCARE_SOURCE } }),
    db.child.findMany({
      where: { sourceSystem: PROCARE_SOURCE, family: { centerId: center.id, sourceSystem: PROCARE_SOURCE } },
      select: { id: true, enrollmentStatus: true, classroomId: true, customFields: true },
      orderBy: { id: "asc" },
    }),
    db.family.count({ where: { centerId: center.id, sourceSystem: TEST_SOURCE } }),
    db.child.findMany({
      where: { family: { centerId: center.id, sourceSystem: TEST_SOURCE } },
      select: { id: true, enrollmentStatus: true, classroomId: true },
      orderBy: { id: "asc" },
    }),
    db.guardian.count({
      where: { userId: { not: null }, family: { centerId: center.id, sourceSystem: TEST_SOURCE } },
    }),
    db.classroom.findMany({
      where: { centerId: center.id },
      select: { id: true, name: true, sourceSystem: true, externalId: true },
      orderBy: { name: "asc" },
    }),
    db.procareImportBatch.findMany({
      where: { centerId: center.id },
      select: { status: true, _count: { select: { rows: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const currentProcareChildren = procareChildren.filter((child) => isCurrentlyEnrolledStatus(child.enrollmentStatus));
  const roomDistribution = new Map<string, { externalId: string; name: string; childIds: string[] }>();
  for (const child of currentProcareChildren) {
    const room = sourceRoom(child);
    invariant(room.externalId && room.name, "A currently enrolled ProCare child is missing primary-classroom source evidence.");
    const key = `${room.externalId}\u0000${room.name}`;
    const group = roomDistribution.get(key) ?? { ...room, childIds: [] };
    group.childIds.push(child.id);
    roomDistribution.set(key, group);
  }

  return {
    center,
    familyTotal,
    procareFamilies,
    procareChildren,
    currentProcareChildren,
    testFamilies,
    testChildren,
    linkedTestGuardianUsers,
    classrooms,
    importBatches,
    roomDistribution,
  };
}

function assertSharedInvariants(state: Awaited<ReturnType<typeof readState>>) {
  invariant(state.familyTotal === EXPECTED.familyTotal, `Expected ${EXPECTED.familyTotal} total families; found ${state.familyTotal}.`);
  invariant(state.procareFamilies === EXPECTED.procareFamilies, `Expected ${EXPECTED.procareFamilies} ProCare families; found ${state.procareFamilies}.`);
  invariant(state.procareChildren.length === EXPECTED.procareChildren, `Expected ${EXPECTED.procareChildren} ProCare children; found ${state.procareChildren.length}.`);
  invariant(state.currentProcareChildren.length === EXPECTED.currentProcareChildren, `Expected ${EXPECTED.currentProcareChildren} currently enrolled ProCare children; found ${state.currentProcareChildren.length}.`);
  invariant(state.testFamilies === EXPECTED.testFamilies, `Expected ${EXPECTED.testFamilies} test families; found ${state.testFamilies}.`);
  invariant(state.testChildren.length === EXPECTED.testChildren, `Expected ${EXPECTED.testChildren} test children; found ${state.testChildren.length}.`);
  invariant(state.linkedTestGuardianUsers === EXPECTED.linkedTestGuardianUsers, `Expected ${EXPECTED.linkedTestGuardianUsers} linked test guardian users; found ${state.linkedTestGuardianUsers}.`);
  invariant(state.roomDistribution.size === EXPECTED_ROOMS.length, `Expected ${EXPECTED_ROOMS.length} current ProCare classroom groups; found ${state.roomDistribution.size}.`);

  for (const expectedRoom of EXPECTED_ROOMS) {
    const group = state.roomDistribution.get(`${expectedRoom.externalId}\u0000${expectedRoom.name}`);
    invariant(group, `Missing source classroom ${expectedRoom.externalId} / ${expectedRoom.name}.`);
    invariant(group.childIds.length === expectedRoom.currentChildren, `Expected ${expectedRoom.currentChildren} current children in ${expectedRoom.name}; found ${group.childIds.length}.`);
  }

  invariant(state.importBatches.length === 1, `Expected one preserved ProCare import batch; found ${state.importBatches.length}.`);
  invariant(state.importBatches[0].status === "processing", `Expected the preserved ProCare batch to remain processing; found ${state.importBatches[0].status}.`);
  invariant(state.importBatches[0]._count.rows === 0, `Expected the preserved ProCare batch to have zero rows; found ${state.importBatches[0]._count.rows}.`);
}

function isPostRepair(state: Awaited<ReturnType<typeof readState>>) {
  const assignedCurrent = state.currentProcareChildren.filter((child) => child.classroomId).length;
  const currentTestChildren = state.testChildren.filter((child) => isCurrentlyEnrolledStatus(child.enrollmentStatus)).length;
  const procareRooms = state.classrooms.filter((room) => room.sourceSystem === PROCARE_SOURCE);
  const testRooms = state.classrooms.filter((room) => room.sourceSystem === TEST_SOURCE);
  return assignedCurrent === EXPECTED.currentProcareChildren
    && currentTestChildren === 0
    && procareRooms.length === EXPECTED_ROOMS.length
    && testRooms.length === 0;
}

function assertPreRepair(state: Awaited<ReturnType<typeof readState>>) {
  assertSharedInvariants(state);
  invariant(state.currentProcareChildren.every((child) => child.classroomId === null), "The ProCare classroom assignments no longer match the guarded pre-repair state.");
  invariant(state.testChildren.every((child) => isCurrentlyEnrolledStatus(child.enrollmentStatus)), "The test children no longer match the guarded pre-repair enrollment state.");
  const testRooms = state.classrooms.filter((room) => room.sourceSystem === TEST_SOURCE);
  invariant(state.classrooms.length === 1 && testRooms.length === 1, `Expected only one isolated test classroom; found ${state.classrooms.length} total classrooms.`);
  invariant(testRooms[0].name === "BEE Parent Invite Test Classroom", `Unexpected test classroom ${testRooms[0].name}.`);
}

function assertPostRepair(state: Awaited<ReturnType<typeof readState>>) {
  assertSharedInvariants(state);
  invariant(isPostRepair(state), "Lee's Summit did not reach the guarded post-repair state.");
  for (const expectedRoom of EXPECTED_ROOMS) {
    const room = state.classrooms.find((candidate) => candidate.sourceSystem === PROCARE_SOURCE && candidate.externalId === expectedRoom.externalId);
    invariant(room?.name === expectedRoom.name, `Post-repair classroom ${expectedRoom.externalId} does not match ${expectedRoom.name}.`);
  }
}

function publicSummary(state: Awaited<ReturnType<typeof readState>>) {
  return {
    center: CENTER_LOCATION_ID,
    familyTotal: state.familyTotal,
    procareFamilies: state.procareFamilies,
    currentProcareChildren: state.currentProcareChildren.length,
    assignedCurrentProcareChildren: state.currentProcareChildren.filter((child) => child.classroomId).length,
    currentTestChildren: state.testChildren.filter((child) => isCurrentlyEnrolledStatus(child.enrollmentStatus)).length,
    linkedTestGuardianUsers: state.linkedTestGuardianUsers,
    classrooms: state.classrooms.map((room) => ({ name: room.name, sourceSystem: room.sourceSystem, externalId: room.externalId })),
    preservedImportBatch: state.importBatches.map((batch) => ({ status: batch.status, rows: batch._count.rows })),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-mo-lees-summit");
  const initial = await readState(prisma);

  if (isPostRepair(initial)) {
    assertPostRepair(initial);
    console.log(JSON.stringify({ ok: true, applied: false, alreadyRepaired: true, state: publicSummary(initial) }, null, 2));
    return;
  }

  assertPreRepair(initial);
  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      wouldAssignCurrentProcareChildren: EXPECTED.currentProcareChildren,
      wouldCreateClassrooms: EXPECTED_ROOMS.map((room) => ({ externalId: room.externalId, name: room.name, children: room.currentChildren })),
      wouldRetireTestChildrenFromCurrentEnrollment: EXPECTED.testChildren,
      wouldDeleteIsolatedTestClassroom: 1,
      identitiesChanged: 0,
      importBatchesChanged: 0,
      state: publicSummary(initial),
    }, null, 2));
    return;
  }
  invariant(confirmed, "Apply mode requires --confirm-mo-lees-summit.");

  const result = await prisma.$transaction(async (tx) => {
    const before = await readState(tx);
    assertPreRepair(before);
    const repairedAt = new Date().toISOString();
    const classroomIdByExternalId = new Map<string, string>();

    for (const room of EXPECTED_ROOMS) {
      const classroom = await tx.classroom.create({
        data: {
          centerId: before.center.id,
          name: room.name,
          ageGroup: room.name,
          capacity: 0,
          ratioRule: "Imported from ProCare; capacity and ratio need director verification.",
          sourceSystem: PROCARE_SOURCE,
          externalId: room.externalId,
          customFields: {
            source: REPAIR_SOURCE,
            mappedCenterId: before.center.id,
            importedFromColumn: "primary classroom",
            capacityImported: false,
            ratioRuleImported: false,
            setupVerificationRequired: true,
            repairedAt,
          },
        },
        select: { id: true },
      });
      classroomIdByExternalId.set(room.externalId, classroom.id);
    }

    let assignedChildren = 0;
    for (const room of EXPECTED_ROOMS) {
      const group = before.roomDistribution.get(`${room.externalId}\u0000${room.name}`);
      invariant(group, `Missing guarded assignment group for ${room.name}.`);
      const classroomId = classroomIdByExternalId.get(room.externalId);
      invariant(classroomId, `Missing created classroom for ${room.name}.`);
      const updated = await tx.child.updateMany({
        where: {
          id: { in: group.childIds },
          sourceSystem: PROCARE_SOURCE,
          classroomId: null,
          enrollmentStatus: { in: currentlyEnrolledStatusValues() },
          family: { centerId: before.center.id, sourceSystem: PROCARE_SOURCE },
        },
        data: { classroomId, ageGroup: room.name },
      });
      invariant(updated.count === room.currentChildren, `Expected to assign ${room.currentChildren} children to ${room.name}; assigned ${updated.count}.`);
      assignedChildren += updated.count;
    }

    const retiredTests = await tx.child.updateMany({
      where: {
        id: { in: before.testChildren.map((child) => child.id) },
        family: { centerId: before.center.id, sourceSystem: TEST_SOURCE },
      },
      data: { enrollmentStatus: "not_enrolled", classroomId: null },
    });
    invariant(retiredTests.count === EXPECTED.testChildren, `Expected to retire ${EXPECTED.testChildren} test children; updated ${retiredTests.count}.`);

    const testRoom = before.classrooms.find((room) => room.sourceSystem === TEST_SOURCE);
    invariant(testRoom, "The isolated test classroom was not found inside the repair transaction.");
    const deletedTestRoom = await tx.classroom.deleteMany({ where: { id: testRoom.id, sourceSystem: TEST_SOURCE } });
    invariant(deletedTestRoom.count === 1, `Expected to delete one isolated test classroom; deleted ${deletedTestRoom.count}.`);

    await tx.auditLog.create({
      data: {
        tenantId: before.center.organization.tenantId,
        centerId: before.center.id,
        action: "procare.lees_summit_classrooms.repaired",
        resource: "Center",
        resourceId: before.center.id,
        metadata: {
          source: REPAIR_SOURCE,
          assignedChildren,
          createdClassrooms: EXPECTED_ROOMS.map((room) => ({ externalId: room.externalId, name: room.name, children: room.currentChildren })),
          retiredTestChildren: retiredTests.count,
          deletedTestClassrooms: deletedTestRoom.count,
          linkedTestGuardianUsersPreserved: before.linkedTestGuardianUsers,
          procareImportBatchChanged: false,
          billingChanged: false,
          invitationsChanged: false,
          identitiesChanged: false,
          repairedAt,
        },
      },
    });

    const after = await readState(tx);
    assertPostRepair(after);
    const dashboardCurrentFamilies = await tx.family.count({
      where: {
        centerId: after.center.id,
        children: {
          some: {
            enrollmentStatus: { in: currentlyEnrolledStatusValues() },
            classroomId: { not: null },
          },
        },
      },
    });
    invariant(dashboardCurrentFamilies === EXPECTED.currentProcareChildren, `Expected ${EXPECTED.currentProcareChildren} dashboard current families; found ${dashboardCurrentFamilies}.`);
    return { assignedChildren, retiredTestChildren: retiredTests.count, deletedTestClassrooms: deletedTestRoom.count, dashboardCurrentFamilies };
  }, { maxWait: 10_000, timeout: 120_000 });

  const finalState = await readState(prisma);
  assertPostRepair(finalState);
  console.log(JSON.stringify({ ok: true, applied: true, result, state: publicSummary(finalState) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
