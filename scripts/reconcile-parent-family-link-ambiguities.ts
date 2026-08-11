import "./load-env";

import { createHash } from "node:crypto";
import { UserRole, type Prisma } from "@prisma/client";
import { isCurrentlyEnrolledChildRecord } from "@/lib/enrollment-status";
import { parentPortalAccessFields } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-victoria-longmont-family-link";
const APPLY_FLEET_FLAG = "--apply-reviewed-fleet";
const CONFIRM_FLEET_FLAG = "--confirm-reviewed-fleet-parent-family-links";
const TARGET_USER_ID = "cmsdaw98p00qb6az8yx45rayd";
const KEEP_GUARDIAN_ID = "cmq9whexw00tik10abszq68al";
const REMOVE_GUARDIAN_ID = "cmq9wffud006hk10ausgp28on";
const KEEP_FAMILY_ID = "cmq9wheuk00tgk10a9db8fo56";
const REMOVE_FAMILY_ID = "cmq9wffno006dk10afa1oafwh";
const LONGMONT_CENTER_ID = "cmp4ew6f3000a6alwmz62n7w2";
const REPAIR_SOURCE = "victoria_longmont_parent_family_link_2026_08_10";
const ACTOR = "system:parent-family-link-repair";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain ?? "unknown"}`;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadFleetAudit() {
  const users = await prisma.user.findMany({
    where: {
      role: UserRole.PARENT_GUARDIAN,
      guardians: { some: {} },
    },
    select: {
      id: true,
      email: true,
      guardians: {
        select: {
          id: true,
          familyId: true,
          email: true,
          externalId: true,
          sourceSystem: true,
          relation: true,
          isBillingContact: true,
          family: {
            select: {
              centerId: true,
              children: { select: { enrollmentStatus: true, classroomId: true } },
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const centerIds = [...new Set(users.flatMap((user) => user.guardians.map((guardian) => guardian.family.centerId)).filter(Boolean))] as string[];
  const centers = await prisma.center.findMany({
    where: { id: { in: centerIds } },
    select: { id: true, name: true },
  });
  const centerNames = new Map(centers.map((center) => [center.id, center.name]));

  const ambiguous = users.flatMap((user) => {
    const families = new Map<string, {
      centerId: string | null;
      centerName: string;
      currentChildren: number;
      billingContacts: number;
    }>();
    for (const guardian of user.guardians) {
      const current = families.get(guardian.familyId) ?? {
        centerId: guardian.family.centerId,
        centerName: guardian.family.centerId ? centerNames.get(guardian.family.centerId) ?? "Unknown center" : "Unassigned center",
        currentChildren: guardian.family.children.filter(isCurrentlyEnrolledChildRecord).length,
        billingContacts: 0,
      };
      if (guardian.isBillingContact) current.billingContacts += 1;
      families.set(guardian.familyId, current);
    }
    if (families.size <= 1) return [];
    const familyRows = [...families.entries()].map(([familyId, value]) => ({ familyId, ...value }));
    const currentFamilies = familyRows.filter((family) => family.currentChildren > 0);
    const billingCurrentFamilies = currentFamilies.filter((family) => family.billingContacts > 0);
    const classification = billingCurrentFamilies.length === 1 && currentFamilies.length === 1
      ? "one_current_billing_family"
      : currentFamilies.length > 1
        ? "multiple_current_families"
        : currentFamilies.length === 0
          ? "no_current_family"
          : "one_current_nonbilling_family";
    return [{
      userId: user.id,
      email: maskEmail(user.email),
      guardianRows: user.guardians.map((guardian) => ({
        id: guardian.id,
        familyId: guardian.familyId,
        emailMatchesUser: guardian.email?.trim().toLowerCase() === user.email.trim().toLowerCase(),
        externalId: guardian.externalId,
        sourceSystem: guardian.sourceSystem,
        relation: guardian.relation,
        isBillingContact: guardian.isBillingContact,
      })),
      familyRows,
      classification,
    }];
  });

  const centerCounts = new Map<string, number>();
  const classificationCounts = new Map<string, number>();
  for (const item of ambiguous) {
    classificationCounts.set(item.classification, (classificationCounts.get(item.classification) ?? 0) + 1);
    for (const centerName of new Set(item.familyRows.map((family) => family.centerName))) {
      centerCounts.set(centerName, (centerCounts.get(centerName) ?? 0) + 1);
    }
  }

  return {
    linkedParentUsers: users.length,
    ambiguousUsers: ambiguous.length,
    classificationCounts: Object.fromEntries([...classificationCounts].sort()),
    centerCounts: Object.fromEntries([...centerCounts].sort()),
    strictRepairCandidates: ambiguous.filter((item) => {
      if (item.classification !== "one_current_billing_family") return false;
      const keepFamilyId = item.familyRows.find((family) => family.currentChildren > 0)?.familyId;
      const externalIds = new Set(item.guardianRows.map((guardian) => guardian.externalId).filter(Boolean));
      return Boolean(
        keepFamilyId
        && item.guardianRows.every((guardian) => guardian.emailMatchesUser)
        && externalIds.size === 1
        && item.guardianRows
          .filter((guardian) => guardian.familyId !== keepFamilyId)
          .every((guardian) => !guardian.isBillingContact),
      );
    }).map((item) => ({
      userId: item.userId,
      email: item.email,
      keepFamilyId: item.familyRows.find((family) => family.currentChildren > 0)?.familyId,
      removableGuardianIds: item.guardianRows
        .filter((guardian) => guardian.familyId !== item.familyRows.find((family) => family.currentChildren > 0)?.familyId)
        .map((guardian) => guardian.id),
      centers: [...new Set(item.familyRows.map((family) => family.centerName))],
    })),
    target: ambiguous.find((item) => item.userId === TARGET_USER_ID) ?? null,
  };
}

async function loadTargetState() {
  const guardianSelect = {
    id: true,
    familyId: true,
    userId: true,
    isBillingContact: true,
    customFields: true,
    family: {
      select: {
        centerId: true,
        children: { select: { enrollmentStatus: true, classroomId: true } },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            _count: { select: { invoices: true, payments: true, ledgerEntries: true } },
          },
        },
      },
    },
  } satisfies Prisma.GuardianSelect;
  const [user, removedGuardian] = await Promise.all([
    prisma.user.findUnique({
      where: { id: TARGET_USER_ID },
      select: {
        id: true,
        tenantId: true,
        role: true,
        isActive: true,
        guardians: { select: guardianSelect, orderBy: { id: "asc" } },
      },
    }),
    prisma.guardian.findUnique({ where: { id: REMOVE_GUARDIAN_ID }, select: guardianSelect }),
  ]);
  invariant(user, "Target parent user no longer exists.");
  const keep = user.guardians.find((guardian) => guardian.id === KEEP_GUARDIAN_ID);
  const remove = user.guardians.find((guardian) => guardian.id === REMOVE_GUARDIAN_ID) ?? removedGuardian;
  invariant(keep && remove, "Expected both reviewed Victoria guardian records.");
  const state = {
    userId: user.id,
    role: user.role,
    isActive: user.isActive,
    guardianLinks: user.guardians.map((guardian) => ({
      id: guardian.id,
      familyId: guardian.familyId,
      centerId: guardian.family.centerId,
      isBillingContact: guardian.isBillingContact,
      currentChildCount: guardian.family.children.filter(isCurrentlyEnrolledChildRecord).length,
      billingAccount: guardian.family.billingAccount,
    })),
  };
  return { user, keep, remove, state, fingerprint: fingerprint(state) };
}

async function applyTargetRepair(expectedFingerprint: string) {
  const before = await loadTargetState();
  invariant(before.fingerprint === expectedFingerprint, "Target state changed after inspection; refusing to apply.");
  invariant(before.user.role === UserRole.PARENT_GUARDIAN && before.user.isActive, "Target is not an active parent user.");
  invariant(before.user.guardians.length === 2, "Target has unexpected additional guardian links.");
  invariant(before.remove.userId === TARGET_USER_ID, "Reviewed remove link is no longer attached to the target user.");
  invariant(before.keep.familyId === KEEP_FAMILY_ID && before.keep.family.centerId === LONGMONT_CENTER_ID, "Reviewed keep link changed.");
  invariant(before.remove.familyId === REMOVE_FAMILY_ID && before.remove.family.centerId === LONGMONT_CENTER_ID, "Reviewed remove link changed.");
  invariant(before.keep.isBillingContact, "Reviewed keep link is no longer the billing contact.");
  invariant(before.keep.family.children.some(isCurrentlyEnrolledChildRecord), "Reviewed keep family no longer has a current child.");
  invariant(!before.remove.isBillingContact, "Reviewed remove link unexpectedly became a billing contact.");
  invariant(!before.remove.family.children.some(isCurrentlyEnrolledChildRecord), "Reviewed remove family unexpectedly has a current child.");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.guardian.updateMany({
      where: { id: REMOVE_GUARDIAN_ID, familyId: REMOVE_FAMILY_ID, userId: TARGET_USER_ID },
      data: {
        userId: null,
        customFields: parentPortalAccessFields({
          customFields: before.remove.customFields,
          enabled: false,
          actorEmail: ACTOR,
        }),
      },
    });
    invariant(updated.count === 1, "Reviewed guardian link was not updated exactly once.");
    await tx.auditLog.create({
      data: {
        tenantId: before.user.tenantId,
        centerId: LONGMONT_CENTER_ID,
        action: "parent_portal.family_link.corrected",
        resource: "Guardian",
        resourceId: REMOVE_GUARDIAN_ID,
        metadata: {
          source: REPAIR_SOURCE,
          parentUserId: TARGET_USER_ID,
          keptGuardianId: KEEP_GUARDIAN_ID,
          keptFamilyId: KEEP_FAMILY_ID,
          unlinkedGuardianId: REMOVE_GUARDIAN_ID,
          unlinkedFamilyId: REMOVE_FAMILY_ID,
          reason: "unique_current_billing_household_vs_withdrawn_nonbilling_contact",
          preservedGuardianRecord: true,
          preservedFamilyRecord: true,
          authUserChanged: false,
          userRoleChanged: false,
          billingChanged: false,
          messagesOrInvitationsSent: 0,
          beforeFingerprint: expectedFingerprint,
        } satisfies Prisma.InputJsonObject,
      },
    });
  });

  const linked = await prisma.guardian.findMany({
    where: { userId: TARGET_USER_ID },
    select: { id: true, familyId: true },
  });
  invariant(linked.length === 1, "Repair did not leave exactly one linked guardian.");
  invariant(linked[0].id === KEEP_GUARDIAN_ID && linked[0].familyId === KEEP_FAMILY_ID, "Repair kept the wrong family link.");
  const preserved = await prisma.guardian.findUnique({ where: { id: REMOVE_GUARDIAN_ID }, select: { id: true, familyId: true, userId: true } });
  invariant(preserved?.familyId === REMOVE_FAMILY_ID && preserved.userId === null, "Source contact record was not preserved safely.");
}

async function loadReviewedFleetPlan() {
  const audit = await loadFleetAudit();
  const userIds = audit.strictRepairCandidates.map((candidate) => candidate.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, role: UserRole.PARENT_GUARDIAN, isActive: true },
    select: {
      id: true,
      email: true,
      tenantId: true,
      guardians: {
        select: {
          id: true,
          familyId: true,
          email: true,
          externalId: true,
          isBillingContact: true,
          customFields: true,
          family: {
            select: {
              centerId: true,
              children: { select: { enrollmentStatus: true, classroomId: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
  invariant(users.length === userIds.length, "Reviewed fleet candidate users changed after audit.");

  const plan = users.map((user) => {
    const currentFamilies = new Set(user.guardians
      .filter((guardian) => guardian.family.children.some(isCurrentlyEnrolledChildRecord))
      .map((guardian) => guardian.familyId));
    invariant(currentFamilies.size === 1, `Reviewed user ${user.id} no longer has one current family.`);
    const keepFamilyId = [...currentFamilies][0];
    const keepGuardians = user.guardians.filter((guardian) => guardian.familyId === keepFamilyId);
    const removals = user.guardians.filter((guardian) => guardian.familyId !== keepFamilyId);
    const externalIds = new Set(user.guardians.map((guardian) => guardian.externalId).filter(Boolean));
    invariant(keepGuardians.some((guardian) => guardian.isBillingContact), `Reviewed user ${user.id} lost its billing contact evidence.`);
    invariant(removals.length > 0, `Reviewed user ${user.id} has no removable links.`);
    invariant(removals.every((guardian) => !guardian.isBillingContact), `Reviewed user ${user.id} has a billing contact outside the keep family.`);
    invariant(removals.every((guardian) => !guardian.family.children.some(isCurrentlyEnrolledChildRecord)), `Reviewed user ${user.id} has a current child outside the keep family.`);
    invariant(user.guardians.every((guardian) => guardian.email?.trim().toLowerCase() === user.email.trim().toLowerCase()), `Reviewed user ${user.id} has mismatched guardian email evidence.`);
    invariant(externalIds.size === 1, `Reviewed user ${user.id} no longer has one shared source person ID.`);
    const keepCenterId = keepGuardians[0].family.centerId;
    invariant(keepCenterId, `Reviewed user ${user.id} keep family has no center.`);
    return {
      userId: user.id,
      tenantId: user.tenantId,
      keepFamilyId,
      keepCenterId,
      removals: removals.map((guardian) => ({
        guardianId: guardian.id,
        familyId: guardian.familyId,
        customFields: guardian.customFields,
      })),
    };
  });
  const planFingerprint = fingerprint(plan.map((item) => ({
    userId: item.userId,
    keepFamilyId: item.keepFamilyId,
    removals: item.removals.map((removal) => ({ guardianId: removal.guardianId, familyId: removal.familyId })),
  })));
  return { plan, planFingerprint };
}

async function applyReviewedFleetPlan(expectedFingerprint: string) {
  const reviewed = await loadReviewedFleetPlan();
  invariant(reviewed.planFingerprint === expectedFingerprint, "Reviewed fleet plan changed after inspection; refusing to apply.");
  invariant(reviewed.plan.length > 0, "No reviewed fleet repairs remain to apply.");

  await prisma.$transaction(async (tx) => {
    for (const item of reviewed.plan) {
      for (const removal of item.removals) {
        const updated = await tx.guardian.updateMany({
          where: { id: removal.guardianId, familyId: removal.familyId, userId: item.userId, isBillingContact: false },
          data: {
            userId: null,
            customFields: parentPortalAccessFields({
              customFields: removal.customFields,
              enabled: false,
              actorEmail: ACTOR,
            }),
          },
        });
        invariant(updated.count === 1, `Reviewed guardian ${removal.guardianId} was not updated exactly once.`);
      }
      await tx.auditLog.create({
        data: {
          tenantId: item.tenantId,
          centerId: item.keepCenterId,
          action: "parent_portal.family_link.corrected",
          resource: "User",
          resourceId: item.userId,
          metadata: {
            source: REPAIR_SOURCE,
            keptFamilyId: item.keepFamilyId,
            unlinkedGuardianIds: item.removals.map((removal) => removal.guardianId),
            unlinkedFamilyIds: item.removals.map((removal) => removal.familyId),
            reason: "shared_source_person_unique_current_billing_household_vs_noncurrent_nonbilling_contacts",
            preservedGuardianRecords: true,
            preservedFamilyRecords: true,
            authUsersChanged: false,
            userRolesChanged: false,
            billingChanged: false,
            messagesOrInvitationsSent: 0,
            planFingerprint: expectedFingerprint,
          } satisfies Prisma.InputJsonObject,
        },
      });
    }
  });

  for (const item of reviewed.plan) {
    const remaining = await prisma.guardian.findMany({ where: { userId: item.userId }, select: { familyId: true } });
    invariant(new Set(remaining.map((guardian) => guardian.familyId)).size === 1, `Reviewed user ${item.userId} remains ambiguous.`);
    invariant(remaining.every((guardian) => guardian.familyId === item.keepFamilyId), `Reviewed user ${item.userId} kept an unexpected family.`);
  }
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const applyFleet = process.argv.includes(APPLY_FLEET_FLAG);
  const confirmed = process.argv.includes(CONFIRM_FLAG);
  const confirmedFleet = process.argv.includes(CONFIRM_FLEET_FLAG);
  const fleetBefore = await loadFleetAudit();
  const targetBefore = await loadTargetState();
  const reviewedFleet = await loadReviewedFleetPlan();
  console.log(JSON.stringify({
    mode: apply ? "apply-target" : applyFleet ? "apply-reviewed-fleet" : "dry-run",
    fleetBefore,
    targetFingerprint: targetBefore.fingerprint,
    reviewedFleetFingerprint: reviewedFleet.planFingerprint,
  }, null, 2));
  if (!apply && !applyFleet) return;
  if (apply) {
    invariant(confirmed, `Apply requires ${CONFIRM_FLAG}.`);
    await applyTargetRepair(targetBefore.fingerprint);
  }
  if (applyFleet) {
    invariant(confirmedFleet, `Fleet apply requires ${CONFIRM_FLEET_FLAG}.`);
    await applyReviewedFleetPlan(reviewedFleet.planFingerprint);
  }
  const fleetAfter = await loadFleetAudit();
  console.log(JSON.stringify({ applied: true, fleetAfter }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
