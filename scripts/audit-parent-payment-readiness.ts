import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import {
  AGENCY_LEDGER_ENTRY_TYPES,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  parentVisibleBillingBalanceCents,
} from "@/lib/parent-billing-visibility";
import { prisma } from "@/lib/prisma";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { getSupabaseAuthConfig } from "@/lib/supabase-auth";

const CURRENT_ENROLLMENT_STATUSES = ["enrolled", "active", "current"];

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

async function loadSupabaseAuthEmails() {
  const { url, key } = getSupabaseAuthConfig("service");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const emails = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const email = normalizedEmail(user.email);
      if (email) emails.add(email);
    }
    if (data.users.length < 1000) break;
  }
  return emails;
}

async function main() {
  const centers = await prisma.center.findMany({
    where: { status: "active" },
    select: { id: true, name: true, customFields: true },
    orderBy: { name: "asc" },
  });
  const paymentCenters = centers.filter((center) => {
    const fields = jsonObject(center.customFields);
    return fields.livePaymentsEnabled === true
      && fields.tuitionBillingEnabled === true
      && stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name }).approved;
  });
  const paymentCenterIds = paymentCenters.map((center) => center.id);
  const paymentCenterNameById = new Map(paymentCenters.map((center) => [center.id, center.name]));

  const families = await prisma.family.findMany({
    where: {
      centerId: { in: paymentCenterIds },
      children: { some: { enrollmentStatus: { in: CURRENT_ENROLLMENT_STATUSES, mode: "insensitive" } } },
    },
    select: {
      id: true,
      centerId: true,
      sourceSystem: true,
      guardians: {
        select: {
          isBillingContact: true,
          email: true,
          phone: true,
          sourceSystem: true,
          externalId: true,
          user: { select: { email: true, role: true, isActive: true } },
        },
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          ledgerEntries: {
            where: {
              OR: [
                { type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } },
                { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM },
              ],
            },
            select: { type: true, sourceSystem: true, amountCents: true },
          },
          invoices: { where: { status: "OPEN" }, select: { id: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const accountIds = families.flatMap((family) => family.billingAccount?.id ? [family.billingAccount.id] : []);
  const ledgerEntriesWithBalances = await prisma.ledgerEntry.findMany({
    where: { billingAccountId: { in: accountIds }, balanceAfterCents: { not: null } },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, billingAccountId: true, balanceAfterCents: true, effectiveAt: true, createdAt: true },
  });
  const latestLedgerBalanceByAccountId = new Map<string, number>();
  for (const entry of ledgerEntriesWithBalances) {
    if (entry.balanceAfterCents != null && !latestLedgerBalanceByAccountId.has(entry.billingAccountId)) {
      latestLedgerBalanceByAccountId.set(entry.billingAccountId, entry.balanceAfterCents);
    }
  }
  const latestCreatedLedgerBalanceByAccountId = new Map<string, number>();
  for (const entry of [...ledgerEntriesWithBalances].sort((left, right) => (
    right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
  ))) {
    if (entry.balanceAfterCents != null && !latestCreatedLedgerBalanceByAccountId.has(entry.billingAccountId)) {
      latestCreatedLedgerBalanceByAccountId.set(entry.billingAccountId, entry.balanceAfterCents);
    }
  }
  const supabaseAuthEmails = await loadSupabaseAuthEmails();

  const byCenter = new Map<string, {
    school: string;
    currentFamilies: number;
    missingBillingAccounts: number;
    positiveParentBalances: number;
    positiveBalancesWithoutActiveParentLink: number;
    positiveBalancesWithoutOpenInvoice: number;
    orderedLedgerBalanceMismatches: number;
    latestCreatedLedgerBalanceMismatches: number;
  }>();
  let missingBillingAccounts = 0;
  let positiveParentBalances = 0;
  let positiveBalancesWithoutActiveParentLink = 0;
  let positiveBalancesWithoutOpenInvoice = 0;
  let orderedLedgerBalanceMismatches = 0;
  let latestCreatedLedgerBalanceMismatches = 0;
  const positiveBalanceAccessExceptionProfiles: Array<Record<string, unknown>> = [];

  for (const family of families) {
    const centerId = family.centerId!;
    const center = byCenter.get(centerId) ?? {
      school: paymentCenterNameById.get(centerId) ?? centerId,
      currentFamilies: 0,
      missingBillingAccounts: 0,
      positiveParentBalances: 0,
      positiveBalancesWithoutActiveParentLink: 0,
      positiveBalancesWithoutOpenInvoice: 0,
      orderedLedgerBalanceMismatches: 0,
      latestCreatedLedgerBalanceMismatches: 0,
    };
    center.currentFamilies += 1;
    const account = family.billingAccount;
    if (!account) {
      missingBillingAccounts += 1;
      center.missingBillingAccounts += 1;
      byCenter.set(centerId, center);
      continue;
    }

    const latestLedgerBalance = latestLedgerBalanceByAccountId.get(account.id);
    if (latestLedgerBalance != null && latestLedgerBalance !== account.balanceCents) {
      orderedLedgerBalanceMismatches += 1;
      center.orderedLedgerBalanceMismatches += 1;
    }
    const latestCreatedLedgerBalance = latestCreatedLedgerBalanceByAccountId.get(account.id);
    if (latestCreatedLedgerBalance != null && latestCreatedLedgerBalance !== account.balanceCents) {
      latestCreatedLedgerBalanceMismatches += 1;
      center.latestCreatedLedgerBalanceMismatches += 1;
    }
    const parentBalanceCents = parentVisibleBillingBalanceCents({
      accountBalanceCents: account.balanceCents,
      agencyLedgerEntries: account.ledgerEntries,
    });
    if (parentBalanceCents > 0) {
      positiveParentBalances += 1;
      center.positiveParentBalances += 1;
      const hasActiveParentLink = family.guardians.some((guardian) => (
        guardian.user?.role === UserRole.PARENT_GUARDIAN
        && guardian.user.isActive
        && supabaseAuthEmails.has(normalizedEmail(guardian.user.email))
      ));
      if (!hasActiveParentLink) {
        positiveBalancesWithoutActiveParentLink += 1;
        center.positiveBalancesWithoutActiveParentLink += 1;
        positiveBalanceAccessExceptionProfiles.push({
          school: center.school,
          familySourceSystem: family.sourceSystem,
          guardians: family.guardians.length,
          billingContacts: family.guardians.filter((guardian) => guardian.isBillingContact).length,
          billingContactsWithEmail: family.guardians.filter((guardian) => guardian.isBillingContact && guardian.email?.trim()).length,
          billingContactsWithPhone: family.guardians.filter((guardian) => guardian.isBillingContact && (guardian.phone?.replace(/\D/g, "").length ?? 0) >= 4).length,
          guardianSourceSystems: [...new Set(family.guardians.map((guardian) => guardian.sourceSystem ?? "none"))].sort(),
          guardiansWithExternalId: family.guardians.filter((guardian) => guardian.externalId?.trim()).length,
          linkedGuardians: family.guardians.filter((guardian) => guardian.user).length,
          inactiveParentLinks: family.guardians.filter((guardian) => guardian.user?.role === UserRole.PARENT_GUARDIAN && !guardian.user.isActive).length,
          nonParentLinks: family.guardians.filter((guardian) => guardian.user && guardian.user.role !== UserRole.PARENT_GUARDIAN).length,
          activeParentLinksMissingAuth: family.guardians.filter((guardian) => (
            guardian.user?.role === UserRole.PARENT_GUARDIAN
            && guardian.user.isActive
            && !supabaseAuthEmails.has(normalizedEmail(guardian.user.email))
          )).length,
        });
      }
      if (account.invoices.length === 0) {
        positiveBalancesWithoutOpenInvoice += 1;
        center.positiveBalancesWithoutOpenInvoice += 1;
      }
    }
    byCenter.set(centerId, center);
  }

  console.log(JSON.stringify({
    paymentEnabledSchools: paymentCenters.length,
    currentFamiliesAtPaymentEnabledSchools: families.length,
    currentFamiliesWithBillingAccounts: families.length - missingBillingAccounts,
    currentFamiliesWithoutBillingAccounts: missingBillingAccounts,
    positiveParentBalances,
    positiveBalancesWithActiveParentLink: positiveParentBalances - positiveBalancesWithoutActiveParentLink,
    positiveBalancesWithoutActiveParentLink,
    positiveBalancesWithoutOpenInvoice,
    orderedLedgerBalanceMismatches,
    latestCreatedLedgerBalanceMismatches,
    positiveBalanceAccessExceptionProfiles,
    schoolExceptions: [...byCenter.values()].filter((center) => (
      center.missingBillingAccounts > 0
      || center.positiveBalancesWithoutActiveParentLink > 0
      || center.positiveBalancesWithoutOpenInvoice > 0
      || center.orderedLedgerBalanceMismatches > 0
      || center.latestCreatedLedgerBalanceMismatches > 0
    )),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
