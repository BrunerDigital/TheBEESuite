import { createHash } from "node:crypto";
import { UserRole } from "@prisma/client";
import { createClient, type User as SupabaseAuthUser } from "@supabase/supabase-js";
import { prisma } from "../src/lib/prisma";
import { currentlyEnrolledStatusValues } from "../src/lib/enrollment-status";
import { defaultGuardianPinFromPhone } from "../src/lib/guardian-kiosk-pin";
import { hashGuardianPin } from "../src/lib/kiosk";
import { buildTeacherLoginEmail } from "../src/lib/teacher-login";

const EXPECTED_SUPABASE_REF = "nqjrlktoewiueiwrubas";

type CenterSummary = {
  center: string;
  sourceSystem: string | null;
  externalId: string | null;
  locationId: string | null;
  guardians: number;
  guardiansMissingUsablePhone: number;
  guardiansWithoutVisibleChildren: number;
  guardiansSafeForRequestedPinReset: number;
  guardiansNeedingPinReset: number;
  visibleChildren: number;
  activeStatusChildrenNotKioskVisible: number;
  guardianPinCollisions: number;
  crossFamilyGuardianPinCollisions: number;
  teachers: number;
  teacherEmailChanges: number;
  teacherAuthCreates: number;
  teacherAuthUpdates: number;
  teacherConflicts: number;
  teachersWithoutClassroom: number;
  teachersWithCanonicalCurrentEmail: number;
  teachersWithCurrentAuth: number;
};

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function stableFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase admin configuration is missing.");
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== `${EXPECTED_SUPABASE_REF}.supabase.co`) {
    throw new Error("Refusing to audit an unexpected Supabase project.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function listAllSupabaseUsers() {
  const supabase = getSupabaseAdminClient();
  const users: SupabaseAuthUser[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new Error("Supabase Auth inventory exceeded 100,000 users; refusing a partial audit.");
}

async function main() {
  if (!process.env.PIN_HASH_SECRET?.trim()) {
    throw new Error("PIN_HASH_SECRET is required for a production guardian PIN audit.");
  }
  const activeCenters = await prisma.center.findMany({
    where: { status: { equals: "active", mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      sourceSystem: true,
      externalId: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
    },
    orderBy: [{ crmLocationId: "asc" }, { name: "asc" }],
  });
  const activeCenterIds = activeCenters.map((center) => center.id);
  const centerById = new Map(activeCenters.map((center) => [center.id, center]));
  const centerSummaries = new Map<string, CenterSummary>();
  for (const center of activeCenters) {
    centerSummaries.set(center.id, {
      center: center.crmLocationId || center.name,
      sourceSystem: center.sourceSystem,
      externalId: center.externalId,
      locationId: center.locationId,
      guardians: 0,
      guardiansMissingUsablePhone: 0,
      guardiansWithoutVisibleChildren: 0,
      guardiansSafeForRequestedPinReset: 0,
      guardiansNeedingPinReset: 0,
      visibleChildren: 0,
      activeStatusChildrenNotKioskVisible: 0,
      guardianPinCollisions: 0,
      crossFamilyGuardianPinCollisions: 0,
      teachers: 0,
      teacherEmailChanges: 0,
      teacherAuthCreates: 0,
      teacherAuthUpdates: 0,
      teacherConflicts: 0,
      teachersWithoutClassroom: 0,
      teachersWithCanonicalCurrentEmail: 0,
      teachersWithCurrentAuth: 0,
    });
  }

  const enrolledStatuses = currentlyEnrolledStatusValues();
  const guardians = await prisma.guardian.findMany({
    where: {
      family: {
        centerId: { in: activeCenterIds },
        children: { some: { enrollmentStatus: { in: enrolledStatuses } } },
      },
    },
    select: {
      id: true,
      phone: true,
      checkInPinHash: true,
      family: {
        select: {
          id: true,
          centerId: true,
          children: {
            where: { enrollmentStatus: { in: enrolledStatuses } },
            select: {
              id: true,
              classroomId: true,
              classroom: { select: { centerId: true } },
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const pinGroups = new Map<string, Array<{ guardianId: string; familyId: string; centerId: string }>>();
  let guardiansMissingUsablePhone = 0;
  let guardiansWithoutVisibleChildren = 0;
  let guardianPinResets = 0;
  const guardianIdsMissingUsablePhone = new Set<string>();
  const guardianIdsWithoutVisibleChildren = new Set<string>();
  const visibleChildIds = new Set<string>();
  const nonVisibleActiveChildIds = new Set<string>();

  for (const guardian of guardians) {
    const centerId = guardian.family.centerId;
    if (!centerId || !centerById.has(centerId)) continue;
    const summary = centerSummaries.get(centerId)!;
    summary.guardians += 1;

    const visibleChildren = guardian.family.children.filter(
      (child) => Boolean(child.classroomId) && child.classroom?.centerId === centerId,
    );
    const nonVisibleChildren = guardian.family.children.filter(
      (child) => !child.classroomId || child.classroom?.centerId !== centerId,
    );
    visibleChildren.forEach((child) => visibleChildIds.add(child.id));
    nonVisibleChildren.forEach((child) => nonVisibleActiveChildIds.add(child.id));
    if (!visibleChildren.length) {
      guardiansWithoutVisibleChildren += 1;
      guardianIdsWithoutVisibleChildren.add(guardian.id);
      summary.guardiansWithoutVisibleChildren += 1;
    }

    const pin = defaultGuardianPinFromPhone(guardian.phone);
    if (!pin) {
      guardiansMissingUsablePhone += 1;
      guardianIdsMissingUsablePhone.add(guardian.id);
      summary.guardiansMissingUsablePhone += 1;
      continue;
    }

    const expectedHash = hashGuardianPin(guardian.id, pin);
    if (guardian.checkInPinHash !== expectedHash) {
      guardianPinResets += 1;
      summary.guardiansNeedingPinReset += 1;
    }
    const collisionKey = `${centerId}:${pin}`;
    const group = pinGroups.get(collisionKey) || [];
    group.push({ guardianId: guardian.id, familyId: guardian.family.id, centerId });
    pinGroups.set(collisionKey, group);
  }

  const collisionGroups = [...pinGroups.values()].filter((group) => group.length > 1);
  const crossFamilyCollisionGroups = collisionGroups.filter(
    (group) => new Set(group.map((item) => item.familyId)).size > 1,
  );
  const sameFamilyCollisionGroups = collisionGroups.filter(
    (group) => new Set(group.map((item) => item.familyId)).size === 1,
  );
  const guardianIdsInAnyCollision = new Set(collisionGroups.flatMap((group) => group.map((item) => item.guardianId)));
  const guardianIdsInCrossFamilyCollision = new Set(crossFamilyCollisionGroups.flatMap((group) => group.map((item) => item.guardianId)));
  const safeGuardianIds = new Set(
    guardians
      .map((guardian) => guardian.id)
      .filter((guardianId) =>
        !guardianIdsMissingUsablePhone.has(guardianId) &&
        !guardianIdsWithoutVisibleChildren.has(guardianId) &&
        !guardianIdsInAnyCollision.has(guardianId),
      ),
  );
  for (const group of collisionGroups) {
    const summary = centerSummaries.get(group[0]!.centerId);
    if (summary) summary.guardianPinCollisions += 1;
  }
  for (const group of crossFamilyCollisionGroups) {
    const summary = centerSummaries.get(group[0]!.centerId);
    if (summary) summary.crossFamilyGuardianPinCollisions += 1;
  }
  for (const guardian of guardians) {
    if (!safeGuardianIds.has(guardian.id) || !guardian.family.centerId) continue;
    const summary = centerSummaries.get(guardian.family.centerId);
    if (summary) summary.guardiansSafeForRequestedPinReset += 1;
  }

  for (const centerId of activeCenterIds) {
    const summary = centerSummaries.get(centerId)!;
    const centerGuardians = guardians.filter((guardian) => guardian.family.centerId === centerId);
    const centerVisibleIds = new Set(
      centerGuardians.flatMap((guardian) => guardian.family.children)
        .filter((child) => Boolean(child.classroomId) && child.classroom?.centerId === centerId)
        .map((child) => child.id),
    );
    const centerNonVisibleIds = new Set(
      centerGuardians.flatMap((guardian) => guardian.family.children)
        .filter((child) => !child.classroomId || child.classroom?.centerId !== centerId)
        .map((child) => child.id),
    );
    summary.visibleChildren = centerVisibleIds.size;
    summary.activeStatusChildrenNotKioskVisible = centerNonVisibleIds.size;
  }

  const [staffProfiles, appUsers, authUsers] = await Promise.all([
    prisma.staffProfile.findMany({
      where: {
        centerId: { in: activeCenterIds },
        user: { role: UserRole.TEACHER, isActive: true },
      },
      select: {
        id: true,
        centerId: true,
        classroomId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            tenantId: true,
            organizationId: true,
            role: true,
            isActive: true,
            mustResetPassword: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, email: true } }),
    listAllSupabaseUsers(),
  ]);

  const appUserByEmail = new Map(appUsers.map((user) => [normalizeEmail(user.email), user]));
  const authUserByEmail = new Map(
    authUsers.filter((user) => user.email).map((user) => [normalizeEmail(user.email), user]),
  );
  const desiredEmailGroups = new Map<string, typeof staffProfiles>();
  for (const profile of staffProfiles) {
    const desiredEmail = buildTeacherLoginEmail({ fullName: profile.user.name });
    const group = desiredEmailGroups.get(desiredEmail) || [];
    group.push(profile);
    desiredEmailGroups.set(desiredEmail, group);
  }

  let teacherEmailChanges = 0;
  let teacherAuthCreates = 0;
  let teacherAuthUpdates = 0;
  let teacherConflicts = 0;
  let teachersWithoutClassroom = 0;
  let teachersWithCanonicalCurrentEmail = 0;
  let teachersWithCurrentAuth = 0;
  const conflictTypes = new Map<string, number>();

  function conflict(type: string, centerId: string) {
    teacherConflicts += 1;
    conflictTypes.set(type, (conflictTypes.get(type) || 0) + 1);
    const summary = centerSummaries.get(centerId);
    if (summary) summary.teacherConflicts += 1;
  }

  for (const profile of staffProfiles) {
    const center = centerById.get(profile.centerId);
    if (!center) continue;
    const summary = centerSummaries.get(profile.centerId)!;
    summary.teachers += 1;
    if (!profile.classroomId) {
      teachersWithoutClassroom += 1;
      summary.teachersWithoutClassroom += 1;
    }

    const currentEmail = normalizeEmail(profile.user.email);
    const desiredEmail = buildTeacherLoginEmail({ fullName: profile.user.name });
    const desiredLocalPart = desiredEmail.split("@")[0]!;
    const currentLocalPart = currentEmail.split("@")[0] || "";
    const canonicalCurrentEmail = currentEmail.endsWith("@thebeesuite.io") &&
      (currentLocalPart === desiredLocalPart || new RegExp(`^${desiredLocalPart}\\d+$`).test(currentLocalPart));
    const desiredGroup = desiredEmailGroups.get(desiredEmail) || [];
    const occupyingAppUser = appUserByEmail.get(desiredEmail);
    const currentAuthUser = authUserByEmail.get(currentEmail);
    const desiredAuthUser = authUserByEmail.get(desiredEmail);
    const desiredAuthAppUserId = String(desiredAuthUser?.app_metadata?.bee_suite_app_user_id || "");
    const currentAuthAppUserId = String(currentAuthUser?.app_metadata?.bee_suite_app_user_id || "");

    if (canonicalCurrentEmail) {
      teachersWithCanonicalCurrentEmail += 1;
      summary.teachersWithCanonicalCurrentEmail += 1;
    }
    if (currentAuthUser) {
      teachersWithCurrentAuth += 1;
      summary.teachersWithCurrentAuth += 1;
    }

    if (desiredGroup.length > 1) {
      conflict("duplicate_teacher_name", profile.centerId);
      continue;
    }
    if (occupyingAppUser && occupyingAppUser.id !== profile.user.id) {
      conflict("desired_app_email_occupied", profile.centerId);
      continue;
    }
    if (currentAuthUser && currentAuthAppUserId && currentAuthAppUserId !== profile.user.id) {
      conflict("current_auth_owned_by_different_app_user", profile.centerId);
      continue;
    }
    if (
      desiredAuthUser &&
      desiredAuthUser.id !== currentAuthUser?.id &&
      desiredAuthAppUserId !== profile.user.id
    ) {
      conflict("desired_auth_email_occupied", profile.centerId);
      continue;
    }

    if (currentEmail !== desiredEmail) {
      teacherEmailChanges += 1;
      summary.teacherEmailChanges += 1;
    }
    if (!currentAuthUser && !desiredAuthUser) {
      teacherAuthCreates += 1;
      summary.teacherAuthCreates += 1;
    } else {
      teacherAuthUpdates += 1;
      summary.teacherAuthUpdates += 1;
    }
  }

  const centersWithWork = [...centerSummaries.values()].filter(
    (summary) =>
      summary.guardians ||
      summary.activeStatusChildrenNotKioskVisible ||
      summary.teachers ||
      summary.teacherConflicts,
  );

  const failClosedReasons: string[] = [];
  if (guardiansMissingUsablePhone) failClosedReasons.push("guardian_missing_usable_phone");
  if (guardiansWithoutVisibleChildren) failClosedReasons.push("guardian_has_no_kiosk_visible_child");
  if (crossFamilyCollisionGroups.length) failClosedReasons.push("cross_family_guardian_pin_collision");
  if (teacherConflicts) failClosedReasons.push("teacher_identity_conflict");

  console.log(JSON.stringify({
    ok: failClosedReasons.length === 0,
    mode: "dry-run",
    productionProject: "nqjrlktoewiueiwrubas",
    inventory: {
      activeCenters: activeCenters.length,
      guardiansInActiveFamiliesWithActiveStatusChildren: guardians.length,
      guardiansMissingUsablePhone,
      guardiansWithoutVisibleChildren,
      guardiansNeedingPinReset: guardianPinResets,
      kioskVisibleChildren: visibleChildIds.size,
      activeStatusChildrenNotKioskVisible: nonVisibleActiveChildIds.size,
      guardianPinCollisionGroups: collisionGroups.length,
      guardianPinCollisionMembers: guardianIdsInAnyCollision.size,
      sameFamilyGuardianPinCollisionGroups: sameFamilyCollisionGroups.length,
      crossFamilyGuardianPinCollisionGroups: crossFamilyCollisionGroups.length,
      crossFamilyGuardianPinCollisionMembers: guardianIdsInCrossFamilyCollision.size,
      guardiansSafeForRequestedPinReset: safeGuardianIds.size,
      activeTeachers: staffProfiles.length,
      teachersWithoutClassroom,
      teachersWithCanonicalCurrentEmail,
      teachersWithCurrentAuth,
      teacherEmailChanges,
      teacherAuthCreates,
      teacherAuthUpdates,
      teacherConflicts,
      authUsersInspected: authUsers.length,
      appUsersInspected: appUsers.length,
    },
    teacherConflictTypes: Object.fromEntries([...conflictTypes.entries()].sort(([a], [b]) => a.localeCompare(b))),
    failClosedReasons,
    centers: centersWithWork,
    auditFingerprint: stableFingerprint(JSON.stringify({
      activeCenterIds,
      guardianIds: guardians.map((guardian) => guardian.id),
      staffUserIds: staffProfiles.map((profile) => profile.user.id),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
