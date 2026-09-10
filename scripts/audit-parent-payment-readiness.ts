import "./load-env";
import { createHash } from "node:crypto";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import {
  AGENCY_LEDGER_ENTRY_TYPES,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  parentVisibleBillingBalanceCents,
} from "@/lib/parent-billing-visibility";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { parentPortalAccessDisabled } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { getSupabaseAuthConfig, isSupabaseAuthCompatibleEmail } from "@/lib/supabase-auth";

const INCLUDE_EXACT_TARGETS = process.argv.includes("--include-exact-targets");

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function activeAuthUser(user: SupabaseUser) {
  return Boolean(
    user.email_confirmed_at
    && (!user.banned_until || new Date(user.banned_until) <= new Date()),
  );
}

async function loadSupabaseAuthEmails() {
  const { url, key } = getSupabaseAuthConfig("service");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const allAuthEmails = new Set<string>();
  const activeAuthEmails = new Set<string>();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const email = normalizedEmail(user.email);
      if (!email) continue;
      allAuthEmails.add(email);
      if (activeAuthUser(user)) activeAuthEmails.add(email);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return { allAuthEmails, activeAuthEmails };
}

async function main() {
  const centers = await prisma.center.findMany({
    where: { status: "active" },
    select: { id: true, name: true, customFields: true, organization: { select: { tenantId: true } } },
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
  const paymentCenterTenantById = new Map(paymentCenters.map((center) => [center.id, center.organization.tenantId]));

  const families = await prisma.family.findMany({
    where: {
      centerId: { in: paymentCenterIds },
      children: { some: currentlyEnrolledChildWhere() },
    },
    select: {
      id: true,
      name: true,
      centerId: true,
      sourceSystem: true,
      externalId: true,
      guardians: {
        select: {
          id: true,
          fullName: true,
          isBillingContact: true,
          email: true,
          phone: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
          user: { select: { id: true, email: true, tenantId: true, role: true, isActive: true } },
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
          invoices: {
            select: { id: true, status: true, totalCents: true, dueDate: true, sourceSystem: true },
            orderBy: [{ dueDate: "desc" }, { id: "desc" }],
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const accountIds = families.flatMap((family) => family.billingAccount?.id ? [family.billingAccount.id] : []);
  const ledgerEntriesWithBalances = await prisma.ledgerEntry.findMany({
    where: { billingAccountId: { in: accountIds }, balanceAfterCents: { not: null } },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, billingAccountId: true, balanceAfterCents: true, amountCents: true, effectiveAt: true, createdAt: true, type: true, sourceSystem: true },
  });
  const latestLedgerBalanceByAccountId = new Map<string, number>();
  const ledgerEntriesByAccountId = new Map<string, typeof ledgerEntriesWithBalances>();
  for (const entry of ledgerEntriesWithBalances) {
    const accountEntries = ledgerEntriesByAccountId.get(entry.billingAccountId) ?? [];
    accountEntries.push(entry);
    ledgerEntriesByAccountId.set(entry.billingAccountId, accountEntries);
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
  const { allAuthEmails, activeAuthEmails } = await loadSupabaseAuthEmails();

  const byCenter = new Map<string, {
    school: string;
    currentFamilies: number;
    familiesWithoutActiveParentLink: number;
    missingBillingAccounts: number;
    positiveParentBalances: number;
    positiveBalancesWithoutActiveParentLink: number;
    positiveBalancesWithoutOpenInvoice: number;
    balanceOnlyAccountsNeedingEvidenceReview: number;
    orderedLedgerBalanceMismatches: number;
    latestCreatedLedgerBalanceMismatches: number;
  }>();
  let missingBillingAccounts = 0;
  let currentFamiliesWithoutActiveParentLink = 0;
  let positiveParentBalances = 0;
  let positiveBalancesWithoutActiveParentLink = 0;
  let positiveBalancesWithoutOpenInvoice = 0;
  let orderedLedgerBalanceMismatches = 0;
  let latestCreatedLedgerBalanceMismatches = 0;
  const positiveBalanceAccessExceptionProfiles: Array<Record<string, unknown>> = [];
  const exactPositiveBalanceAccessTargets: Array<Record<string, unknown>> = [];
  const exactPositiveBalanceAccessIdentityFingerprintTargets: Array<Record<string, unknown>> = [];
  const exactPositiveBalancesWithoutOpenInvoice: Array<Record<string, unknown>> = [];

  for (const family of families) {
    const centerId = family.centerId!;
    const center = byCenter.get(centerId) ?? {
      school: paymentCenterNameById.get(centerId) ?? centerId,
      currentFamilies: 0,
      familiesWithoutActiveParentLink: 0,
      missingBillingAccounts: 0,
      positiveParentBalances: 0,
      positiveBalancesWithoutActiveParentLink: 0,
      positiveBalancesWithoutOpenInvoice: 0,
      balanceOnlyAccountsNeedingEvidenceReview: 0,
      orderedLedgerBalanceMismatches: 0,
      latestCreatedLedgerBalanceMismatches: 0,
    };
    center.currentFamilies += 1;
    const hasActiveParentLink = family.guardians.some((guardian) => (
      guardian.user?.role === UserRole.PARENT_GUARDIAN
      && guardian.user.isActive
      && !parentPortalAccessDisabled(guardian.customFields)
      && guardian.user.tenantId === paymentCenterTenantById.get(centerId)
      && normalizedEmail(guardian.user.email) === normalizedEmail(guardian.email)
      && guardian.user.email === normalizedEmail(guardian.user.email)
      && activeAuthEmails.has(normalizedEmail(guardian.user.email))
    ));
    const diagnoseGuardianAccess = (guardians: typeof family.guardians) => [...new Set(guardians.flatMap((guardian) => {
      const reasons: string[] = [];
      const email = normalizedEmail(guardian.email);
      if (!isSupabaseAuthCompatibleEmail(email)) reasons.push("guardian_email_invalid");
      if (parentPortalAccessDisabled(guardian.customFields)) reasons.push("parent_portal_disabled");
      if (!guardian.user) {
        reasons.push("app_parent_user_missing");
        if (allAuthEmails.has(email)) reasons.push("auth_user_without_matching_app_parent");
        if (allAuthEmails.has(email) && !activeAuthEmails.has(email)) reasons.push("auth_user_unconfirmed_or_banned");
      }
      if (guardian.user && guardian.user.role !== UserRole.PARENT_GUARDIAN) reasons.push("linked_user_not_parent");
      if (guardian.user && !guardian.user.isActive) reasons.push("linked_user_inactive");
      if (guardian.user && guardian.user.tenantId !== paymentCenterTenantById.get(centerId)) reasons.push("linked_user_tenant_mismatch");
      if (guardian.user && normalizedEmail(guardian.user.email) !== email) reasons.push("linked_user_guardian_email_mismatch");
      if (guardian.user && guardian.user.email !== normalizedEmail(guardian.user.email)) reasons.push("linked_user_email_not_normalized");
      if (guardian.user?.role === UserRole.PARENT_GUARDIAN && guardian.user.isActive) {
        const userEmail = normalizedEmail(guardian.user.email);
        if (allAuthEmails.has(userEmail) && !activeAuthEmails.has(userEmail)) {
          reasons.push("auth_user_unconfirmed_or_banned");
        } else if (!allAuthEmails.has(userEmail)) {
          reasons.push("active_auth_user_missing");
        }
      }
      return reasons;
    }))].sort();
    const payerGuardians = family.guardians
      .filter((guardian) => guardian.isBillingContact)
      .sort((left, right) => left.id.localeCompare(right.id));
    const accessDiagnosis = diagnoseGuardianAccess(family.guardians);
    const payerAccessDiagnosis = diagnoseGuardianAccess(payerGuardians);
    const payerAccessReviews = payerGuardians.map((guardian) => {
      const diagnosis = diagnoseGuardianAccess([guardian]);
      const proposedDisposition = diagnosis.includes("parent_portal_disabled")
        ? "hold_for_explicit_access_reactivation_approval"
        : diagnosis.includes("auth_user_unconfirmed_or_banned")
          || diagnosis.includes("auth_user_without_matching_app_parent")
          ? "hold_for_auth_identity_collision_review"
        : diagnosis.some((reason) => [
            "active_auth_user_missing",
            "linked_user_inactive",
            "linked_user_not_parent",
            "linked_user_tenant_mismatch",
            "linked_user_guardian_email_mismatch",
            "linked_user_email_not_normalized",
          ].includes(reason))
          ? "hold_for_app_identity_review"
        : family.sourceSystem !== "procare" || !family.externalId?.trim()
          ? "hold_for_school_relationship_confirmation"
          : diagnosis.includes("guardian_email_invalid")
            || (guardian.phone?.replace(/\D/g, "").length ?? 0) < 4
            ? "hold_for_contact_data_correction"
            : "review_procare_source_package_and_child_provenance";
      return {
        guardianId: guardian.id,
        guardianName: guardian.fullName,
        diagnosis,
        proposedDisposition,
      };
    });
    const payerDispositions = [...new Set(payerAccessReviews.map((review) => review.proposedDisposition))];
    const proposedDisposition = payerDispositions.length === 0
      ? "hold_for_school_relationship_confirmation"
      : payerDispositions.length === 1
        ? payerDispositions[0]
        : "review_payer_specific_dispositions";
    if (!hasActiveParentLink) {
      currentFamiliesWithoutActiveParentLink += 1;
      center.familiesWithoutActiveParentLink += 1;
    }
    const account = family.billingAccount;
    if (!account) {
      missingBillingAccounts += 1;
      center.missingBillingAccounts += 1;
      byCenter.set(centerId, center);
      continue;
    }

    const latestLedgerBalance = latestLedgerBalanceByAccountId.get(account.id);
    const hasOrderedLedgerBalanceMismatch = latestLedgerBalance != null && latestLedgerBalance !== account.balanceCents;
    if (hasOrderedLedgerBalanceMismatch) {
      orderedLedgerBalanceMismatches += 1;
      center.orderedLedgerBalanceMismatches += 1;
    }
    const latestCreatedLedgerBalance = latestCreatedLedgerBalanceByAccountId.get(account.id);
    const hasLatestCreatedLedgerBalanceMismatch = latestCreatedLedgerBalance != null
      && latestCreatedLedgerBalance !== account.balanceCents;
    if (hasLatestCreatedLedgerBalanceMismatch) {
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
            && (
              guardian.user.tenantId !== paymentCenterTenantById.get(centerId)
              || !activeAuthEmails.has(normalizedEmail(guardian.user.email))
            )
          )).length,
          accessDiagnosis,
        });
        exactPositiveBalanceAccessIdentityFingerprintTargets.push({
          familyId: family.id,
          guardians: [...family.guardians]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((guardian) => ({
              guardianId: guardian.id,
              normalizedEmail: normalizedEmail(guardian.email),
              linkedUserId: guardian.user?.id ?? null,
              linkedUserEmail: normalizedEmail(guardian.user?.email),
            })),
        });
        exactPositiveBalanceAccessTargets.push({
          school: center.school,
          familyId: family.id,
          familyName: family.name,
          billingAccountId: account.id,
          parentBalanceCents,
          familySourceSystem: family.sourceSystem,
          familyExternalIdPresent: Boolean(family.externalId?.trim()),
          guardians: [...family.guardians]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((guardian) => ({
            guardianId: guardian.id,
            guardianName: guardian.fullName,
            billingContact: guardian.isBillingContact,
            guardianSourceSystem: guardian.sourceSystem,
            guardianExternalIdPresent: Boolean(guardian.externalId?.trim()),
            emailPresent: Boolean(guardian.email?.trim()),
            phoneReady: (guardian.phone?.replace(/\D/g, "").length ?? 0) >= 4,
            linkedUserId: guardian.user ? "present" : null,
            })),
          accessDiagnosis,
          payerAccessDiagnosis,
          payerAccessReviews,
          proposedDisposition,
        });
      }
      const openInvoices = account.invoices.filter((invoice) => invoice.status === "OPEN");
      if (openInvoices.length === 0) {
        positiveBalancesWithoutOpenInvoice += 1;
        center.positiveBalancesWithoutOpenInvoice += 1;
        const invoiceStatusCounts = Object.fromEntries([...new Set(account.invoices.map((invoice) => invoice.status))]
          .sort()
          .map((status) => [status, account.invoices.filter((invoice) => invoice.status === status).length]));
        const accountLedger = ledgerEntriesByAccountId.get(account.id) ?? [];
        const recentLedger = accountLedger
          .slice(0, 3)
          .map((entry) => ({ type: entry.type, sourceSystem: entry.sourceSystem, effectiveAt: entry.effectiveAt.toISOString() }));
        const chronologicalLedger = [...accountLedger].reverse();
        const lastSettledIndex = chronologicalLedger.findLastIndex((entry) => (entry.balanceAfterCents ?? 0) <= 0);
        const balanceEvidenceWindow = chronologicalLedger.slice(lastSettledIndex + 1);
        const positiveBalanceEvidence = balanceEvidenceWindow.filter((entry) => entry.amountCents > 0);
        const unsupportedPositiveBalanceEvidence = positiveBalanceEvidence.filter((entry) => !(
          entry.sourceSystem === "procare"
          && entry.type === "procare_balance_reconciliation"
        ));
        const hasPositiveManualEntry = unsupportedPositiveBalanceEvidence.some((entry) => (
          entry.sourceSystem === "bee_suite_manual" && entry.amountCents > 0
        ));
        const hasPositiveProcareOpeningBalance = positiveBalanceEvidence.some((entry) => (
          entry.sourceSystem === "procare"
          && entry.type === "procare_balance_reconciliation"
          && entry.amountCents > 0
        ));
        const evidenceReviewReason = hasOrderedLedgerBalanceMismatch || hasLatestCreatedLedgerBalanceMismatch
          ? "ledger_balance_mismatch"
          : balanceEvidenceWindow.length === 0 || positiveBalanceEvidence.length === 0
            ? "missing_balance_ledger_history"
          : hasPositiveManualEntry
            ? "positive_manual_ledger_entry"
            : !hasPositiveProcareOpeningBalance || unsupportedPositiveBalanceEvidence.length > 0
              ? "unsupported_positive_balance_provenance"
              : null;
        const needsEvidenceReview = evidenceReviewReason != null;
        if (needsEvidenceReview) center.balanceOnlyAccountsNeedingEvidenceReview += 1;
        exactPositiveBalancesWithoutOpenInvoice.push({
          school: center.school,
          familyId: family.id,
          familyName: family.name,
          billingAccountId: account.id,
          parentBalanceCents,
          invoiceStatusCounts,
          mostRecentInvoice: account.invoices[0]
            ? {
                status: account.invoices[0].status,
                totalCents: account.invoices[0].totalCents,
                dueDate: account.invoices[0].dueDate.toISOString(),
                sourceSystem: account.invoices[0].sourceSystem,
              }
            : null,
          recentLedger,
          balanceEvidenceWindowEntries: balanceEvidenceWindow.length,
          unsupportedPositiveBalanceEvidence: unsupportedPositiveBalanceEvidence.map((entry) => ({
            type: entry.type,
            sourceSystem: entry.sourceSystem,
            amountCents: entry.amountCents,
            effectiveAt: entry.effectiveAt.toISOString(),
          })),
          needsEvidenceReview,
          evidenceReviewReason,
          classification: evidenceReviewReason === "positive_manual_ledger_entry"
            ? "manual_account_adjustment_needs_evidence_review"
            : needsEvidenceReview
              ? "balance_without_supported_provenance_needs_evidence_review"
              : "supported_account_balance_without_invoice",
          proposedDisposition: needsEvidenceReview
            ? "review_manual_adjustment_evidence_without_changing_balance"
            : "preserve_balance_and_allow_family_balance_checkout",
        });
      }
    }
    byCenter.set(centerId, center);
  }

  const exactTargetFingerprint = createHash("sha256").update(JSON.stringify({
    access: exactPositiveBalanceAccessTargets,
    accessIdentities: exactPositiveBalanceAccessIdentityFingerprintTargets,
    noOpenInvoice: exactPositiveBalancesWithoutOpenInvoice,
  })).digest("hex");
  const positiveBalancesWithoutOpenInvoiceNeedingEvidenceReview = exactPositiveBalancesWithoutOpenInvoice
    .filter((target) => target.needsEvidenceReview === true).length;

  console.log(JSON.stringify({
    paymentEnabledSchools: paymentCenters.length,
    currentFamiliesAtPaymentEnabledSchools: families.length,
    currentFamiliesWithBillingAccounts: families.length - missingBillingAccounts,
    currentFamiliesWithoutBillingAccounts: missingBillingAccounts,
    currentFamiliesWithActiveParentLink: families.length - currentFamiliesWithoutActiveParentLink,
    currentFamiliesWithoutActiveParentLink,
    positiveParentBalances,
    positiveBalancesWithActiveParentLink: positiveParentBalances - positiveBalancesWithoutActiveParentLink,
    positiveBalancesWithoutActiveParentLink,
    positiveBalancesWithoutOpenInvoice,
    supportedPositiveBalancesWithoutOpenInvoice:
      positiveBalancesWithoutOpenInvoice - positiveBalancesWithoutOpenInvoiceNeedingEvidenceReview,
    positiveBalancesWithoutOpenInvoiceNeedingEvidenceReview,
    orderedLedgerBalanceMismatches,
    latestCreatedLedgerBalanceMismatches,
    exactTargetFingerprint,
    positiveBalanceAccessExceptionProfiles,
    ...(INCLUDE_EXACT_TARGETS ? {
      exactPositiveBalanceAccessTargets,
      exactPositiveBalancesWithoutOpenInvoice,
    } : {}),
    schoolExceptions: [...byCenter.values()].filter((center) => (
      center.missingBillingAccounts > 0
      || center.familiesWithoutActiveParentLink > 0
      || center.positiveBalancesWithoutActiveParentLink > 0
      || center.balanceOnlyAccountsNeedingEvidenceReview > 0
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
