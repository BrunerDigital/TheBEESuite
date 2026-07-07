import "./load-env";
import { UserRole, type Prisma } from "@prisma/client";
import { parentPortalLinkedFields } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";

const DEMO_SOURCE = "bee_suite_demo";
const APP_REVIEW_SOURCE = "bee_suite_app_review";
const APP_REVIEW_GUARDIAN_EXTERNAL_ID = "app-review-parent-primary";

function normalizeEmail(value: string) {
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

async function ensureAccessGrant(input: {
  userId: string;
  tenantId: string;
  organizationId: string;
  centerId: string;
}) {
  const existing = await prisma.userAccessGrant.findFirst({
    where: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: UserRole.PARENT_GUARDIAN,
      scopeType: "CENTER",
      centerId: input.centerId,
    },
    select: { id: true },
  });

  const data = {
    organizationId: input.organizationId,
    centerId: input.centerId,
    role: UserRole.PARENT_GUARDIAN,
    scopeType: "CENTER",
    isActive: true,
    permissions: {
      appReview: true,
      seededBy: "scripts/ensure-app-review-parent.ts",
    },
  } satisfies Prisma.UserAccessGrantUncheckedUpdateInput;

  if (existing) {
    return prisma.userAccessGrant.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
  }

  return prisma.userAccessGrant.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      ...data,
    } satisfies Prisma.UserAccessGrantUncheckedCreateInput,
    select: { id: true },
  });
}

async function main() {
  const email = normalizeEmail(process.env.APP_REVIEW_PARENT_EMAIL || "app-review-parent@thebeesuite.io");
  const password = process.env.APP_REVIEW_PARENT_PASSWORD?.trim() || "";
  const familyExternalId = process.env.APP_REVIEW_PARENT_FAMILY_EXTERNAL_ID?.trim() || "";

  if (password.length < 12) {
    throw new Error("Set APP_REVIEW_PARENT_PASSWORD to a temporary review password with at least 12 characters.");
  }

  const family = await prisma.family.findFirst({
    where: familyExternalId
      ? { sourceSystem: DEMO_SOURCE, externalId: familyExternalId }
      : { sourceSystem: DEMO_SOURCE, centerId: { not: null } },
    orderBy: { createdAt: "asc" },
    include: {
      children: {
        select: { id: true, fullName: true, enrollmentStatus: true },
        take: 3,
      },
    },
  });

  if (!family?.centerId) {
    throw new Error("No seeded demo family with a center was found. Run DEMO_PASSWORD='<password>' npm run demo:seed first.");
  }

  const center = await prisma.center.findUnique({
    where: { id: family.centerId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
    },
  });

  if (!center) {
    throw new Error(`Demo center ${family.centerId} was not found.`);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true, role: true },
  });

  if (existingUser && existingUser.tenantId !== center.organization.tenantId) {
    throw new Error(`Existing user ${email} belongs to a different tenant.`);
  }
  if (existingUser && existingUser.role !== UserRole.PARENT_GUARDIAN) {
    throw new Error(`Existing user ${email} is ${existingUser.role}, not PARENT_GUARDIAN.`);
  }

  const existingGuardian = await prisma.guardian.findFirst({
    where: {
      sourceSystem: APP_REVIEW_SOURCE,
      externalId: APP_REVIEW_GUARDIAN_EXTERNAL_ID,
    },
    select: { id: true, customFields: true },
  });

  const guardianFields = mergeCustomFields(existingGuardian?.customFields, {
    appReview: true,
    seededBy: "scripts/ensure-app-review-parent.ts",
  });

  const guardian = existingGuardian
    ? await prisma.guardian.update({
        where: { id: existingGuardian.id },
        data: {
          familyId: family.id,
          fullName: "App Review Parent",
          email,
          phone: "(555) 010-0424",
          employer: "App Review",
          relation: "Parent / Guardian",
          preferredCommunication: "Email + portal notification",
          isBillingContact: true,
          customFields: guardianFields,
        },
        select: { id: true, customFields: true },
      })
    : await prisma.guardian.create({
        data: {
          familyId: family.id,
          fullName: "App Review Parent",
          email,
          phone: "(555) 010-0424",
          employer: "App Review",
          relation: "Parent / Guardian",
          preferredCommunication: "Email + portal notification",
          isBillingContact: true,
          sourceSystem: APP_REVIEW_SOURCE,
          externalId: APP_REVIEW_GUARDIAN_EXTERNAL_ID,
          customFields: guardianFields,
        },
        select: { id: true, customFields: true },
      });

  await upsertSupabaseAuthUserWithPassword({
    email,
    name: "App Review Parent",
    password,
    role: UserRole.PARENT_GUARDIAN,
    source: APP_REVIEW_SOURCE,
    updateExistingPassword: true,
  });

  const userFields = mergeCustomFields(undefined, {
    appReview: true,
    seededBy: "scripts/ensure-app-review-parent.ts",
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      organizationId: center.organizationId,
      name: "App Review Parent",
      role: UserRole.PARENT_GUARDIAN,
      isActive: true,
      mustResetPassword: false,
      sessionVersion: { increment: 1 },
      customFields: userFields,
    },
    create: {
      tenantId: center.organization.tenantId,
      organizationId: center.organizationId,
      email,
      name: "App Review Parent",
      role: UserRole.PARENT_GUARDIAN,
      isActive: true,
      mustResetPassword: false,
      customFields: userFields,
    },
    select: { id: true },
  });

  await prisma.guardian.update({
    where: { id: guardian.id },
    data: {
      userId: user.id,
      customFields: parentPortalLinkedFields({
        customFields: guardian.customFields,
        loginEmail: email,
        linkedBy: APP_REVIEW_SOURCE,
        linkedReason: APP_REVIEW_SOURCE,
      }),
    },
  });

  const grant = await ensureAccessGrant({
    userId: user.id,
    tenantId: center.organization.tenantId,
    organizationId: center.organizationId,
    centerId: center.id,
  });

  console.log(JSON.stringify({
    ok: true,
    email,
    loginUrl: "https://thebeesuite.io/parents",
    center: center.name,
    family: family.name,
    children: family.children.map((child) => child.fullName),
    userId: user.id,
    guardianId: guardian.id,
    accessGrantId: grant.id,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
