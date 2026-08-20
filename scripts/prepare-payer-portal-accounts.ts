import "./load-env";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { evaluateParentInvitationReadiness } from "@/lib/parent-invitation-readiness";
import { isActiveProcareEnrollmentStatus } from "@/lib/procare-import-fields";
import {
  ensureParentPortalLoginForGuardian,
  hasConflictingGuardianFamilyLinks,
  parentPortalAccessDisabled,
} from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import { getSupabaseAuthConfig, isSupabaseAuthCompatibleEmail } from "@/lib/supabase-auth";

const APPLY = process.argv.includes("--apply");
const ACKNOWLEDGED_NO_INVITES = process.argv.includes("--acknowledge-no-invites");
const INCLUDE_AUTHORIZED_PICKUPS = process.argv.includes("--include-authorized-pickups");
const EXCLUDE_TX_TYLER = process.argv.includes("--exclude-tx-tyler");
const FINGERPRINT_PREFIX = "--confirm-fingerprint=";
const ACTION = "parent_portal.payer_account_prepared";

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizedEmail(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

function validEmail(value: string) {
  return isSupabaseAuthCompatibleEmail(value);
}

function isNonProductionCenter(center: { name: string; crmLocationId: string | null } | null | undefined) {
  return `${center?.name ?? ""} ${center?.crmLocationId ?? ""}`.toLowerCase().includes("demo");
}

type GuardianRecord = Awaited<ReturnType<typeof loadGuardians>>[number];

async function loadGuardians() {
  return prisma.guardian.findMany({
    include: {
      user: {
        select: { role: true, isActive: true },
      },
      family: {
        include: {
          children: {
            select: {
              id: true,
              fullName: true,
              enrollmentStatus: true,
              sourceSystem: true,
              externalId: true,
            },
          },
          pickups: {
            select: { sourceSystem: true, externalId: true },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

function hasActiveParentLink(guardian: GuardianRecord) {
  return guardian.user?.role === UserRole.PARENT_GUARDIAN && guardian.user.isActive;
}

function guardianIdentity(guardian: GuardianRecord) {
  return {
    id: guardian.id,
    familyId: guardian.familyId,
    fullName: guardian.fullName,
    email: guardian.email,
    phone: guardian.phone,
    sourceSystem: guardian.sourceSystem,
    externalId: guardian.externalId,
  };
}

async function main() {
  if (APPLY && !ACKNOWLEDGED_NO_INVITES) {
    throw new Error("Apply mode requires --acknowledge-no-invites.");
  }
  if (APPLY && INCLUDE_AUTHORIZED_PICKUPS && !EXCLUDE_TX_TYLER) {
    throw new Error("Pickup-inclusive apply mode requires --exclude-tx-tyler.");
  }
  const suppliedFingerprint = process.argv.find((arg) => arg.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length).trim();

  const startedAt = new Date();
  const guardians = await loadGuardians();
  const centers = await prisma.center.findMany({
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
    },
  });
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const payerGuardians = guardians.filter((guardian) => {
    const center = guardian.family.centerId ? centerById.get(guardian.family.centerId) : null;
    if (EXCLUDE_TX_TYLER && center?.crmLocationId === "Kid City USA - TX | Tyler") return false;
    if (!guardian.family.children.some((child) => isActiveProcareEnrollmentStatus(child.enrollmentStatus))) return false;
    if (clean(guardian.family.sourceSystem).toLowerCase() !== "procare" || !clean(guardian.family.externalId)) return false;
    if (clean(guardian.sourceSystem).toLowerCase() !== "procare" || !clean(guardian.externalId)) return false;
    if (guardian.family.children
      .filter((child) => isActiveProcareEnrollmentStatus(child.enrollmentStatus))
      .some((child) => clean(child.sourceSystem).toLowerCase() !== "procare" || !clean(child.externalId))) return false;
    const pickupExternalIds = new Set(guardian.family.pickups
      .filter((pickup) => clean(pickup.sourceSystem).toLowerCase() === "procare" && clean(pickup.externalId))
      .map((pickup) => clean(pickup.externalId)));
    const exactAuthorizedPickup = (
      INCLUDE_AUTHORIZED_PICKUPS
      && clean(guardian.sourceSystem).toLowerCase() === "procare"
      && Boolean(clean(guardian.externalId))
      && pickupExternalIds.has(clean(guardian.externalId))
    );
    return guardian.isBillingContact || exactAuthorizedPickup;
  });
  const familyIds = [...new Set(guardians.map((guardian) => guardian.familyId))];
  const importBatches = await prisma.procareImportBatch.findMany({
    where: { rows: { some: { createdFamilyId: { in: familyIds } } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      summary: true,
      rows: {
        where: { createdFamilyId: { in: familyIds } },
        select: { createdFamilyId: true },
      },
    },
  });
  const latestBatchByFamilyId = new Map<string, (typeof importBatches)[number]>();
  for (const batch of importBatches) {
    for (const row of batch.rows) {
      if (row.createdFamilyId && !latestBatchByFamilyId.has(row.createdFamilyId)) {
        latestBatchByFamilyId.set(row.createdFamilyId, batch);
      }
    }
  }

  const tenantIdByGuardianId = new Map(
    guardians.map((guardian) => [
      guardian.id,
      guardian.family.centerId
        ? centerById.get(guardian.family.centerId)?.organization.tenantId ?? ""
        : "",
    ]),
  );
  const matchingByTenantAndEmail = new Map<string, GuardianRecord[]>();
  for (const guardian of guardians) {
    const email = normalizedEmail(guardian.email);
    const tenantId = tenantIdByGuardianId.get(guardian.id) ?? "";
    if (!tenantId || !validEmail(email)) continue;
    const key = `${tenantId}\u0000${email}`;
    matchingByTenantAndEmail.set(key, [...(matchingByTenantAndEmail.get(key) ?? []), guardian]);
  }

  const emailTenants = new Map<string, Set<string>>();
  for (const guardian of guardians) {
    const email = normalizedEmail(guardian.email);
    const tenantId = tenantIdByGuardianId.get(guardian.id) ?? "";
    if (!tenantId || !validEmail(email)) continue;
    const tenants = emailTenants.get(email) ?? new Set<string>();
    tenants.add(tenantId);
    emailTenants.set(email, tenants);
  }

  const existingUsers = await prisma.user.findMany({
    where: { email: { in: [...new Set(payerGuardians.map((guardian) => normalizedEmail(guardian.email)).filter(validEmail))] } },
    select: {
      id: true,
      email: true,
      tenantId: true,
      role: true,
      isActive: true,
    },
  });
  const existingUserByEmail = new Map(existingUsers.map((user) => [normalizedEmail(user.email), user]));
  const candidateGuardianIds = new Set(payerGuardians.map((guardian) => guardian.id));
  const { url, key } = getSupabaseAuthConfig("service");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const existingAuthEmails = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const authUser of data.users) {
      const authEmail = normalizedEmail(authUser.email);
      if (authEmail) existingAuthEmails.add(authEmail);
    }
    if (data.users.length < 1000) break;
  }

  const readinessByGuardianId = new Map<string, ReturnType<typeof evaluateParentInvitationReadiness>>();
  const readinessFor = (guardian: GuardianRecord) => {
    const cached = readinessByGuardianId.get(guardian.id);
    if (cached) return cached;
    const tenantId = tenantIdByGuardianId.get(guardian.id) ?? "";
    const email = normalizedEmail(guardian.email);
    const matching = matchingByTenantAndEmail.get(`${tenantId}\u0000${email}`) ?? [];
    const batch = latestBatchByFamilyId.get(guardian.familyId);
    const readiness = evaluateParentInvitationReadiness({
      guardian: guardianIdentity(guardian),
      family: {
        id: guardian.family.id,
        centerId: guardian.family.centerId,
        sourceSystem: guardian.family.sourceSystem,
        externalId: guardian.family.externalId,
        children: guardian.family.children,
      },
      matchingEmailGuardians: matching.map(guardianIdentity),
      relevantImportBatch: batch
        ? { id: batch.id, status: batch.status, summary: batch.summary }
        : null,
    });
    readinessByGuardianId.set(guardian.id, readiness);
    return readiness;
  };

  const blockedReasons = new Map<string, number>();
  const blockedReasonsByCenterId = new Map<string, Map<string, number>>();
  const recordBlocker = (centerId: string, blocker: string) => {
    blockedReasons.set(blocker, (blockedReasons.get(blocker) ?? 0) + 1);
    const centerBlockers = blockedReasonsByCenterId.get(centerId) ?? new Map<string, number>();
    centerBlockers.set(blocker, (centerBlockers.get(blocker) ?? 0) + 1);
    blockedReasonsByCenterId.set(centerId, centerBlockers);
  };
  const safeGroupByKey = new Map<string, GuardianRecord[]>();
  let alreadyLinkedPayers = 0;
  let missingEmailPayers = 0;

  for (const payer of payerGuardians) {
    if (hasActiveParentLink(payer)) {
      alreadyLinkedPayers += 1;
      continue;
    }
    const center = payer.family.centerId ? centerById.get(payer.family.centerId) : null;
    const centerId = center?.id ?? "unassigned";
    if (isNonProductionCenter(center)) {
      recordBlocker(centerId, "Non-production demo center excluded.");
      continue;
    }
    const email = normalizedEmail(payer.email);
    const tenantId = tenantIdByGuardianId.get(payer.id) ?? "";
    if (!validEmail(email)) {
      missingEmailPayers += 1;
      recordBlocker(centerId, "valid email required");
      continue;
    }
    const key = `${tenantId}\u0000${email}`;
    const matchingGuardians = matchingByTenantAndEmail.get(key) ?? [];
    const user = existingUserByEmail.get(email);
    const blockers = [
      ...readinessFor(payer).blockers,
      ...(emailTenants.get(email)?.size === 1 ? [] : ["Email appears in more than one tenant."]),
      ...(matchingGuardians.every((guardian) => !parentPortalAccessDisabled(guardian.customFields))
        ? []
        : ["A matching guardian has parent portal access disabled."]),
      ...(matchingGuardians.every((guardian) => guardian.family.centerId === payer.family.centerId)
        ? []
        : ["A matching guardian email belongs to another school."]),
      ...(hasConflictingGuardianFamilyLinks(payer.familyId, matchingGuardians)
        ? ["A matching guardian email belongs to another family."]
        : []),
      ...(matchingGuardians.every((guardian) => candidateGuardianIds.has(guardian.id) || Boolean(guardian.userId))
        ? []
        : ["A matching unlinked guardian is outside the payer or authorized-pickup scope."]),
      ...(matchingGuardians.every((guardian) => readinessFor(guardian).ok)
        ? []
        : ["Every guardian record that would be linked must pass readiness."]),
      ...(user && user.tenantId !== tenantId ? ["Existing app user belongs to another tenant."] : []),
      ...(user && user.role !== UserRole.PARENT_GUARDIAN ? ["Existing app user has a non-parent role."] : []),
      ...(existingAuthEmails.has(email) && !user ? ["Supabase Auth account exists without a matching app parent user."] : []),
    ];
    if (blockers.length) {
      for (const blocker of new Set(blockers)) {
        recordBlocker(centerId, blocker);
      }
      continue;
    }
    safeGroupByKey.set(key, [...(safeGroupByKey.get(key) ?? []), payer]);
  }

  const safeGroups = [...safeGroupByKey.values()];
  const safeTargetFingerprint = createHash("sha256").update(JSON.stringify(
    safeGroups
      .map((group) => ({
        tenantId: tenantIdByGuardianId.get(group[0].id) ?? "",
        centerId: group[0].family.centerId,
        email: normalizedEmail(group[0].email),
        guardianIds: group.map((guardian) => guardian.id).sort(),
        familyIds: [...new Set(group.map((guardian) => guardian.familyId))].sort(),
        existingAppUser: existingUserByEmail.has(normalizedEmail(group[0].email)),
        existingAuthUser: existingAuthEmails.has(normalizedEmail(group[0].email)),
      }))
      .sort((left, right) => `${left.tenantId}:${left.email}`.localeCompare(`${right.tenantId}:${right.email}`)),
  )).digest("hex");
  if (APPLY && suppliedFingerprint !== safeTargetFingerprint) {
    throw new Error(`Apply requires ${FINGERPRINT_PREFIX}${safeTargetFingerprint}.`);
  }
  const centerSummary = new Map<string, {
    center: string;
    payers: number;
    linked: number;
    safe: number;
    blocked: number;
    missingEmail: number;
    topBlockers: Record<string, number>;
  }>();
  for (const payer of payerGuardians) {
    const center = payer.family.centerId ? centerById.get(payer.family.centerId) : null;
    const centerId = center?.id ?? "unassigned";
    const item = centerSummary.get(centerId) ?? {
      center: center?.crmLocationId ?? center?.name ?? "Unassigned",
      payers: 0,
      linked: 0,
      safe: 0,
      blocked: 0,
      missingEmail: 0,
      topBlockers: {},
    };
    item.payers += 1;
    if (hasActiveParentLink(payer)) {
      item.linked += 1;
    } else if (!validEmail(normalizedEmail(payer.email))) {
      item.blocked += 1;
      item.missingEmail += 1;
    } else {
      const tenantId = tenantIdByGuardianId.get(payer.id) ?? "";
      const group = safeGroupByKey.get(`${tenantId}\u0000${normalizedEmail(payer.email)}`) ?? [];
      if (group.some((candidate) => candidate.id === payer.id)) {
        item.safe += 1;
      } else {
        item.blocked += 1;
      }
    }
    centerSummary.set(centerId, item);
  }
  for (const [centerId, center] of centerSummary) {
    center.topBlockers = Object.fromEntries(
      [...(blockedReasonsByCenterId.get(centerId) ?? new Map()).entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4),
    );
  }
  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    payerGuardians: payerGuardians.length,
    alreadyLinkedPayers,
    missingEmailPayers,
    safeAccountGroups: safeGroups.length,
    safeUnlinkedPayerRecords: safeGroups.reduce((total, group) => total + group.length, 0),
    safeTargetFingerprint,
    blockedUnlinkedPayerRecords: payerGuardians.length
      - alreadyLinkedPayers
      - safeGroups.reduce((total, group) => total + group.length, 0),
    blockedReasons: Object.fromEntries([...blockedReasons.entries()].sort((left, right) => right[1] - left[1])),
    centers: [...centerSummary.values()]
      .filter((center) => center.payers > 0)
      .sort((left, right) => left.center.localeCompare(right.center)),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) return;

  let preparedAccountGroups = 0;
  let linkedPayerRecords = 0;
  const processedEmails = new Set<string>();
  const processedPayerIds: string[] = [];
  const failures: Record<string, number> = {};
  for (const group of safeGroups) {
    const payer = group[0];
    const tenantId = tenantIdByGuardianId.get(payer.id) ?? "";
    const centerId = payer.family.centerId;
    const email = normalizedEmail(payer.email);
    const existingUser = existingUserByEmail.get(email);
    try {
      const result = await ensureParentPortalLoginForGuardian({
        guardianId: payer.id,
        linkedBy: "system:payer-account-preparation",
        linkedReason: "payer_account_prepared_without_invite",
        prepareWithoutInvite: !existingUser || !existingAuthEmails.has(email),
      });
      if (!result.ok) {
        failures[result.reason] = (failures[result.reason] ?? 0) + 1;
        continue;
      }
      preparedAccountGroups += 1;
      linkedPayerRecords += group.length;
      processedEmails.add(email);
      processedPayerIds.push(...group.map((item) => item.id));
      await writeSystemAuditLog({
        tenantId,
        centerId,
        action: ACTION,
        resource: "Guardian",
        resourceId: payer.id,
        metadata: {
          familyId: payer.familyId,
          parentUserId: result.userId,
          linkedGuardianCount: result.linkedGuardianIds.length,
          payerRecordCount: group.length,
          created: result.created,
          reactivated: result.reactivated,
          credentialCreated: result.credentialCreated,
          existingParentAccountLinked: Boolean(existingUser),
          invitationSent: false,
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown_error";
      failures[reason] = (failures[reason] ?? 0) + 1;
    }
  }

  const [invitationAuditCount, invitationDeliveryCount, verifiedLinkedPayerRecords] = await Promise.all([
    prisma.auditLog.count({
      where: {
        createdAt: { gte: startedAt },
        action: { in: ["parent_portal.guardian_invited", "parent_portal.guide_sent"] },
      },
    }),
    prisma.integrationDelivery.count({
      where: {
        createdAt: { gte: startedAt },
        purpose: { in: ["parent_invitation_email", "parent_guide_email"] },
      },
    }),
    prisma.guardian.count({
      where: {
        id: { in: processedPayerIds },
        user: { role: UserRole.PARENT_GUARDIAN, isActive: true },
      },
    }),
  ]);
  const authEmails = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const email = normalizedEmail(user.email);
      if (processedEmails.has(email)) authEmails.add(email);
    }
    if (data.users.length < 1000) break;
  }
  console.log(JSON.stringify({
    applied: {
      preparedAccountGroups,
      linkedPayerRecords,
      failures,
      verifiedLinkedPayerRecords,
      verifiedAuthAccountGroups: authEmails.size,
      invitationAuditCount,
      invitationDeliveryCount,
    },
  }, null, 2));
  if (invitationAuditCount || invitationDeliveryCount) {
    throw new Error("Invitation activity was detected during account preparation.");
  }
  if (
    Object.keys(failures).length
    || verifiedLinkedPayerRecords !== linkedPayerRecords
    || authEmails.size !== preparedAccountGroups
  ) {
    throw new Error("One or more prepared payer accounts failed post-write verification.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
