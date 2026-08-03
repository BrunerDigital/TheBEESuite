import "./load-env";
import { createHash } from "node:crypto";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { evaluateProcareInvitationBatchReadiness } from "@/lib/parent-invitation-readiness";
import {
  buildParentLoginSetupUrl,
  buildParentPortalInvitationHtml,
  buildParentPortalInvitationText,
  DEFAULT_PARENT_INITIAL_PASSWORD,
  DIRECT_PARENT_PORTAL_INVITE_MODE,
} from "@/lib/parent-portal-invitations";
import {
  ensureParentPortalLoginForGuardian,
  parentPortalAccessDisabled,
  parentPortalInvitationSentFields,
} from "@/lib/parent-portal-logins";
import { isActiveProcareEnrollmentStatus } from "@/lib/procare-import-fields";
import { prisma } from "@/lib/prisma";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { getSupabaseAuthConfig, verifySupabasePassword } from "@/lib/supabase-auth";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-all-imported-locations";
const MISS_HONEYS_SCOPE_FLAG = "--scope-miss-honeys";
const CONFIRM_MISS_HONEYS_FLAG = "--confirm-miss-honeys-locations";
const WAIVE_DIRECTOR_FLAG = "--acknowledge-director-confirmation-waived";
const REPAIR_FLAG = "--repair-interrupted-preparation-flags";
const RETRY_UNCONFIGURED_PROVIDER_FLAG = "--retry-unconfigured-provider-skips";
const DEFAULT_BASE_URL = "https://thebeesuite.io";
const CORPORATE_ACTOR_EMAIL = "corpschools@kidcityusa.com";

type WaveScope = "kid_city" | "miss_honeys";

type Args = {
  apply: boolean;
  confirmed: boolean;
  confirmedScope: WaveScope | null;
  directorConfirmationWaived: boolean;
  repairInterruptedPreparation: boolean;
  retryUnconfiguredProviderSkips: boolean;
  scope: WaveScope;
};

type GuardianRecord = Awaited<ReturnType<typeof loadGuardianRecords>>[number];
type MatchingGuardian = Awaited<ReturnType<typeof loadMatchingGuardians>>[number];
type CenterRecord = Awaited<ReturnType<typeof loadTargetCenters>>[number];

type CandidateGroup = {
  centerId: string;
  email: string;
  guardianId: string;
  guardianIds: string[];
  familyId: string;
  appUserId: string | null;
  appUserExists: boolean;
  authUserExists: boolean;
  preparedWithoutInvite: boolean;
  retryUnconfiguredProviderSkip: boolean;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function email(value: unknown) {
  return clean(value).toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parentPortalFields(value: unknown) {
  return record(record(value).parentPortal);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function phoneReady(value: unknown) {
  return clean(value).replace(/\D/g, "").length >= 4;
}

function normalizedName(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isNonProductionCenter(center: Pick<CenterRecord, "name" | "crmLocationId">) {
  return `${center.name} ${center.crmLocationId ?? ""}`.toLowerCase().includes("demo");
}

function activeAuthUser(user: SupabaseUser | undefined) {
  return Boolean(
    user?.email_confirmed_at
    && (!user.banned_until || new Date(user.banned_until) <= new Date()),
  );
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const args: Args = {
    apply: false,
    confirmed: false,
    confirmedScope: null,
    directorConfirmationWaived: false,
    repairInterruptedPreparation: false,
    retryUnconfiguredProviderSkips: false,
    scope: "kid_city",
  };
  for (const arg of argv) {
    if (arg === APPLY_FLAG) args.apply = true;
    else if (arg === CONFIRM_FLAG) {
      args.confirmed = true;
      args.confirmedScope = "kid_city";
    }
    else if (arg === MISS_HONEYS_SCOPE_FLAG) args.scope = "miss_honeys";
    else if (arg === CONFIRM_MISS_HONEYS_FLAG) {
      args.confirmed = true;
      args.confirmedScope = "miss_honeys";
    }
    else if (arg === WAIVE_DIRECTOR_FLAG) args.directorConfirmationWaived = true;
    else if (arg === REPAIR_FLAG) args.repairInterruptedPreparation = true;
    else if (arg === RETRY_UNCONFIGURED_PROVIDER_FLAG) args.retryUnconfiguredProviderSkips = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.apply && (
    !args.confirmed
    || args.confirmedScope !== args.scope
    || !args.directorConfirmationWaived
  )) {
    const scopeConfirmFlag = args.scope === "miss_honeys" ? CONFIRM_MISS_HONEYS_FLAG : CONFIRM_FLAG;
    throw new Error(`Production sending requires ${APPLY_FLAG} ${scopeConfirmFlag} ${WAIVE_DIRECTOR_FLAG}.`);
  }
  return args;
}

async function loadTargetCenters(scope: WaveScope) {
  const importedCenterIds = (await prisma.family.findMany({
    where: { sourceSystem: { equals: "procare", mode: "insensitive" }, centerId: { not: null } },
    select: { centerId: true },
    distinct: ["centerId"],
  })).flatMap((family) => family.centerId ? [family.centerId] : []);
  return prisma.center.findMany({
    where: {
      id: { in: importedCenterIds },
      status: scope === "miss_honeys" ? { in: ["active", "trial_setup"] } : "active",
      organization: {
        tenant: { slug: scope === "miss_honeys" ? "miss-honeys-learning-center" : "kid-city-usa" },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      crmLocationId: true,
      customFields: true,
      organizationId: true,
      organization: {
        select: {
          tenantId: true,
          name: true,
          brand: { select: { name: true, slug: true } },
          tenant: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { crmLocationId: "asc" },
  });
}

async function loadGuardianRecords(centerIds: string[]) {
  return prisma.guardian.findMany({
    where: { family: { centerId: { in: centerIds } } },
    include: {
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
          pickups: { select: { sourceSystem: true, externalId: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

async function loadMatchingGuardians(candidateEmails: string[]) {
  return prisma.guardian.findMany({
    where: { email: { in: candidateEmails, mode: "insensitive" } },
    include: {
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
          pickups: { select: { sourceSystem: true, externalId: true } },
        },
      },
    },
  });
}

function exactAuthorizedPickup(guardian: Pick<GuardianRecord, "sourceSystem" | "externalId" | "family"> | MatchingGuardian) {
  const externalId = clean(guardian.externalId);
  if (clean(guardian.sourceSystem).toLowerCase() !== "procare" || !externalId) return false;
  return guardian.family.pickups.some((pickup) => (
    clean(pickup.sourceSystem).toLowerCase() === "procare"
    && clean(pickup.externalId) === externalId
  ));
}

function verifiedParentPayer(guardian: Pick<GuardianRecord, "isBillingContact" | "sourceSystem" | "externalId" | "family"> | MatchingGuardian) {
  return guardian.isBillingContact || exactAuthorizedPickup(guardian);
}

function hasOnlyActiveVerifiedChildren(guardian: Pick<GuardianRecord, "family"> | MatchingGuardian) {
  const activeChildren = guardian.family.children.filter((child) => (
    isActiveProcareEnrollmentStatus(child.enrollmentStatus)
  ));
  return activeChildren.length > 0 && activeChildren.every((child) => (
    clean(child.sourceSystem).toLowerCase() === "procare"
    && Boolean(clean(child.externalId))
  ));
}

function identityCompatible(reference: GuardianRecord, candidate: MatchingGuardian) {
  if (reference.id === candidate.id) return true;
  const referenceExternalId = clean(reference.externalId);
  const candidateExternalId = clean(candidate.externalId);
  if (referenceExternalId && candidateExternalId && referenceExternalId === candidateExternalId) return true;
  return normalizedName(reference.fullName) === normalizedName(candidate.fullName);
}

async function listAuthUsers() {
  const { url, key } = getSupabaseAuthConfig("service");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = new Map<string, SupabaseUser>();
  for (let page = 1; page <= 30; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const normalized = email(user.email);
      if (normalized) users.set(normalized, user);
    }
    if (data.users.length < 1000) break;
  }
  return users;
}

function recipientsFromPayload(payload: unknown) {
  const to = record(payload).to;
  return Array.isArray(to) ? to.map(email).filter(validEmail) : [];
}

function groupByKey<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

async function buildPlan({ retryUnconfiguredProviderSkips = false, scope = "kid_city" as WaveScope } = {}) {
  const allCenters = await loadTargetCenters(scope);
  const centers = allCenters.filter((center) => !isNonProductionCenter(center));
  if (!centers.length) throw new Error("No imported centers were found for the requested invitation scope.");
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const tenantIds = new Set(centers.map((center) => center.organization.tenantId));
  if (tenantIds.size !== 1) throw new Error("Imported centers resolved outside one tenant.");
  const tenantId = centers[0].organization.tenantId;
  const guardians = await loadGuardianRecords(centers.map((center) => center.id));
  const directRecords = guardians.filter(verifiedParentPayer);
  const scopedDirectRecords = directRecords;
  const familyIds = [...new Set(scopedDirectRecords.map((guardian) => guardian.familyId))];
  const candidateEmails = [...new Set(scopedDirectRecords.map((guardian) => email(guardian.email)).filter(validEmail))];
  const [matchingGuardians, users, authUsers, deliveries, importBatches] = await Promise.all([
    loadMatchingGuardians(candidateEmails),
    prisma.user.findMany({
      where: { email: { in: candidateEmails } },
      select: { id: true, email: true, tenantId: true, role: true, isActive: true, mustResetPassword: true },
    }),
    listAuthUsers(),
    prisma.integrationDelivery.findMany({
      where: { centerId: { in: centers.map((center) => center.id) }, purpose: "parent_invitation_email" },
      select: { centerId: true, status: true, payload: true, lastError: true },
    }),
    prisma.procareImportBatch.findMany({
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
    }),
  ]);
  const matchingByEmail = groupByKey(matchingGuardians, (guardian) => email(guardian.email));
  const userByEmail = new Map(users.map((user) => [email(user.email), user]));
  const latestBatchByFamilyId = new Map<string, (typeof importBatches)[number]>();
  for (const batch of importBatches) {
    for (const row of batch.rows) {
      if (row.createdFamilyId && !latestBatchByFamilyId.has(row.createdFamilyId)) {
        latestBatchByFamilyId.set(row.createdFamilyId, batch);
      }
    }
  }
  const deliveriesByEmail = new Map<string, typeof deliveries>();
  for (const delivery of deliveries) {
    for (const recipient of recipientsFromPayload(delivery.payload)) {
      deliveriesByEmail.set(recipient, [...(deliveriesByEmail.get(recipient) ?? []), delivery]);
    }
  }
  const groupedRecords = groupByKey(scopedDirectRecords, (guardian) => {
    const normalized = email(guardian.email);
    return normalized && guardian.family.centerId
      ? `${guardian.family.centerId}\u0000${normalized}`
      : `${guardian.family.centerId ?? "unassigned"}\u0000invalid:${guardian.id}`;
  });

  const eligible: CandidateGroup[] = [];
  const interrupted: CandidateGroup[] = [];
  const groupResults: Array<{ centerId: string; emailValid: boolean; status: "eligible" | "interrupted" | "already_invited" | "blocked"; reasons: string[] }> = [];

  for (const group of groupedRecords.values()) {
    const reference = group.find((guardian) => phoneReady(guardian.phone)) ?? group[0];
    const centerId = reference.family.centerId ?? "unassigned";
    const center = centerById.get(centerId);
    const normalizedEmail = email(reference.email);
    const reasons = new Set<string>();
    if (!center) reasons.add("center_not_active_or_targeted");
    if (!validEmail(normalizedEmail)) reasons.add("valid_email_required");
    for (const guardian of group) {
      if (clean(guardian.sourceSystem).toLowerCase() !== "procare" || !clean(guardian.externalId)) reasons.add("verified_guardian_source_id_required");
      if (clean(guardian.family.sourceSystem).toLowerCase() !== "procare" || !clean(guardian.family.externalId)) reasons.add("verified_family_source_id_required");
      if (!hasOnlyActiveVerifiedChildren(guardian)) reasons.add("all_active_children_verified_required");
      if (parentPortalAccessDisabled(guardian.customFields)) reasons.add("parent_portal_disabled");
    }
    if (!group.some((guardian) => phoneReady(guardian.phone))) reasons.add("phone_with_four_digits_required");
    for (const familyId of new Set(group.map((guardian) => guardian.familyId))) {
      const batch = latestBatchByFamilyId.get(familyId);
      const readiness = evaluateProcareInvitationBatchReadiness(
        batch ? { id: batch.id, status: batch.status, summary: batch.summary } : null,
      );
      if (!readiness.ok) reasons.add("reviewed_import_batch_required");
    }

    const matches = matchingByEmail.get(normalizedEmail) ?? [];
    if (validEmail(normalizedEmail)) {
      if (!matches.length) reasons.add("matching_guardian_missing");
      if (matches.some((guardian) => guardian.family.centerId !== centerId)) reasons.add("cross_center_email");
      if (scope !== "miss_honeys" && matches.some((guardian) => !identityCompatible(reference, guardian))) {
        reasons.add("conflicting_guardian_identity");
      }
      if (matches.some((guardian) => !verifiedParentPayer(guardian))) reasons.add("matching_guardian_outside_verified_parent_payer_scope");
      if (matches.some((guardian) => (
        clean(guardian.sourceSystem).toLowerCase() !== "procare"
        || !clean(guardian.externalId)
        || clean(guardian.family.sourceSystem).toLowerCase() !== "procare"
        || !clean(guardian.family.externalId)
      ))) reasons.add("matching_guardian_source_identity_unverified");
      if (matches.some((guardian) => parentPortalAccessDisabled(guardian.customFields))) reasons.add("matching_guardian_portal_disabled");
    }

    const appUser = userByEmail.get(normalizedEmail);
    const authUser = authUsers.get(normalizedEmail);
    if (appUser && appUser.tenantId !== tenantId) reasons.add("app_user_tenant_mismatch");
    if (appUser && appUser.role !== UserRole.PARENT_GUARDIAN) reasons.add("app_user_role_mismatch");
    if (appUser && !appUser.isActive) reasons.add("app_user_inactive");
    if (authUser && !activeAuthUser(authUser)) reasons.add("supabase_auth_user_inactive");
    if (authUser && !appUser) reasons.add("supabase_auth_orphan");
    if (matches.some((guardian) => guardian.userId && guardian.userId !== appUser?.id)) reasons.add("guardian_user_link_collision");

    const prior = deliveriesByEmail.get(normalizedEmail) ?? [];
    const unconfiguredProviderSkips = prior.filter((delivery) => (
      delivery.status === "skipped" && delivery.lastError === "SendGrid is not configured."
    ));
    const otherPriorFailures = prior.filter((delivery) => (
      delivery.status === "failed"
      || (delivery.status === "skipped" && delivery.lastError !== "SendGrid is not configured.")
    ));
    const sameCenterMatches = matches.filter((guardian) => guardian.family.centerId === centerId);
    const invitationMarkedSent = sameCenterMatches.some((guardian) => Boolean(parentPortalFields(guardian.customFields).invitationSentAt));
    if (invitationMarkedSent || prior.some((delivery) => ["accepted", "delivered", "pending"].includes(delivery.status))) reasons.add("already_invited");
    if (otherPriorFailures.length || (unconfiguredProviderSkips.length && !retryUnconfiguredProviderSkips)) {
      reasons.add("prior_delivery_requires_manual_review");
    }

    const preparedWithoutInvite = sameCenterMatches.some((guardian) => (
      parentPortalFields(guardian.customFields).preparedWithoutInvite === true
    ));
    if (preparedWithoutInvite && (!appUser || !appUser.mustResetPassword)) reasons.add("interrupted_preparation_flags");

    const candidate: CandidateGroup = {
      centerId,
      email: normalizedEmail,
      guardianId: reference.id,
      guardianIds: group.map((guardian) => guardian.id),
      familyId: reference.familyId,
      appUserId: appUser?.id ?? null,
      appUserExists: Boolean(appUser),
      authUserExists: Boolean(authUser),
      preparedWithoutInvite,
      retryUnconfiguredProviderSkip: unconfiguredProviderSkips.length > 0,
    };
    const reasonList = [...reasons].sort();
    if (!reasonList.length) {
      eligible.push(candidate);
      groupResults.push({ centerId, emailValid: true, status: "eligible", reasons: [] });
    } else if (reasonList.length === 1 && reasonList[0] === "interrupted_preparation_flags") {
      interrupted.push(candidate);
      groupResults.push({ centerId, emailValid: true, status: "interrupted", reasons: reasonList });
    } else if (reasonList.includes("already_invited")) {
      groupResults.push({ centerId, emailValid: validEmail(normalizedEmail), status: "already_invited", reasons: reasonList });
    } else {
      groupResults.push({ centerId, emailValid: validEmail(normalizedEmail), status: "blocked", reasons: reasonList });
    }
  }

  const schools = centers.map((center) => {
    const centerGroups = groupResults.filter((group) => group.centerId === center.id);
    const blockerCounts = new Map<string, number>();
    for (const group of centerGroups.filter((item) => item.status === "blocked")) {
      for (const reason of group.reasons) blockerCounts.set(reason, (blockerCounts.get(reason) ?? 0) + 1);
    }
    return {
      location: center.crmLocationId ?? center.name,
      centerId: center.id,
      importedParentPayerRecords: directRecords.filter((guardian) => guardian.family.centerId === center.id).length,
      validUniqueEmails: centerGroups.filter((group) => group.emailValid).length,
      alreadyInvited: centerGroups.filter((group) => group.status === "already_invited").length,
      alreadyInvitedOutsideCurrentReadiness: centerGroups.filter((group) => (
        group.status === "already_invited"
        && group.reasons.some((reason) => [
          "all_active_children_verified_required",
          "reviewed_import_batch_required",
        ].includes(reason))
      )).length,
      eligibleInvitations: centerGroups.filter((group) => group.status === "eligible").length,
      interruptedPreparationRepairs: centerGroups.filter((group) => group.status === "interrupted").length,
      blockedUniqueProfiles: centerGroups.filter((group) => group.status === "blocked").length,
      topBlockers: Object.fromEntries([...blockerCounts].sort((left, right) => right[1] - left[1]).slice(0, 6)),
    };
  });
  return {
    tenantId,
    centers,
    eligible,
    interrupted,
    summary: {
      scope: scope === "miss_honeys"
        ? "All Miss Honey's locations with imported ProCare family data; trial-setup invitation and director-confirmation gates explicitly authorized by the user"
        : "All active Kid City locations with imported ProCare family data; director confirmation waived by explicit user authorization",
      targetLocations: schools.length,
      sendableNow: eligible.length,
      sendableAfterInterruptedRepair: interrupted.length,
      blockedUniqueProfiles: groupResults.filter((group) => group.status === "blocked").length,
      alreadyInvitedOutsideCurrentReadiness: groupResults.filter((group) => (
        group.status === "already_invited"
        && group.reasons.some((reason) => [
          "all_active_children_verified_required",
          "reviewed_import_batch_required",
        ].includes(reason))
      )).length,
      schools,
    },
  };
}

async function repairInterruptedPreparation(
  plan: Awaited<ReturnType<typeof buildPlan>>,
  actorUserIdByCenter: Map<string, string>,
) {
  for (const candidate of plan.interrupted) {
    if (!candidate.appUserId) throw new Error("Interrupted preparation repair is missing an app user.");
    const actorUserId = actorUserIdByCenter.get(candidate.centerId);
    if (!actorUserId) throw new Error(`No authorized audit actor is available for center ${candidate.centerId}.`);
    await prisma.user.update({
      where: { id: candidate.appUserId },
      data: { mustResetPassword: true, sessionVersion: { increment: 1 } },
    });
    await writeSystemAuditLog({
      tenantId: plan.tenantId,
      centerId: candidate.centerId,
      action: "parent_portal.imported_preparation_flags_repaired",
      resource: "Guardian",
      resourceId: candidate.guardianId,
      metadata: {
        familyId: candidate.familyId,
        parentUserId: candidate.appUserId,
        authorizedActorUserId: actorUserId,
        invitationSent: false,
        directorConfirmationWaivedByUser: true,
      },
    });
  }
}

function deliveryDedupeKey(candidate: CandidateGroup) {
  const emailHash = createHash("sha256").update(candidate.email).digest("hex").slice(0, 24);
  const retrySuffix = candidate.retryUnconfiguredProviderSkip ? ":retry-unconfigured-provider" : "";
  return `parent-invite:imported-wave:20260803:${candidate.centerId}:${emailHash}${retrySuffix}`;
}

async function sendCandidate({ candidate, center, actorUserId }: { candidate: CandidateGroup; center: CenterRecord; actorUserId: string }) {
  const preparationRequired = !candidate.appUserExists || !candidate.authUserExists;
  if (preparationRequired) {
    const prepared = await ensureParentPortalLoginForGuardian({
      guardianId: candidate.guardianId,
      linkedBy: "system:all-imported-parent-invitation-wave",
      linkedReason: "verified_imported_parent_account_prepared_for_authorized_invite",
      prepareWithoutInvite: true,
    });
    if (!prepared.ok) throw new Error(`account_preparation_failed:${prepared.reason}`);
  }

  const initialPasswordIssued = candidate.preparedWithoutInvite || preparationRequired;
  const provisioned = await ensureParentPortalLoginForGuardian({
    guardianId: candidate.guardianId,
    linkedBy: "system:all-imported-parent-invitation-wave",
    linkedReason: "verified_imported_parent_invitation",
    resetToInitialPassword: initialPasswordIssued,
    inviteMode: DIRECT_PARENT_PORTAL_INVITE_MODE,
  });
  if (!provisioned.ok) throw new Error(`account_invitation_provision_failed:${provisioned.reason}`);

  const guardian = await prisma.guardian.findUnique({
    where: { id: candidate.guardianId },
    include: { family: { include: { children: { select: { sourceSystem: true } } } } },
  });
  if (!guardian) throw new Error("guardian_missing_after_provision");
  let kioskPinDefaultedFromPhone = false;
  if (!guardian.checkInPinHash) {
    const pinData = defaultGuardianPinUpdate({ guardianId: guardian.id, phone: guardian.phone, setById: actorUserId });
    if (!pinData) throw new Error("default_kiosk_pin_unavailable");
    await prisma.guardian.update({ where: { id: guardian.id }, data: pinData });
    kioskPinDefaultedFromPhone = true;
  }

  const branding = resolveWorkspaceBranding({
    tenantName: center.organization.tenant.name,
    tenantSlug: center.organization.tenant.slug,
    brandName: center.organization.brand?.name,
    brandSlug: center.organization.brand?.slug,
    organizationName: center.organization.name,
    email: center.email,
  });
  const centerLabel = center.crmLocationId ?? center.name;
  const transitioningFromProcare = clean(guardian.family.sourceSystem).toLowerCase() === "procare"
    || guardian.family.children.some((child) => clean(child.sourceSystem).toLowerCase() === "procare");
  const billingCutoverApproved = transitioningFromProcare && stripeSchoolBillingApproval({
    customFields: center.customFields,
    centerName: center.name,
  }).approved;
  const loginUrl = buildParentLoginSetupUrl(DEFAULT_BASE_URL);
  const text = buildParentPortalInvitationText({
    guardianName: guardian.fullName,
    centerLabel,
    email: candidate.email,
    loginUrl,
    initialPasswordIssued,
    transitioningFromProcare,
    billingCutoverApproved,
  });
  const html = buildParentPortalInvitationHtml({
    guardianName: guardian.fullName,
    centerLabel,
    email: candidate.email,
    loginUrl,
    initialPasswordIssued,
    transitioningFromProcare,
    billingCutoverApproved,
    branding,
  });
  const subject = `${centerLabel}: your BEE Suite Parent Portal is ready`;
  const emailResult = await sendEmail({
    to: [candidate.email],
    subject,
    text,
    html,
    fromName: branding.name,
    disableClickTracking: true,
    categories: ["parent_invitation_email"],
    customArgs: { guardianId: guardian.id, familyId: guardian.familyId, centerId: center.id, authorizedImportedWave: true },
    tenantId: center.organization.tenantId,
  });
  await recordEmailDeliveryAttempt({
    tenantId: center.organization.tenantId,
    centerId: center.id,
    dedupeKey: deliveryDedupeKey(candidate),
    purpose: "parent_invitation_email",
    to: [candidate.email],
    subject,
    text,
    html,
    fromName: branding.name,
    result: emailResult,
    metadata: {
      guardianId: guardian.id,
      familyId: guardian.familyId,
      brand: branding.kind,
      authorizedImportedWave: true,
      directorConfirmationWaivedByUser: true,
      retryUnconfiguredProviderSkip: candidate.retryUnconfiguredProviderSkip,
    },
  });

  if (emailResult.ok) {
    const linkedGuardians = await prisma.guardian.findMany({
      where: { id: { in: provisioned.linkedGuardianIds } },
      select: { id: true, customFields: true },
    });
    await prisma.$transaction(linkedGuardians.map((item) => prisma.guardian.update({
      where: { id: item.id },
      data: { customFields: parentPortalInvitationSentFields(item.customFields) },
    })));
  }
  await writeSystemAuditLog({
    tenantId: center.organization.tenantId,
    centerId: center.id,
    action: "parent_portal.guardian_invited",
    resource: "Guardian",
    resourceId: guardian.id,
    metadata: {
      familyId: guardian.familyId,
      parentUserId: provisioned.userId,
      email: candidate.email,
      authMode: DIRECT_PARENT_PORTAL_INVITE_MODE,
      initialPasswordIssued,
      preparationRequired,
      kioskPinDefaultedFromPhone,
      emailBrand: branding.kind,
      emailAcceptedByProvider: emailResult.ok,
      authorizedActorUserId: actorUserId,
      sourceEvidence: "verified_procare_guardian_or_payer_family_link",
      directorConfirmationWaivedByUser: true,
      billingCutoverApproved,
      retryUnconfiguredProviderSkip: candidate.retryUnconfiguredProviderSkip,
    },
  });
  if (!emailResult.ok) return { accepted: false, initialPasswordIssued };
  if (initialPasswordIssued) {
    const loginWorks = await verifySupabasePassword(candidate.email, DEFAULT_PARENT_INITIAL_PASSWORD);
    if (!loginWorks) throw new Error("critical_first_login_password_verification_failed");
  }
  return { accepted: true, initialPasswordIssued };
}

async function sendWave(
  plan: Awaited<ReturnType<typeof buildPlan>>,
  actorUserIdByCenter: Map<string, string>,
) {
  const resultByCenter = new Map<string, { accepted: number; failed: number; initialPasswordVerified: number; existingAccountInvites: number }>();
  let consecutiveFailures = 0;
  for (const center of plan.centers) {
    const actorUserId = actorUserIdByCenter.get(center.id);
    if (!actorUserId) throw new Error(`No authorized audit actor is available for center ${center.id}.`);
    const candidates = plan.eligible.filter((candidate) => candidate.centerId === center.id);
    const result = { accepted: 0, failed: 0, initialPasswordVerified: 0, existingAccountInvites: 0 };
    resultByCenter.set(center.id, result);
    for (const candidate of candidates) {
      try {
        const sent = await sendCandidate({ candidate, center, actorUserId });
        if (sent.accepted) {
          result.accepted += 1;
          if (sent.initialPasswordIssued) result.initialPasswordVerified += 1;
          else result.existingAccountInvites += 1;
          consecutiveFailures = 0;
        } else {
          result.failed += 1;
          consecutiveFailures += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (message.startsWith("critical_")) throw error;
        result.failed += 1;
        consecutiveFailures += 1;
      }
      if (consecutiveFailures >= 3) throw new Error("Critical stop: three consecutive invitation failures.");
    }
    console.log(JSON.stringify({
      progress: { location: center.crmLocationId ?? center.name, planned: candidates.length, ...result },
    }));
  }
  const locations = plan.centers.map((center) => ({
    location: center.crmLocationId ?? center.name,
    ...(resultByCenter.get(center.id) ?? { accepted: 0, failed: 0, initialPasswordVerified: 0, existingAccountInvites: 0 }),
  }));
  return {
    locations,
    totals: {
      accepted: locations.reduce((sum, item) => sum + item.accepted, 0),
      failed: locations.reduce((sum, item) => sum + item.failed, 0),
      initialPasswordVerified: locations.reduce((sum, item) => sum + item.initialPasswordVerified, 0),
      existingAccountInvites: locations.reduce((sum, item) => sum + item.existingAccountInvites, 0),
    },
  };
}

async function loadActorUserIds(plan: Awaited<ReturnType<typeof buildPlan>>, scope: WaveScope) {
  if (scope === "kid_city") {
    const corporateActor = await prisma.user.findUnique({
      where: { email: CORPORATE_ACTOR_EMAIL },
      select: { id: true, tenantId: true, isActive: true },
    });
    if (!corporateActor || !corporateActor.isActive || corporateActor.tenantId !== plan.tenantId) {
      throw new Error("The active Kid City corporate audit actor is unavailable.");
    }
    return new Map(plan.centers.map((center) => [center.id, corporateActor.id]));
  }

  const grants = await prisma.userAccessGrant.findMany({
    where: {
      centerId: { in: plan.centers.map((center) => center.id) },
      scopeType: "CENTER",
      role: UserRole.CENTER_DIRECTOR,
      user: { isActive: true, tenantId: plan.tenantId },
    },
    select: { centerId: true, userId: true },
  });
  const actorUserIdByCenter = new Map<string, string>();
  for (const center of plan.centers) {
    const matches = grants.filter((grant) => grant.centerId === center.id);
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one active center-director audit actor for ${center.crmLocationId ?? center.name}.`);
    }
    actorUserIdByCenter.set(center.id, matches[0].userId);
  }
  return actorUserIdByCenter;
}

async function main() {
  const args = parseArgs();
  const planOptions = {
    retryUnconfiguredProviderSkips: args.retryUnconfiguredProviderSkips,
    scope: args.scope,
  };
  let plan = await buildPlan(planOptions);
  console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", ...plan.summary }, null, 2));
  if (!args.apply) return;
  if (plan.summary.alreadyInvitedOutsideCurrentReadiness) {
    throw new Error("Previously invited imported parent profiles require manual readiness review before another live wave.");
  }

  const platformSendGridConfigured = Boolean(
    clean(process.env.SENDGRID_API_KEY).length > 10
    && validEmail(clean(process.env.SENDGRID_FROM_EMAIL)),
  );
  if (!platformSendGridConfigured) {
    throw new Error("Live sending requires a configured platform SendGrid key and sender address.");
  }

  const actorUserIdByCenter = await loadActorUserIds(plan, args.scope);
  if (plan.interrupted.length) {
    if (!args.repairInterruptedPreparation) throw new Error(`${plan.interrupted.length} interrupted preparation records require ${REPAIR_FLAG}.`);
    await repairInterruptedPreparation(plan, actorUserIdByCenter);
    plan = await buildPlan(planOptions);
    if (plan.interrupted.length) throw new Error("Interrupted preparation repairs did not clear every safe candidate.");
    console.log(JSON.stringify({ mode: "post-repair", ...plan.summary }, null, 2));
  }
  if (!plan.eligible.length) throw new Error("No safe unsent imported parent invitations remain.");
  const result = await sendWave(plan, actorUserIdByCenter);
  const postPlan = await buildPlan(planOptions);
  console.log(JSON.stringify({
    mode: "apply-result",
    ...result,
    remainingSendableNow: postPlan.eligible.length,
    remainingInterruptedPreparation: postPlan.interrupted.length,
  }, null, 2));
  if (result.totals.failed || postPlan.eligible.length || postPlan.interrupted.length) {
    throw new Error("The imported parent invitation wave did not complete cleanly.");
  }
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
