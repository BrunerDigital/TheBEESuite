import type { SchoolAccountBalance, SchoolAccountBalanceStatus } from "./accounts-receivable";

export type BalanceFilter = "all" | "overdue" | "processing" | "follow_up" | SchoolAccountBalanceStatus;

export function filterBalanceAccounts(accounts: readonly SchoolAccountBalance[], filter: BalanceFilter, query = "") {
  const search = query.trim().toLocaleLowerCase();
  return accounts.filter((account) => {
    if (filter === "overdue" && !(account.balanceCents > 0 && account.overdueInvoiceCount > 0)) return false;
    if (filter === "processing" && account.processingPaymentCount === 0) return false;
    if (filter === "follow_up" && !(account.balanceCents > 0 && account.processingPaymentCount === 0)) return false;
    if (!["all", "overdue", "processing", "follow_up"].includes(filter) && account.status !== filter) return false;
    return !search || `${account.familyName} ${account.centerName}`.toLocaleLowerCase().includes(search);
  });
}

export function balanceViewTotals(accounts: readonly SchoolAccountBalance[]) {
  return {
    owedCents: accounts.reduce((sum, account) => sum + Math.max(account.balanceCents, 0), 0),
    creditCents: accounts.reduce((sum, account) => sum + Math.min(account.balanceCents, 0), 0),
    netCents: accounts.reduce((sum, account) => sum + account.balanceCents, 0),
    owingCount: accounts.filter((account) => account.balanceCents > 0).length,
    currentCount: accounts.filter((account) => account.balanceCents === 0).length,
    overdueCount: accounts.filter((account) => account.balanceCents > 0 && account.overdueInvoiceCount > 0).length,
  };
}

export function familyBillingActionHref(account: SchoolAccountBalance, anchor: "family-ledger" | "billing-payment-reminder" | "billing-family-overview") {
  return `/billing-invoices?familyId=${encodeURIComponent(account.familyId)}${account.centerId ? `&centerId=${encodeURIComponent(account.centerId)}` : ""}#${anchor}`;
}

export type AgencyBalanceSummary = {
  id: string;
  centerId: string;
  centerName: string;
  agencyName: string;
  outstandingCents: number;
  receivedCents: number;
  needsSubmissionCount: number;
  awaitingPaymentCount: number;
  overdueCount: number;
  ledgerBalanceCents: number | null;
  pendingReviewCount: number;
  unappliedCents: number;
};

export type AgencyBalanceFilter = "all" | "outstanding" | "overdue" | "submission" | "reconciliation";

export function filterAgencyBalances(accounts: readonly AgencyBalanceSummary[], filter: AgencyBalanceFilter, query = "") {
  const search = query.trim().toLocaleLowerCase();
  return accounts.filter((account) => {
    if (filter === "outstanding" && account.outstandingCents <= 0) return false;
    if (filter === "overdue" && account.overdueCount === 0) return false;
    if (filter === "submission" && account.needsSubmissionCount === 0) return false;
    if (filter === "reconciliation" && account.pendingReviewCount === 0 && account.unappliedCents <= 0) return false;
    return !search || `${account.agencyName} ${account.centerName}`.toLocaleLowerCase().includes(search);
  });
}
