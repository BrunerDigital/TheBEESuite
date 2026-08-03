import { createHash } from "node:crypto";
import { UserRole, type Prisma } from "@prisma/client";
import { createClient, type SupabaseClient, type User as SupabaseAuthUser } from "@supabase/supabase-js";
import { prisma } from "../src/lib/prisma";
import { currentlyEnrolledStatusValues } from "../src/lib/enrollment-status";
import { defaultGuardianPinFromPhone } from "../src/lib/guardian-kiosk-pin";
import { hashGuardianPin, verifyGuardianPin } from "../src/lib/kiosk";
import { buildTeacherLoginEmail } from "../src/lib/teacher-login";

const EXPECTED_SUPABASE_REF = "nqjrlktoewiueiwrubas";
const ACTOR_ID = "system:user-approved-safe-guardian-teacher-batch:2026-08-03";
const AUTH_SOURCE = "bee_suite_safe_teacher_access_batch";
const apply = process.argv.includes("--apply");
const guardiansOnly = process.argv.includes("--guardians-only");
const teachersOnly = process.argv.includes("--teachers-only");
const verifyOnly = process.argv.includes("--verify-only");
const acknowledgeProduction = process.argv.includes(`--ack-production=${EXPECTED_SUPABASE_REF}`);
const acknowledgeExceptions = process.argv.includes("--ack-safe-exceptions");
const acknowledgedPlanFingerprint = process.argv
  .find((argument) => argument.startsWith("--ack-plan="))
  ?.slice("--ack-plan=".length) || "";

type OperationalCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  locationId: string | null;
  organizationId: string;
  organization: { tenantId: string };
};

type GuardianRecord = {
  id: string;
  phone: string | null;
  checkInPinHash: string | null;
  family: {
    id: string;
    centerId: string | null;
    children: Array<{
      id: string;
      classroomId: string | null;
      classroom: { centerId: string } | null;
    }>;
  };
};

type GuardianPlanItem = {
  guardianId: string;
  familyId: string;
  centerId: string;
  pin: string;
  expectedHash: string;
  currentlyCorrect: boolean;
  visibleChildIds: string[];
  nonVisibleActiveChildIds: string[];
};

type TeacherProfileRecord = {
  id: string;
  centerId: string;
  classroomId: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    tenantId: string;
    organizationId: string | null;
    role: UserRole;
    isActive: boolean;
    mustResetPassword: boolean;
  };
};

type TeacherPlanItem = {
  profileId: string;
  centerId: string;
  tenantId: string;
  organizationId: string;
  userId: string;
  name: string;
  currentEmail: string;
  desiredEmail: string;
  currentAuthUser: SupabaseAuthUser | null;
  classroomId: string | null;
};

type AccessPlan = {
  batchId: string;
  fingerprint: string;
  centers: OperationalCenter[];
  guardians: GuardianPlanItem[];
  guardianExceptions: {
    missingPhone: number;
    noVisibleChild: number;
    desiredPinCollisionGroups: number;
    desiredPinCollisionMembers: number;
    storedPinCollisionMembers: number;
    activeChildrenNotKioskVisible: number;
  };
  teachers: TeacherPlanItem[];
  teacherExceptions: {
    unsafeIdentity: number;
    withoutClassroom: number;
    canonicalPreserved: number;
    generated: number;
  };
  authUsersInspected: number;
};

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getTeacherBatchPassword() {
  const password = process.env.BEE_SUITE_TEACHER_BATCH_PASSWORD?.trim() || "";
  if (!password) {
    throw new Error("Teacher apply and verification require BEE_SUITE_TEACHER_BATCH_PASSWORD.");
  }
  return password;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url.includes(EXPECTED_SUPABASE_REF)) {
    throw new Error("Refusing to operate against an unexpected Supabase project.");
  }
  if (!serviceKey || !anonKey) throw new Error("Supabase service and public keys are required.");
  return { url: url.replace(/\/+$/, ""), serviceKey, anonKey };
}

function getSupabaseAdminClient() {
  const { url, serviceKey } = getSupabaseConfig();
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function listAllSupabaseUsers(supabase: SupabaseClient) {
  const users: SupabaseAuthUser[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new Error("Supabase Auth inventory exceeded 100,000 users; refusing a partial inventory.");
}

function currentEmailMatchesTeacherName(email: string, name: string) {
  const desired = buildTeacherLoginEmail({ fullName: name });
  const desiredLocal = desired.split("@")[0]!;
  const current = normalizeEmail(email);
  const currentLocal = current.split("@")[0] || "";
  return current.endsWith("@thebeesuite.io") &&
    (currentLocal === desiredLocal || new RegExp(`^${escapeRegExp(desiredLocal)}\\d+$`).test(currentLocal));
}

async function buildPlan(supabase: SupabaseClient): Promise<AccessPlan> {
  const centers = await prisma.center.findMany({
    where: {
      status: { equals: "active", mode: "insensitive" },
      sourceSystem: "kidcity_open_schools",
      OR: [{ locationId: { not: null } }, { crmLocationId: { not: null } }],
    },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
    },
    orderBy: [{ crmLocationId: "asc" }, { name: "asc" }],
  });
  const centerIds = centers.map((center) => center.id);
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const enrollmentStatuses = currentlyEnrolledStatusValues();

  const allGuardians = await prisma.guardian.findMany({
    where: { family: { centerId: { in: centerIds } } },
    select: {
      id: true,
      phone: true,
      checkInPinHash: true,
      family: {
        select: {
          id: true,
          centerId: true,
          children: {
            where: { enrollmentStatus: { in: enrollmentStatuses } },
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
  const allGuardiansByCenter = new Map<string, GuardianRecord[]>();
  for (const guardian of allGuardians) {
    const centerId = guardian.family.centerId;
    if (!centerId) continue;
    const group = allGuardiansByCenter.get(centerId) || [];
    group.push(guardian);
    allGuardiansByCenter.set(centerId, group);
  }

  let missingPhone = 0;
  let noVisibleChild = 0;
  const activeChildrenNotVisible = new Set<string>();
  const candidates: GuardianPlanItem[] = [];
  for (const guardian of allGuardians) {
    const centerId = guardian.family.centerId;
    if (!centerId || !centerById.has(centerId) || guardian.family.children.length === 0) continue;
    const visibleChildren = guardian.family.children.filter(
      (child) => Boolean(child.classroomId) && child.classroom?.centerId === centerId,
    );
    const nonVisibleChildren = guardian.family.children.filter(
      (child) => !child.classroomId || child.classroom?.centerId !== centerId,
    );
    nonVisibleChildren.forEach((child) => activeChildrenNotVisible.add(child.id));
    const pin = defaultGuardianPinFromPhone(guardian.phone);
    if (!pin) {
      missingPhone += 1;
      continue;
    }
    if (!visibleChildren.length) {
      noVisibleChild += 1;
      continue;
    }
    const expectedHash = hashGuardianPin(guardian.id, pin);
    candidates.push({
      guardianId: guardian.id,
      familyId: guardian.family.id,
      centerId,
      pin,
      expectedHash,
      currentlyCorrect: guardian.checkInPinHash === expectedHash,
      visibleChildIds: visibleChildren.map((child) => child.id),
      nonVisibleActiveChildIds: nonVisibleChildren.map((child) => child.id),
    });
  }

  const desiredPinGroups = new Map<string, GuardianPlanItem[]>();
  for (const item of candidates) {
    const key = `${item.centerId}:${item.pin}`;
    const group = desiredPinGroups.get(key) || [];
    group.push(item);
    desiredPinGroups.set(key, group);
  }
  const desiredCollisionGroups = [...desiredPinGroups.values()].filter((group) => group.length > 1);
  const desiredCollisionIds = new Set(desiredCollisionGroups.flatMap((group) => group.map((item) => item.guardianId)));
  const planned = new Map(
    candidates
      .filter((item) => !desiredCollisionIds.has(item.guardianId))
      .map((item) => [item.guardianId, item]),
  );
  const storedPinCollisionIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const toRemove = new Set<string>();
    for (const item of planned.values()) {
      const otherGuardians = allGuardiansByCenter.get(item.centerId) || [];
      const collidesWithUnchangedGuardian = otherGuardians.some((other) => {
        if (other.id === item.guardianId || planned.has(other.id) || !other.checkInPinHash) return false;
        return verifyGuardianPin(other.id, item.pin, other.checkInPinHash);
      });
      if (collidesWithUnchangedGuardian) toRemove.add(item.guardianId);
    }
    if (toRemove.size) {
      changed = true;
      for (const guardianId of toRemove) {
        planned.delete(guardianId);
        storedPinCollisionIds.add(guardianId);
      }
    }
  }
  const guardians = [...planned.values()].sort((a, b) =>
    a.centerId.localeCompare(b.centerId) || a.guardianId.localeCompare(b.guardianId),
  );
  const guardianExceptions = {
    missingPhone,
    noVisibleChild,
    desiredPinCollisionGroups: desiredCollisionGroups.length,
    desiredPinCollisionMembers: desiredCollisionIds.size,
    storedPinCollisionMembers: storedPinCollisionIds.size,
    activeChildrenNotKioskVisible: activeChildrenNotVisible.size,
  };
  if (guardiansOnly) {
    const batchSeed = {
      centers: centers.map((center) => center.id),
      guardians: guardians.map((guardian) => guardian.guardianId),
    };
    const planFingerprint = fingerprint(batchSeed);
    return {
      batchId: `safe-access-20260803-${planFingerprint}`,
      fingerprint: planFingerprint,
      centers,
      guardians,
      guardianExceptions,
      teachers: [],
      teacherExceptions: { unsafeIdentity: 0, withoutClassroom: 0, canonicalPreserved: 0, generated: 0 },
      authUsersInspected: 0,
    };
  }

  const [staffProfiles, appUsers, authUsers] = await Promise.all([
    prisma.staffProfile.findMany({
      where: {
        centerId: { in: centerIds },
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
      orderBy: [{ centerId: "asc" }, { id: "asc" }],
    }),
    prisma.user.findMany({ select: { id: true, email: true } }),
    listAllSupabaseUsers(supabase),
  ]);
  const targetUserIds = new Set(staffProfiles.map((profile) => profile.user.id));
  const authByEmail = new Map(
    authUsers.filter((user) => user.email).map((user) => [normalizeEmail(user.email), user]),
  );
  const usedEmails = new Set<string>();
  for (const user of appUsers) {
    if (!targetUserIds.has(user.id)) usedEmails.add(normalizeEmail(user.email));
  }
  for (const authUser of authUsers) {
    const email = normalizeEmail(authUser.email);
    if (!email) continue;
    const targetCurrentOwner = staffProfiles.find((profile) => normalizeEmail(profile.user.email) === email);
    if (!targetCurrentOwner) usedEmails.add(email);
  }

  const teachers: TeacherPlanItem[] = [];
  let unsafeIdentity = 0;
  let withoutClassroom = 0;
  let canonicalPreserved = 0;
  let generated = 0;
  const nonCanonicalProfiles: TeacherProfileRecord[] = [];

  for (const profile of staffProfiles) {
    const center = centerById.get(profile.centerId);
    if (!center || profile.user.tenantId !== center.organization.tenantId) {
      unsafeIdentity += 1;
      continue;
    }
    if (!profile.classroomId) withoutClassroom += 1;
    const currentEmail = normalizeEmail(profile.user.email);
    const currentAuthUser = authByEmail.get(currentEmail) || null;
    const authAppUserId = String(currentAuthUser?.app_metadata?.bee_suite_app_user_id || "");
    const authRole = String(currentAuthUser?.app_metadata?.bee_suite_role || "");
    if (
      currentAuthUser &&
      ((authAppUserId && authAppUserId !== profile.user.id) || (authRole && authRole !== UserRole.TEACHER))
    ) {
      unsafeIdentity += 1;
      continue;
    }
    if (currentEmailMatchesTeacherName(currentEmail, profile.user.name)) {
      if (usedEmails.has(currentEmail)) {
        unsafeIdentity += 1;
        continue;
      }
      usedEmails.add(currentEmail);
      canonicalPreserved += 1;
      teachers.push({
        profileId: profile.id,
        centerId: profile.centerId,
        tenantId: profile.user.tenantId,
        organizationId: center.organizationId,
        userId: profile.user.id,
        name: profile.user.name,
        currentEmail,
        desiredEmail: currentEmail,
        currentAuthUser,
        classroomId: profile.classroomId,
      });
    } else {
      nonCanonicalProfiles.push(profile);
    }
  }

  for (const profile of nonCanonicalProfiles) {
    const center = centerById.get(profile.centerId)!;
    const currentEmail = normalizeEmail(profile.user.email);
    const currentAuthUser = authByEmail.get(currentEmail) || null;
    let desiredEmail = "";
    for (let suffix = 1; suffix <= 500; suffix += 1) {
      const candidate = buildTeacherLoginEmail({ fullName: profile.user.name, suffix });
      if (!usedEmails.has(candidate) && !authByEmail.has(candidate)) {
        desiredEmail = candidate;
        break;
      }
    }
    if (!desiredEmail) {
      unsafeIdentity += 1;
      continue;
    }
    usedEmails.add(desiredEmail);
    generated += 1;
    teachers.push({
      profileId: profile.id,
      centerId: profile.centerId,
      tenantId: profile.user.tenantId,
      organizationId: center.organizationId,
      userId: profile.user.id,
      name: profile.user.name,
      currentEmail,
      desiredEmail,
      currentAuthUser,
      classroomId: profile.classroomId,
    });
  }
  teachers.sort((a, b) => a.centerId.localeCompare(b.centerId) || a.userId.localeCompare(b.userId));

  const batchSeed = {
    centers: centers.map((center) => center.id),
    guardians: guardians.map((guardian) => guardian.guardianId),
    teachers: teachers.map((teacher) => `${teacher.userId}:${teacher.desiredEmail}`),
  };
  const planFingerprint = fingerprint(batchSeed);
  return {
    batchId: `safe-access-20260803-${planFingerprint}`,
    fingerprint: planFingerprint,
    centers,
    guardians,
    guardianExceptions,
    teachers,
    teacherExceptions: { unsafeIdentity, withoutClassroom, canonicalPreserved, generated },
    authUsersInspected: authUsers.length,
  };
}

function planSummary(plan: AccessPlan) {
  const centersWithGuardians = new Set(plan.guardians.map((guardian) => guardian.centerId)).size;
  const centersWithTeachers = new Set(plan.teachers.map((teacher) => teacher.centerId)).size;
  return {
    ok: plan.teacherExceptions.unsafeIdentity === 0,
    mode: apply ? "apply" : "dry-run",
    batchId: plan.batchId,
    fingerprint: plan.fingerprint,
    activeMappedCenters: plan.centers.length,
    centersWithGuardians,
    centersWithTeachers,
    guardians: {
      safe: plan.guardians.length,
      alreadyCorrect: plan.guardians.filter((guardian) => guardian.currentlyCorrect).length,
      needingUpdate: plan.guardians.filter((guardian) => !guardian.currentlyCorrect).length,
      exceptions: plan.guardianExceptions,
    },
    teachers: {
      safe: plan.teachers.length,
      existingAuth: plan.teachers.filter((teacher) => Boolean(teacher.currentAuthUser)).length,
      authCreates: plan.teachers.filter((teacher) => !teacher.currentAuthUser).length,
      emailChanges: plan.teachers.filter((teacher) => teacher.currentEmail !== teacher.desiredEmail).length,
      exceptions: plan.teacherExceptions,
    },
    authUsersInspected: plan.authUsersInspected,
  };
}

async function applyGuardianPins(plan: AccessPlan, batchAt: Date) {
  const byCenter = new Map<string, GuardianPlanItem[]>();
  for (const guardian of plan.guardians) {
    const group = byCenter.get(guardian.centerId) || [];
    group.push(guardian);
    byCenter.set(guardian.centerId, group);
  }
  let updated = 0;
  for (const center of plan.centers) {
    const guardians = byCenter.get(center.id) || [];
    if (!guardians.length) continue;
    const needingUpdate = guardians.filter((guardian) => !guardian.currentlyCorrect);
    await prisma.$transaction(async (tx) => {
      for (const guardian of needingUpdate) {
        const result = await tx.guardian.updateMany({
          where: {
            id: guardian.guardianId,
            family: { centerId: center.id },
          },
          data: {
            checkInPinHash: guardian.expectedHash,
            checkInPinSetAt: batchAt,
            checkInPinSetById: ACTOR_ID,
          },
        });
        if (result.count !== 1) throw new Error("A guardian changed during the safe PIN batch.");
      }
      await tx.auditLog.create({
        data: {
          tenantId: center.organization.tenantId,
          centerId: center.id,
          action: "kiosk.guardian_pin_safe_batch",
          resource: "Center",
          resourceId: center.id,
          metadata: {
            batchId: plan.batchId,
            approvedAt: batchAt.toISOString(),
            safeGuardians: guardians.length,
            updatedGuardians: needingUpdate.length,
            alreadyCorrectGuardians: guardians.length - needingUpdate.length,
            actor: ACTOR_ID,
          },
        },
      });
    }, { maxWait: 20_000, timeout: 120_000 });
    updated += needingUpdate.length;
  }
  return updated;
}

async function ensureTeacherGrant(teacher: TeacherPlanItem, tx: Prisma.TransactionClient) {
  await tx.userAccessGrant.updateMany({
    where: {
      userId: teacher.userId,
      tenantId: teacher.tenantId,
      role: UserRole.TEACHER,
      scopeType: "CENTER",
      isActive: true,
      centerId: { not: teacher.centerId },
    },
    data: { isActive: false },
  });
  const existing = await tx.userAccessGrant.findFirst({
    where: {
      userId: teacher.userId,
      tenantId: teacher.tenantId,
      role: UserRole.TEACHER,
      scopeType: "CENTER",
      centerId: teacher.centerId,
    },
    select: { id: true },
  });
  if (existing) {
    await tx.userAccessGrant.update({
      where: { id: existing.id },
      data: { isActive: true, organizationId: teacher.organizationId },
    });
  } else {
    await tx.userAccessGrant.create({
      data: {
        userId: teacher.userId,
        tenantId: teacher.tenantId,
        organizationId: teacher.organizationId,
        centerId: teacher.centerId,
        role: UserRole.TEACHER,
        scopeType: "CENTER",
        isActive: true,
        permissions: { createdFromSafeTeacherAccessBatch: true },
      },
    });
  }
}

async function applyTeachers(
  plan: AccessPlan,
  supabase: SupabaseClient,
  batchAt: Date,
  teacherPassword: string,
) {
  let createdAuth = 0;
  let updatedAuth = 0;
  let changedEmails = 0;
  for (const teacher of plan.teachers) {
    let authUserId = teacher.currentAuthUser?.id || "";
    let createdThisRun = false;
    const userMetadata = {
      ...jsonObject(teacher.currentAuthUser?.user_metadata),
      name: teacher.name,
      source: AUTH_SOURCE,
    };
    const appMetadata = {
      ...jsonObject(teacher.currentAuthUser?.app_metadata),
      bee_suite_role: UserRole.TEACHER,
      bee_suite_app_user_id: teacher.userId,
      bee_suite_center_id: teacher.centerId,
    };
    if (teacher.currentAuthUser) {
      const { data, error } = await supabase.auth.admin.updateUserById(teacher.currentAuthUser.id, {
        email: teacher.desiredEmail,
        password: teacherPassword,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      });
      if (error || !data.user) throw error || new Error("Supabase did not return the updated teacher user.");
      authUserId = data.user.id;
      updatedAuth += 1;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: teacher.desiredEmail,
        password: teacherPassword,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      });
      if (error || !data.user) throw error || new Error("Supabase did not return the created teacher user.");
      authUserId = data.user.id;
      createdThisRun = true;
      createdAuth += 1;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.updateMany({
          where: { id: teacher.userId, tenantId: teacher.tenantId },
          data: {
            email: teacher.desiredEmail,
            name: teacher.name,
            role: UserRole.TEACHER,
            isActive: true,
            mustResetPassword: false,
            organizationId: teacher.organizationId,
          },
        });
        if (updatedUser.count !== 1) throw new Error("A teacher application user changed during provisioning.");
        await ensureTeacherGrant(teacher, tx);
        await tx.auditLog.create({
          data: {
            tenantId: teacher.tenantId,
            centerId: teacher.centerId,
            userId: teacher.userId,
            action: "staff.teacher_login_safe_batch",
            resource: "User",
            resourceId: teacher.userId,
            metadata: {
              batchId: plan.batchId,
              approvedAt: batchAt.toISOString(),
              authCreated: createdThisRun,
              emailChanged: teacher.currentEmail !== teacher.desiredEmail,
              generatedLogin: true,
              role: UserRole.TEACHER,
              actor: ACTOR_ID,
            },
          },
        });
      }, { maxWait: 20_000, timeout: 60_000 });
    } catch (error) {
      if (createdThisRun) {
        await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
      } else if (teacher.currentAuthUser && teacher.currentEmail !== teacher.desiredEmail) {
        await supabase.auth.admin.updateUserById(teacher.currentAuthUser.id, { email: teacher.currentEmail }).catch(() => undefined);
      }
      throw error;
    }
    if (teacher.currentEmail !== teacher.desiredEmail) changedEmails += 1;
  }
  return { createdAuth, updatedAuth, changedEmails };
}

async function verifyGuardians(plan: AccessPlan) {
  const records = await prisma.guardian.findMany({
    where: { family: { centerId: { in: plan.centers.map((center) => center.id) } } },
    select: {
      id: true,
      checkInPinHash: true,
      family: {
        select: {
          centerId: true,
          children: {
            where: { enrollmentStatus: { in: currentlyEnrolledStatusValues() } },
            select: { id: true, classroomId: true, classroom: { select: { centerId: true } } },
          },
        },
      },
    },
  });
  const recordById = new Map(records.map((record) => [record.id, record]));
  const recordsByCenter = new Map<string, typeof records>();
  for (const record of records) {
    const centerId = record.family.centerId;
    if (!centerId) continue;
    const group = recordsByCenter.get(centerId) || [];
    group.push(record);
    recordsByCenter.set(centerId, group);
  }
  let failures = 0;
  for (const planned of plan.guardians) {
    const record = recordById.get(planned.guardianId);
    if (!record || record.checkInPinHash !== planned.expectedHash || record.family.centerId !== planned.centerId) {
      failures += 1;
      continue;
    }
    const visibleIds = new Set(record.family.children
      .filter((child) => Boolean(child.classroomId) && child.classroom?.centerId === planned.centerId)
      .map((child) => child.id));
    if (!planned.visibleChildIds.every((childId) => visibleIds.has(childId))) failures += 1;
    const otherGuardians = (recordsByCenter.get(planned.centerId) || [])
      .filter((guardian) => guardian.id !== planned.guardianId);
    if (otherGuardians.some((other) => other.checkInPinHash && verifyGuardianPin(other.id, planned.pin, other.checkInPinHash))) {
      failures += 1;
    }
  }
  return { checked: plan.guardians.length, failures };
}

type LoginVerification = {
  ok: boolean;
  status: number;
  reason: string;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loginAndRevoke(email: string, teacherPassword: string): Promise<LoginVerification> {
  const { url, anonKey } = getSupabaseConfig();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const loginResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: teacherPassword }),
      signal: AbortSignal.timeout(20_000),
    });
    if (loginResponse.ok) {
      const payload = await loginResponse.json() as { access_token?: string };
      if (!payload.access_token) return { ok: false, status: loginResponse.status, reason: "missing_access_token" };
      await fetch(`${url}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${payload.access_token}` },
        signal: AbortSignal.timeout(20_000),
      }).catch(() => undefined);
      return { ok: true, status: loginResponse.status, reason: "ok" };
    }
    const payload = await loginResponse.json().catch(() => ({})) as {
      code?: string;
      error_code?: string;
      msg?: string;
      message?: string;
    };
    const reason = payload.error_code || payload.code || payload.msg || payload.message || `http_${loginResponse.status}`;
    const transient = loginResponse.status === 429 || loginResponse.status >= 500;
    if (!transient || attempt === 3) return { ok: false, status: loginResponse.status, reason };
    const retryAfter = Number(loginResponse.headers.get("retry-after"));
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : attempt * 5_000);
  }
  return { ok: false, status: 0, reason: "retry_exhausted" };
}

async function verifyTeachers(plan: AccessPlan, supabase: SupabaseClient, teacherPassword: string) {
  const [users, grants, authUsers] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: plan.teachers.map((teacher) => teacher.userId) } },
      select: { id: true, email: true, role: true, isActive: true, mustResetPassword: true, organizationId: true },
    }),
    prisma.userAccessGrant.findMany({
      where: {
        userId: { in: plan.teachers.map((teacher) => teacher.userId) },
        role: UserRole.TEACHER,
        scopeType: "CENTER",
        isActive: true,
      },
      select: { userId: true, centerId: true, tenantId: true, organizationId: true },
    }),
    listAllSupabaseUsers(supabase),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const authByEmail = new Map(authUsers.filter((user) => user.email).map((user) => [normalizeEmail(user.email), user]));
  const grantsByUser = new Map<string, typeof grants>();
  for (const grant of grants) {
    const group = grantsByUser.get(grant.userId) || [];
    group.push(grant);
    grantsByUser.set(grant.userId, group);
  }
  let recordFailures = 0;
  let loginFailures = 0;
  const loginFailureReasons = new Map<string, number>();
  for (const teacher of plan.teachers) {
    const user = userById.get(teacher.userId);
    const auth = authByEmail.get(teacher.desiredEmail);
    const activeGrants = grantsByUser.get(teacher.userId) || [];
    const validGrant = activeGrants.length === 1 &&
      activeGrants[0]?.centerId === teacher.centerId &&
      activeGrants[0]?.tenantId === teacher.tenantId &&
      activeGrants[0]?.organizationId === teacher.organizationId;
    const validAuth = Boolean(auth) &&
      String(auth?.app_metadata?.bee_suite_role || "") === UserRole.TEACHER &&
      String(auth?.app_metadata?.bee_suite_app_user_id || "") === teacher.userId &&
      String(auth?.app_metadata?.bee_suite_center_id || "") === teacher.centerId;
    if (
      !user ||
      normalizeEmail(user.email) !== teacher.desiredEmail ||
      user.role !== UserRole.TEACHER ||
      !user.isActive ||
      user.mustResetPassword ||
      user.organizationId !== teacher.organizationId ||
      !validGrant ||
      !validAuth
    ) {
      recordFailures += 1;
      continue;
    }
    const login = await loginAndRevoke(teacher.desiredEmail, teacherPassword);
    if (!login.ok) {
      loginFailures += 1;
      const key = `${login.status}:${login.reason}`;
      loginFailureReasons.set(key, (loginFailureReasons.get(key) || 0) + 1);
    }
    await wait(3_500);
  }
  return {
    checked: plan.teachers.length,
    recordFailures,
    loginFailures,
    loginFailureReasons: Object.fromEntries(loginFailureReasons),
  };
}

async function main() {
  if (guardiansOnly && teachersOnly) throw new Error("Choose only one staged operation mode.");
  if (verifyOnly && apply) throw new Error("Verification-only mode cannot apply changes.");
  if (verifyOnly && !teachersOnly) throw new Error("Verification-only mode requires --teachers-only.");
  if (apply && guardiansOnly === teachersOnly) {
    throw new Error("Apply requires exactly one staged mode: --guardians-only or --teachers-only.");
  }
  if (apply && (!acknowledgeProduction || !acknowledgeExceptions)) {
    throw new Error("Apply requires --ack-production=nqjrlktoewiueiwrubas and --ack-safe-exceptions.");
  }
  const supabase = getSupabaseAdminClient();
  const plan = await buildPlan(supabase);
  const summary = planSummary(plan);
  if (plan.teacherExceptions.unsafeIdentity) {
    console.log(JSON.stringify(summary, null, 2));
    throw new Error("Unsafe teacher identity exceptions remain; refusing the batch.");
  }
  if (apply && acknowledgedPlanFingerprint !== plan.fingerprint) {
    console.log(JSON.stringify(summary, null, 2));
    throw new Error(`Apply requires --ack-plan=${plan.fingerprint} from the current reviewed dry-run.`);
  }
  if (verifyOnly) {
    const teacherPassword = getTeacherBatchPassword();
    const guardianVerification = await verifyGuardians(plan);
    const teacherVerification = await verifyTeachers(plan, supabase, teacherPassword);
    const ok = guardianVerification.failures === 0 &&
      teacherVerification.recordFailures === 0 &&
      teacherVerification.loginFailures === 0;
    console.log(JSON.stringify({
      ...summary,
      ok,
      mode: "verify-only",
      verification: { guardians: guardianVerification, teachers: teacherVerification },
    }, null, 2));
    if (!ok) process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const batchAt = new Date();
  const guardiansUpdated = teachersOnly ? 0 : await applyGuardianPins(plan, batchAt);
  const guardianVerification = await verifyGuardians(plan);
  if (guardianVerification.failures) {
    throw new Error(`Guardian verification failed for ${guardianVerification.failures} records; teacher provisioning did not start.`);
  }
  if (guardiansOnly) {
    console.log(JSON.stringify({
      ...summary,
      ok: true,
      stage: "guardians",
      appliedAt: batchAt.toISOString(),
      writes: { guardiansUpdated },
      verification: { guardians: guardianVerification },
    }, null, 2));
    return;
  }
  const teacherPassword = getTeacherBatchPassword();
  const teacherWrites = await applyTeachers(plan, supabase, batchAt, teacherPassword);
  const teacherVerification = await verifyTeachers(plan, supabase, teacherPassword);
  const ok = guardianVerification.failures === 0 &&
    teacherVerification.recordFailures === 0 &&
    teacherVerification.loginFailures === 0;
  console.log(JSON.stringify({
    ...summary,
    ok,
    stage: teachersOnly ? "teachers" : "guardians-and-teachers",
    appliedAt: batchAt.toISOString(),
    writes: { guardiansUpdated, ...teacherWrites },
    verification: { guardians: guardianVerification, teachers: teacherVerification },
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
