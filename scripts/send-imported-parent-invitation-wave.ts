import "./load-env";
import { createHash } from "node:crypto";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
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
const WAIVE_DIRECTOR_FLAG = "--acknowledge-director-confirmation-waived";
const REPAIR_FLAG = "--repair-interrupted-preparation-flags";
const DEFAULT_BASE_URL = "https://thebeesuite.io";
const CORPORATE_ACTOR_EMAIL = "corpschools@kidcityusa.com";

type Args = {
  apply: boolean;
  confirmed: boolean;
  directorConfirmationWaived: boolean;
  repairInterruptedPreparation: boolean;
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
    directorConfirmationWaived: false,
    repairInterruptedPreparation: false,
  };
  for (const arg of argv) {
    if (arg === APPLY_FLAG) args.apply = true;
    else if (arg === CONFIRM_FLAG) args.confirmed = true;
    else if (arg === WAIVE_DIRECTOR_FLAG) args.directorConfirmationWaived = true;
    else if (arg === REPAIR_FLAG) args.repairInterruptedPreparation = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.apply && (!args.confirmed || !args.directorConfirmationWaived)) {
    throw new Error(`Production sending requires ${APPLY_FLAG} ${CONFIRM_FLAG} ${WAIVE_DIRECTOR_FLAG}.`);
  }
  return args;
}

async function loadTargetCenters() {
  const importedCenterIds = (await prisma.family.findMany({
    where: { sourceSystem: { equals: "procare", mode: "insensitive" }, centerId: { not: null } },
    select: { centerId: true },
    distinct: ["centerId"],
  })).flatMap((family) => family.centerId ? [family.centerId] : []);
  return prisma.center.findMany({
    where: {
      id: { in: importedCenterIds },
      status: "active",
      organization: { tenant: { slug: "kid-city-usa" } },
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

function hasActiveVerifiedChild(guardian: Pick<GuardianRecord, "family"> | MatchingGuardian) {
  return guardian.family.children.some((child) => (
    isActiveProcareEnrollmentStatus(child.enrollmentStatus)
    && clean(child.sourceSystem).toLowerCase() === "procare"
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

async function buildPlan() {
  const allCenters = await loadTargetCenters();
  const centers = allCenters.filter((center) => !isNonProductionCenter(center));
  if (!centers.length) throw new Error("No active imported Kid City centers were found.");
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const tenantIds = new Set(centers.map((center) => center.organization.tenantId));
  if (tenantIds.size !== 1) throw new Error("Imported Kid City centers resolved outside one tenant.");
  const tenantId = centers[0].organization.tenantId;
  const guardians = await loadGuardianRecords(centers.map((center) => center.id));
  const directRecords = guardians.filter(verifiedParentPayer);
  const candidateEmails = [...new Set(directRecords.map((guardian) => email(guardian.email)).filter(validEmail))];
  const [matchingGuardians, users, authUsers, deliveries] = await Promise.all([
    loadMatchingGuardians(candidateEmails),
    prisma.user.findMany({
      where: { email: { in: candidateEmails } },
      select: { id: true, email: true, tenantId: true, role: true, isActive: true, mustResetPassword: true },
    }),
    listAuthUsers(),
    prisma.integrationDelivery.findMany({
      where: { centerId: { in: centers.map((center) => center.id) }, purpose: "parent_invitation_email" },
      select: { centerId: true, status: true, payload: true },
    }),
  ]);
  const matchingByEmail = groupByKey(matchingGuardians, (guardian) => email(guardian.email));
  const userByEmail = new Map(users.map((user) => [email(user.email), user]));
  const deliveriesByEmail = new Map<string, typeof deliveries>();
  for (const delivery of deliveries) {
    for (const recipient of recipientsFromPayload(delivery.payload)) {
      deliveriesByEmail.set(recipient, [...(deliveriesByEmail.get(recipient) ?? []), delivery]);
    }
  }
  const groupedRecords = groupByKey(directRecords, (guardian) => {
    const normalized = email(guardian.email);
    return normalized && guardian.family.centerId
      ? `${guardian.family.centerId}\u0000${normalized}`
      : `${guardian.family.centerId ?? "unassigned"}\u0000invalid:${guardian.id}`;
  });

  const eligible: CandidateGroup[] = [];
  const interrupted: CandidateGroup[] = [];
  const groupResults: Array<{ centerId: string; emailValid: boolean; status: "eligible" | "interrupted" | "already_invited" | "blocked"; reasons: string[] }> = [];

  for (const group of groupedRecords.values()) {
    const preparedReference = group.find((guardian) => parentPortalFields(guardian.customFields).preparedWithoutInvite === true);
    const reference = preparedReference ?? group[0];
    const centerId = reference.family.centerId ?? "unassigned";
    const center = centerById.get(centerId);
    const normalizedEmail = email(reference.email);
    const reasons = new Set<string>();
    if (!center) reasons.add("center_not_active_or_targeted");
    if (!validEmail(normalizedEmail)) reasons.add("valid_email_required");
    for (const guardian of group) {
      if (clean(guardian.sourceSystem).toLowerCase() !== "procare" || !clean(guardian.externalId)) reasons.add("verified_guardian_source_id_required");
      if (clean(guardian.family.sourceSystem).toLowerCase() !== "procare" || !clean(guardian.family.externalId)) reasons.add("verified_family_source_id_required");
      if (!hasActiveVerifiedChild(guardian)) reasons.add("active_verified_child_required");
      if (!phoneReady(guardian.phone)) reasons.add("phone_with_four_digits_required");
      if (parentPortalAccessDisabled(guardian.customFields)) reasons.add("parent_portal_disabled");
    }

    const matches = matchingByEmail.get(normalizedEmail) ?? [];
    if (validEmail(normalizedEmail)) {
      if (!matches.length) reasons.add("matching_guardian_missing");
      if (matches.some((guardian) => guardian.family.centerId !== centerId)) reasons.add("cross_center_email");
      if (matches.some((guardian) => !identityCompatible(reference, guardian))) reasons.add("conflicting_guardian_identity");
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
    if (group.some((guardian) => guardian.userId && guardian.userId !== appUser?.id)) reasons.add("guardian_user_link_collision");

    const prior = deliveriesByEmail.get(normalizedEmail) ?? [];
    const invitationMarkedSent = group.some((guardian) => Boolean(parentPortalFields(guardian.customFields).invitationSentAt));
    if (invitationMarkedSent || prior.some((delivery) => ["accepted", "delivered", "pending"].includes(delivery.status))) reasons.add("already_invited");
    if (prior.some((delivery) => ["failed", "skipped"].includes(delivery.status))) reasons.add("prior_delivery_requires_manual_review");

    const preparedWithoutInvite = Boolean(preparedReference);
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
      scope: "All active Kid City locations with imported ProCare family data; director confirmation waived by explicit user authorization",
      targetLocations: schools.length,
      sendableNow: eligible.length,
      sendableAfterInterruptedRepair: interrupted.length,
      blockedUniqueProfiles: groupResults.filter((group) => group.status === "blocked").length,
      schools,
    },
  };
}

async function repairInterruptedPreparation(plan: Awaited<ReturnType<typeof buildPlan>>, actorUserId: string) {
  for (const candidate of plan.interrupted) {
    if (!candidate.appUserId) throw new Error("Interrupted preparation repair is missing an app user.");
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
        corporateActorUserId: actorUserId,
        invitationSent: false,
        directorConfirmationWaivedByUser: true,
      },
    });
  }
}

function deliveryDedupeKey(candidate: CandidateGroup) {
  const emailHash = createHash("sha256").update(candidate.email).digest("hex").slice(0, 24);
  return `parent-invite:imported-wave:20260803:${candidate.centerId}:${emailHash}`;
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
      corporateActorUserId: actorUserId,
      sourceEvidence: "verified_procare_guardian_or_payer_family_link",
      directorConfirmationWaivedByUser: true,
      billingCutoverApproved,
    },
  });
  if (!emailResult.ok) return { accepted: false, initialPasswordIssued };
  if (initialPasswordIssued) {
    const loginWorks = await verifySupabasePassword(candidate.email, DEFAULT_PARENT_INITIAL_PASSWORD);
    if (!loginWorks) throw new Error("critical_first_login_password_verification_failed");
  }
  return { accepted: true, initialPasswordIssued };
}

async function sendWave(plan: Awaited<ReturnType<typeof buildPlan>>, actorUserId: string) {
  const resultByCenter = new Map<string, { accepted: number; failed: number; initialPasswordVerified: number; existingAccountInvites: number }>();
  let consecutiveFailures = 0;
  for (const center of plan.centers) {
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

async function main() {
  const args = parseArgs();
  let plan = await buildPlan();
  console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", ...plan.summary }, null, 2));
  if (!args.apply) return;

  const corporateActor = await prisma.user.findUnique({
    where: { email: CORPORATE_ACTOR_EMAIL },
    select: { id: true, tenantId: true, isActive: true },
  });
  if (!corporateActor || !corporateActor.isActive || corporateActor.tenantId !== plan.tenantId) {
    throw new Error("The active Kid City corporate audit actor is unavailable.");
  }
  if (plan.interrupted.length) {
    if (!args.repairInterruptedPreparation) throw new Error(`${plan.interrupted.length} interrupted preparation records require ${REPAIR_FLAG}.`);
    await repairInterruptedPreparation(plan, corporateActor.id);
    plan = await buildPlan();
    if (plan.interrupted.length) throw new Error("Interrupted preparation repairs did not clear every safe candidate.");
    console.log(JSON.stringify({ mode: "post-repair", ...plan.summary }, null, 2));
  }
  if (!plan.eligible.length) throw new Error("No safe unsent imported parent invitations remain.");
  const result = await sendWave(plan, corporateActor.id);
  const postPlan = await buildPlan();
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
