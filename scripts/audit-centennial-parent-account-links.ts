import "./load-env";

import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { isCurrentlyEnrolledChildRecord } from "@/lib/enrollment-status";
import { parentPortalAccessFields } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cms3g2the000i6a7wdd8pa20s";
const CENTER_NAME = "Miss Honey's Learning Center - Centennial";
const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-centennial-parent-account-links";
const ACTOR_EMAIL = "system:centennial-parent-link-repair";
const REPAIR_SOURCE = "centennial_parent_account_links_2026_08_06";

type RawGuardian = {
  id: string;
  fullName: string;
  email: string | null;
  userId: string | null;
  customFields: Prisma.JsonValue;
  family: {
    id: string;
    name: string;
    externalId: string | null;
    children: Array<{ id: string; enrollmentStatus: string | null; classroomId: string | null }>;
  };
};

type RawUser = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  tenantId: string;
};

type FamilyProfile = {
  id: string;
  name: string;
  externalId: string | null;
  currentChildCount: number;
  totalChildren: number;
  guardianIds: string[];
};

type UserRepairPlan = {
  userId: string;
  user: RawUser;
  familyProfiles: FamilyProfile[];
  removableGuardianIds: string[];
  removableFamilyIds: string[];
  keepFamilyId: string | null;
  status: "repair" | "skip";
  skipReason: string | null;
  sampleFamilyNames: string[];
};

type RepairSummary = {
  centerId: string;
  centerName: string;
  totalLinkedGuardians: number;
  usersWithSingleFamily: number;
  usersWithMultipleFamilies: number;
  repairableUsers: number;
  skippedUsers: number;
  removableGuardianLinks: number;
  planFingerprint: string;
};

type Database = PrismaClient | Prisma.TransactionClient;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonClone(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function fingerprint(plan: UserRepairPlan[]) {
  const cleaned = plan.map((item) => ({
    userId: item.userId,
    keepFamilyId: item.keepFamilyId,
    removableFamilyIds: [...item.removableFamilyIds].sort(),
  })).sort((left, right) => left.userId.localeCompare(right.userId));
  return createHash("sha256").update(JSON.stringify(cleaned)).digest("hex");
}

async function loadPlan(db: Database = prisma) {
  const center = await db.center.findUnique({
    where: { id: CENTER_ID },
    select: {
      id: true,
      name: true,
      organization: { select: { tenantId: true, name: true, tenant: { select: { slug: true } } },
      },
    },
  });
  invariant(center, `${CENTER_ID} not found.`);
  invariant(center.name === CENTER_NAME, `Expected ${CENTER_NAME}; found ${center.name}.`);

  const guardians = await db.guardian.findMany({
    where: { family: { centerId: CENTER_ID }, userId: { not: null } },
    select: {
      id: true,
      fullName: true,
      email: true,
      userId: true,
      customFields: true,
      family: {
        select: {
          id: true,
          name: true,
          externalId: true,
          children: { select: { id: true, enrollmentStatus: true, classroomId: true }, orderBy: { id: "asc" } },
        },
      },
    },
    orderBy: [{ userId: "asc" }, { familyId: "asc" }, { fullName: "asc" }],
  });
  invariant(guardians.length > 0, "No linked Centennial guardian records were found.");

  const userRows = new Map<string, RawGuardian[]>();
  for (const guardian of guardians) {
    if (!guardian.userId) continue;
    const rows = userRows.get(guardian.userId) ?? [];
    rows.push(guardian);
    userRows.set(guardian.userId, rows);
  }

  const users = await db.user.findMany({
    where: { id: { in: [...userRows.keys()] } },
    select: { id: true, email: true, name: true, isActive: true, tenantId: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  invariant(center.organization.tenantId, "The target center tenant is missing.");

  const plans: UserRepairPlan[] = [];
  for (const [userId, userGuardians] of userRows.entries()) {
    const user = userById.get(userId);
    invariant(user, `Guardian records refer to missing app user ${userId}.`);
    invariant(user.tenantId === center.organization.tenantId, `User ${user.id} crosses tenants for center ${center.id}.`);

    const familyBuckets = new Map<string, { family: RawGuardian["family"]; guardianIds: string[] }>();
    for (const guardian of userGuardians) {
      const current = familyBuckets.get(guardian.family.id);
      if (current) {
        current.guardianIds.push(guardian.id);
      } else {
        familyBuckets.set(guardian.family.id, { family: guardian.family, guardianIds: [guardian.id] });
      }
    }

    const familyProfiles: FamilyProfile[] = [...familyBuckets.values()].map((bucket) => {
      const currentChildren = bucket.family.children.filter(isCurrentlyEnrolledChildRecord);
      return {
        id: bucket.family.id,
        name: bucket.family.name,
        externalId: bucket.family.externalId,
        currentChildCount: currentChildren.length,
        totalChildren: bucket.family.children.length,
        guardianIds: bucket.guardianIds,
      };
    });

    if (familyProfiles.length === 1) {
      plans.push({
        userId,
        user,
        familyProfiles,
        removableGuardianIds: [],
        removableFamilyIds: [],
        keepFamilyId: familyProfiles[0].id,
        status: "skip",
        skipReason: "single_family_link",
        sampleFamilyNames: familyProfiles.map((family) => `${family.name} (${family.id})`),
      });
      continue;
    }

    const keepFamily = familyProfiles.find((family) => family.currentChildCount > 0);
    const removableFamilies = familyProfiles.filter((family) => family.currentChildCount === 0);
    if (!keepFamily) {
      plans.push({
        userId,
        user,
        familyProfiles,
        removableGuardianIds: [],
        removableFamilyIds: [],
        keepFamilyId: null,
        status: "skip",
        skipReason: "multiple_families_without_current_child",
        sampleFamilyNames: familyProfiles.map((family) => `${family.name} (${family.id})`),
      });
      continue;
    }

    const competingCurrentFamilies = familyProfiles.filter((family) => family.currentChildCount > 0).length;
    if (competingCurrentFamilies > 1) {
      plans.push({
        userId,
        user,
        familyProfiles,
        removableGuardianIds: [],
        removableFamilyIds: [],
        keepFamilyId: keepFamily.id,
        status: "skip",
        skipReason: `multiple_current_families_for_user_${competingCurrentFamilies}`,
        sampleFamilyNames: familyProfiles.map((family) => `${family.name} (${family.id})`),
      });
      continue;
    }

    const removable = removableFamilies.filter((family) => family.id !== keepFamily.id && family.totalChildren === 0);
    if (removable.length === 0) {
      plans.push({
        userId,
        user,
        familyProfiles,
        removableGuardianIds: [],
        removableFamilyIds: [],
        keepFamilyId: keepFamily.id,
        status: "skip",
        skipReason: "no_empty_legacy_family_candidates",
        sampleFamilyNames: familyProfiles.map((family) => `${family.name} (${family.id})`),
      });
      continue;
    }

    const removableGuardianIds = removable.flatMap((family) => family.guardianIds);
    const removableFamilyIds = removable.map((family) => family.id);
    plans.push({
      userId,
      user,
      familyProfiles,
      removableGuardianIds,
      removableFamilyIds,
      keepFamilyId: keepFamily.id,
      status: "repair",
      skipReason: null,
      sampleFamilyNames: familyProfiles.map((family) => `${family.name} (${family.id})`),
    });
  }

  const repairable = plans.filter((plan) => plan.status === "repair");
  const skipped = plans.filter((plan) => plan.status === "skip");
  const summary: RepairSummary = {
    centerId: CENTER_ID,
    centerName: CENTER_NAME,
    totalLinkedGuardians: guardians.length,
    usersWithSingleFamily: plans.filter((plan) => plan.familyProfiles.length === 1).length,
    usersWithMultipleFamilies: plans.filter((plan) => plan.familyProfiles.length > 1).length,
    repairableUsers: repairable.length,
    skippedUsers: skipped.length,
    removableGuardianLinks: repairable.reduce((sum, plan) => sum + plan.removableGuardianIds.length, 0),
    planFingerprint: fingerprint(repairable),
  };

  return { summary, plans, center, repairable };
}

function publicSummary(plan: ReturnType<Awaited<ReturnType<typeof loadPlan>>>) {
  const repairItems = plan.plans
    .filter((item) => item.status === "repair")
    .map((item) => ({
      userId: item.userId,
      userEmail: item.user.email,
      keepFamilyId: item.keepFamilyId,
      removableGuardianIds: item.removableGuardianIds,
      removableFamilyIds: item.removableFamilyIds,
      families: item.sampleFamilyNames,
    }));
  const skippedItems = plan.plans
    .filter((item) => item.status === "skip")
    .map((item) => ({
      userId: item.userId,
      userEmail: item.user.email,
      keepFamilyId: item.keepFamilyId,
      skipReason: item.skipReason,
      families: item.sampleFamilyNames,
    }));

  return {
    summary: {
      ...plan.summary,
      repairableFamiliesToClear: repairItems.length,
    },
    repairPlan: repairItems,
    skipped: skippedItems,
    tenant: {
      tenantId: plan.center.organization.tenantId,
      tenantName: plan.center.organization.name,
      tenantSlug: plan.center.organization.tenant?.slug ?? null,
    },
  };
}

async function applyRepair(plan: Awaited<ReturnType<typeof loadPlan>>, expectedFingerprint: string) {
  const expectedIds = new Set(plan.plans.filter((item) => item.status === "repair").flatMap((item) => item.removableGuardianIds));
  if (expectedIds.size === 0) return { repairedUsers: 0, repairedGuardianLinks: 0 };

  const appliedAt = new Date().toISOString();
  const preApply = await loadPlan();
  invariant(fingerprint(preApply.plans.filter((item) => item.status === "repair")) === expectedFingerprint, "The repair plan changed before applying.");

  const result = await prisma.$transaction(async (tx) => {
    const current = await loadPlan(tx);
    const currentRepair = current.plans.filter((item) => item.status === "repair");
    invariant(fingerprint(currentRepair) === expectedFingerprint, "The repair candidates changed during apply validation.");
    const toProcess = current.plans.filter((item) => item.status === "repair");

    let repairedUsers = 0;
    let repairedGuardianLinks = 0;

    for (const userPlan of toProcess) {
      const linkedGuardians = await tx.guardian.findMany({
        where: { id: { in: userPlan.removableGuardianIds } },
        select: { id: true, customFields: true },
      });
      for (const guardian of linkedGuardians) {
        await tx.guardian.update({
          where: { id: guardian.id },
          data: {
            userId: null,
            customFields: parentPortalAccessFields({ customFields: guardian.customFields, enabled: false, actorEmail: ACTOR_EMAIL }),
          },
        });
        repairedGuardianLinks += 1;
      }

      await tx.auditLog.create({
        data: {
          tenantId: current.center.organization.tenantId,
          centerId: CENTER_ID,
          action: "parent_portal.legacy_family_links_unlinked",
          resource: "User",
          resourceId: userPlan.userId,
          metadata: jsonClone({
            repairSource: REPAIR_SOURCE,
            actorEmail: ACTOR_EMAIL,
            repairAppliedAt: appliedAt,
            keepFamilyId: userPlan.keepFamilyId,
            removedFamilyIds: userPlan.removableFamilyIds,
            removedGuardianIds: userPlan.removableGuardianIds,
          }),
        },
      });
      repairedUsers += 1;
    }

    const after = await loadPlan(tx);
    const remainingRepairTargets = after.plans.filter((item) => item.status === "repair").length;
    invariant(remainingRepairTargets === 0, "Some repair candidates remained after applying the Centennial link cleanup.");
    return { repairedUsers, repairedGuardianLinks };
  }, { isolationLevel: "Serializable", timeout: 120_000, maxWait: 10_000 });

  return result;
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const confirmed = process.argv.includes(CONFIRM_FLAG);

  const plan = await loadPlan();
  const repairable = plan.plans.filter((item) => item.status === "repair");
  const summary = publicSummary(plan);
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
    return;
  }

  invariant(confirmed, `Apply mode requires ${CONFIRM_FLAG}.`);
  invariant(repairable.length > 0, "Nothing to repair.");
  const result = await applyRepair(plan, summary.summary.planFingerprint);
  console.log(JSON.stringify({ dryRun: false, applied: true, summary: summary.summary, result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
