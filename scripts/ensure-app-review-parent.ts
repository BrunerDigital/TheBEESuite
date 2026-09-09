import "./load-env";
import { Prisma, UserRole } from "@prisma/client";
import {
  appReviewCenterScopeSelect,
  appReviewCenterScopeViolation,
  appReviewFamilyScopeSelect,
  appReviewFamilyScopeViolation,
  appReviewScopeDigest,
  assertAppReviewTargetFingerprint,
  buildAppReviewTargetFingerprint,
} from "@/lib/app-review-targeting";
import { parentPortalLinkedFields } from "@/lib/parent-portal-logins";
import { removeProfilePhotoCustomFields } from "@/lib/profile-photo";
import { prisma } from "@/lib/prisma";
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
const APP_REVIEW_GUARDIAN_EXTERNAL_ID = "app-review-parent-primary";
const APP_REVIEW_EMAIL = "app-review-parent@thebeesuite.io";
const SCRIPT_SOURCE = "scripts/ensure-app-review-parent.ts";
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

const reviewGuardianLinkSelect = {
  id: true,
  familyId: true,
  userId: true,
  sourceSystem: true,
  externalId: true,
  checkInPinHash: true,
  checkInPinSetAt: true,
  checkInPinSetById: true,
  customFields: true,
  family: {
    select: {
      id: true,
      centerId: true,
      sourceSystem: true,
      externalId: true,
      customFields: true,
    },
  },
} as const satisfies Prisma.GuardianSelect;

type ReviewGuardianLink = Prisma.GuardianGetPayload<{ select: typeof reviewGuardianLinkSelect }>;

function reviewGuardianLinkViolation(input: {
  links: ReviewGuardianLink[];
  familyId: string;
  centerId?: string;
  expectedGuardianId?: string;
  requireOne: boolean;
  allowVerifiedDemoFamilyReassignment?: boolean;
}) {
  if (!input.requireOne && input.links.length === 0) return null;
  if (input.links.length !== 1) return "the review user must have exactly one Guardian relationship";
  const link = input.links[0];
  const fields = asRecord(link.customFields);
  const familyMatchesTarget = link.familyId === input.familyId;
  const reassignmentIsSafe = input.allowVerifiedDemoFamilyReassignment === true
    && Boolean(input.centerId)
    && link.familyId === link.family.id
    && link.family.centerId === input.centerId
    && link.family.sourceSystem === DEMO_SOURCE
    && Boolean(link.family.externalId)
    && asRecord(link.family.customFields).demoWorkspace === true;
  if (
    (input.expectedGuardianId && link.id !== input.expectedGuardianId)
    || (!familyMatchesTarget && !reassignmentIsSafe)
    || link.sourceSystem !== APP_REVIEW_SOURCE
    || link.externalId !== APP_REVIEW_GUARDIAN_EXTERNAL_ID
    || fields.appReview !== true
    || fields.seededBy !== SCRIPT_SOURCE
    || link.checkInPinHash !== null
    || link.checkInPinSetAt !== null
    || link.checkInPinSetById !== null
  ) {
    return "the review user is linked to a non-review family, Guardian, or kiosk PIN";
  }
  return null;
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
  scopeDigest: string;
}) {
  return buildAppReviewTargetFingerprint("parent", input);
}

async function listParentTargets(email: string) {
  const families = await prisma.family.findMany({
    where: { sourceSystem: DEMO_SOURCE, centerId: { not: null } },
    orderBy: [{ centerId: "asc" }, { id: "asc" }],
    select: {
      ...appReviewFamilyScopeSelect,
      name: true,
    },
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
    select: appReviewCenterScopeSelect,
  });
  const centersById = new Map(centers.map((center) => [center.id, center] as const));

  return families.flatMap((family) => {
    if (!family.centerId || !family.externalId) return [];
    const center = centersById.get(family.centerId);
    if (!center || appReviewCenterScopeViolation({
      center,
      tenantId: center.organization.tenantId,
    }) || appReviewFamilyScopeViolation({
      family,
      centerId: center.id,
      tenantId: center.organization.tenantId,
    })) return [];
    const target = {
      email,
      tenantId: center.organization.tenantId,
      organizationId: center.organizationId,
      centerId: center.id,
      familyId: family.id,
      familyExternalId: family.externalId,
      scopeDigest: appReviewScopeDigest({ center, family }),
    };
    return [{
      ...target,
      centerName: center.name,
      familyName: family.name,
      reviewDataSummary: {
        children: family.children.length,
        dailyReports: family.children.reduce((total, child) => total + child.dailyReports.length, 0),
        incidents: family.children.reduce((total, child) => total + child.incidents.length, 0),
        media: family.children.reduce((total, child) => total + child.media.length, 0),
        documents: family.documents.length + family.children.reduce((total, child) => total + child.documents.length, 0),
        messages: family.messages.length,
        invoices: family.billingAccount?.invoices.length ?? 0,
        payments: family.billingAccount?.payments.length ?? 0,
      },
      targetFingerprint: parentTargetFingerprint(target),
    }];
  });
}

async function ensureAccessGrant(db: Prisma.TransactionClient, input: {
  userId: string;
  tenantId: string;
  organizationId: string;
  centerId: string;
  isActive: boolean;
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
    isActive: input.isActive,
    startsAt: null,
    endsAt: null,
    permissions: {
      appReview: true,
      seededBy: SCRIPT_SOURCE,
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
  const email = normalizeEmail(process.env.APP_REVIEW_PARENT_EMAIL || APP_REVIEW_EMAIL);
  if (email !== APP_REVIEW_EMAIL) {
    throw new Error(`APP_REVIEW_PARENT_EMAIL must remain the dedicated review identity ${APP_REVIEW_EMAIL}.`);
  }
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
    select: {
      ...appReviewFamilyScopeSelect,
      name: true,
      children: {
        select: {
          ...appReviewFamilyScopeSelect.children.select,
          fullName: true,
          enrollmentStatus: true,
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
    select: appReviewCenterScopeSelect,
  });

  if (
    !center ||
    center.id !== target.centerId ||
    center.sourceSystem !== DEMO_SOURCE ||
    center.externalId !== SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID ||
    ["closed", "archived", "inactive"].includes(center.status.toLowerCase()) ||
    center.organization.tenant.slug !== SYNTHETIC_ROLE_QA_TENANT_SLUG ||
    center.organization.tenantId !== target.tenantId ||
    appReviewCenterScopeViolation({ center, tenantId: target.tenantId })
  ) {
    throw new Error("The exact Parent App Review center no longer matches the authorized tenant and center identifiers.");
  }
  const familyScopeViolation = appReviewFamilyScopeViolation({
    family,
    centerId: center.id,
    tenantId: center.organization.tenantId,
  });
  if (familyScopeViolation) {
    throw new Error(`The exact Parent App Review family is not isolated fake data: ${familyScopeViolation}.`);
  }

  const expectedFingerprint = parentTargetFingerprint({
    email,
    tenantId: center.organization.tenantId,
    organizationId: center.organizationId,
    centerId: center.id,
    familyId: family.id,
    familyExternalId: family.externalId,
    scopeDigest: appReviewScopeDigest({ center, family }),
  });
  const expectedScopeDigest = appReviewScopeDigest({ center, family });

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
    select: { id: true, tenantId: true, role: true, customFields: true },
  });

  if (existingUser && existingUser.tenantId !== center.organization.tenantId) {
    throw new Error(`Existing user ${email} belongs to a different tenant.`);
  }
  if (existingUser && existingUser.role !== UserRole.PARENT_GUARDIAN) {
    throw new Error(`Existing user ${email} is ${existingUser.role}, not PARENT_GUARDIAN.`);
  }
  if (existingUser && (
    asRecord(existingUser.customFields).appReview !== true ||
    asRecord(existingUser.customFields).seededBy !== SCRIPT_SOURCE
  )) {
    throw new Error("The dedicated Parent App Review email is linked to an unmarked application user.");
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
  if (existingUser) {
    const links = await prisma.guardian.findMany({
      where: { userId: existingUser.id },
      select: reviewGuardianLinkSelect,
      take: 2,
    });
    const violation = reviewGuardianLinkViolation({
      links,
      familyId: target.familyId,
      centerId: target.centerId,
      expectedGuardianId: existingGuardian?.id,
      requireOne: false,
      allowVerifiedDemoFamilyReassignment: true,
    });
    if (violation) throw new Error(`The existing Parent App Review identity is unsafe: ${violation}.`);
  }

  const existingAuthUser = await getSupabaseAuthUserMetadataByEmail(email);
  if (existingAuthUser && (
    existingAuthUser.email !== email ||
    existingAuthUser.userMetadata.source !== APP_REVIEW_SOURCE ||
    existingAuthUser.appMetadata.bee_suite_role !== UserRole.PARENT_GUARDIAN
  )) {
    throw new Error("The dedicated Parent App Review email is linked to an unmarked or wrong-role Auth identity.");
  }

  const staged = await prisma.$transaction(async (tx) => {
    const currentFamily = await tx.family.findUnique({
      where: { id: target.familyId },
      select: appReviewFamilyScopeSelect,
    });
    const currentCenter = await tx.center.findUnique({
      where: { id: target.centerId },
      select: appReviewCenterScopeSelect,
    });
    const currentFamilyScopeViolation = currentFamily
      ? appReviewFamilyScopeViolation({ family: currentFamily, centerId: target.centerId, tenantId: target.tenantId })
      : "family is missing";
    const currentCenterScopeViolation = currentCenter
      ? appReviewCenterScopeViolation({ center: currentCenter, tenantId: target.tenantId })
      : "center is missing";
    const currentScopeDigest = currentFamily && currentCenter
      ? appReviewScopeDigest({ center: currentCenter, family: currentFamily })
      : null;
    if (
      !currentFamily?.centerId ||
      currentFamily.sourceSystem !== DEMO_SOURCE ||
      currentFamily.externalId !== target.familyExternalId ||
      currentFamily.centerId !== target.centerId ||
      currentFamilyScopeViolation ||
      currentCenterScopeViolation ||
      currentScopeDigest !== expectedScopeDigest ||
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
    if (currentUser && (
      asRecord(currentUser.customFields).appReview !== true ||
      asRecord(currentUser.customFields).seededBy !== SCRIPT_SOURCE
    )) {
      throw new Error("The dedicated Parent App Review email is linked to an unmarked application user.");
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
    if (currentUser) {
      const currentLinks = await tx.guardian.findMany({
        where: { userId: currentUser.id },
        select: reviewGuardianLinkSelect,
        take: 2,
      });
      const violation = reviewGuardianLinkViolation({
        links: currentLinks,
        familyId: target.familyId,
        centerId: target.centerId,
        expectedGuardianId: currentGuardian?.id,
        requireOne: false,
        allowVerifiedDemoFamilyReassignment: true,
      });
      if (violation) throw new Error(`The existing Parent App Review identity is unsafe: ${violation}.`);
    }

    const userFields = mergeCustomFields(removeProfilePhotoCustomFields(currentUser?.customFields), {
      appReview: true,
      seededBy: SCRIPT_SOURCE,
    });
    const user = await tx.user.upsert({
      where: { email },
      update: {
        organizationId: center.organizationId,
        name: "App Review Parent",
        role: UserRole.PARENT_GUARDIAN,
        isActive: false,
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
        isActive: false,
        mustResetPassword: false,
        customFields: userFields,
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

    const guardianFields = mergeCustomFields(currentGuardian?.customFields, {
      appReview: true,
      seededBy: SCRIPT_SOURCE,
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
            checkInPinHash: null,
            checkInPinSetAt: null,
            checkInPinSetById: null,
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
            checkInPinHash: null,
            checkInPinSetAt: null,
            checkInPinSetById: null,
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
        checkInPinHash: null,
        checkInPinSetAt: null,
        checkInPinSetById: null,
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
      isActive: false,
    });
    const [stagedGuardianLinks, stagedFamily, stagedCenter] = await Promise.all([
      tx.guardian.findMany({ where: { userId: user.id }, select: reviewGuardianLinkSelect, take: 2 }),
      tx.family.findUnique({ where: { id: target.familyId }, select: appReviewFamilyScopeSelect }),
      tx.center.findUnique({ where: { id: target.centerId }, select: appReviewCenterScopeSelect }),
    ]);
    const stagedLinkViolation = reviewGuardianLinkViolation({
      links: stagedGuardianLinks,
      familyId: target.familyId,
      expectedGuardianId: guardian.id,
      requireOne: true,
    });
    const stagedFamilyViolation = stagedFamily
      ? appReviewFamilyScopeViolation({ family: stagedFamily, centerId: target.centerId, tenantId: target.tenantId })
      : "family is missing";
    const stagedCenterViolation = stagedCenter
      ? appReviewCenterScopeViolation({ center: stagedCenter, tenantId: target.tenantId })
      : "center is missing";
    if (!stagedFamily || !stagedCenter || stagedLinkViolation || stagedFamilyViolation || stagedCenterViolation) {
      throw new Error("Parent App Review inactive staging revalidation failed.");
    }
    return {
      userId: user.id,
      guardianId: guardian.id,
      accessGrantId: grant.id,
      scopeDigest: appReviewScopeDigest({ center: stagedCenter, family: stagedFamily }),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const authUserBeforeWrite = await getSupabaseAuthUserMetadataByEmail(email);
  if (authUserBeforeWrite && (
    authUserBeforeWrite.email !== email ||
    authUserBeforeWrite.userMetadata.source !== APP_REVIEW_SOURCE ||
    authUserBeforeWrite.appMetadata.bee_suite_role !== UserRole.PARENT_GUARDIAN
  )) {
    throw new Error("The dedicated Parent App Review Auth identity changed while local access was staged; the account remains inactive.");
  }

  await upsertSupabaseAuthUserWithPassword({
    email,
    name: "App Review Parent",
    password,
    role: UserRole.PARENT_GUARDIAN,
    source: APP_REVIEW_SOURCE,
    updateExistingPassword: true,
  });

  const authUserAfterWrite = await getSupabaseAuthUserMetadataByEmail(email);
  if (
    !authUserAfterWrite ||
    authUserAfterWrite.email !== email ||
    authUserAfterWrite.userMetadata.source !== APP_REVIEW_SOURCE ||
    authUserAfterWrite.appMetadata.bee_suite_role !== UserRole.PARENT_GUARDIAN
  ) {
    throw new Error("Parent App Review Auth verification failed; the staged account remains inactive.");
  }

  await prisma.$transaction(async (tx) => {
    const [
      activationUser,
      activationGuardianLinks,
      activationGrant,
      activationFamily,
      activationCenter,
      activeOtherGrantCount,
      activePushSubscriptionCount,
      unrevokedDeviceSessionCount,
    ] = await Promise.all([
      tx.user.findUnique({
        where: { id: staged.userId },
        select: { email: true, tenantId: true, organizationId: true, role: true, isActive: true, customFields: true },
      }),
      tx.guardian.findMany({
        where: { userId: staged.userId },
        select: reviewGuardianLinkSelect,
        take: 2,
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
      tx.family.findUnique({
        where: { id: target.familyId },
        select: appReviewFamilyScopeSelect,
      }),
      tx.center.findUnique({
        where: { id: target.centerId },
        select: appReviewCenterScopeSelect,
      }),
      tx.userAccessGrant.count({
        where: { userId: staged.userId, isActive: true, id: { not: staged.accessGrantId } },
      }),
      tx.webPushSubscription.count({ where: { userId: staged.userId, isActive: true } }),
      tx.deviceSession.count({ where: { userId: staged.userId, revokedAt: null } }),
    ]);

    const activationFamilyScopeViolation = activationFamily
      ? appReviewFamilyScopeViolation({ family: activationFamily, centerId: target.centerId, tenantId: target.tenantId })
      : "family is missing";
    const activationGuardianLinkViolation = reviewGuardianLinkViolation({
      links: activationGuardianLinks,
      familyId: target.familyId,
      expectedGuardianId: staged.guardianId,
      requireOne: true,
    });
    const activationCenterScopeViolation = activationCenter
      ? appReviewCenterScopeViolation({ center: activationCenter, tenantId: target.tenantId })
      : "center is missing";
    const activationScopeDigest = activationFamily && activationCenter
      ? appReviewScopeDigest({ center: activationCenter, family: activationFamily })
      : null;
    const activationGuardian = activationGuardianLinks[0];
    if (
      !activationUser ||
      activationUser.email !== email ||
      activationUser.tenantId !== target.tenantId ||
      activationUser.organizationId !== center.organizationId ||
      activationUser.role !== UserRole.PARENT_GUARDIAN ||
      activationUser.isActive ||
      asRecord(activationUser.customFields).appReview !== true ||
      asRecord(activationUser.customFields).seededBy !== SCRIPT_SOURCE ||
      !activationGuardian ||
      activationGuardianLinkViolation ||
      activationGuardian.userId !== staged.userId ||
      activationGuardian.familyId !== target.familyId ||
      activationGuardian.sourceSystem !== APP_REVIEW_SOURCE ||
      activationGuardian.externalId !== APP_REVIEW_GUARDIAN_EXTERNAL_ID ||
      !activationGrant ||
      activationGrant.userId !== staged.userId ||
      activationGrant.tenantId !== target.tenantId ||
      activationGrant.organizationId !== center.organizationId ||
      activationGrant.centerId !== target.centerId ||
      activationGrant.role !== UserRole.PARENT_GUARDIAN ||
      activationGrant.scopeType !== "CENTER" ||
      activationGrant.isActive ||
      activationGrant.startsAt !== null ||
      activationGrant.endsAt !== null ||
      activeOtherGrantCount !== 0 ||
      activePushSubscriptionCount !== 0 ||
      unrevokedDeviceSessionCount !== 0 ||
      !activationFamily ||
      activationFamily.centerId !== target.centerId ||
      activationFamily.sourceSystem !== DEMO_SOURCE ||
      activationFamily.externalId !== target.familyExternalId ||
      activationFamilyScopeViolation ||
      activationCenterScopeViolation ||
      activationScopeDigest !== staged.scopeDigest ||
      !activationCenter ||
      activationCenter.sourceSystem !== DEMO_SOURCE ||
      activationCenter.externalId !== SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID ||
      ["closed", "archived", "inactive"].includes(activationCenter.status.toLowerCase()) ||
      activationCenter.organization.tenant.slug !== SYNTHETIC_ROLE_QA_TENANT_SLUG ||
      activationCenter.organization.tenantId !== target.tenantId ||
      activationCenter.organizationId !== center.organizationId
    ) {
      throw new Error("Parent App Review activation revalidation failed; the staged account remains inactive.");
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
    loginUrl: "https://thebeesuite.io/parents",
    center: center.name,
    family: family.name,
    children: family.children.map((child) => child.fullName),
    userId: staged.userId,
    guardianId: staged.guardianId,
    accessGrantId: staged.accessGrantId,
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
