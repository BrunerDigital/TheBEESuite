import "./load-env";
import { UserRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";

const DEMO_SOURCE = "bee_suite_demo";
const APP_REVIEW_SOURCE = "bee_suite_app_review";
const APP_REVIEW_STAFF_EXTERNAL_ID = "app-review-teacher-primary";

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

async function ensureTeacherGrant(input: { userId: string; tenantId: string; organizationId: string; centerId: string }) {
  const existing = await prisma.userAccessGrant.findFirst({
    where: { userId: input.userId, tenantId: input.tenantId, role: UserRole.TEACHER, scopeType: "CENTER", centerId: input.centerId },
    select: { id: true },
  });
  const data = {
    organizationId: input.organizationId,
    centerId: input.centerId,
    role: UserRole.TEACHER,
    scopeType: "CENTER",
    isActive: true,
    permissions: { appReview: true, seededBy: "scripts/ensure-app-review-teacher.ts" },
  } satisfies Prisma.UserAccessGrantUncheckedUpdateInput;
  return existing
    ? prisma.userAccessGrant.update({ where: { id: existing.id }, data, select: { id: true } })
    : prisma.userAccessGrant.create({ data: { userId: input.userId, tenantId: input.tenantId, ...data } as Prisma.UserAccessGrantUncheckedCreateInput, select: { id: true } });
}

async function main() {
  const email = normalizedEmail(process.env.APP_REVIEW_TEACHER_EMAIL || "app-review-teacher@thebeesuite.io");
  const password = process.env.APP_REVIEW_TEACHER_PASSWORD?.trim() || "";
  if (password.length < 12) {
    throw new Error("Set APP_REVIEW_TEACHER_PASSWORD to a temporary review password with at least 12 characters.");
  }

  const sourceProfile = await prisma.staffProfile.findFirst({
    where: { sourceSystem: DEMO_SOURCE, classroomId: { not: null }, user: { role: UserRole.TEACHER } },
    orderBy: { id: "asc" },
    include: {
      center: { select: { id: true, name: true, organizationId: true, organization: { select: { tenantId: true } } } },
      classroom: { select: { id: true, name: true } },
    },
  });
  if (!sourceProfile?.classroom) {
    throw new Error("No classroom-assigned demo teacher was found. Seed the safe demo workspace first.");
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true, tenantId: true, role: true } });
  if (existingUser && existingUser.tenantId !== sourceProfile.center.organization.tenantId) {
    throw new Error("The existing review email belongs to a different tenant.");
  }
  if (existingUser && existingUser.role !== UserRole.TEACHER) {
    throw new Error("The existing review email is not a teacher account.");
  }
  const existingReviewProfile = await prisma.staffProfile.findFirst({
    where: { sourceSystem: APP_REVIEW_SOURCE, externalId: APP_REVIEW_STAFF_EXTERNAL_ID },
    select: { userId: true },
  });
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

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      tenantId: sourceProfile.center.organization.tenantId,
      organizationId: sourceProfile.center.organizationId,
      name: "App Review Teacher",
      role: UserRole.TEACHER,
      isActive: true,
      mustResetPassword: false,
      sessionVersion: { increment: 1 },
      customFields: { appReview: true, seededBy: "scripts/ensure-app-review-teacher.ts" },
    },
    create: {
      tenantId: sourceProfile.center.organization.tenantId,
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

  await prisma.staffProfile.upsert({
    where: { userId: user.id },
    update: {
      centerId: sourceProfile.centerId,
      classroomId: sourceProfile.classroom.id,
      title: "App Review Teacher",
      phone: "(555) 010-0425",
      sourceSystem: APP_REVIEW_SOURCE,
      externalId: APP_REVIEW_STAFF_EXTERNAL_ID,
      customFields: { appReview: true, seededBy: "scripts/ensure-app-review-teacher.ts" },
    },
    create: {
      userId: user.id,
      centerId: sourceProfile.centerId,
      classroomId: sourceProfile.classroom.id,
      title: "App Review Teacher",
      phone: "(555) 010-0425",
      backgroundCheckStatus: "review_demo_only",
      sourceSystem: APP_REVIEW_SOURCE,
      externalId: APP_REVIEW_STAFF_EXTERNAL_ID,
      customFields: { appReview: true, seededBy: "scripts/ensure-app-review-teacher.ts" },
    },
  });
  await ensureTeacherGrant({
    userId: user.id,
    tenantId: sourceProfile.center.organization.tenantId,
    organizationId: sourceProfile.center.organizationId,
    centerId: sourceProfile.centerId,
  });

  console.log(JSON.stringify({
    ok: true,
    email,
    loginUrl: "https://thebeesuite.io/teachers",
    center: sourceProfile.center.name,
    classroom: sourceProfile.classroom.name,
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
