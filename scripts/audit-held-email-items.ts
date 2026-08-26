import "./load-env";

import { createClient, type User as SupabaseAuthUser } from "@supabase/supabase-js";
import { PaymentStatus, UserRole } from "@prisma/client";
import { readCenterLocationTimeZone } from "@/lib/attendance-state";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import {
  getStripeSecretKey,
  readStripeConnectedAccountId,
  retrieveStripePaymentMethod,
} from "@/lib/integrations";
import { paymentMethodManagementSummary } from "@/lib/payment-method-management";
import { prisma } from "@/lib/prisma";
import { readStaffClockState } from "@/lib/staff-kiosk";
import {
  maskStripeAccountId,
  stripeConnectSavedMethodNeedsReauthorization,
} from "@/lib/stripe-connect-migration";

const EXPECTED_SUPABASE_REF = "nqjrlktoewiueiwrubas";
const HOLLY_CASH_REFERENCES = [
  ["Ash", ["2026-08-17"]],
  ["Atanga", ["2026-08-13", "2026-08-17"]],
  ["Baker", ["2026-08-06", "2026-08-13"]],
  ["Bergeron", ["2026-08-06", "2026-08-13"]],
  ["Burkett", ["2026-08-06", "2026-08-13"]],
  ["Dorqueta Wright", ["2026-08-06", "2026-08-13"]],
  ["Franklin", ["2026-08-16"]],
  ["Hale", ["2026-08-06", "2026-08-13"]],
  ["Hayward", ["2026-08-06", "2026-08-13"]],
  ["Douglas", ["2026-08-13"]],
  ["Jazmine Horn", ["2026-08-16"]],
  ["Johnson", ["2026-08-16"]],
  ["K-Smith", ["2026-08-16"]],
  ["Kessen", ["2026-08-06", "2026-08-13"]],
  ["Kicklighter", ["2026-08-06", "2026-08-13"]],
  ["Lagdameo", ["2026-08-06", "2026-08-13"]],
  ["Layla Soloman", ["2026-08-06", "2026-08-13"]],
  ["Lloyd", ["2026-08-06", "2026-08-13"]],
  ["Manuel", ["2026-08-06", "2026-08-13"]],
  ["Martin", ["2026-08-06", "2026-08-13"]],
  ["Morales", ["2026-08-06", "2026-08-13"]],
  ["Mulero", ["2026-08-06", "2026-08-13"]],
  ["Nadeja Jenkins", ["2026-08-13"]],
  ["Nina Horn", ["2026-08-13"]],
  ["Patrice Maxwell", ["2026-08-06", "2026-08-13"]],
  ["Sealy", ["2026-08-06", "2026-08-13"]],
  ["Stoltenborg", ["2026-08-06", "2026-08-13"]],
  ["Sweeney", ["2026-08-13"]],
  ["Thompson", ["2026-08-06", "2026-08-13"]],
  ["Vorous", ["2026-08-06"]],
  ["Warren", ["2026-08-18"]],
  ["Wiley", ["2026-08-06", "2026-08-13"]],
  ["Will", ["2026-08-06", "2026-08-13"]],
  ["Word", ["2026-08-16"]],
  ["Wright", ["2026-08-06", "2026-08-13"]],
  ["Zettlemoyer", ["2026-08-06", "2026-08-13"]],
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function maskId(value: string | null | undefined) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return `${cleaned.slice(0, 7)}...${cleaned.slice(-4)}`;
}

function dateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function localTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

async function listAllSupabaseUsers() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase admin configuration is missing.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== `${EXPECTED_SUPABASE_REF}.supabase.co`) {
    throw new Error("Refusing to audit an unexpected Supabase project.");
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const users: SupabaseAuthUser[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new Error("Supabase Auth inventory exceeded 100,000 users; refusing a partial audit.");
}

async function findCenter(name: string) {
  const center = await prisma.center.findFirst({
    where: { name: { contains: name, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      timezone: true,
      city: true,
      state: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  if (!center) throw new Error(`Center not found: ${name}`);
  return center;
}

async function auditCentennial() {
  const center = await findCenter("Centennial");
  const families = await prisma.family.findMany({
    where: {
      centerId: center.id,
      OR: [
        { name: { contains: "Kendall", mode: "insensitive" } },
        { name: { contains: "Brehm", mode: "insensitive" } },
        { guardians: { some: { fullName: { contains: "Kendall", mode: "insensitive" } } } },
        { guardians: { some: { fullName: { contains: "Brehm", mode: "insensitive" } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      sourceSystem: true,
      externalId: true,
      children: { select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true, sourceSystem: true, externalId: true } },
      guardians: { select: { fullName: true, email: true, userId: true } },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          autopayPlaceholder: true,
          customFields: true,
          invoices: {
            where: { dueDate: { gte: new Date("2026-08-01T00:00:00Z"), lte: new Date("2026-08-31T23:59:59Z") } },
            orderBy: { dueDate: "asc" },
            select: {
              id: true,
              number: true,
              status: true,
              dueDate: true,
              totalCents: true,
              createdAt: true,
              sourceSystem: true,
              externalId: true,
              customFields: true,
              items: { select: { id: true, description: true, amountCents: true } },
              ledgerEntries: { select: { id: true, type: true, amountCents: true, balanceAfterCents: true, paymentId: true, sourceSystem: true, externalId: true } },
            },
          },
          payments: {
            where: { OR: [{ paidAt: { gte: new Date("2026-08-01T00:00:00Z") } }, { status: { in: [PaymentStatus.DRAFT, PaymentStatus.OPEN, PaymentStatus.FAILED] } }] },
            orderBy: { paidAt: "asc" },
            select: { amountCents: true, status: true, provider: true, paidAt: true, externalIdPlaceholder: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const activeAccountId = readStripeConnectedAccountId(center.customFields);
  const stripeConfigured = Boolean(await getStripeSecretKey({ tenantId: center.organization.tenantId }));
  const rows = [];
  for (const family of families) {
    const account = family.billingAccount;
    const fields = record(account?.customFields);
    const summary = paymentMethodManagementSummary({ autopayPlaceholder: account?.autopayPlaceholder, customFields: fields });
    const savedAccountId = clean(fields.stripeDefaultPaymentMethodConnectedAccountId) || null;
    const paymentMethodId = summary.stripeDefaultPaymentMethodId;
    const needsReauthorization = stripeConnectSavedMethodNeedsReauthorization({
      activeAccountId,
      savedMethodAccountId: savedAccountId,
      centerCustomFields: center.customFields,
    });
    const sourceMethod = paymentMethodId && savedAccountId
      ? await retrieveStripePaymentMethod(paymentMethodId, { tenantId: center.organization.tenantId, connectedAccountId: savedAccountId })
      : null;
    const activeMethod = paymentMethodId && activeAccountId
      ? await retrieveStripePaymentMethod(paymentMethodId, { tenantId: center.organization.tenantId, connectedAccountId: activeAccountId })
      : null;
    rows.push({
      familyId: family.id,
      family: family.name,
      sourceSystem: family.sourceSystem,
      externalId: family.externalId,
      children: family.children,
      guardians: family.guardians.map((guardian) => ({ name: guardian.fullName, email: normalizeEmail(guardian.email), userId: guardian.userId })),
      balanceCents: account?.balanceCents ?? null,
      billingAccountId: account?.id ?? null,
      consentStatus: summary.autopayStatus,
      hasSavedPaymentMethod: summary.hasSavedPaymentMethod,
      savedPaymentMethodType: summary.paymentMethodType,
      activeAccount: maskStripeAccountId(activeAccountId),
      savedMethodAccount: maskStripeAccountId(savedAccountId),
      needsReauthorization,
      sourceMethodFound: sourceMethod?.ok ?? null,
      activeAccountMethodFound: activeMethod?.ok ?? null,
      augustInvoices: account?.invoices.map((invoice) => ({ ...invoice, dueDate: dateKey(invoice.dueDate) })) ?? [],
      augustPayments: account?.payments.map((payment) => ({
        amountCents: payment.amountCents,
        status: payment.status,
        provider: payment.provider,
        paidAt: payment.paidAt?.toISOString() ?? null,
        externalId: maskId(payment.externalIdPlaceholder),
      })) ?? [],
    });
  }
  return { center: center.name, stripeConfigured, rows };
}

async function auditCanton(authUsers: SupabaseAuthUser[]) {
  const center = await findCenter("Canton");
  const guardians = await prisma.guardian.findMany({
    where: {
      family: { centerId: center.id },
      OR: [
        { fullName: { contains: "Nicole Jones", mode: "insensitive" } },
        { email: { contains: "nicole", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      customFields: true,
      family: { select: { id: true, name: true, centerId: true } },
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          mustResetPassword: true,
          sessionVersion: true,
          customFields: true,
          accessGrants: { where: { centerId: center.id }, select: { id: true, role: true, scopeType: true, isActive: true, startsAt: true, endsAt: true } },
        },
      },
    },
  });
  const candidateEmails = new Set(guardians.flatMap((guardian) => [normalizeEmail(guardian.email), normalizeEmail(guardian.user?.email)]).filter(Boolean));
  const matchingAuth = authUsers.filter((authUser) => authUser.email && candidateEmails.has(normalizeEmail(authUser.email)));
  const deliveries = await prisma.integrationDelivery.findMany({
    where: {
      centerId: center.id,
      recipient: { in: [...candidateEmails], mode: "insensitive" },
      createdAt: { gte: new Date("2026-08-01T00:00:00Z") },
    },
    orderBy: { createdAt: "desc" },
    select: { purpose: true, status: true, attempts: true, createdAt: true, deliveredAt: true, lastError: true },
  });
  return {
    center: center.name,
    guardianRows: guardians.map((guardian) => ({
      guardianId: guardian.id,
      fullName: guardian.fullName,
      guardianEmail: normalizeEmail(guardian.email),
      family: guardian.family.name,
      guardianPortalFields: record(guardian.customFields),
      appUser: guardian.user ? {
        id: guardian.user.id,
        email: normalizeEmail(guardian.user.email),
        role: guardian.user.role,
        active: guardian.user.isActive,
        mustResetPassword: guardian.user.mustResetPassword,
        sessionVersion: guardian.user.sessionVersion,
        customFields: record(guardian.user.customFields),
        grants: guardian.user.accessGrants,
      } : null,
    })),
    authRows: matchingAuth.map((authUser) => ({
      id: authUser.id,
      email: normalizeEmail(authUser.email),
      confirmedAt: authUser.email_confirmed_at ?? null,
      lastSignInAt: authUser.last_sign_in_at ?? null,
      updatedAt: authUser.updated_at ?? null,
      appUserId: clean(authUser.app_metadata?.bee_suite_app_user_id) || null,
      providers: authUser.identities?.map((identity) => identity.provider) ?? [],
    })),
    duplicateAuthEmails: [...candidateEmails].map((email) => ({ email, count: authUsers.filter((user) => normalizeEmail(user.email) === email).length })),
    deliveries,
  };
}

async function auditGarlandTimeClock() {
  const center = await findCenter("Garland");
  const timeZone = readCenterLocationTimeZone(center);
  const staff = await prisma.staffProfile.findMany({
    where: { centerId: center.id },
    select: { id: true, customFields: true, user: { select: { name: true, isActive: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const recentEvents = staff.flatMap((profile) => readStaffClockState(profile.customFields).events
    .filter((event) => new Date(event.occurredAt) >= new Date("2026-08-24T00:00:00Z"))
    .map((event) => ({
      staff: profile.user.name,
      active: profile.user.isActive,
      action: event.action,
      storedIso: event.occurredAt,
      storedTimeZone: event.timeZone ?? null,
      renderedGarland: localTime(event.occurredAt, timeZone),
      renderedEastern: localTime(event.occurredAt, "America/New_York"),
    })));
  const audits = await prisma.auditLog.findMany({
    where: { centerId: center.id, action: { contains: "clock", mode: "insensitive" }, createdAt: { gte: new Date("2026-08-24T00:00:00Z") } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { action: true, resourceId: true, createdAt: true, metadata: true },
  });
  return { center: center.name, configuredTimeZone: center.timezone, effectiveTimeZone: timeZone, recentEvents, audits };
}

async function auditHollyHill() {
  const center = await findCenter("Holly Hill");
  const josiel = await prisma.child.findMany({
    where: { family: { centerId: center.id }, fullName: { contains: "Josiel Rowe", mode: "insensitive" } },
    select: {
      id: true,
      fullName: true,
      enrollmentStatus: true,
      startDate: true,
      classroomId: true,
      classroom: { select: { id: true, name: true, centerId: true } },
      family: { select: { id: true, name: true, centerId: true } },
    },
  });
  const reportEligibleJosiel = await prisma.child.findMany({
    where: {
      ...currentlyEnrolledChildWhere(),
      fullName: { contains: "Josiel Rowe", mode: "insensitive" },
      family: { is: { centerId: center.id } },
      classroom: { is: { centerId: center.id } },
      OR: [{ startDate: null }, { startDate: { lte: new Date("2026-08-26T23:59:59Z") } }],
    },
    select: { id: true, fullName: true },
  });
  const payrollFamilies = await prisma.family.findMany({
    where: {
      centerId: center.id,
      OR: [
        { guardians: { some: { fullName: { contains: "Danielle Johnson", mode: "insensitive" } } } },
        { guardians: { some: { fullName: { contains: "Kimberly Hedges", mode: "insensitive" } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      guardians: { select: { fullName: true } },
      billingAccount: { select: { id: true, balanceCents: true, payments: { where: { provider: "payroll_deduction" }, select: { id: true, amountCents: true, status: true, paidAt: true } } } },
    },
  });
  const allFamilies = await prisma.family.findMany({
    where: { centerId: center.id },
    select: {
      id: true,
      name: true,
      guardians: { select: { fullName: true } },
      billingAccount: {
        select: {
          id: true,
          invoices: { where: { dueDate: { gte: new Date("2026-08-01T00:00:00Z"), lte: new Date("2026-08-31T23:59:59Z") } }, select: { id: true, number: true, dueDate: true, totalCents: true, status: true } },
          payments: { where: { provider: { in: ["cash", "manual_cash", "offline", "payroll_deduction"] } }, select: { id: true, amountCents: true, status: true, paidAt: true, provider: true, customFields: true } },
          ledgerEntries: { where: { type: { in: ["payment", "offline_payment", "payroll_deduction"] } }, select: { id: true, invoiceId: true, paymentId: true, amountCents: true, effectiveAt: true, sourceSystem: true, externalId: true } },
        },
      },
    },
  });
  const cashRows = HOLLY_CASH_REFERENCES.map(([reference, dates]) => {
    const matches = allFamilies.filter((family) => {
      const searchable = `${family.name} ${family.guardians.map((guardian) => guardian.fullName).join(" ")}`.toLowerCase();
      return searchable.includes(reference.toLowerCase());
    });
    return {
      reference,
      requestedDates: dates,
      matches: matches.map((family) => ({
        familyId: family.id,
        familyName: family.name,
        invoices: family.billingAccount?.invoices
          .filter((invoice) => (dates as readonly string[]).includes(dateKey(invoice.dueDate)))
          .map((invoice) => ({ ...invoice, dueDate: dateKey(invoice.dueDate) })) ?? [],
        offlinePayments: family.billingAccount?.payments.map((payment) => ({
          id: payment.id,
          amountCents: payment.amountCents,
          status: payment.status,
          paidAt: payment.paidAt?.toISOString() ?? null,
          provider: payment.provider,
        })) ?? [],
        paymentLedger: family.billingAccount?.ledgerEntries ?? [],
      })),
    };
  });
  const programs = await prisma.agencyProgram.findMany({
    where: { centerId: center.id },
    select: { id: true, name: true, programName: true, stateCode: true, providerNumber: true, vendorNumber: true, status: true, _count: { select: { authorizations: true, claims: true } } },
  });
  return { center: center.name, josiel, reportEligibleJosiel, payrollFamilies, cashRows, agencyPrograms: programs };
}

async function auditCordera() {
  const center = await findCenter("Cordera");
  const statusCounts = await prisma.invoice.groupBy({
    by: ["status"],
    where: { billingAccount: { family: { centerId: center.id } } },
    _count: { _all: true },
    _sum: { totalCents: true },
  });
  const directorUsers = await prisma.user.findMany({
    where: {
      role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN, UserRole.REGIONAL_MANAGER, UserRole.BRAND_ADMIN, UserRole.PLATFORM_OWNER] },
      OR: [
        { accessGrants: { some: { centerId: center.id, isActive: true } } },
        { staffProfile: { centerId: center.id } },
      ],
    },
    select: { id: true, email: true, role: true, isActive: true, accessGrants: { where: { centerId: center.id }, select: { role: true, scopeType: true, isActive: true, startsAt: true, endsAt: true } } },
  });
  const paidSamples = await prisma.invoice.findMany({
    where: { billingAccount: { family: { centerId: center.id } }, status: PaymentStatus.PAID },
    orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    take: 5,
    select: { number: true, status: true, dueDate: true, totalCents: true, billingAccount: { select: { family: { select: { name: true } } } } },
  });
  return { center: center.name, statusCounts, directorUsers, paidSamples };
}

async function main() {
  const authUsers = await listAllSupabaseUsers();
  const centennial = await auditCentennial();
  const canton = await auditCanton(authUsers);
  const garlandTimeClock = await auditGarlandTimeClock();
  const hollyHill = await auditHollyHill();
  const cordera = await auditCordera();
  console.log(JSON.stringify({
    mode: "read_only",
    asOf: new Date().toISOString(),
    authUsersInspected: authUsers.length,
    centennial,
    canton,
    garlandTimeClock,
    hollyHill,
    cordera,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
