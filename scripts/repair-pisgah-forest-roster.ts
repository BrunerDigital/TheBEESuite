import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_LOCATION_ID = "NC | Pisgah Forest";
const CENTER_NAME = "Kid City USA - Pisgah Forest";
const PROCARE_SOURCE = "procare";
const TEST_SOURCE = "bee_suite_parent_invite_test";
const EXPECTED_PLAN_SHA256 = "984a2b22ff5bc3d5502748a2e9fb10833d838936e71524a973d98c5418783731";
const CURRENT_STATUSES = ["enrolled", "active", "current"];

type PlanClassroom = { externalId: string; name: string };
type PlanFamily = {
  externalId: string;
  name: string;
  requiredChildExternalIds: string[];
  requiredGuardianExternalIds: string[];
};
type ExistingTarget = {
  externalId: string;
  fullName: string;
  dateOfBirth: string;
  familyExternalId: string;
  classroomExternalId: string;
};
type MissingTarget = ExistingTarget & { sourceRowNumber: number };
type RepairPlan = {
  version: number;
  centerLocationId: string;
  centerName: string;
  repairSource: string;
  sourceBatchId: string;
  sourceEvidence: string;
  expected: {
    preCenterChildren: number;
    preCurrentChildren: number;
    preCurrentProcareChildren: number;
    preCurrentTestChildren: number;
    existingTargetChildren: number;
    missingTargetChildren: number;
    testChildren: number;
    postCenterChildren: number;
    postCurrentChildren: number;
    postCurrentProcareChildren: number;
    postCurrentTestChildren: number;
  };
  classrooms: PlanClassroom[];
  families: PlanFamily[];
  existingTargets: ExistingTarget[];
  missingTargets: MissingTarget[];
  guardianToCreate: {
    familyExternalId: string;
    fullName: string;
    relation: string;
    sourceSystem: string;
    externalId: string;
  };
};

type RepairDb = Pick<
  Prisma.TransactionClient,
  | "auditLog"
  | "billingAccount"
  | "center"
  | "child"
  | "classroom"
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

function unique(values: string[], label: string) {
  invariant(values.every((value) => value.trim()), `${label} contains a blank identifier.`);
  invariant(new Set(values).size === values.length, `${label} contains duplicate identifiers.`);
}

function parseDateOnly(value: string, label: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  invariant(match, `${label} must use YYYY-MM-DD format.`);
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  invariant(!Number.isNaN(parsed.valueOf()), `${label} is not a valid date.`);
  return parsed;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function readPlan() {
  const planPath = process.env.PISGAH_REPAIR_PLAN_PATH?.trim();
  const raw = planPath
    ? readFileSync(planPath, "utf8")
    : process.env.PISGAH_REPAIR_PLAN_JSON ?? "";
  invariant(raw, "PISGAH_REPAIR_PLAN_PATH or PISGAH_REPAIR_PLAN_JSON is required.");
  const hash = createHash("sha256").update(raw).digest("hex");
  invariant(hash === EXPECTED_PLAN_SHA256, "The Pisgah repair plan does not match the reviewed director and ProCare evidence.");
  const plan = JSON.parse(raw) as RepairPlan;

  invariant(plan.version === 1, `Expected plan version 1; found ${plan.version}.`);
  invariant(plan.centerLocationId === CENTER_LOCATION_ID, `Expected ${CENTER_LOCATION_ID}; found ${plan.centerLocationId}.`);
  invariant(plan.centerName === CENTER_NAME, `Expected ${CENTER_NAME}; found ${plan.centerName}.`);
  invariant(plan.expected.existingTargetChildren === 15, "Expected 15 existing hidden children.");
  invariant(plan.expected.missingTargetChildren === 4, "Expected four missing children.");
  invariant(plan.expected.testChildren === 2, "Expected two isolated test children.");
  invariant(plan.existingTargets.length === plan.expected.existingTargetChildren, "Existing target count does not match the plan guard.");
  invariant(plan.missingTargets.length === plan.expected.missingTargetChildren, "Missing target count does not match the plan guard.");
  invariant(plan.classrooms.length === 7, "Expected seven target classrooms.");
  invariant(plan.families.length === 3, "Expected three explicitly reviewed destination households.");

  const allTargets = [...plan.existingTargets, ...plan.missingTargets];
  unique(allTargets.map((child) => child.externalId), "Target children");
  unique(plan.classrooms.map((room) => room.externalId), "Target classrooms");
  unique(plan.families.map((family) => family.externalId), "Reviewed households");
  const roomIds = new Set(plan.classrooms.map((room) => room.externalId));
  for (const child of allTargets) {
    invariant(child.fullName.trim(), `Target ${child.externalId} is missing a name.`);
    parseDateOnly(child.dateOfBirth, `Date of birth for ${child.externalId}`);
    invariant(child.familyExternalId.trim(), `Target ${child.externalId} is missing a family identifier.`);
    invariant(roomIds.has(child.classroomExternalId), `Target ${child.externalId} references an unreviewed classroom.`);
  }
  invariant(plan.guardianToCreate.familyExternalId === "35325", "The reviewed guardian must remain scoped to the distinct Whitesides household.");
  return plan;
}

async function readBoundaryCounts(db: RepairDb, centerId: string, tenantId: string) {
  const [
    families,
    children,
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
  ] = await Promise.all([
    db.family.count({ where: { centerId } }),
    db.child.count({ where: { family: { centerId } } }),
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
  ]);
  return { families, children, guardians, linkedGuardianUsers, billingAccounts, invoices, payments, messages, tenantUsers, centerAccessGrants, importBatches, importRows };
}

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

  const allTargets = [...plan.existingTargets, ...plan.missingTargets];
  const familyExternalIds = [...new Set([...allTargets.map((child) => child.familyExternalId), ...plan.families.map((family) => family.externalId)])];
  const [
    targetChildren,
    totalChildren,
    currentChildren,
    currentProcareChildren,
    currentTestChildren,
    testChildren,
    classrooms,
    families,
    guardianMatches,
    sourceBatch,
    sourceRowStatuses,
    boundary,
  ] = await Promise.all([
    db.child.findMany({
      where: { sourceSystem: PROCARE_SOURCE, externalId: { in: allTargets.map((child) => child.externalId) } },
      select: { id: true, fullName: true, dateOfBirth: true, enrollmentStatus: true, sourceSystem: true, externalId: true, familyId: true, classroomId: true },
      orderBy: { externalId: "asc" },
    }),
    db.child.count({ where: { family: { centerId: center.id } } }),
    db.child.count({ where: { family: { centerId: center.id }, enrollmentStatus: { in: CURRENT_STATUSES }, classroomId: { not: null } } }),
    db.child.count({ where: { sourceSystem: PROCARE_SOURCE, family: { centerId: center.id }, enrollmentStatus: { in: CURRENT_STATUSES }, classroomId: { not: null } } }),
    db.child.count({ where: { sourceSystem: TEST_SOURCE, family: { centerId: center.id }, enrollmentStatus: { in: CURRENT_STATUSES }, classroomId: { not: null } } }),
    db.child.findMany({ where: { sourceSystem: TEST_SOURCE, family: { centerId: center.id } }, select: { id: true, enrollmentStatus: true, classroomId: true, familyId: true }, orderBy: { id: "asc" } }),
    db.classroom.findMany({ where: { centerId: center.id }, select: { id: true, name: true, sourceSystem: true, externalId: true }, orderBy: { externalId: "asc" } }),
    db.family.findMany({
      where: { centerId: center.id, sourceSystem: PROCARE_SOURCE, externalId: { in: familyExternalIds } },
      select: {
        id: true,
        name: true,
        externalId: true,
        children: { select: { externalId: true } },
        guardians: { select: { externalId: true, userId: true } },
      },
      orderBy: { externalId: "asc" },
    }),
    db.guardian.findMany({ where: { sourceSystem: plan.guardianToCreate.sourceSystem, externalId: plan.guardianToCreate.externalId }, select: { id: true, familyId: true, fullName: true, relation: true, userId: true } }),
    db.procareImportBatch.findUnique({ where: { id: plan.sourceBatchId }, select: { id: true, centerId: true, filename: true, status: true, _count: { select: { rows: true } } } }),
    db.procareImportRow.groupBy({ by: ["status"], where: { batchId: plan.sourceBatchId }, _count: { _all: true } }),
    readBoundaryCounts(db, center.id, center.organization.tenantId),
  ]);

  return { center, targetChildren, totalChildren, currentChildren, currentProcareChildren, currentTestChildren, testChildren, classrooms, families, guardianMatches, sourceBatch, sourceRowStatuses, boundary };
}

function roomMap(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  const result = new Map<string, { id: string; name: string }>();
  for (const expected of plan.classrooms) {
    const matches = state.classrooms.filter((room) => room.sourceSystem === PROCARE_SOURCE && room.externalId === expected.externalId);
    invariant(matches.length === 1, `Expected one ProCare classroom ${expected.externalId}; found ${matches.length}.`);
    invariant(matches[0].name === expected.name, `Expected classroom ${expected.externalId} to be ${expected.name}; found ${matches[0].name}.`);
    result.set(expected.externalId, { id: matches[0].id, name: matches[0].name });
  }
  return result;
}

function familyMap(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  const result = new Map<string, { id: string; name: string }>();
  const expectedIds = new Set([...plan.existingTargets, ...plan.missingTargets].map((child) => child.familyExternalId));
  for (const externalId of expectedIds) {
    const matches = state.families.filter((family) => family.externalId === externalId);
    invariant(matches.length === 1, `Expected one ProCare household ${externalId}; found ${matches.length}.`);
    result.set(externalId, { id: matches[0].id, name: matches[0].name });
  }
  for (const expected of plan.families) {
    const family = state.families.find((candidate) => candidate.externalId === expected.externalId);
    invariant(family, `Reviewed household ${expected.externalId} was not found.`);
    invariant(family.name === expected.name, `Reviewed household ${expected.externalId} has an unexpected name.`);
    const childIds = new Set(family.children.map((child) => child.externalId).filter(Boolean));
    const guardianIds = new Set(family.guardians.map((guardian) => guardian.externalId).filter(Boolean));
    invariant(expected.requiredChildExternalIds.every((id) => childIds.has(id)), `Reviewed household ${expected.externalId} is missing its required child relationship.`);
    invariant(expected.requiredGuardianExternalIds.every((id) => guardianIds.has(id)), `Reviewed household ${expected.externalId} is missing its required guardian relationship.`);
  }
  return result;
}

function assertSourceEvidence(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  invariant(state.sourceBatch, "The reviewed Pisgah source batch was not found.");
  invariant(state.sourceBatch.centerId === state.center.id, "The reviewed source batch belongs to a different school.");
  invariant(state.sourceBatch.filename === plan.sourceEvidence, "The reviewed source batch filename changed.");
  invariant(state.sourceBatch.status === "completed_with_errors", "The reviewed source batch status changed.");
  invariant(state.sourceBatch._count.rows === 64, `Expected 64 reviewed source rows; found ${state.sourceBatch._count.rows}.`);
  invariant(state.sourceRowStatuses.length === 1 && state.sourceRowStatuses[0].status === "disposed" && state.sourceRowStatuses[0]._count._all === 64, "The reviewed source-row inventory changed.");
}

function assertTargetShape(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan, status: "pre" | "post") {
  const rooms = roomMap(state, plan);
  const families = familyMap(state, plan);
  const expectedTargets = status === "pre" ? plan.existingTargets : [...plan.existingTargets, ...plan.missingTargets];
  invariant(state.targetChildren.length === expectedTargets.length, `Expected ${expectedTargets.length} target children in ${status}-repair state; found ${state.targetChildren.length}.`);
  const byExternalId = new Map(state.targetChildren.map((child) => [child.externalId, child]));
  for (const expected of expectedTargets) {
    const child = byExternalId.get(expected.externalId);
    invariant(child, `Target child ${expected.externalId} is missing.`);
    invariant(child.fullName === expected.fullName, `Target child ${expected.externalId} has an unexpected name.`);
    invariant(dateKey(child.dateOfBirth) === expected.dateOfBirth, `Target child ${expected.externalId} has an unexpected date of birth.`);
    invariant(child.familyId === families.get(expected.familyExternalId)?.id, `Target child ${expected.externalId} is attached to the wrong household.`);
    invariant(child.classroomId === rooms.get(expected.classroomExternalId)?.id, `Target child ${expected.externalId} is attached to the wrong classroom.`);
    invariant(child.enrollmentStatus === (status === "pre" ? "pending" : "enrolled"), `Target child ${expected.externalId} has an unexpected enrollment status.`);
  }
  if (status === "pre") {
    invariant(plan.missingTargets.every((expected) => !byExternalId.has(expected.externalId)), "A target described as missing already exists.");
  }
}

function isPostRepair(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  try {
    assertSourceEvidence(state, plan);
    assertTargetShape(state, plan, "post");
    if (state.totalChildren !== plan.expected.postCenterChildren) return false;
    if (state.currentChildren !== plan.expected.postCurrentChildren) return false;
    if (state.currentProcareChildren !== plan.expected.postCurrentProcareChildren) return false;
    if (state.currentTestChildren !== plan.expected.postCurrentTestChildren) return false;
    if (state.testChildren.length !== plan.expected.testChildren) return false;
    if (state.testChildren.some((child) => child.enrollmentStatus !== "not_enrolled" || child.classroomId)) return false;
    if (state.guardianMatches.length !== 1) return false;
    const guardian = state.guardianMatches[0];
    const family = state.families.find((candidate) => candidate.externalId === plan.guardianToCreate.familyExternalId);
    if (!family || guardian.familyId !== family.id || guardian.fullName !== plan.guardianToCreate.fullName || guardian.relation !== plan.guardianToCreate.relation || guardian.userId) return false;
    return true;
  } catch {
    return false;
  }
}

function publicState(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  const targetRoomCounts = Object.entries(Object.groupBy(
    [...plan.existingTargets, ...plan.missingTargets],
    (child) => plan.classrooms.find((room) => room.externalId === child.classroomExternalId)?.name ?? "Unknown",
  )).map(([room, children]) => ({ room, children: children?.length ?? 0 }));
  return {
    center: CENTER_LOCATION_ID,
    centerChildren: state.totalChildren,
    currentChildren: state.currentChildren,
    currentProcareChildren: state.currentProcareChildren,
    currentTestChildren: state.currentTestChildren,
    targetChildrenPresent: state.targetChildren.length,
    reviewedHouseholds: plan.families.length,
    targetRoomCounts,
    sourceBatch: { status: state.sourceBatch?.status, rows: state.sourceBatch?._count.rows },
  };
}

function assertPreRepair(state: Awaited<ReturnType<typeof readState>>, plan: RepairPlan) {
  assertSourceEvidence(state, plan);
  roomMap(state, plan);
  familyMap(state, plan);
  invariant(state.totalChildren === plan.expected.preCenterChildren, `Expected ${plan.expected.preCenterChildren} pre-repair children; found ${state.totalChildren}.`);
  invariant(state.currentChildren === plan.expected.preCurrentChildren, `Expected ${plan.expected.preCurrentChildren} pre-repair current children; found ${state.currentChildren}.`);
  invariant(state.currentProcareChildren === plan.expected.preCurrentProcareChildren, `Expected ${plan.expected.preCurrentProcareChildren} pre-repair current ProCare children; found ${state.currentProcareChildren}.`);
  invariant(state.currentTestChildren === plan.expected.preCurrentTestChildren, `Expected ${plan.expected.preCurrentTestChildren} pre-repair current test children; found ${state.currentTestChildren}.`);
  invariant(state.testChildren.length === plan.expected.testChildren, `Expected ${plan.expected.testChildren} test children; found ${state.testChildren.length}.`);
  invariant(state.guardianMatches.length === 0, "The director-confirmed guardian already exists in an unexpected pre-repair state.");
  assertTargetShape(state, plan, "pre");
}

async function main() {
  const plan = readPlan();
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-nc-pisgah-forest");
  const initial = await readState(prisma, plan);

  if (isPostRepair(initial, plan)) {
    console.log(JSON.stringify({ ok: true, applied: false, alreadyRepaired: true, state: publicState(initial, plan) }, null, 2));
    return;
  }

  assertPreRepair(initial, plan);
  const missingNameCollisions = await prisma.child.findMany({
    where: { OR: plan.missingTargets.flatMap((child) => [{ externalId: child.externalId }, { fullName: child.fullName }]) },
    select: { id: true },
    take: 1,
  });
  invariant(missingNameCollisions.length === 0, "A missing target child collides with an existing child record outside the guarded Pisgah target set.");

  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      planSha256: EXPECTED_PLAN_SHA256,
      wouldActivateExistingChildren: plan.expected.existingTargetChildren,
      wouldCreateChildren: plan.expected.missingTargetChildren,
      wouldCreateFamilies: 0,
      wouldCreateGuardians: 1,
      wouldRetireTestChildren: plan.expected.testChildren,
      projectedCurrentChildren: plan.expected.postCurrentChildren,
      billingChanged: false,
      messagesChanged: false,
      invitationsChanged: false,
      identitiesChanged: false,
      accessChanged: false,
      state: publicState(initial, plan),
    }, null, 2));
    return;
  }

  invariant(confirmed, "Apply mode requires --confirm-nc-pisgah-forest.");
  const result = await prisma.$transaction(async (tx) => {
    const before = await readState(tx, plan);
    assertPreRepair(before, plan);
    const rooms = roomMap(before, plan);
    const families = familyMap(before, plan);
    const repairedAt = new Date().toISOString();

    let activatedExistingChildren = 0;
    for (const child of plan.existingTargets) {
      const updated = await tx.child.updateMany({
        where: { sourceSystem: PROCARE_SOURCE, externalId: child.externalId, familyId: families.get(child.familyExternalId)?.id },
        data: { enrollmentStatus: "enrolled", classroomId: rooms.get(child.classroomExternalId)?.id, ageGroup: rooms.get(child.classroomExternalId)?.name },
      });
      invariant(updated.count === 1, `Expected to activate one existing target ${child.externalId}; updated ${updated.count}.`);
      activatedExistingChildren += updated.count;
    }

    let createdChildren = 0;
    for (const child of plan.missingTargets) {
      const family = families.get(child.familyExternalId);
      const classroom = rooms.get(child.classroomExternalId);
      invariant(family && classroom, `Missing reviewed destination for target ${child.externalId}.`);
      await tx.child.create({
        data: {
          familyId: family.id,
          classroomId: classroom.id,
          fullName: child.fullName,
          dateOfBirth: parseDateOnly(child.dateOfBirth, `Date of birth for ${child.externalId}`),
          ageGroup: classroom.name,
          enrollmentStatus: "enrolled",
          sourceSystem: PROCARE_SOURCE,
          externalId: child.externalId,
          customFields: {
            source: plan.repairSource,
            sourceBatchId: plan.sourceBatchId,
            sourceRowNumber: child.sourceRowNumber,
            directorConfirmedHousehold: true,
            billingImported: false,
            accessCreated: false,
            repairedAt,
          },
        },
      });
      createdChildren += 1;
    }

    const guardianFamily = families.get(plan.guardianToCreate.familyExternalId);
    invariant(guardianFamily, "The director-confirmed guardian household was not found.");
    await tx.guardian.create({
      data: {
        familyId: guardianFamily.id,
        fullName: plan.guardianToCreate.fullName,
        relation: plan.guardianToCreate.relation,
        isBillingContact: false,
        sourceSystem: plan.guardianToCreate.sourceSystem,
        externalId: plan.guardianToCreate.externalId,
        customFields: { source: plan.repairSource, directorConfirmed: true, accessCreated: false, repairedAt },
      },
    });

    const retiredTests = await tx.child.updateMany({
      where: { id: { in: before.testChildren.map((child) => child.id) }, sourceSystem: TEST_SOURCE, family: { centerId: before.center.id } },
      data: { enrollmentStatus: "not_enrolled", classroomId: null },
    });
    invariant(retiredTests.count === plan.expected.testChildren, `Expected to retire ${plan.expected.testChildren} test children; updated ${retiredTests.count}.`);

    await tx.auditLog.create({
      data: {
        tenantId: before.center.organization.tenantId,
        centerId: before.center.id,
        action: "procare.pisgah_forest_roster.reconciled",
        resource: "Center",
        resourceId: before.center.id,
        metadata: {
          source: plan.repairSource,
          sourceBatchId: plan.sourceBatchId,
          planSha256: EXPECTED_PLAN_SHA256,
          activatedExistingChildren,
          createdChildren,
          createdFamilies: 0,
          createdGuardians: 1,
          retiredTestChildren: retiredTests.count,
          currentChildren: plan.expected.postCurrentChildren,
          billingChanged: false,
          messagesChanged: false,
          invitationsChanged: false,
          identitiesChanged: false,
          accessChanged: false,
          importBatchChanged: false,
          repairedAt,
        },
      },
    });

    const after = await readState(tx, plan);
    invariant(isPostRepair(after, plan), "Pisgah Forest did not reach the guarded post-repair state.");
    invariant(after.boundary.families === before.boundary.families, "The family inventory changed unexpectedly.");
    invariant(after.boundary.children === before.boundary.children + plan.expected.missingTargetChildren, "The child inventory changed outside the four reviewed additions.");
    invariant(after.boundary.guardians === before.boundary.guardians + 1, "The guardian inventory changed outside the one director-confirmed parent.");
    invariant(after.boundary.linkedGuardianUsers === before.boundary.linkedGuardianUsers, "Linked guardian identities changed unexpectedly.");
    for (const key of ["billingAccounts", "invoices", "payments", "messages", "tenantUsers", "centerAccessGrants", "importBatches", "importRows"] as const) {
      invariant(after.boundary[key] === before.boundary[key], `${key} changed unexpectedly.`);
    }
    return { activatedExistingChildren, createdChildren, createdFamilies: 0, createdGuardians: 1, retiredTestChildren: retiredTests.count, currentChildren: after.currentChildren };
  }, { maxWait: 10_000, timeout: 120_000 });

  const finalState = await readState(prisma, plan);
  invariant(isPostRepair(finalState, plan), "Pisgah Forest final verification failed after commit.");
  console.log(JSON.stringify({ ok: true, applied: true, result, state: publicState(finalState, plan) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
