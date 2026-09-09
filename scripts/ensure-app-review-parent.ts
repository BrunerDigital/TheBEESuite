import "./load-env";
import { Prisma, UserRole } from "@prisma/client";
import {
  assertAppReviewTargetFingerprint,
  buildAppReviewTargetFingerprint,
} from "@/lib/app-review-targeting";
import { parentPortalLinkedFields } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import {
  SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID,
  SYNTHETIC_ROLE_QA_TENANT_SLUG,
} from "@/lib/synthetic-role-qa";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";

const DEMO_SOURCE = "bee_suite_demo";
const APP_REVIEW_SOURCE = "bee_suite_app_review";
const APP_REVIEW_GUARDIAN_EXTERNAL_ID = "app-review-parent-primary";
const CONFIRM_FLAG = "--confirm-parent-app-review-account";
const TARGET_ENVIRONMENT_VARIABLES = [
  "APP_REVIEW_PARENT_TENANT_ID",
  "APP_REVIEW_PARENT_CENTER_ID",
  "APP_REVIEW_PARENT_FAMILY_ID",
  "APP_REVIEW_PARENT_FAMILY_EXTERNAL_ID",
] as const;

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

function readTargetInput() {
  return {
    tenantId: process.env.APP_REVIEW_PARENT_TENANT_ID?.trim() || "",
    centerId: process.env.APP_REVIEW_PARENT_CENTER_ID?.trim() || "",
    familyId: process.env.APP_REVIEW_PARENT_FAMILY_ID?.trim() || "",
    familyExternalId: process.env.APP_REVIEW_PARENT_FAMILY_EXTERNAL_ID?.trim() || "",
    fingerprint: process.env.APP_REVIEW_PARENT_TARGET_FINGERPRINT?.trim() || "",
  };
}

function parentTargetFingerprint(input: {
  email: string;
  tenantId: string;
  organizationId: string;
  centerId: string;
  familyId: string;
  familyExternalId: string;
}) {
  return buildAppReviewTargetFingerprint("parent", input);
}

async function listParentTargets(email: string) {
  const families = await prisma.family.findMany({
    where: { sourceSystem: DEMO_SOURCE, centerId: { not: null } },
    orderBy: [{ centerId: "asc" }, { id: "asc" }],
    select: { id: true, name: true, centerId: true, externalId: true },
  });
  const centerIds = [...new Set(families.flatMap((family) => family.centerId ? [family.centerId] : []))];
  const centers = await prisma.center.findMany({
    where: {
      id: { in: centerIds },
      sourceSystem: DEMO_SOURCE,
      externalId: SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID,
      status: { notIn: ["closed", "archived", "inactive"] },
      organization: { tenant: { slug: SYNTHETIC_ROLE_QA_TENANT_SLUG } },
    },
    select: {
      id: true,
      name: true,
      status: true,
      sourceSystem: true,
      externalId: true,
      organizationId: true,
      organization: { select: { tenantId: true, tenant: { select: { slug: true } } } },
    },
  });
  const centersById = new Map(centers.map((center) => [center.id, center] as const));

  return families.flatMap((family) => {
    if (!family.centerId || !family.externalId) return [];
    const center = centersById.get(family.centerId);
    if (!center) return [];
    const target = {
      email,
      tenantId: center.organization.tenantId,
      organizationId: center.organizationId,
      centerId: center.id,
      familyId: family.id,
      familyExternalId: family.externalId,
    };
    return [{
      ...target,
      centerName: center.name,
      familyName: family.name,
      targetFingerprint: parentTargetFingerprint(target),
    }];
  });
}

async function ensureAccessGrant(db: Prisma.TransactionClient, input: {
  userId: string;
  tenantId: string;
  organizationId: string;
  centerId: string;
}) {
  const existing = await db.userAccessGrant.findMany({
    where: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: UserRole.PARENT_GUARDIAN,
      scopeType: "CENTER",
      centerId: input.centerId,
    },
    select: { id: true },
    take: 2,
  });

  if (existing.length > 1) {
    throw new Error("Multiple matching Parent App Review grants exist; resolve the duplicate grants before provisioning.");
  }

  const data = {
    organizationId: input.organizationId,
    centerId: input.centerId,
    role: UserRole.PARENT_GUARDIAN,
    scopeType: "CENTER",
    isActive: true,
    startsAt: null,
    endsAt: null,
    permissions: {
      appReview: true,
      seededBy: "scripts/ensure-app-review-parent.ts",
    },
  } satisfies Prisma.UserAccessGrantUncheckedUpdateInput;

  if (existing[0]) {
    return db.userAccessGrant.update({
      where: { id: existing[0].id },
      data,
      select: { id: true },
    });
  }

  return db.userAccessGrant.create({
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
  const target = readTargetInput();
  const preflight = process.argv.includes("--preflight");
  const suppliedTargetFieldCount = [target.tenantId, target.centerId, target.familyId, target.familyExternalId]
    .filter(Boolean).length;

  if (preflight && suppliedTargetFieldCount === 0) {
    console.log(JSON.stringify({
      ok: true,
      mode: "preflight-list",
      mutatesProduction: false,
      candidates: await listParentTargets(email),
    }, null, 2));
    return;
  }

  if (suppliedTargetFieldCount !== TARGET_ENVIRONMENT_VARIABLES.length) {
    throw new Error(
      `Set all exact Parent target identifiers (${TARGET_ENVIRONMENT_VARIABLES.join(", ")}). Run npm run app-review:parent:ensure -- --preflight without target variables to list fake-demo candidates.`,
    );
  }

  const family = await prisma.family.findUnique({
    where: { id: target.familyId },
    include: {
      children: {
        select: {
          id: true,
          fullName: true,
          enrollmentStatus: true,
          sourceSystem: true,
          classroom: { select: { centerId: true, sourceSystem: true } },
        },
      },
    },
  });

  if (
    !family?.centerId ||
    family.sourceSystem !== DEMO_SOURCE ||
    family.externalId !== target.familyExternalId ||
    family.centerId !== target.centerId
  ) {
    throw new Error("The exact Parent App Review family target is missing or no longer matches the fake-demo source, center, or external ID.");
  }

  const center = await prisma.center.findUnique({
    where: { id: family.centerId },
    select: {
      id: true,
      name: true,
      status: true,
      sourceSystem: true,
      externalId: true,
      organizationId: true,
      organization: { select: { tenantId: true, tenant: { select: { slug: true } } } },
    },
  });

  if (
    !center ||
    center.id !== target.centerId ||
    center.sourceSystem !== DEMO_SOURCE ||
    center.externalId !== SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID ||
    ["closed", "archived", "inactive"].includes(center.status.toLowerCase()) ||
    center.organization.tenant.slug !== SYNTHETIC_ROLE_QA_TENANT_SLUG ||
    center.organization.tenantId !== target.tenantId
  ) {
    throw new Error("The exact Parent App Review center no longer matches the authorized tenant and center identifiers.");
  }
  if (
    family.children.length === 0 ||
    family.children.some((child) =>
      child.sourceSystem !== DEMO_SOURCE ||
      Boolean(child.classroom && (
        child.classroom.centerId !== center.id || child.classroom.sourceSystem !== DEMO_SOURCE
      ))
    )
  ) {
    throw new Error("The exact Parent App Review family is empty or contains a child outside the isolated demo school.");
  }

  const expectedFingerprint = parentTargetFingerprint({
    email,
    tenantId: center.organization.tenantId,
    organizationId: center.organizationId,
    centerId: center.id,
    familyId: family.id,
    familyExternalId: family.externalId,
  });

  if (preflight) {
    console.log(JSON.stringify({
      ok: true,
      mode: "preflight-target",
      mutatesProduction: false,
      target: {
        email,
        tenantId: center.organization.tenantId,
        organizationId: center.organizationId,
        centerId: center.id,
        centerName: center.name,
        familyId: family.id,
        familyExternalId: family.externalId,
        familyName: family.name,
        targetFingerprint: expectedFingerprint,
      },
    }, null, 2));
    return;
  }

  assertAppReviewTargetFingerprint({
    expected: expectedFingerprint,
    provided: target.fingerprint,
    environmentVariable: "APP_REVIEW_PARENT_TARGET_FINGERPRINT",
  });

  if (password.length < 12) {
    throw new Error("Set APP_REVIEW_PARENT_PASSWORD to a temporary review password with at least 12 characters.");
  }
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(`Provisioning requires ${CONFIRM_FLAG} after exact approval of the preflighted target and mutations.`);
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
          role: UserRole.PARENT_GUARDIAN,
          scopeType: "CENTER",
          centerId: target.centerId,
        },
      }),
    ]);
    if (matchingGrantCount > 1) {
      throw new Error("Multiple matching Parent App Review grants exist; resolve the duplicate grants before provisioning.");
    }
    if (activeGrants.some((grant) =>
      grant.tenantId !== target.tenantId ||
      grant.organizationId !== center.organizationId ||
      grant.centerId !== target.centerId ||
      grant.role !== UserRole.PARENT_GUARDIAN ||
      grant.scopeType !== "CENTER"
    )) {
      throw new Error("The existing Parent App Review user has an active grant outside the exact authorized target.");
    }
  }

  const existingGuardians = await prisma.guardian.findMany({
    where: {
      sourceSystem: APP_REVIEW_SOURCE,
      externalId: APP_REVIEW_GUARDIAN_EXTERNAL_ID,
    },
    select: { id: true, userId: true, customFields: true },
    take: 2,
  });

  if (existingGuardians.length > 1) {
    throw new Error("Multiple Parent App Review Guardian markers exist; resolve the ambiguity before provisioning.");
  }
  const existingGuardian = existingGuardians[0];
  if (existingGuardian?.userId && existingGuardian.userId !== existingUser?.id) {
    throw new Error("The Parent App Review Guardian marker is linked to a different application user.");
  }

  await upsertSupabaseAuthUserWithPassword({
    email,
    name: "App Review Parent",
    password,
    role: UserRole.PARENT_GUARDIAN,
    source: APP_REVIEW_SOURCE,
    updateExistingPassword: true,
  });

  const provisioned = await prisma.$transaction(async (tx) => {
    const currentFamily = await tx.family.findUnique({
      where: { id: target.familyId },
      select: {
        sourceSystem: true,
        externalId: true,
        centerId: true,
        children: {
          select: {
            sourceSystem: true,
            classroom: { select: { centerId: true, sourceSystem: true } },
          },
        },
      },
    });
    const currentCenter = await tx.center.findUnique({
      where: { id: target.centerId },
      select: {
        status: true,
        sourceSystem: true,
        externalId: true,
        organizationId: true,
        organization: { select: { tenantId: true, tenant: { select: { slug: true } } } },
      },
    });
    if (
      !currentFamily?.centerId ||
      currentFamily.sourceSystem !== DEMO_SOURCE ||
      currentFamily.externalId !== target.familyExternalId ||
      currentFamily.centerId !== target.centerId ||
      currentFamily.children.length === 0 ||
      currentFamily.children.some((child) =>
        child.sourceSystem !== DEMO_SOURCE ||
        Boolean(child.classroom && (
          child.classroom.centerId !== target.centerId || child.classroom.sourceSystem !== DEMO_SOURCE
        ))
      ) ||
      !currentCenter ||
      currentCenter.sourceSystem !== DEMO_SOURCE ||
      currentCenter.externalId !== SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID ||
      ["closed", "archived", "inactive"].includes(currentCenter.status.toLowerCase()) ||
      currentCenter.organization.tenant.slug !== SYNTHETIC_ROLE_QA_TENANT_SLUG ||
      currentCenter.organization.tenantId !== target.tenantId ||
      currentCenter.organizationId !== center.organizationId
    ) {
      throw new Error("The exact Parent App Review target changed after preflight; run preflight again before provisioning.");
    }

    const currentUser = await tx.user.findUnique({
      where: { email },
      select: { id: true, tenantId: true, role: true, customFields: true },
    });
    if (currentUser && currentUser.tenantId !== target.tenantId) {
      throw new Error(`Existing user ${email} belongs to a different tenant.`);
    }
    if (currentUser && currentUser.role !== UserRole.PARENT_GUARDIAN) {
      throw new Error(`Existing user ${email} is ${currentUser.role}, not PARENT_GUARDIAN.`);
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
            role: UserRole.PARENT_GUARDIAN,
            scopeType: "CENTER",
            centerId: target.centerId,
          },
        }),
      ]);
      if (matchingGrantCount > 1) {
        throw new Error("Multiple matching Parent App Review grants exist; resolve the duplicate grants before provisioning.");
      }
      if (activeGrants.some((grant) =>
        grant.tenantId !== target.tenantId ||
        grant.organizationId !== center.organizationId ||
        grant.centerId !== target.centerId ||
        grant.role !== UserRole.PARENT_GUARDIAN ||
        grant.scopeType !== "CENTER"
      )) {
        throw new Error("The existing Parent App Review user has an active grant outside the exact authorized target.");
      }
    }

    const currentGuardians = await tx.guardian.findMany({
      where: { sourceSystem: APP_REVIEW_SOURCE, externalId: APP_REVIEW_GUARDIAN_EXTERNAL_ID },
      select: { id: true, userId: true, customFields: true },
      take: 2,
    });
    if (currentGuardians.length > 1) {
      throw new Error("Multiple Parent App Review Guardian markers exist; resolve the ambiguity before provisioning.");
    }
    const currentGuardian = currentGuardians[0];
    if (currentGuardian?.userId && currentGuardian.userId !== currentUser?.id) {
      throw new Error("The Parent App Review Guardian marker is linked to a different application user.");
    }

    const userFields = mergeCustomFields(currentUser?.customFields, {
      appReview: true,
      seededBy: "scripts/ensure-app-review-parent.ts",
    });
    const user = await tx.user.upsert({
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
        tenantId: target.tenantId,
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

    const guardianFields = mergeCustomFields(currentGuardian?.customFields, {
      appReview: true,
      seededBy: "scripts/ensure-app-review-parent.ts",
    });
    const guardian = currentGuardian
      ? await tx.guardian.update({
          where: { id: currentGuardian.id },
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
      : await tx.guardian.create({
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

    await tx.guardian.update({
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
    const grant = await ensureAccessGrant(tx, {
      userId: user.id,
      tenantId: target.tenantId,
      organizationId: center.organizationId,
      centerId: center.id,
    });
    return { userId: user.id, guardianId: guardian.id, accessGrantId: grant.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(JSON.stringify({
    ok: true,
    email,
    loginUrl: "https://thebeesuite.io/parents",
    center: center.name,
    family: family.name,
    children: family.children.map((child) => child.fullName),
    userId: provisioned.userId,
    guardianId: provisioned.guardianId,
    accessGrantId: provisioned.accessGrantId,
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
