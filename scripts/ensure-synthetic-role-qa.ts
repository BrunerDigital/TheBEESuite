import "./load-env";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  hasSyntheticRoleQaMarker,
  isSyntheticRoleQaEmail,
  SYNTHETIC_ROLE_QA_ACCOUNTS,
  SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID,
  SYNTHETIC_ROLE_QA_SOURCE,
  SYNTHETIC_ROLE_QA_TENANT_SLUG,
  syntheticRoleQaAccountRef,
  syntheticRoleQaMarker,
  type SyntheticRoleQaAccount,
} from "@/lib/synthetic-role-qa";
import {
  getSupabaseAuthUserMetadataByEmail,
  upsertSupabaseAuthUserWithPassword,
  verifySupabasePassword,
} from "@/lib/supabase-auth";

const apply = process.argv.includes("--apply");
const verifyAuth = process.argv.includes("--verify-auth") || apply;

function fail(message: string): never {
  throw new Error(message);
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

async function loadDemoScope() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SYNTHETIC_ROLE_QA_TENANT_SLUG },
    select: {
      id: true,
      slug: true,
      brands: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
      organizations: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!tenant) fail("The isolated demo tenant was not found; no changes were made.");
  if (tenant.brands.length !== 1 || tenant.organizations.length !== 1) {
    fail("The isolated demo tenant does not have one unambiguous brand and organization; no changes were made.");
  }

  const organization = tenant.organizations[0];
  const brand = tenant.brands[0];
  const center = await prisma.center.findFirst({
    where: {
      organizationId: organization.id,
      sourceSystem: "bee_suite_demo",
      externalId: SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID,
      status: { notIn: ["closed", "archived", "inactive"] },
    },
    select: { id: true, name: true, sourceSystem: true, externalId: true, organizationId: true },
  });
  if (!center) fail("The active isolated demo center was not found; no changes were made.");

  const classroom = await prisma.classroom.findFirst({
    where: { centerId: center.id, sourceSystem: "bee_suite_demo" },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, centerId: true, sourceSystem: true },
  });
  if (!classroom) fail("The isolated demo center has no synthetic classroom; no changes were made.");

  const family = await prisma.family.findFirst({
    where: { centerId: center.id, sourceSystem: "bee_suite_demo" },
    orderBy: [{ externalId: "asc" }, { id: "asc" }],
    select: { id: true, name: true, centerId: true, sourceSystem: true, customFields: true },
  });
  if (!family || family.sourceSystem !== "bee_suite_demo") {
    fail("The isolated demo center has no unambiguous synthetic family; no changes were made.");
  }

  return { tenant, brand, organization, center, classroom, family };
}

async function preflightExistingAccount(account: SyntheticRoleQaAccount, input: {
  tenantId: string;
  brandId: string;
  organizationId: string;
  centerId: string;
  familyId: string;
  classroomId: string;
}) {
  if (!isSyntheticRoleQaEmail(account.email)) fail(`Rejected non-synthetic QA email for ${account.key}.`);
  const user = await prisma.user.findUnique({
    where: { email: account.email },
    select: {
      id: true,
      tenantId: true,
      role: true,
      customFields: true,
      accessGrants: {
        where: { isActive: true },
        select: { tenantId: true, role: true, scopeType: true, brandId: true, centerId: true, organizationId: true },
      },
      staffProfile: { select: { centerId: true, classroomId: true, sourceSystem: true, externalId: true, customFields: true } },
      guardians: { select: { familyId: true, sourceSystem: true, customFields: true } },
    },
  });
  if (!user) return { exists: false, safe: true };
  if (user.tenantId !== input.tenantId || user.role !== account.role || !hasSyntheticRoleQaMarker(user.customFields)) {
    fail(`Existing ${account.key} account failed the synthetic tenant, role, or marker safety gate.`);
  }
  const grantsSafe = account.scope === "brand"
    ? user.accessGrants.length === 1
      && user.accessGrants[0].tenantId === input.tenantId
      && user.accessGrants[0].role === account.role
      && user.accessGrants[0].scopeType === "BRAND"
      && user.accessGrants[0].brandId === input.brandId
      && !user.accessGrants[0].organizationId
      && !user.accessGrants[0].centerId
    : account.scope === "center"
      ? user.accessGrants.length === 1
        && user.accessGrants[0].tenantId === input.tenantId
        && user.accessGrants[0].role === account.role
        && user.accessGrants[0].scopeType === "CENTER"
        && !user.accessGrants[0].brandId
        && user.accessGrants[0].organizationId === input.organizationId
        && user.accessGrants[0].centerId === input.centerId
      : user.accessGrants.length === 0;
  if (!grantsSafe) {
    fail(`Existing ${account.key} account has an unexpected active grant scope.`);
  }
  const guardianLinksSafe = account.scope === "family"
    ? user.guardians.length === 1
      && user.guardians[0].familyId === input.familyId
      && user.guardians[0].sourceSystem === SYNTHETIC_ROLE_QA_SOURCE
      && hasSyntheticRoleQaMarker(user.guardians[0].customFields)
    : user.guardians.length === 0;
  if (!guardianLinksSafe) {
    fail(`Existing ${account.key} account has an unexpected guardian linkage.`);
  }
  const expectedStaffProfile = account.key === "director" || account.key === "teacher";
  const staffProfileSafe = expectedStaffProfile
    ? !user.staffProfile || (
      user.staffProfile.centerId === input.centerId
      && user.staffProfile.classroomId === (account.key === "teacher" ? input.classroomId : null)
      && user.staffProfile.sourceSystem === SYNTHETIC_ROLE_QA_SOURCE
      && user.staffProfile.externalId === `synthetic-role-qa-${account.key}`
      && hasSyntheticRoleQaMarker(user.staffProfile.customFields)
    )
    : !user.staffProfile;
  if (!staffProfileSafe) {
    fail(`Existing ${account.key} account has an unexpected staff assignment or source marker.`);
  }
  return { exists: true, safe: true };
}

async function preflightExistingAuthIdentity(account: SyntheticRoleQaAccount) {
  const authUser = await getSupabaseAuthUserMetadataByEmail(account.email);
  if (!authUser) return { exists: false, safe: true };
  const safe = authUser.email === account.email
    && authUser.userMetadata.source === SYNTHETIC_ROLE_QA_SOURCE
    && authUser.appMetadata.bee_suite_role === account.role;
  if (!safe) {
    fail(`Existing ${account.key} Auth identity failed the synthetic source or role safety gate.`);
  }
  return { exists: true, safe: true };
}

async function deactivateExistingDatabaseAccount(account: SyntheticRoleQaAccount, tenantId: string) {
  const user = await prisma.user.findUnique({
    where: { email: account.email },
    select: { id: true, tenantId: true, role: true, customFields: true },
  });
  if (!user) return;
  if (user.tenantId !== tenantId || user.role !== account.role || !hasSyntheticRoleQaMarker(user.customFields)) {
    fail(`Existing ${account.key} account changed after preflight; refusing session invalidation.`);
  }
  const revokedAt = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { isActive: false, sessionVersion: { increment: 1 } },
    }),
    prisma.deviceSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt, revokedById: user.id },
    }),
  ]);
}

async function ensureGrant(db: Prisma.TransactionClient, input: {
  userId: string;
  tenantId: string;
  role: UserRole;
  scopeType: "BRAND" | "CENTER";
  brandId?: string;
  organizationId?: string;
  centerId?: string;
}) {
  const where = {
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    scopeType: input.scopeType,
    brandId: input.brandId ?? null,
    organizationId: input.organizationId ?? null,
    ownerGroupId: null,
    centerId: input.centerId ?? null,
  };
  const existing = await db.userAccessGrant.findFirst({ where, select: { id: true } });
  const data = {
    ...where,
    isActive: true,
    startsAt: null,
    endsAt: null,
    permissions: syntheticRoleQaMarker() as Prisma.InputJsonValue,
  };
  if (existing) return db.userAccessGrant.update({ where: { id: existing.id }, data });
  return db.userAccessGrant.create({ data });
}

async function ensureDatabaseAccount(account: SyntheticRoleQaAccount, scope: Awaited<ReturnType<typeof loadDemoScope>>) {
  await prisma.$transaction(async (db) => {
    const existing = await db.user.findUnique({ where: { email: account.email }, select: { customFields: true } });
    const user = await db.user.upsert({
      where: { email: account.email },
      update: {
        tenantId: scope.tenant.id,
        organizationId: scope.organization.id,
        name: account.name,
        role: account.role,
        isActive: false,
        mustResetPassword: true,
        customFields: syntheticRoleQaMarker(jsonObject(existing?.customFields)) as Prisma.InputJsonValue,
      },
      create: {
        tenantId: scope.tenant.id,
        organizationId: scope.organization.id,
        email: account.email,
        name: account.name,
        role: account.role,
        isActive: false,
        mustResetPassword: true,
        customFields: syntheticRoleQaMarker() as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    if (account.scope === "brand") {
      await ensureGrant(db, {
        userId: user.id,
        tenantId: scope.tenant.id,
        role: account.role,
        scopeType: "BRAND",
        brandId: scope.brand.id,
      });
    }

    if (account.scope === "center") {
      await ensureGrant(db, {
        userId: user.id,
        tenantId: scope.tenant.id,
        role: account.role,
        scopeType: "CENTER",
        organizationId: scope.organization.id,
        centerId: scope.center.id,
      });
    }

    if (account.key === "director" || account.key === "teacher") {
      await db.staffProfile.upsert({
        where: { userId: user.id },
        update: {
          centerId: scope.center.id,
          classroomId: account.key === "teacher" ? scope.classroom.id : null,
          title: account.key === "teacher" ? "Synthetic QA Teacher" : "Synthetic QA Director",
          phone: null,
          backgroundCheckStatus: "synthetic_qa",
          sourceSystem: SYNTHETIC_ROLE_QA_SOURCE,
          externalId: `synthetic-role-qa-${account.key}`,
          customFields: syntheticRoleQaMarker() as Prisma.InputJsonValue,
        },
        create: {
          userId: user.id,
          centerId: scope.center.id,
          classroomId: account.key === "teacher" ? scope.classroom.id : null,
          title: account.key === "teacher" ? "Synthetic QA Teacher" : "Synthetic QA Director",
          phone: null,
          backgroundCheckStatus: "synthetic_qa",
          sourceSystem: SYNTHETIC_ROLE_QA_SOURCE,
          externalId: `synthetic-role-qa-${account.key}`,
          customFields: syntheticRoleQaMarker() as Prisma.InputJsonValue,
        },
      });
    }

    if (account.scope === "family") {
      const existingGuardian = await db.guardian.findFirst({
        where: { userId: user.id, sourceSystem: SYNTHETIC_ROLE_QA_SOURCE },
        select: { id: true, customFields: true },
      });
      const data = {
        familyId: scope.family.id,
        userId: user.id,
        fullName: account.name,
        email: account.email,
        phone: null,
        relation: "Synthetic QA guardian",
        preferredCommunication: "none",
        isBillingContact: false,
        sourceSystem: SYNTHETIC_ROLE_QA_SOURCE,
        externalId: "synthetic-role-qa-parent",
        customFields: syntheticRoleQaMarker(jsonObject(existingGuardian?.customFields)) as Prisma.InputJsonValue,
      };
      if (existingGuardian) await db.guardian.update({ where: { id: existingGuardian.id }, data });
      else await db.guardian.create({ data });
    }

    await db.user.update({
      where: { id: user.id },
      data: { isActive: true, mustResetPassword: false },
    });
  });
}

async function verifyDatabaseAccount(account: SyntheticRoleQaAccount, scope: Awaited<ReturnType<typeof loadDemoScope>>) {
  const user = await prisma.user.findUnique({
    where: { email: account.email },
    select: {
      tenantId: true,
      role: true,
      isActive: true,
      mustResetPassword: true,
      customFields: true,
      accessGrants: { where: { isActive: true }, select: { scopeType: true, brandId: true, organizationId: true, centerId: true, role: true } },
      staffProfile: { select: { centerId: true, classroomId: true, sourceSystem: true } },
      guardians: { select: { familyId: true, sourceSystem: true, customFields: true } },
    },
  });
  const base = Boolean(user
    && user.tenantId === scope.tenant.id
    && user.role === account.role
    && user.isActive
    && !user.mustResetPassword
    && hasSyntheticRoleQaMarker(user.customFields));
  const scopeOk = account.scope === "brand"
    ? Boolean(user?.accessGrants.length === 1
      && user.accessGrants[0].role === account.role
      && user.accessGrants[0].scopeType === "BRAND"
      && user.accessGrants[0].brandId === scope.brand.id
      && !user.accessGrants[0].organizationId
      && !user.accessGrants[0].centerId)
    : account.scope === "center"
      ? Boolean(user?.accessGrants.length === 1
        && user.accessGrants[0].role === account.role
        && user.accessGrants[0].scopeType === "CENTER"
        && !user.accessGrants[0].brandId
        && user.accessGrants[0].organizationId === scope.organization.id
        && user.accessGrants[0].centerId === scope.center.id)
      : Boolean(user?.accessGrants.length === 0
        && user.guardians.length === 1
        && user.guardians[0].familyId === scope.family.id
        && user.guardians[0].sourceSystem === SYNTHETIC_ROLE_QA_SOURCE
        && hasSyntheticRoleQaMarker(user.guardians[0].customFields));
  const assignmentOk = account.key === "director"
    ? user?.staffProfile?.centerId === scope.center.id && !user.staffProfile.classroomId && user.staffProfile.sourceSystem === SYNTHETIC_ROLE_QA_SOURCE
    : account.key === "teacher"
      ? user?.staffProfile?.centerId === scope.center.id && user.staffProfile.classroomId === scope.classroom.id && user.staffProfile.sourceSystem === SYNTHETIC_ROLE_QA_SOURCE
      : !user?.staffProfile;
  const guardianLinksOk = account.scope === "family" ? true : user?.guardians.length === 0;
  return base && scopeOk && assignmentOk && guardianLinksOk;
}

async function main() {
  if (apply && process.env.ALLOW_SYNTHETIC_ROLE_QA_MUTATIONS !== "true") {
    fail("Set ALLOW_SYNTHETIC_ROLE_QA_MUTATIONS=true with --apply.");
  }
  const password = process.env.SYNTHETIC_ROLE_QA_PASSWORD?.trim() || process.env.DEMO_PASSWORD?.trim() || "";
  if ((apply || verifyAuth) && !password) {
    fail("SYNTHETIC_ROLE_QA_PASSWORD (or DEMO_PASSWORD) is required for apply or authentication verification.");
  }

  const scope = await loadDemoScope();
  const preflight = [];
  for (const account of SYNTHETIC_ROLE_QA_ACCOUNTS) {
    const database = await preflightExistingAccount(account, {
      tenantId: scope.tenant.id,
      brandId: scope.brand.id,
      organizationId: scope.organization.id,
      centerId: scope.center.id,
      familyId: scope.family.id,
      classroomId: scope.classroom.id,
    });
    const authentication = await preflightExistingAuthIdentity(account);
    preflight.push({ role: account.key, accountRef: syntheticRoleQaAccountRef(account.email), database, authentication });
  }

  if (apply) {
    for (const account of SYNTHETIC_ROLE_QA_ACCOUNTS) {
      await deactivateExistingDatabaseAccount(account, scope.tenant.id);
      await upsertSupabaseAuthUserWithPassword({
        email: account.email,
        name: account.name,
        password,
        role: account.role,
        source: SYNTHETIC_ROLE_QA_SOURCE,
      });
      if (!await verifySupabasePassword(account.email, password)) {
        fail(`Rotated ${account.key} Auth credentials could not be verified before database activation.`);
      }
      await ensureDatabaseAccount(account, scope);
    }
  }

  const results = [];
  for (const account of SYNTHETIC_ROLE_QA_ACCOUNTS) {
    const database = await verifyDatabaseAccount(account, scope);
    const authentication = verifyAuth ? await verifySupabasePassword(account.email, password) : null;
    results.push({
      role: account.key,
      accountRef: syntheticRoleQaAccountRef(account.email),
      database: database ? "passed" : apply ? "failed" : "not_provisioned",
      authentication: authentication === null ? "not_run" : authentication ? "passed" : "failed",
    });
  }

  const passed = results.every((result) => result.database === "passed" && (!verifyAuth || result.authentication === "passed"));
  console.log(JSON.stringify({
    mode: apply ? "apply" : "preview",
    safety: {
      tenant: SYNTHETIC_ROLE_QA_TENANT_SLUG,
      centerSource: scope.center.sourceSystem,
      familySource: scope.family.sourceSystem,
      emailNamespace: "synthetic.thebeesuite.io",
      customerDataTouched: false,
    },
    target: {
      activeDemoCenters: 1,
      classroomAvailable: true,
      familyAvailable: true,
    },
    preflight,
    results,
    passed,
  }, null, 2));
  if ((apply || verifyAuth) && !passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Synthetic role QA account operation failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
