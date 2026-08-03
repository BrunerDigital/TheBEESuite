import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { evaluateParentInvitationReadiness } from "@/lib/parent-invitation-readiness";
import {
  kidCityCorporateRolloutSchools,
  normalizeRolloutEmail,
  rolloutSchoolEmailCandidates,
} from "@/lib/kidcity-corporate-rollout";
import { DEFAULT_PARENT_INITIAL_PASSWORD } from "@/lib/parent-portal-invitations";
import { parentPortalAccessDisabled } from "@/lib/parent-portal-logins";
import { isActiveProcareEnrollmentStatus } from "@/lib/procare-import-fields";
import { prisma } from "@/lib/prisma";
import { getSupabaseAuthConfig, verifySupabasePassword } from "@/lib/supabase-auth";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-production-send";
const DEFAULT_BASE_URL = "https://thebeesuite.io";
const TARGET_LOCATIONS = ["Beach Blvd", "Oakleaf", "Canton NC"] as const;
const DELIVERY_WAIT_MS = 60_000;

type Args = {
  apply: boolean;
  confirmed: boolean;
  baseUrl: string;
};

type CandidateGuardian = Awaited<ReturnType<typeof loadCandidateGuardians>>[number];

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

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parentPortalFields(value: unknown) {
  return record(record(value).parentPortal);
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const result: Args = {
    apply: false,
    confirmed: false,
    baseUrl: DEFAULT_BASE_URL,
  };
  for (const arg of argv) {
    if (arg === APPLY_FLAG) result.apply = true;
    else if (arg === CONFIRM_FLAG) result.confirmed = true;
    else if (arg.startsWith("--base-url=")) result.baseUrl = arg.slice("--base-url=".length).replace(/\/+$/, "");
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (result.apply && !result.confirmed) {
    throw new Error(`Production sending requires ${APPLY_FLAG} ${CONFIRM_FLAG}.`);
  }
  if (result.apply && result.baseUrl !== DEFAULT_BASE_URL) {
    throw new Error(`Production sending is locked to ${DEFAULT_BASE_URL}.`);
  }
  return result;
}

async function resolveTargetCenters() {
  const centers = await prisma.center.findMany({
    where: {
      status: "active",
      organization: { tenant: { slug: "kid-city-usa" } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      crmLocationId: true,
      organization: { select: { tenantId: true } },
    },
  });
  const resolved = TARGET_LOCATIONS.map((location) => {
    const rolloutMatches = kidCityCorporateRolloutSchools.filter((school) => school.location === location);
    if (rolloutMatches.length !== 1) {
      throw new Error(`Target corporate rollout mapping is not unique: ${location}.`);
    }
    const expectedEmails = new Set(rolloutSchoolEmailCandidates(rolloutMatches[0]));
    const centerMatches = centers.filter((center) => expectedEmails.has(normalizeRolloutEmail(center.email)));
    if (centerMatches.length !== 1) {
      throw new Error(`Target corporate school must resolve to exactly one active center: ${location}.`);
    }
    return { location, center: centerMatches[0] };
  });
  if (new Set(resolved.map((item) => item.center.id)).size !== resolved.length) {
    throw new Error("Target corporate schools resolved to duplicate center records.");
  }
  if (new Set(resolved.map((item) => item.center.organization.tenantId)).size !== 1) {
    throw new Error("Target corporate schools do not belong to one Kid City tenant.");
  }
  return resolved;
}

async function loadCandidateGuardians(centerIds: string[]) {
  return prisma.guardian.findMany({
    where: {
      isBillingContact: true,
      family: { centerId: { in: centerIds } },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          tenantId: true,
          role: true,
          isActive: true,
          mustResetPassword: true,
        },
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
        },
      },
    },
    orderBy: [{ family: { centerId: "asc" } }, { id: "asc" }],
  });
}

function guardianIdentity(guardian: Pick<CandidateGuardian, "id" | "familyId" | "fullName" | "email" | "phone" | "sourceSystem" | "externalId">) {
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

async function loadAuthEmails() {
  const { url, key } = getSupabaseAuthConfig("service");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const normalized = email(user.email);
      if (normalized) result.add(normalized);
    }
    if (data.users.length < 1000) break;
  }
  return result;
}

async function buildPlan() {
  const targets = await resolveTargetCenters();
  const centerIds = targets.map((item) => item.center.id);
  const tenantId = targets[0].center.organization.tenantId;
  const tenantCenterIds = (await prisma.center.findMany({
    where: { organization: { tenantId } },
    select: { id: true },
  })).map((center) => center.id);
  const guardians = await loadCandidateGuardians(centerIds);
  const familyIds = [...new Set(guardians.map((guardian) => guardian.familyId))];
  const candidateEmails = [...new Set(guardians.map((guardian) => email(guardian.email)).filter(validEmail))];

  const [matchingGuardians, importBatches, deliveries, authEmails] = await Promise.all([
    prisma.guardian.findMany({
      where: {
        email: { in: candidateEmails, mode: "insensitive" },
        family: { centerId: { in: tenantCenterIds } },
      },
      select: {
        id: true,
        familyId: true,
        fullName: true,
        email: true,
        phone: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        family: { select: { centerId: true } },
      },
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
    prisma.integrationDelivery.findMany({
      where: { centerId: { in: centerIds }, purpose: "parent_invitation_email" },
      select: { status: true, payload: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    loadAuthEmails(),
  ]);

  const matchingByEmail = Map.groupBy(matchingGuardians, (guardian) => email(guardian.email));
  const latestBatchByFamilyId = new Map<string, (typeof importBatches)[number]>();
  for (const batch of importBatches) {
    for (const row of batch.rows) {
      if (row.createdFamilyId && !latestBatchByFamilyId.has(row.createdFamilyId)) {
        latestBatchByFamilyId.set(row.createdFamilyId, batch);
      }
    }
  }
  const deliveryByEmail = new Map<string, (typeof deliveries)[number][]>();
  for (const delivery of deliveries) {
    const payload = record(delivery.payload);
    const recipients = Array.isArray(payload.to) ? payload.to.map(email).filter(validEmail) : [];
    for (const recipient of recipients) {
      deliveryByEmail.set(recipient, [...(deliveryByEmail.get(recipient) ?? []), delivery]);
    }
  }

  const blockers = new Map<string, number>();
  const blockedByCenter = new Map<string, number>();
  const eligibleByEmail = new Map<string, CandidateGuardian[]>();
  const addBlocker = (reason: string) => {
    blockers.set(reason, (blockers.get(reason) ?? 0) + 1);
  };

  for (const guardian of guardians) {
    const centerId = guardian.family.centerId ?? "unassigned";
    const normalizedEmail = email(guardian.email);
    const portal = parentPortalFields(guardian.customFields);
    const matches = matchingByEmail.get(normalizedEmail) ?? [];
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
      matchingEmailGuardians: matches.map(guardianIdentity),
      relevantImportBatch: batch ? { id: batch.id, status: batch.status, summary: batch.summary } : null,
    });
    const prior = deliveryByEmail.get(normalizedEmail) ?? [];
    const reasons = [
      ...readiness.blockers,
      ...(!guardian.family.children.some((child) => isActiveProcareEnrollmentStatus(child.enrollmentStatus)) ? ["no_active_enrollment"] : []),
      ...(!validEmail(normalizedEmail) ? ["invalid_email"] : []),
      ...(parentPortalAccessDisabled(guardian.customFields) ? ["portal_disabled"] : []),
      ...(portal.preparedWithoutInvite === true ? [] : [portal.invitationSentAt ? "already_invited" : "not_prepared_for_invite"]),
      ...(guardian.userId && guardian.user?.id === guardian.userId ? [] : ["app_user_link_missing"]),
      ...(guardian.user?.role === UserRole.PARENT_GUARDIAN ? [] : ["app_user_role_invalid"]),
      ...(guardian.user?.isActive ? [] : ["app_user_inactive"]),
      ...(guardian.user?.tenantId === tenantId ? [] : ["app_user_tenant_mismatch"]),
      ...(email(guardian.user?.email) === normalizedEmail ? [] : ["app_user_email_mismatch"]),
      ...(guardian.user?.mustResetPassword ? [] : ["prepared_password_reset_flag_missing"]),
      ...(authEmails.has(normalizedEmail) ? [] : ["supabase_auth_user_missing"]),
      ...(matches.every((item) => item.family.centerId === guardian.family.centerId) ? [] : ["cross_center_email"]),
      ...(matches.every((item) => !parentPortalAccessDisabled(item.customFields)) ? [] : ["matching_guardian_portal_disabled"]),
      ...(prior.some((item) => item.status === "accepted" || item.status === "delivered") ? ["already_sent_by_delivery_record"] : []),
      ...(prior.some((item) => item.status === "pending") ? ["prior_delivery_pending_retry"] : []),
      ...(prior.some((item) => item.status === "failed" || item.status === "skipped") ? ["prior_delivery_failed_or_skipped"] : []),
    ];
    const uniqueReasons = [...new Set(reasons)];
    if (uniqueReasons.length) {
      blockedByCenter.set(centerId, (blockedByCenter.get(centerId) ?? 0) + 1);
      for (const reason of uniqueReasons) addBlocker(reason);
      continue;
    }
    eligibleByEmail.set(normalizedEmail, [...(eligibleByEmail.get(normalizedEmail) ?? []), guardian]);
  }

  const candidates = [...eligibleByEmail.values()].map((group) => group[0]);
  const schoolPlan = targets.map(({ location, center }) => ({
    location,
    centerId: center.id,
    payerRecords: guardians.filter((guardian) => guardian.family.centerId === center.id).length,
    uniqueInvitations: candidates.filter((guardian) => guardian.family.centerId === center.id).length,
    blockedPayerRecords: blockedByCenter.get(center.id) ?? 0,
  }));
  return {
    tenantId,
    targets,
    candidates,
    summary: {
      scope: "Kid City corporate payer accounts; Kokomo excluded",
      subjectPattern: "<school>: welcome to The BEE Suite parent app",
      targetSchools: schoolPlan,
      uniqueInvitations: candidates.length,
      blockedReasons: Object.fromEntries([...blockers].sort((left, right) => right[1] - left[1])),
    },
  };
}

function cookieHeader(headers: Headers) {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") ?? ""];
  return values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function authenticateOperator(baseUrl: string, operatorEmail: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "BEE-Suite-parent-invitation-wave/1.0" },
    body: JSON.stringify({ email: operatorEmail, password: DEFAULT_PARENT_INITIAL_PASSWORD, loginPortal: "staff" }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  const cookie = cookieHeader(response.headers);
  if (!response.ok || body.ok !== true || !cookie) {
    throw new Error(`School operator login failed with HTTP ${response.status}.`);
  }
  const role = clean(record(body.user).role);
  const invitationRoles = new Set<UserRole>([
    UserRole.CENTER_DIRECTOR,
    UserRole.ASSISTANT_DIRECTOR,
    UserRole.BRAND_ADMIN,
    UserRole.REGIONAL_MANAGER,
    UserRole.PLATFORM_OWNER,
  ]);
  if (!invitationRoles.has(role as UserRole)) {
    throw new Error(`School operator role ${role || "unknown"} cannot send parent invitations.`);
  }
  return cookie;
}

async function deliverySummary(since: Date, centerIds: string[]) {
  const rows = await prisma.integrationDelivery.findMany({
    where: {
      createdAt: { gte: since },
      centerId: { in: centerIds },
      purpose: "parent_invitation_email",
    },
    select: { status: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return { total: rows.length, statuses: Object.fromEntries([...counts].sort()) };
}

async function sendWave(args: Args, plan: Awaited<ReturnType<typeof buildPlan>>) {
  const startedAt = new Date();
  const cookiesByCenterId = new Map<string, string>();
  for (const target of plan.targets) {
    const operatorEmail = email(target.center.email);
    if (!validEmail(operatorEmail)) throw new Error(`${target.location} does not have a valid school login email.`);
    cookiesByCenterId.set(target.center.id, await authenticateOperator(args.baseUrl, operatorEmail));
  }
  const results = {
    accepted: 0,
    busyBeesVerified: 0,
    deferred: 0,
    failures: {} as Record<string, number>,
  };
  let consecutiveSystemFailures = 0;

  for (const guardian of plan.candidates) {
    const centerId = guardian.family.centerId ?? "";
    const cookie = cookiesByCenterId.get(centerId);
    if (!cookie) throw new Error("A candidate was not mapped to an authenticated school operator.");
    const response = await fetch(`${args.baseUrl}/api/parent/invitations`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "User-Agent": "BEE-Suite-parent-invitation-wave/1.0",
      },
      body: JSON.stringify({ guardianId: guardian.id, messageType: "invitation" }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.ok && body.ok === true) {
      results.accepted += 1;
      consecutiveSystemFailures = 0;
      const loginWorks = await verifySupabasePassword(email(guardian.email), DEFAULT_PARENT_INITIAL_PASSWORD);
      if (!loginWorks) {
        throw new Error(`Critical stop: BusyBees verification failed immediately after accepted invite ${results.accepted}.`);
      }
      results.busyBeesVerified += 1;
      continue;
    }

    const reason = response.status === 409 ? "readiness_changed" : `http_${response.status}`;
    results.failures[reason] = (results.failures[reason] ?? 0) + 1;
    if (response.status === 409) {
      results.deferred += 1;
      continue;
    }
    consecutiveSystemFailures += 1;
    if ([401, 403, 429].includes(response.status) || consecutiveSystemFailures >= 3) {
      throw new Error(`Critical stop: invitation API failed with HTTP ${response.status}.`);
    }
  }

  const centerIds = plan.targets.map((item) => item.center.id);
  const deadline = Date.now() + DELIVERY_WAIT_MS;
  let deliveries = await deliverySummary(startedAt, centerIds);
  while (deliveries.total < results.accepted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    deliveries = await deliverySummary(startedAt, centerIds);
  }
  const [auditCount, remainingPrepared] = await Promise.all([
    prisma.auditLog.count({
      where: {
        createdAt: { gte: startedAt },
        action: "parent_portal.guardian_invited",
        resourceId: { in: plan.candidates.map((guardian) => guardian.id) },
      },
    }),
    prisma.guardian.count({
      where: {
        id: { in: plan.candidates.map((guardian) => guardian.id) },
        customFields: { path: ["parentPortal", "preparedWithoutInvite"], equals: true },
      },
    }),
  ]);
  return { ...results, auditCount, remainingPrepared, deliveries };
}

async function main() {
  const args = parseArgs();
  const plan = await buildPlan();
  console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", ...plan.summary }, null, 2));
  if (!args.apply) return;
  if (!plan.candidates.length) throw new Error("No safe, unsent corporate payer invitations remain.");
  const result = await sendWave(args, plan);
  console.log(JSON.stringify({ mode: "apply-result", ...result }, null, 2));
  if (result.accepted !== plan.candidates.length - result.deferred) {
    throw new Error("The production wave did not accept every non-deferred invitation.");
  }
  if (result.busyBeesVerified !== result.accepted || result.auditCount !== result.accepted || result.remainingPrepared !== 0) {
    throw new Error("Post-send account or audit verification failed.");
  }
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
