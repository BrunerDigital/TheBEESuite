import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import {
  ensureParentPortalLoginForGuardian,
  parentPortalAccessDisabled,
  parentPortalLinkedFields,
} from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import { getSupabaseAuthConfig } from "@/lib/supabase-auth";

const CENTER_LOCATION_ID = "Kid City USA - TX | Tyler";
const CENTER_NAME = "Kid City USA - Tyler";
const IMPORT_SOURCE = "tyler_procare_cross_report_import_2026_07_31";
const IMPORT_FILENAME = "Tyler ProCare cross-report export (10 files)";
const EXPECTED_ENROLLED_CHILDREN = 133;
const EXPECTED_ENROLLED_FAMILIES = 98;
const ACTION = "parent_portal.tyler_payer_account_prepared";
const APPLY = process.argv.includes("--apply");
const RECOVER_PREPARED_AUTH_ORPHAN = process.argv.includes("--recover-prepared-auth-orphan");
const REPAIR_INTERRUPTED_FLAGS = process.argv.includes("--repair-interrupted-preparation-flags");

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizedEmail(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function digits(value: string | null | undefined) {
  return clean(value).replace(/\D/g, "");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  if (error && typeof error === "object") return error;
  return { message: String(error) };
}

async function pause(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function listAuthUsers() {
  const { url, key } = getSupabaseAuthConfig("service");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users: Array<{
    id: string;
    email?: string;
    createdAt: string;
    lastSignInAt?: string;
    userMetadata: Record<string, unknown>;
  }> = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users.map((user) => ({
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      userMetadata: record(user.user_metadata),
    })));
    if (data.users.length < 1000) break;
  }
  return users;
}

async function main() {
  if (APPLY) {
    invariant(process.argv.includes("--confirm-tx-tyler"), "Apply mode requires --confirm-tx-tyler.");
    invariant(process.argv.includes("--acknowledge-no-invites"), "Apply mode requires --acknowledge-no-invites.");
  }

  const startedAt = new Date();
  const center = await prisma.center.findFirst({
    where: { crmLocationId: CENTER_LOCATION_ID },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
    },
  });
  invariant(center, `${CENTER_LOCATION_ID} was not found.`);
  invariant(center.name === CENTER_NAME, `Expected ${CENTER_NAME}; found ${center.name}.`);

  const batch = await prisma.procareImportBatch.findFirst({
    where: { centerId: center.id, filename: IMPORT_FILENAME },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, summary: true, _count: { select: { rows: true } } },
  });
  invariant(batch, "The reviewed Tyler family/child import batch was not found.");
  invariant(batch.status === "completed_with_held_rows", `Unexpected Tyler import status: ${batch.status}.`);
  const batchSummary = record(batch.summary);
  invariant(batchSummary.source === IMPORT_SOURCE, "The Tyler import source fingerprint does not match the reviewed import.");
  invariant(batch._count.rows === 10, `Expected 10 verified Tyler source files; found ${batch._count.rows}.`);
  const batchResults = record(batchSummary.results);
  invariant(Number(batchResults.children) === 488, `Expected 488 Tyler import-result children; found ${String(batchResults.children)}.`);
  invariant(Number(batchResults.families) === 406, `Expected 406 Tyler import-result families; found ${String(batchResults.families)}.`);

  const families = await prisma.family.findMany({
    where: {
      centerId: center.id,
      children: { some: { enrollmentStatus: "enrolled" } },
    },
    include: {
      children: {
        where: { enrollmentStatus: "enrolled" },
        select: { id: true, fullName: true, sourceSystem: true, externalId: true, customFields: true },
      },
      guardians: {
        orderBy: [{ isBillingContact: "desc" }, { id: "asc" }],
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isBillingContact: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
          userId: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
  const enrolledChildren = families.flatMap((family) => family.children);
  invariant(enrolledChildren.length === EXPECTED_ENROLLED_CHILDREN, `Expected ${EXPECTED_ENROLLED_CHILDREN} enrolled Tyler children; found ${enrolledChildren.length}.`);
  invariant(families.length === EXPECTED_ENROLLED_FAMILIES, `Expected ${EXPECTED_ENROLLED_FAMILIES} enrolled Tyler families; found ${families.length}.`);

  const allGuardians = await prisma.guardian.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      familyId: true,
      fullName: true,
      email: true,
      externalId: true,
      customFields: true,
      family: { select: { centerId: true } },
    },
  });
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, tenantId: true, role: true, isActive: true, mustResetPassword: true },
  });
  const usersByEmail = new Map(allUsers.map((user) => [normalizedEmail(user.email), user]));
  const authUsers = await listAuthUsers();
  const authByEmail = new Map(authUsers.map((user) => [normalizedEmail(user.email), user]));

  const blockers: Array<{ familyId: string; family: string; reasons: string[] }> = [];
  const safe = new Map<string, {
    familyId: string;
    familyName: string;
    guardianId: string;
    guardianName: string;
    email: string;
    alreadyLinked: boolean;
    appUserId: string | null;
    appUserExists: boolean;
    authUserExists: boolean;
    mustResetPassword: boolean;
    preparedWithoutInvite: boolean;
  }>();

  for (const family of families) {
    const reasons: string[] = [];
    const payers = family.guardians.filter((guardian) => guardian.isBillingContact);
    if (payers.length !== 1) reasons.push(`Expected exactly one billing guardian; found ${payers.length}.`);
    const payer = payers[0];
    if (!payer) {
      blockers.push({ familyId: family.id, family: family.name, reasons });
      continue;
    }
    const email = normalizedEmail(payer.email);
    const payerFields = record(payer.customFields);
    if (!validEmail(email)) reasons.push("Billing guardian needs a valid email.");
    if (digits(payer.phone).length < 4) reasons.push("Billing guardian needs a phone number with at least four digits.");
    if (payer.sourceSystem !== "procare" || !clean(payer.externalId)) reasons.push("Billing guardian lacks a verified ProCare identity.");
    if (payerFields.source !== IMPORT_SOURCE) reasons.push("Billing guardian does not belong to the reviewed Tyler import.");
    if (parentPortalAccessDisabled(payer.customFields)) reasons.push("Parent portal access is explicitly disabled.");
    if (family.sourceSystem !== "procare" || !clean(family.externalId)) reasons.push("Family lacks a verified ProCare identity.");
    if (family.children.some((child) => (
      child.sourceSystem !== "procare"
      || !clean(child.externalId)
      || record(child.customFields).source !== IMPORT_SOURCE
    ))) reasons.push("An enrolled child does not belong to the reviewed Tyler import.");

    const matchingGuardians = allGuardians.filter((guardian) => normalizedEmail(guardian.email) === email);
    if (matchingGuardians.some((guardian) => guardian.family.centerId !== center.id)) {
      reasons.push("Email is also attached to a guardian outside Kid City USA - TX | Tyler.");
    }
    if (matchingGuardians.some((guardian) => parentPortalAccessDisabled(guardian.customFields))) {
      reasons.push("A matching guardian record has parent portal access disabled.");
    }
    const conflictingIdentity = matchingGuardians.some((guardian) => (
      guardian.id !== payer.id
      && guardian.fullName.trim().toLowerCase() !== payer.fullName.trim().toLowerCase()
      && (!guardian.externalId || guardian.externalId !== payer.externalId)
    ));
    if (conflictingIdentity) reasons.push("Email is attached to conflicting guardian identities.");

    const appUser = usersByEmail.get(email);
    const authUser = authByEmail.get(email);
    const authUserExists = Boolean(authUser);
    if (appUser && appUser.tenantId !== center.organization.tenantId) reasons.push("Existing app user belongs to another tenant.");
    if (appUser && appUser.role !== UserRole.PARENT_GUARDIAN) reasons.push("Existing app user has a non-parent role.");
    const recoverablePreparedAuthOrphan = Boolean(
      authUser
      && !appUser
      && authUser.userMetadata.source === "one_time_setup_link"
      && clean(String(authUser.userMetadata.name ?? "")).toLowerCase() === payer.fullName.trim().toLowerCase()
      && !authUser.lastSignInAt
      && Date.parse(authUser.createdAt) >= Date.now() - (2 * 60 * 60 * 1000)
    );
    if (authUserExists && !appUser && !(RECOVER_PREPARED_AUTH_ORPHAN && recoverablePreparedAuthOrphan)) {
      reasons.push(recoverablePreparedAuthOrphan
        ? "Recent prepared Auth orphan requires --recover-prepared-auth-orphan."
        : "Supabase Auth account exists without a matching app parent user.");
    }
    if (payer.userId && payer.userId !== appUser?.id) reasons.push("Guardian is linked to a different app user.");

    if (reasons.length) {
      blockers.push({ familyId: family.id, family: family.name, reasons: [...new Set(reasons)] });
      continue;
    }
    if (safe.has(email)) {
      reasons.push("More than one enrolled family selected the same portal email.");
      blockers.push({ familyId: family.id, family: family.name, reasons });
      safe.delete(email);
      continue;
    }
    safe.set(email, {
      familyId: family.id,
      familyName: family.name,
      guardianId: payer.id,
      guardianName: payer.fullName,
      email,
      alreadyLinked: payer.userId === appUser?.id,
      appUserId: appUser?.id ?? null,
      appUserExists: Boolean(appUser),
      authUserExists,
      mustResetPassword: appUser?.mustResetPassword ?? false,
      preparedWithoutInvite: record(record(payer.customFields).parentPortal).preparedWithoutInvite === true,
    });
  }

  const safeAccounts = [...safe.values()];
  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    center: center.crmLocationId,
    importBatchId: batch.id,
    enrolledChildren: enrolledChildren.length,
    enrolledFamilies: families.length,
    safeAccounts: safeAccounts.length,
    alreadyLinkedAccounts: safeAccounts.filter((item) => item.alreadyLinked).length,
    accountsToPrepare: safeAccounts.filter((item) => !item.alreadyLinked).length,
    blockers,
    invitationGate: "not_authorized_and_not_sent",
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) return;

  invariant(blockers.length === 0, `Tyler portal preparation is blocked for ${blockers.length} enrolled families.`);
  const interruptedFlagRepairs = safeAccounts.filter((account) => (
    account.alreadyLinked
    && account.authUserExists
    && (!account.mustResetPassword || !account.preparedWithoutInvite)
  ));
  if (interruptedFlagRepairs.length) {
    invariant(REPAIR_INTERRUPTED_FLAGS, `${interruptedFlagRepairs.length} interrupted preparation records require --repair-interrupted-preparation-flags.`);
    const [priorInviteAudits, priorInviteDeliveries] = await Promise.all([
      prisma.auditLog.count({
        where: {
          centerId: center.id,
          resourceId: { in: interruptedFlagRepairs.map((account) => account.guardianId) },
          action: { in: ["parent_portal.guardian_invited", "parent_portal.guide_sent"] },
        },
      }),
      prisma.integrationDelivery.count({
        where: {
          centerId: center.id,
          recipient: { in: interruptedFlagRepairs.map((account) => account.email) },
          purpose: { in: ["parent_invitation_email", "parent_guide_email"] },
        },
      }),
    ]);
    invariant(priorInviteAudits === 0 && priorInviteDeliveries === 0, "Cannot repair preparation flags after invitation activity.");
    for (const account of interruptedFlagRepairs) {
      invariant(account.appUserId, `Missing app user for interrupted preparation ${account.familyId}.`);
      const guardian = families.flatMap((family) => family.guardians).find((item) => item.id === account.guardianId);
      invariant(guardian, `Missing guardian for interrupted preparation ${account.familyId}.`);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: account.appUserId },
          data: { mustResetPassword: true, sessionVersion: { increment: 1 } },
        }),
        prisma.guardian.update({
          where: { id: account.guardianId },
          data: {
            customFields: parentPortalLinkedFields({
              customFields: guardian.customFields,
              loginEmail: account.email,
              linkedBy: "system:tyler-parent-portal-preparation-recovery",
              linkedReason: "tyler_interrupted_preparation_flags_repaired",
              preparedWithoutInvite: true,
            }),
          },
        }),
      ]);
      await writeSystemAuditLog({
        tenantId: center.organization.tenantId,
        centerId: center.id,
        action: "parent_portal.tyler_preparation_flags_repaired",
        resource: "Guardian",
        resourceId: account.guardianId,
        metadata: {
          familyId: account.familyId,
          parentUserId: account.appUserId,
          invitationSent: false,
          sourceImportBatchId: batch.id,
        },
      });
    }
  }
  const beforeOutsideLinked = await prisma.guardian.count({
    where: { userId: { not: null }, family: { centerId: { not: center.id } } },
  });
  let prepared = 0;
  let alreadyPrepared = 0;
  let recoveredAuditRecords = 0;
  const processedGuardianIds: string[] = [];
  const processedEmails: string[] = [];
  const existingPreparationAudits = new Set((await prisma.auditLog.findMany({
    where: {
      centerId: center.id,
      action: ACTION,
      resourceId: { in: safeAccounts.map((account) => account.guardianId) },
    },
    select: { resourceId: true },
  })).map((audit) => audit.resourceId).filter((id): id is string => Boolean(id)));
  for (const account of safeAccounts) {
    if (account.alreadyLinked && account.authUserExists) {
      alreadyPrepared += 1;
      processedGuardianIds.push(account.guardianId);
      processedEmails.push(account.email);
      if (!existingPreparationAudits.has(account.guardianId)) {
        await writeSystemAuditLog({
          tenantId: center.organization.tenantId,
          centerId: center.id,
          action: ACTION,
          resource: "Guardian",
          resourceId: account.guardianId,
          metadata: {
            familyId: account.familyId,
            parentUserId: account.appUserId,
            recoveredAfterInterruptedPreparation: true,
            invitationSent: false,
            sourceImportBatchId: batch.id,
          },
        });
        recoveredAuditRecords += 1;
      }
      continue;
    }
    let result: Awaited<ReturnType<typeof ensureParentPortalLoginForGuardian>> | null = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        result = await ensureParentPortalLoginForGuardian({
          guardianId: account.guardianId,
          linkedBy: "system:tyler-parent-portal-preparation",
          linkedReason: "tyler_payer_account_prepared_without_invite",
          prepareWithoutInvite: !account.appUserExists || !account.authUserExists,
        });
        break;
      } catch (error) {
        console.error(JSON.stringify({
          familyId: account.familyId,
          attempt,
          error: errorDetails(error),
        }));
        if (attempt === 4) throw error;
        await pause(attempt * 2_000);
      }
    }
    invariant(result, `Portal preparation returned no result for ${account.familyName}.`);
    invariant(result.ok, `Portal preparation failed for ${account.familyName}: ${result.reason}`);
    invariant(result.linkedGuardianIds.every((guardianId) => (
      allGuardians.find((guardian) => guardian.id === guardianId)?.family.centerId === center.id
    )), `Portal preparation for ${account.familyName} crossed the Tyler center boundary.`);
    prepared += 1;
    processedGuardianIds.push(account.guardianId);
    processedEmails.push(account.email);
    await writeSystemAuditLog({
      tenantId: center.organization.tenantId,
      centerId: center.id,
      action: ACTION,
      resource: "Guardian",
      resourceId: account.guardianId,
      metadata: {
        familyId: account.familyId,
        parentUserId: result.userId,
        linkedGuardianCount: result.linkedGuardianIds.length,
        created: result.created,
        reactivated: result.reactivated,
        credentialCreated: result.credentialCreated,
        invitationSent: false,
        sourceImportBatchId: batch.id,
      },
    });
  }

  const [
    verifiedGuardians,
    invitationAudits,
    invitationDeliveries,
    anyInvitationAudits,
    anyInvitationDeliveries,
    preparationAuditRows,
    afterOutsideLinked,
  ] = await Promise.all([
    prisma.guardian.findMany({
      where: { id: { in: processedGuardianIds } },
      select: {
        id: true,
        customFields: true,
        user: { select: { email: true, role: true, isActive: true, mustResetPassword: true } },
      },
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: startedAt },
        centerId: center.id,
        action: { in: ["parent_portal.guardian_invited", "parent_portal.guide_sent"] },
      },
    }),
    prisma.integrationDelivery.count({
      where: {
        createdAt: { gte: startedAt },
        centerId: center.id,
        purpose: { in: ["parent_invitation_email", "parent_guide_email"] },
      },
    }),
    prisma.auditLog.count({
      where: {
        centerId: center.id,
        resourceId: { in: processedGuardianIds },
        action: { in: ["parent_portal.guardian_invited", "parent_portal.guide_sent"] },
      },
    }),
    prisma.integrationDelivery.count({
      where: {
        centerId: center.id,
        recipient: { in: processedEmails },
        purpose: { in: ["parent_invitation_email", "parent_guide_email"] },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        centerId: center.id,
        action: ACTION,
        resourceId: { in: processedGuardianIds },
      },
      select: { resourceId: true },
    }),
    prisma.guardian.count({
      where: { userId: { not: null }, family: { centerId: { not: center.id } } },
    }),
  ]);
  const authAfter = new Set((await listAuthUsers()).map((user) => normalizedEmail(user.email)));
  const preparationAuditGuardianCount = new Set(preparationAuditRows.map((audit) => audit.resourceId).filter(Boolean)).size;
  const verificationIssues = verifiedGuardians.flatMap((guardian) => {
    const expectedEmail = safeAccounts.find((item) => item.guardianId === guardian.id)?.email;
    const parentPortal = record(record(guardian.customFields).parentPortal);
    const reasons = [
      ...(guardian.user?.role === UserRole.PARENT_GUARDIAN ? [] : ["role"]),
      ...(guardian.user?.isActive ? [] : ["inactive"]),
      ...(guardian.user?.mustResetPassword ? [] : ["must_reset"]),
      ...(normalizedEmail(guardian.user?.email) === expectedEmail ? [] : ["email"]),
      ...(parentPortal.preparedWithoutInvite === true ? [] : ["prepared_without_invite"]),
      ...(parentPortal.loginEnabled === true ? [] : ["login_enabled"]),
    ];
    return reasons.length ? [{ guardianId: guardian.id, reasons }] : [];
  });
  console.log(JSON.stringify({
    verification: {
      guardianIssues: verificationIssues,
      invitationAudits,
      invitationDeliveries,
      anyInvitationAudits,
      anyInvitationDeliveries,
      preparationAuditRecords: preparationAuditRows.length,
      preparationAuditGuardianCount,
    },
  }, null, 2));
  invariant(verifiedGuardians.length === EXPECTED_ENROLLED_FAMILIES, "Not every Tyler billing guardian was verified after preparation.");
  invariant(verificationIssues.length === 0, "A Tyler guardian is not linked to the expected active parent user.");
  invariant(processedEmails.every((email) => authAfter.has(email)), "A Tyler parent app user is missing its Supabase Auth account.");
  invariant(invitationAudits === 0 && invitationDeliveries === 0, "Invitation activity was detected during preparation.");
  invariant(anyInvitationAudits === 0 && anyInvitationDeliveries === 0, "A prepared Tyler account has invitation history.");
  invariant(preparationAuditGuardianCount === EXPECTED_ENROLLED_FAMILIES, "Not every prepared Tyler account has an audit record.");
  invariant(afterOutsideLinked === beforeOutsideLinked, "A guardian outside Kid City USA - TX | Tyler was changed.");

  console.log(JSON.stringify({
    applied: {
      prepared,
      alreadyPrepared,
      repairedInterruptedFlags: interruptedFlagRepairs.length,
      recoveredAuditRecords,
      verifiedParentAccounts: verifiedGuardians.length,
      verifiedAuthAccounts: processedEmails.filter((email) => authAfter.has(email)).length,
      invitationAudits,
      invitationDeliveries,
      anyInvitationAudits,
      anyInvitationDeliveries,
      preparationAuditRecords: preparationAuditRows.length,
      preparationAuditGuardianCount,
      outsideTylerLinkedGuardianDelta: afterOutsideLinked - beforeOutsideLinked,
    },
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
