import "./load-env";
import { Prisma, UserRole } from "@prisma/client";
import {
  assertAppReviewTargetFingerprint,
  buildAppReviewTargetFingerprint,
} from "@/lib/app-review-targeting";
import { prisma } from "@/lib/prisma";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";

const DEMO_SOURCE = "bee_suite_demo";
const APP_REVIEW_SOURCE = "bee_suite_app_review";
const APP_REVIEW_STAFF_EXTERNAL_ID = "app-review-teacher-primary";
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
}) {
  return buildAppReviewTargetFingerprint("teacher", input);
}

async function listTeacherTargets(email: string) {
  const profiles = await prisma.staffProfile.findMany({
    where: { sourceSystem: DEMO_SOURCE, classroomId: { not: null }, user: { role: UserRole.TEACHER } },
    orderBy: [{ centerId: "asc" }, { classroomId: "asc" }, { id: "asc" }],
    include: {
      user: { select: { id: true } },
      center: { select: { id: true, name: true, organizationId: true, organization: { select: { tenantId: true } } } },
      classroom: { select: { id: true, name: true } },
    },
  });

  return profiles.flatMap((profile) => {
    if (!profile.classroom) return [];
    const target = {
      email,
      tenantId: profile.center.organization.tenantId,
      organizationId: profile.center.organizationId,
      centerId: profile.center.id,
      classroomId: profile.classroom.id,
      sourceStaffProfileId: profile.id,
      sourceUserId: profile.user.id,
    };
    return [{
      ...target,
      centerName: profile.center.name,
      classroomName: profile.classroom.name,
      targetFingerprint: teacherTargetFingerprint(target),
    }];
  });
}

async function ensureTeacherGrant(
  db: Prisma.TransactionClient,
  input: { userId: string; tenantId: string; organizationId: string; centerId: string },
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
    isActive: true,
    startsAt: null,
    endsAt: null,
    permissions: { appReview: true, seededBy: "scripts/ensure-app-review-teacher.ts" },
  } satisfies Prisma.UserAccessGrantUncheckedUpdateInput;
  return existing[0]
    ? db.userAccessGrant.update({ where: { id: existing[0].id }, data, select: { id: true } })
    : db.userAccessGrant.create({ data: { userId: input.userId, tenantId: input.tenantId, ...data } as Prisma.UserAccessGrantUncheckedCreateInput, select: { id: true } });
}

async function main() {
  const email = normalizedEmail(process.env.APP_REVIEW_TEACHER_EMAIL || "app-review-teacher@thebeesuite.io");
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
      user: { select: { id: true, role: true } },
      center: { select: { id: true, name: true, organizationId: true, organization: { select: { tenantId: true } } } },
      classroom: { select: { id: true, name: true } },
    },
  });
  if (
    !sourceProfile?.classroom ||
    sourceProfile.sourceSystem !== DEMO_SOURCE ||
    sourceProfile.user.role !== UserRole.TEACHER ||
    sourceProfile.centerId !== target.centerId ||
    sourceProfile.classroom.id !== target.classroomId ||
    sourceProfile.center.organization.tenantId !== target.tenantId
  ) {
    throw new Error("The exact Teacher App Review source profile is missing or no longer matches the fake-demo tenant, center, classroom, and role.");
  }
  const sourceClassroom = sourceProfile.classroom;

  const expectedFingerprint = teacherTargetFingerprint({
    email,
    tenantId: sourceProfile.center.organization.tenantId,
    organizationId: sourceProfile.center.organizationId,
    centerId: sourceProfile.center.id,
    classroomId: sourceClassroom.id,
    sourceStaffProfileId: sourceProfile.id,
    sourceUserId: sourceProfile.user.id,
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
      staffProfile: { select: { sourceSystem: true, externalId: true } },
    },
  });
  if (existingUser && existingUser.tenantId !== sourceProfile.center.organization.tenantId) {
    throw new Error("The existing review email belongs to a different tenant.");
  }
  if (existingUser && existingUser.role !== UserRole.TEACHER) {
    throw new Error("The existing review email is not a teacher account.");
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

  await upsertSupabaseAuthUserWithPassword({
    email,
    name: "App Review Teacher",
    password,
    role: UserRole.TEACHER,
    source: APP_REVIEW_SOURCE,
    updateExistingPassword: true,
  });

  await prisma.$transaction(async (tx) => {
    const currentSourceProfile = await tx.staffProfile.findUnique({
      where: { id: target.sourceStaffProfileId },
      include: {
        user: { select: { id: true, role: true } },
        center: { select: { id: true, organizationId: true, organization: { select: { tenantId: true } } } },
        classroom: { select: { id: true } },
      },
    });
    if (
      !currentSourceProfile?.classroom ||
      currentSourceProfile.sourceSystem !== DEMO_SOURCE ||
      currentSourceProfile.user.role !== UserRole.TEACHER ||
      currentSourceProfile.user.id !== sourceProfile.user.id ||
      currentSourceProfile.centerId !== target.centerId ||
      currentSourceProfile.classroom.id !== target.classroomId ||
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
        isActive: true,
        mustResetPassword: false,
        sessionVersion: { increment: 1 },
        customFields: mergeCustomFields(currentUser?.customFields, {
          appReview: true,
          seededBy: "scripts/ensure-app-review-teacher.ts",
        }),
      },
      create: {
        tenantId: target.tenantId,
        organizationId: sourceProfile.center.organizationId,
        email,
        name: "App Review Teacher",
        role: UserRole.TEACHER,
        isActive: true,
        mustResetPassword: false,
        customFields: { appReview: true, seededBy: "scripts/ensure-app-review-teacher.ts" },
      },
      select: { id: true },
    });

    await tx.staffProfile.upsert({
      where: { userId: user.id },
      update: {
        centerId: sourceProfile.centerId,
        classroomId: sourceClassroom.id,
        title: "App Review Teacher",
        phone: "(555) 010-0425",
        sourceSystem: APP_REVIEW_SOURCE,
        externalId: APP_REVIEW_STAFF_EXTERNAL_ID,
        customFields: mergeCustomFields(currentUser?.staffProfile?.customFields, {
          appReview: true,
          seededBy: "scripts/ensure-app-review-teacher.ts",
        }),
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
        customFields: { appReview: true, seededBy: "scripts/ensure-app-review-teacher.ts" },
      },
    });
    await ensureTeacherGrant(tx, {
      userId: user.id,
      tenantId: target.tenantId,
      organizationId: sourceProfile.center.organizationId,
      centerId: sourceProfile.centerId,
    });
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
