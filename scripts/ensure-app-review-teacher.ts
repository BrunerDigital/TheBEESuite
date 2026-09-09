import "./load-env";
import { Prisma, UserRole } from "@prisma/client";
import {
  appReviewCenterScopeSelect,
  appReviewCenterScopeViolation,
  appReviewClassroomRosterSelect,
  appReviewClassroomScopeViolation,
  appReviewScopeDigest,
  assertAppReviewTargetFingerprint,
  buildAppReviewTargetFingerprint,
} from "@/lib/app-review-targeting";
import { prisma } from "@/lib/prisma";
import { removeProfilePhotoCustomFields } from "@/lib/profile-photo";
import {
  SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID,
  SYNTHETIC_ROLE_QA_TENANT_SLUG,
} from "@/lib/synthetic-role-qa";
import {
  getSupabaseAuthUserMetadataByEmail,
  upsertSupabaseAuthUserWithPassword,
} from "@/lib/supabase-auth";

const DEMO_SOURCE = "bee_suite_demo";
const APP_REVIEW_SOURCE = "bee_suite_app_review";
const APP_REVIEW_STAFF_EXTERNAL_ID = "app-review-teacher-primary";
const APP_REVIEW_EMAIL = "app-review-teacher@thebeesuite.io";
const SCRIPT_SOURCE = "scripts/ensure-app-review-teacher.ts";
const CONFIRM_FLAG = "--confirm-teacher-app-review-account";
const TARGET_ENVIRONMENT_VARIABLES = [
  "APP_REVIEW_TEACHER_TENANT_ID",
  "APP_REVIEW_TEACHER_CENTER_ID",
  "APP_REVIEW_TEACHER_CLASSROOM_ID",
  "APP_REVIEW_TEACHER_SOURCE_STAFF_ID",
] as const;

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mergeCustomFields(value: unknown, patch: Prisma.InputJsonObject) {
  return {
    ...(asRecord(value) as Prisma.InputJsonObject),
    ...patch,
  } as Prisma.InputJsonObject;
}

function reviewStaffCustomFields(value: unknown) {
  const fields = { ...asRecord(value) };
  delete fields.staffKioskPinHash;
  delete fields.staffKioskPinSetAt;
  delete fields.staffKioskPinSetById;
  delete fields.staffContactEmail;
  delete fields.timeClock;
  return mergeCustomFields(fields, {
    appReview: true,
    seededBy: SCRIPT_SOURCE,
  });
}

function readTargetInput() {
  return {
    tenantId: process.env.APP_REVIEW_TEACHER_TENANT_ID?.trim() || "",
    centerId: process.env.APP_REVIEW_TEACHER_CENTER_ID?.trim() || "",
    classroomId: process.env.APP_REVIEW_TEACHER_CLASSROOM_ID?.trim() || "",
    sourceStaffProfileId: process.env.APP_REVIEW_TEACHER_SOURCE_STAFF_ID?.trim() || "",
    fingerprint: process.env.APP_REVIEW_TEACHER_TARGET_FINGERPRINT?.trim() || "",
  };
}

function teacherTargetFingerprint(input: {
  email: string;
  tenantId: string;
  organizationId: string;
  centerId: string;
  classroomId: string;
  sourceStaffProfileId: string;
  sourceUserId: string;
  scopeDigest: string;
}) {
  return buildAppReviewTargetFingerprint("teacher", input);
}

async function listTeacherTargets(email: string) {
  const profiles = await prisma.staffProfile.findMany({
    where: {
      sourceSystem: DEMO_SOURCE,
      classroomId: { not: null },
      user: { role: UserRole.TEACHER },
      center: {
        sourceSystem: DEMO_SOURCE,
        externalId: SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID,
        status: { notIn: ["closed", "archived", "inactive"] },
        organization: { tenant: { slug: SYNTHETIC_ROLE_QA_TENANT_SLUG } },
      },
    },
    orderBy: [{ centerId: "asc" }, { classroomId: "asc" }, { id: "asc" }],
    include: {
      user: { select: { id: true, name: true, tenantId: true, role: true, isActive: true } },
      center: { select: appReviewCenterScopeSelect },
      classroom: { select: { ...appReviewClassroomRosterSelect, name: true } },
    },
  });

  return profiles.flatMap((profile) => {
    if (
      !profile.classroom ||
      !profile.externalId ||
      asRecord(profile.customFields).demoWorkspace !== true ||
      !profile.user.isActive ||
      profile.user.role !== UserRole.TEACHER ||
      profile.user.tenantId !== profile.center.organization.tenantId ||
      profile.classroom.centerId !== profile.centerId ||
      profile.classroom.sourceSystem !== DEMO_SOURCE ||
      appReviewCenterScopeViolation({
        center: profile.center,
        tenantId: profile.center.organization.tenantId,
      }) ||
      appReviewClassroomScopeViolation({
        classroom: profile.classroom,
        centerId: profile.centerId,
        tenantId: profile.center.organization.tenantId,
      })
    ) return [];
    const target = {
      email,
      tenantId: profile.center.organization.tenantId,
      organizationId: profile.center.organizationId,
      centerId: profile.center.id,
      classroomId: profile.classroom.id,
      sourceStaffProfileId: profile.id,
      sourceUserId: profile.user.id,
      scopeDigest: appReviewScopeDigest({ center: profile.center, classroom: profile.classroom }),
    };
    const reviewFamilies = Array.from(new Map(
      profile.classroom.children.map((child) => [child.familyId, child.family] as const),
    ).values());
    return [{
      ...target,
      centerName: profile.center.name,
      classroomName: profile.classroom.name,
      sourceStaffName: profile.user.name,
      reviewDataSummary: {
        children: profile.classroom.children.length,
        families: reviewFamilies.length,
        staff: profile.classroom.staff.length,
        dailyReports: reviewFamilies.reduce(
          (total, family) => total + family.children.reduce((familyTotal, child) => familyTotal + child.dailyReports.length, 0),
          0,
        ),
        incidents: reviewFamilies.reduce(
          (total, family) => total + family.children.reduce((familyTotal, child) => familyTotal + child.incidents.length, 0),
          0,
        ),
        messages: reviewFamilies.reduce((total, family) => total + family.messages.length, 0),
      },
      targetFingerprint: teacherTargetFingerprint(target),
    }];
  });
}

async function ensureTeacherGrant(
  db: Prisma.TransactionClient,
  input: { userId: string; tenantId: string; organizationId: string; centerId: string; isActive: boolean },
) {
  const existing = await db.userAccessGrant.findMany({
    where: { userId: input.userId, tenantId: input.tenantId, role: UserRole.TEACHER, scopeType: "CENTER", centerId: input.centerId },
    select: { id: true },
    take: 2,
  });
  if (existing.length > 1) {
    throw new Error("Multiple matching Teacher App Review grants exist; resolve the duplicate grants before provisioning.");
  }
  const data = {
    organizationId: input.organizationId,
    centerId: input.centerId,
    role: UserRole.TEACHER,
    scopeType: "CENTER",
    isActive: input.isActive,
    startsAt: null,
    endsAt: null,
    permissions: { appReview: true, seededBy: SCRIPT_SOURCE },
  } satisfies Prisma.UserAccessGrantUncheckedUpdateInput;
  return existing[0]
    ? db.userAccessGrant.update({ where: { id: existing[0].id }, data, select: { id: true } })
    : db.userAccessGrant.create({ data: { userId: input.userId, tenantId: input.tenantId, ...data } as Prisma.UserAccessGrantUncheckedCreateInput, select: { id: true } });
}

async function main() {
  const email = normalizedEmail(process.env.APP_REVIEW_TEACHER_EMAIL || APP_REVIEW_EMAIL);
  if (email !== APP_REVIEW_EMAIL) {
    throw new Error(`APP_REVIEW_TEACHER_EMAIL must remain the dedicated review identity ${APP_REVIEW_EMAIL}.`);
  }
  const password = process.env.APP_REVIEW_TEACHER_PASSWORD?.trim() || "";
  const target = readTargetInput();
  const preflight = process.argv.includes("--preflight");
  const suppliedTargetFieldCount = [target.tenantId, target.centerId, target.classroomId, target.sourceStaffProfileId]
    .filter(Boolean).length;

  if (preflight && suppliedTargetFieldCount === 0) {
    console.log(JSON.stringify({
      ok: true,
      mode: "preflight-list",
      mutatesProduction: false,
      candidates: await listTeacherTargets(email),
    }, null, 2));
    return;
  }

  if (suppliedTargetFieldCount !== TARGET_ENVIRONMENT_VARIABLES.length) {
    throw new Error(
      `Set all exact Teacher target identifiers (${TARGET_ENVIRONMENT_VARIABLES.join(", ")}). Run npm run app-review:teacher:ensure -- --preflight without target variables to list fake-demo candidates.`,
    );
  }

  const sourceProfile = await prisma.staffProfile.findUnique({
    where: { id: target.sourceStaffProfileId },
    include: {
      user: { select: { id: true, name: true, tenantId: true, role: true, isActive: true } },
      center: { select: appReviewCenterScopeSelect },
      classroom: { select: { ...appReviewClassroomRosterSelect, name: true } },
    },
  });
  if (
    !sourceProfile?.classroom ||
    sourceProfile.sourceSystem !== DEMO_SOURCE ||
    !sourceProfile.externalId ||
    asRecord(sourceProfile.customFields).demoWorkspace !== true ||
    !sourceProfile.user.isActive ||
    sourceProfile.user.role !== UserRole.TEACHER ||
    sourceProfile.user.tenantId !== sourceProfile.center.organization.tenantId ||
    sourceProfile.centerId !== target.centerId ||
    sourceProfile.center.sourceSystem !== DEMO_SOURCE ||
    sourceProfile.center.externalId !== SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID ||
    ["closed", "archived", "inactive"].includes(sourceProfile.center.status.toLowerCase()) ||
    sourceProfile.center.organization.tenant.slug !== SYNTHETIC_ROLE_QA_TENANT_SLUG ||
    sourceProfile.classroom.centerId !== sourceProfile.centerId ||
    sourceProfile.classroom.sourceSystem !== DEMO_SOURCE ||
    sourceProfile.classroom.id !== target.classroomId ||
    sourceProfile.center.organization.tenantId !== target.tenantId
    || appReviewCenterScopeViolation({ center: sourceProfile.center, tenantId: target.tenantId })
  ) {
    throw new Error("The exact Teacher App Review source profile is missing or no longer matches the fake-demo tenant, center, classroom, and role.");
  }
  const sourceClassroom = sourceProfile.classroom;
  const sourceClassroomScopeViolation = appReviewClassroomScopeViolation({
    classroom: sourceClassroom,
    centerId: sourceProfile.centerId,
    tenantId: sourceProfile.center.organization.tenantId,
  });
  if (sourceClassroomScopeViolation) {
    throw new Error(`The exact Teacher App Review classroom is not isolated fake data: ${sourceClassroomScopeViolation}.`);
  }
  const expectedScopeDigest = appReviewScopeDigest({ center: sourceProfile.center, classroom: sourceClassroom });

  const expectedFingerprint = teacherTargetFingerprint({
    email,
    tenantId: sourceProfile.center.organization.tenantId,
    organizationId: sourceProfile.center.organizationId,
    centerId: sourceProfile.center.id,
    classroomId: sourceClassroom.id,
    sourceStaffProfileId: sourceProfile.id,
    sourceUserId: sourceProfile.user.id,
    scopeDigest: expectedScopeDigest,
  });

  if (preflight) {
    console.log(JSON.stringify({
      ok: true,
      mode: "preflight-target",
      mutatesProduction: false,
      target: {
        email,
        tenantId: sourceProfile.center.organization.tenantId,
        organizationId: sourceProfile.center.organizationId,
        centerId: sourceProfile.center.id,
        centerName: sourceProfile.center.name,
        classroomId: sourceClassroom.id,
        classroomName: sourceClassroom.name,
        sourceStaffProfileId: sourceProfile.id,
        sourceUserId: sourceProfile.user.id,
        sourceStaffName: sourceProfile.user.name,
        targetFingerprint: expectedFingerprint,
      },
    }, null, 2));
    return;
  }

  assertAppReviewTargetFingerprint({
    expected: expectedFingerprint,
    provided: target.fingerprint,
    environmentVariable: "APP_REVIEW_TEACHER_TARGET_FINGERPRINT",
  });

  if (password.length < 12) {
    throw new Error("Set APP_REVIEW_TEACHER_PASSWORD to a temporary review password with at least 12 characters.");
  }
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(`Provisioning requires ${CONFIRM_FLAG} after exact approval of the preflighted target and mutations.`);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      tenantId: true,
      role: true,
      customFields: true,
      staffProfile: { select: { sourceSystem: true, externalId: true } },
    },
  });
  if (existingUser && existingUser.tenantId !== sourceProfile.center.organization.tenantId) {
    throw new Error("The existing review email belongs to a different tenant.");
  }
  if (existingUser && existingUser.role !== UserRole.TEACHER) {
    throw new Error("The existing review email is not a teacher account.");
  }
  if (existingUser && (
    asRecord(existingUser.customFields).appReview !== true ||
    asRecord(existingUser.customFields).seededBy !== SCRIPT_SOURCE
  )) {
    throw new Error("The dedicated Teacher App Review email is linked to an unmarked application user.");
  }
  if (existingUser?.staffProfile && (
    existingUser.staffProfile.sourceSystem !== APP_REVIEW_SOURCE ||
    existingUser.staffProfile.externalId !== APP_REVIEW_STAFF_EXTERNAL_ID
  )) {
    throw new Error("The existing review email is linked to a non-review Staff profile.");
  }
  if (existingUser) {
    const [activeGrants, matchingGrantCount] = await Promise.all([
      prisma.userAccessGrant.findMany({
        where: { userId: existingUser.id, isActive: true },
        select: { tenantId: true, organizationId: true, centerId: true, role: true, scopeType: true },
      }),
      prisma.userAccessGrant.count({
        where: {
          userId: existingUser.id,
          tenantId: target.tenantId,
          role: UserRole.TEACHER,
          scopeType: "CENTER",
          centerId: target.centerId,
        },
      }),
    ]);
    if (matchingGrantCount > 1) {
      throw new Error("Multiple matching Teacher App Review grants exist; resolve the duplicate grants before provisioning.");
    }
    if (activeGrants.some((grant) =>
      grant.tenantId !== target.tenantId ||
      grant.organizationId !== sourceProfile.center.organizationId ||
      grant.centerId !== target.centerId ||
      grant.role !== UserRole.TEACHER ||
      grant.scopeType !== "CENTER"
    )) {
      throw new Error("The existing Teacher App Review user has an active grant outside the exact authorized target.");
    }
  }
  const existingReviewProfiles = await prisma.staffProfile.findMany({
    where: { sourceSystem: APP_REVIEW_SOURCE, externalId: APP_REVIEW_STAFF_EXTERNAL_ID },
    select: { userId: true },
    take: 2,
  });
  if (existingReviewProfiles.length > 1) {
    throw new Error("Multiple Teacher App Review Staff markers exist; resolve the ambiguity before provisioning.");
  }
  const existingReviewProfile = existingReviewProfiles[0];
  if (existingReviewProfile && existingReviewProfile.userId !== existingUser?.id) {
    throw new Error("The App Review teacher marker is linked to a different user.");
  }

  const existingAuthUser = await getSupabaseAuthUserMetadataByEmail(email);
  if (existingAuthUser && (
    existingAuthUser.email !== email ||
    existingAuthUser.userMetadata.source !== APP_REVIEW_SOURCE ||
    existingAuthUser.appMetadata.bee_suite_role !== UserRole.TEACHER
  )) {
    throw new Error("The dedicated Teacher App Review email is linked to an unmarked or wrong-role Auth identity.");
  }

  const staged = await prisma.$transaction(async (tx) => {
    const currentSourceProfile = await tx.staffProfile.findUnique({
      where: { id: target.sourceStaffProfileId },
      include: {
        user: { select: { id: true, tenantId: true, role: true, isActive: true } },
        center: { select: appReviewCenterScopeSelect },
        classroom: { select: appReviewClassroomRosterSelect },
      },
    });
    const currentClassroomScopeViolation = currentSourceProfile?.classroom
      ? appReviewClassroomScopeViolation({
        classroom: currentSourceProfile.classroom,
        centerId: target.centerId,
        tenantId: target.tenantId,
      })
      : "classroom is missing";
    const currentCenterScopeViolation = currentSourceProfile
      ? appReviewCenterScopeViolation({ center: currentSourceProfile.center, tenantId: target.tenantId })
      : "center is missing";
    const currentScopeDigest = currentSourceProfile?.classroom
      ? appReviewScopeDigest({ center: currentSourceProfile.center, classroom: currentSourceProfile.classroom })
      : null;
    if (
      !currentSourceProfile?.classroom ||
      currentSourceProfile.sourceSystem !== DEMO_SOURCE ||
      !currentSourceProfile.externalId ||
      asRecord(currentSourceProfile.customFields).demoWorkspace !== true ||
      !currentSourceProfile.user.isActive ||
      currentSourceProfile.user.role !== UserRole.TEACHER ||
      currentSourceProfile.user.tenantId !== currentSourceProfile.center.organization.tenantId ||
      currentSourceProfile.user.id !== sourceProfile.user.id ||
      currentSourceProfile.centerId !== target.centerId ||
      currentSourceProfile.center.sourceSystem !== DEMO_SOURCE ||
      currentSourceProfile.center.externalId !== SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID ||
      ["closed", "archived", "inactive"].includes(currentSourceProfile.center.status.toLowerCase()) ||
      currentSourceProfile.center.organization.tenant.slug !== SYNTHETIC_ROLE_QA_TENANT_SLUG ||
      currentSourceProfile.classroom.centerId !== currentSourceProfile.centerId ||
      currentSourceProfile.classroom.sourceSystem !== DEMO_SOURCE ||
      currentSourceProfile.classroom.id !== target.classroomId ||
      currentClassroomScopeViolation ||
      currentCenterScopeViolation ||
      currentScopeDigest !== expectedScopeDigest ||
      currentSourceProfile.center.organization.tenantId !== target.tenantId ||
      currentSourceProfile.center.organizationId !== sourceProfile.center.organizationId
    ) {
      throw new Error("The exact Teacher App Review target changed after preflight; run preflight again before provisioning.");
    }

    const currentUser = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        tenantId: true,
        role: true,
        customFields: true,
        staffProfile: { select: { sourceSystem: true, externalId: true, customFields: true } },
      },
    });
    if (currentUser && currentUser.tenantId !== target.tenantId) {
      throw new Error("The existing review email belongs to a different tenant.");
    }
    if (currentUser && currentUser.role !== UserRole.TEACHER) {
      throw new Error("The existing review email is not a teacher account.");
    }
    if (currentUser && (
      asRecord(currentUser.customFields).appReview !== true ||
      asRecord(currentUser.customFields).seededBy !== SCRIPT_SOURCE
    )) {
      throw new Error("The dedicated Teacher App Review email is linked to an unmarked application user.");
    }
    if (currentUser?.staffProfile && (
      currentUser.staffProfile.sourceSystem !== APP_REVIEW_SOURCE ||
      currentUser.staffProfile.externalId !== APP_REVIEW_STAFF_EXTERNAL_ID
    )) {
      throw new Error("The existing review email is linked to a non-review Staff profile.");
    }
    if (currentUser) {
      const [activeGrants, matchingGrantCount] = await Promise.all([
        tx.userAccessGrant.findMany({
          where: { userId: currentUser.id, isActive: true },
          select: { tenantId: true, organizationId: true, centerId: true, role: true, scopeType: true },
        }),
        tx.userAccessGrant.count({
          where: {
            userId: currentUser.id,
            tenantId: target.tenantId,
            role: UserRole.TEACHER,
            scopeType: "CENTER",
            centerId: target.centerId,
          },
        }),
      ]);
      if (matchingGrantCount > 1) {
        throw new Error("Multiple matching Teacher App Review grants exist; resolve the duplicate grants before provisioning.");
      }
      if (activeGrants.some((grant) =>
        grant.tenantId !== target.tenantId ||
        grant.organizationId !== sourceProfile.center.organizationId ||
        grant.centerId !== target.centerId ||
        grant.role !== UserRole.TEACHER ||
        grant.scopeType !== "CENTER"
      )) {
        throw new Error("The existing Teacher App Review user has an active grant outside the exact authorized target.");
      }
    }

    const currentReviewProfiles = await tx.staffProfile.findMany({
      where: { sourceSystem: APP_REVIEW_SOURCE, externalId: APP_REVIEW_STAFF_EXTERNAL_ID },
      select: { userId: true },
      take: 2,
    });
    if (currentReviewProfiles.length > 1) {
      throw new Error("Multiple Teacher App Review Staff markers exist; resolve the ambiguity before provisioning.");
    }
    if (currentReviewProfiles[0] && currentReviewProfiles[0].userId !== currentUser?.id) {
      throw new Error("The App Review teacher marker is linked to a different user.");
    }

    const user = await tx.user.upsert({
      where: { email },
      update: {
        tenantId: target.tenantId,
        organizationId: sourceProfile.center.organizationId,
        name: "App Review Teacher",
        role: UserRole.TEACHER,
        isActive: false,
        mustResetPassword: false,
        sessionVersion: { increment: 1 },
        customFields: mergeCustomFields(removeProfilePhotoCustomFields(currentUser?.customFields), {
          appReview: true,
          seededBy: SCRIPT_SOURCE,
        }),
      },
      create: {
        tenantId: target.tenantId,
        organizationId: sourceProfile.center.organizationId,
        email,
        name: "App Review Teacher",
        role: UserRole.TEACHER,
        isActive: false,
        mustResetPassword: false,
        customFields: { appReview: true, seededBy: SCRIPT_SOURCE },
      },
      select: { id: true },
    });

    const revokedAt = new Date();
    await tx.webPushSubscription.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false, lastSeenAt: revokedAt },
    });
    await tx.deviceSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt, revokedById: user.id },
    });

    const reviewProfile = await tx.staffProfile.upsert({
      where: { userId: user.id },
      update: {
        centerId: sourceProfile.centerId,
        classroomId: sourceClassroom.id,
        title: "App Review Teacher",
        phone: "(555) 010-0425",
        sourceSystem: APP_REVIEW_SOURCE,
        externalId: APP_REVIEW_STAFF_EXTERNAL_ID,
        customFields: reviewStaffCustomFields(currentUser?.staffProfile?.customFields),
      },
      create: {
        userId: user.id,
        centerId: sourceProfile.centerId,
        classroomId: sourceClassroom.id,
        title: "App Review Teacher",
        phone: "(555) 010-0425",
        backgroundCheckStatus: "review_demo_only",
        sourceSystem: APP_REVIEW_SOURCE,
        externalId: APP_REVIEW_STAFF_EXTERNAL_ID,
        customFields: reviewStaffCustomFields(null),
      },
      select: { id: true },
    });
    const grant = await ensureTeacherGrant(tx, {
      userId: user.id,
      tenantId: target.tenantId,
      organizationId: sourceProfile.center.organizationId,
      centerId: sourceProfile.centerId,
      isActive: false,
    });
    const [stagedClassroom, stagedCenter] = await Promise.all([
      tx.classroom.findUnique({
        where: { id: target.classroomId },
        select: appReviewClassroomRosterSelect,
      }),
      tx.center.findUnique({ where: { id: target.centerId }, select: appReviewCenterScopeSelect }),
    ]);
    const stagedClassroomScopeViolation = stagedClassroom
      ? appReviewClassroomScopeViolation({
        classroom: stagedClassroom,
        centerId: target.centerId,
        tenantId: target.tenantId,
      })
      : "classroom is missing";
    const stagedCenterScopeViolation = stagedCenter
      ? appReviewCenterScopeViolation({ center: stagedCenter, tenantId: target.tenantId })
      : "center is missing";
    if (!stagedClassroom || !stagedCenter || stagedClassroomScopeViolation || stagedCenterScopeViolation) {
      throw new Error("Teacher App Review staging introduced an invalid review classroom scope.");
    }
    return {
      userId: user.id,
      staffProfileId: reviewProfile.id,
      accessGrantId: grant.id,
      scopeDigest: appReviewScopeDigest({ center: stagedCenter, classroom: stagedClassroom }),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const authUserBeforeWrite = await getSupabaseAuthUserMetadataByEmail(email);
  if (authUserBeforeWrite && (
    authUserBeforeWrite.email !== email ||
    authUserBeforeWrite.userMetadata.source !== APP_REVIEW_SOURCE ||
    authUserBeforeWrite.appMetadata.bee_suite_role !== UserRole.TEACHER
  )) {
    throw new Error("The dedicated Teacher App Review Auth identity changed while local access was staged; the account remains inactive.");
  }

  await upsertSupabaseAuthUserWithPassword({
    email,
    name: "App Review Teacher",
    password,
    role: UserRole.TEACHER,
    source: APP_REVIEW_SOURCE,
    updateExistingPassword: true,
  });

  const authUserAfterWrite = await getSupabaseAuthUserMetadataByEmail(email);
  if (
    !authUserAfterWrite ||
    authUserAfterWrite.email !== email ||
    authUserAfterWrite.userMetadata.source !== APP_REVIEW_SOURCE ||
    authUserAfterWrite.appMetadata.bee_suite_role !== UserRole.TEACHER
  ) {
    throw new Error("Teacher App Review Auth verification failed; the staged account remains inactive.");
  }

  await prisma.$transaction(async (tx) => {
    const [
      activationUser,
      activationGrant,
      activationSourceProfile,
      activeOtherGrantCount,
      activePushSubscriptionCount,
      unrevokedDeviceSessionCount,
    ] = await Promise.all([
      tx.user.findUnique({
        where: { id: staged.userId },
        select: {
          email: true,
          tenantId: true,
          organizationId: true,
          role: true,
          isActive: true,
          customFields: true,
          staffProfile: {
            select: {
              id: true,
              centerId: true,
              classroomId: true,
              sourceSystem: true,
              externalId: true,
              customFields: true,
            },
          },
        },
      }),
      tx.userAccessGrant.findUnique({
        where: { id: staged.accessGrantId },
        select: {
          userId: true,
          tenantId: true,
          organizationId: true,
          centerId: true,
          role: true,
          scopeType: true,
          isActive: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      tx.staffProfile.findUnique({
        where: { id: target.sourceStaffProfileId },
        include: {
          user: { select: { id: true, tenantId: true, role: true, isActive: true } },
          center: { select: appReviewCenterScopeSelect },
          classroom: { select: appReviewClassroomRosterSelect },
        },
      }),
      tx.userAccessGrant.count({
        where: { userId: staged.userId, isActive: true, id: { not: staged.accessGrantId } },
      }),
      tx.webPushSubscription.count({ where: { userId: staged.userId, isActive: true } }),
      tx.deviceSession.count({ where: { userId: staged.userId, revokedAt: null } }),
    ]);

    const activationClassroomScopeViolation = activationSourceProfile?.classroom
      ? appReviewClassroomScopeViolation({
        classroom: activationSourceProfile.classroom,
        centerId: target.centerId,
        tenantId: target.tenantId,
      })
      : "classroom is missing";
    const activationCenterScopeViolation = activationSourceProfile
      ? appReviewCenterScopeViolation({ center: activationSourceProfile.center, tenantId: target.tenantId })
      : "center is missing";
    const activationScopeDigest = activationSourceProfile?.classroom
      ? appReviewScopeDigest({ center: activationSourceProfile.center, classroom: activationSourceProfile.classroom })
      : null;
    if (
      !activationUser ||
      activationUser.email !== email ||
      activationUser.tenantId !== target.tenantId ||
      activationUser.organizationId !== sourceProfile.center.organizationId ||
      activationUser.role !== UserRole.TEACHER ||
      activationUser.isActive ||
      asRecord(activationUser.customFields).appReview !== true ||
      asRecord(activationUser.customFields).seededBy !== SCRIPT_SOURCE ||
      !activationUser.staffProfile ||
      activationUser.staffProfile.id !== staged.staffProfileId ||
      activationUser.staffProfile.centerId !== target.centerId ||
      activationUser.staffProfile.classroomId !== target.classroomId ||
      activationUser.staffProfile.sourceSystem !== APP_REVIEW_SOURCE ||
      activationUser.staffProfile.externalId !== APP_REVIEW_STAFF_EXTERNAL_ID ||
      asRecord(activationUser.staffProfile.customFields).appReview !== true ||
      asRecord(activationUser.staffProfile.customFields).seededBy !== SCRIPT_SOURCE ||
      !activationGrant ||
      activationGrant.userId !== staged.userId ||
      activationGrant.tenantId !== target.tenantId ||
      activationGrant.organizationId !== sourceProfile.center.organizationId ||
      activationGrant.centerId !== target.centerId ||
      activationGrant.role !== UserRole.TEACHER ||
      activationGrant.scopeType !== "CENTER" ||
      activationGrant.isActive ||
      activationGrant.startsAt !== null ||
      activationGrant.endsAt !== null ||
      activeOtherGrantCount !== 0 ||
      activePushSubscriptionCount !== 0 ||
      unrevokedDeviceSessionCount !== 0 ||
      !activationSourceProfile?.classroom ||
      activationSourceProfile.sourceSystem !== DEMO_SOURCE ||
      !activationSourceProfile.externalId ||
      asRecord(activationSourceProfile.customFields).demoWorkspace !== true ||
      !activationSourceProfile.user.isActive ||
      activationSourceProfile.user.id !== sourceProfile.user.id ||
      activationSourceProfile.user.tenantId !== target.tenantId ||
      activationSourceProfile.user.role !== UserRole.TEACHER ||
      activationSourceProfile.centerId !== target.centerId ||
      activationSourceProfile.center.sourceSystem !== DEMO_SOURCE ||
      activationSourceProfile.center.externalId !== SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID ||
      ["closed", "archived", "inactive"].includes(activationSourceProfile.center.status.toLowerCase()) ||
      activationSourceProfile.center.organization.tenant.slug !== SYNTHETIC_ROLE_QA_TENANT_SLUG ||
      activationSourceProfile.center.organization.tenantId !== target.tenantId ||
      activationSourceProfile.center.organizationId !== sourceProfile.center.organizationId ||
      activationSourceProfile.classroom.id !== target.classroomId ||
      activationSourceProfile.classroom.centerId !== target.centerId ||
      activationSourceProfile.classroom.sourceSystem !== DEMO_SOURCE ||
      activationClassroomScopeViolation ||
      activationCenterScopeViolation ||
      activationScopeDigest !== staged.scopeDigest
    ) {
      throw new Error("Teacher App Review activation revalidation failed; the staged account remains inactive.");
    }

    await Promise.all([
      tx.user.update({ where: { id: staged.userId }, data: { isActive: true } }),
      tx.userAccessGrant.update({
        where: { id: staged.accessGrantId },
        data: { isActive: true, startsAt: null, endsAt: null },
      }),
    ]);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(JSON.stringify({
    ok: true,
    email,
    loginUrl: "https://thebeesuite.io/teachers",
    center: sourceProfile.center.name,
    classroom: sourceClassroom.name,
    dataScope: "bee_suite_demo",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "App Review teacher preparation failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
